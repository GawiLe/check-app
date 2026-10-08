// Rooktest: afbeeldingen optimaliseren bij export (optie) en de live KB-teller.
// Gebruik: npm run build && xvfb-run node scripts/smoke-optimize.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const waitFor = async (fn, tries = 60) => {
  for (let i = 0; i < tries; i++) {
    if (await fn().catch(() => false)) return true
    await page.waitForTimeout(150)
  }
  return false
}

// Twee grote afbeeldingen (1600×1600): een "foto" zonder transparantie (PNG) en een PNG mét transparantie
const pngs = await app.evaluate(({ nativeImage }) => {
  const W = 1600
  const photo = Buffer.alloc(W * W * 4)
  const alpha = Buffer.alloc(W * W * 4)
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      const n = (Math.sin(x / 37) + Math.cos(y / 23) + ((x * 7 + y * 13) % 17) / 17) * 60
      photo[i] = (x / 7 + n) & 255
      photo[i + 1] = (y / 5 + n) & 255
      photo[i + 2] = (x + y + n) & 255
      photo[i + 3] = 255
      alpha[i] = 200
      alpha[i + 1] = 40
      alpha[i + 2] = 40
      alpha[i + 3] = Math.hypot(x - 800, y - 800) < 700 ? 255 : 0
    }
  return [photo, alpha].map((b) => nativeImage.createFromBitmap(b, { width: W, height: W }).toPNG().toString('base64'))
})
await writeFile(join(dir, 'assets', 'foto.png'), Buffer.from(pngs[0], 'base64'))
await writeFile(join(dir, 'assets', 'vorm.png'), Buffer.from(pngs[1], 'base64'))

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await page.evaluate(() =>
  window.__bsStore.getState().update((p) => {
    const c = p.compositions[0]
    const base = c.layers.find((l) => l.type === 'image')
    const mk = (name, src, x, y, w, h) => ({ ...structuredClone(base), id: 'opt-' + name, linkId: 'opt-' + name, name, x, y, width: w, height: h, tracks: {}, intro: null, outro: null, image: { src, fit: 'cover' } })
    c.layers.push(mk('foto', 'assets/foto.png', 0, 0, 300, 300), mk('vorm', 'assets/vorm.png', 100, 300, 100, 100))
    p.targets = ['cm360']
  })
)

// 1. KB-teller zonder optimalisatie
const meter = page.locator('.size-meter')
const meterKb = async () => {
  const m = (await meter.innerText()).match(/([\d.]+)\s*(KB|MB)/)
  return parseFloat(m[1]) * (m[2] === 'MB' ? 1024 : 1)
}
await check('KB-teller zichtbaar op het canvas', async () => waitFor(async () => (await meter.count()) === 1 && (await meterKb()) > 0))
const before = await meterKb()
await page.screenshot({ path: `${shots}/o1-voor.png` })

// 2. Optie aanzetten in het paneel Ontwerp (niets geselecteerd = banner-instellingen)
await page.evaluate(() => window.__bsStore.getState().select([]))
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
const row = page.locator('.row', { has: page.locator('.label', { hasText: 'Afbeeldingen' }) })
await row.locator('.switch, button, input').first().click()
await check('optie staat aan in het project', async () => page.evaluate(() => window.__bsStore.getState().project.optimizeImages === true))
await check('KB-teller daalt na optimaliseren', async () => waitFor(async () => (await meterKb()) < before * 0.6))
const after = await meterKb()
console.log(`   (teller: ${before} KB → ${after} KB)`)
await page.screenshot({ path: `${shots}/o2-na.png` })

// 3. Exporteren: foto als JPG op 600×600 (2× van 300), vorm blijft PNG (transparant) op 200×200
const comp = await page.evaluate(() => window.__bsStore.getState().project.compositions[0].id)
const results = await page.evaluate(
  ([d, c]) => window.bs.exportBanners({ dir: d, project: window.__bsStore.getState().project, compositionIds: [c], targets: ['cm360'] }),
  [dir, comp]
)
const folder = results[0].folder
const files = await readdir(folder)
await check('foto.png → foto.jpg in de export', async () => files.includes('foto.jpg') && !files.includes('foto.png'))
await check('transparante PNG blijft PNG', async () => files.includes('vorm.png'))
const size = (f) =>
  app.evaluate(({ nativeImage }, p) => nativeImage.createFromPath(p).getSize(), join(folder, f))
await check('foto verkleind tot 600×600 (2× de getoonde maat)', async () => {
  const s = await size('foto.jpg')
  return s.width === 600 && s.height === 600
})
await check('vorm verkleind tot 200×200', async () => {
  const s = await size('vorm.png')
  return s.width === 200 && s.height === 200
})
await check('HTML verwijst naar foto.jpg', async () => readFile(join(folder, 'index.html'), 'utf8').then((h) => h.includes('src="foto.jpg"') || h.includes('data-src="foto.jpg"')))
await check('originelen in assets/ ongewijzigd', async () => (await stat(join(dir, 'assets', 'foto.png'))).size > 1024 * 1024 * 0.2)
await check('rapport noemt de optimalisatie', async () => results[0].issues.some((i) => i.rule === 'images' && i.message.includes('foto.png')))
await check('initial load export ≈ KB-teller', async () => Math.abs(results[0].initialLoadBytes / 1024 - after) <= Math.max(3, after * 0.05))

await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

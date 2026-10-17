// Rooktest: pen tool (open lijn afronden met dubbelklik, Esc of ander gereedschap), lijnopties
// (positie, stippellijn, uiteinden), lijn om tekst en "Lijn laten tekenen" — in preview en export.
// Gebruik: npm run build && xvfb-run node scripts/smoke-stroke.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { pickFolder, zipText } from './lib/export.mjs'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
let fails = 0
const check = async (label, fn) => {
  const ok = await fn().catch((e) => (console.log('   ', e.message.split('\n')[0]), false))
  if (!ok) fails++
  console.log(label, ok ? 'OK' : 'MISLUKT')
}
const S = (fn, a) => page.evaluate(fn, a)
const layers = () => S(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project.compositions[0].layers)))
const lines = async () => (await layers()).filter((l) => l.shape?.kind === 'path')
const byName = async (n) => (await layers()).find((l) => l.name === n)
const select = (n) => S((n) => { const s = window.__bsStore.getState(); s.select([s.project.compositions[0].layers.find((l) => l.name === n).id]) }, n)
const inPreview = async (fn, arg) => {
  for (let i = 0; i < 30; i++) {
    for (const f of page.frames().filter((x) => x.url().startsWith('bsproj://bs-preview/'))) {
      const v = await f.evaluate(fn, arg).catch(() => null)
      if (v != null) return v
    }
    await page.waitForTimeout(150)
  }
  return null
}
const typeIn = async (loc, v) => {
  await loc.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(String(v))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(100)
}

await page.waitForSelector('.welcome')
await S((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await S(() => window.__bsStore.getState().setTime(window.__bsStore.getState().project.compositions[0].duration - 0.1))

// 1. Pen: open lijn afronden op drie manieren
const v = await page.locator('.viewer').boundingBox()
const cx = v.x + v.width / 2
const cy = v.y + v.height / 2
const penLine = async (finish) => {
  await page.keyboard.press('KeyG')
  await page.mouse.click(cx - 60, cy - 40)
  await page.mouse.click(cx + 10, cy)
  if (finish === 'dblclick') await page.mouse.dblclick(cx + 60, cy - 40)
  else await page.mouse.click(cx + 60, cy - 40)
  if (finish === 'Escape') await page.keyboard.press('Escape')
  if (finish === 'tool') await page.keyboard.press('KeyQ')
  await page.waitForTimeout(250)
}
await penLine('dblclick')
await check('dubbelklik rondt een open lijn af (3 punten, geen dubbel punt)', async () => {
  const l = await lines()
  return l.length === 1 && !l[0].shape.path.closed && (l[0].shape.path.d.match(/[LC]/g) ?? []).length === 2 && l[0].shape.strokeWidth > 0
})
await penLine('Escape')
await check('Esc rondt een open lijn af (ook als je op de grepen van de vorige lijn klikt)', async () => (await lines()).length === 2)
await penLine('tool')
await check('ander gereedschap kiezen rondt de lijn af (en kiest dat gereedschap)', async () => (await lines()).length === 3 && (await S(() => window.__bsStore.getState().tool)) === 'rect')
await page.keyboard.press('KeyV')

// 2. Lijnopties op de CTA (rechthoek): buiten, stippellijn
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
await select('CTA')
await page.waitForTimeout(250)
const row = (label) => page.locator('.panel-scroll .row', { has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) })
await row('Lijn').first().locator('.switch').click()
await page.locator('.stroke-align button', { hasText: 'Buiten' }).click()
await row('Stippel').locator('.switch').click()
await check('rechthoek: lijn buiten met stippellijn in het project', async () => {
  const s = (await byName('CTA')).shape
  return s.strokeWidth > 0 && s.strokeAlign === 'outside' && Array.isArray(s.strokeDash)
})
await check('preview: SVG-lijn buiten de vorm met stippels', async () =>
  !!(await inPreview(() => {
    const r = [...document.querySelectorAll('.L > svg > rect')].find((x) => x.getAttribute('stroke-dasharray'))
    return r && Number(r.getAttribute('x')) < 0 ? true : null
  }))
)

// 3. Lijn om tekst
await select('Headline')
await page.waitForTimeout(250)
const textLine = page.locator('.panel-scroll .section', { has: page.locator('.section-head .title', { hasText: /^Tekst$/ }) }).locator('.row', { has: page.locator('.label', { hasText: /^Lijn$/ }) })
await textLine.locator('.switch').click()
await typeIn(textLine.locator('.num input'), 2)
await check('tekst: lijn van 2 px', async () => (await byName('Headline')).text.stroke?.width === 2)
await check('preview: tekstlijn (webkit-text-stroke)', async () =>
  !!(await inPreview(() => ([...document.querySelectorAll('.L')].some((el) => getComputedStyle(el).webkitTextStrokeWidth === '4px') ? true : null)))
)

// 4. Lijn laten tekenen op de pen-lijn
const lineName = (await lines())[0].name
await S((id) => window.__bsStore.getState().select([id]), (await lines())[0].id)
await S(() => window.__bsStore.getState().setTime(0))
await page.waitForTimeout(250)
await page.getByRole('button', { name: 'Lijn laten tekenen' }).click()
await check('tekenen: revealMode draw met keyframes 0→1', async () => {
  const l = (await lines())[0]
  return l.revealMode === 'draw' && l.tracks.reveal.map((k) => k.v).join() === '0,1'
})
const offsetAt = async (t) => {
  await S((t) => window.__bsStore.getState().setTime(t), t)
  await page.waitForTimeout(350)
  return inPreview(() => {
    const p = document.querySelector('[data-d]')
    return p ? Number(getComputedStyle(p).strokeDashoffset.replace('px', '')) : null
  })
}
await check('preview: halverwege half getekend, aan het eind helemaal', async () => {
  const mid = await offsetAt(0.5)
  const end = await offsetAt(1.2)
  return Math.abs(mid - 0.5) < 0.05 && end === 0
})
await S(() => window.__bsStore.getState().setTime(0.5))
await page.waitForTimeout(400)
await page.screenshot({ path: `${shots}/s1-lijnen.png` })

// 5. Export
await pickFolder(app, `${shots}/out`)
const outDir = await S((d) => window.bs.chooseExportDir(d), dir)
const comp = await S(() => window.__bsStore.getState().project.compositions[0].id)
const [res] = await S(([d, c, o]) => window.bs.exportBanners({ dir: d, project: window.__bsStore.getState().project, compositionIds: [c], targets: ['cm360'], outDir: o }), [dir, comp, outDir])
const html = await zipText(res.zip, 'index.html')
await check('export: tekenende lijn, stippellijn en tekstlijn', async () => html.includes('pathLength="1"') && html.includes('data-d') && html.includes('stroke-dasharray="') && html.includes('-webkit-text-stroke:4px'))
await check('export: geen fouten in de validatie', async () => !res.issues.some((i) => i.level === 'error'))
console.log(`   (lijn: ${lineName})`)

console.log(fails ? `${fails} controle(s) mislukt` : 'Lijnen: alles in orde')
await S(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

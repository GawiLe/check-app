// Rooktest: verloop, masker en overvloeimodus via het paneel Ontwerp, zichtbaar in de preview en in de export.
// Gebruik: npm run build && xvfb-run node scripts/smoke-look.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const layer = (name) => page.evaluate((n) => JSON.parse(JSON.stringify(window.__bsStore.getState().project.compositions[0].layers.find((l) => l.name === n))), name)
const select = (name) =>
  page.evaluate((n) => {
    const s = window.__bsStore.getState()
    s.select([s.project.compositions[0].layers.find((l) => l.name === n).id])
  }, name)
const row = (label) => page.locator('.panel-scroll .row', { has: page.locator('.label', { hasText: new RegExp(`^${label}$`) }) })
/** Stijl van een laag in de (zichtbare) preview, gezocht op een stukje van zijn CSS. */
const previewStyle = (fn) =>
  (async () => {
    for (let i = 0; i < 30; i++) {
      for (const f of page.frames().filter((x) => x.url().startsWith('bsproj://bs-preview/'))) {
        const v = await f.evaluate(fn).catch(() => null)
        if (v) return v
      }
      await page.waitForTimeout(150)
    }
    return null
  })()

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await page.evaluate(() => window.__bsStore.getState().setTime(window.__bsStore.getState().project.compositions[0].duration - 0.1))
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()

// 1. Verloop op de CTA-knop (rechthoek)
await select('CTA')
await page.waitForTimeout(200)
await row('Verloop').locator('.switch').click()
await row('Naar').locator('input[type=color]').evaluate((el) => {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
  set.call(el, '#ffcc00')
  el.dispatchEvent(new Event('input', { bubbles: true }))
})
await check('verloop in het project', async () => (await layer('CTA')).shape.gradient?.to === '#ffcc00')
await check('verloop zichtbaar in de preview', async () =>
  !!(await previewStyle(() => [...document.querySelectorAll('.L')].some((el) => getComputedStyle(el).backgroundImage.includes('linear-gradient') && getComputedStyle(el).backgroundImage.includes('255, 204, 0'))))
)

// 2. Overvloeimodus op de headline
await select('Headline')
await page.waitForTimeout(200)
await row('Overvloeien').locator('select').selectOption('multiply')
await check('overvloeien in de preview (mix-blend-mode)', async () =>
  !!(await previewStyle(() => [...document.querySelectorAll('.L')].some((el) => getComputedStyle(el).mixBlendMode === 'multiply')))
)
await check('banner isoleert het mengen', async () => !!(await previewStyle(() => getComputedStyle(document.getElementById('ad')).isolation === 'isolate')))

// 3. Masker (ellips) op het logo
await select('logo.svg')
await page.waitForTimeout(200)
await row('Masker').getByRole('button', { name: 'Ellips' }).click()
await check('masker in het project', async () => (await layer('logo.svg')).mask?.shape === 'ellipse')
await check('masker in de preview (clip-path ellips)', async () =>
  !!(await previewStyle(() => [...document.querySelectorAll('.M')].some((el) => getComputedStyle(el).clipPath.startsWith('ellipse'))))
)
await page.waitForTimeout(400)
await page.screenshot({ path: `${shots}/l1-weergave.png` })

// 4. Export bevat alles
const comp = await page.evaluate(() => window.__bsStore.getState().project.compositions[0].id)
const [res] = await page.evaluate(([d, c]) => window.bs.exportBanners({ dir: d, project: window.__bsStore.getState().project, compositionIds: [c], targets: ['cm360'] }), [dir, comp])
const html = await readFile(join(res.folder, 'index.html'), 'utf8')
await check('export: verloop, overvloeien en masker in de HTML', async () => html.includes('linear-gradient(180deg') && html.includes('mix-blend-mode:multiply') && html.includes('clip-path:ellipse'))
await check('export: geen fouten in de validatie', async () => !res.issues.some((i) => i.level === 'error'))

await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

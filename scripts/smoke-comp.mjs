// Rooktest: scrubben stopt zodra de muisknop los is; compositie los bekijken (eigen maat, tijd vanaf 0,
// afspelen binnen de compositie); transparant bekijken; write-on richting.
// Gebruik: npm run build && xvfb-run node scripts/smoke-comp.mjs <projectmap> <screenshotmap>
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
const st = () => S(() => ({ time: window.__bsStore.getState().time, tab: window.__bsStore.getState().activeTab }))
const row = (name) => page.locator('.tl-name:not(.sub)').filter({ has: page.getByText(name, { exact: true }) }).first()
const inPreview = async (fn) => {
  for (let i = 0; i < 30; i++) {
    for (const f of page.frames().filter((x) => x.url().startsWith('bsproj://bs-preview/'))) {
      const v = await f.evaluate(fn).catch(() => null)
      if (v != null) return v
    }
    await page.waitForTimeout(150)
  }
  return null
}

await page.waitForSelector('.welcome')
await S((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. Scrubben alleen met ingedrukte muisknop
const ruler = page.locator('.timeline .ruler')
const rb = await ruler.boundingBox()
await page.mouse.move(rb.x + 60, rb.y + rb.height / 2)
await page.mouse.down()
await page.mouse.move(rb.x + 200, rb.y + rb.height / 2, { steps: 5 })
const during = (await st()).time
// Loslaten zonder dat de tijdlijn het ziet (zoals boven de preview): de volgende beweging heeft geen knop meer
await S((x) => window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: 10, buttons: 0, bubbles: true })), rb.x + 260)
await S((x) => window.dispatchEvent(new PointerEvent('pointermove', { clientX: x, clientY: 10, buttons: 1, bubbles: true })), rb.x + 400)
await page.waitForTimeout(100)
await check('scrubben stopt zodra de muisknop los is (blijft niet vastzitten)', async () => during > 0.5 && Math.abs((await st()).time - during) < 1e-6)
await page.mouse.up()

// 2. Compositie los bekijken: CTA tekst + CTA groeperen, compositie op 2 s laten beginnen
await row('CTA tekst').click()
await row('CTA').click({ modifiers: ['Shift'] })
await page.getByRole('button', { name: 'Nieuwe compositie' }).click()
await page.waitForTimeout(200)
const group = await S(() => {
  const s = window.__bsStore.getState()
  const g = s.project.compositions[0].layers.find((l) => l.type === 'group')
  s.update((p) => {
    const x = p.compositions[0].layers.find((l) => l.id === g.id)
    x.start = 2
    x.end = 5
  })
  return { id: g.id, width: g.width, height: g.height }
})
await S(() => window.__bsStore.getState().setTime(0.7))
await row('Comp 1').dblclick()
await page.waitForTimeout(500)
await check('geopende compositie begint op zijn eigen 0 s', async () => {
  const s = await st()
  return s.tab === group.id && Math.abs(s.time - 2) < 1e-6 && (await page.locator('.timecode').innerText()).startsWith('00:00')
})
await check('tijdlijn: duur van de compositie (3 s) in de kop', async () => (await page.locator('.tl-duration input').inputValue()).startsWith('3'))
await check('canvas: alleen de compositie, op zijn eigen maat', async () => {
  const stage = await page.locator('.viewer .stage').boundingBox()
  const zoom = await S(() => window.__bsStore.getState().zoom)
  return Math.abs(stage.width - group.width * zoom) < 2 && Math.abs(stage.height - group.height * zoom) < 2
})
await check('preview van de compositie: eigen maat', async () => !!(await inPreview(() => (document.querySelector('meta[name="ad.size"]')?.content.includes(`width=`) && document.getElementById('ad').offsetWidth < 300 ? true : null))))
// Scrubben in de compositie: 1 s op de liniaal = 2 + 1 = 3 s in het formaat
const pps = await S(() => 120)
const rb2 = await ruler.boundingBox()
await page.mouse.click(rb2.x + 10 + pps * 1, rb2.y + rb2.height / 2)
await check('scrubben in de compositie: tijd vanaf het in-punt', async () => Math.abs((await st()).time - 3) < 0.06)
// Afspelen blijft binnen de compositie (2 – 5 s)
await S(() => window.__bsStore.getState().setTime(4.9))
await S(() => window.__bsStore.getState().setPlaying(true))
await page.waitForTimeout(400)
await S(() => window.__bsStore.getState().setPlaying(false))
await check('afspelen herhaalt binnen de compositie', async () => {
  const t = (await st()).time
  return t >= 2 && t < 3
})
await page.screenshot({ path: `${shots}/c1-compositie-los.png` })
// Maat en duur van de compositie in het paneel Ontwerp (niets geselecteerd)
await S(() => window.__bsStore.getState().select([]))
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
await page.waitForTimeout(200)
const compSec = page.locator('.panel-scroll .section', { has: page.locator('.section-head .title', { hasText: 'Compositie' }) })
const typeNum = async (loc, v) => {
  await loc.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(String(v))
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
}
await typeNum(compSec.locator('.num', { hasText: 'B' }).locator('input'), 200)
await typeNum(compSec.locator('.row', { has: page.locator('.label', { hasText: /^Duur$/ }) }).locator('input'), 4)
await check('compositie: maat en duur aanpassen in het paneel Ontwerp', async () => {
  const g = await S((id) => JSON.parse(JSON.stringify(window.__bsStore.getState().project.compositions[0].layers.find((l) => l.id === id))), group.id)
  const stage = await page.locator('.viewer .stage').boundingBox()
  const zoom = await S(() => window.__bsStore.getState().zoom)
  return g.width === 200 && Math.abs(g.end - g.start - 4) < 1e-6 && Math.abs(stage.width - 200 * zoom) < 2 && (await page.locator('.tl-duration input').inputValue()).startsWith('4')
})
// Terug naar het formaat: alles weer zichtbaar, tijd blijft
await page.locator('.tl-tabs > button').first().click()
await page.waitForTimeout(300)
await check('terug naar het formaat: hele banner, compositie uit te klappen', async () => {
  const stage = await page.locator('.viewer .stage').boundingBox()
  const zoom = await S(() => window.__bsStore.getState().zoom)
  return Math.abs(stage.width - 300 * zoom) < 2 && (await row('Comp 1').count()) === 1
})

// 3. Transparant bekijken
await page.locator('.viewer .floating button[title^="Transparant"]').click()
await page.waitForTimeout(400)
await check('transparant: schaakbord en geen achtergrond in de preview', async () => {
  const checker = await page.locator('.viewer .stage.checker').count()
  // Er zijn twee preview-frames (wisselend); wachten tot er één zonder achtergrond is
  const ok = await inPreview(() => (/rgba\(0, 0, 0, 0\)|transparent/.test(getComputedStyle(document.getElementById('ad')).backgroundColor) ? true : null))
  return checker === 1 && !!ok
})
await page.screenshot({ path: `${shots}/c2-transparant.png` })
await check('export houdt de achtergrond', async () => (await S(() => window.__bsStore.getState().project.compositions[0].background)) !== 'transparent')
await page.locator('.viewer .floating button[title^="Met achtergrond"]').click()

// 4. Write-on richting
await S(() => { const s = window.__bsStore.getState(); s.select([s.project.compositions[0].layers.find((l) => l.type === 'writeon').id]) })
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
await page.waitForTimeout(200)
await page.locator('.writeon-dir button[title^="Van rechts"]').click()
await check('write-on richting in het project', async () => (await S(() => window.__bsStore.getState().project.compositions[0].layers.find((l) => l.type === 'writeon').writeon.direction)) === 'right')
await pickFolder(app, `${shots}/out`)
const outDir = await S((d) => window.bs.chooseExportDir(d), dir)
const comp = await S(() => window.__bsStore.getState().project.compositions[0].id)
const [res] = await S(([d, c, o]) => window.bs.exportBanners({ dir: d, project: window.__bsStore.getState().project, compositionIds: [c], targets: ['cm360'], outDir: o }), [dir, comp, outDir])
const html = await zipText(res.zip, 'index.html')
await check('export: letters in omgekeerde volgorde (van rechts)', async () => {
  const glyphs = await S(() => window.__bsStore.getState().project.compositions[0].layers.find((l) => l.type === 'writeon').writeon.glyphs.map((g) => g.d))
  const first = html.indexOf(glyphs[glyphs.length - 1])
  const last = html.indexOf(glyphs[0])
  return glyphs.length > 1 && first > 0 && last > first
})

console.log(fails ? `${fails} controle(s) mislukt` : 'Compositie, scrubben, transparant en write-on: alles in orde')
await S(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

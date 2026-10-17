// Rooktest: meerdere keyframes selecteren (rechthoek, Shift) en samen slepen, relatief aanpassen,
// dezelfde waarde op meerdere lagen, laagbalk slepen met keyframes aan het begin, duur in de tijdlijnkop.
// Gebruik: npm run build && xvfb-run node scripts/smoke-keys.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

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
const layer = (name) => S((n) => JSON.parse(JSON.stringify(window.__bsStore.getState().project.compositions[0].layers.find((l) => l.name === n))), name)
const select = (names) =>
  S((n) => {
    const s = window.__bsStore.getState()
    s.select(s.project.compositions[0].layers.filter((l) => n.includes(l.name)).map((l) => l.id))
  }, names)
const row = (name) => page.locator('.tl-name:not(.sub)').filter({ has: page.getByText(name, { exact: true }) }).first()
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

// Headline: een slide-in van y 100 naar 40 (keyframes op 0 en 1 s), Subline staat stil
await S(() =>
  window.__bsStore.getState().update((p) => {
    const l = p.compositions[0].layers.find((x) => x.name === 'Headline')
    l.tracks = {
      x: [{ t: 0, v: l.x, e: 'easeOut' }, { t: 1, v: l.x, e: 'linear' }],
      y: [{ t: 0, v: 100, e: 'easeOut' }, { t: 1, v: 40, e: 'linear' }]
    }
    const s = p.compositions[0].layers.find((x) => x.name === 'Subline')
    s.tracks = {}
  })
)
await page.locator('.viewer').click({ position: { x: 5, y: 5 } })
await select(['Headline'])
await page.keyboard.press('KeyP')
const track = page.locator('.tl-track.sub').first()
const diamonds = track.locator('.diamond[data-layer]')
await check('twee positie-keyframes zichtbaar', async () => (await diamonds.count()) === 2)

// 1. Rechthoek over beide keyframes: allebei geselecteerd
// Tijdlijn groot maken zodat alles in beeld is
await page.locator('.dock-tabs', { has: page.locator('.dock-tab.on', { hasText: /^Tijdlijn$/ }) }).locator('button[title="Maximaliseren"]').click()
await page.waitForTimeout(300)
await track.scrollIntoViewIfNeeded()
const tb = await track.boundingBox()
const d0 = await diamonds.nth(0).boundingBox()
const d1 = await diamonds.nth(1).boundingBox()
// Van rechts naar links slepen (links zit de kolom met laagnamen)
await page.mouse.move(d1.x + 30, tb.y + 3)
await page.mouse.down()
await page.mouse.move(Math.max(tb.x + 1, d0.x - 3), tb.y + tb.height - 3, { steps: 6 })
await page.mouse.up()
await check('selectierechthoek: beide keyframes geselecteerd', async () => (await S(() => window.__bsStore.getState().selectedKeys.length)) === 2)

// 2. Samen slepen: +0,5 s
const pps = (d1.x - d0.x) / 1
await page.mouse.move(d1.x + d1.width / 2, d1.y + d1.height / 2)
await page.mouse.down()
await page.mouse.move(d1.x + d1.width / 2 + pps * 0.5, d1.y + d1.height / 2, { steps: 8 })
await page.mouse.up()
await check('samen gesleept: 0→0,5 en 1→1,5 (X en Y)', async () => {
  const l = await layer('Headline')
  return l.tracks.y.map((k) => k.t).join() === '0.5,1.5' && l.tracks.x.map((k) => k.t).join() === '0.5,1.5'
})

// 3. Relatief: playhead op het geselecteerde keyframe (1,5 s), Y van 40 naar 20 → hele slide-in 20 hoger
await S(() => window.__bsStore.getState().setTime(1.5))
await page.waitForTimeout(150)
const yField = page.locator('.tl-name.sub .tl-val input').nth(1)
await typeIn(yField, 20)
await check('geselecteerde keyframes schuiven samen mee (100→80, 40→20)', async () => {
  const l = await layer('Headline')
  return l.tracks.y.map((k) => k.v).join() === '80,20'
})

// 4. Dezelfde waarde op meerdere lagen: Headline + Subline, X van Subline-rij aanpassen
await S(() => window.__bsStore.getState().select([]))
await select(['Headline', 'Subline'])
await page.keyboard.press('KeyP')
await page.waitForTimeout(150)
const subRow = page.locator('.tl-name.sub').filter({ has: page.locator('.tl-val') })
await check('positie-regels van beide lagen zichtbaar', async () => (await subRow.count()) === 2)
await typeIn(subRow.nth(1).locator('.tl-val input').first(), 33)
await check('X = 33 op beide geselecteerde lagen', async () => {
  const h = await layer('Headline')
  const s = await layer('Subline')
  const hx = h.tracks.x.find((k) => Math.abs(k.t - 1.5) < 0.01)
  return s.x === 33 && hx?.v === 33
})

// 5. Laagbalk slepen terwijl er keyframes aan het begin staan: alles schuift samen, nooit vóór 0
await S(() =>
  window.__bsStore.getState().update((p) => {
    const l = p.compositions[0].layers.find((x) => x.name === 'Subline')
    l.tracks = { opacity: [{ t: 0, v: 0, e: 'linear' }, { t: 0.5, v: 1, e: 'linear' }] }
    delete l.start
    delete l.end
  })
)
await select(['Subline'])
await row('Subline').scrollIntoViewIfNeeded()
const bar = row('Subline').locator('xpath=following-sibling::div[1]').locator('.tl-bar')
const bb = await bar.boundingBox()
await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2)
await page.mouse.down()
await page.mouse.move(bb.x + bb.width / 2 + pps, bb.y + bb.height / 2, { steps: 8 })
await page.mouse.up()
await check('balk 1 s naar rechts: in-punt én keyframes +1 s', async () => {
  const l = await layer('Subline')
  return Math.abs((l.start ?? 0) - 1) < 0.06 && Math.abs(l.tracks.opacity[0].t - 1) < 0.06
})
const bb2 = await bar.boundingBox()
await page.mouse.move(bb2.x + bb2.width / 2, bb2.y + bb2.height / 2)
await page.mouse.down()
await page.mouse.move(bb2.x + bb2.width / 2 - pps * 3, bb2.y + bb2.height / 2, { steps: 8 })
await page.mouse.up()
await check('balk ver naar links: stopt op 0, keyframes blijven bij de laag', async () => {
  const l = await layer('Subline')
  return (l.start ?? 0) === 0 && l.tracks.opacity[0].t === 0 && l.tracks.opacity[1].t === 0.5
})

// 6. Duur in de tijdlijnkop
await typeIn(page.locator('.tl-duration input'), 6)
await check('duur aangepast in de tijdlijn (6 s)', async () => (await S(() => window.__bsStore.getState().project.compositions[0].duration)) === 6)
await page.screenshot({ path: `${shots}/k1-tijdlijn.png` })

console.log(fails ? `${fails} controle(s) mislukt` : 'Keyframes: alles in orde')
await S(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

// Rooktest: sneltoetsen (tijdlijn, keyframes, uitlijnen, volgorde, vervangen, overzicht).
// Gebruik: npm run build && xvfb-run node scripts/smoke-shortcuts.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const st = () => page.evaluate(() => JSON.parse(JSON.stringify({ ...window.__bsStore.getState(), presets: [], menu: null, svgChoice: null })))
const layers = async () => (await st()).project.compositions[0].layers
const layer = async (name) => (await layers()).find((l) => l.name === name)
const row = (name) => page.locator('.tl-name:not(.sub)').filter({ has: page.getByText(name, { exact: true }) }).first()
const setTime = (t) => page.evaluate((x) => window.__bsStore.getState().setTime(x), t)
const select = (names) =>
  page.evaluate((n) => {
    const s = window.__bsStore.getState()
    s.select(s.project.compositions[0].layers.filter((l) => n.includes(l.name)).map((l) => l.id))
  }, names)
const key = async (k) => {
  await page.keyboard.press(k)
  await page.waitForTimeout(120)
}

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await page.locator('.viewer').click({ position: { x: 5, y: 5 } }) // focus op het canvas, niet in een veld

// 1. [ en ] : in- en uitpunt op de playhead
await select(['Subline'])
await setTime(2)
await key('BracketLeft')
await setTime(5)
await key('BracketRight')
await check('[ en ] zetten in- en uitpunt (zonder Alt)', async () => {
  const l = await layer('Subline')
  return Math.abs(l.start - 2) < 0.01 && Math.abs(l.end - 5) < 0.01
})

// 2. I / ⇧I : naar in- en uitpunt
await setTime(0)
await key('KeyI')
await check('I: playhead naar in-punt', async () => Math.abs((await st()).time - 2) < 0.01)
await key('Shift+KeyI')
await check('⇧I: playhead naar uitpunt', async () => Math.abs((await st()).time - 5) < 0.01)

// 3. Shift+[ : laag verschuiven zodat hij op de playhead begint (duur blijft)
await setTime(3)
await key('Shift+BracketLeft')
await check('⇧[: laag begint op de playhead, duur blijft gelijk', async () => {
  const l = await layer('Subline')
  return Math.abs(l.start - 3) < 0.01 && Math.abs(l.end - 6) < 0.01
})

// 3b. P / S / O / R / U: alleen die eigenschappen tonen in de tijdlijn (zoals After Effects)
const subRows = () => page.locator('.tl-name.sub .grow').allInnerTexts()
await select(['Headline'])
await key('KeyP')
await check('P: alleen Positie zichtbaar', async () => (await subRows()).join() === 'Positie')
await key('Shift+KeyO')
await check('⇧O: Dekking erbij', async () => (await subRows()).join() === 'Positie,Dekking')
await key('KeyR')
await check('R (met selectie): alleen Rotatie, geen rechthoek-gereedschap', async () =>
  (await subRows()).join() === 'Rotatie' && (await st()).tool === 'select'
)
await key('KeyR')
await check('R nog een keer: ingeklapt', async () => (await subRows()).length === 0)
await select(['Headline', 'CTA'])
await key('KeyS')
await check('S met twee lagen: schaal van allebei', async () => (await subRows()).join() === 'Schaal,Schaal')
await key('KeyS')
await select(['Headline'])
await page.evaluate(() =>
  window.__bsStore.getState().update((p) => {
    const l = p.compositions[0].layers.find((x) => x.name === 'Headline')
    l.tracks.rotation = [{ t: 0, v: 0, e: 'linear' }, { t: 1, v: 10, e: 'linear' }]
  })
)
await key('KeyU')
await check('U: alleen eigenschappen met keyframes', async () => {
  const rows = await subRows()
  return rows.includes('Rotatie') && !rows.includes('Schaal')
})
await key('KeyU')
await page.evaluate(() => window.__bsStore.getState().update((p) => void delete p.compositions[0].layers.find((x) => x.name === 'Headline').tracks.rotation))
await page.evaluate(() => window.__bsStore.getState().select([]))
await key('KeyR')
await check('R zonder selectie: rechthoek-gereedschap', async () => (await st()).tool === 'rect')
await key('KeyT')
await check('T: tekstgereedschap', async () => (await st()).tool === 'text')
await key('KeyV')
await check('V: selecteren', async () => (await st()).tool === 'select')

// 4. Alt+Shift+P / T : keyframes op de playhead
await select(['Headline'])
await setTime(1)
await key('Alt+Shift+KeyP')
await setTime(3)
await key('Alt+Shift+KeyT')
await check('⌥⇧P: positie-keyframe (X en Y)', async () => {
  const l = await layer('Headline')
  return l.tracks.x?.some((k) => Math.abs(k.t - 1) < 0.01) && l.tracks.y?.some((k) => Math.abs(k.t - 1) < 0.01)
})
await check('⌥⇧T: dekking-keyframe', async () => (await layer('Headline')).tracks.opacity?.some((k) => Math.abs(k.t - 3) < 0.01))

// 5. J / K : vorige / volgende keyframe
await setTime(0)
await key('KeyK')
await check('K: naar volgend keyframe', async () => (await st()).time > 0.001)
const afterK = (await st()).time
await key('KeyK')
await key('KeyJ')
await check('J: terug naar vorig keyframe', async () => Math.abs((await st()).time - afterK) < 0.01)

// 6. Uitlijnen en verdelen met Option/Alt
await select(['Headline', 'CTA'])
await key('Alt+KeyA')
await check('⌥A: links uitgelijnd', async () => (await layer('Headline')).x === (await layer('CTA')).x)
await select(['Headline', 'Subline', 'CTA'])
await key('Alt+Shift+KeyV')
await check('⌥⇧V: verticaal verdeeld', async () => {
  const ls = (await Promise.all(['Headline', 'Subline', 'CTA'].map(layer))).sort((a, b) => a.y - b.y)
  return Math.abs(ls[1].y - (ls[0].y + ls[0].height) - (ls[2].y - (ls[1].y + ls[1].height))) <= 1
})
await select(['CTA'])
await key('Alt+KeyH')
await check('⌥H met één laag: gecentreerd op de banner', async () => {
  const l = await layer('CTA')
  return Math.abs(l.x + l.width / 2 - 150) <= 0.5
})

// 7. Volgorde: Ctrl/⌘+] en Ctrl/⌘+Shift+[
const idx = async (n) => (await layers()).findIndex((l) => l.name === n)
const before = await idx('Subline')
await select(['Subline'])
await key('Control+BracketRight')
await check('⌘]: één naar voren', async () => (await idx('Subline')) === before - 1)
await key('Control+Shift+BracketLeft')
await check('⌘⇧[: helemaal naar achteren', async () => (await idx('Subline')) === (await layers()).length - 1)

// 8. Afbeelding vervangen: Ctrl/⌘+Alt+/
await select(['logo.svg'])
await key('Control+Alt+Slash')
await check('⌥⌘/: vervang-venster open', async () => (await page.locator('.modal h2', { hasText: 'Afbeelding vervangen' }).count()) === 1)
await key('Escape')

// 9. Overzicht met ?
await key('Shift+Slash')
await check('?: sneltoetsen-overzicht', async () => (await page.locator('.modal h2', { hasText: 'Sneltoetsen' }).count()) === 1)
await page.waitForTimeout(300)
await page.screenshot({ path: `${shots}/s1-overzicht.png` })
await key('Escape')

// 10. Niets selecteren: Ctrl/⌘+Shift+A ; en typen in een veld triggert geen sneltoetsen
await select(['CTA'])
await key('Control+Shift+KeyA')
await check('⌘⇧A: niets geselecteerd', async () => (await st()).selection.length === 0)
await select(['Headline'])
const startBefore = (await layer('Headline')).start ?? 0
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
const nameField = page.locator('.panel-scroll input').first()
await nameField.click()
await page.keyboard.type('[i]')
await check('typen in een veld: geen sneltoets', async () => ((await layer('Headline')).start ?? 0) === startBefore)
await page.keyboard.press('Escape')

await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

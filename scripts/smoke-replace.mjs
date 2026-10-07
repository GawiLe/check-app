// Rooktest: afbeelding vervangen (menu, venster, uploaden, assetmenu, slepen) en keyframes slepen.
// Gebruik: npm run build && xvfb-run node scripts/smoke-replace.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const shot = async (name) => {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}/${name}.png` })
}
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const project = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project)))
const layers = async () => (await project()).compositions[0].layers
const logo = async () => (await layers()).find((l) => l.image)
const row = (name) => page.locator('.tl-name:not(.sub)').filter({ has: page.getByText(name, { exact: true }) }).first()
const menuItem = (label) => page.locator('.ctx-menu button', { hasText: label }).first()
const svg = (w, h, c) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`

// Twee extra afbeeldingen met een andere verhouding: één in assets/, één "ergens op de schijf"
await writeFile(`${dir}/assets/breed.svg`, svg(200, 50, '#ff3366'))
await writeFile(`${shots}/hoog.svg`, svg(50, 100, '#2266ff'))

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await page.evaluate(() => {
  const d = window.__bsDock.getState()
  const col = d.root.children.find((c) => c.kind === 'split')
  d.resize(col.id, [0.4, 0.6])
})
const name0 = (await logo()).name
const w0 = (await logo()).width

// 1. Rechtermuisknop → Afbeelding vervangen… → kies uit de assets
await row(name0).click({ button: 'right' })
await menuItem('Afbeelding vervangen').click()
await page.locator('.replace-tile').first().waitFor()
await shot('r1-venster')
await page.locator('.replace-tile', { hasText: 'breed.svg' }).click()
await page.waitForTimeout(400)
await check('vervangen uit assets (breedte blijft, hoogte volgt verhouding)', async () => {
  const l = await logo()
  return l.image.src === 'assets/breed.svg' && l.width === w0 && l.height === Math.round(w0 / 4) && l.name === 'breed.svg'
})

// 2. Uploaden uit een map (het systeemvenster wordt hier nagebootst)
await app.evaluate(({ dialog }, p) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
}, `${shots}/hoog.svg`)
await row('breed.svg').click({ button: 'right' })
await menuItem('Vervangen door bestand uit map').click()
await page.waitForTimeout(800)
await check('vervangen door bestand uit map (in assets/ gezet)', async () => {
  const l = await logo()
  const assets = await page.evaluate(() => window.__bsStore.getState().assets)
  return l.image.src === 'assets/hoog.svg' && l.height === w0 * 2 && assets.includes('assets/hoog.svg')
})

// 3. Rechtermuisknop op een asset → vervang geselecteerde afbeelding
await page.locator('.dock-tab', { hasText: 'Assets' }).click()
await row('hoog.svg').click()
await page.locator('.list-item', { hasText: 'breed.svg' }).click({ button: 'right' })
await menuItem('Vervang geselecteerde afbeelding').click()
await page.waitForTimeout(400)
await check('vervangen via assetmenu', async () => (await logo()).image.src === 'assets/breed.svg')

// 4. Asset op de laag in de tijdlijn slepen
await page.locator('.list-item', { hasText: 'hoog.svg' }).dragTo(row('breed.svg'))
await page.waitForTimeout(400)
await check('vervangen door slepen op de tijdlijn', async () => (await logo()).image.src === 'assets/hoog.svg')
await check('geen extra lagen erbij', async () => (await layers()).filter((l) => l.image).length === 1)

// 5. Keyframes slepen: alleen het keyframe beweegt, de balk blijft staan
const tl = page.locator('.timeline .ruler')
// Laag die later begint (in-punt 0,5s): daar groeide de balk eerder mee met het laatste keyframe
await page.evaluate(() =>
  window.__bsStore.getState().update((p) => {
    for (const c of p.compositions) for (const l of c.layers) if (l.name === 'Subline') l.start = 0.5
  })
)
await row('Subline').click()
await page.keyboard.press('u')
const posRow = page.locator('.tl-name.sub', { hasText: 'Positie' }).first()
await tl.click({ position: { x: 10 + 1 * 120, y: 10 } })
await posRow.locator('.kf-btn').click()
await tl.click({ position: { x: 10 + 3 * 120, y: 10 } })
await posRow.locator('.kf-btn').click()
const bar = row('Subline').locator('xpath=following-sibling::div[1]').locator('.tl-bar')
const bar0 = await bar.boundingBox()
const widths = []
{
  const d = page.locator('.tl-track.sub').first().locator('.diamond:not(.generated)').first()
  const b = await d.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(b.x + b.width / 2 + i * 12, b.y + b.height / 2 + (i % 3) * 6)
    widths.push((await bar.boundingBox()).width)
  }
  await page.mouse.up()
}
await check('keyframe 1s verschoven (X en Y samen)', async () => {
  const l = (await layers()).find((x) => x.name === 'Subline')
  return l.tracks.x.map((k) => k.t).join() === '2,3' && l.tracks.y.map((k) => k.t).join() === '2,3'
})
await check('balk blijft staan tijdens slepen', async () => widths.every((w) => Math.abs(w - bar0.width) < 1) && Math.abs((await bar.boundingBox()).x - bar0.x) < 1)
// Voorbij het tweede keyframe slepen mag het niet "opeten"
{
  const d = page.locator('.tl-track.sub').first().locator('.diamond:not(.generated)').first()
  const b = await d.boundingBox()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + 240, b.y + b.height / 2, { steps: 12 })
  await page.mouse.up()
}
await check('slepen over een ander keyframe heen: beide blijven bestaan', async () => {
  const l = (await layers()).find((x) => x.name === 'Subline')
  return l.tracks.x.length === 2 && l.tracks.y.length === 2
})
await shot('r2-keyframes')
// Testeinde: wijzigingen als opgeslagen markeren, anders vraagt de app terecht of je wilt opslaan
await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

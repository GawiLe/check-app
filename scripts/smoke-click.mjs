// Rooktest: klikgebieden, uitlijnen/verdelen, hele pixels, export naar CM360 + Adform met backup-afbeelding.
// Gebruik: npm run build && xvfb-run node scripts/smoke-click.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir, readdir, readFile } from 'node:fs/promises'

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
const layer = async (name) => (await layers()).find((l) => l.name === name)
const row = (name) => page.locator('.tl-name:not(.sub)').filter({ has: page.getByText(name, { exact: true }) }).first()
const overlayBox = async () => page.locator('.overlay').boundingBox()
const zoom = () => page.evaluate(() => window.__bsStore.getState().zoom)

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await page.evaluate(() =>
  window.__bsStore.getState().update((p) => {
    p.clickTag = 'https://www.makro.nl'
    p.targets = ['cm360', 'adform']
  })
)

// 1. Standaard geen klikgebieden
await check('standaard: geen klikgebieden', async () => (await page.locator('.exit-frame').count()) === 0)

// 2. Klikgebied toevoegen via + Laag
await page.getByRole('button', { name: 'Laag', exact: true }).click()
await page.locator('.menu button', { hasText: 'Klikgebied' }).click()
await check('klikgebied toegevoegd (bovenaan, met clickTag1)', async () => {
  const l = (await layers())[0]
  return l.name === 'Klikgebied 1' && l.exit && (await page.locator('.exit-frame', { hasText: 'clickTag1' }).count()) === 1
})
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
const urlInput = page.locator('.section', { hasText: 'Klikgebied' }).locator('input[placeholder]').last()
await urlInput.fill('https://www.makro.nl/actie')
await urlInput.press('Enter')
await check('eigen URL ingevuld', async () => (await layer('Klikgebied 1')).exit.url === 'https://www.makro.nl/actie')

// 3. CTA ook een eigen klikgebied via de rechtermuisknop → clickTag2
await row('CTA').click({ button: 'right' })
await page.locator('.ctx-menu button', { hasText: 'Eigen klikgebied' }).click()
await check('CTA als tweede klikgebied', async () => (await page.locator('.exit-frame', { hasText: 'clickTag2' }).count()) === 1)
await shot('c1-klikgebieden')

// 4. Uitlijnen: Klikgebied + CTA links op elkaar, daarna CTA horizontaal centreren op de banner
await row('Klikgebied 1').click()
await row('CTA').click({ modifiers: ['Shift'] })
await page.locator('.align-to button', { hasText: 'Selectie' }).click()
await page.locator('.align-buttons button[title^="Links uitlijnen"]').click()
await check('links uitgelijnd op de selectie', async () => (await layer('Klikgebied 1')).x === (await layer('CTA')).x)
await row('CTA').click()
await page.locator('.align-buttons button[title^="Horizontaal centreren"]').click()
await check('één laag gecentreerd op de banner', async () => {
  const l = await layer('CTA')
  return Math.abs(l.x + l.width / 2 - 150) <= 0.5
})

// 5. Verdelen: drie lagen met gelijke ruimte
for (const [i, n] of ['Headline', 'Subline', 'CTA'].entries()) await row(n).click({ modifiers: i ? ['Shift'] : [] })
await page.locator('.align-buttons button[title^="Verticaal verdelen"]').click()
await check('verticaal verdeeld (gelijke tussenruimte)', async () => {
  const ls = await Promise.all(['Headline', 'Subline', 'CTA'].map(layer))
  const s = ls.sort((a, b) => a.y - b.y)
  const g1 = s[1].y - (s[0].y + s[0].height)
  const g2 = s[2].y - (s[1].y + s[1].height)
  return Math.abs(g1 - g2) <= 1
})

// 6. Hele pixels: slepen op een "krom" zoomniveau en schaal in het veld
await page.evaluate(() => window.__bsStore.getState().setZoom(0.737))
await row('Subline').click()
{
  const l = await layer('Subline')
  const ov = await overlayBox()
  const z = await zoom()
  const x = ov.x + (l.x + l.width / 2) * z
  const y = ov.y + (l.y + l.height / 2) * z
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 13.3, y + 7.7, { steps: 5 })
  await page.mouse.up()
}
await check('na slepen: hele pixels', async () => {
  const all = (await project()).compositions.flatMap((c) => c.layers)
  return all.every((l) => [l.x, l.y, l.width, l.height, l.rotation].every(Number.isInteger))
})
await shot('c2-uitgelijnd')

// 7. Export CM360 + Adform: backup met dezelfde naam als de zip, manifest.json voor Adform
await page.getByRole('button', { name: 'Exporteren' }).first().click()
await page.getByRole('button', { name: /Exporteer \d+ banner/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.result').length >= 2, null, { timeout: 90000 })
console.log((await page.locator('.result .issues').allInnerTexts()).join('\n'))
await shot('c3-export')
const cm = await readdir(`${dir}/export/cm360`)
const zip = cm.find((f) => f.endsWith('.zip'))
await check(`backup naast de zip met dezelfde naam (${cm.filter((f) => !f.includes('.') || /\.(zip|jpg)$/.test(f)).join(', ')})`, async () =>
  cm.includes(zip.replace(/\.zip$/, '.jpg'))
)
const folder = zip.replace(/\.zip$/, '')
const html = await readFile(`${dir}/export/cm360/${folder}/index.html`, 'utf8')
await check('CM360: clickTag, clickTag1 en clickTag2', async () =>
  ['var clickTag = "https://www.makro.nl"', 'var clickTag1 = "https://www.makro.nl/actie"', 'window.open(window.clickTag2)'].every((s) => html.includes(s))
)
const af = await readdir(`${dir}/export/adform/${folder}`)
const manifest = JSON.parse(await readFile(`${dir}/export/adform/${folder}/manifest.json`, 'utf8'))
await check('Adform: manifest.json met clickTAG, clickTAG1, clickTAG2', async () => af.includes('manifest.json') && Object.keys(manifest.clicktags).join() === 'clickTAG,clickTAG1,clickTAG2')
await check('font als Base64 ingebed, geen los .woff2-bestand', async () =>
  html.includes('url(data:font/woff2;base64,') && !(await readdir(`${dir}/export/cm360/${folder}`)).some((f) => f.endsWith('.woff2'))
)
await check('melding: font verkleind tot de gebruikte tekens', async () =>
  (await page.locator('.result .issues li').allInnerTexts()).some((t) => /tekens gebruikt, verkleind van [\d.]+ KB tot [\d.]+ KB en als Base64/.test(t))
)
await check('Adform: backup aanwezig', async () => (await readdir(`${dir}/export/adform`)).includes(`${folder}.jpg`))
// Testeinde: wijzigingen als opgeslagen markeren, anders vraagt de app terecht of je wilt opslaan
await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

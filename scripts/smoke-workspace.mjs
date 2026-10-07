// Rooktest werkruimte: positie/schaal als één regel, koppelen, hernoemen, panelen ordenen en codeweergave.
// Gebruik: npm run build && xvfb-run node scripts/smoke-workspace.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

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
const layer = async (name) => (await project()).compositions[0].layers.find((l) => l.name === name)
const row = (name) => page.locator('.tl-name:not(.sub)').filter({ has: page.getByText(name, { exact: true }) }).first()
const trow = (label) => page.locator('.trow').filter({ has: page.locator('.label', { hasText: label }) }).first()
const field = (label, lbl) => trow(label).locator('.num').filter({ has: page.locator('.lbl', { hasText: new RegExp(`^${lbl.replace('%', '%')}$`) }) }).locator('input')
const setField = async (label, lbl, v) => {
  await field(label, lbl).click()
  await field(label, lbl).fill(String(v))
  await field(label, lbl).press('Enter')
}
const dockPanels = () => page.evaluate(() => [...document.querySelectorAll('.dock-tab')].map((t) => t.textContent))

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. Positie: X en Y op één regel, één keyframe-knop voor beide
await row('Subline').click()
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
await trow('Positie').locator('.kf').click()
await check('positie-keyframe zet X én Y', async () => {
  const l = await layer('Subline')
  return l.tracks.x?.length === 1 && l.tracks.y?.length === 1
})
await page.keyboard.press('u')
await check('tijdlijn: één regel Positie (geen losse X/Y)', async () => {
  const subs = await page.locator('.tl-name.sub').allInnerTexts()
  return subs.some((t) => t.includes('Positie')) && !subs.some((t) => /^\s*X\s*$/.test(t))
})

// 2. Schaal ontkoppelen en alleen de hoogte schalen
await setField('Schaal', 'X%', 120)
await check('schaal gekoppeld: X% zet ook Y', async () => {
  const l = await layer('Subline')
  return Math.abs(l.scale - 1.2) < 1e-6 && l.scaleY === undefined
})
await trow('Schaal').locator('.link').click()
await setField('Schaal', 'Y%', 50)
await check('schaal ontkoppeld: Y% apart', async () => {
  const l = await layer('Subline')
  return l.scaleLinked === false && Math.abs(l.scale - 1.2) < 1e-6 && Math.abs(l.scaleY - 0.5) < 1e-6
})
await shot('w1-transform')

// 3. B en H koppelen: verhouding blijft gelijk
await row('CTA').click()
const before = await layer('CTA')
await trow('Maat').locator('.link').click()
await setField('Maat', 'B', before.width * 2)
await check('B/H gekoppeld schaalt mee', async () => {
  const l = await layer('CTA')
  return l.sizeLinked && l.width === before.width * 2 && Math.abs(l.height - before.height * 2) <= 1
})

// 4. Laag hernoemen met Enter (zoals in After Effects)
await row('CTA').click()
await page.keyboard.press('Enter')
await page.locator('.inline-rename').fill('Knop')
await page.locator('.inline-rename').press('Enter')
await check('laag hernoemd met Enter', async () => !!(await layer('Knop')))
await row('Headline').locator('span.grow').dblclick()
await page.locator('.inline-rename').fill('Kop')
await page.locator('.inline-rename').press('Enter')
await check('laag hernoemd met dubbelklik', async () => !!(await layer('Kop')))

// 5. Formaat (compositie) hernoemen met dubbelklik op het tabblad
await page.locator('button[title*="dubbelklik om de naam"]', { hasText: '300×600' }).first().dblclick()
await page.locator('.inline-rename').fill('Halfpage')
await page.locator('.inline-rename').press('Enter')
await check('formaat hernoemd', async () => (await project()).compositions[0].name === 'Halfpage')

// 6. Panelen: sluiten en terug via Venster
await page.locator('.dock-tab', { hasText: 'Assets & fonts' }).locator('.dock-close').click()
await check('Assets gesloten', async () => !(await dockPanels()).some((t) => t.includes('Assets')))
await page.getByRole('button', { name: 'Venster', exact: true }).click()
await page.locator('.menu button', { hasText: 'Assets & fonts' }).click()
await check('Assets terug via Venster', async () => (await dockPanels()).some((t) => t.includes('Assets')))
await page.keyboard.press('Escape')

// 7. Tijdlijn naar de rechterkant van het canvas slepen (naast elkaar)
{
  const tab = page.locator('.dock-tab', { hasText: 'Tijdlijn' })
  const target = page.locator('.dock-tabs[data-panel="viewer"] .dock-body')
  const b = await target.boundingBox()
  await tab.dragTo(target, { targetPosition: { x: b.width - 10, y: b.height / 2 } })
}
await check('tijdlijn naast het canvas gezet', async () => {
  const v = await page.locator('.dock-tabs[data-panel="viewer"]').boundingBox()
  const t = await page.locator('.dock-tabs[data-panel="timeline"]').boundingBox()
  return t.x > v.x + v.width - 5 && Math.abs(t.y - v.y) < 5
})
await shot('w2-tijdlijn-rechts')

// 8. Splitter slepen: tijdlijn breder
{
  const t0 = await page.locator('.dock-tabs[data-panel="timeline"]').boundingBox()
  // De scheidingslijn direct links van de tijdlijn
  const s = await page.evaluate(() => {
    const r = document.querySelector('.dock-tabs[data-panel="timeline"]').parentElement.previousElementSibling.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })
  await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2)
  await page.mouse.down()
  await page.mouse.move(s.x - 120, s.y + s.height / 2, { steps: 6 })
  await page.mouse.up()
  await check('splitter: tijdlijn breder', async () => (await page.locator('.dock-tabs[data-panel="timeline"]').boundingBox()).width > t0.width + 80)
}
await page.getByRole('button', { name: 'Venster', exact: true }).click()
await page.locator('.menu button', { hasText: 'Indeling herstellen' }).click()
await check('indeling hersteld', async () => {
  const v = await page.locator('.dock-tabs[data-panel="viewer"]').boundingBox()
  const t = await page.locator('.dock-tabs[data-panel="timeline"]').boundingBox()
  return t.y > v.y + v.height - 5
})

// 9. Codeweergave: alleen code, en ontwerp + code naast elkaar
await page.locator('.canvas-modes button', { hasText: 'Code' }).click()
await check('codeweergave toont de export-HTML', async () => {
  const code = await page.locator('.canvas-panel pre.code').innerText()
  return code.includes('clickTag') && code.includes('<!DOCTYPE html>')
})
await shot('w3-code')
await page.locator('.canvas-modes button', { hasText: 'Beide' }).click()
await check('ontwerp en code naast elkaar', async () => (await page.locator('.canvas-panel .viewer').count()) === 1 && (await page.locator('.canvas-panel pre.code').count()) === 1)
await shot('w4-beide')
await page.locator('.canvas-modes button', { hasText: 'Ontwerp' }).click()

// 10. Maximaliseren met dubbelklik op tab
await page.locator('.dock-tab', { hasText: 'Tijdlijn' }).dblclick()
await check('tijdlijn gemaximaliseerd', async () => (await page.locator('.dock-max').count()) === 1)
await page.locator('.dock-tab', { hasText: 'Tijdlijn' }).dblclick()
await shot('w5-eind')
// Testeinde: wijzigingen als opgeslagen markeren, anders vraagt de app terecht of je wilt opslaan
await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

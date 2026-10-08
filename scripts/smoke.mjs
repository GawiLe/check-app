// Rooktest: start de gebouwde app, opent een testproject, doorloopt de hoofdflow en exporteert.
// Gebruik: npm run build && xvfb-run node scripts/smoke.mjs <projectmap> <screenshotmap>
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
const store = (fn) => page.evaluate(fn)
const project = () => store(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project)))
const base = async () => (await project()).compositions[0]
const row = (name) => page.locator('.tl-name:not(.sub)').filter({ has: page.getByText(name, { exact: true }) }).first()
const menuItem = (label) => page.locator('.ctx-menu button', { hasText: label }).first()
const overlayBox = async () => page.locator('.overlay').boundingBox()
const zoom = () => store(() => window.__bsStore.getState().zoom)
/** Canvas-coördinaat (banner-pixels) → schermpositie */
const at = async (x, y) => {
  const ov = await overlayBox()
  const z = await zoom()
  return { x: ov.x + x * z, y: ov.y + y * z }
}

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 0. De preview draait echt (eigen document via bsproj:// met eigen CSP)
await check('preview rendert de banner', async () => {
  for (let i = 0; i < 40; i++) {
    const f = page.frames().find((fr) => fr.url().startsWith('bsproj://bs-preview/'))
    if (f && (await f.evaluate(() => document.body.classList.contains('r') && document.querySelectorAll('.L').length > 3).catch(() => false))) return true
    await page.waitForTimeout(150)
  }
  return false
})
await check('editor heeft strenge CSP (geen inline scripts)', async () =>
  page.evaluate(() => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content
    return /script-src 'self';/.test(m)
  })
)

// 1. Rechtermuisknop: CTA + CTA tekst → nieuwe compositie
await row('CTA tekst').click()
await row('CTA').click({ modifiers: ['Shift'] })
await row('CTA').click({ button: 'right' })
await shot('1-contextmenu')
await menuItem('aan nieuwe compositie').click()
await check('compositie via rechtermuisknop', async () => (await base()).layers.some((l) => l.type === 'group' && l.children.length === 2))

// 2. Dubbelklik op de compositie → eigen tab
await row('Comp 1').dblclick()
await check('compositie in eigen tab', async () => (await page.locator('.tl-tab.on').count()) === 1 && (await page.locator('.tl-name:not(.sub)').count()) === 2)
await shot('2-comp-tab')
await page.locator('.tl-tabs > button').first().click()

// 3. Keyframes + Easy Ease via rechtermuisknop
await row('Subline').click()
await page.keyboard.press('s') // alleen Schaal tonen
const scaleRow = page.locator('.tl-name.sub', { hasText: 'Schaal' }).first()
await page.locator('.timeline .ruler').click({ position: { x: 10 + 1 * 120, y: 10 } })
await scaleRow.locator('.kf-btn').click()
await page.locator('.timeline .ruler').click({ position: { x: 10 + 2 * 120, y: 10 } })
await store(() => {
  const s = window.__bsStore.getState()
  const l = s.project.compositions[0].layers.find((x) => x.name === 'Subline')
  s.update((p) => {
    const ll = p.compositions[0].layers.find((x) => x.id === l.id)
    ll.tracks.scale.push({ t: 2, v: 1.3, e: 'linear' })
  })
})
const diamonds = page.locator('.tl-track.sub').nth(0).locator('.diamond:not(.generated)')
await diamonds.nth(0).click()
await diamonds.nth(1).click({ modifiers: ['Shift'] })
await diamonds.nth(0).click({ button: 'right' })
await menuItem('Easy Ease (').click()
await check('Easy Ease op 2 keyframes', async () => {
  const sub = (await base()).layers.find((l) => l.name === 'Subline')
  return sub.tracks.scale[0].e === 'easeInOut'
})

// 4. Dubbelklik op tekst op het canvas → bewerken
await page.keyboard.press('Escape')
await page.locator('.timeline .ruler').click({ position: { x: 10 + 3 * 120, y: 10 } })
{
  const p = await at(100, 60)
  await page.mouse.dblclick(p.x, p.y)
  const ed = page.locator('.text-editor')
  await ed.waitFor()
  await ed.fill('Nieuwe headline\nop het canvas')
  await shot('3-tekst-bewerken')
  await ed.press('Escape')
}
await check('tekst op canvas bewerkt', async () => (await base()).layers.find((l) => l.name === 'Headline').text.content === 'Nieuwe headline\nop het canvas')

// 5. Anchor point slepen (packshot naar linksboven)
{
  const p = await at(150, 350)
  await page.mouse.click(p.x, p.y)
  const a = await page.locator('.viewer .anchor').boundingBox()
  const tl = await at(50, 250)
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(tl.x + 1, tl.y + 1, { steps: 6 })
  await page.mouse.up()
}
await check('anchor point naar linksboven', async () => {
  const pk = (await base()).layers.find((l) => l.name.startsWith('Packshot'))
  return pk.anchorX === 0 && pk.anchorY === 0 && pk.x === 50
})

// 6. Ellips tekenen
await page.keyboard.press('e')
{
  const a = await at(30, 200)
  const b = await at(110, 280)
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  await page.mouse.move(b.x, b.y, { steps: 5 })
  await page.mouse.up()
}
await check('ellips getekend', async () => (await base()).layers.some((l) => l.shape?.kind === 'ellipse' && Math.abs(l.width - 80) <= 2))

// 7. Pen tool: driehoek met één bocht, gesloten
await page.keyboard.press('g')
for (const [x, y, drag] of [[200, 200], [270, 230, true], [210, 290]]) {
  const p = await at(x, y)
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  if (drag) await page.mouse.move(p.x + 25, p.y + 15, { steps: 3 })
  await page.mouse.up()
}
await shot('4-pen-tool')
{
  const p = await at(200, 200)
  await page.mouse.click(p.x, p.y)
}
await check('pen-vorm (gesloten, met bocht)', async () => {
  const v = (await base()).layers.find((l) => l.shape?.kind === 'path')
  return v && v.shape.path.closed && v.shape.path.d.includes('C')
})

// 8. Kopiëren en plakken via rechtermuisknop
{
  const p = await at(70, 240)
  await page.mouse.click(p.x, p.y, { button: 'right' })
  await menuItem('Kopiëren').click()
  const q = await at(280, 590)
  await page.mouse.click(q.x, q.y)
  await page.mouse.click(q.x, q.y, { button: 'right' })
  await menuItem('Plakken').click()
}
await check('kopiëren/plakken', async () => (await base()).layers.filter((l) => l.shape?.kind === 'ellipse').length === 2)
await page.locator('.timeline .ruler').click({ position: { x: 10 + 3 * 120, y: 10 } })
await shot('5-resultaat')

await page.getByRole('button', { name: 'Exporteren' }).first().click()
await page.getByRole('button', { name: /Exporteer \d+ banner/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.result').length >= 1, null, { timeout: 60000 })
console.log((await page.locator('.result .issues').allInnerTexts()).join('\n'))
// Testeinde: wijzigingen als opgeslagen markeren, anders vraagt de app terecht of je wilt opslaan
await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

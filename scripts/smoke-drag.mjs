// Rooktest: lagen verslepen in de tijdlijn en een SVG-bestand importeren.
import { _electron as electron } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const project = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project)))
const names = async () => (await project()).compositions[0].layers.map((l) => l.name)
const row = (name) => page.locator('.tl-name:not(.sub)').filter({ has: page.getByText(name, { exact: true }) }).first()

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
// Ruime tijdlijn, zodat alle rijen zichtbaar zijn
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await page.evaluate(() => {
  const d = window.__bsDock.getState()
  const col = d.root.children.find((c) => c.kind === 'split')
  d.resize(col.id, [0.35, 0.65])
})

/** Rij slepen met de muis, boven (before) of onder (after) een andere rij. */
const dragRow = async (from, to, where) => {
  const a = await row(from).boundingBox()
  const b = await row(to).boundingBox()
  await page.mouse.move(a.x + 80, a.y + a.height / 2)
  await page.mouse.down()
  const y = b.y + (where === 'before' ? 4 : b.height - 4)
  await page.mouse.move(b.x + 80, y, { steps: 8 })
  await page.mouse.move(b.x + 82, y, { steps: 2 })
  await page.waitForTimeout(100)
  await page.mouse.up()
}

// 1. Packshot boven Write-on slepen
await dragRow('Packshot (vervang door afbeelding)', 'Write-on', 'before')
const after = await names()
await check('Packshot boven Write-on gesleept', async () => after.indexOf('Packshot (vervang door afbeelding)') === after.indexOf('Write-on') - 1)
await dragRow('Write-on', 'Packshot (vervang door afbeelding)', 'before')
await check('en weer terug', async () => {
  const n = await names()
  return n.indexOf('Write-on') === n.indexOf('Packshot (vervang door afbeelding)') - 1
})

// 2. Subline in een compositie slepen
await row('CTA tekst').click()
await row('CTA').click({ modifiers: ['Shift'] })
await page.getByRole('button', { name: 'Nieuwe compositie' }).click()
await row('Comp 1').locator('button').first().click() // openklappen
await page.locator('.timeline .body').evaluate((el) => (el.scrollTop = 0))

await dragRow('logo.svg', 'CTA', 'before')
await check('logo in de compositie gesleept', async () => {
  const g = (await project()).compositions[0].layers.find((l) => l.type === 'group')
  return g.children.some((c) => c.name === 'logo.svg')
})

// 3. SVG importeren via de echte import (pad), zoals bij slepen vanuit de Finder
const svg = `${shots}/badge.svg`
await writeFile(svg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="50" cy="50" r="48" fill="#ffcc00"/><text x="50" y="58" font-size="26" text-anchor="middle" font-family="Arial" font-weight="bold">-30%</text></svg>')
const res = await page.evaluate(async ({ d, p }) => window.bs.importPaths(d, [p]), { d: dir, p: svg })
await page.evaluate(async (a) => {
  // zelfde stap als na een drop: laag maken van het nieuwe asset
  const s = window.__bsStore.getState()
  s.bumpAssets()
}, res.assets[0])
await page.locator('.dock-tab', { hasText: 'Assets' }).click()
await page.locator('.list-item', { hasText: 'badge.svg' }).click()
await page.locator('.choice-card', { hasText: 'Als afbeelding' }).click()
await page.waitForTimeout(400)
await check('SVG geïmporteerd als laag', async () => (await project()).compositions[0].layers.some((l) => l.image?.src === 'assets/badge.svg'))
await page.waitForTimeout(600)
await page.screenshot({ path: `${shots}/drag-svg.png` })

await page.getByRole('button', { name: 'Exporteren' }).first().click()
await page.getByRole('button', { name: /Exporteer \d+ banner/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.result').length >= 1, null, { timeout: 60000 })
console.log((await page.locator('.result .issues').allInnerTexts()).join('\n'))
await app.close()

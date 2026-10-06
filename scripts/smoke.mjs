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
const project = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project)))
const base = async () => (await project()).compositions[0]
const row = (name) => page.locator('.tl-name:not(.sub)').filter({ has: page.getByText(name, { exact: true }) }).first()

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. Tijdlijn hoger slepen
const split = page.locator('.splitter.h')
const sb = await split.boundingBox()
await page.mouse.move(sb.x + 200, sb.y + 2)
await page.mouse.down()
await page.mouse.move(sb.x + 200, sb.y - 120, { steps: 5 })
await page.mouse.up()
await check('tijdlijn hoger gesleept', async () => (await page.locator('.timeline').boundingBox()).height > 330)

// 2. CTA + CTA tekst groeperen via de inspector
await row('CTA tekst').click()
await row('CTA').click({ modifiers: ['Shift'] })
await page.getByRole('button', { name: 'Groeperen' }).click()
await check('groep gemaakt', async () => (await base()).layers.some((l) => l.type === 'group' && l.children.length === 2))

// 3. Bounce in op de groep (canvas) en groep openklappen
{
  const ov = await page.locator('.overlay').boundingBox()
  const g = await page.locator('.viewer .sel').first().boundingBox()
  await page.locator('.lib-tile', { hasText: 'Bounce in' }).dragTo(page.locator('.overlay'), {
    targetPosition: { x: g.x - ov.x + g.width / 2, y: g.y - ov.y + g.height / 2 }
  })
}
await check('bounce in op de groep', async () => (await base()).layers.find((l) => l.type === 'group')?.intro?.ease === 'bounceOut')
await row('Groep').locator('button').first().click()

// 4. Dupliceren en achter elkaar zetten
await row('Groep').click()
await page.getByRole('button', { name: 'Ontwerp' }).click()
await page.getByRole('button', { name: 'Dupliceren' }).click()
await row('Groep kopie').click()
await row('Groep').click({ modifiers: ['Shift'] })
await page.getByRole('button', { name: 'Achter elkaar' }).click()
await check('groepen achter elkaar', async () => {
  const gs = (await base()).layers.filter((l) => l.type === 'group')
  return gs.length === 2 && gs[1].start >= gs[0].end - 0.01
})

// 5. Headline-eigenschappen uitklappen met U
await row('Headline').click()
await page.keyboard.press('u')
await check('eigenschappen uitgeklapt', async () => (await page.locator('.tl-name.sub', { hasText: 'Positie Y' }).count()) > 0)
await page.locator('.timeline .ruler').click({ position: { x: 10 + 0.5 * 120, y: 10 } })
await shot('1-groepen-en-tijdlijn')

// 6. Preset opslaan
await page.getByRole('button', { name: 'Animatie', exact: true }).click()
await page.locator('input[placeholder="Naam voor preset…"]').fill('Mijn headline')
await page.getByRole('button', { name: 'Opslaan als preset' }).click()
await check('preset in bibliotheek', async () => (await page.locator('.lib-tile.custom', { hasText: 'Mijn headline' }).count()) === 1)

// 7. Font-kiezer
await page.getByRole('button', { name: 'Ontwerp' }).click()
await page.locator('.font-current').first().click()
await page.locator('.font-search input').fill('mont')
await page.waitForTimeout(400)
await shot('2-fontkiezer')
await page.locator('.font-row', { hasText: 'Georgia' }).count()
await page.locator('.font-search input').fill('geor')
await page.locator('.font-row', { hasText: 'Georgia' }).click()
await check('systeemfont gekozen', async () => {
  const p = await project()
  const h = p.compositions[0].layers.find((l) => l.name === 'Headline')
  return p.fonts.find((f) => f.id === h.text.fontId)?.family === 'Georgia'
})

// 8. clickTag
const ct = page.locator('.clicktag input')
await ct.fill('https://www.connect-create.nl/actie')
await ct.press('Enter')
await check('clickTag gezet', async () => (await project()).clickTag === 'https://www.connect-create.nl/actie')
await shot('3-overzicht')

await page.getByRole('button', { name: 'Exporteren' }).first().click()
await page.getByRole('button', { name: /Exporteer \d+ banner/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.result').length >= 1, null, { timeout: 60000 })
console.log((await page.locator('.result .issues').allInnerTexts()).join('\n'))
await app.close()

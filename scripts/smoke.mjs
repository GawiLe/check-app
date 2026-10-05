// Rooktest: start de gebouwde app, opent een testproject, doorloopt de hoofdflow en exporteert.
// Gebruik: npm run build && xvfb-run node scripts/smoke.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 }).catch(() => {})
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const shot = async (name) => {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}/${name}.png` })
}

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.waitForSelector('.welcome .list-item')
await shot('1-welkom')
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await page.locator('.timeline .ruler').click({ position: { x: 10 + 2.6 * 120, y: 10 } })
await shot('2-editor')

// Headline selecteren → Animatie-tab
await page.locator('.tl-name', { hasText: 'Headline' }).click()
await page.getByRole('button', { name: 'Animatie' }).click()
await shot('3-animatie-tab')

// Formaat 300x250 toevoegen
await page.locator('button[title="Formaat toevoegen"]').click()
await page.locator('.modal .list-item', { hasText: 'Medium Rectangle' }).click()
await page.locator('.timeline .ruler').click({ position: { x: 10 + 3.5 * 120, y: 10 } })
await shot('4-300x250')

// Terug naar basis, headline-tekst wijzigen → moet in 300x250 doorkomen
await page.locator('.formats button', { hasText: '300×600' }).click()
await page.locator('.tl-name', { hasText: 'Headline' }).click()
await page.getByRole('button', { name: 'Ontwerp' }).click()
const ta = page.locator('.inspector textarea').first()
await ta.fill('Zomer sale\nnu -30%')
await ta.blur()
await page.locator('.formats button', { hasText: 'Alle' }).click()
await shot('5-alle-formaten')

await page.getByRole('button', { name: 'Exporteren' }).click()
await page.locator('.modal label.check', { hasText: 'Google Ads' }).locator('input').check()
await page.getByRole('button', { name: /Exporteer \d+ banner/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.result').length >= 4, null, { timeout: 60000 })
await shot('6-export')
console.log((await page.locator('.result').allInnerTexts()).join('\n---\n'))
await app.close()

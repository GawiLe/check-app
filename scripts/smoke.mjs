// Rooktest: start de gebouwde app, opent een testproject, maakt screenshots en exporteert.
// Gebruik: npm run build && xvfb-run node scripts/smoke.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('console', (m) => console.log('[renderer]', m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.waitForSelector('.welcome')
await page.screenshot({ path: `${shots}/1-welkom.png` })

// project in de recente lijst zetten, herladen en via de UI openen
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app', { timeout: 10000 })
await page.waitForTimeout(1200)
await page.screenshot({ path: `${shots}/2-editor.png` })

// laag selecteren in de tijdlijn en uitklappen
await page.locator('.tl-name .grow', { hasText: 'Headline' }).click()
await page.locator('.tl-name', { hasText: 'Headline' }).locator('button.mini').first().click()
await page.locator('.timeline .ruler').click({ position: { x: 8 + 2.2 * 110, y: 10 } })
await page.waitForTimeout(400)
await page.screenshot({ path: `${shots}/3-writeon-2.2s.png` })

// formaat 300x250 afleiden van de basis
await page.getByRole('button', { name: '+ Formaat' }).click()
await page.locator('.modal .list-item', { hasText: 'Medium Rectangle' }).click()
await page.locator('.timeline .ruler').click({ position: { x: 8 + 4 * 110, y: 10 } })
await page.waitForTimeout(600)
await page.screenshot({ path: `${shots}/4-300x250.png` })

await page.getByRole('button', { name: 'Exporteren' }).click()
await page.locator('.modal label.check', { hasText: 'Google Ads' }).locator('input').check()
await page.getByRole('button', { name: /Exporteer \d+ banner/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.result').length >= 4, null, { timeout: 60000 })
await page.waitForTimeout(300)
await page.screenshot({ path: `${shots}/5-export.png` })
console.log(await page.locator('.result').allInnerTexts())
await app.close()

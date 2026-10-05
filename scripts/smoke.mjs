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

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. Bibliotheek: "Bounce in" op de CTA in de tijdlijn slepen (op 2s)
await page.locator('.lib-tile', { hasText: 'Bounce in' }).hover()
await shot('1-bibliotheek')
const track = page.locator('.tl-track').nth(3)
const box = await track.boundingBox()
await page.locator('.lib-tile', { hasText: 'Bounce in' }).dragTo(track, { targetPosition: { x: 10 + 2 * 120, y: box.height / 2 } })
await check('bounce in op CTA', async () => {
  const p = await project()
  const cta = p.compositions[0].layers.find((l) => l.name === 'CTA')
  return cta.intro?.ease === 'bounceOut' && Math.abs(cta.intro.start - 2) < 0.05
})
// Pulse op de CTA via het canvas
await page.locator('.lib-tile', { hasText: 'Pulse' }).dragTo(page.locator('.overlay'), { targetPosition: { x: 150 * 0.9, y: 548 * 0.9 } })
await check('pulse op CTA (canvas)', async () => (await project()).compositions[0].layers.find((l) => l.name === 'CTA')?.emphasis?.type === 'pulse')
await page.locator('.timeline .ruler').click({ position: { x: 10 + 2.5 * 120, y: 10 } })
await shot('2-animatie-na-slepen')

// 2. Formaat toevoegen, daar de headline groter maken (override)
await page.locator('button[title="Formaat toevoegen"]').click()
await page.locator('.modal .list-item', { hasText: 'Medium Rectangle' }).click()
await page.locator('.tl-name', { hasText: 'Headline' }).click()
await page.getByRole('button', { name: 'Ontwerp' }).click()
await page.evaluate(() => {
  const s = window.__bsStore.getState()
  const l = s.project.compositions.find((c) => c.id === s.compId).layers.find((x) => x.name === 'Headline')
  s.update((p) => (p.compositions.find((c) => c.id === s.compId).layers.find((x) => x.id === l.id).text.size = 22))
})
await shot('3-override')

// 3. Basis: tekst wijzigen → komt door, maar de grootte in 300x250 blijft 22
await page.locator('.formats button', { hasText: '300×600' }).click()
await page.locator('.tl-name', { hasText: 'Headline' }).click()
const ta = page.locator('.inspector textarea').first()
await ta.fill('Zomer sale\nnu -30%')
await ta.blur()
await check('tekst uit basis doorgezet, override blijft', async () => {
  const p = await project()
  const h = p.compositions[1].layers.find((l) => l.name === 'Headline')
  return h.text.content === 'Zomer sale\nnu -30%' && h.text.size === 22
})
await page.locator('.formats button', { hasText: 'Alle' }).click()
await shot('4-alle-formaten')

await page.getByRole('button', { name: 'Exporteren' }).click()
await page.getByRole('button', { name: /Exporteer \d+ banner/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.result').length >= 2, null, { timeout: 60000 })
console.log((await page.locator('.result .issues').allInnerTexts()).join('\n'))
await app.close()

// Rooktest: SVG importeren met keuzevenster (als afbeelding / als vormen).
import { _electron as electron } from 'playwright-core'
import { mkdir, writeFile } from 'node:fs/promises'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const project = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project)))
const base = async () => (await project()).compositions[0]

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 120" width="400" height="240">
  <defs><linearGradient id="g"><stop offset="0" stop-color="#ff3366"/><stop offset="1" stop-color="#ffcc00"/></linearGradient>
  <style>.blue{fill:#2266ff}</style></defs>
  <rect x="5" y="5" width="190" height="110" rx="14" fill="url(#g)"/>
  <g transform="translate(60 60) rotate(45)"><rect x="-20" y="-20" width="40" height="40" class="blue"/></g>
  <path d="M120 30a30 30 0 1 0 0.01 0zM120 45a15 15 0 1 1-0.01 0z" fill="#111" fill-rule="evenodd"/>
  <polygon points="170,20 190,60 150,60" fill="#00aa66" stroke="#004422" stroke-width="3"/>
  <text x="20" y="110">Tekst</text>
</svg>`
const file = `${shots}/badge.svg`
await writeFile(file, svg)

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// Bestand in het project zetten (zoals slepen op het linkerpaneel) en via de assets toevoegen
await page.evaluate(async ({ d, f }) => window.bs.importPaths(d, [f]), { d: dir, f: file })
await page.evaluate(() => window.__bsStore.getState().bumpAssets())
await page.locator('.left-tabs button', { hasText: 'Assets' }).click()
await page.evaluate(async () => {}) // assets verversen
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await page.locator('.left-tabs button', { hasText: 'Assets' }).click()

// 1. Als bewerkbare vormen
await page.locator('.list-item', { hasText: 'badge.svg' }).first().click()
await page.waitForSelector('.choice-card')
await page.waitForTimeout(300)
await page.screenshot({ path: `${shots}/svg-1-keuze.png` })
await page.locator('.choice-card', { hasText: 'Als bewerkbare vormen' }).click()
await page.waitForTimeout(800)
console.log('   status:', await page.evaluate(() => JSON.stringify(window.__bsStore.getState().status)))
console.log('   lagen:', (await base()).layers.map((l) => l.name + (l.children ? `(${l.children.length})` : '')).join(', '))
await check('SVG als vormen: compositie met 4 vormen', async () => {
  const g = (await base()).layers.find((l) => l.type === 'group' && l.name === 'badge.svg')
  if (!g) return false
  const kinds = g.children.map((c) => `${c.shape?.kind}:${c.shape?.fillRule}:${c.shape?.fill}`)
  console.log('   ', kinds.join(' | '))
  return g.children.length === 4 && g.children.every((c) => c.shape?.kind === 'path')
})
await check('verloop → eerste kleur, class-kleur, evenodd en lijn bewaard', async () => {
  const g = (await base()).layers.find((l) => l.name === 'badge.svg')
  const [poly, ring, square, bg] = g.children
  return bg.shape.fill === '#ff3366' && square.shape.fill === '#2266ff' && ring.shape.fillRule === 'evenodd' && poly.shape.strokeWidth > 0
})
await page.locator('.timeline .ruler').click({ position: { x: 10 + 3 * 120, y: 10 } })
await page.waitForTimeout(600)
await page.screenshot({ path: `${shots}/svg-2-vormen.png` })

// 2. Als afbeelding, met onthouden
await page.locator('.list-item', { hasText: 'badge.svg' }).first().click()
await page.locator('.modal label.check input').check()
await page.locator('.choice-card', { hasText: 'Als afbeelding' }).click()
await page.waitForTimeout(600)
await check('SVG als afbeelding', async () => (await base()).layers.some((l) => l.image?.src === 'assets/badge.svg'))
await page.locator('.list-item', { hasText: 'badge.svg' }).first().click()
await page.waitForTimeout(300)
await check('keuze onthouden (geen venster)', async () => (await page.locator('.choice-card').count()) === 0 && (await base()).layers.filter((l) => l.image?.src === 'assets/badge.svg').length === 2)

await page.getByRole('button', { name: 'Exporteren' }).first().click()
await page.getByRole('button', { name: /Exporteer \d+ banner/ }).click()
await page.waitForFunction(() => document.querySelectorAll('.result').length >= 1, null, { timeout: 60000 })
console.log((await page.locator('.result .issues').allInnerTexts()).join('\n'))
await app.close()

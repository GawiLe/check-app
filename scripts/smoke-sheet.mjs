// Rooktest: varianten uit CSV/Excel importeren en als CSV opslaan.
// Gebruik: npm run build && xvfb-run node scripts/smoke-sheet.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [dir, shots] = process.argv.slice(2)
await mkdir(join(shots, 'sheet'), { recursive: true })
const svg = (c) => `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="30"><rect width="120" height="30" fill="${c}"/></svg>`
await writeFile(join(shots, 'sheet', 'herfst.svg'), svg('#c60'))
const csv = join(shots, 'sheet', 'varianten.csv')
await writeFile(csv, '﻿Variant;Headline;logo.svg;Onbekend\r\nHerfst;"Herfstdeals\nTot 40%";herfst.svg;x\r\nLente;Lentekriebels;bestaat-niet.svg;\r\n')

const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const variants = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project.variants ?? null)))

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. Importeren vanaf stap 1 (nog geen velden gekozen)
await app.evaluate(({ dialog }, p) => void (dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })), csv)
await page.locator('button[title^="Varianten"]').click()
await page.getByRole('button', { name: /Uit CSV\/Excel/ }).click()
await page.waitForSelector('.variant-table')
await page.waitForTimeout(400)
await page.screenshot({ path: `${shots}/s1-import.png` })
await check('twee varianten uit de CSV, velden automatisch gekozen', async () => {
  const v = await variants()
  return v.variants.map((x) => x.name).join() === 'Herfst,Lente' && v.fields.length === 2
})
await check('tekst met regeleinde overgenomen', async () => {
  const v = await variants()
  return Object.values(v.variants[0].values).includes('Herfstdeals\nTot 40%')
})
await check('afbeelding naast de CSV naar assets/ gekopieerd', async () => {
  const v = await variants()
  return Object.values(v.variants[0].values).includes('assets/herfst.svg') && existsSync(join(dir, 'assets', 'herfst.svg'))
})
await check('melding: onbekende kolom en ontbrekende afbeelding', async () => {
  const t = await page.locator('.sheet-msg').innerText()
  return t.includes('Onbekend') && t.includes('bestaat-niet.svg')
})

// 2. Opnieuw importeren met dezelfde namen: bijwerken, niet dubbel
await writeFile(csv, 'Variant,Headline\nHerfst,Herfst 2.0\n')
await page.getByRole('button', { name: /Uit CSV\/Excel/ }).click()
await page.waitForTimeout(400)
await check('zelfde naam: variant bijgewerkt, logo blijft', async () => {
  const v = await variants()
  const h = v.variants.find((x) => x.name === 'Herfst')
  return v.variants.length === 2 && Object.values(h.values).includes('Herfst 2.0') && Object.values(h.values).includes('assets/herfst.svg')
})

// 3. Opslaan als CSV (sjabloon voor Excel)
const out = join(shots, 'sheet', 'uit.csv')
await app.evaluate(({ dialog }, p) => void (dialog.showSaveDialog = async () => ({ canceled: false, filePath: p })), out)
await page.getByRole('button', { name: /Opslaan als CSV/ }).click()
await page.waitForTimeout(400)
await check('CSV opgeslagen met kopregel en varianten', async () => {
  const text = await readFile(out, 'utf8')
  return text.startsWith('﻿Variant;') && text.includes('Herfst;') && text.includes('Lente;')
})

await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

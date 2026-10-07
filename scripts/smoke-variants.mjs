// Rooktest: varianten (template) — velden kiezen, waarden per variant, mappen aanmaken en exporteren.
// Gebruik: npm run build && xvfb-run node scripts/smoke-variants.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const svg = (w, h, c) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${c}"/></svg>`
await writeFile(`${dir}/assets/zomer.svg`, svg(120, 30, '#ff9900'))
await writeFile(`${shots}/winter.svg`, svg(120, 30, '#3399ff'))

const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const shot = async (name) => {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}/${name}.png` })
}
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const readProject = async (d) => JSON.parse(await readFile(join(d, 'project.bsproj'), 'utf8'))
const layersOf = (p) => p.compositions.flatMap((c) => c.layers)

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await page.evaluate(() =>
  window.__bsStore.getState().update((p) => {
    p.clickTag = 'https://www.makro.nl'
    p.targets = ['cm360']
  })
)
const original = await page.evaluate(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project)))
const headline0 = original.compositions[0].layers.find((l) => l.name === 'Headline').text.content

// 1. Velden kiezen
await page.locator('button[title^="Varianten"]').click()
await page.locator('.variant-field', { hasText: 'Headline' }).locator('input').check()
await page.locator('.variant-field', { hasText: 'logo.svg' }).locator('input').check()
await shot('v1-velden')
await page.getByRole('button', { name: /Verder \(2 velden\)/ }).click()

// 2. Variant 1 "Zomer": andere headline en logo uit de assets
const head = page.locator('.variant-col-head input')
await head.first().fill('Zomer')
const rowOf = (label) => page.locator('.variant-table tbody tr').filter({ has: page.locator('td.variant-label', { hasText: label }) })
await rowOf('Headline').locator('textarea').first().fill('Zomeractie!\nNu 20% korting')
await rowOf('logo.svg').locator('.variant-image-btn').first().click()
await page.locator('.variant-pop .replace-tile', { hasText: 'zomer.svg' }).click()

// 3. Variant 2 "Winter": alleen het logo, via uploaden uit een map
await page.getByRole('button', { name: 'Variant', exact: true }).click()
await head.nth(1).fill('Winter')
await app.evaluate(({ dialog }, p) => {
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [p] })
}, `${shots}/winter.svg`)
await rowOf('logo.svg').locator('.variant-image-btn').nth(1).click()
await page.locator('.variant-pop button', { hasText: 'Uploaden uit map' }).click()
await page.waitForTimeout(600)
await shot('v2-varianten')
await check('waarden per variant in het project bewaard', async () => {
  const v = await page.evaluate(() => window.__bsStore.getState().project.variants)
  return v.fields.length === 2 && v.variants.length === 2 && Object.keys(v.variants[0].values).length === 2 && Object.keys(v.variants[1].values).length === 1
})

// 4. Aanmaken en exporteren
await page.getByRole('button', { name: /2 variant\(en\) aanmaken/ }).click()
await page.waitForSelector('.variant-results .result', { timeout: 120000 })
await page.waitForTimeout(300)
await shot('v3-resultaat')
const parent = dirname(dir)
const zomer = join(parent, `${basename(dir)}-zomer`)
const winter = join(parent, `${basename(dir)}-winter`)
await check('twee projectmappen naast het origineel', async () => existsSync(join(zomer, 'project.bsproj')) && existsSync(join(winter, 'project.bsproj')))
await check('Zomer: andere headline en logo in alle formaten', async () => {
  const p = await readProject(zomer)
  const heads = layersOf(p).filter((l) => l.name === 'Headline')
  const logos = layersOf(p).filter((l) => l.image)
  return heads.every((l) => l.text.content === 'Zomeractie!\nNu 20% korting') && logos.every((l) => l.image.src === 'assets/zomer.svg') && p.name.endsWith('– Zomer')
})
await check('Winter: zelfde headline, geüpload logo (ook in assets/)', async () => {
  const p = await readProject(winter)
  return (
    layersOf(p).find((l) => l.name === 'Headline').text.content === headline0 &&
    layersOf(p).find((l) => l.image).image.src === 'assets/winter.svg' &&
    existsSync(join(winter, 'assets', 'winter.svg'))
  )
})
await check('elke variant meteen geëxporteerd (zip + backup)', async () => {
  for (const d of [zomer, winter]) {
    const files = await readdir(join(d, 'export', 'cm360'))
    if (!files.some((f) => f.endsWith('.zip')) || !files.some((f) => f.endsWith('.jpg'))) return false
  }
  return true
})
await check('export Zomer bevat de nieuwe tekst en het nieuwe logo', async () => {
  const folder = (await readdir(join(zomer, 'export', 'cm360'))).find((f) => !f.includes('.'))
  const html = await readFile(join(zomer, 'export', 'cm360', folder, 'index.html'), 'utf8')
  return html.includes('Zomeractie!') && html.includes('zomer.svg')
})
await check('origineel ongewijzigd (alleen de variantinstellingen erbij)', async () => {
  const p = await readProject(dir)
  return p.compositions[0].layers.find((l) => l.name === 'Headline').text.content === headline0 && p.variants?.variants.length === 2
})

// 5. Variant openen vanuit het resultaat
await page.locator('.variant-results .result', { hasText: 'Zomer' }).getByRole('button', { name: 'Openen' }).click()
await page.waitForTimeout(1200)
await check('variant geopend als eigen project', async () => (await page.evaluate(() => window.__bsStore.getState().dir)) === zomer)
await shot('v4-variant-open')
await app.close()

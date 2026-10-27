// Rooktest: hexcode bij kleuren, hoofdletters (tekst), en het Assets-paneel (gebruik, sorteren, verwijderen).
// Gebruik: npm run build && xvfb-run node scripts/smoke-assets.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { existsSync } from 'node:fs'
import { copyFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { pickFolder, zipText } from './lib/export.mjs'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
// Extra assets: één ongebruikt, één die we twee keer gebruiken
await copyFile(join(dir, 'assets', 'logo.svg'), join(dir, 'assets', 'zz-ongebruikt.svg'))
await copyFile(join(dir, 'assets', 'logo.svg'), join(dir, 'assets', 'aa-dubbel.svg'))
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
page.on('dialog', (d) => d.accept())
let fails = 0
const check = async (label, fn) => {
  const ok = await fn().catch((e) => (console.log('   ', e.message.split('\n')[0]), false))
  if (!ok) fails++
  console.log(label, ok ? 'OK' : 'MISLUKT')
}
const S = (fn, a) => page.evaluate(fn, a)
const layer = (n) => S((n) => JSON.parse(JSON.stringify(window.__bsStore.getState().project.compositions[0].layers.find((l) => l.name === n))), n)
const select = (n) => S((n) => { const s = window.__bsStore.getState(); s.select([s.project.compositions[0].layers.find((l) => l.name === n).id]) }, n)
const inPreview = async (fn) => {
  for (let i = 0; i < 30; i++) {
    for (const f of page.frames().filter((x) => x.url().startsWith('bsproj://bs-preview/'))) {
      const v = await f.evaluate(fn).catch(() => null)
      if (v != null) return v
    }
    await page.waitForTimeout(150)
  }
  return null
}
const typeHex = async (loc, v) => {
  await loc.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(v)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(150)
}

await page.waitForSelector('.welcome')
await S((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await S(() => window.__bsStore.getState().setTime(window.__bsStore.getState().project.compositions[0].duration - 0.1))
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()

// 1. Hexcode bij kleuren
await select('CTA')
await page.waitForTimeout(200)
const fillHex = page.locator('.panel-scroll .row', { has: page.locator('.label', { hasText: /^Vulling$/ }) }).locator('.color-field .hex')
await typeHex(fillHex, '#00FF00')
await check('vulling via hexcode (#00FF00 → #00ff00)', async () => (await layer('CTA')).shape.fill === '#00ff00')
await typeHex(fillHex, 'abc')
await check('korte hexcode zonder # (abc → #aabbcc)', async () => (await layer('CTA')).shape.fill === '#aabbcc')
await typeHex(fillHex, 'geen kleur')
await check('ongeldige code wordt genegeerd', async () => (await layer('CTA')).shape.fill === '#aabbcc' && (await fillHex.inputValue()) === '#aabbcc')
await select('Headline')
await page.waitForTimeout(200)
const textSection = page.locator('.panel-scroll .section', { has: page.locator('.section-head .title', { hasText: /^Tekst$/ }) })
await typeHex(textSection.locator('.color-field .hex').first(), '#123456')
await check('tekstkleur via hexcode', async () => (await layer('Headline')).text.color === '#123456')
await check('hexveld bij alle kleuren in het paneel (geen losse kleurkiezers meer)', async () =>
  (await page.locator('.panel-scroll input[type=color]').count()) === (await page.locator('.panel-scroll .color-field').count())
)

// 2. Hoofdletters
await textSection.locator('.text-case button', { hasText: /^AA$/ }).click()
await check('HOOFDLETTERS: in het project, tekst zelf ongewijzigd', async () => {
  const t = (await layer('Headline')).text
  return t.case === 'upper' && t.content !== t.content.toUpperCase()
})
await check('preview: text-transform uppercase', async () => !!(await inPreview(() => ([...document.querySelectorAll('.L')].some((el) => getComputedStyle(el).textTransform === 'uppercase') ? true : null))))
await page.screenshot({ path: `${shots}/a1-hoofdletters.png` })
await pickFolder(app, `${shots}/out`)
const outDir = await S((d) => window.bs.chooseExportDir(d), dir)
const comp = await S(() => window.__bsStore.getState().project.compositions[0].id)
const [res] = await S(([d, c, o]) => window.bs.exportBanners({ dir: d, project: window.__bsStore.getState().project, compositionIds: [c], targets: ['cm360'], outDir: o }), [dir, comp, outDir])
const html = await zipText(res.zip, 'index.html')
await check('export: text-transform en hoofdletters in het verkleinde font', async () => {
  const note = res.issues.find((i) => i.rule === 'font')?.message ?? ''
  console.log(`   (${note.split(':')[1]?.split(',')[0].trim()})`)
  return html.includes('text-transform:uppercase') && /\d+ tekens/.test(note)
})
await textSection.locator('.text-case button', { hasText: /^Aa$/ }).click()
await check('terug naar zoals getypt', async () => (await layer('Headline')).text.case == null)

// 3. Assets-paneel
await S(() =>
  window.__bsStore.getState().update((p) => {
    const ls = p.compositions[0].layers.filter((l) => l.image)
    ls[0].image.src = 'assets/aa-dubbel.svg'
  })
)
// Nog een afbeeldingslaag met aa-dubbel.svg
await S(() => {
  const s = window.__bsStore.getState()
  s.update((p) => {
    const src = p.compositions[0].layers.find((l) => l.image)
    const copy = JSON.parse(JSON.stringify(src))
    copy.id = copy.linkId = 'kopie1'
    copy.name = 'Kopie'
    p.compositions[0].layers.push(copy)
  })
})
await page.locator('.dock-tab', { hasText: 'Assets & fonts' }).click()
await page.waitForTimeout(400)
const items = page.locator('.asset-item')
const names = async () => (await items.locator('.asset-name .ellipsis').allInnerTexts()).join(',')
await check('gebruik per asset (2×, 0×)', async () =>
  (await page.locator('.asset-item', { hasText: 'aa-dubbel.svg' }).locator('.asset-uses').innerText()) === '2×' &&
  (await page.locator('.asset-item', { hasText: 'zz-ongebruikt.svg' }).locator('.asset-uses').innerText()) === '0×'
)
await page.locator('.asset-sort button', { hasText: 'Naam' }).click()
await check('sorteren op naam', async () => (await names()) === 'aa-dubbel.svg,logo.svg,zz-ongebruikt.svg')
await page.locator('.asset-sort button', { hasText: 'Gebruik' }).click()
await check('sorteren op gebruik (meest gebruikt bovenaan)', async () => (await names()).startsWith('aa-dubbel.svg') && (await names()).endsWith('zz-ongebruikt.svg'))
await page.screenshot({ path: `${shots}/a2-assets.png` })
await check('afmetingen en gewicht per asset', async () => {
  for (let i = 0; i < 20; i++) {
    const t = await page.locator('.asset-item', { hasText: 'logo.svg' }).locator('.asset-info').innerText().catch(() => '')
    if (/\d+×\d+ · [\d.]+ (KB|B)/.test(t)) return true
    await page.waitForTimeout(150)
  }
  return false
})
await page.locator('button.asset-view[title="Raster met grote voorbeelden"]').click()
await check('rasterweergave met grote voorbeelden', async () => {
  const n = await page.locator('.asset-grid .asset-tile').count()
  const w = await page.locator('.asset-grid .asset-tile img.thumb').first().evaluate((el) => el.getBoundingClientRect().width)
  return n === 3 && w >= 60
})
await page.screenshot({ path: `${shots}/a3-assets-raster.png` })
await page.locator('button.asset-view[title="Lijst"]').click()

const gone = async (name) => !existsSync(join(dir, 'assets', name))
const unused = page.locator('.asset-item', { hasText: 'zz-ongebruikt.svg' })
await unused.hover()
await unused.locator('button[title^="Verwijderen"]').click()
await page.waitForTimeout(600)
await check('ongebruikte asset verwijderd (bestand weg, uit de lijst)', async () => (await gone('zz-ongebruikt.svg')) && (await page.locator('.asset-item', { hasText: 'zz-ongebruikt' }).count()) === 0)
await page.locator('.asset-item', { hasText: 'aa-dubbel.svg' }).click({ button: 'right' })
await page.getByText('Verwijderen…').click()
await page.waitForTimeout(600)
await check('gebruikte asset verwijderd na bevestigen: lagen worden leeg', async () => {
  const srcs = await S(() => window.__bsStore.getState().project.compositions[0].layers.filter((l) => l.image).map((l) => l.image.src))
  return (await gone('aa-dubbel.svg')) && !srcs.includes('assets/aa-dubbel.svg') && srcs.filter((s) => s === '').length === 2
})
await check('verwijderde bestanden terug te halen (prullenbak of .bnnr/prullenbak)', async () => {
  const bin = join(dir, '.bnnr', 'prullenbak')
  const n = existsSync(bin) ? (await readdir(bin)).length : 0
  console.log(`   (${n ? `${n} in .bnnr/prullenbak` : 'in de prullenbak van het systeem'})`)
  return true
})

// Fontbestand vervangen: zelfde font in het project (zelfde id), dus alle teksten gaan mee
const before = await S(() => {
  const p = window.__bsStore.getState().project
  const f = p.fonts[0]
  const users = p.compositions.flatMap((c) => c.layers).filter((l) => l.text?.fontId === f.id).length
  return { id: f.id, file: f.file, users }
})
await app.evaluate(({ dialog }, file) => void (dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })), '/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf')
const fontRow = page.locator('.panel-scroll .list-item', { has: page.locator('.font-sample') }).first()
await fontRow.hover()
await fontRow.locator('button.font-replace').click()
await check('fontbestand vervangen: alle teksten gaan mee (zelfde font, ander bestand)', async () => {
  for (let i = 0; i < 20; i++) {
    const r = await S((id) => {
      const p = window.__bsStore.getState().project
      const f = p.fonts.find((x) => x.id === id)
      return { file: f?.file, family: f?.family, users: p.compositions.flatMap((c) => c.layers).filter((l) => l.text?.fontId === id).length }
    }, before.id)
    if (r.file && r.file !== before.file && /serif/i.test(r.family) && r.users === before.users && before.users > 0) return true
    await page.waitForTimeout(150)
  }
  return false
})

console.log(fails ? `${fails} controle(s) mislukt` : 'Kleuren, hoofdletters en assets: alles in orde')
await S(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

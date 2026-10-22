// Doorlooptest (sanity) van begin tot eind, zoals een gebruiker werkt:
// nieuw (leeg) project → lagen maken en bewerken → formaten afleiden en per formaat aanpassen →
// overzicht → blokken schikken → exporteren → varianten.
// Gebruik: npm run build && xvfb-run node scripts/smoke-flow.mjs <lege-werkmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { pickFolder, zipText } from './lib/export.mjs'

const [work, shots] = process.argv.slice(2)
// Nieuw project krijgt zelf een map met de projectnaam in de gekozen locatie
const dir = join(work, 'Zomeractie')
await mkdir(work, { recursive: true })
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
let fails = 0
const check = async (label, fn) => {
  const ok = await fn().catch((e) => (console.log('   ', e.message.split('\n')[0]), false))
  if (!ok) fails++
  console.log(label, ok ? 'OK' : 'MISLUKT')
}
const shot = async (name) => {
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${shots}/${name}.png` })
}
const S = (fn, arg) => page.evaluate(fn, arg)
const project = () => S(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project)))
const compBy = async (w, h) => (await project()).compositions.find((c) => c.width === w && c.height === h)
const layerIn = async (w, h, name) => (await compBy(w, h))?.layers.find((l) => l.name === name)
const selectByName = (name) => S((n) => {
  const s = window.__bsStore.getState()
  const c = s.project.compositions.find((x) => x.id === s.compId)
  s.select([c.layers.find((l) => l.name === n).id])
}, name)
const goFormat = async (label) => {
  await page.locator('.fp-item', { hasText: label }).first().click()
  await page.waitForTimeout(250)
}
const waitFor = async (fn, tries = 40) => {
  for (let i = 0; i < tries; i++) {
    if (await fn().catch(() => false)) return true
    await page.waitForTimeout(150)
  }
  return false
}

// 1. Nieuw project: standaard leeg
await page.waitForSelector('.welcome')
await app.evaluate(({ dialog }, d) => void (dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })), work)
await page.getByRole('button', { name: /Nieuw project/ }).click()
await page.locator('.modal input').first().fill('Zomeractie')
await check('nieuw-venster: "Leeg" staat bovenaan en is gekozen', async () => (await page.locator('.modal .list-item.active').innerText()).includes('Leeg'))
await page.getByRole('button', { name: /Kies locatie en maak aan/ }).click()
await page.waitForSelector('.app')
await check('nieuw project in een eigen map (Zomeractie), zonder export-map', async () =>
  existsSync(join(dir, 'project.bsproj')) && !existsSync(join(dir, 'export')) && (await S(() => window.__bsStore.getState().dir)) === dir
)
await check('nieuw project is leeg (alleen de basis 300×600)', async () => {
  const p = await project()
  return p.compositions.length === 1 && p.compositions[0].layers.length === 0 && p.compositions[0].width === 300
})
await check('paneel Formaten staat in de werkruimte', async () => (await page.locator('.fp-item').count()) === 1)

// 2. Lagen maken: tekstvak trekken (T) en rechthoek (Q)
const vb = await page.locator('.viewer').boundingBox()
const zoom = await S(() => window.__bsStore.getState().zoom)
const drag = async (x, y, w, h) => {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + w, y + h, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(200)
}
await page.locator('.viewer').click({ position: { x: 5, y: 5 } })
await page.keyboard.press('KeyQ')
await drag(vb.x + vb.width / 2 - 60, vb.y + vb.height / 2 + 40, 120, 40)
await page.keyboard.press('KeyT')
await drag(vb.x + vb.width / 2 - 80, vb.y + vb.height / 2 - 120, 160, 50)
await check('tekst- en vormlaag gemaakt met T en Q', async () => {
  const l = (await project()).compositions[0].layers
  return l.length === 2 && l.some((x) => x.type === 'text') && l.some((x) => x.type === 'shape')
})
await page.keyboard.press('Escape')
await S(() => {
  const s = window.__bsStore.getState()
  s.update((p) => {
    const ls = p.compositions[0].layers
    ls.find((l) => l.type === 'text').name = 'Headline'
    ls.find((l) => l.type === 'shape').name = 'Knop'
  })
})

// Tekst via het paneel Ontwerp
await selectByName('Headline')
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
const ta = page.locator('.panel-scroll textarea').first()
await ta.fill('Zomer!')
await ta.blur()
await check('tekst aangepast via het paneel', async () => (await layerIn(300, 600, 'Headline')).text.content === 'Zomer!')
await check('tekstuitlijning met de gewone iconen', async () => (await page.locator('.panel-scroll .seg button svg.lucide-align-center').count()) === 1)

// 3. Waarden in de tijdlijn: P → X typen; S → schaal "100 🔗 100"
await page.locator('.tl-name', { hasText: 'Headline' }).first().click()
await page.keyboard.press('KeyP')
const xField = page.locator('.tl-name.sub .tl-val input').first()
await xField.click()
await page.keyboard.press('Control+A')
await page.keyboard.type('50')
await page.keyboard.press('Enter')
await check('positie X bewerkt in de tijdlijn', async () => (await layerIn(300, 600, 'Headline')).x === 50)
await page.keyboard.press('KeyS')
await check('schaal toont X 🔗 Y (100% 🔗 100%)', async () => {
  const vals = await page.locator('.tl-name.sub .tl-val input').evaluateAll((els) => els.map((e) => e.value))
  return vals.length === 2 && vals.every((v) => v === '100%') && (await page.locator('.tl-name.sub .tl-link').count()) === 1
})
await page.keyboard.press('KeyS')
await shot('f1-basis')

// 4. Formaten: 300×250 van de basis, 336×280 met de lay-out van 300×250
await page.locator('.fp-head button[title="Formaat toevoegen"]').click()
await page.locator('.modal .list-item', { hasText: '300×250' }).first().click()
await page.waitForTimeout(300)
await check('300×250 afgeleid: zelfde lagen als de basis', async () => (await compBy(300, 250))?.layers.length === 2)

// In 300×250: Knop verplaatsen (alleen hier), Headline verbergen met het oogje, eigen laag toevoegen
await goFormat('300×250')
await selectByName('Knop')
await S(() => window.__bsStore.getState().update((p) => {
  const s = window.__bsStore.getState()
  const c = p.compositions.find((x) => x.id === s.compId)
  c.layers.find((l) => l.name === 'Knop').x = 7
}))
await page.locator('.tl-name', { hasText: 'Headline' }).first().locator('.tl-eye').click()
await page.locator('.viewer').click({ position: { x: 5, y: 5 } })
await page.keyboard.press('KeyQ')
await drag(vb.x + vb.width / 2 + 40, vb.y + vb.height / 2 - 20, 40, 40)
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
await check('300×250: aangepaste laag geel, eigen laag blauwgroen', async () =>
  (await page.locator('.tl-name.overridden', { hasText: 'Knop' }).count()) === 1 &&
  (await page.locator('.tl-name.overridden', { hasText: 'Headline' }).count()) === 1 &&
  (await page.locator('.tl-name.own').count()) === 1
)
await check('formatenpaneel telt de aanpassingen', async () => (await page.locator('.fp-item', { hasText: '300×250' }).locator('.fp-badge.changed').innerText()).trim() === '2' && (await page.locator('.fp-item', { hasText: '300×250' }).locator('.fp-badge.own').innerText()).trim() === '+1')
await check('basis onveranderd (verbergen en verplaatsen alleen in 300×250)', async () => {
  const k = await layerIn(300, 600, 'Knop')
  const h = await layerIn(300, 600, 'Headline')
  return k.x !== 7 && h.visible && (await compBy(300, 600)).layers.length === 2
})
await shot('f2-300x250')

// 5. In de basis de tekst wijzigen: gaat door naar 300×250 (tekst niet aangepast), verplaatsing blijft
await goFormat('300×600')
await selectByName('Headline')
await ta.fill('Zomerdeals!')
await ta.blur()
await check('basis → 300×250: nieuwe tekst doorgezet, eigen aanpassingen blijven', async () => {
  const h = await layerIn(300, 250, 'Headline')
  const k = await layerIn(300, 250, 'Knop')
  return h.text.content === 'Zomerdeals!' && !h.visible && k.x === 7
})

// 6. 336×280 met de lay-out van 300×250 als uitgangspunt
await page.locator('.fp-head button[title="Formaat toevoegen"]').click()
const fromId = (await compBy(300, 250)).id
await page.locator('.modal select').first().selectOption(fromId)
await page.locator('.modal .list-item', { hasText: '336×280' }).first().click()
await page.waitForTimeout(300)
await check('336×280 neemt de lay-out van 300×250 over (verborgen, eigen laag, verplaatst)', async () => {
  const c = await compBy(336, 280)
  const h = c.layers.find((l) => l.name === 'Headline')
  const k = c.layers.find((l) => l.name === 'Knop')
  return c.layers.length === 3 && !h.visible && k.x < 20
})

// 7. Formaat uitzetten; overzicht toont per formaat zijn eigen banner
await page.locator('.fp-item', { hasText: '336×280' }).locator('input[type=checkbox]').uncheck()
await page.locator('.fp-head').getByRole('button', { name: /Alle formaten/ }).click()
await check('overzicht: alleen de aangevinkte formaten', async () => waitFor(async () => (await page.locator('.overview .tile').count()) === 2))
await check('overzicht: elk formaat toont zijn eigen banner (niet allemaal dezelfde)', async () =>
  waitFor(async () => {
    const titles = new Set()
    for (const f of page.frames().filter((x) => x.url().startsWith('bsproj://bs-preview/'))) {
      const t = await f.evaluate(() => document.title).catch(() => '')
      if (t) titles.add(t.replace(/^.* /, ''))
    }
    return titles.has('300x600') && titles.has('300x250')
  })
)
await shot('f3-overzicht')
await page.locator('.fp-head').getByRole('button', { name: /Alle formaten/ }).click()
await goFormat('300×600')

// 8. Blokken in het paneel Ontwerp zelf schikken
await selectByName('Headline')
await page.waitForTimeout(200)
const order = (t) => page.locator('.panel-scroll .section', { has: page.locator('.section-head .title', { hasText: new RegExp(`^${t}$`) }) }).first().evaluate((el) => Number(getComputedStyle(el).order))
const top = (t) => page.locator('.panel-scroll .section', { has: page.locator('.section-head .title', { hasText: new RegExp(`^${t}$`) }) }).first().evaluate((el) => el.getBoundingClientRect().top)
const tekstHead = page.locator('.panel-scroll .section-head', { hasText: /^Tekst$/ }).first()
await page.locator('.panel-scroll .section-head', { hasText: /^Transform$/ }).first().dragTo(tekstHead, { targetPosition: { x: 20, y: 2 } })
await check('blok "Transform" boven "Tekst" gesleept (en onthouden)', async () => (await top('Transform')) < (await top('Tekst')) && (await order('Transform')) < 1000)

// 9. Exporteren: map met de projectnaam, per platform; uitleg per platform
await page.getByRole('button', { name: 'Exporteren', exact: true }).click()
await page.locator('.modal .target-row', { hasText: 'Azerion' }).click()
await check('exportvenster legt het platform uit', async () => (await page.locator('.target-info').innerText()).includes('advertentieplatform'))
await shot('f4-export')
const out = join(work, 'export-hier')
await pickFolder(app, out)
await page.locator('.modal .actions .primary').click()
await page.waitForSelector('.modal .result', { timeout: 120000 })
await check('exportmap staat in het venster', async () => (await page.locator('.export-dest').innerText()).includes('export-hier'))
// Eén platform → geen submap met de platformnaam
const cm = join(out, 'Zomeractie')
await check('export in <gekozen map>/Zomeractie (zip + backup per formaat)', async () => {
  const files = await readdir(cm)
  return files.filter((f) => f.endsWith('.zip')).length === 2 && files.includes('Zomeractie_300x250px.zip') && files.includes('Zomeractie_300x250px.jpg') && files.every((f) => /\.(zip|jpg)$/.test(f))
})
await check('uitgezet formaat niet geëxporteerd', async () => !(await readdir(cm)).some((f) => f.includes('336x280')))
await check('in 300×250: Headline verborgen in de export', async () => {
  const html = await zipText(join(cm, 'Zomeractie_300x250px.zip'), 'index.html')
  return !html.includes('Zomerdeals!') && (await zipText(join(cm, 'Zomeractie_300x600px.zip'), 'index.html')).includes('Zomerdeals!')
})
await check('geen export-map in de projectmap', async () => !existsSync(join(dir, 'export')))
await page.keyboard.press('Escape')

// 10. Varianten: headline per variant, aanmaken en exporteren
await page.locator('button[title^="Varianten"]').click()
await page.locator('.variant-field', { hasText: 'Headline' }).locator('input').check()
// Per formaat: drie formaten; 336×280 niet variabel
const hw = page.locator('.variant-field-wrap', { hasText: 'Headline' })
await hw.getByRole('button', { name: 'Per formaat' }).click()
await check('varianten: veld per formaat, alle drie de formaten', async () => (await hw.locator('.variant-format').count()) === 3)
await hw.locator('.variant-format', { hasText: '336×280' }).locator('input').uncheck()
await page.getByRole('button', { name: /Verder/ }).click()
await check('stap 2: formaat per rij zichtbaar', async () => (await page.locator('.variant-table .variant-size').allInnerTexts()).join() === '300×600,300×250')
await page.screenshot({ path: `${shots}/f5-varianten.png` })
await check('stap 2: een rij per gekozen formaat', async () => (await page.locator('.variant-table tbody tr').count()) === 2)
await page.locator('.variant-col-head input').first().fill('Winter')
await page.locator('.variant-table tbody tr').first().locator('textarea').first().fill('Winterdeals!')
await page.getByRole('button', { name: /variant\(en\) aanmaken/ }).click()
await page.waitForSelector('.variant-results .result', { timeout: 120000 })
const variantDir = join(work, 'Zomeractie-winter')
await check('variant in dezelfde bovenliggende map', async () => existsSync(join(variantDir, 'project.bsproj')))
await check('variant geëxporteerd met eigen tekst (in de gekozen exportmap)', async () => {
  const exp = join(out, 'Zomeractie-Winter')
  return (await zipText(join(exp, 'Zomeractie-Winter_300x600px.zip'), 'index.html')).includes('Winterdeals!') && !(await readdir(exp)).some((f) => f.includes('336x280'))
})
await check('variant per formaat: 300×600 nieuwe tekst, 300×250 leeg = origineel, alle formaten aanwezig', async () => {
  const p = JSON.parse(await readFile(join(variantDir, 'project.bsproj'), 'utf8'))
  const head = (w, h) => p.compositions.find((c) => c.width === w && c.height === h).layers.find((l) => l.name === 'Headline').text.content
  return p.compositions.length === 3 && head(300, 600) === 'Winterdeals!' && head(300, 250) === 'Zomerdeals!' && head(336, 280) === 'Zomerdeals!'
})
await check('variant als tabblad geopend', async () => (await page.locator('.doc-tab').count()) === 2)
await page.keyboard.press('Escape')

// 11. Opslaan en heropenen: alles bewaard
await S(async () => { const s = window.__bsStore.getState(); await window.bs.saveProject(s.dir, s.project); s.markSaved() })
await page.waitForTimeout(500)
await check('opgeslagen: formaten, uitgezet formaat en aanpassingen op schijf', async () => {
  const p = JSON.parse(await readFile(join(dir, 'project.bsproj'), 'utf8'))
  const c250 = p.compositions.find((c) => c.width === 300 && c.height === 250)
  return p.compositions.length === 3 && p.compositions.find((c) => c.width === 336).disabled === true && c250.layers.find((l) => l.name === 'Knop').overrides.includes('x')
})

console.log(fails ? `${fails} controle(s) mislukt` : 'Doorlooptest: alles in orde')
await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

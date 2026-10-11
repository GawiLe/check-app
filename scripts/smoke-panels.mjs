// Rooktest: animeren met keyframes (presets zetten keyframes, geen binnenkomst/uitgang meer)
// en panelen loskoppelen naar een eigen venster.
// Gebruik: npm run build && xvfb-run node scripts/smoke-panels.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const launch = () => electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
let app = await launch()
let page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
let fails = 0
const check = async (label, fn) => {
  const ok = await fn().catch((e) => (console.log('   ', e.message.split('\n')[0]), false))
  if (!ok) fails++
  console.log(label, ok ? 'OK' : 'MISLUKT')
}
const project = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project)))
const layer = async (name) => (await project()).compositions[0].layers.find((l) => l.name === name)
const select = (name) =>
  page.evaluate((n) => {
    const s = window.__bsStore.getState()
    s.select([s.project.compositions[0].layers.find((l) => l.name === n).id])
  }, name)
const waitFor = async (fn, tries = 40, p = page) => {
  for (let i = 0; i < tries; i++) {
    if (await fn().catch(() => false)) return true
    await p.waitForTimeout(150)
  }
  return false
}

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. Bestaand project (met binnenkomst/uitgang in het bestand) is omgezet naar keyframes
await check('geopend project: geen binnenkomst/accent/uitgang meer, alles keyframes', async () => {
  const ls = (await project()).compositions.flatMap((c) => c.layers)
  return ls.every((l) => !l.intro && !l.outro && !l.emphasis) && ls.some((l) => l.tracks.opacity?.length)
})
await check('tijdlijn: geen IN/UIT-blokken meer', async () => (await page.locator('.seg-motion').count()) === 0)

// 2. Paneel Animatie: alleen keyframes (geen binnenkomst-/uitgang-kaarten)
await select('Subline')
await page.locator('.dock-tab', { hasText: /^Animatie$/ }).click()
await check('paneel Animatie: geen Binnenkomst/Accent/Uitgang', async () => {
  const motion = page.locator('.dock-tabs', { has: page.locator('.dock-tab.on', { hasText: /^Animatie$/ }) })
  const titles = await motion.locator('.panel-scroll .section-head .title').allInnerTexts()
  return titles.some((t) => t.includes('Keyframes')) && !titles.some((t) => /Binnenkomst|Uitgang|Accent/.test(t))
})

// 3. Preset klikken: keyframes vanaf de playhead
await page.evaluate(() => window.__bsStore.getState().setTime(2))
const before = (await layer('Subline')).tracks.x?.length ?? 0
await page.locator('.dock-tab', { hasText: /^Animaties$/ }).click()
await page.locator('.lib-tile', { hasText: 'Slide in links' }).click()
await check('preset "Slide in links": X-keyframes vanaf de playhead (2s)', async () => {
  const l = await layer('Subline')
  return !l.intro && l.tracks.x?.length === before + 2 && l.tracks.x.some((k) => Math.abs(k.t - 2) < 0.001)
})
await check('keyframes direct zichtbaar in de tijdlijn', async () => (await page.locator('.tl-name.sub', { hasText: 'Positie' }).count()) > 0)

// 4. Paneel Ontwerp loskoppelen naar een eigen venster
await page.locator('.dock-tab', { hasText: /^Ontwerp$/ }).click()
const group = page.locator('.dock-tabs', { has: page.locator('.dock-tab.on', { hasText: /^Ontwerp$/ }) })
const popupP = app.waitForEvent('window')
await group.locator('button[title*="eigen venster"]').click()
const pop = await popupP
await pop.waitForLoadState()
await check('Ontwerp staat in een eigen venster', async () => waitFor(async () => (await pop.locator('.popout .panel-scroll').count()) === 1, 40, pop))
await check('en niet meer in de werkruimte', async () => (await page.locator('.dock-tab', { hasText: /^Ontwerp$/ }).count()) === 0)
await check('stijlen meegenomen (donker thema)', async () => (await pop.evaluate(() => getComputedStyle(document.body).backgroundColor)) !== 'rgba(0, 0, 0, 0)')

// Selectie in de editor → los venster toont die laag; wijzigen in het losse venster → project
await select('Headline')
await check('los venster volgt de selectie', async () => waitFor(async () => (await pop.locator('.panel-scroll textarea').first().inputValue()).startsWith('Jouw headline'), 40, pop))
const ta = pop.locator('.panel-scroll textarea').first()
await ta.fill('Vanaf het tweede scherm')
await ta.blur()
await check('wijziging in het losse venster komt in het project', async () => waitFor(async () => (await layer('Headline')).text.content === 'Vanaf het tweede scherm'))

// Sneltoets in het losse venster werkt (P = positie tonen in de tijdlijn van de editor)
await pop.locator('.panel-scroll .section-head').first().click()
await pop.keyboard.press('KeyO')
await check('sneltoets in het losse venster (O) werkt in de editor', async () =>
  waitFor(async () =>
    page.evaluate(() => {
      const s = window.__bsStore.getState()
      const id = s.project.compositions[0].layers.find((l) => l.name === 'Headline').id
      return JSON.stringify(s.shownProps[id]) === '["opacity"]' && s.expanded[id]
    })
  )
)
// Rechtermuismenu in het losse venster opent daar
await pop.locator('.panel-scroll .section-head').first().click({ button: 'right' }).catch(() => {})
await page.evaluate(() => window.__bsStore.getState().openMenu(20, 20, [{ label: 'Test', onClick: () => {} }]))
await check('rechtermuismenu verschijnt in het venster waar geklikt is', async () => waitFor(async () => (await pop.locator('.ctx-menu').count()) === 1, 20, pop))
await pop.keyboard.press('Escape')
await pop.screenshot({ path: `${shots}/p1-los-venster.png` })
await page.screenshot({ path: `${shots}/p2-editor.png` })

// 5. Venster dichtklikken: paneel terug in de werkruimte
// Zoals de gebruiker het venster dichtklikt
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find((w) => w.getTitle().startsWith('Ontwerp'))?.close())
await check('venster dicht: Ontwerp terug in de werkruimte', async () => waitFor(async () => (await page.locator('.dock-tab', { hasText: /^Ontwerp$/ }).count()) === 1))

// 6. Los venster blijft los na herstart
await page.locator('.dock-tab', { hasText: /^Tijdlijn$/ }).click()
const tlGroup = page.locator('.dock-tabs', { has: page.locator('.dock-tab.on', { hasText: /^Tijdlijn$/ }) })
const p2 = app.waitForEvent('window')
await tlGroup.locator('button[title*="eigen venster"]').click()
await p2
await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(1800)
// Afsluiten zoals Cmd+Q (app.quit): losse vensters blijven los voor de volgende keer
await app.evaluate(({ app }) => app.quit())
await new Promise((r) => setTimeout(r, 1500))
app = await launch()
page = await app.firstWindow()
const p3 = app.waitForEvent('window', { timeout: 15000 }).catch(() => null)
await page.waitForSelector('.welcome')
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await check('na herstart: tijdlijn weer in een eigen venster', async () => {
  const w = await p3
  return !!w && (await waitFor(async () => (await w.locator('.popout .timeline').count()) === 1, 40, w))
})
await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
console.log(fails ? `${fails} controle(s) mislukt` : 'Panelen en keyframes: alles in orde')
await app.close()

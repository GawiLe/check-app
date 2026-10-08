// Rooktest: transformgrepen rondom, tekstvak trekken, passende tekst + waarschuwing, autosave/herstel en versiegeschiedenis.
// Gebruik: npm run build && xvfb-run node scripts/smoke-edit.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { existsSync } from 'node:fs'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const launch = () => electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
let app = await launch()
let page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const shot = async (name) => {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}/${name}.png` })
}
const layers = () => page.evaluate(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project.compositions[0].layers)))
const layer = async (name) => (await layers()).find((l) => l.name === name)
const select = (names) =>
  page.evaluate((n) => {
    const s = window.__bsStore.getState()
    s.select(s.project.compositions[0].layers.filter((l) => n.includes(l.name)).map((l) => l.id))
  }, names)
const waitFor = async (fn, tries = 30) => {
  for (let i = 0; i < tries; i++) {
    if (await fn().catch(() => false)) return true
    await page.waitForTimeout(150)
  }
  return false
}
const answer = (response) =>
  app.evaluate(({ dialog }, r) => {
    globalThis.__asked = 0
    dialog.showMessageBox = async () => {
      globalThis.__asked++
      return { response: r, checkboxChecked: false }
    }
  }, response)
const asked = () => app.evaluate(() => globalThis.__asked)

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. Acht transformgrepen; linksboven slepen houdt de rechteronderhoek op zijn plek
await page.evaluate(() => window.__bsStore.getState().setTime(window.__bsStore.getState().project.compositions[0].duration - 0.1)) // CTA volledig in beeld
await select(['CTA'])
await page.waitForTimeout(300)
await check('acht grepen rondom de selectie', async () => (await page.locator('.viewer .handle').count()) === 8)
const before = await layer('CTA')
const tl = await page.locator('.viewer .handle').first().boundingBox()
await page.mouse.move(tl.x + tl.width / 2, tl.y + tl.height / 2)
await page.mouse.down()
await page.mouse.move(tl.x - 15, tl.y - 10, { steps: 5 })
await page.mouse.up()
await check('greep linksboven: groter, rechtsonder blijft staan', async () => {
  const l = await layer('CTA')
  return l.width > before.width && l.height > before.height && Math.abs(l.x + l.width - (before.x + before.width)) <= 1 && Math.abs(l.y + l.height - (before.y + before.height)) <= 1
})
const mid = await layer('CTA')
const right = page.locator('.viewer .handle').nth(3) // [1, 0.5]: midden rechts
const rb = await right.boundingBox()
await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2)
await page.mouse.down()
await page.mouse.move(rb.x + 30, rb.y + 25, { steps: 5 })
await page.mouse.up()
await check('greep midden rechts: alleen breder, hoogte en links blijven', async () => {
  const l = await layer('CTA')
  return l.width > mid.width && l.height === mid.height && Math.abs(l.x - mid.x) <= 1
})
await shot('e1-grepen')

// 2. Tekstvak trekken met het tekstgereedschap
const count0 = (await layers()).length
await page.evaluate(() => window.__bsStore.getState().setTool('text'))
const vb = await page.locator('.viewer').boundingBox()
const sx = vb.x + vb.width / 2 - 60
const sy = vb.y + vb.height / 2 - 20
await page.mouse.move(sx, sy)
await page.mouse.down()
await page.mouse.move(sx + 140, sy + 40, { steps: 6 })
await page.mouse.up()
await page.waitForTimeout(300)
const drawn = (await layers()).find((l) => l.type === 'text' && !['Headline', 'Subline', 'CTA'].includes(l.name))
await check('tekstvak getrokken: nieuwe tekstlaag met de getrokken maat', async () => {
  const zoom = await page.evaluate(() => window.__bsStore.getState().zoom ?? 1)
  return (await layers()).length === count0 + 1 && drawn && Math.abs(drawn.width - 140 / zoom) <= 3 && Math.abs(drawn.height - 40 / zoom) <= 3
})
await page.keyboard.press('Escape')
await page.evaluate(() => window.__bsStore.getState().setTool('select'))

// 3. Te lange tekst: waarschuwing; "Passend" verkleint de letter tot het past
const setText = (id, patch) =>
  page.evaluate(
    ([i, p]) =>
      window.__bsStore.getState().update((pr) => {
        const l = pr.compositions[0].layers.find((x) => x.id === i)
        Object.assign(l.text, p)
      }),
    [id, patch]
  )
const long = 'Deze tekst is veel te lang voor dit kleine tekstvak en loopt eruit'
await setText(drawn.id, { content: long, fit: false, size: 28 })
await check('tekst loopt over: gemarkeerd in de viewer', async () =>
  waitFor(async () => (await page.evaluate((i) => window.__bsStore.getState().overflowIds.includes(i), drawn.id)) && (await page.locator('.overflow-frame').count()) > 0)
)
await select([drawn.name])
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
await check('waarschuwing in het inspectiepaneel', async () => waitFor(async () => (await page.locator('.warn-text').count()) > 0))
await shot('e2-overloop')
await setText(drawn.id, { fit: true })
await check('Passend: waarschuwing weg en letter kleiner in de preview', async () =>
  waitFor(async () => {
    if (await page.evaluate((i) => window.__bsStore.getState().overflowIds.includes(i), drawn.id)) return false
    for (const f of page.frames().filter((x) => x.url().startsWith('bsproj://bs-preview/'))) {
      const size = await f.evaluate((i) => {
        const el = document.querySelector(`[data-t="${i}"]`)
        return el ? parseFloat(getComputedStyle(el).fontSize) : 0
      }, drawn.id).catch(() => 0)
      if (size > 0 && size < 28) return true
    }
    return false
  })
)
await shot('e3-passend')

// 4. Opslaan = versie; daarna nog een wijziging en opslaan = tweede versie
const save = () => page.evaluate(async () => {
  const s = window.__bsStore.getState()
  await window.bs.saveProject(s.dir, s.project)
  s.markSaved()
})
await save()
await page.evaluate(() => window.__bsStore.getState().update((p) => void (p.name = 'Tweede versie')))
await page.waitForTimeout(1100) // versienamen zijn tijdstempels
await save()
await check('twee versies bewaard in .bnnr/versions', async () => (await page.evaluate((d) => window.bs.listVersions(d), dir)).length === 2)
await page.evaluate(() => window.__bsStore.getState().setDialog('versions'))
await page.waitForSelector('.versions-list .list-item')
await shot('e4-versies')
await page.locator('.versions-list .list-item').nth(1).getByRole('button', { name: 'Terugzetten' }).click()
await page.waitForTimeout(300)
await check('oudere versie teruggezet (naam terug)', async () => (await page.evaluate(() => window.__bsStore.getState().project.name)) !== 'Tweede versie')
await page.evaluate(() => window.__bsStore.getState().undo())
await check('terugzetten is ongedaan te maken', async () => (await page.evaluate(() => window.__bsStore.getState().project.name)) === 'Tweede versie')

// 5. Crash na een niet-opgeslagen wijziging: autosave staat klaar, bij openen herstellen
await page.evaluate(() => window.__bsStore.getState().update((p) => void (p.name = 'Niet opgeslagen werk')))
await page.evaluate(async () => {
  const s = window.__bsStore.getState()
  await window.bs.autosave(s.dir, s.project)
})
await check('herstelkopie geschreven', async () => existsSync(join(dir, '.bnnr', 'autosave.bsproj')))
app.process().kill('SIGKILL') // "crash"
await new Promise((r) => setTimeout(r, 800))

app = await launch()
page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.waitForSelector('.welcome')
await answer(0) // Herstellen
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
await check('na crash: herstelvraag en werk terug (nog niet opgeslagen)', async () => {
  const s = await page.evaluate(() => ({ name: window.__bsStore.getState().project.name, dirty: window.__bsStore.getState().dirty }))
  return (await asked()) === 1 && s.name === 'Niet opgeslagen werk' && s.dirty
})
await check('project op schijf nog de opgeslagen versie', async () => JSON.parse(await readFile(join(dir, 'project.bsproj'), 'utf8')).name === 'Tweede versie')
await save()
await check('opslaan ruimt de herstelkopie op', async () => !existsSync(join(dir, '.bnnr', 'autosave.bsproj')))

await page.evaluate(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

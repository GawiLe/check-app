// Rooktest: meerdere projecten in tabbladen, recente projecten, schaduw, afsluiten met wijzigingen.
// Gebruik: npm run build && xvfb-run node scripts/smoke-tabs.mjs <projectmap-A> <projectmap-B> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const [dirA, dirB, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const pB = JSON.parse(await readFile(join(dirB, 'project.bsproj'), 'utf8'))
pB.name = 'Project B'
await writeFile(join(dirB, 'project.bsproj'), JSON.stringify(pB))

const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const shot = async (name) => {
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${shots}/${name}.png` })
}
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')
const state = () => page.evaluate(() => ({ name: window.__bsStore.getState().project?.name, dir: window.__bsStore.getState().dir, dirty: window.__bsStore.getState().dirty }))
const tabs = () => page.locator('.doc-tab').allInnerTexts()
const tab = (name) => page.locator('.doc-tab', { hasText: name })
const answer = (response) =>
  app.evaluate(({ dialog }, r) => {
    globalThis.__asked = 0
    dialog.showMessageBox = async () => {
      globalThis.__asked++
      return { response: r, checkboxChecked: false }
    }
  }, response)
const asked = () => app.evaluate(() => globalThis.__asked)
const pickFolder = (p) => app.evaluate(({ dialog }, d) => void (dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })), p)

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dirA)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
const nameA = (await state()).name

// 1. Tweede project via Openen → Map kiezen: nieuw tabblad
await pickFolder(dirB)
await page.locator('.open-btn').click()
await page.locator('.open-menu button', { hasText: 'Map kiezen' }).click()
await page.waitForTimeout(800)
await check('tweede project in een eigen tabblad', async () => (await tabs()).length === 2 && (await state()).name === 'Project B')

// 2. Wijziging in B, wisselen naar A: A is ongewijzigd, B toont de stip
await page.evaluate(() => window.__bsStore.getState().update((p) => void (p.compositions[0].layers[0].name = 'Gewijzigd in B')))
await tab(nameA).click()
await page.waitForTimeout(600)
await check('wisselen naar A: eigen project, eigen status', async () => {
  const s = await state()
  return s.name === nameA && s.dir === dirA && !s.dirty
})
await check('tabblad B toont niet-opgeslagen stip', async () => (await tab('Project B').locator('.doc-dirty').count()) === 1)
await check('preview volgt het actieve project (A)', async () => {
  // Het zichtbare preview-iframe (er zijn er twee die elkaar afwisselen)
  for (let i = 0; i < 20; i++) {
    const title = await page.evaluate(() => {
      const f = [...document.querySelectorAll('.viewer iframe')].find((x) => x.style.visibility !== 'hidden')
      return f?.getAttribute('src') ?? ''
    })
    const fr = page.frames().find((x) => x.url() === title)
    if (fr && (await fr.evaluate(() => document.title).catch(() => '')).startsWith(nameA)) return true
    await page.waitForTimeout(150)
  }
  return false
})

// 3. Schaduw in A (dubbel), zichtbaar in de preview
await page.locator('.tl-name:not(.sub)').filter({ has: page.getByText('Headline', { exact: true }) }).first().click()
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
await page.locator('.shadow-presets button', { hasText: 'Dubbel' }).click()
await page.waitForTimeout(800)
await check('dubbele schaduw op de laag', async () =>
  page.evaluate(() => window.__bsStore.getState().project.compositions[0].layers.find((l) => l.name === 'Headline').shadows.length === 2)
)
await check('schaduw zichtbaar in de preview', async () => {
  for (let i = 0; i < 20; i++) {
    const f = page.frames().find((fr) => fr.url().startsWith('bsproj://bs-preview/') && fr.isDetached() === false)
    const ok = await f
      ?.evaluate(() => [...document.querySelectorAll('.L')].some((el) => (getComputedStyle(el).filter.match(/drop-shadow/g) ?? []).length === 2))
      .catch(() => false)
    if (ok) return true
    await page.waitForTimeout(150)
  }
  return false
})
await shot('t1-schaduw')

// 4. Terug naar B: wijziging en ongedaan maken per project bewaard
await tab('Project B').click()
await page.waitForTimeout(600)
await check('terug in B: wijziging staat er nog', async () =>
  page.evaluate(() => window.__bsStore.getState().project.compositions[0].layers[0].name === 'Gewijzigd in B')
)
await page.evaluate(() => window.__bsStore.getState().undo())
await check('ongedaan maken in B werkt (eigen geschiedenis)', async () =>
  page.evaluate(() => window.__bsStore.getState().project.compositions[0].layers[0].name !== 'Gewijzigd in B')
)
await page.evaluate(() => window.__bsStore.getState().update((p) => void (p.compositions[0].layers[0].name = 'Gewijzigd in B')))

// 5. Recente projecten in het Openen-menu; een open project kiezen = naar dat tabblad
await page.locator('.open-btn').click()
await check('recente projecten in het Openen-menu', async () => {
  for (let i = 0; i < 20; i++) {
    const items = await page.locator('.open-menu button').allInnerTexts()
    if (items.some((t) => t.includes(dirA.split('/').pop())) && items.some((t) => t.includes(dirB.split('/').pop()))) return true
    await page.waitForTimeout(100)
  }
  return false
})
await shot('t2-recent')
await page.locator('.open-menu button', { hasText: dirA.split('/').pop() }).first().click()
await page.waitForTimeout(600)
await check('recent kiezen van een open project: geen dubbel tabblad', async () => (await tabs()).length === 2 && (await state()).dir === dirA)

// 6. Tabblad B sluiten met wijzigingen: Annuleren houdt hem open, Niet opslaan sluit
await answer(2)
await tab('Project B').locator('.doc-close').click()
await page.waitForTimeout(600)
await check('B sluiten → Annuleren: vraag, tabblad blijft', async () => (await asked()) === 1 && (await tabs()).length === 2)

// 7. Venster sluiten met wijzigingen in twee tabbladen → Opslaan: alles opgeslagen, venster dicht
await answer(0)
const closed = page.waitForEvent('close', { timeout: 15000 }).then(() => true).catch(() => false)
await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
await check('afsluiten → Opslaan: venster sluit', async () => await closed)
await check('beide projecten opgeslagen', async () => {
  const a = JSON.parse(await readFile(join(dirA, 'project.bsproj'), 'utf8'))
  const b = JSON.parse(await readFile(join(dirB, 'project.bsproj'), 'utf8'))
  return a.compositions[0].layers.find((l) => l.name === 'Headline').shadows?.length === 2 && b.compositions[0].layers[0].name === 'Gewijzigd in B'
})
await app.close().catch(() => {})

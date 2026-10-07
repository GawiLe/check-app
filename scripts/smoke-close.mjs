// Rooktest: vraag "Wijzigingen opslaan?" bij sluiten en bij nieuw/openen.
// Gebruik: npm run build && xvfb-run node scripts/smoke-close.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
const check = async (label, fn) => console.log(label, (await fn()) ? 'OK' : 'MISLUKT')

/** Bootst het systeemvenster na: antwoord 0 = Opslaan, 1 = Niet opslaan, 2 = Annuleren. Telt de vragen. */
const answer = (response) =>
  app.evaluate(({ dialog }, r) => {
    globalThis.__asked = 0
    dialog.showMessageBox = async () => {
      globalThis.__asked++
      return { response: r, checkboxChecked: false }
    }
  }, response)
const asked = () => app.evaluate(() => globalThis.__asked)
const closeWindow = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
const windows = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)
const menu = (action) => app.evaluate(({ BrowserWindow }, a) => BrowserWindow.getAllWindows()[0].webContents.send('bs:menu', a), action)

await page.waitForSelector('.welcome')
await page.evaluate((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. Zonder wijzigingen: sluiten vraagt niets (hier alleen gecontroleerd via de nieuw-actie)
await answer(2)
await menu('new')
await page.waitForTimeout(300)
await check('geen wijzigingen: geen vraag bij Nieuw', async () => (await asked()) === 0 && (await page.locator('.modal').count()) === 1)
await page.keyboard.press('Escape')

// Wijziging maken
await page.evaluate(() => window.__bsStore.getState().update((p) => void (p.name = 'Gewijzigd zonder opslaan')))
await page.waitForTimeout(200)

// 2. Sluiten → Annuleren: venster blijft open
await answer(2)
await closeWindow()
await page.waitForTimeout(500)
await check('sluiten met wijzigingen: vraag verschijnt', async () => (await asked()) === 1)
await check('Annuleren: venster blijft open, wijziging blijft', async () =>
  (await windows()) === 1 && (await page.evaluate(() => window.__bsStore.getState().project.name)) === 'Gewijzigd zonder opslaan'
)

// 3. Nieuw project met wijzigingen: geen vraag meer (het nieuwe project komt in een eigen tabblad),
//    het huidige project en zijn wijzigingen blijven gewoon open
await answer(2)
await menu('new')
await page.waitForTimeout(300)
await check('Nieuw met wijzigingen: geen vraag, nieuw-venster, huidig project blijft', async () =>
  (await asked()) === 0 &&
  (await page.locator('.modal').count()) === 1 &&
  (await page.evaluate(() => window.__bsStore.getState().project.name)) === 'Gewijzigd zonder opslaan'
)
await page.keyboard.press('Escape')

// 5. Sluiten → Opslaan: wordt opgeslagen en het venster sluit
await answer(0)
const closed = page.waitForEvent('close', { timeout: 10000 }).then(() => true).catch(() => false)
await closeWindow()
await check('Opslaan: venster sluit', async () => await closed)
await check('Opslaan: wijziging staat op schijf', async () => JSON.parse(await readFile(join(dir, 'project.bsproj'), 'utf8')).name === 'Gewijzigd zonder opslaan')
await app.close().catch(() => {})

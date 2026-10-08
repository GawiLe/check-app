import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from 'electron'
import { existsSync, watch, type FSWatcher } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { inside } from './paths'
import type { BannerStudioApi, Settings } from '@shared/api'
import type { Project } from '@shared/types'
import { aiAnimate } from './ai'
import { estimateSize, exportBanners, MIME } from './exporter'
import { addVersion, clearAutosave, listVersions, readNewerAutosave, readVersion, writeAutosave } from './history'
import { normalizeProject } from '@shared/sync'
import { createVariants, readVariantSheet } from './variants'
import { describeFont, textToGlyphPaths } from './fonts'
import { fontCatalog, installWebFont } from './webfonts'
import {
  addRecent,
  boilerplateSource,
  copyIntoProject,
  deleteBoilerplate,
  DEFAULT_MODEL,
  initProjectDir,
  listAssets,
  listBoilerplates,
  loadApiKey,
  readProject,
  readPresets,
  readSettings,
  writePresets,
  saveBoilerplate,
  storeApiKey,
  writeProject,
  writeSettings
} from './storage'

// Bestanden uit de geopende projectmap worden in de preview geladen via bsproj://
protocol.registerSchemesAsPrivileged([
  { scheme: 'bsproj', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
])

if (process.env.BS_USER_DATA) app.setPath('userData', process.env.BS_USER_DATA)

let win: BrowserWindow | null = null
// Niet-opgeslagen wijzigingen: bij sluiten/afsluiten eerst vragen wat ermee moet
let dirty = false
let forceClose = false
let quitting = false

async function askSave(): Promise<'save' | 'discard' | 'cancel'> {
  if (!win) return 'discard'
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Opslaan', 'Niet opslaan', 'Annuleren'],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
    message: 'Wil je de wijzigingen opslaan?',
    detail: 'Als je niet opslaat, gaan je wijzigingen sinds de laatste keer opslaan verloren.'
  })
  return response === 0 ? 'save' : response === 1 ? 'discard' : 'cancel'
}
let currentDir: string | null = null
let watcher: FSWatcher | null = null

// Preview van de banner: eigen document met een eigen, strenge CSP (alleen het eigen inline-script,
// geen netwerk; afbeeldingen en fonts alleen uit het project). Zo erft hij niets van de editor.
const PREVIEW_HOST = 'bs-preview'
const previews = ['', '']
let previewRev = 0
const PREVIEW_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src bsproj: data:; font-src bsproj: data:; media-src 'none'; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"

const FONT_MIME: Record<string, string> = { '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' }

/** Alle projecten die in tabbladen open staan (absolute paden). Het actieve is currentDir. */
const openDirs = new Set<string>()

function setProjectDir(dir: string) {
  openDirs.add(resolve(dir))
  currentDir = dir
  watcher?.close()
  let timer: NodeJS.Timeout | undefined
  try {
    // Bronmap in de gaten houden: vervang je een afbeelding in assets/, dan ververst de preview.
    watcher = watch(dir, { recursive: true }, (_ev, file) => {
      if (!file || !/^(assets|fonts)[\\/]/.test(String(file))) return
      clearTimeout(timer)
      timer = setTimeout(() => win?.webContents.send('bs:filesChanged'), 150)
    })
  } catch {
    watcher = null
  }
  void addRecent(dir).then(() => buildMenu())
  win?.setTitle(`Bnnr Studio — ${dir}`)
}


type Handlers = { [K in keyof BannerStudioApi]?: (...a: Parameters<BannerStudioApi[K]>) => ReturnType<BannerStudioApi[K]> | Awaited<ReturnType<BannerStudioApi[K]>> }

const handlers: Handlers = {
  async newProject(boilerplateId, name) {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Kies een (lege) map voor het nieuwe project',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || !res.filePaths[0]) return null
    const dir = res.filePaths[0]
    const { project, dir: src } = await boilerplateSource(boilerplateId)
    project.name = name || project.name
    await initProjectDir(dir, project, src)
    setProjectDir(dir)
    return { dir, project }
  },

  async activateProject(dir) {
    if (!openDirs.has(resolve(dir))) throw new Error('Dit project is niet geopend.')
    setProjectDir(dir)
  },
  async closeProject(dir) {
    openDirs.delete(resolve(dir))
  },

  async openProject(dir, background) {
    if (!dir) {
      const res = await dialog.showOpenDialog(win!, {
        title: 'Open projectmap',
        properties: ['openDirectory']
      })
      if (res.canceled || !res.filePaths[0]) return null
      dir = res.filePaths[0]
    }
    const opened = await readProject(dir)
    // Niet-opgeslagen werk van vorige keer (bijv. na een crash)? Dan aanbieden om het te herstellen.
    const auto = background ? null : await readNewerAutosave(dir)
    if (auto && win) {
      const when = new Date(auto.savedAt).toLocaleString('nl-NL', { dateStyle: 'medium', timeStyle: 'short' })
      const { response } = await dialog.showMessageBox(win, {
        type: 'question',
        buttons: ['Herstellen', 'Laatst opgeslagen versie openen'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        message: 'Er is niet-opgeslagen werk gevonden',
        detail: `Bnnr Studio heeft op ${when} automatisch een kopie bewaard van wijzigingen die niet zijn opgeslagen (bijvoorbeeld door een crash). Wil je die terugzetten?`
      })
      if (response === 0) {
        opened.project = normalizeProject(auto.project)
        opened.recovered = true
      } else await clearAutosave(dir)
    }
    if (background) {
      // In een tabblad op de achtergrond: wel openen, niet actief maken
      openDirs.add(resolve(dir))
      void addRecent(dir).then(() => buildMenu())
    } else setProjectDir(dir)
    return opened
  },

  async saveProject(dir, project) {
    await writeProject(dir, project)
    // Elke keer opslaan = een versie in de geschiedenis; de herstelkopie is dan niet meer nodig
    await addVersion(dir, project).catch((e) => console.warn('Versie bewaren mislukt', e))
    await clearAutosave(dir)
  },
  autosave: (dir, project) => writeAutosave(dir, project),
  clearAutosave: (dir) => clearAutosave(dir),
  listVersions: (dir) => listVersions(dir),
  readVersion: (dir, id) => readVersion(dir, id),

  async importImages(dir) {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Afbeeldingen importeren',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Afbeeldingen', extensions: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp'] }]
    })
    if (res.canceled) return []
    return copyIntoProject(dir, 'assets', res.filePaths)
  },

  async importFonts(dir) {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Fonts importeren',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Fonts', extensions: ['woff', 'woff2', 'ttf', 'otf'] }]
    })
    if (res.canceled) return []
    const files = await copyIntoProject(dir, 'fonts', res.filePaths)
    return Promise.all(files.map((f) => describeFont(dir, f)))
  },

  listAssets: (dir) => listAssets(dir),

  async importPaths(dir, paths) {
    const img = paths.filter((p) => /\.(png|jpe?g|gif|svg|webp)$/i.test(p))
    const fnt = paths.filter((p) => /\.(woff2?|ttf|otf)$/i.test(p))
    const assets = await copyIntoProject(dir, 'assets', img)
    const fontFiles = await copyIntoProject(dir, 'fonts', fnt)
    const fonts = await Promise.all(fontFiles.map((f) => describeFont(dir, f)))
    return { assets, fonts, skipped: paths.filter((p) => !img.includes(p) && !fnt.includes(p)) }
  },
  generateWriteOn: (dir, fontFile, text, size) => textToGlyphPaths(dir, fontFile, text, size),
  exportBanners: (req) => exportBanners(req),
  async importVariantSheet(dir) {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Varianten uit CSV of Excel',
      defaultPath: dir,
      properties: ['openFile'],
      filters: [{ name: 'Spreadsheet (CSV, Excel)', extensions: ['csv', 'tsv', 'txt', 'xlsx'] }]
    })
    if (res.canceled || !res.filePaths[0]) return null
    return readVariantSheet(dir, res.filePaths[0])
  },
  async saveVariantSheet(dir, csv) {
    const res = await dialog.showSaveDialog(win!, {
      title: 'Varianten opslaan als CSV',
      defaultPath: join(dir, 'varianten.csv'),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (res.canceled || !res.filePath) return null
    // Met BOM, zodat Excel de tekens (é, ë, €) goed leest
    await writeFile(res.filePath, '\uFEFF' + String(csv))
    return res.filePath
  },
  estimateSize: (dir, project, compId, target) => estimateSize(dir, project, compId, target),
  createVariants: (req) => createVariants(req),
  async setDirty(v) {
    dirty = !!v
    win?.setDocumentEdited(dirty)
  },
  askSave: () => askSave(),
  async closeWindow() {
    forceClose = true
    if (quitting) app.quit()
    else win?.close()
  },
  async setPreview(slot, html) {
    const i = slot === 1 ? 1 : 0
    previews[i] = String(html)
    return `bsproj://${PREVIEW_HOST}/${i}?v=${++previewRev}`
  },

  async revealInFolder(path) {
    shell.showItemInFolder(path)
  },

  listBoilerplates: () => listBoilerplates(),
  saveBoilerplate: (dir, project, name) => saveBoilerplate(dir, project, name),
  deleteBoilerplate: (id) => deleteBoilerplate(id),

  async getSettings(): Promise<Settings> {
    const s = await readSettings()
    return { hasApiKey: !!(await loadApiKey()), model: s.model || DEFAULT_MODEL, recent: s.recent }
  },
  setApiKey: (key) => storeApiKey(key),
  async setModel(model) {
    const s = await readSettings()
    s.model = model || DEFAULT_MODEL
    await writeSettings(s)
  },

  fontCatalog: () => fontCatalog(),
  installWebFont: (dir, font, weight, style) => installWebFont(dir, font, weight, style),
  listPresets: () => readPresets(),
  async nativeEdit(cmd) {
    // In tekstvelden: gewoon het normale knippen/kopiëren/plakken van het systeem
    const wc = win?.webContents
    if (!wc) return
    if (cmd === 'cut') wc.cut()
    if (cmd === 'copy') wc.copy()
    if (cmd === 'paste') wc.paste()
    if (cmd === 'selectAll') wc.selectAll()
  },
  savePresets: (list) => writePresets(list),

  async aiAnimate(project: Project, compositionId, layerIds, prompt) {
    const key = await loadApiKey()
    if (!key) throw new Error('Geen Anthropic API-sleutel ingesteld. Ga naar Instellingen.')
    const s = await readSettings()
    return aiAnimate(key, s.model || DEFAULT_MODEL, project, compositionId, layerIds, prompt)
  }
}

// Functies die in een projectmap schrijven of lezen: alleen in het project dat nu open is
// (de map komt uit het venster en wordt dus niet blind vertrouwd).
const DIR_ARG = new Set(['importImages', 'importFonts', 'listAssets', 'importPaths', 'generateWriteOn', 'saveBoilerplate', 'installWebFont', 'estimateSize', 'importVariantSheet', 'saveVariantSheet'])
const DIR_REQ = new Set(['exportBanners', 'createVariants'])
// Mag voor elk geopend tabblad (ook op de achtergrond): opslaan, herstelkopie, versies
const OPEN_DIR_ARG = new Set(['saveProject', 'autosave', 'clearAutosave', 'listVersions', 'readVersion'])
function assertOpenProject(dir: unknown) {
  if (typeof dir !== 'string' || !currentDir || resolve(dir) !== resolve(currentDir)) throw new Error('Deze map is niet het geopende project.')
}

for (const [name, fn] of Object.entries(handlers)) {
  ipcMain.handle(`bs:${name}`, async (e, ...args) => {
    // Alleen het hoofdvenster zelf, nooit een (preview-)frame of een ander venster
    if (!win || e.sender !== win.webContents || e.senderFrame !== win.webContents.mainFrame) throw new Error('Niet toegestaan.')
    if (DIR_ARG.has(name)) assertOpenProject(args[0])
    // Opslaan mag voor elk geopend tabblad (bijv. "alles opslaan" bij afsluiten)
    if (OPEN_DIR_ARG.has(name) && !(typeof args[0] === 'string' && openDirs.has(resolve(args[0])))) throw new Error('Dit project is niet geopend.')
    if (DIR_REQ.has(name)) assertOpenProject((args[0] as { dir?: unknown } | undefined)?.dir)
    return (fn as (...a: unknown[]) => unknown)(...args)
  })
}

async function buildMenu() {
  const send = (action: string) => () => win?.webContents.send('bs:menu', action)
  const isMac = process.platform === 'darwin'
  const recent = (await readSettings().catch(() => ({ recent: [] as string[] }))).recent ?? []
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'Bestand',
        submenu: [
          { label: 'Nieuw project…', accelerator: 'CmdOrCtrl+N', click: send('new') },
          { label: 'Open project…', accelerator: 'CmdOrCtrl+O', click: send('open') },
          {
            label: 'Recent openen',
            submenu: recent.length
              ? recent.map((d) => ({ label: d.split(/[\\/]/).pop() || d, sublabel: d, toolTip: d, click: () => win?.webContents.send('bs:menu', `openRecent:${d}`) }))
              : [{ label: 'Nog geen recente projecten', enabled: false }]
          },
          { label: 'Opslaan', accelerator: 'CmdOrCtrl+S', click: send('save') },
          { type: 'separator' },
          { label: 'Opslaan als boilerplate…', click: send('saveBoilerplate') },
          { label: 'Varianten (template)…', click: send('variants') },
          { label: 'Versiegeschiedenis…', click: send('versions') },
          { label: 'Exporteren…', accelerator: 'CmdOrCtrl+E', click: send('export') },
          { type: 'separator' },
          { label: 'Tabblad sluiten', accelerator: 'CmdOrCtrl+W', click: send('closeTab') },
          ...(isMac ? [] : [{ role: 'quit' as const, label: 'Afsluiten' }])
        ]
      },
      {
        label: 'Bewerken',
        submenu: [
          { label: 'Ongedaan maken', accelerator: 'CmdOrCtrl+Z', click: send('undo') },
          { label: 'Opnieuw', accelerator: 'Shift+CmdOrCtrl+Z', click: send('redo') },
          { type: 'separator' },
          { label: 'Knippen', accelerator: 'CmdOrCtrl+X', click: send('cut') },
          { label: 'Kopiëren', accelerator: 'CmdOrCtrl+C', click: send('copy') },
          { label: 'Plakken', accelerator: 'CmdOrCtrl+V', click: send('paste') },
          { label: 'Alles selecteren', accelerator: 'CmdOrCtrl+A', click: send('selectAll') },
          { label: 'Laag dupliceren', accelerator: 'CmdOrCtrl+D', click: send('duplicate') },
          { type: 'separator' },
          { label: 'Groeperen', accelerator: 'CmdOrCtrl+G', click: send('group') },
          { label: 'Degroeperen', accelerator: 'Shift+CmdOrCtrl+G', click: send('ungroup') },
          { label: 'Achter elkaar zetten', click: send('sequence') }
        ]
      },
      {
        label: 'Venster',
        submenu: [
          { label: 'Canvas', click: send('panel:viewer') },
          { label: 'Code', click: send('panel:code') },
          { label: 'Tijdlijn', click: send('panel:timeline') },
          { label: 'Animaties', click: send('panel:library') },
          { label: 'Assets & fonts', click: send('panel:assets') },
          { label: 'Ontwerp', click: send('panel:design') },
          { label: 'Animatie', click: send('panel:motion') },
          { label: 'AI', click: send('panel:ai') },
          { type: 'separator' },
          { label: 'Indeling herstellen', click: send('resetLayout') }
        ]
      },
      {
        label: 'Beeld',
        submenu: [
          { role: 'reload', label: 'Herladen' },
          { role: 'toggleDevTools', label: 'Developer tools' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Volledig scherm' }
        ]
      },
      {
        label: 'Help',
        role: 'help',
        submenu: [{ label: 'Sneltoetsen…', accelerator: 'CmdOrCtrl+/', click: send('shortcuts') }]
      }
    ])
  )
}

// App-icoon (Windows/Linux-venster; op de Mac het Dock-icoon tijdens ontwikkelen)
const APP_ICON = join(__dirname, '../../resources/icon.png')

async function createWindow() {
  // Nieuw venster (bijv. na heropenen via het Dock op de Mac): schone lei
  dirty = false
  forceClose = false
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1d1d1f',
    title: 'Bnnr Studio',
    icon: APP_ICON,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  win.on('closed', () => (win = null))
  win.on('close', (e) => {
    if (!dirty || forceClose) return
    e.preventDefault()
    void askSave().then((answer) => {
      if (answer === 'discard') {
        // Bewust niet opslaan: geen herstelvraag de volgende keer
        for (const d of openDirs) void clearAutosave(d)
        forceClose = true
        if (quitting) app.quit()
        else win?.close()
      } else if (answer === 'save') {
        // De editor slaat op en roept daarna closeWindow aan
        win?.webContents.send('bs:menu', 'saveAndClose')
      } else quitting = false
    })
  })
  // Een bestand dat naast het canvas wordt losgelaten mag de app niet wegnavigeren
  win.webContents.on('will-navigate', (e) => e.preventDefault())
  // Nooit nieuwe vensters vanuit de app of de preview (banner-code kan window.open aanroepen)
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  if (process.platform === 'darwin' && existsSync(APP_ICON)) app.dock?.setIcon(APP_ICON)
  protocol.handle('bsproj', async (req) => {
    if (!currentDir) return new Response('Geen project', { status: 404 })
    try {
      const url = new URL(req.url)
      if (url.hostname === PREVIEW_HOST)
        return new Response(previews[url.pathname === '/1' ? 1 : 0], {
          headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': PREVIEW_CSP, 'cache-control': 'no-store' }
        })
      const rel = decodeURIComponent(`${url.hostname}${url.pathname}`)
      const file = inside(currentDir, rel)
      const ext = extname(file).toLowerCase()
      return new Response(await readFile(file), {
        headers: {
          'content-type': MIME[ext] ?? FONT_MIME[ext] ?? 'application/octet-stream',
          'access-control-allow-origin': '*',
          'cache-control': 'no-store'
        }
      })
    } catch {
      return new Response('Niet gevonden', { status: 404 })
    }
  })
  void buildMenu()
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('before-quit', () => {
  quitting = true
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

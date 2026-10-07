import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from 'electron'
import { watch, type FSWatcher } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize, resolve, sep } from 'node:path'
import type { BannerStudioApi, Settings } from '@shared/api'
import type { Project } from '@shared/types'
import { aiAnimate } from './ai'
import { exportBanners, MIME } from './exporter'
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
let currentDir: string | null = null
let watcher: FSWatcher | null = null

const FONT_MIME: Record<string, string> = { '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' }

function setProjectDir(dir: string) {
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
  void addRecent(dir)
  win?.setTitle(`Banner Studio — ${dir}`)
}

function inside(dir: string, rel: string): string {
  const full = resolve(dir, normalize(rel))
  if (!full.startsWith(resolve(dir) + sep)) throw new Error('Pad buiten de projectmap.')
  return full
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

  async openProject(dir) {
    if (!dir) {
      const res = await dialog.showOpenDialog(win!, {
        title: 'Open projectmap',
        properties: ['openDirectory']
      })
      if (res.canceled || !res.filePaths[0]) return null
      dir = res.filePaths[0]
    }
    const opened = await readProject(dir)
    setProjectDir(dir)
    return opened
  },

  async saveProject(dir, project) {
    await writeProject(dir, project)
  },

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
  generateWriteOn: (dir, fontFile, text, size) => textToGlyphPaths(dir, fontFile, text, size),
  exportBanners: (req) => exportBanners(req),

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

for (const [name, fn] of Object.entries(handlers)) {
  ipcMain.handle(`bs:${name}`, async (_e, ...args) => (fn as (...a: unknown[]) => unknown)(...args))
}

function buildMenu() {
  const send = (action: string) => () => win?.webContents.send('bs:menu', action)
  const isMac = process.platform === 'darwin'
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(isMac ? [{ role: 'appMenu' as const }] : []),
      {
        label: 'Bestand',
        submenu: [
          { label: 'Nieuw project…', accelerator: 'CmdOrCtrl+N', click: send('new') },
          { label: 'Open project…', accelerator: 'CmdOrCtrl+O', click: send('open') },
          { label: 'Opslaan', accelerator: 'CmdOrCtrl+S', click: send('save') },
          { type: 'separator' },
          { label: 'Opslaan als boilerplate…', click: send('saveBoilerplate') },
          { label: 'Exporteren…', accelerator: 'CmdOrCtrl+E', click: send('export') },
          { type: 'separator' },
          isMac ? { role: 'close' } : { role: 'quit', label: 'Afsluiten' }
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
        label: 'Beeld',
        submenu: [
          { role: 'reload', label: 'Herladen' },
          { role: 'toggleDevTools', label: 'Developer tools' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Volledig scherm' }
        ]
      }
    ])
  )
}

async function createWindow() {
  win = new BrowserWindow({
    width: 1500,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1d1d1f',
    title: 'Banner Studio',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: false, contextIsolation: true }
  })
  win.on('closed', () => (win = null))
  if (process.env.ELECTRON_RENDERER_URL) await win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else await win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  protocol.handle('bsproj', async (req) => {
    if (!currentDir) return new Response('Geen project', { status: 404 })
    try {
      const url = new URL(req.url)
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
  buildMenu()
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

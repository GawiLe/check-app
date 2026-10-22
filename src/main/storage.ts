import { ensureDirInside, safeName, writeInside } from './paths'
import { app, safeStorage } from 'electron'
import { cp, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Boilerplate, OpenedProject } from '@shared/api'
import { createEmptyProject, createStarterProject, newId } from '@shared/factory'
import { normalizeProject } from '@shared/sync'
import type { Project } from '@shared/types'
import type { UserPreset } from '@shared/library'
import { PROJECT_FILE, PROJECT_VERSION } from '@shared/types'

// ---------- Instellingen ----------

interface StoredSettings {
  apiKeyEnc?: string
  apiKeyPlain?: string
  /** Sleutel voor fal.ai (bijv. tegoed via Vercel). */
  falKeyEnc?: string
  falKeyPlain?: string
  /** Welke dienst de AI levert: Anthropic (Claude) of fal.ai. */
  aiProvider?: 'anthropic' | 'fal'
  falModel?: string
  model: string
  recent: string[]
  /** Map waarin nieuwe projecten komen (laatst gekozen). */
  projectsDir?: string
  /** Laatst gekozen exportmap per project. */
  exportDirs?: Record<string, string>
}

const settingsPath = () => join(app.getPath('userData'), 'settings.json')
export const DEFAULT_MODEL = 'claude-opus-5-5'
export const DEFAULT_FAL_MODEL = 'anthropic/claude-sonnet-4.5'
/** Oude standaardmodellen die fal niet meer aanbiedt: behandelen als "niet ingesteld". */
const RETIRED_FAL_MODELS = ['anthropic/claude-3.7-sonnet']

export async function readSettings(): Promise<StoredSettings> {
  try {
    const s: StoredSettings = { model: DEFAULT_MODEL, recent: [], ...JSON.parse(await readFile(settingsPath(), 'utf8')) }
    if (s.falModel && RETIRED_FAL_MODELS.includes(s.falModel)) delete s.falModel
    return s
  } catch {
    return { model: DEFAULT_MODEL, recent: [] }
  }
}

export async function writeSettings(s: StoredSettings): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  // In één keer vervangen (nooit half geschreven) en alleen leesbaar voor jezelf: er kunnen sleutels in staan
  await writeInside(app.getPath('userData'), 'settings.json', JSON.stringify(s, null, 2), 0o600)
}

/** Staat een sleutel onversleuteld op schijf (geen OS-sleutelhanger beschikbaar)? */
export async function apiKeyIsPlain(): Promise<boolean> {
  const s = await readSettings()
  return !!(s.apiKeyPlain || s.falKeyPlain)
}

const SLOTS = { anthropic: ['apiKeyEnc', 'apiKeyPlain', 'ANTHROPIC_API_KEY'], fal: ['falKeyEnc', 'falKeyPlain', 'FAL_KEY'] } as const

export async function storeApiKey(key: string, which: 'anthropic' | 'fal' = 'anthropic'): Promise<void> {
  const s = await readSettings()
  const [enc, plain] = SLOTS[which]
  delete s[enc]
  delete s[plain]
  if (key) {
    if (safeStorage.isEncryptionAvailable()) s[enc] = safeStorage.encryptString(key).toString('base64')
    else s[plain] = key
  }
  await writeSettings(s)
}

export async function loadApiKey(which: 'anthropic' | 'fal' = 'anthropic'): Promise<string | null> {
  const s = await readSettings()
  const [enc, plain, env] = SLOTS[which]
  if (s[enc]) {
    try {
      return safeStorage.decryptString(Buffer.from(s[enc]!, 'base64'))
    } catch {
      // Sleutelhanger gewijzigd of niet bereikbaar: dan opnieuw invullen
      return null
    }
  }
  return s[plain] ?? process.env[env] ?? null
}

export async function addRecent(dir: string): Promise<void> {
  const s = await readSettings()
  s.recent = [dir, ...s.recent.filter((d) => d !== dir)].slice(0, 10)
  await writeSettings(s)
}

// ---------- Projectmappen ----------

export const PROJECT_DIRS = ['assets', 'fonts'] as const

export async function readProject(dir: string): Promise<OpenedProject> {
  const project = JSON.parse(await readFile(join(dir, PROJECT_FILE), 'utf8')) as Project
  if (project.version > PROJECT_VERSION) throw new Error('Dit project is gemaakt met een nieuwere versie van Bnnr Studio.')
  return { dir, project: normalizeProject(project) }
}

export async function writeProject(dir: string, project: Project): Promise<void> {
  // Via een tijdelijk bestand: nooit een half geschreven project, en nooit via een symlink naar buiten
  await writeInside(dir, PROJECT_FILE, JSON.stringify(project, null, 2))
}

export async function initProjectDir(dir: string, project: Project, sourceDir?: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const d of PROJECT_DIRS) await mkdir(join(dir, d), { recursive: true })
  if (sourceDir) {
    for (const d of ['assets', 'fonts']) {
      const src = join(sourceDir, d)
      // Snelkoppelingen (symlinks) niet meenemen: die kunnen naar bestanden buiten het project wijzen
      if (existsSync(src)) await cp(src, join(dir, d), { recursive: true, filter: async (f) => !(await lstat(f)).isSymbolicLink() })
    }
  }
  await writeProject(dir, project)
}

/** Kopieert bestanden naar een submap van het project en geeft projectpaden terug. */
export async function copyIntoProject(dir: string, sub: 'assets' | 'fonts', files: string[]): Promise<string[]> {
  await ensureDirInside(dir, sub)
  const out: string[] = []
  for (const f of files) {
    const ext = extname(f).toLowerCase()
    const stem = basename(f, extname(f))
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'bestand'
    let name = `${stem}${ext}`
    // lstat: ook een kapotte symlink telt als bezet
    const taken = (n: string) => lstat(join(dir, sub, n)).then(() => true, () => false)
    for (let i = 2; await taken(name); i++) name = `${stem}-${i}${ext}`
    await writeInside(dir, `${sub}/${name}`, await readFile(f))
    out.push(`${sub}/${name}`)
  }
  return out
}

/** Bestandsgrootte (bytes) van elke afbeelding in assets/ (voor het assetpaneel). */
export async function assetSizes(dir: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const a of await listAssets(dir)) out[a] = await stat(join(dir, a)).then((st) => st.size, () => 0)
  return out
}

export async function listAssets(dir: string): Promise<string[]> {
  try {
    const names = await readdir(join(dir, 'assets'))
    const files: string[] = []
    for (const n of names) if ((await stat(join(dir, 'assets', n))).isFile() && !n.startsWith('.')) files.push(`assets/${n}`)
    return files.sort()
  } catch {
    return []
  }
}

// ---------- Boilerplates ----------
// Een boilerplate is gewoon een projectmap in userData/boilerplates/<id>.

const bpRoot = () => join(app.getPath('userData'), 'boilerplates')
export const BUILTIN_STARTER = 'builtin:starter-300x600'
export const BUILTIN_EMPTY = 'builtin:empty'

export async function listBoilerplates(): Promise<Boilerplate[]> {
  const list: Boilerplate[] = [
    { id: BUILTIN_EMPTY, name: 'Leeg (300×600)', builtIn: true },
    { id: BUILTIN_STARTER, name: 'Voorbeeld 300×600 (headline, packshot, CTA)', builtIn: true }
  ]
  try {
    for (const id of await readdir(bpRoot())) {
      try {
        const { project } = await readProject(join(bpRoot(), id))
        list.push({ id, name: project.name, builtIn: false })
      } catch {
        /* geen geldig project: overslaan */
      }
    }
  } catch {
    /* map bestaat nog niet */
  }
  return list
}

export async function boilerplateSource(id: string | null): Promise<{ project: Project; dir?: string }> {
  if (!id || id === BUILTIN_EMPTY) return { project: createEmptyProject() }
  if (id === BUILTIN_STARTER) return { project: createStarterProject() }
  if (!safeName(id)) throw new Error('Ongeldige boilerplate.')
  const dir = join(bpRoot(), id)
  return { project: (await readProject(dir)).project, dir }
}

export async function saveBoilerplate(dir: string, project: Project, name: string): Promise<Boilerplate> {
  const id = `${name.replace(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase()}-${newId()}`
  await initProjectDir(join(bpRoot(), id), { ...structuredClone(project), name }, dir)
  return { id, name, builtIn: false }
}

export async function deleteBoilerplate(id: string): Promise<void> {
  if (id.startsWith('builtin:') || !safeName(id)) return
  await rm(join(bpRoot(), id), { recursive: true, force: true })
}

// ---------- Eigen animatie-presets (gedeeld over alle projecten) ----------

const presetsPath = () => join(app.getPath('userData'), 'presets.json')

export async function readPresets(): Promise<UserPreset[]> {
  try {
    return JSON.parse(await readFile(presetsPath(), 'utf8')) as UserPreset[]
  } catch {
    return []
  }
}

export async function writePresets(list: UserPreset[]): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeInside(app.getPath('userData'), 'presets.json', JSON.stringify(Array.isArray(list) ? list : [], null, 2))
}

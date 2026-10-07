import { safeName } from './paths'
import { app, safeStorage } from 'electron'
import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type { Boilerplate, OpenedProject } from '@shared/api'
import { createStarterProject, newId } from '@shared/factory'
import { normalizeProject } from '@shared/sync'
import type { Project } from '@shared/types'
import type { UserPreset } from '@shared/library'
import { PROJECT_FILE, PROJECT_VERSION } from '@shared/types'

// ---------- Instellingen ----------

interface StoredSettings {
  apiKeyEnc?: string
  apiKeyPlain?: string
  model: string
  recent: string[]
}

const settingsPath = () => join(app.getPath('userData'), 'settings.json')
export const DEFAULT_MODEL = 'claude-opus-5-5'

export async function readSettings(): Promise<StoredSettings> {
  try {
    return { model: DEFAULT_MODEL, recent: [], ...JSON.parse(await readFile(settingsPath(), 'utf8')) }
  } catch {
    return { model: DEFAULT_MODEL, recent: [] }
  }
}

export async function writeSettings(s: StoredSettings): Promise<void> {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(settingsPath(), JSON.stringify(s, null, 2))
}

export async function storeApiKey(key: string): Promise<void> {
  const s = await readSettings()
  delete s.apiKeyEnc
  delete s.apiKeyPlain
  if (key) {
    if (safeStorage.isEncryptionAvailable()) s.apiKeyEnc = safeStorage.encryptString(key).toString('base64')
    else s.apiKeyPlain = key
  }
  await writeSettings(s)
}

export async function loadApiKey(): Promise<string | null> {
  const s = await readSettings()
  if (s.apiKeyEnc) return safeStorage.decryptString(Buffer.from(s.apiKeyEnc, 'base64'))
  return s.apiKeyPlain ?? process.env.ANTHROPIC_API_KEY ?? null
}

export async function addRecent(dir: string): Promise<void> {
  const s = await readSettings()
  s.recent = [dir, ...s.recent.filter((d) => d !== dir)].slice(0, 10)
  await writeSettings(s)
}

// ---------- Projectmappen ----------

export const PROJECT_DIRS = ['assets', 'fonts', 'export'] as const

export async function readProject(dir: string): Promise<OpenedProject> {
  const project = JSON.parse(await readFile(join(dir, PROJECT_FILE), 'utf8')) as Project
  if (project.version > PROJECT_VERSION) throw new Error('Dit project is gemaakt met een nieuwere versie van Banner Studio.')
  return { dir, project: normalizeProject(project) }
}

export async function writeProject(dir: string, project: Project): Promise<void> {
  await writeFile(join(dir, PROJECT_FILE), JSON.stringify(project, null, 2))
}

export async function initProjectDir(dir: string, project: Project, sourceDir?: string): Promise<void> {
  await mkdir(dir, { recursive: true })
  for (const d of PROJECT_DIRS) await mkdir(join(dir, d), { recursive: true })
  if (sourceDir) {
    for (const d of ['assets', 'fonts']) {
      const src = join(sourceDir, d)
      if (existsSync(src)) await cp(src, join(dir, d), { recursive: true })
    }
  }
  await writeProject(dir, project)
}

/** Kopieert bestanden naar een submap van het project en geeft projectpaden terug. */
export async function copyIntoProject(dir: string, sub: 'assets' | 'fonts', files: string[]): Promise<string[]> {
  await mkdir(join(dir, sub), { recursive: true })
  const out: string[] = []
  for (const f of files) {
    const ext = extname(f).toLowerCase()
    const stem = basename(f, extname(f))
      .replace(/[^a-zA-Z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase() || 'bestand'
    let name = `${stem}${ext}`
    for (let i = 2; existsSync(join(dir, sub, name)); i++) name = `${stem}-${i}${ext}`
    await cp(f, join(dir, sub, name))
    out.push(`${sub}/${name}`)
  }
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

export async function listBoilerplates(): Promise<Boilerplate[]> {
  const list: Boilerplate[] = [{ id: BUILTIN_STARTER, name: 'Starter 300×600 (headline, packshot, CTA)', builtIn: true }]
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
  if (!id || id === BUILTIN_STARTER) return { project: createStarterProject() }
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
  await writeFile(presetsPath(), JSON.stringify(list, null, 2))
}

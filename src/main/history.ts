import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { VersionInfo } from '@shared/api'
import { PROJECT_FILE, type Project } from '@shared/types'
import { safeName } from './paths'

// Automatisch opslaan en versiegeschiedenis, in een verborgen map .bnnr in het project:
//   .bnnr/autosave.bsproj         herstelkopie van niet-opgeslagen werk (elke minuut)
//   .bnnr/versions/<tijd>.bsproj  een versie bij elke keer Opslaan (de laatste 50)

const META = '.bnnr'
const MAX_VERSIONS = 50
const autosavePath = (dir: string) => join(dir, META, 'autosave.bsproj')
const versionsDir = (dir: string) => join(dir, META, 'versions')

export async function writeAutosave(dir: string, project: Project) {
  await mkdir(join(dir, META), { recursive: true })
  await writeFile(autosavePath(dir), JSON.stringify(project))
}

export async function clearAutosave(dir: string) {
  await rm(autosavePath(dir), { force: true })
}

/** Herstelkopie die nieuwer is dan het opgeslagen project (= werk van na de laatste keer opslaan). */
export async function readNewerAutosave(dir: string): Promise<{ project: Project; savedAt: number } | null> {
  try {
    const [a, p] = await Promise.all([stat(autosavePath(dir)), stat(join(dir, PROJECT_FILE))])
    if (a.mtimeMs <= p.mtimeMs) return null
    const [auto, saved] = await Promise.all([readFile(autosavePath(dir), 'utf8'), readFile(join(dir, PROJECT_FILE), 'utf8')])
    if (JSON.stringify(JSON.parse(saved)) === auto) return null
    return { project: JSON.parse(auto) as Project, savedAt: a.mtimeMs }
  } catch {
    return null
  }
}

/** Versie bewaren (na Opslaan). Slaat over als er niets veranderd is sinds de vorige versie. */
export async function addVersion(dir: string, project: Project) {
  const vdir = versionsDir(dir)
  await mkdir(vdir, { recursive: true })
  const text = JSON.stringify(project)
  const list = (await readdir(vdir)).filter((f) => f.endsWith('.bsproj')).sort()
  const last = list[list.length - 1]
  if (last && (await readFile(join(vdir, last), 'utf8').catch(() => '')) === text) return
  const id = new Date().toISOString().replace(/[:.]/g, '-')
  await writeFile(join(vdir, `${id}.bsproj`), text)
  for (const old of [...list, `${id}.bsproj`].sort().slice(0, -MAX_VERSIONS)) await rm(join(vdir, old), { force: true })
}

export async function listVersions(dir: string): Promise<VersionInfo[]> {
  try {
    const files = (await readdir(versionsDir(dir))).filter((f) => f.endsWith('.bsproj')).sort().reverse()
    return Promise.all(
      files.map(async (f) => {
        const st = await stat(join(versionsDir(dir), f))
        return { id: f.replace(/\.bsproj$/, ''), savedAt: st.mtimeMs, bytes: st.size }
      })
    )
  } catch {
    return []
  }
}

export async function readVersion(dir: string, id: string): Promise<Project> {
  if (!safeName(id)) throw new Error('Ongeldige versie.')
  return JSON.parse(await readFile(join(versionsDir(dir), `${id}.bsproj`), 'utf8')) as Project
}

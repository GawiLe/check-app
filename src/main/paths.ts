import { lstatSync, realpathSync } from 'node:fs'
import { lstat, mkdir, rename, rm, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dirname, normalize, relative, resolve, sep } from 'node:path'

/**
 * Volledig pad van `rel` binnen `dir`. Gooit een fout als het pad (ook via `..`, een absoluut pad
 * of een symlink) buiten de map uitkomt. Gebruik dit voor elk pad dat uit een projectbestand of
 * uit de renderer komt: een gedeeld of gemanipuleerd project mag nooit buiten zijn eigen map lezen of schrijven.
 */
export function inside(dir: string, rel: string): string {
  const root = resolve(dir)
  const full = resolve(root, normalize(rel))
  if (!full.startsWith(root + sep)) throw new Error(`Pad buiten de projectmap: ${rel}`)
  let realRoot: string
  try {
    realRoot = realpathSync(root)
  } catch {
    return full
  }
  // Symlinks: het echte doel moet ook binnen de (echte) projectmap liggen. Bestaat het pad (nog) niet,
  // dan geldt dat voor de dichtstbijzijnde map die wel bestaat (een kapotte symlink telt niet als "nog niet").
  for (let p = full; ; p = dirname(p)) {
    try {
      const real = realpathSync(p)
      if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new Error(`Pad buiten de projectmap: ${rel}`)
      break
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') throw err
      // Kapotte symlink op deze plek: niet toestaan (het doel kan later alsnog buiten het project verschijnen)
      if (lstatSync(p, { throwIfNoEntry: false })?.isSymbolicLink()) throw new Error(`Pad buiten de projectmap: ${rel}`)
      if (p === root || dirname(p) === p) break
    }
  }
  return full
}

/**
 * Map binnen het project maken (stap voor stap). Weigert als een van de tussenmappen een symlink is,
 * zodat schrijven nooit via een snelkoppeling buiten het project terechtkomt.
 */
export async function ensureDirInside(dir: string, rel: string): Promise<string> {
  const root = resolve(dir)
  if (!rel || rel === '.') return root
  const full = inside(root, rel)
  let p = root
  for (const part of relative(root, full).split(sep).filter(Boolean)) {
    p = resolve(p, part)
    const st = await lstat(p).catch(() => null)
    if (st?.isSymbolicLink()) throw new Error(`Map is een snelkoppeling (symlink), niet toegestaan: ${relative(root, p)}`)
    if (!st) await mkdir(p).catch((e: NodeJS.ErrnoException) => (e.code === 'EEXIST' ? undefined : Promise.reject(e)))
    else if (!st.isDirectory()) throw new Error(`Geen map: ${relative(root, p)}`)
  }
  return full
}

/**
 * Bestand in het project schrijven zonder ooit een symlink te volgen: eerst een nieuw tijdelijk bestand
 * (exclusief aangemaakt), daarna hernoemen. Een symlink op de plek wordt zo vervangen, niet gevolgd.
 */
export async function writeInside(dir: string, rel: string, data: string | Uint8Array, mode?: number): Promise<string> {
  const full = inside(dir, rel)
  await ensureDirInside(dir, relative(resolve(dir), dirname(full)))
  if ((await lstat(full).catch(() => null))?.isDirectory()) throw new Error(`Is een map: ${rel}`)
  const tmp = `${full}.${randomUUID().slice(0, 8)}.tmp`
  await writeFile(tmp, data, { flag: 'wx', mode })
  try {
    await rename(tmp, full)
  } catch (e) {
    await rm(tmp, { force: true })
    throw e
  }
  return full
}

/** Veilige naam voor één map- of bestandsnaam (geen scheidingstekens of `..`). */
export const safeName = (s: string) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) && !s.includes('..')

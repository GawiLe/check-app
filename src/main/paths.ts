import { realpathSync } from 'node:fs'
import { normalize, resolve, sep } from 'node:path'

/**
 * Volledig pad van `rel` binnen `dir`. Gooit een fout als het pad (ook via `..`, een absoluut pad
 * of een symlink) buiten de map uitkomt. Gebruik dit voor elk pad dat uit een projectbestand of
 * uit de renderer komt: een gedeeld of gemanipuleerd project mag nooit buiten zijn eigen map lezen of schrijven.
 */
export function inside(dir: string, rel: string): string {
  const root = resolve(dir)
  const full = resolve(root, normalize(rel))
  if (!full.startsWith(root + sep)) throw new Error(`Pad buiten de projectmap: ${rel}`)
  try {
    // Symlinks: het echte doel moet ook binnen de (echte) projectmap liggen
    const realRoot = realpathSync(root)
    const real = realpathSync(full)
    if (real !== realRoot && !real.startsWith(realRoot + sep)) throw new Error(`Pad buiten de projectmap: ${rel}`)
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
  }
  return full
}

/** Veilige naam voor één map- of bestandsnaam (geen scheidingstekens of `..`). */
export const safeName = (s: string) => /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(s) && !s.includes('..')

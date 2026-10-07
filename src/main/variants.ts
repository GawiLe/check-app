import { existsSync } from 'node:fs'
import { cp, mkdir, readdir, readFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import type { VariantRequest, VariantResult } from '@shared/api'
import { TARGET_IDS } from '@shared/specs'
import { applyVariant, variantFolderName } from '@shared/variants'
import { exportBanners } from './exporter'
import { inside } from './paths'
import { writeProject } from './storage'

/**
 * Maakt per variant een eigen projectmap naast het origineel ("<project>-<variant>") met dezelfde
 * assets en fonts en het aangepaste projectbestand. Bestaande variantmappen worden bijgewerkt.
 * Optioneel wordt elke variant meteen geëxporteerd.
 */
export async function createVariants(req: VariantRequest): Promise<VariantResult[]> {
  const set = req.project.variants
  if (!set?.variants.length) return []
  const src = resolve(req.dir)
  const targets = (req.exportTargets ?? []).filter((t) => TARGET_IDS.includes(t))
  const used = new Set<string>()
  const out: VariantResult[] = []
  for (const v of set.variants) {
    // Afbeeldingen moeten uit de eigen projectmap komen
    for (const [key, val] of Object.entries(v.values))
      if (key.endsWith('|image') && val && (!val.startsWith('assets/') || !inside(src, val)))
        throw new Error(`Variant "${v.name}": afbeelding moet in assets/ van het project staan.`)
    // Een bestaande map wordt alleen bijgewerkt als het déze variant van dít template is;
    // anders (bijv. een ander project met dezelfde naam) kiezen we een vrije naam.
    const marker = { template: basename(src), variantId: v.id }
    const base = variantFolderName(basename(src), v.name)
    let folder = base
    for (let i = 2; used.has(folder) || !(await usable(join(dirname(src), folder), marker)); i++) folder = `${base}-${i}`
    used.add(folder)
    const dir = join(dirname(src), folder)
    if (resolve(dir) === src) throw new Error(`Variant "${v.name}" zou het origineel overschrijven.`)
    const project = { ...applyVariant(req.project, v, set.fields), variantOf: marker }
    await mkdir(dir, { recursive: true })
    for (const d of ['assets', 'fonts']) if (existsSync(join(src, d))) await cp(join(src, d), join(dir, d), { recursive: true, force: true })
    await mkdir(join(dir, 'export'), { recursive: true })
    await writeProject(dir, project)
    const exports = targets.length ? await exportBanners({ dir, project, targets, compositionIds: project.compositions.map((c) => c.id) }) : []
    out.push({ name: v.name, dir, exports })
  }
  return out
}

/** Mag deze map (opnieuw) voor deze variant gebruikt worden? Leeg/nieuw, of eerder door deze variant gemaakt. */
async function usable(dir: string, marker: { template: string; variantId: string }): Promise<boolean> {
  if (!existsSync(dir)) return true
  try {
    const p = JSON.parse(await readFile(join(dir, 'project.bsproj'), 'utf8'))
    return p.variantOf?.template === marker.template && p.variantOf?.variantId === marker.variantId
  } catch {
    // Geen (leesbaar) projectbestand: alleen een lege map is bruikbaar
    return (await readdir(dir).catch(() => ['x'])).length === 0
  }
}

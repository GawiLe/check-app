import { existsSync } from 'node:fs'
import { cp, mkdir } from 'node:fs/promises'
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
    for (const val of Object.values(v.values)) if (val.startsWith('assets/')) inside(src, val)
    let folder = variantFolderName(basename(src), v.name)
    for (let i = 2; used.has(folder); i++) folder = `${variantFolderName(basename(src), v.name)}-${i}`
    used.add(folder)
    const dir = join(dirname(src), folder)
    if (resolve(dir) === src) throw new Error(`Variant "${v.name}" zou het origineel overschrijven.`)
    const project = applyVariant(req.project, v, set.fields)
    await mkdir(dir, { recursive: true })
    for (const d of ['assets', 'fonts']) if (existsSync(join(src, d))) await cp(join(src, d), join(dir, d), { recursive: true, force: true })
    await mkdir(join(dir, 'export'), { recursive: true })
    await writeProject(dir, project)
    const exports = targets.length ? await exportBanners({ dir, project, targets, compositionIds: project.compositions.map((c) => c.id) }) : []
    out.push({ name: v.name, dir, exports })
  }
  return out
}

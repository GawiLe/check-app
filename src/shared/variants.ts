import { baseComp } from './sync'
import { walk } from './tree'
import type { Layer, Project, Variant } from './types'

// Varianten (template): het project is de basis; je kiest welke teksten en afbeeldingen variabel
// zijn en vult per variant alleen in wat anders is. Een veld geldt voor alle formaten tegelijk:
// dezelfde laag heeft in elk formaat hetzelfde linkId (of, binnen een compositie, hetzelfde id).

export type FieldKind = 'text' | 'image'

export interface VariantField {
  key: string
  kind: FieldKind
  /** Laagnaam, met de compositie(s) erboven: "Scène 1 › Headline". */
  label: string
  /** Waarde in het origineel. */
  value: string
}

const linkOf = (l: Layer) => l.linkId ?? l.id
export const fieldKey = (l: Layer, kind: FieldKind) => `${linkOf(l)}|${kind}`

/** Alle teksten en afbeeldingen in de basis die variabel kunnen zijn, van boven naar onder. */
export function variantFields(project: Project): VariantField[] {
  const comp = baseComp(project) ?? project.compositions[0]
  const out: VariantField[] = []
  if (!comp) return out
  walk(comp.layers, (l, anc) => {
    const label = [...anc.map((a) => a.name), l.name].join(' › ')
    if (l.type === 'text' && l.text) out.push({ key: fieldKey(l, 'text'), kind: 'text', label, value: l.text.content })
    if (l.type === 'image' && l.image) out.push({ key: fieldKey(l, 'image'), kind: 'image', label, value: l.image.src })
  })
  return out
}

/**
 * Het project voor één variant: alle formaten krijgen de ingevulde waarden. Lege waarden en
 * velden die niet (meer) gekozen zijn, blijven zoals in het origineel. Positie, maat en
 * animatie veranderen niet, zodat de opmaak van alle varianten gelijk blijft.
 */
export function applyVariant(project: Project, variant: Variant, fields: string[]): Project {
  const p: Project = structuredClone(project)
  delete p.variants
  delete p.variantOf
  p.name = `${project.name} – ${variant.name}`
  const chosen = new Set(fields)
  for (const c of p.compositions)
    walk(c.layers, (l) => {
      const t = l.text && chosen.has(fieldKey(l, 'text')) ? variant.values[fieldKey(l, 'text')] : undefined
      if (t != null && t !== '') l.text!.content = t
      const img = l.image && chosen.has(fieldKey(l, 'image')) ? variant.values[fieldKey(l, 'image')] : undefined
      if (img) {
        const oldFile = l.image!.src.split('/').pop()
        l.image!.src = img
        if (l.name === oldFile) l.name = img.split('/').pop()!
      }
    })
  return p
}

/** Mapnaam voor een variant naast de projectmap: "<project>-<variant>". */
export function variantFolderName(projectFolder: string, variantName: string): string {
  const slug = variantName
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${projectFolder}-${slug || 'variant'}`
}

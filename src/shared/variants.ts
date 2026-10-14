import { baseComp } from './sync'
import { walk } from './tree'
import type { Composition, Layer, Project, Variant } from './types'

// Varianten (template): het project is de basis; je kiest welke teksten en afbeeldingen variabel
// zijn en vult per variant alleen in wat anders is. Een veld geldt voor alle formaten tegelijk:
// dezelfde laag heeft in elk formaat hetzelfde linkId (of, binnen een compositie, hetzelfde id).

export type FieldKind = 'text' | 'image'

export interface VariantField {
  key: string
  kind: FieldKind
  /** Laagnaam, met de compositie(s) erboven: "Scène 1 › Headline" (per formaat: "… · 300×250"). */
  label: string
  /** Waarde in het origineel (per formaat: in dat formaat). */
  value: string
  /** Alleen bij een veld per formaat: het formaat. */
  compId?: string
}

/** Een tekst of afbeelding, met per formaat zijn eigen originele waarde. */
export interface FieldGroup {
  /** Veld voor alle formaten tegelijk. */
  base: VariantField
  /** Hetzelfde veld per formaat (alleen formaten waarin de laag staat). */
  formats: VariantField[]
  /** Verschilt het origineel per formaat (bijv. een eigen achtergrond per formaat)? Dan standaard per formaat. */
  differs: boolean
}

const linkOf = (l: Layer) => l.linkId ?? l.id
export const fieldKey = (l: Layer, kind: FieldKind) => `${linkOf(l)}|${kind}`
/** Sleutel van een veld in één formaat. */
export const formatKey = (key: string, compId: string) => `${key}@${compId}`
const size = (c: Composition) => `${c.width}×${c.height}`

/**
 * Alle teksten en afbeeldingen die variabel kunnen zijn: eerst die van de basis (in alle formaten), daarna
 * eigen lagen van andere formaten. Per veld de waarde in elk formaat.
 */
export function variantFieldGroups(project: Project): FieldGroup[] {
  const base = baseComp(project) ?? project.compositions[0]
  if (!base) return []
  const comps = [base, ...project.compositions.filter((c) => c !== base)]
  const groups = new Map<string, FieldGroup>()
  for (const c of comps) {
    walk(c.layers, (l, anc) => {
      const kinds: [FieldKind, string][] = []
      if (l.type === 'text' && l.text) kinds.push(['text', l.text.content])
      if (l.type === 'image' && l.image) kinds.push(['image', l.image.src])
      for (const [kind, value] of kinds) {
        const key = fieldKey(l, kind)
        let g = groups.get(key)
        if (!g) {
          // Eigen laag van een ander formaat dan de basis: met het formaat in de naam
          const label = [...anc.map((a) => a.name), l.name].join(' › ') + (c === base ? '' : ` (${size(c)})`)
          g = { base: { key, kind, label, value }, formats: [], differs: false }
          groups.set(key, g)
        }
        if (g.formats.some((f) => f.compId === c.id)) continue
        g.formats.push({ key: formatKey(key, c.id), kind, label: `${g.base.label} · ${size(c)}`, value, compId: c.id })
      }
    })
  }
  for (const g of groups.values()) g.differs = new Set(g.formats.map((f) => f.value)).size > 1
  return [...groups.values()]
}

/** Alle velden plat (voor alle formaten, en per formaat), in de volgorde van het scherm. */
export function variantFields(project: Project): VariantField[] {
  return variantFieldGroups(project).flatMap((g) => [g.base, ...(g.formats.length > 1 ? g.formats : [])])
}

/**
 * Het project voor één variant: alle formaten krijgen de ingevulde waarden. Een veld per formaat gaat voor
 * het veld voor alle formaten. Lege waarden en velden die niet (meer) gekozen zijn, blijven zoals in het
 * origineel. Positie, maat en animatie veranderen niet, zodat de opmaak van alle varianten gelijk blijft.
 */
export function applyVariant(project: Project, variant: Variant, fields: string[]): Project {
  const p: Project = structuredClone(project)
  delete p.variants
  delete p.variantOf
  p.name = `${project.name} – ${variant.name}`
  const chosen = new Set(fields)
  const valueFor = (c: Composition, key: string) => {
    const fk = formatKey(key, c.id)
    if (chosen.has(fk)) return variant.values[fk]
    if (chosen.has(key)) return variant.values[key]
    return undefined
  }
  for (const c of p.compositions)
    walk(c.layers, (l) => {
      const t = l.text ? valueFor(c, fieldKey(l, 'text')) : undefined
      if (t != null && t !== '') l.text!.content = t
      const img = l.image ? valueFor(c, fieldKey(l, 'image')) : undefined
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

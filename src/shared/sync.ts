import { mapLayerToFormat } from './factory'
import type { Composition, Layer, Project } from './types'
import { ANIM_PROPS, PROJECT_VERSION } from './types'

// Eén basisformaat is leidend. Wat je in de basis wijzigt, gaat mee naar alle
// afgeleide formaten (posities en maten omgerekend naar dat formaat), behalve de
// eigenschappen die je in een afgeleid formaat zelf anders hebt gezet: die worden
// als "override" onthouden en niet meer overschreven, tot je ze herstelt.

/** Oudere projecten aanvullen met nieuwe velden. */
export function normalizeProject(p: Project): Project {
  p.syncFormats ??= true
  p.politeLoad ??= true
  for (const c of p.compositions) for (const l of c.layers) l.linkId ??= l.id
  p.version = PROJECT_VERSION
  return p
}

/** Per formaat, nooit gesynchroniseerd. */
const LOCAL = new Set(['id', 'linkId', 'overrides', 'locked'])
const GROUPS = ['text', 'image', 'shape', 'writeon'] as const

/** Alle eigenschap-sleutels van een laag, zoals "x", "text.content", "tracks.opacity", "intro". */
export function layerKeys(...layers: Layer[]): string[] {
  const keys = new Set<string>(ANIM_PROPS.map((p) => `tracks.${p}`))
  for (const l of layers)
    for (const k of Object.keys(l)) {
      if (LOCAL.has(k) || k === 'tracks') continue
      if ((GROUPS as readonly string[]).includes(k)) {
        const g = l[k as (typeof GROUPS)[number]] as Record<string, unknown> | undefined
        if (g) for (const sub of Object.keys(g)) keys.add(`${k}.${sub}`)
      } else keys.add(k)
    }
  return [...keys]
}

export function getKey(l: Layer, key: string): unknown {
  const [a, b] = key.split('.')
  if (a === 'tracks') return l.tracks[b as keyof Layer['tracks']]
  if (b !== undefined) return (l[a as keyof Layer] as Record<string, unknown> | undefined)?.[b]
  return l[a as keyof Layer]
}

function setKey(l: Layer, key: string, value: unknown) {
  const [a, b] = key.split('.')
  const v = value === undefined ? undefined : structuredClone(value)
  if (a === 'tracks') {
    if (v === undefined) delete l.tracks[b as keyof Layer['tracks']]
    else (l.tracks as Record<string, unknown>)[b] = v
  } else if (b !== undefined) {
    const g = l[a as keyof Layer] as Record<string, unknown> | undefined
    if (g) g[b] = v
  } else if (v === undefined) delete (l as unknown as Record<string, unknown>)[a]
  else (l as unknown as Record<string, unknown>)[a] = v
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

const COMP_KEYS = ['duration', 'loops', 'background', 'border'] as const

/** Leesbare naam van een override-sleutel (voor de UI). */
export const OVERRIDE_LABEL: Record<string, string> = {
  x: 'positie X',
  y: 'positie Y',
  width: 'breedte',
  height: 'hoogte',
  scale: 'schaal',
  rotation: 'rotatie',
  opacity: 'dekking',
  visible: 'zichtbaarheid',
  name: 'naam',
  intro: 'binnenkomst',
  children: 'inhoud groep',
  start: 'in-punt',
  end: 'uit-punt',
  outro: 'uitgang',
  emphasis: 'accent',
  revealMode: 'wipe',
  cta: 'CTA-hover',
  'text.content': 'tekst',
  'text.size': 'tekstgrootte',
  'text.color': 'tekstkleur',
  'text.fontId': 'font',
  'text.weight': 'gewicht',
  'text.align': 'uitlijning',
  'text.lineHeight': 'regelhoogte',
  'text.letterSpacing': 'letterspatiëring',
  'image.src': 'afbeelding',
  'image.fit': 'passend',
  'shape.fill': 'vulling',
  'shape.radius': 'hoekradius',
  'writeon.content': 'write-on tekst',
  'writeon.size': 'write-on grootte',
  'writeon.color': 'write-on kleur',
  duration: 'duur',
  loops: 'loops',
  background: 'achtergrond',
  border: 'rand'
}
export const overrideLabel = (k: string) =>
  OVERRIDE_LABEL[k] ?? (k.startsWith('tracks.') ? `keyframes ${k.slice(7)}` : k.replace('.', ' '))

export const baseComp = (p: Project): Composition | undefined => p.compositions.find((c) => c.id === p.baseCompositionId)

/** Zet de basislaag over naar een afgeleide laag, behalve de overrides. */
function applyFromBase(base: Composition, src: Layer, dst: Composition, target: Layer, onlyKeys?: string[]) {
  const mapped = mapLayerToFormat(src, base, dst.width, dst.height)
  const skip = new Set(target.overrides ?? [])
  for (const k of onlyKeys ?? layerKeys(src, target)) {
    if (skip.has(k)) continue
    const keepIds = k === 'children' ? idsByLink(target.children ?? []) : null
    setKey(target, k, getKey(mapped, k))
    // Inhoud van een groep: ids per formaat stabiel houden (selectie blijft werken).
    if (keepIds && target.children) restoreIds(target.children, keepIds)
  }
}

function idsByLink(list: Layer[], out = new Map<string, string>()) {
  for (const l of list) {
    out.set(l.linkId, l.id)
    if (l.children) idsByLink(l.children, out)
  }
  return out
}

function restoreIds(list: Layer[], ids: Map<string, string>) {
  for (const l of list) {
    l.id = ids.get(l.linkId) ?? l.id
    if (l.children) restoreIds(l.children, ids)
  }
}

/**
 * Na een wijziging: komt die uit de basis, dan doorzetten naar de afgeleide formaten;
 * komt die uit een afgeleid formaat, dan de gewijzigde eigenschappen als override markeren.
 */
export function syncFormats(prev: Project, next: Project, compId: string): void {
  if (!next.syncFormats) return
  const srcPrev = prev.compositions.find((c) => c.id === compId)
  const src = next.compositions.find((c) => c.id === compId)
  if (!src || !srcPrev) return
  const prevById = new Map(srcPrev.layers.map((l) => [l.id, l]))

  // ---- Wijziging in een afgeleid formaat: overrides bijhouden ----
  if (compId !== next.baseCompositionId) {
    for (const l of src.layers) {
      const before = prevById.get(l.id)
      if (!before) continue
      const changed = layerKeys(before, l).filter((k) => !same(getKey(before, k), getKey(l, k)))
      if (changed.length) l.overrides = [...new Set([...(l.overrides ?? []), ...changed])]
    }
    const compChanged = COMP_KEYS.filter((k) => !same(srcPrev[k], src[k]))
    if (compChanged.length) src.overrides = [...new Set([...(src.overrides ?? []), ...compChanged])]
    return
  }

  // ---- Wijziging in de basis: doorzetten ----
  const changed = src.layers.filter((l) => !same(prevById.get(l.id), l))
  const added = new Set(src.layers.filter((l) => !prevById.has(l.id)).map((l) => l.id))
  const nextLinks = new Set(src.layers.map((l) => l.linkId))
  const removedLinks = srcPrev.layers.filter((l) => !nextLinks.has(l.linkId)).map((l) => l.linkId)
  const orderChanged = !same(
    srcPrev.layers.map((l) => l.linkId),
    src.layers.map((l) => l.linkId)
  )
  const compChanged = COMP_KEYS.filter((k) => !same(srcPrev[k], src[k]))

  for (const dst of next.compositions) {
    if (dst.id === src.id) continue
    for (const k of compChanged) if (!dst.overrides?.includes(k)) (dst as unknown as Record<string, unknown>)[k] = structuredClone(src[k])
    if (removedLinks.length) dst.layers = dst.layers.filter((l) => !removedLinks.includes(l.linkId))
    for (const l of changed) {
      const target = dst.layers.find((x) => x.linkId === l.linkId)
      if (target) {
        const before = prevById.get(l.id)!
        // Geometrie hangt samen (x hangt af van de breedte): bij een wijziging alles herberekenen.
        applyFromBase(src, l, dst, target, layerKeys(before, l).filter((k) => !same(getKey(before, k), getKey(l, k))).flatMap(geometryGroup))
      } else if (added.has(l.id)) dst.layers.push(mapLayerToFormat(l, src, dst.width, dst.height))
    }
    if (orderChanged || added.size) reorderLike(src, dst)
  }
}

const GEOMETRY = ['x', 'y', 'width', 'height', 'tracks.x', 'tracks.y']
const geometryGroup = (k: string) => (GEOMETRY.includes(k) ? GEOMETRY : [k])

/** Gekoppelde lagen in dezelfde volgorde zetten als in de basis; eigen lagen blijven staan. */
function reorderLike(src: Composition, dst: Composition) {
  const order = new Map(src.layers.map((l, i) => [l.linkId, i]))
  const linked = dst.layers.filter((l) => order.has(l.linkId)).sort((a, b) => order.get(a.linkId)! - order.get(b.linkId)!)
  let i = 0
  dst.layers = dst.layers.map((l) => (order.has(l.linkId) ? linked[i++] : l))
}

/** Overrides van een laag herstellen naar de basis (alle, of alleen de opgegeven sleutels). */
export function resetOverrides(p: Project, compId: string, layerId: string, keys?: string[]): void {
  const base = baseComp(p)
  const dst = p.compositions.find((c) => c.id === compId)
  const target = dst?.layers.find((l) => l.id === layerId)
  if (!base || !dst || !target || dst.id === base.id) return
  const src = base.layers.find((l) => l.linkId === target.linkId)
  if (!src) return
  const reset = keys ?? target.overrides ?? []
  target.overrides = (target.overrides ?? []).filter((k) => !reset.includes(k))
  if (!target.overrides.length) delete target.overrides
  applyFromBase(base, src, dst, target, reset.flatMap(geometryGroup))
}

export function resetCompOverrides(p: Project, compId: string, keys?: string[]): void {
  const base = baseComp(p)
  const dst = p.compositions.find((c) => c.id === compId)
  if (!base || !dst || dst.id === base.id) return
  const reset = keys ?? dst.overrides ?? []
  for (const k of reset) if ((COMP_KEYS as readonly string[]).includes(k)) (dst as unknown as Record<string, unknown>)[k] = structuredClone(base[k as (typeof COMP_KEYS)[number]])
  dst.overrides = (dst.overrides ?? []).filter((k) => !reset.includes(k))
  if (!dst.overrides.length) delete dst.overrides
}

/** Bestaat deze laag in de basis? (anders is het een eigen laag van dit formaat) */
export function isLinkedToBase(p: Project, l: Layer): boolean {
  return !!baseComp(p)?.layers.some((b) => b.linkId === l.linkId)
}

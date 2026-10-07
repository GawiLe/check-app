import { round } from './anim'
import { newId } from './factory'
import type { Composition, Layer } from './types'
import { ANIM_PROPS } from './types'

// Geneste lagen (groepen / pre-comps) en tijdsbereik (in- en uit-punt).

export interface Found {
  layer: Layer
  /** De lijst waar de laag in staat (comp.layers of children van een groep). */
  list: Layer[]
  index: number
  /** Groepen van buiten naar binnen. */
  ancestors: Layer[]
}

export function findDeep(layers: Layer[], id: string, ancestors: Layer[] = []): Found | null {
  for (let i = 0; i < layers.length; i++) {
    const l = layers[i]
    if (l.id === id) return { layer: l, list: layers, index: i, ancestors }
    if (l.children) {
      const f = findDeep(l.children, id, [...ancestors, l])
      if (f) return f
    }
  }
  return null
}

export function walk(layers: Layer[], fn: (l: Layer, ancestors: Layer[]) => void, ancestors: Layer[] = []) {
  for (const l of layers) {
    fn(l, ancestors)
    if (l.children) walk(l.children, fn, [...ancestors, l])
  }
}

export function allLayers(layers: Layer[]): Layer[] {
  const out: Layer[] = []
  walk(layers, (l) => out.push(l))
  return out
}

/** Tijd binnen een groep: de tijd van de buitenwereld min de in-punten van alle bovenliggende groepen. */
export const localTime = (t: number, ancestors: Layer[]) => ancestors.reduce((acc, g) => acc - (g.start ?? 0), t)

/** Is de laag zichtbaar op tijd t (in de tijd van zijn eigen lijst)? */
export const activeAt = (l: Layer, t: number) => t >= (l.start ?? 0) - 1e-6 && (l.end == null || t < l.end - 1e-6)

/** Laatste moment waarop er in de laag iets beweegt (in de tijd van zijn eigen lijst). */
export function contentEnd(l: Layer): number {
  let end = l.start ?? 0
  for (const p of ANIM_PROPS) for (const k of l.tracks[p] ?? []) end = Math.max(end, k.t)
  if (l.intro) end = Math.max(end, l.intro.start + l.intro.duration)
  if (l.emphasis) end = Math.max(end, l.emphasis.start + l.emphasis.duration)
  if (l.outro) end = Math.max(end, l.outro.start + l.outro.duration)
  if (l.children) for (const c of l.children) end = Math.max(end, (l.start ?? 0) + contentEnd(c))
  return end
}

/** Lengte van een laag in de tijdlijn: uit-punt min in-punt, of de inhoud plus 1,5s stilstand. */
export function layerLength(l: Layer): number {
  const s = l.start ?? 0
  if (l.end != null) return Math.max(0.1, l.end - s)
  return Math.max(1, contentEnd(l) - s + 1.5)
}

/** Verschuift een laag in de tijd, met al zijn animaties (bij een groep gaat de inhoud vanzelf mee). */
export function shiftTiming(l: Layer, d: number, clamp = true) {
  if (!d) return
  l.start = round(clamp ? Math.max(0, (l.start ?? 0) + d) : (l.start ?? 0) + d)
  if (l.end != null) l.end = round(l.end + d)
  for (const p of ANIM_PROPS) if (l.tracks[p]) l.tracks[p] = l.tracks[p]!.map((k) => ({ ...k, t: round(k.t + d) }))
  if (l.intro) l.intro = { ...l.intro, start: round(l.intro.start + d) }
  if (l.outro) l.outro = { ...l.outro, start: round(l.outro.start + d) }
  if (l.emphasis) l.emphasis = { ...l.emphasis, start: round(l.emphasis.start + d) }
  if (l.start === 0 && l.type !== 'group') delete l.start
}

/**
 * In-punt verplaatsen zonder de animatie te verschuiven (trimmen, zoals in AE).
 * Bij een groep blijft de inhoud op dezelfde absolute tijd staan.
 */
export function trimIn(l: Layer, newStart: number) {
  const old = l.start ?? 0
  const s = round(Math.max(0, Math.min(newStart, (l.end ?? Infinity) - 0.1)))
  if (l.type === 'group') for (const c of l.children ?? []) shiftTiming(c, old - s, false)
  l.start = s
}

export function trimOut(l: Layer, newEnd: number | null) {
  l.end = newEnd == null ? null : round(Math.max(newEnd, (l.start ?? 0) + 0.1))
  if (l.end == null) delete l.end
}

/** Groepeert lagen (uit dezelfde lijst) tot één groep. Geeft de groep terug. */
export function groupLayers(comp: Composition, ids: string[], name = 'Groep'): Layer | null {
  const found = ids.map((id) => findDeep(comp.layers, id)).filter((f): f is Found => !!f)
  if (!found.length) return null
  const list = found[0].list
  const members = found.filter((f) => f.list === list).sort((a, b) => a.index - b.index)
  const x = Math.min(...members.map((f) => f.layer.x))
  const y = Math.min(...members.map((f) => f.layer.y))
  const w = Math.max(...members.map((f) => f.layer.x + f.layer.width)) - x
  const h = Math.max(...members.map((f) => f.layer.y + f.layer.height)) - y
  const children = members.map((f) => {
    const c = f.layer
    c.x = round(c.x - x, 1)
    c.y = round(c.y - y, 1)
    if (c.tracks.x) c.tracks.x = c.tracks.x.map((k) => ({ ...k, v: round(k.v - x, 1) }))
    if (c.tracks.y) c.tracks.y = c.tracks.y.map((k) => ({ ...k, v: round(k.v - y, 1) }))
    return c
  })
  const id = newId('g')
  const group: Layer = {
    id,
    linkId: id,
    name,
    type: 'group',
    visible: true,
    locked: false,
    x: round(x, 1),
    y: round(y, 1),
    width: round(w, 1),
    height: round(h, 1),
    rotation: 0,
    scale: 1,
    opacity: 1,
    reveal: 1,
    revealMode: 'none',
    cta: false,
    tracks: {},
    children,
    start: 0
  }
  const at = members[0].index
  for (const f of [...members].reverse()) list.splice(f.index, 1)
  list.splice(at, 0, group)
  return group
}

/** Haalt een groep uit elkaar; de lagen komen terug op hun plek in de buitenwereld. */
export function ungroup(comp: Composition, groupId: string): string[] {
  const f = findDeep(comp.layers, groupId)
  if (!f || f.layer.type !== 'group') return []
  const g = f.layer
  const kids = (g.children ?? []).map((c) => {
    c.x = round(c.x + g.x, 1)
    c.y = round(c.y + g.y, 1)
    if (c.tracks.x) c.tracks.x = c.tracks.x.map((k) => ({ ...k, v: round(k.v + g.x, 1) }))
    if (c.tracks.y) c.tracks.y = c.tracks.y.map((k) => ({ ...k, v: round(k.v + g.y, 1) }))
    shiftTiming(c, g.start ?? 0)
    return c
  })
  f.list.splice(f.index, 1, ...kids)
  return kids.map((k) => k.id)
}

/**
 * Zet lagen achter elkaar in de tijd (zoals "Sequence Layers" in After Effects):
 * elke laag begint waar de vorige eindigt, eventueel met overlap.
 */
export function sequenceLayers(comp: Composition, ids: string[], overlap = 0) {
  const found = ids.map((id) => findDeep(comp.layers, id)).filter((f): f is Found => !!f)
  if (found.length < 2) return
  const list = found[0].list
  const members = found.filter((f) => f.list === list).sort((a, b) => a.index - b.index)
  let t = members[0].layer.start ?? 0
  for (const { layer } of members) {
    const len = layerLength(layer)
    shiftTiming(layer, t - (layer.start ?? 0))
    layer.start = round(t)
    layer.end = round(t + len)
    t = t + len - overlap
  }
  comp.duration = Math.max(comp.duration, Math.ceil(t + overlap))
}

/** Kopie van een laag (en zijn inhoud) met nieuwe ids. */
export function cloneLayer(l: Layer): Layer {
  const c: Layer = structuredClone(l)
  const renew = (x: Layer) => {
    x.id = newId(x.type === 'group' ? 'g' : 'l')
    x.linkId = x.id
    delete x.overrides
    x.children?.forEach(renew)
  }
  renew(c)
  return c
}

/** Som van posities en in-punten van de bovenliggende composities. */
function ancestorOffset(ancestors: Layer[]) {
  return ancestors.reduce((a, g) => ({ x: a.x + g.x, y: a.y + g.y, t: a.t + (g.start ?? 0) }), { x: 0, y: 0, t: 0 })
}

/**
 * Laag verslepen in de lagenlijst: vóór of na een andere laag. Mag ook naar een
 * andere compositie; positie en timing worden dan omgerekend zodat de laag op
 * dezelfde plek en hetzelfde moment blijft staan.
 */
export function reorderLayer(comp: Composition, id: string, targetId: string, where: 'before' | 'after'): boolean {
  if (id === targetId) return false
  const src = findDeep(comp.layers, id)
  const dst = findDeep(comp.layers, targetId)
  if (!src || !dst) return false
  // Niet in zichzelf of een eigen kind plaatsen
  if (dst.ancestors.some((a) => a.id === id)) return false
  const layer = src.layer
  if (src.list !== dst.list) {
    const a = ancestorOffset(src.ancestors)
    const b = ancestorOffset(dst.ancestors)
    const dx = a.x - b.x
    const dy = a.y - b.y
    layer.x = round(layer.x + dx, 1)
    layer.y = round(layer.y + dy, 1)
    if (layer.tracks.x) layer.tracks.x = layer.tracks.x.map((k) => ({ ...k, v: round(k.v + dx, 1) }))
    if (layer.tracks.y) layer.tracks.y = layer.tracks.y.map((k) => ({ ...k, v: round(k.v + dy, 1) }))
    shiftTiming(layer, a.t - b.t, false)
  }
  src.list.splice(src.index, 1)
  const ti = dst.list.indexOf(dst.layer)
  dst.list.splice(where === 'before' ? ti : ti + 1, 0, layer)
  return true
}

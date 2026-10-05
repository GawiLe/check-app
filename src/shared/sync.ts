import { round } from './anim'
import { mapLayerToFormat } from './factory'
import { scaleMotion } from './motion'
import type { AnimProp, Composition, Keyframe, Layer, Project } from './types'
import { PROJECT_VERSION } from './types'

// Meerdere formaten in één werkbestand. Lagen met hetzelfde linkId zijn "dezelfde"
// laag in verschillende formaten. Na elke wijziging in het actieve formaat worden
// inhoud en timing doorgezet naar de andere formaten; positie en maat blijven per formaat.

/** Oudere projecten aanvullen met nieuwe velden. */
export function normalizeProject(p: Project): Project {
  p.syncFormats ??= true
  p.politeLoad ??= true
  for (const c of p.compositions) for (const l of c.layers) l.linkId ??= l.id
  p.version = PROJECT_VERSION
  return p
}

const TIMING_PROPS: AnimProp[] = ['scale', 'rotation', 'opacity', 'reveal']

/** Inhoud kopiëren; formaat-specifieke dingen (positie, maat, lettergrootte) niet. */
function copyContent(src: Layer, dst: Layer) {
  dst.name = src.name
  dst.visible = src.visible
  dst.cta = src.cta
  dst.revealMode = src.revealMode
  dst.opacity = src.opacity
  dst.rotation = src.rotation
  dst.reveal = src.reveal
  if (src.text && dst.text) {
    const size = dst.text.size
    dst.text = { ...structuredClone(src.text), size }
  }
  if (src.image && dst.image) dst.image = structuredClone(src.image)
  if (src.shape && dst.shape) dst.shape = { ...structuredClone(src.shape), radius: dst.shape.radius }
  if (src.writeon && dst.writeon) dst.writeon = { ...structuredClone(src.writeon), size: dst.writeon.size }
}

/** Rustpositie: de laatste keyframe-waarde, of de basiswaarde zonder keyframes. */
const rest = (l: Layer, p: 'x' | 'y') => {
  const k = l.tracks[p]
  return k?.length ? k[k.length - 1].v : l[p]
}

/** Timing kopiëren. Bewegingen in x/y worden als verschuiving t.o.v. de rustpositie overgenomen. */
function copyTiming(src: Layer, dst: Layer, scale: number) {
  dst.intro = scaleMotion(src.intro, scale)
  dst.outro = scaleMotion(src.outro, scale)
  for (const p of TIMING_PROPS) {
    if (src.tracks[p]?.length) dst.tracks[p] = structuredClone(src.tracks[p])
    else delete dst.tracks[p]
  }
  for (const p of ['x', 'y'] as const) {
    const kfs = src.tracks[p]
    if (!kfs?.length) {
      if (dst.tracks[p]?.length) {
        dst[p] = rest(dst, p)
        delete dst.tracks[p]
      }
      continue
    }
    const sRest = rest(src, p)
    const dRest = rest(dst, p)
    dst.tracks[p] = kfs.map((k): Keyframe => ({ t: k.t, e: k.e, v: round(dRest + (k.v - sRest) * scale, 1) }))
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function syncFormats(prev: Project, next: Project, compId: string): void {
  if (!next.syncFormats) return
  const srcPrev = prev.compositions.find((c) => c.id === compId)
  const src = next.compositions.find((c) => c.id === compId)
  if (!src || !srcPrev) return
  const prevById = new Map(srcPrev.layers.map((l) => [l.id, l]))
  const changed = src.layers.filter((l) => !same(prevById.get(l.id), l))
  const added = src.layers.filter((l) => !prevById.has(l.id))
  const nextLinks = new Set(src.layers.map((l) => l.linkId))
  const removedLinks = srcPrev.layers.filter((l) => !nextLinks.has(l.linkId)).map((l) => l.linkId)
  const orderChanged = !same(
    srcPrev.layers.map((l) => l.linkId),
    src.layers.map((l) => l.linkId)
  )
  const compChanged =
    srcPrev.duration !== src.duration ||
    srcPrev.loops !== src.loops ||
    srcPrev.background !== src.background ||
    !same(srcPrev.border, src.border)

  if (!changed.length && !removedLinks.length && !orderChanged && !compChanged) return

  for (const dst of next.compositions) {
    if (dst.id === src.id) continue
    if (compChanged) {
      dst.duration = src.duration
      dst.loops = src.loops
      dst.background = src.background
      dst.border = structuredClone(src.border)
    }
    if (removedLinks.length) dst.layers = dst.layers.filter((l) => !removedLinks.includes(l.linkId))
    const scale = Math.min(dst.width / src.width, dst.height / src.height)
    for (const l of changed) {
      const target = dst.layers.find((x) => x.linkId === l.linkId)
      if (!target) {
        if (added.includes(l)) dst.layers.push(mapLayerToFormat(l, src, dst.width, dst.height))
        continue
      }
      copyContent(l, target)
      copyTiming(l, target, scale)
    }
    if (orderChanged || added.length) reorderLike(src, dst)
  }
}

/** Gekoppelde lagen in dezelfde volgorde zetten als in het bronformaat. */
function reorderLike(src: Composition, dst: Composition) {
  const order = new Map(src.layers.map((l, i) => [l.linkId, i]))
  const linked = dst.layers.filter((l) => order.has(l.linkId)).sort((a, b) => order.get(a.linkId)! - order.get(b.linkId)!)
  let i = 0
  dst.layers = dst.layers.map((l) => (order.has(l.linkId) ? linked[i++] : l))
}

/** Is deze laag in andere formaten aanwezig? */
export function linkedCount(p: Project, linkId: string): number {
  return p.compositions.filter((c) => c.layers.some((l) => l.linkId === linkId)).length
}

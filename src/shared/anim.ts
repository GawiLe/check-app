import type { AnimProp, EaseName, Keyframe, Layer } from './types'
import { EASES } from './types'

// Let op: deze functies zijn de TypeScript-tegenhanger van de banner-runtime in
// runtime.ts. Houd ze gelijk, anders wijkt de editor af van de export.

const c1 = 1.70158

function bounceOut(t: number): number {
  const n = 7.5625
  const d = 2.75
  if (t < 1 / d) return n * t * t
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375
  return n * (t -= 2.625 / d) * t + 0.984375
}

export const EASE_FNS: Record<EaseName, (t: number) => number> = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  backOut: (t) => 1 + (c1 + 1) * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2),
  elasticOut: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * 2.0944) + 1),
  bounceOut,
  hold: () => 0
}

export const easeIndex = (e: EaseName): number => Math.max(0, EASES.indexOf(e))

export function sampleTrack(kfs: Keyframe[] | undefined, t: number, fallback: number): number {
  if (!kfs || kfs.length === 0) return fallback
  const n = kfs.length
  if (t <= kfs[0].t) return kfs[0].v
  if (t >= kfs[n - 1].t) return kfs[n - 1].v
  let i = 0
  for (; i < n - 1; i++) if (t < kfs[i + 1].t) break
  const a = kfs[i]
  const b = kfs[i + 1]
  const p = (t - a.t) / (b.t - a.t)
  return a.v + (b.v - a.v) * EASE_FNS[a.e](p)
}

export type LayerState = Record<AnimProp, number>

export function baseValue(layer: Layer, prop: AnimProp): number {
  return layer[prop]
}

export function layerStateAt(layer: Layer, t: number): LayerState {
  return {
    x: sampleTrack(layer.tracks.x, t, layer.x),
    y: sampleTrack(layer.tracks.y, t, layer.y),
    scale: sampleTrack(layer.tracks.scale, t, layer.scale),
    rotation: sampleTrack(layer.tracks.rotation, t, layer.rotation),
    opacity: sampleTrack(layer.tracks.opacity, t, layer.opacity),
    reveal: sampleTrack(layer.tracks.reveal, t, layer.reveal)
  }
}

export function sortKeyframes(kfs: Keyframe[]): Keyframe[] {
  return [...kfs].sort((a, b) => a.t - b.t)
}

/** Zet een keyframe op tijd t (vervangt een bestaande binnen 1 frame). */
export function upsertKeyframe(kfs: Keyframe[] | undefined, t: number, v: number, e: EaseName = 'easeOut'): Keyframe[] {
  const list = (kfs ?? []).filter((k) => Math.abs(k.t - t) > 1 / 120)
  const existing = (kfs ?? []).find((k) => Math.abs(k.t - t) <= 1 / 120)
  list.push({ t: round(t), v, e: existing?.e ?? e })
  return sortKeyframes(list)
}

export const round = (n: number, d = 3): number => {
  const f = Math.pow(10, d)
  return Math.round(n * f) / f
}

/** Laatste keyframe-tijd in de compositie (handig voor "duur passend maken"). */
export function lastKeyTime(layers: Layer[]): number {
  let max = 0
  for (const l of layers) for (const k of Object.values(l.tracks)) for (const kf of k ?? []) max = Math.max(max, kf.t)
  return max
}

import { round } from './anim'
import type { Layer } from './types'

export const anchorOf = (l: Pick<Layer, 'anchorX' | 'anchorY'>) => ({ ax: l.anchorX ?? 0.5, ay: l.anchorY ?? 0.5 })

/**
 * Anchor point verplaatsen zonder dat de laag verspringt (zoals Pan Behind in AE).
 * Met schaal s en rotatie r (graden) wordt de positie zo gecorrigeerd dat de laag
 * op dezelfde plek blijft staan. Keyframes op x/y schuiven even ver mee.
 */
export function moveAnchor(l: Layer, ax: number, ay: number, s: number, rDeg: number) {
  const { ax: ax0, ay: ay0 } = anchorOf(l)
  const r = (rDeg * Math.PI) / 180
  const cos = Math.cos(r) * s
  const sin = Math.sin(r) * s
  // Wereldpositie van linksboven = pos + O − R·S·O ; houd die gelijk bij O → O'
  const rs = (x: number, y: number): [number, number] => [x * cos - y * sin, x * sin + y * cos]
  const o0: [number, number] = [ax0 * l.width, ay0 * l.height]
  const o1: [number, number] = [ax * l.width, ay * l.height]
  const r0 = rs(...o0)
  const r1 = rs(...o1)
  const dx = o0[0] - r0[0] - (o1[0] - r1[0])
  const dy = o0[1] - r0[1] - (o1[1] - r1[1])
  l.anchorX = round(ax, 4)
  l.anchorY = round(ay, 4)
  l.x = round(l.x + dx, 2)
  l.y = round(l.y + dy, 2)
  if (l.tracks.x) l.tracks.x = l.tracks.x.map((k) => ({ ...k, v: round(k.v + dx, 2) }))
  if (l.tracks.y) l.tracks.y = l.tracks.y.map((k) => ({ ...k, v: round(k.v + dy, 2) }))
}

/** Hoekpunten van een laag op het canvas (voor selectiekader en klikken), rekening houdend met anchor, schaal en rotatie. */
export function layerCorners(x: number, y: number, w: number, h: number, ax: number, ay: number, s: number, rDeg: number) {
  const r = (rDeg * Math.PI) / 180
  const px = x + ax * w
  const py = y + ay * h
  const map = (u: number, v: number): [number, number] => {
    const lx = (u - ax * w) * s
    const ly = (v - ay * h) * s
    return [px + lx * Math.cos(r) - ly * Math.sin(r), py + lx * Math.sin(r) + ly * Math.cos(r)]
  }
  return { anchor: [px, py] as [number, number], map, corners: [map(0, 0), map(w, 0), map(w, h), map(0, h)] }
}

/** Ligt punt (x,y) binnen de (gedraaide) laag? */
export function pointInLayer(x: number, y: number, lx: number, ly: number, w: number, h: number, ax: number, ay: number, s: number, rDeg: number) {
  if (s === 0) return false
  const r = (-rDeg * Math.PI) / 180
  const px = lx + ax * w
  const py = ly + ay * h
  const dx = x - px
  const dy = y - py
  const u = (dx * Math.cos(r) - dy * Math.sin(r)) / s + ax * w
  const v = (dx * Math.sin(r) + dy * Math.cos(r)) / s + ay * h
  return u >= 0 && u <= w && v >= 0 && v <= h
}

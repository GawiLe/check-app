import { round } from './anim'
import type { AnimProp, Composition, Keyframe, Layer, Motion } from './types'

// Binnenkomst en uitgang worden bij het bouwen omgezet naar keyframes rond de
// rustpositie (de basiswaarden van de laag). Handmatige keyframes op een eigenschap
// gaan altijd voor: dan wordt die eigenschap door intro/outro niet aangeraakt.

export const INTRO_PRESETS: Record<string, { label: string; spec: Partial<Motion> }> = {
  fade: { label: 'Fade', spec: { fade: true, dx: 0, dy: 0, scale: 1, rotation: 0 } },
  up: { label: 'Omhoog', spec: { fade: true, dx: 0, dy: 30, scale: 1, rotation: 0 } },
  down: { label: 'Omlaag', spec: { fade: true, dx: 0, dy: -30, scale: 1, rotation: 0 } },
  left: { label: 'Van links', spec: { fade: true, dx: -60, dy: 0, scale: 1, rotation: 0 } },
  right: { label: 'Van rechts', spec: { fade: true, dx: 60, dy: 0, scale: 1, rotation: 0 } },
  zoomIn: { label: 'Zoom in', spec: { fade: true, dx: 0, dy: 0, scale: 0.6, rotation: 0 } },
  zoomOut: { label: 'Zoom uit', spec: { fade: true, dx: 0, dy: 0, scale: 1.4, rotation: 0 } },
  pop: { label: 'Pop', spec: { fade: true, dx: 0, dy: 0, scale: 0, rotation: 0, ease: 'backOut' } },
  spin: { label: 'Draai', spec: { fade: true, dx: 0, dy: 0, scale: 0.5, rotation: -90 } }
}

export function defaultIntro(l: Layer): Motion {
  const reveal = l.type === 'writeon' || l.revealMode !== 'none'
  return {
    start: 0.3,
    duration: reveal ? 1.2 : 0.6,
    ease: reveal ? 'easeInOut' : 'easeOut',
    fade: !reveal,
    dx: 0,
    dy: reveal ? 0 : 20,
    scale: 1,
    rotation: 0,
    reveal
  }
}

export function defaultOutro(comp: Composition): Motion {
  return {
    start: Math.max(0, round(comp.duration - 0.5, 2)),
    duration: 0.4,
    ease: 'easeIn',
    fade: true,
    dx: 0,
    dy: 0,
    scale: 1,
    rotation: 0,
    reveal: false
  }
}

/** Waarde van een eigenschap in de "weg"-toestand van een beweging. */
function awayValue(l: Layer, m: Motion, p: AnimProp): number | null {
  switch (p) {
    case 'x':
      return m.dx ? l.x + m.dx : null
    case 'y':
      return m.dy ? l.y + m.dy : null
    case 'scale':
      return m.scale !== 1 ? l.scale * m.scale : null
    case 'rotation':
      return m.rotation ? l.rotation + m.rotation : null
    case 'opacity':
      return m.fade ? 0 : null
    case 'reveal':
      return m.reveal ? 0 : null
  }
}

const PROPS: AnimProp[] = ['x', 'y', 'scale', 'rotation', 'opacity', 'reveal']

/** Laag met intro/outro omgezet naar keyframes. Gebruikt door editor, preview en export. */
export function effectiveLayer(l: Layer): Layer {
  if (!l.intro && !l.outro) return l
  const tracks = { ...l.tracks }
  for (const p of PROPS) {
    if (l.tracks[p]?.length) continue
    const kfs: Keyframe[] = []
    const restV = p === 'reveal' ? 1 : l[p]
    const inAway = l.intro ? awayValue(l, l.intro, p) : null
    const outAway = l.outro ? awayValue(l, l.outro, p) : null
    if (inAway == null && outAway == null) continue
    if (l.intro && inAway != null) {
      kfs.push({ t: round(l.intro.start), v: inAway, e: l.intro.ease })
      kfs.push({ t: round(l.intro.start + l.intro.duration), v: restV, e: 'linear' })
    }
    if (l.outro && outAway != null) {
      const s = Math.max(l.outro.start, kfs.length ? kfs[kfs.length - 1].t : 0)
      kfs.push({ t: round(s), v: restV, e: l.outro.ease })
      kfs.push({ t: round(s + l.outro.duration), v: outAway, e: 'linear' })
    }
    tracks[p] = kfs
  }
  return { ...l, tracks }
}

/**
 * Eindframe: het moment waarop de laatste loop stopt. Dat is vóór de eerste uitgang,
 * zodat het eindbeeld (en de backup-afbeelding) alles toont.
 */
export function endFrameTime(comp: Composition): number {
  let end = comp.duration
  for (const l of comp.layers) if (l.visible && l.outro) end = Math.min(end, l.outro.start)
  return round(Math.max(0, end))
}

/** Beweging meeschalen naar een ander formaat. */
export function scaleMotion(m: Motion | null | undefined, s: number): Motion | null {
  if (!m) return null
  return { ...m, dx: round(m.dx * s, 1), dy: round(m.dy * s, 1) }
}

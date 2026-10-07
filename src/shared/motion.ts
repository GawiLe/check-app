import { baseValue, round } from './anim'
import type { AnimProp, Composition, EaseName, Emphasis, EmphasisType, Keyframe, Layer, Motion } from './types'

// Binnenkomst en uitgang worden bij het bouwen omgezet naar keyframes rond de
// rustpositie (de basiswaarden van de laag). Handmatige keyframes op een eigenschap
// gaan altijd voor: dan wordt die eigenschap door intro/outro niet aangeraakt.

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
    case 'scaleY':
      return m.scale !== 1 ? (l.scaleY ?? l.scale) * m.scale : null
    case 'rotation':
      return m.rotation ? l.rotation + m.rotation : null
    case 'opacity':
      return m.fade ? 0 : null
    case 'reveal':
      return m.reveal ? 0 : null
  }
}

const PROPS: AnimProp[] = ['x', 'y', 'scale', 'scaleY', 'rotation', 'opacity', 'reveal']

/** Keyframes van een accent-animatie (rond de rustwaarde), per eigenschap. */
export function emphasisKeyframes(l: Layer, em: Emphasis): Partial<Record<AnimProp, Keyframe[]>> {
  const n = Math.max(1, Math.round(em.repeat))
  const d = em.duration / n
  const k = em.strength
  const out: Partial<Record<AnimProp, Keyframe[]>> = {}
  // Per cyclus: [fractie van de cyclus, verschil t.o.v. rust, easing]
  const shapes: Record<EmphasisType, { prop: AnimProp; steps: [number, number, EaseName][]; mul?: boolean }> = {
    pulse: { prop: 'scale', mul: true, steps: [[0, 0, 'easeInOut'], [0.5, 0.08, 'easeInOut'], [1, 0, 'linear']] },
    heartbeat: {
      prop: 'scale',
      mul: true,
      steps: [[0, 0, 'easeOut'], [0.15, 0.12, 'easeIn'], [0.3, 0, 'easeOut'], [0.45, 0.08, 'easeIn'], [0.7, 0, 'linear'], [1, 0, 'linear']]
    },
    shake: {
      prop: 'x',
      steps: [[0, 0, 'easeInOut'], [0.15, 6, 'easeInOut'], [0.35, -6, 'easeInOut'], [0.55, 4, 'easeInOut'], [0.75, -4, 'easeInOut'], [1, 0, 'linear']]
    },
    wiggle: {
      prop: 'rotation',
      steps: [[0, 0, 'easeInOut'], [0.2, 5, 'easeInOut'], [0.45, -5, 'easeInOut'], [0.7, 3, 'easeInOut'], [1, 0, 'linear']]
    },
    jump: { prop: 'y', steps: [[0, 0, 'easeOut'], [0.35, -14, 'bounceOut'], [1, 0, 'linear']] },
    flash: { prop: 'opacity', mul: true, steps: [[0, 0, 'easeInOut'], [0.5, -0.65, 'easeInOut'], [1, 0, 'linear']] }
  }
  const shape = shapes[em.type]
  const build = (prop: AnimProp, rest: number) => {
    const kfs: Keyframe[] = []
    for (let i = 0; i < n; i++)
      for (const [f, delta, e] of shape.steps) {
        if (i > 0 && f === 0) continue
        const v = shape.mul ? rest * (1 + delta * k) : rest + delta * k
        kfs.push({ t: round(em.start + (i + f) * d), v: round(v, 3), e })
      }
    out[prop] = kfs
  }
  build(shape.prop, shape.prop === 'reveal' ? 1 : baseValue(l, shape.prop))
  // Ontkoppelde schaal: verticaal net zo laten pulseren
  if (shape.prop === 'scale' && l.scaleLinked === false) build('scaleY', l.scaleY ?? l.scale)
  return out
}

/** Laag met binnenkomst, accent en uitgang omgezet naar keyframes. Gebruikt door editor, preview en export. */
export function effectiveLayer(l: Layer): Layer {
  if (!l.intro && !l.outro && !l.emphasis) return l
  const tracks = { ...l.tracks }
  const emph = l.emphasis ? emphasisKeyframes(l, l.emphasis) : {}
  for (const p of PROPS) {
    if (l.tracks[p]?.length) continue
    // Gekoppelde schaal: scaleY volgt scale, geen eigen keyframes nodig
    if (p === 'scaleY' && l.scaleLinked !== false) continue
    let kfs: Keyframe[] = []
    const restV = p === 'reveal' ? 1 : p === 'scaleY' ? (l.scaleY ?? l.scale) : l[p]
    const inAway = l.intro ? awayValue(l, l.intro, p) : null
    const outAway = l.outro ? awayValue(l, l.outro, p) : null
    if (inAway == null && outAway == null && !emph[p]) continue
    if (l.intro && inAway != null) {
      kfs.push({ t: round(l.intro.start), v: inAway, e: l.intro.ease })
      kfs.push({ t: round(l.intro.start + l.intro.duration), v: restV, e: 'linear' })
    }
    if (emph[p]) {
      const after = kfs.length ? kfs[kfs.length - 1].t : -1
      kfs = kfs.concat(emph[p]!.filter((k) => k.t > after + 1e-3))
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

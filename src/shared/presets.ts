import { round } from './anim'
import type { Keyframe, Layer, RevealMode, Tracks } from './types'

export interface PresetParams {
  start: number
  duration: number
  /** Breedte/hoogte van de compositie, voor in- en uitschuiven. */
  compWidth: number
  compHeight: number
}

export interface Preset {
  id: string
  label: string
  /** Geeft de nieuwe tracks voor deze laag terug (worden samengevoegd met bestaande). */
  apply: (l: Layer, p: PresetParams) => { tracks: Tracks; revealMode?: RevealMode }
}

const kf = (t: number, v: number, e: Keyframe['e'] = 'easeOut'): Keyframe => ({ t: round(t), v: round(v), e })

const slide = (axis: 'x' | 'y', offset: (l: Layer, p: PresetParams) => number): Preset['apply'] => (l, p) => ({
  tracks: {
    [axis]: [kf(p.start, l[axis] + offset(l, p)), kf(p.start + p.duration, l[axis], 'linear')],
    opacity: [kf(p.start, 0), kf(p.start + p.duration * 0.6, l.opacity, 'linear')]
  }
})

export const PRESETS: Preset[] = [
  {
    id: 'fadeIn',
    label: 'Fade in',
    apply: (l, p) => ({ tracks: { opacity: [kf(p.start, 0), kf(p.start + p.duration, l.opacity, 'linear')] } })
  },
  {
    id: 'fadeOut',
    label: 'Fade out',
    apply: (l, p) => ({
      tracks: { opacity: [kf(p.start, l.opacity, 'easeIn'), kf(p.start + p.duration, 0, 'linear')] }
    })
  },
  { id: 'slideLeft', label: 'Inschuiven van links', apply: slide('x', (l) => -(l.x + l.width)) },
  { id: 'slideRight', label: 'Inschuiven van rechts', apply: slide('x', (l, p) => p.compWidth - l.x) },
  { id: 'slideUp', label: 'Omhoog inschuiven', apply: slide('y', () => 30) },
  { id: 'slideDown', label: 'Omlaag inschuiven', apply: slide('y', () => -30) },
  {
    id: 'popIn',
    label: 'Pop in',
    apply: (l, p) => ({
      tracks: {
        scale: [kf(p.start, 0, 'backOut'), kf(p.start + p.duration, l.scale, 'linear')],
        opacity: [kf(p.start, 0), kf(p.start + p.duration * 0.3, l.opacity, 'linear')]
      }
    })
  },
  {
    id: 'pulse',
    label: 'Pulse (CTA)',
    apply: (l, p) => {
      const d = p.duration / 2
      return {
        tracks: {
          scale: [kf(p.start, l.scale, 'easeInOut'), kf(p.start + d, l.scale * 1.08, 'easeInOut'), kf(p.start + 2 * d, l.scale, 'linear')]
        }
      }
    }
  },
  {
    id: 'writeOn',
    label: 'Write-on / reveal',
    apply: (_l, p) => ({ tracks: { reveal: [kf(p.start, 0, 'easeInOut'), kf(p.start + p.duration, 1, 'linear')] } })
  },
  {
    id: 'wipeLeft',
    label: 'Wipe van links',
    apply: (_l, p) => ({
      revealMode: 'wipeLeft',
      tracks: { reveal: [kf(p.start, 0, 'easeInOut'), kf(p.start + p.duration, 1, 'linear')] }
    })
  },
  {
    id: 'wipeUp',
    label: 'Wipe van onder',
    apply: (_l, p) => ({
      revealMode: 'wipeUp',
      tracks: { reveal: [kf(p.start, 0, 'easeInOut'), kf(p.start + p.duration, 1, 'linear')] }
    })
  }
]

/** Voegt keyframes samen: nieuwe keyframes vervangen bestaande binnen het bereik van de preset. */
export function mergeTracks(existing: Tracks, incoming: Tracks): Tracks {
  const out: Tracks = { ...existing }
  for (const [prop, kfs] of Object.entries(incoming) as [keyof Tracks, Keyframe[]][]) {
    if (!kfs?.length) continue
    const from = kfs[0].t
    const to = kfs[kfs.length - 1].t
    const keep = (existing[prop] ?? []).filter((k) => k.t < from - 1e-3 || k.t > to + 1e-3)
    out[prop] = [...keep, ...kfs].sort((a, b) => a.t - b.t)
  }
  return out
}

import { baseValue, layerStateAt, round } from './anim'
import { bakeMotion, effectiveLayer } from './motion'
import type { AnimProp, Composition, Emphasis, EmphasisType, Keyframe, Layer, Motion } from './types'
import { ANIM_PROPS } from './types'

// De animatiebibliotheek: kant-en-klare animaties (presets) die je op een laag sleept of klikt.
// Een preset zet gewone keyframes op de laag, vanaf de playhead; daarna werk je er gewoon
// met keyframes verder aan (verschuiven, easing, waarden).

export type LibraryKind = 'intro' | 'outro' | 'emphasis'

export interface LibraryItem {
  id: string
  label: string
  kind: LibraryKind
  /** Voor binnenkomst/uitgang: wat er aan de standaard verandert. */
  motion?: Partial<Motion>
  emphasis?: EmphasisType
  /** Alleen zinvol voor write-on of lagen met een wipe. */
  reveal?: 'writeon' | 'wipeLeft' | 'wipeRight' | 'wipeUp' | 'wipeDown'
}

const m = (p: Partial<Motion>): Partial<Motion> => ({ fade: true, dx: 0, dy: 0, scale: 1, rotation: 0, reveal: false, ease: 'easeOut', ...p })

export const LIBRARY: LibraryItem[] = [
  // Binnenkomst
  { id: 'fadeIn', label: 'Fade in', kind: 'intro', motion: m({}) },
  { id: 'slideUp', label: 'Slide up', kind: 'intro', motion: m({ dy: 30 }) },
  { id: 'slideDown', label: 'Slide down', kind: 'intro', motion: m({ dy: -30 }) },
  { id: 'slideLeft', label: 'Slide in links', kind: 'intro', motion: m({ dx: -60 }) },
  { id: 'slideRight', label: 'Slide in rechts', kind: 'intro', motion: m({ dx: 60 }) },
  { id: 'bounceIn', label: 'Bounce in', kind: 'intro', motion: m({ dy: -80, fade: false, ease: 'bounceOut', duration: 0.9 }) },
  { id: 'popIn', label: 'Pop in', kind: 'intro', motion: m({ scale: 0, ease: 'backOut', duration: 0.5 }) },
  { id: 'elasticIn', label: 'Elastic in', kind: 'intro', motion: m({ scale: 0.3, ease: 'elasticOut', duration: 1 }) },
  { id: 'zoomIn', label: 'Zoom in', kind: 'intro', motion: m({ scale: 0.6 }) },
  { id: 'zoomOutIn', label: 'Zoom uit', kind: 'intro', motion: m({ scale: 1.4 }) },
  { id: 'rotateIn', label: 'Draai in', kind: 'intro', motion: m({ scale: 0.5, rotation: -90, ease: 'backOut' }) },
  { id: 'writeOn', label: 'Write-on', kind: 'intro', reveal: 'writeon', motion: m({ fade: false, reveal: true, ease: 'easeInOut', duration: 1.2 }) },
  { id: 'wipeLeft', label: 'Wipe van links', kind: 'intro', reveal: 'wipeLeft', motion: m({ fade: false, reveal: true, ease: 'easeInOut', duration: 0.7 }) },
  { id: 'wipeRight', label: 'Wipe van rechts', kind: 'intro', reveal: 'wipeRight', motion: m({ fade: false, reveal: true, ease: 'easeInOut', duration: 0.7 }) },
  { id: 'wipeUp', label: 'Wipe van onder', kind: 'intro', reveal: 'wipeUp', motion: m({ fade: false, reveal: true, ease: 'easeInOut', duration: 0.7 }) },
  { id: 'wipeDown', label: 'Wipe van boven', kind: 'intro', reveal: 'wipeDown', motion: m({ fade: false, reveal: true, ease: 'easeInOut', duration: 0.7 }) },
  // Accent
  { id: 'pulse', label: 'Pulse', kind: 'emphasis', emphasis: 'pulse' },
  { id: 'heartbeat', label: 'Heartbeat', kind: 'emphasis', emphasis: 'heartbeat' },
  { id: 'shake', label: 'Shake', kind: 'emphasis', emphasis: 'shake' },
  { id: 'wiggle', label: 'Wiebel', kind: 'emphasis', emphasis: 'wiggle' },
  { id: 'jump', label: 'Spring', kind: 'emphasis', emphasis: 'jump' },
  { id: 'flash', label: 'Flash', kind: 'emphasis', emphasis: 'flash' },
  // Uitgang
  { id: 'fadeOut', label: 'Fade out', kind: 'outro', motion: m({ ease: 'easeIn' }) },
  { id: 'slideOutUp', label: 'Slide out omhoog', kind: 'outro', motion: m({ dy: -30, ease: 'easeIn' }) },
  { id: 'slideOutDown', label: 'Slide out omlaag', kind: 'outro', motion: m({ dy: 30, ease: 'easeIn' }) },
  { id: 'slideOutLeft', label: 'Slide out links', kind: 'outro', motion: m({ dx: -60, ease: 'easeIn' }) },
  { id: 'zoomOut', label: 'Zoom out', kind: 'outro', motion: m({ scale: 0.6, ease: 'easeIn' }) },
  { id: 'popOut', label: 'Pop out', kind: 'outro', motion: m({ scale: 0, ease: 'easeIn', duration: 0.35 }) }
]

export const LIBRARY_GROUPS: { kind: LibraryKind; label: string }[] = [
  { kind: 'intro', label: 'Binnenkomst' },
  { kind: 'emphasis', label: 'Accent' },
  { kind: 'outro', label: 'Uitgang' }
]

const DEFAULT_DURATION: Record<LibraryKind, number> = { intro: 0.6, emphasis: 1, outro: 0.4 }

/**
 * Past een bibliotheek-animatie toe als gewone keyframes (zoals een animatiepreset in After Effects).
 * `at` is het moment waarop hij begint (de playhead, of waar je hem in de tijdlijn losliet). Bestaande
 * keyframes binnen die periode worden vervangen; daarbuiten blijven ze staan.
 */
export function applyLibraryItem(l: Layer, item: LibraryItem, comp: Composition, at?: number): void {
  const fallback = item.kind === 'intro' ? 0.3 : item.kind === 'emphasis' ? Math.min(comp.duration - 1, 3) : Math.max(0, comp.duration - 0.6)
  const start = round(Math.max(0, at ?? fallback))
  if (item.reveal && item.reveal !== 'writeon') {
    // Op een write-on laag: de letters schrijven zich vanuit dezelfde kant; anders een wipe
    if (l.type === 'writeon') {
      const dir = ({ wipeLeft: 'left', wipeRight: 'right', wipeUp: 'bottom', wipeDown: 'top' } as const)[item.reveal]
      if (dir === 'left') delete l.writeon!.direction
      else l.writeon!.direction = dir
    } else l.revealMode = item.reveal
  }
  if (item.reveal === 'writeon' && l.type !== 'writeon') {
    // Write-on kan alleen op een write-on laag; op andere lagen een wipe (de gekozen kant, anders van links)
    if (l.revealMode === 'none' || l.revealMode === 'draw') l.revealMode = l.revealMode === 'draw' ? 'draw' : 'wipeLeft'
  }
  // Tijdelijke laag zonder keyframes, met als rustwaarden de stand van de laag op het rustmoment
  const tmp: Layer = { ...structuredClone({ ...l, children: undefined }), tracks: {}, intro: null, outro: null, emphasis: null }
  let restT = start
  if (item.kind === 'emphasis') {
    tmp.emphasis = { type: item.emphasis!, start, duration: DEFAULT_DURATION.emphasis, repeat: item.emphasis === 'pulse' ? 2 : 1, strength: 1 }
  } else {
    const spec = item.motion!
    const motion: Motion = { fade: true, dx: 0, dy: 0, scale: 1, rotation: 0, reveal: false, ease: 'easeOut', ...spec, start, duration: spec.duration ?? DEFAULT_DURATION[item.kind] }
    tmp[item.kind] = motion
    if (item.kind === 'intro') restT = start + motion.duration
  }
  const st = layerStateAt(l, restT)
  Object.assign(tmp, { x: st.x, y: st.y, scale: st.scale, scaleY: st.scaleY, rotation: st.rotation, opacity: st.opacity })
  for (const [p, kfs] of Object.entries(effectiveLayer(tmp).tracks) as [AnimProp, Keyframe[]][]) {
    if (!kfs?.length) continue
    const a = kfs[0].t - 1e-4
    const b = kfs[kfs.length - 1].t + 1e-4
    const keep = (l.tracks[p] ?? []).filter((k) => k.t < a || k.t > b)
    l.tracks[p] = [...keep, ...structuredClone(kfs)].sort((x, y) => x.t - y.t)
  }
  // Oud model: niet meer gebruiken
  bakeMotion(l)
}

/** Welk bibliotheek-item hoort bij de huidige binnenkomst/uitgang/accent (voor de UI)? */
export function matchLibraryItem(l: Layer, kind: LibraryKind): string | null {
  if (kind === 'emphasis') return l.emphasis ? (LIBRARY.find((i) => i.emphasis === l.emphasis!.type)?.id ?? null) : null
  const cur = l[kind]
  if (!cur) return null
  const keys: (keyof Motion)[] = ['fade', 'dx', 'dy', 'scale', 'rotation', 'reveal', 'ease']
  return LIBRARY.find((i) => i.kind === kind && keys.every((k) => (i.motion as Motion)[k] === cur[k]))?.id ?? null
}

// ---------- Eigen presets ----------

/** Eigen preset: de animatie van een laag, relatief opgeslagen zodat hij op elke laag past. */
export interface UserPreset {
  id: string
  name: string
  intro?: Motion | null
  outro?: Motion | null
  emphasis?: Emphasis | null
  /** Keyframes relatief: x/y/rotatie als verschil, schaal als factor, dekking/reveal absoluut. Tijden vanaf 0. */
  tracks?: Partial<Record<AnimProp, Keyframe[]>>
  /** Oorspronkelijke starttijd (gebruikt als je hem niet op een tijd loslaat). */
  at: number
}

const REL_DIFF: AnimProp[] = ['x', 'y', 'rotation']

export function presetFromLayer(l: Layer, name: string, id: string): UserPreset {
  const times: number[] = []
  for (const p of ANIM_PROPS) for (const k of l.tracks[p] ?? []) times.push(k.t)
  if (l.intro) times.push(l.intro.start)
  if (l.outro) times.push(l.outro.start)
  if (l.emphasis) times.push(l.emphasis.start)
  const t0 = times.length ? Math.min(...times) : 0
  const tracks: Partial<Record<AnimProp, Keyframe[]>> = {}
  for (const p of ANIM_PROPS) {
    const kfs = l.tracks[p]
    if (!kfs?.length) continue
    tracks[p] = kfs.map((k) => ({
      ...k,
      t: round(k.t - t0),
      v: REL_DIFF.includes(p) ? round(k.v - baseValue(l, p), 2) : p === 'scale' || p === 'scaleY' ? round(baseValue(l, p) ? k.v / baseValue(l, p) : k.v, 3) : k.v
    }))
  }
  const rel = <T extends { start: number }>(m: T | null | undefined) => (m ? { ...m, start: round(m.start - t0) } : null)
  return { id, name, intro: rel(l.intro), outro: rel(l.outro), emphasis: rel(l.emphasis), tracks, at: round(t0) }
}

export function applyUserPreset(l: Layer, preset: UserPreset, at?: number) {
  const t0 = at ?? preset.at
  const abs = <T extends { start: number }>(m: T | null | undefined) => (m ? { ...m, start: round(m.start + t0) } : null)
  if (preset.intro) l.intro = abs(preset.intro)
  if (preset.outro) l.outro = abs(preset.outro)
  if (preset.emphasis) l.emphasis = abs(preset.emphasis)
  for (const [p, kfs] of Object.entries(preset.tracks ?? {}) as [AnimProp, Keyframe[]][]) {
    l.tracks[p] = kfs.map((k) => ({
      ...k,
      t: round(k.t + t0),
      v: REL_DIFF.includes(p) ? round(baseValue(l, p) + k.v, 2) : p === 'scale' || p === 'scaleY' ? round(baseValue(l, p) * k.v, 3) : k.v
    }))
  }
  // Oudere presets met binnenkomst/uitgang: als keyframes op de laag
  bakeMotion(l)
}

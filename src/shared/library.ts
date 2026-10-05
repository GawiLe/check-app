import { round } from './anim'
import type { Composition, Emphasis, EmphasisType, Layer, Motion } from './types'

// De animatiebibliotheek: kant-en-klare animaties die je op een laag sleept.
// Elke animatie wordt een binnenkomst, uitgang of accent op de laag, die je daarna
// gewoon kunt aanpassen (tijd, duur, easing, afstand, sterkte).

export type LibraryKind = 'intro' | 'outro' | 'emphasis'

export interface LibraryItem {
  id: string
  label: string
  kind: LibraryKind
  /** Voor binnenkomst/uitgang: wat er aan de standaard verandert. */
  motion?: Partial<Motion>
  emphasis?: EmphasisType
  /** Alleen zinvol voor write-on of lagen met een wipe. */
  reveal?: 'writeon' | 'wipeLeft' | 'wipeUp'
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
  { id: 'wipeLeft', label: 'Wipe links', kind: 'intro', reveal: 'wipeLeft', motion: m({ fade: false, reveal: true, ease: 'easeInOut', duration: 0.7 }) },
  { id: 'wipeUp', label: 'Wipe omhoog', kind: 'intro', reveal: 'wipeUp', motion: m({ fade: false, reveal: true, ease: 'easeInOut', duration: 0.7 }) },
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
 * Past een bibliotheek-animatie toe op een laag. `at` is het moment waarop hij
 * begint (bijv. waar je hem in de tijdlijn losliet); zonder `at` blijft een
 * bestaande starttijd staan.
 */
export function applyLibraryItem(l: Layer, item: LibraryItem, comp: Composition, at?: number): void {
  if (item.kind === 'emphasis') {
    const prev = l.emphasis
    const e: Emphasis = {
      type: item.emphasis!,
      start: round(at ?? prev?.start ?? Math.min(comp.duration - 1, 3)),
      duration: prev?.duration ?? DEFAULT_DURATION.emphasis,
      repeat: prev?.repeat ?? (item.emphasis === 'pulse' ? 2 : 1),
      strength: prev?.strength ?? 1
    }
    l.emphasis = e
    return
  }
  const prev = l[item.kind]
  const fallbackStart = item.kind === 'intro' ? 0.3 : Math.max(0, comp.duration - 0.6)
  const spec = item.motion!
  const motion: Motion = {
    fade: true,
    dx: 0,
    dy: 0,
    scale: 1,
    rotation: 0,
    reveal: false,
    ease: 'easeOut',
    ...spec,
    start: round(at ?? prev?.start ?? fallbackStart),
    duration: spec.duration ?? prev?.duration ?? DEFAULT_DURATION[item.kind]
  }
  if (item.reveal === 'wipeLeft' || item.reveal === 'wipeUp') {
    if (l.type !== 'writeon') l.revealMode = item.reveal
  }
  if (item.reveal === 'writeon' && l.type !== 'writeon') {
    // Write-on kan alleen op een write-on laag; op andere lagen een wipe van links.
    l.revealMode = 'wipeLeft'
  }
  l[item.kind] = motion
}

/** Welk bibliotheek-item hoort bij de huidige binnenkomst/uitgang/accent (voor de UI)? */
export function matchLibraryItem(l: Layer, kind: LibraryKind): string | null {
  if (kind === 'emphasis') return l.emphasis ? (LIBRARY.find((i) => i.emphasis === l.emphasis!.type)?.id ?? null) : null
  const cur = l[kind]
  if (!cur) return null
  const keys: (keyof Motion)[] = ['fade', 'dx', 'dy', 'scale', 'rotation', 'reveal', 'ease']
  return LIBRARY.find((i) => i.kind === kind && keys.every((k) => (i.motion as Motion)[k] === cur[k]))?.id ?? null
}

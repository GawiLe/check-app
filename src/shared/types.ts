// Projectmodel. Een project is een map op schijf met `project.bsproj` (deze JSON),
// plus `assets/` en `fonts/`. Alles wat de editor toont, wordt hieruit gegenereerd.

export const PROJECT_FILE = 'project.bsproj'
export const PROJECT_VERSION = 1

export type EaseName =
  | 'linear'
  | 'easeIn'
  | 'easeOut'
  | 'easeInOut'
  | 'backOut'
  | 'elasticOut'
  | 'bounceOut'
  | 'hold'

export const EASES: EaseName[] = [
  'linear',
  'easeIn',
  'easeOut',
  'easeInOut',
  'backOut',
  'elasticOut',
  'bounceOut',
  'hold'
]

/** Animeerbare eigenschappen. `reveal` (0..1) stuurt write-on en wipe-effecten. */
export type AnimProp = 'x' | 'y' | 'scale' | 'rotation' | 'opacity' | 'reveal'

export const ANIM_PROPS: AnimProp[] = ['x', 'y', 'scale', 'rotation', 'opacity', 'reveal']

export interface Keyframe {
  /** Tijd in seconden. */
  t: number
  v: number
  /** Easing van deze keyframe naar de volgende. */
  e: EaseName
}

export type Tracks = Partial<Record<AnimProp, Keyframe[]>>

export type LayerType = 'text' | 'image' | 'shape' | 'writeon'

export interface TextProps {
  content: string
  fontId: string | null
  size: number
  color: string
  weight: number
  align: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
}

export interface ImageProps {
  /** Pad relatief aan de projectmap, bijv. `assets/product.png`. */
  src: string
  fit: 'contain' | 'cover' | 'fill'
}

export interface ShapeProps {
  fill: string
  radius: number
  strokeColor: string
  strokeWidth: number
}

export interface WriteOnGlyph {
  d: string
}

export interface WriteOnProps {
  content: string
  fontId: string | null
  size: number
  color: string
  strokeWidth: number
  /** Gegenereerde SVG-paden per glyph (uit het font). */
  glyphs: WriteOnGlyph[]
  viewBox: [number, number, number, number]
  /** Hoe snel de vulling na de lijn verschijnt (0 = alleen lijn). */
  fillAfter: number
}

/** Wipe-reveal voor niet-write-on lagen, gestuurd door `reveal`. */
export type RevealMode = 'none' | 'wipeLeft' | 'wipeRight' | 'wipeUp' | 'wipeDown'

export interface Layer {
  id: string
  name: string
  type: LayerType
  visible: boolean
  locked: boolean
  x: number
  y: number
  width: number
  height: number
  rotation: number
  scale: number
  opacity: number
  /** Beginwaarde voor `reveal` als er geen keyframes zijn. */
  reveal: number
  revealMode: RevealMode
  /** Is deze laag de (zichtbare) CTA-knop? Krijgt een hover-effect bij export. */
  cta: boolean
  tracks: Tracks
  text?: TextProps
  image?: ImageProps
  shape?: ShapeProps
  writeon?: WriteOnProps
}

export interface Composition {
  id: string
  name: string
  width: number
  height: number
  /** Duur van één loop in seconden. */
  duration: number
  /** Totaal aantal keer afspelen (1 = niet loopen). IAB/Google: max. 3. */
  loops: number
  background: string
  border: { color: string; width: number } | null
  /** Lagen van boven (index 0) naar onder. */
  layers: Layer[]
}

export interface FontAsset {
  id: string
  family: string
  /** Pad relatief aan de projectmap, bijv. `fonts/Brand-Bold.woff2`. */
  file: string
  weight: number
  style: 'normal' | 'italic'
}

export type ExportTarget = 'cm360' | 'google-ads' | 'gam' | 'generic'

export interface Project {
  version: number
  name: string
  /** Landings-URL die als standaardwaarde in `clickTag` komt. */
  clickTag: string
  targets: ExportTarget[]
  fonts: FontAsset[]
  baseCompositionId: string
  compositions: Composition[]
}

export interface ValidationIssue {
  level: 'error' | 'warning' | 'info'
  rule: string
  message: string
}

export interface ExportResult {
  target: ExportTarget
  composition: string
  folder: string
  zip: string
  zipBytes: number
  initialLoadBytes: number
  files: { name: string; bytes: number }[]
  backup: string | null
  issues: ValidationIssue[]
}

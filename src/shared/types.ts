// Projectmodel. Een project is een map op schijf met `project.bsproj` (deze JSON),
// plus `assets/` en `fonts/`. Alles wat de editor toont, wordt hieruit gegenereerd.

export const PROJECT_FILE = 'project.bsproj'
export const PROJECT_VERSION = 2

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
export type AnimProp = 'x' | 'y' | 'scale' | 'scaleY' | 'rotation' | 'opacity' | 'reveal'

export const ANIM_PROPS: AnimProp[] = ['x', 'y', 'scale', 'scaleY', 'rotation', 'opacity', 'reveal']

export interface Keyframe {
  /** Tijd in seconden. */
  t: number
  v: number
  /** Easing van deze keyframe naar de volgende. */
  e: EaseName
  /** Keyframe-assistent (zoals in AE): rustig aankomen (Easy Ease In) / rustig vertrekken (Easy Ease Out). */
  ei?: boolean
  eo?: boolean
}

export type Tracks = Partial<Record<AnimProp, Keyframe[]>>

export type LayerType = 'text' | 'image' | 'shape' | 'writeon' | 'group'

export interface TextProps {
  content: string
  fontId: string | null
  size: number
  color: string
  weight: number
  align: 'left' | 'center' | 'right'
  lineHeight: number
  letterSpacing: number
  /** Automatisch passend maken: de lettergrootte wordt (in de browser, met het echte font) verkleind tot de tekst in het kader past. */
  fit?: boolean
}

export interface ImageProps {
  /** Pad relatief aan de projectmap, bijv. `assets/product.png`. */
  src: string
  fit: 'contain' | 'cover' | 'fill'
}

export type ShapeKind = 'rect' | 'ellipse' | 'path'

export interface ShapeProps {
  /** Rechthoek (met hoekradius), ellips of vrije vorm (pen tool). Ontbreekt = rechthoek. */
  kind?: ShapeKind
  fill: string
  /** Vulling aan/uit (ontbreekt = aan). */
  fillEnabled?: boolean
  /** Vulregel voor vormen met gaten (uit geïmporteerde SVG). */
  fillRule?: 'nonzero' | 'evenodd'
  radius: number
  strokeColor: string
  /** 0 = geen lijn. */
  strokeWidth: number
  /** Pen tool: SVG-pad in een eigen coördinatenstelsel van w×h (schaalt mee met de laag). */
  path?: { d: string; w: number; h: number; closed: boolean }
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

/**
 * Binnenkomst of uitgang van een laag, zoals een GSAP from()/to(): beweegt van/naar
 * de rustpositie van de laag. Zo hoef je voor de gewone animaties geen keyframes te zetten.
 */
export interface Motion {
  start: number
  duration: number
  ease: EaseName
  /** Vanaf/naar dekking 0. */
  fade: boolean
  /** Verschuiving in px t.o.v. de rustpositie. */
  dx: number
  dy: number
  /** Schaalfactor t.o.v. de rustschaal (1 = geen). */
  scale: number
  /** Extra rotatie in graden. */
  rotation: number
  /** Reveal 0→1 (write-on / wipe). */
  reveal: boolean
}

export type EmphasisType = 'pulse' | 'heartbeat' | 'shake' | 'wiggle' | 'jump' | 'flash'

/** Accent-animatie halverwege (bijv. een pulserende CTA), rond de rustpositie. */
export interface Emphasis {
  type: EmphasisType
  start: number
  /** Totale duur van alle herhalingen samen. */
  duration: number
  repeat: number
  /** 1 = normaal, 2 = twee keer zo sterk. */
  strength: number
}

export interface Layer {
  id: string
  /**
   * Zelfde linkId = dezelfde laag in een ander formaat. Inhoud (tekst, kleur,
   * afbeelding) en timing worden tussen gekoppelde lagen gesynchroniseerd;
   * positie en maat blijven per formaat.
   */
  linkId: string
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
  /** Verticale schaal; alleen gebruikt als `scaleLinked` uit staat (anders volgt hij `scale`). */
  scaleY?: number
  /** Schaal X en Y gekoppeld (standaard aan): `scale` geldt dan voor beide richtingen. */
  scaleLinked?: boolean
  /** Breedte en hoogte gekoppeld: verhouding blijft gelijk bij aanpassen. */
  sizeLinked?: boolean
  /** Anchor point (draaipunt voor schaal en rotatie), relatief: 0 = links/boven, 1 = rechts/onder. Standaard 0,5. */
  anchorX?: number
  anchorY?: number
  /** Beginwaarde voor `reveal` als er geen keyframes zijn. */
  reveal: number
  revealMode: RevealMode
  /** Is deze laag de (zichtbare) CTA-knop? Krijgt een hover-effect bij export. */
  cta: boolean
  /**
   * Eigen klikgebied (optioneel): deze laag krijgt een eigen clickTag (clickTag1, clickTag2 …) die
   * vóór de algemene klik (de hele banner) gaat. Lege url = dezelfde URL als de algemene clickTag.
   */
  exit?: { url: string } | null
  /** Schaduwen (CSS drop-shadow, volgt de vorm van tekst, vormen en afbeeldingen). Meerdere = gestapeld. */
  shadows?: Shadow[]
  tracks: Tracks
  intro?: Motion | null
  outro?: Motion | null
  emphasis?: Emphasis | null
  /**
   * Alleen in afgeleide formaten: eigenschappen die in dit formaat bewust anders
   * zijn gezet dan in de basis (bijv. "x", "text.size", "intro"). Die worden niet
   * meer overschreven als je de basis aanpast.
   */
  overrides?: string[]
  text?: TextProps
  image?: ImageProps
  shape?: ShapeProps
  writeon?: WriteOnProps
  /**
   * Groep (pre-comp): lagen binnen deze laag. Posities zijn relatief aan de groep,
   * tijden relatief aan `start` van de groep. De groep zelf kun je als geheel
   * animeren, dupliceren en in de tijd verschuiven.
   */
  children?: Layer[]
  /** In-punt (s): vanaf hier zichtbaar. Bij een groep begint de tijd van de inhoud hier. */
  start?: number
  /** Uit-punt (s): tot hier zichtbaar. Leeg = tot het einde. */
  end?: number | null
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
  /** Alleen afgeleide formaten: compositie-instellingen die afwijken van de basis. */
  overrides?: string[]
}

export interface FontAsset {
  id: string
  family: string
  /** Systeemfont (Arial, Georgia, …): wordt niet meegeleverd, alleen als font-family gebruikt. */
  system?: boolean
  /** Pad relatief aan de projectmap, bijv. `fonts/Brand-Bold.woff2`. */
  file: string
  weight: number
  style: 'normal' | 'italic'
}

export type ExportTarget = 'cm360' | 'google-ads' | 'gam' | 'adform' | 'azerion' | 'generic'

export interface Project {
  version: number
  name: string
  /** Landings-URL die als standaardwaarde in `clickTag` komt. */
  clickTag: string
  targets: ExportTarget[]
  /** Wijzigingen in inhoud en timing doorvoeren in alle formaten. */
  syncFormats: boolean
  /** Polite loading: afbeeldingen pas laden na het `load`-event van de pagina. */
  politeLoad: boolean
  /**
   * Eigen fonts (geïmporteerd of Google) in de HTML inbedden als Base64 in plaats van losse
   * .woff2-bestanden. Veel ad-servers (o.a. Google Ads, Azerion) accepteren geen losse fonts.
   * Ontbreekt = aan.
   */
  embedFonts?: boolean
  /** Afbeeldingen bij export verkleinen tot de getoonde maat (2×) en opnieuw comprimeren. */
  optimizeImages?: boolean
  /** Varianten van dit project (template): welke velden variabel zijn en de waarden per variant. */
  variants?: VariantSet
  /** Gezet in een variantmap: van welk template (mapnaam) en welke variant dit project komt. */
  variantOf?: { template: string; variantId: string }
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

/** Eén variant: alleen de velden die anders zijn dan het origineel staan erin. */
export interface Variant {
  id: string
  name: string
  /** Veldsleutel (zie shared/variants.ts) → nieuwe waarde (tekst, of assets/… voor een afbeelding). */
  values: Record<string, string>
}

export interface VariantSet {
  /** Gekozen variabele velden. */
  fields: string[]
  variants: Variant[]
}

export interface Shadow {
  x: number
  y: number
  blur: number
  /** #rrggbb */
  color: string
  /** 0–1 */
  opacity: number
}

import { round } from './anim'
import { BASE_SIZE } from './specs'
import type { Composition, Layer, LayerType, Motion, Project } from './types'
import { PROJECT_VERSION } from './types'

export function newId(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 9)
}

export function createLayer(type: LayerType, comp: { width: number; height: number }): Layer {
  const id = newId('l')
  const base: Layer = {
    id,
    linkId: id,
    name: { text: 'Tekst', image: 'Afbeelding', shape: 'Vorm', writeon: 'Write-on' }[type],
    type,
    visible: true,
    locked: false,
    x: 20,
    y: 20,
    width: comp.width - 40,
    height: 60,
    rotation: 0,
    scale: 1,
    opacity: 1,
    reveal: 1,
    revealMode: 'none',
    cta: false,
    tracks: {}
  }
  switch (type) {
    case 'text':
      base.text = {
        content: 'Jouw headline hier',
        fontId: null,
        size: 28,
        color: '#111111',
        weight: 700,
        align: 'left',
        lineHeight: 1.1,
        letterSpacing: 0
      }
      break
    case 'image':
      base.image = { src: '', fit: 'contain' }
      base.height = 160
      break
    case 'shape':
      base.shape = { fill: '#e30613', radius: 0, strokeColor: '#000000', strokeWidth: 0 }
      base.height = 100
      break
    case 'writeon':
      base.writeon = {
        content: 'Write-on',
        fontId: null,
        size: 48,
        color: '#111111',
        strokeWidth: 1.5,
        glyphs: [],
        viewBox: [0, 0, 100, 40],
        fillAfter: 0.4
      }
      base.height = 80
      break
  }
  return base
}

export function createComposition(width: number, height: number, name?: string): Composition {
  return {
    id: newId('c'),
    name: name ?? `${width}x${height}`,
    width,
    height,
    duration: 8,
    loops: 1,
    background: '#ffffff',
    border: { color: '#cccccc', width: 1 },
    layers: []
  }
}

const motion = (start: number, duration: number, spec: Partial<Motion>): Motion => ({
  start,
  duration,
  ease: 'easeOut',
  fade: true,
  dx: 0,
  dy: 0,
  scale: 1,
  rotation: 0,
  reveal: false,
  ...spec
})

/** Standaard-boilerplate: 300×600 met achtergrond, headline, subline, packshot-plek en CTA. */
export function createStarterProject(name = 'Nieuwe campagne'): Project {
  const comp = createComposition(BASE_SIZE.width, BASE_SIZE.height, 'Basis 300x600')
  const W = comp.width

  const bg = createLayer('shape', comp)
  Object.assign(bg, { name: 'Achtergrond', x: 0, y: 0, width: W, height: comp.height, locked: true })
  bg.shape!.fill = '#f4f1ea'

  const headline = createLayer('text', comp)
  Object.assign(headline, { name: 'Headline', x: 24, y: 40, width: W - 48, height: 70 })
  headline.text!.content = 'Jouw headline\nop twee regels'
  headline.text!.size = 28
  headline.intro = motion(0.2, 0.6, { dy: 30 })

  const sub = createLayer('text', comp)
  Object.assign(sub, { name: 'Subline', x: 24, y: 120, width: W - 48, height: 50 })
  sub.text!.content = 'Korte ondersteunende tekst.'
  sub.text!.size = 18
  sub.text!.weight = 400
  sub.intro = motion(0.6, 0.5, { dy: 15 })

  const pack = createLayer('shape', comp)
  Object.assign(pack, { name: 'Packshot (vervang door afbeelding)', x: 50, y: 250, width: W - 100, height: 200 })
  pack.shape!.fill = '#dcd6c8'
  pack.shape!.radius = 8
  pack.intro = motion(1.0, 0.7, { scale: 0.8, ease: 'backOut' })

  const ctaBg = createLayer('shape', comp)
  Object.assign(ctaBg, { name: 'CTA', x: 60, y: 500, width: W - 120, height: 50, cta: true })
  ctaBg.shape!.fill = '#e30613'
  ctaBg.shape!.radius = 25
  ctaBg.intro = motion(1.7, 0.5, { scale: 0, ease: 'backOut' })

  const ctaText = createLayer('text', comp)
  Object.assign(ctaText, { name: 'CTA tekst', x: 60, y: 513, width: W - 120, height: 26 })
  Object.assign(ctaText.text!, { content: 'Bekijk nu', size: 18, color: '#ffffff', align: 'center' })
  ctaText.intro = motion(1.9, 0.4, {})

  comp.layers = [ctaText, ctaBg, pack, sub, headline, bg]

  return {
    version: PROJECT_VERSION,
    name,
    clickTag: 'https://www.example.com',
    targets: ['cm360'],
    syncFormats: true,
    politeLoad: true,
    fonts: [],
    baseCompositionId: comp.id,
    compositions: [comp]
  }
}

/**
 * Maakt een nieuw formaat op basis van een bestaande compositie. Posities worden
 * relatief overgenomen (midden blijft op dezelfde verhouding), maten schalen met
 * de kleinste schaalfactor. Daarna kun je per formaat bijstellen.
 */
export function deriveComposition(src: Composition, width: number, height: number, name?: string): Composition {
  const layers = src.layers.map((l) => mapLayerToFormat(l, src, width, height))
  return { ...structuredClone(src), id: newId('c'), name: name ?? `${width}x${height}`, width, height, layers }
}

/**
 * Zet een laag om naar een ander formaat: het midden blijft op dezelfde relatieve
 * plek, maten schalen mee, full-bleed lagen blijven full-bleed.
 * De kopie krijgt een nieuw id maar houdt hetzelfde linkId.
 */
export function mapLayerToFormat(l: Layer, src: { width: number; height: number }, width: number, height: number): Layer {
  const sx = width / src.width
  const sy = height / src.height
  const copy: Layer = structuredClone(l)
  copy.id = newId('l')
  if (l.x <= 0 && l.y <= 0 && l.width >= src.width && l.height >= src.height) {
    copy.width = width
    copy.height = height
    return copy
  }
  // Geometrisch gemiddelde houdt tekst leesbaar bij afwijkende verhoudingen
  // (300x600 → 300x250 geeft 0,65 in plaats van 0,42); de laag past altijd in het formaat.
  const s = Math.min(Math.sqrt(sx * sy), (0.95 * width) / l.width, (0.95 * height) / l.height)
  const w = l.width * s
  const h = l.height * s
  const mapX = (x: number) => round((x + l.width / 2) * sx - w / 2, 1)
  const mapY = (y: number) => round((y + l.height / 2) * sy - h / 2, 1)
  copy.width = round(w, 1)
  copy.height = round(h, 1)
  copy.x = mapX(l.x)
  copy.y = mapY(l.y)
  if (copy.tracks.x) copy.tracks.x = copy.tracks.x.map((k) => ({ ...k, v: mapX(k.v) }))
  if (copy.tracks.y) copy.tracks.y = copy.tracks.y.map((k) => ({ ...k, v: mapY(k.v) }))
  if (copy.text) copy.text.size = round(copy.text.size * s, 1)
  if (copy.writeon) copy.writeon.size = round(copy.writeon.size * s, 1)
  if (copy.shape) copy.shape.radius = round(copy.shape.radius * s, 1)
  return copy
}

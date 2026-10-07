import { ellipsePath, parsePath, pointsPath, rectPath, segsBounds, transformSegs, translateSegs, segsToD, type Seg } from '@shared/svgpath'

// SVG → losse vormen. De SVG wordt onzichtbaar in de pagina gezet zodat de browser
// alle transformaties (ook viewBox) en stijlen (ook uit <style> en classes) uitrekent.

export interface SvgShape {
  name: string
  segs: Seg[]
  fill: string | null
  fillRule: 'nonzero' | 'evenodd'
  stroke: string | null
  strokeWidth: number
  closed: boolean
}

export interface SvgParse {
  width: number
  height: number
  shapes: SvgShape[]
  /** Elementen die niet als vorm konden (tekst, afbeeldingen, <use>). */
  skipped: string[]
}

const SKIP_PARENTS = 'defs, clipPath, mask, symbol, marker, pattern'

function toHex(color: string): string | null {
  if (!color || color === 'none' || color === 'transparent') return null
  const m = color.match(/rgba?\(([^)]+)\)/)
  if (!m) return color.startsWith('#') ? color : null
  const [r, g, b, a] = m[1].split(',').map((x) => parseFloat(x))
  if (a === 0) return null
  return '#' + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')
}

/** Kleur van een fill/stroke, ook als het een verloop is (dan de eerste kleur van het verloop). */
function resolvePaint(value: string, root: SVGSVGElement): string | null {
  const ref = value.match(/url\(["']?#([^"')]+)["']?\)/)
  if (ref) {
    const grad = root.querySelector(`#${CSS.escape(ref[1])}`)
    const stop = grad?.querySelector('stop')
    return stop ? toHex(getComputedStyle(stop).stopColor) : null
  }
  return toHex(value)
}

/**
 * Maakt een SVG-document onschadelijk vóórdat het in de editor wordt gezet: geen scripts,
 * event-handlers (onload, onerror …), externe of javascript:-links, iframes of ingebedde HTML.
 * Een SVG uit een onbekende bron mag in de editor nooit code uitvoeren.
 */
export function sanitizeSvg(doc: Document): void {
  for (const el of [...doc.querySelectorAll('script, foreignObject, iframe, embed, object, audio, video, animate, set, animateMotion, animateTransform')]) el.remove()
  for (const el of [doc.documentElement, ...doc.documentElement.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      const isLink = name === 'href' || name.endsWith(':href') || name === 'src'
      if (name.startsWith('on') || (isLink && !value.startsWith('#')) || /javascript:|data:text\/html/.test(value)) el.removeAttribute(attr.name)
    }
  }
}

export function parseSvg(text: string): SvgParse {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const src = doc.documentElement
  if (src.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error('Dit is geen geldig SVG-bestand.')
  // Niet-vertaalbare onderdelen tellen vóór het opschonen (voor de melding "… overgeslagen")
  const unsupported = [...doc.querySelectorAll('text, image, use, foreignObject')].filter((el) => !el.closest(SKIP_PARENTS)).map((el) => el.nodeName)
  sanitizeSvg(doc)
  const host = document.createElement('div')
  host.style.cssText = 'position:fixed;left:-20000px;top:0;opacity:0;pointer-events:none'
  const svg = document.importNode(src, true) as unknown as SVGSVGElement
  const vb = svg.viewBox?.baseVal
  const width = parseFloat(svg.getAttribute('width') ?? '') || vb?.width || 300
  const height = parseFloat(svg.getAttribute('height') ?? '') || vb?.height || 150
  svg.setAttribute('width', String(width))
  svg.setAttribute('height', String(height))
  host.appendChild(svg)
  document.body.appendChild(host)
  try {
    const shapes: SvgShape[] = []
    const skipped: string[] = unsupported
    const els = svg.querySelectorAll<SVGGraphicsElement>('path, rect, circle, ellipse, line, polyline, polygon')
    let n = 0
    for (const el of els) {
      if (el.closest(SKIP_PARENTS)) continue
      const cs = getComputedStyle(el)
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) continue
      const num = (a: string) => parseFloat(el.getAttribute(a) ?? '0') || 0
      let d = ''
      switch (el.nodeName.toLowerCase()) {
        case 'path':
          d = el.getAttribute('d') ?? ''
          break
        case 'rect': {
          const rx = el.hasAttribute('rx') ? num('rx') : num('ry')
          const ry = el.hasAttribute('ry') ? num('ry') : rx
          d = rectPath(num('x'), num('y'), num('width'), num('height'), rx, ry)
          break
        }
        case 'circle':
          d = ellipsePath(num('cx'), num('cy'), num('r'), num('r'))
          break
        case 'ellipse':
          d = ellipsePath(num('cx'), num('cy'), num('rx'), num('ry'))
          break
        case 'line':
          d = `M${num('x1')} ${num('y1')}L${num('x2')} ${num('y2')}`
          break
        case 'polyline':
          d = pointsPath(el.getAttribute('points') ?? '', false)
          break
        case 'polygon':
          d = pointsPath(el.getAttribute('points') ?? '', true)
          break
      }
      if (!d) continue
      const ctm = el.getCTM()
      const m = ctm ? { a: ctm.a, b: ctm.b, c: ctm.c, d: ctm.d, e: ctm.e, f: ctm.f } : { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
      const segs = transformSegs(parsePath(d), m)
      if (segs.length < 2) continue
      const fill = resolvePaint(cs.fill, svg)
      const stroke = resolvePaint(cs.stroke, svg)
      const scale = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1
      const strokeWidth = stroke ? parseFloat(cs.strokeWidth) * scale : 0
      if (!fill && !stroke) continue
      const tag = el.nodeName.toLowerCase()
      shapes.push({
        name: el.getAttribute('id') || `${{ path: 'Pad', rect: 'Rechthoek', circle: 'Cirkel', ellipse: 'Ellips', line: 'Lijn', polyline: 'Lijn', polygon: 'Veelhoek' }[tag] ?? 'Vorm'} ${++n}`,
        segs,
        fill,
        fillRule: cs.fillRule === 'evenodd' ? 'evenodd' : 'nonzero',
        stroke,
        strokeWidth: Math.round(strokeWidth * 100) / 100,
        closed: segs.some((s) => s.c === 'Z') || (!!fill && tag !== 'line' && tag !== 'polyline')
      })
    }
    return { width, height, shapes, skipped }
  } finally {
    host.remove()
  }
}

/** Vormen schalen (factor k) en klaarmaken als laag: elk met eigen kader en pad vanaf (0,0). */
export function shapesToLayers(parsed: SvgParse, k: number) {
  return parsed.shapes.map((s) => {
    const scaled = transformSegs(s.segs, { a: k, b: 0, c: 0, d: k, e: 0, f: 0 })
    const b = segsBounds(scaled)
    return {
      ...s,
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      d: segsToD(translateSegs(scaled, -b.x, -b.y)),
      strokeWidth: s.strokeWidth * k
    }
  })
}

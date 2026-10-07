// SVG-paden omzetten naar absolute commando's (M, L, C, Q, Z), een transformatie
// toepassen en weer als tekst schrijven. Gebruikt bij "SVG importeren als vormen":
// zo wordt elke vorm in de SVG een eigen, bewerkbare laag.

export type Seg =
  | { c: 'M' | 'L'; p: [number, number] }
  | { c: 'C'; p: [number, number, number, number, number, number] }
  | { c: 'Q'; p: [number, number, number, number] }
  | { c: 'Z' }

/** Affiene matrix zoals in SVG/DOMMatrix: x' = a·x + c·y + e, y' = b·x + d·y + f */
export interface Matrix {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi

/** Leest een SVG-pad en geeft absolute segmenten terug (H/V/S/T/A worden omgezet). */
export function parsePath(d: string): Seg[] {
  const out: Seg[] = []
  const tokens = d.match(/[a-df-z]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) ?? []
  let i = 0
  let cmd = ''
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  let lastC: [number, number] | null = null // laatste controlepunt (voor S)
  let lastQ: [number, number] | null = null // laatste controlepunt (voor T)
  const num = () => parseFloat(tokens[i++])
  // Boog-vlaggen staan in geminificeerde SVG vaak aan elkaar ("a1 1 0 011 1"): één cijfer per vlag.
  const flag = () => {
    const t = tokens[i]
    if (t && t.length > 1 && /^[01]/.test(t) && !t.includes('.')) {
      tokens[i] = t.slice(1)
      return Number(t[0])
    }
    i++
    return Number(t)
  }
  const isCmd = (t: string | undefined) => !!t && /[a-z]/i.test(t) && !/^-?[\d.]/.test(t)

  while (i < tokens.length) {
    if (isCmd(tokens[i])) cmd = tokens[i++]
    else if (!cmd) break
    const rel = cmd === cmd.toLowerCase()
    const C = cmd.toUpperCase()
    const ox = rel ? x : 0
    const oy = rel ? y : 0
    switch (C) {
      case 'M': {
        x = ox + num()
        y = oy + num()
        sx = x
        sy = y
        out.push({ c: 'M', p: [x, y] })
        cmd = rel ? 'l' : 'L' // volgende coördinaten zijn lijnen
        lastC = lastQ = null
        break
      }
      case 'L':
        x = ox + num()
        y = oy + num()
        out.push({ c: 'L', p: [x, y] })
        lastC = lastQ = null
        break
      case 'H':
        x = (rel ? x : 0) + num()
        out.push({ c: 'L', p: [x, y] })
        lastC = lastQ = null
        break
      case 'V':
        y = (rel ? y : 0) + num()
        out.push({ c: 'L', p: [x, y] })
        lastC = lastQ = null
        break
      case 'C': {
        const p: [number, number, number, number, number, number] = [ox + num(), oy + num(), ox + num(), oy + num(), ox + num(), oy + num()]
        out.push({ c: 'C', p })
        lastC = [p[2], p[3]]
        lastQ = null
        x = p[4]
        y = p[5]
        break
      }
      case 'S': {
        const [c1x, c1y] = lastC ? [2 * x - lastC[0], 2 * y - lastC[1]] : [x, y]
        const p: [number, number, number, number, number, number] = [c1x, c1y, ox + num(), oy + num(), ox + num(), oy + num()]
        out.push({ c: 'C', p })
        lastC = [p[2], p[3]]
        lastQ = null
        x = p[4]
        y = p[5]
        break
      }
      case 'Q': {
        const p: [number, number, number, number] = [ox + num(), oy + num(), ox + num(), oy + num()]
        out.push({ c: 'Q', p })
        lastQ = [p[0], p[1]]
        lastC = null
        x = p[2]
        y = p[3]
        break
      }
      case 'T': {
        const prevQ: [number, number] | null = lastQ
        const qx: number = prevQ ? 2 * x - prevQ[0] : x
        const qy: number = prevQ ? 2 * y - prevQ[1] : y
        const p: [number, number, number, number] = [qx, qy, ox + num(), oy + num()]
        out.push({ c: 'Q', p })
        lastQ = [qx, qy]
        lastC = null
        x = p[2]
        y = p[3]
        break
      }
      case 'A': {
        const rx = num()
        const ry = num()
        const rot = num()
        const large = flag()
        const sweep = flag()
        const ex = ox + num()
        const ey = oy + num()
        for (const c of arcToCubic(x, y, rx, ry, rot, !!large, !!sweep, ex, ey)) out.push({ c: 'C', p: c })
        x = ex
        y = ey
        lastC = lastQ = null
        break
      }
      case 'Z':
        out.push({ c: 'Z' })
        x = sx
        y = sy
        lastC = lastQ = null
        break
      default:
        i++ // onbekend: overslaan
    }
  }
  return out
}

/** Elliptische boog → kubische bezier-curves (standaard SVG-algoritme, max. 90° per curve). */
export function arcToCubic(
  x1: number,
  y1: number,
  rx: number,
  ry: number,
  angle: number,
  large: boolean,
  sweep: boolean,
  x2: number,
  y2: number
): [number, number, number, number, number, number][] {
  if (!rx || !ry || ![x1, y1, x2, y2, angle].every(Number.isFinite)) return [[x1, y1, x2, y2, x2, y2]]
  const phi = (angle * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - x2) / 2
  const dy = (y1 - y2) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lam > 1) {
    rx *= Math.sqrt(lam)
    ry *= Math.sqrt(lam)
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  const coef = (large !== sweep ? 1 : -1) * Math.sqrt(Math.max(0, num / den))
  const cxp = (coef * rx * y1p) / ry
  const cyp = (-coef * ry * x1p) / rx
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2
  const ang = (ux: number, uy: number, vx: number, vy: number) => {
    const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
    return a
  }
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry)
  if (!sweep && dt > 0) dt -= 2 * Math.PI
  if (sweep && dt < 0) dt += 2 * Math.PI
  if (!Number.isFinite(dt)) return [[x1, y1, x2, y2, x2, y2]]
  const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)))
  const step = dt / n
  const k = (4 / 3) * Math.tan(step / 4)
  const out: [number, number, number, number, number, number][] = []
  let t = t1
  const pt = (a: number): [number, number] => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos]
  const dpt = (a: number): [number, number] => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos]
  for (let i = 0; i < n; i++) {
    const a = t
    const b = t + step
    const [ax, ay] = pt(a)
    const [bx, by] = pt(b)
    const [dax, day] = dpt(a)
    const [dbx, dby] = dpt(b)
    out.push([ax + k * dax, ay + k * day, bx - k * dbx, by - k * dby, bx, by])
    t = b
  }
  // Laatste punt exact op het eindpunt
  out[out.length - 1][4] = x2
  out[out.length - 1][5] = y2
  return out
}

export function transformSegs(segs: Seg[], m: Matrix): Seg[] {
  const T = (x: number, y: number): [number, number] => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]
  return segs.map((s): Seg => {
    if (s.c === 'Z') return s
    if (s.c === 'M' || s.c === 'L') return { c: s.c, p: T(s.p[0], s.p[1]) }
    if (s.c === 'Q') {
      const [a, b] = T(s.p[0], s.p[1])
      const [c, d] = T(s.p[2], s.p[3])
      return { c: 'Q', p: [a, b, c, d] }
    }
    const p = s.p as [number, number, number, number, number, number]
    const [a, b] = T(p[0], p[1])
    const [c, d] = T(p[2], p[3])
    const [e, f] = T(p[4], p[5])
    return { c: 'C', p: [a, b, c, d, e, f] }
  })
}

export function translateSegs(segs: Seg[], dx: number, dy: number): Seg[] {
  return transformSegs(segs, { a: 1, b: 0, c: 0, d: 1, e: dx, f: dy })
}

export function segsToD(segs: Seg[], decimals = 2): string {
  const f = (n: number) => String(Math.round(n * 10 ** decimals) / 10 ** decimals)
  return segs.map((s) => (s.c === 'Z' ? 'Z' : s.c + s.p.map(f).join(' '))).join('')
}

/** Kader rond alle punten (inclusief controlepunten: iets ruimer bij bochten, nooit te krap). */
export function segsBounds(segs: Seg[]) {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const s of segs) {
    if (s.c === 'Z') continue
    for (let i = 0; i < s.p.length; i += 2) {
      x1 = Math.min(x1, s.p[i])
      x2 = Math.max(x2, s.p[i])
      y1 = Math.min(y1, s.p[i + 1])
      y2 = Math.max(y2, s.p[i + 1])
    }
  }
  return { x: x1, y: y1, w: Math.max(0.01, x2 - x1), h: Math.max(0.01, y2 - y1) }
}

/** Basisvormen als pad (rect met afronding, cirkel, ellips, lijn, polygon/polyline). */
export function rectPath(x: number, y: number, w: number, h: number, rx = 0, ry = rx): string {
  rx = Math.min(rx, w / 2)
  ry = Math.min(ry, h / 2)
  if (!rx && !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`
  return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`
}

export const ellipsePath = (cx: number, cy: number, rx: number, ry: number) =>
  `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`

export function pointsPath(points: string, close: boolean): string {
  const n = (points.match(NUM) ?? []).map(Number)
  if (n.length < 4) return ''
  let d = `M${n[0]} ${n[1]}`
  for (let i = 2; i + 1 < n.length; i += 2) d += `L${n[i]} ${n[i + 1]}`
  return close ? d + 'Z' : d
}

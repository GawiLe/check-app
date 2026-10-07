import { round } from './anim'

// Pen tool: punten met optionele bezier-handvatten → SVG-pad, genormaliseerd naar
// het eigen kader van de vorm (zodat de vorm meeschaalt als je de laag groter maakt).

export interface PenPoint {
  x: number
  y: number
  /** Handvat (uitgaand); het inkomende handvat is gespiegeld. */
  hx?: number
  hy?: number
}

export function penToPath(points: PenPoint[], closed: boolean) {
  if (points.length < 2) return null
  // Kader rond punten én handvatten
  const xs = points.flatMap((p) => [p.x, ...(p.hx != null ? [p.hx, 2 * p.x - p.hx] : [])])
  const ys = points.flatMap((p) => [p.y, ...(p.hy != null ? [p.hy, 2 * p.y - p.hy] : [])])
  const minX = Math.min(...xs)
  const minY = Math.min(...ys)
  const w = Math.max(1, Math.max(...xs) - minX)
  const h = Math.max(1, Math.max(...ys) - minY)
  const f = (n: number) => String(round(n, 1))
  const P = (x: number, y: number) => `${f(x - minX)} ${f(y - minY)}`
  const outH = (p: PenPoint) => (p.hx != null ? [p.hx, p.hy!] : [p.x, p.y])
  const inH = (p: PenPoint) => (p.hx != null ? [2 * p.x - p.hx, 2 * p.y - p.hy!] : [p.x, p.y])
  let d = `M${P(points[0].x, points[0].y)}`
  const seg = (a: PenPoint, b: PenPoint) => {
    if (a.hx == null && b.hx == null) return `L${P(b.x, b.y)}`
    const [ox, oy] = outH(a)
    const [ix, iy] = inH(b)
    return `C${P(ox, oy)} ${P(ix, iy)} ${P(b.x, b.y)}`
  }
  for (let i = 1; i < points.length; i++) d += seg(points[i - 1], points[i])
  if (closed) d += seg(points[points.length - 1], points[0]) + 'Z'
  return { d, x: round(minX, 1), y: round(minY, 1), w: round(w, 1), h: round(h, 1) }
}

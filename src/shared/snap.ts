// Slimme hulplijnen: tijdens slepen vastklikken op randen en middens van de banner en van andere lagen,
// en de afstanden tot de buren tonen.

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** Hulplijn: verticaal (axis x, op x = at) of horizontaal (axis y), van `from` tot `to` langs de andere as. */
export interface Guide {
  axis: 'x' | 'y'
  at: number
  from: number
  to: number
}

/** Afstandsmaat tussen de gesleepte selectie en een buur (of de bannerrand). */
export interface Measure {
  axis: 'x' | 'y'
  /** Begin en eind van de maat langs `axis`. */
  from: number
  to: number
  /** Positie op de andere as. */
  at: number
}

const lines = (a: number, size: number) => [a, a + size / 2, a + size]

/**
 * Corrigeert de verschuiving van `moving` (al op de nieuwe plek) zodat een rand of het midden op een
 * rand of midden van een doel valt, als dat binnen `threshold` ligt. Geeft de correctie en de hulplijnen.
 */
export function snapMove(moving: Rect, targets: Rect[], frame: { w: number; h: number }, threshold: number) {
  const all = [{ x: 0, y: 0, w: frame.w, h: frame.h }, ...targets]
  const best = (axis: 'x' | 'y') => {
    const pos = axis === 'x' ? moving.x : moving.y
    const size = axis === 'x' ? moving.w : moving.h
    let delta = 0
    let dist = threshold + 1e-9
    for (const t of all) {
      for (const tl of lines(axis === 'x' ? t.x : t.y, axis === 'x' ? t.w : t.h)) {
        for (const ml of lines(pos, size)) {
          const d = tl - ml
          if (Math.abs(d) < dist) {
            dist = Math.abs(d)
            delta = d
          }
        }
      }
    }
    return dist <= threshold ? delta : 0
  }
  const dx = best('x')
  const dy = best('y')
  const m = { ...moving, x: moving.x + dx, y: moving.y + dy }
  return { dx, dy, guides: guidesFor(m, all) }
}

/** Alle lijnen waar de rect nu precies op valt, over de volle lengte tussen de rect en de doelen. */
export function guidesFor(m: Rect, all: Rect[]): Guide[] {
  const out: Guide[] = []
  for (const axis of ['x', 'y'] as const) {
    const ml = lines(axis === 'x' ? m.x : m.y, axis === 'x' ? m.w : m.h)
    const found = new Map<number, Guide>()
    for (const t of all) {
      const tl = lines(axis === 'x' ? t.x : t.y, axis === 'x' ? t.w : t.h)
      for (const a of ml) {
        if (!tl.some((b) => Math.abs(a - b) < 0.5)) continue
        const from = axis === 'x' ? Math.min(m.y, t.y) : Math.min(m.x, t.x)
        const to = axis === 'x' ? Math.max(m.y + m.h, t.y + t.h) : Math.max(m.x + m.w, t.x + t.w)
        const key = Math.round(a * 2) / 2
        const g = found.get(key)
        if (g) {
          g.from = Math.min(g.from, from)
          g.to = Math.max(g.to, to)
        } else found.set(key, { axis, at: a, from, to })
      }
    }
    out.push(...found.values())
  }
  return out
}

/**
 * Afstanden naar links, rechts, boven en onder: tot de dichtstbijzijnde buur die ernaast ligt
 * (overlap op de andere as), anders tot de rand van de banner.
 */
export function measuresFor(m: Rect, others: Rect[], frame: { w: number; h: number }): Measure[] {
  const out: Measure[] = []
  const overlapY = (o: Rect) => o.y < m.y + m.h && o.y + o.h > m.y
  const overlapX = (o: Rect) => o.x < m.x + m.w && o.x + o.w > m.x
  const midY = (o: Rect | null) => (o ? (Math.max(m.y, o.y) + Math.min(m.y + m.h, o.y + o.h)) / 2 : m.y + m.h / 2)
  const midX = (o: Rect | null) => (o ? (Math.max(m.x, o.x) + Math.min(m.x + m.w, o.x + o.w)) / 2 : m.x + m.w / 2)

  // Links en rechts
  let left: Rect | null = null
  let right: Rect | null = null
  for (const o of others) {
    if (!overlapY(o)) continue
    if (o.x + o.w <= m.x && (!left || o.x + o.w > left.x + left.w)) left = o
    if (o.x >= m.x + m.w && (!right || o.x < right.x)) right = o
  }
  const lx = left ? left.x + left.w : 0
  const rx = right ? right.x : frame.w
  if (m.x > lx) out.push({ axis: 'x', from: lx, to: m.x, at: midY(left) })
  if (rx > m.x + m.w) out.push({ axis: 'x', from: m.x + m.w, to: rx, at: midY(right) })

  // Boven en onder
  let top: Rect | null = null
  let bottom: Rect | null = null
  for (const o of others) {
    if (!overlapX(o)) continue
    if (o.y + o.h <= m.y && (!top || o.y + o.h > top.y + top.h)) top = o
    if (o.y >= m.y + m.h && (!bottom || o.y < bottom.y)) bottom = o
  }
  const ty = top ? top.y + top.h : 0
  const by = bottom ? bottom.y : frame.h
  if (m.y > ty) out.push({ axis: 'y', from: ty, to: m.y, at: midX(top) })
  if (by > m.y + m.h) out.push({ axis: 'y', from: m.y + m.h, to: by, at: midX(bottom) })
  return out
}

/** Omhullende rechthoek van een lijst rechthoeken. */
export function union(rs: Rect[]): Rect | null {
  if (!rs.length) return null
  const x = Math.min(...rs.map((r) => r.x))
  const y = Math.min(...rs.map((r) => r.y))
  return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y }
}

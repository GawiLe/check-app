// Overzicht "Alle formaten": één gemeenschappelijke schaal waarmee alle formaten tegelijk in beeld
// passen. Dezelfde schaal voor allemaal, zodat je de echte verhoudingen ziet (zoals in een mediaplan).

export interface TileSize {
  w: number
  h: number
}

/**
 * Grootste schaal (hooguit 1) waarbij de tegels, in rijen zoals flex-wrap ze legt, binnen
 * `width` × `height` passen. `cap` is de hoogte van het bijschrift per tegel, `gap` de ruimte ertussen.
 */
export function fitScale(sizes: TileSize[], width: number, height: number, gap: number, cap: number): number {
  if (!sizes.length || width <= 0 || height <= 0) return 1
  const fits = (s: number) => {
    let x = 0
    let rowH = 0
    let total = 0
    for (const { w, h } of sizes) {
      const tw = w * s
      const th = h * s + cap
      if (tw > width) return false
      if (x > 0 && x + gap + tw > width) {
        total += rowH + gap
        x = 0
        rowH = 0
      }
      x += (x > 0 ? gap : 0) + tw
      rowH = Math.max(rowH, th)
    }
    return total + rowH <= height
  }
  if (fits(1)) return 1
  let lo = 0.02
  let hi = 1
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return Math.floor(lo * 1000) / 1000
}

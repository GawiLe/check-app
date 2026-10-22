import { describe, expect, it } from 'vitest'
import { fitScale } from '../src/shared/overview'

describe('overzicht alle formaten', () => {
  const sizes = [
    { w: 300, h: 600 },
    { w: 300, h: 250 },
    { w: 970, h: 250 },
    { w: 728, h: 90 }
  ]

  it('past alles op 100% als er ruimte genoeg is', () => {
    expect(fitScale(sizes, 4000, 3000, 20, 30)).toBe(1)
  })

  it('kiest één schaal waarmee alles in beeld past (zelfde schaal voor alle formaten)', () => {
    const W = 900
    const H = 600
    const s = fitScale(sizes, W, H, 20, 30)
    expect(s).toBeGreaterThan(0.2)
    expect(s).toBeLessThan(1)
    // Na-rekenen zoals flex-wrap: rijen vullen tot de breedte, dan de hoogte optellen
    let x = 0
    let rowH = 0
    let total = 0
    for (const { w, h } of sizes) {
      const tw = w * s
      if (x > 0 && x + 20 + tw > W) {
        total += rowH + 20
        x = 0
        rowH = 0
      }
      x += (x > 0 ? 20 : 0) + tw
      rowH = Math.max(rowH, h * s + 30)
      expect(tw).toBeLessThanOrEqual(W)
    }
    expect(total + rowH).toBeLessThanOrEqual(H)
  })

  it('geen ruimte of geen formaten: gewoon 100%', () => {
    expect(fitScale([], 500, 500, 10, 10)).toBe(1)
    expect(fitScale(sizes, 0, 0, 10, 10)).toBe(1)
  })
})

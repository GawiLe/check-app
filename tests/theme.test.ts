import { describe, expect, it } from 'vitest'
import { DEFAULT_THEME, THEME_PRESETS, themeVars } from '../src/renderer/src/lib/theme'

describe('kleuren van de editor', () => {
  it('standaard: oranje accent met donkere tekst erop (beste contrast)', () => {
    const v = themeVars(DEFAULT_THEME)
    expect(v['--accent']).toBe('#ff6a13')
    expect(v['--accent-rgb']).toBe('255, 106, 19')
    expect(v['--accent-ink']).toBe('#1a1a1d')
    expect(v['--bar-active']).toBe('#1d6a4f')
  })

  it('donker accent krijgt witte tekst; afgeleide kleuren zijn geldige hexcodes', () => {
    const v = themeVars({ accent: '#24508a', layer: '#6a2f55', key: '#ffd166' })
    expect(v['--accent-ink']).toBe('#ffffff')
    for (const k of ['--accent-hover', '--bar', '--bar-group', '--bar-group-active', '--row-active']) expect(v[k]).toMatch(/^#[0-9a-f]{6}$/)
    // Groepen krijgen een andere tint dan gewone lagen
    expect(v['--bar-group-active']).not.toBe(v['--bar-active'])
  })

  it('alle voorbeeldthema’s geven volledige kleuren', () => {
    for (const p of THEME_PRESETS) expect(Object.values(themeVars(p.theme)).every((x) => typeof x === 'string' && x.length > 0)).toBe(true)
  })
})

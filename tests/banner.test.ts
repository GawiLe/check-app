import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import { layerStateAt, sampleTrack } from '../src/shared/anim'
import { buildBanner } from '../src/shared/build'
import { createLayer, createStarterProject, deriveComposition } from '../src/shared/factory'
import { mergeTracks, PRESETS } from '../src/shared/presets'
import type { Project } from '../src/shared/types'
import { isLight, validateBanner } from '../src/shared/validate'

const build = (p: Project, mode: 'preview' | 'export' = 'export') =>
  buildBanner(p, p.compositions[0], { mode, target: 'cm360', assetUrl: (x) => x.split('/').pop()!, fontSrc: {} })

describe('animatie', () => {
  it('interpoleert tussen keyframes met easing', () => {
    const kfs = [
      { t: 0, v: 0, e: 'linear' as const },
      { t: 1, v: 100, e: 'linear' as const }
    ]
    expect(sampleTrack(kfs, -1, 5)).toBe(0)
    expect(sampleTrack(kfs, 0.5, 5)).toBe(50)
    expect(sampleTrack(kfs, 2, 5)).toBe(100)
    expect(sampleTrack(undefined, 0.5, 5)).toBe(5)
    expect(sampleTrack([{ t: 0, v: 0, e: 'hold' }, { t: 1, v: 1, e: 'linear' }], 0.9, 0)).toBe(0)
  })

  it('presets voegen keyframes samen zonder bestaande buiten het bereik te verliezen', () => {
    const l = createLayer('text', { width: 300, height: 600 })
    l.tracks.opacity = [{ t: 5, v: 1, e: 'linear' }]
    const res = PRESETS.find((p) => p.id === 'fadeIn')!.apply(l, { start: 0, duration: 1, compWidth: 300, compHeight: 600 })
    const merged = mergeTracks(l.tracks, res.tracks)
    expect(merged.opacity!.map((k) => k.t)).toEqual([0, 1, 5])
  })
})

describe('export-HTML', () => {
  const project = createStarterProject('Test')
  const { html } = build(project)

  it('bevat de verplichte Google/IAB-onderdelen', () => {
    expect(html).toContain('<meta name="ad.size" content="width=300,height=600">')
    expect(html).toContain('var clickTag="https://www.example.com";')
    expect(html).toContain('window.open(window.clickTag)')
    expect(html).not.toMatch(/src=["']?https?:/)
  })

  it('is licht: geen frameworks of Enabler', () => {
    expect(html.length).toBeLessThan(8 * 1024)
    expect(html).not.toMatch(/Enabler|gwd|gsap/i)
  })

  it('escapet tekst en CSS-waarden', () => {
    const p = createStarterProject()
    p.compositions[0].layers[0].text!.content = '<script>alert(1)</script>'
    p.compositions[0].background = 'red;}</style><script>'
    const out = build(p).html
    expect(out).not.toContain('<script>alert(1)')
    expect(out).not.toContain('</style><script>')
  })

  it('runtime toont exact dezelfde waarden als de editor', async () => {
    const dom = new JSDOM(build(project, 'preview').html, { runScripts: 'dangerously', pretendToBeVisual: true })
    await new Promise((r) => dom.window.addEventListener('load', () => setTimeout(r, 20)))
    const win = dom.window as unknown as { BS: { seek(t: number): void }; document: Document }
    expect(win.document.body.className).toContain('r')
    const comp = project.compositions[0]
    const visible = [...comp.layers].reverse()
    for (const t of [0, 0.5, 1.3, 2.4, 10]) {
      win.BS.seek(t)
      visible.forEach((l, i) => {
        const el = win.document.getElementById(`a${i}`)!
        if (!Object.keys(l.tracks).length) return
        const st = layerStateAt(l, Math.min(t, comp.duration))
        const m = el.style.transform.match(/translate\(([-\d.e]+)px, ?([-\d.e]+)px\) rotate\(([-\d.e]+)deg\) scale\(([-\d.e]+)\)/)!
        expect(+m[1]).toBeCloseTo(st.x, 2)
        expect(+m[2]).toBeCloseTo(st.y, 2)
        expect(+m[4]).toBeCloseTo(st.scale, 2)
        expect(+el.style.opacity).toBeCloseTo(st.opacity, 2)
      })
    }
  })
})

describe('validatie', () => {
  const project = createStarterProject()
  const comp = project.compositions[0]
  const { html } = build(project)
  const files = [{ name: 'index.html', bytes: html.length }]

  it('keurt de starter goed voor CM360', () => {
    const issues = validateBanner({ target: 'cm360', comp, html, files, zipBytes: 3000, backupBytes: 20000 })
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
  })

  it('vindt te lange animaties, te veel loops, verboden bestanden en ontbrekende clickTag', () => {
    const bad = { ...comp, duration: 12, loops: 4 }
    const issues = validateBanner({
      target: 'google-ads',
      comp: bad,
      html: html.replace('window.open(window.clickTag)', 'void(0)'),
      files: [...files, { name: 'font.woff2', bytes: 10 }],
      zipBytes: 200 * 1024,
      backupBytes: null
    })
    const rules = issues.filter((i) => i.level === 'error').map((i) => i.rule)
    expect(rules).toEqual(expect.arrayContaining(['loops', 'duur', 'bestandstype', 'clickTag', 'gewicht']))
  })

  it('herkent lichte achtergronden', () => {
    expect(isLight('#ffffff')).toBe(true)
    expect(isLight('#fff')).toBe(true)
    expect(isLight('#ff0000')).toBe(false)
  })
})

describe('formaten afleiden', () => {
  it('schaalt lagen naar een nieuw formaat en houdt full-bleed lagen vol', () => {
    const base = createStarterProject().compositions[0]
    const mr = deriveComposition(base, 300, 250)
    expect(mr.width).toBe(300)
    const bg = mr.layers.find((l) => l.name === 'Achtergrond')!
    expect([bg.width, bg.height]).toEqual([300, 250])
    for (const l of mr.layers) {
      expect(l.x + l.width / 2).toBeGreaterThanOrEqual(0)
      expect(l.y + l.height / 2).toBeLessThanOrEqual(250)
    }
    expect(new Set(mr.layers.map((l) => l.id)).size).toBe(mr.layers.length)
    expect(mr.layers.every((l) => !base.layers.some((b) => b.id === l.id))).toBe(true)
  })
})

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
        if (!l.intro && !l.outro && !Object.keys(l.tracks).length) return
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

describe('meerdere formaten in één werkbestand', () => {
  it('zet tekst, kleur en timing door naar gekoppelde lagen, positie blijft per formaat', async () => {
    const { syncFormats } = await import('../src/shared/sync')
    const p = createStarterProject()
    const base = p.compositions[0]
    p.compositions.push(deriveComposition(base, 300, 250))
    const prev = structuredClone(p)
    const head = base.layers.find((l) => l.name === 'Headline')!
    head.text!.content = 'Nieuwe tekst'
    head.text!.color = '#ff0000'
    head.x = 5
    head.tracks.opacity = [
      { t: 1, v: 0, e: 'easeOut' },
      { t: 2, v: 1, e: 'linear' }
    ]
    syncFormats(prev, p, base.id)
    const other = p.compositions[1].layers.find((l) => l.linkId === head.linkId)!
    expect(other.text!.content).toBe('Nieuwe tekst')
    expect(other.text!.color).toBe('#ff0000')
    expect(other.text!.size).not.toBe(head.text!.size)
    expect(other.x).not.toBe(5)
    expect(other.tracks.opacity!.map((k) => k.t)).toEqual([1, 2])
  })

  it('voegt nieuwe lagen toe en verwijdert lagen in alle formaten', async () => {
    const { syncFormats } = await import('../src/shared/sync')
    const p = createStarterProject()
    const base = p.compositions[0]
    p.compositions.push(deriveComposition(base, 728, 90))
    let prev = structuredClone(p)
    const l = createLayer('shape', base)
    base.layers.unshift(l)
    syncFormats(prev, p, base.id)
    expect(p.compositions[1].layers[0].linkId).toBe(l.linkId)
    expect(p.compositions[1].layers[0].height).toBeLessThanOrEqual(90)
    prev = structuredClone(p)
    base.layers.shift()
    syncFormats(prev, p, base.id)
    expect(p.compositions[1].layers.some((x) => x.linkId === l.linkId)).toBe(false)
  })
})

describe('binnenkomst en uitgang', () => {
  it('maakt keyframes rond de rustpositie en stopt het eindframe vóór de uitgang', async () => {
    const { effectiveLayer, endFrameTime, defaultOutro } = await import('../src/shared/motion')
    const p = createStarterProject()
    const comp = p.compositions[0]
    const l = createLayer('text', comp)
    l.y = 100
    l.intro = { start: 1, duration: 0.5, ease: 'easeOut', fade: true, dx: 0, dy: 20, scale: 1, rotation: 0, reveal: false }
    l.outro = defaultOutro(comp)
    comp.layers.unshift(l)
    const e = effectiveLayer(l)
    expect(e.tracks.y!.map((k) => k.v)).toEqual([120, 100])
    expect(e.tracks.opacity!.map((k) => k.v)).toEqual([0, 1, 1, 0])
    expect(layerStateAt(l, 0).opacity).toBe(0)
    expect(layerStateAt(l, 1.5).y).toBe(100)
    expect(endFrameTime(comp)).toBe(l.outro.start)
    // handmatige keyframes gaan voor
    l.tracks.y = [{ t: 0, v: 50, e: 'linear' }]
    expect(effectiveLayer(l).tracks.y!.map((k) => k.v)).toEqual([50])
  })

  it('polite loading: afbeeldingen via data-src', () => {
    const p = createStarterProject()
    const img = createLayer('image', p.compositions[0])
    img.image!.src = 'assets/a.png'
    p.compositions[0].layers.unshift(img)
    expect(build(p).html).toContain('data-src="a.png"')
    p.politeLoad = false
    expect(build(p).html).toContain(' src="a.png"')
  })
})

describe('basis is leidend, met overrides per formaat', () => {
  const setup = async () => {
    const sync = await import('../src/shared/sync')
    const p = createStarterProject()
    const base = p.compositions[0]
    p.compositions.push(deriveComposition(base, 300, 250))
    const other = p.compositions[1]
    const edit = (compId: string, fn: () => void) => {
      const prev = structuredClone(p)
      fn()
      sync.syncFormats(prev, p, compId)
    }
    const head = () => base.layers.find((l) => l.name === 'Headline')!
    const headOther = () => other.layers.find((l) => l.linkId === head().linkId)!
    return { sync, p, base, other, edit, head, headOther }
  }

  it('aanpassing in de basis gaat mee, ook positie (omgerekend)', async () => {
    const { base, edit, head, headOther } = await setup()
    const x0 = headOther().x
    edit(base.id, () => {
      head().text!.content = 'Nieuw'
      head().x += 30
    })
    expect(headOther().text!.content).toBe('Nieuw')
    expect(headOther().x).not.toBe(x0)
  })

  it('wat je in een formaat anders zet, blijft staan als de basis verandert', async () => {
    const { base, other, edit, head, headOther } = await setup()
    edit(other.id, () => {
      headOther().text!.size = 40
      headOther().y = 7
    })
    expect(headOther().overrides).toEqual(expect.arrayContaining(['text.size', 'y']))
    edit(base.id, () => {
      head().text!.size = 12
      head().y = 300
      head().text!.color = '#00ff00'
    })
    expect(headOther().text!.size).toBe(40)
    expect(headOther().y).toBe(7)
    expect(headOther().text!.color).toBe('#00ff00')
  })

  it('wijziging in een afgeleid formaat gaat niet terug naar de basis', async () => {
    const { base, other, edit, head, headOther } = await setup()
    edit(other.id, () => void (headOther().text!.content = 'Alleen hier'))
    expect(head().text!.content).not.toBe('Alleen hier')
    expect(base.layers.length).toBe(other.layers.length)
  })

  it('herstellen haalt de waarde weer uit de basis', async () => {
    const { sync, p, other, edit, head, headOther } = await setup()
    edit(other.id, () => void (headOther().text!.content = 'Afwijkend'))
    sync.resetOverrides(p, other.id, headOther().id)
    expect(headOther().text!.content).toBe(head().text!.content)
    expect(headOther().overrides).toBeUndefined()
  })

  it('compositie-instellingen: basis leidend, override per formaat', async () => {
    const { base, other, edit } = await setup()
    edit(base.id, () => void (base.duration = 12))
    expect(other.duration).toBe(12)
    edit(other.id, () => void (other.background = '#000000'))
    edit(base.id, () => void (base.background = '#ff0000'))
    expect(other.background).toBe('#000000')
  })
})

describe('animatiebibliotheek', () => {
  it('elk item geeft een geldige animatie die de laag eindigt in rust', async () => {
    const { LIBRARY, applyLibraryItem } = await import('../src/shared/library')
    const { effectiveLayer } = await import('../src/shared/motion')
    const comp = createStarterProject().compositions[0]
    for (const item of LIBRARY) {
      const l = createLayer(item.reveal === 'writeon' ? 'writeon' : 'shape', comp)
      l.x = 50
      l.y = 100
      applyLibraryItem(l, item, comp, 1)
      const e = effectiveLayer(l)
      expect(Object.keys(e.tracks).length, item.id).toBeGreaterThan(0)
      if (item.kind !== 'outro') {
        const st = layerStateAt(l, 1 + 5)
        expect(st.x, item.id).toBeCloseTo(50)
        expect(st.y, item.id).toBeCloseTo(100)
        expect(st.scale, item.id).toBeCloseTo(1)
      }
    }
  })

  it('bounce in komt van boven en stuitert naar de rustpositie', async () => {
    const { LIBRARY, applyLibraryItem } = await import('../src/shared/library')
    const comp = createStarterProject().compositions[0]
    const l = createLayer('shape', comp)
    l.y = 100
    applyLibraryItem(l, LIBRARY.find((i) => i.id === 'bounceIn')!, comp, 0)
    expect(layerStateAt(l, 0).y).toBeLessThan(100)
    expect(layerStateAt(l, 0.9).y).toBeCloseTo(100)
  })
})

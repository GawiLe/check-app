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

describe('groepen (pre-comps) en in/uit-punten', () => {
  const setup = async () => {
    const tree = await import('../src/shared/tree')
    const p = createStarterProject()
    const comp = p.compositions[0]
    const cta = comp.layers.find((l) => l.name === 'CTA')!
    const ctaText = comp.layers.find((l) => l.name === 'CTA tekst')!
    return { tree, p, comp, cta, ctaText }
  }

  it('groeperen houdt de lagen op dezelfde plek en de groep is als geheel te animeren', async () => {
    const { tree, p, comp, cta, ctaText } = await setup()
    const absBefore = [cta.x, cta.y, ctaText.x, ctaText.y]
    const g = tree.groupLayers(comp, [cta.id, ctaText.id], 'CTA-groep')!
    expect(g.children!.length).toBe(2)
    expect(comp.layers.some((l) => l.id === cta.id)).toBe(false)
    expect([g.x + cta.x, g.y + cta.y, g.x + ctaText.x, g.y + ctaText.y]).toEqual(absBefore)
    g.intro = { start: 3, duration: 0.5, ease: 'easeOut', fade: true, dx: 0, dy: 40, scale: 1, rotation: 0, reveal: false }
    const html = build(p).html
    // geneste div's: de CTA-lagen zitten binnen de groep
    expect(html).toMatch(/<div id="a\d+" class="L"><div id="a\d+" class="L">/)
  })

  it('degroeperen zet alles terug', async () => {
    const { tree, comp, cta, ctaText } = await setup()
    const before = structuredClone(comp.layers.map((l) => [l.name, l.x, l.y]))
    const g = tree.groupLayers(comp, [cta.id, ctaText.id])!
    tree.ungroup(comp, g.id)
    expect(comp.layers.map((l) => [l.name, l.x, l.y])).toEqual(before)
  })

  it('in-punt verschuift de inhoud van een groep en uit-punt verbergt hem', async () => {
    const { tree, p, comp, cta, ctaText } = await setup()
    const g = tree.groupLayers(comp, [cta.id, ctaText.id])!
    const introStart = cta.intro!.start
    tree.shiftTiming(g, 2)
    g.end = 6
    const dom = new JSDOM(build(p, 'preview').html, { runScripts: 'dangerously', pretendToBeVisual: true })
    await new Promise((r) => dom.window.addEventListener('load', () => setTimeout(r, 20)))
    const win = dom.window as unknown as { BS: { seek(t: number): void }; document: Document }
    const groupEl = win.document.querySelector('.L > .L')!.parentElement as HTMLElement
    win.BS.seek(1)
    expect(groupEl.style.display).toBe('none')
    win.BS.seek(3)
    expect(groupEl.style.display).toBe('')
    win.BS.seek(6.5)
    expect(groupEl.style.display).toBe('none')
    // CTA-animatie start nu 2s later (absolute tijd in de runtime-data)
    expect(build(p).html).toContain(`[${introStart + 2},`)
  })

  it('achter elkaar zetten (sequence) zoals in After Effects', async () => {
    const { tree, comp } = await setup()
    const [a, b] = [comp.layers[0], comp.layers[1]]
    const g1 = tree.groupLayers(comp, [a.id], 'Scene 1')!
    const g2 = tree.groupLayers(comp, [b.id], 'Scene 2')!
    g1.end = 3
    tree.sequenceLayers(comp, [g1.id, g2.id])
    expect(g1.start).toBe(0)
    expect(g2.start).toBe(3)
    expect(g2.end).toBeGreaterThan(3)
  })

  it('dupliceren geeft nieuwe ids, ook binnen de groep', async () => {
    const { tree, comp, cta, ctaText } = await setup()
    const g = tree.groupLayers(comp, [cta.id, ctaText.id])!
    const c = tree.cloneLayer(g)
    const ids = tree.allLayers([g, c]).map((l) => l.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('fonts', () => {
  it('Google Fonts-catalogus wordt genormaliseerd en gesorteerd', async () => {
    const { normalizeCatalog, fontFileUrl } = await import('../src/shared/webfonts')
    const list = normalizeCatalog([
      { id: 'roboto', family: 'Roboto', weights: [400, 700], styles: ['normal', 'italic'], category: 'sans-serif' },
      { id: 'abel', family: 'Abel', weights: [400], styles: ['normal'] },
      { nonsense: true }
    ])
    expect(list.map((f) => f.family)).toEqual(['Abel', 'Roboto'])
    expect(list[1].styles).toEqual(['normal', 'italic'])
    expect(fontFileUrl('roboto', 700, 'normal')).toBe('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-700-normal.woff2')
  })

  it('systeemfonts worden op naam gebruikt en niet meegeleverd', () => {
    const p = createStarterProject()
    p.fonts.push({ id: 'sys', family: 'Georgia', file: '', weight: 400, style: 'normal', system: true })
    p.compositions[0].layers.find((l) => l.name === 'Headline')!.text!.fontId = 'sys'
    const html = build(p).html
    expect(html).toContain('font-family:"Georgia",Arial')
    expect(html).not.toContain('@font-face')
  })
})

describe('eigen presets', () => {
  it('slaat animatie relatief op en past hem op een andere laag toe', async () => {
    const { presetFromLayer, applyUserPreset } = await import('../src/shared/library')
    const comp = createStarterProject().compositions[0]
    const a = createLayer('shape', comp)
    a.x = 100
    a.tracks.x = [
      { t: 2, v: 50, e: 'easeOut' },
      { t: 3, v: 100, e: 'linear' }
    ]
    a.emphasis = { type: 'pulse', start: 4, duration: 1, repeat: 2, strength: 1 }
    const preset = presetFromLayer(a, 'Mijn slide', 'p1')
    const b = createLayer('shape', comp)
    b.x = 10
    applyUserPreset(b, preset, 0)
    expect(b.tracks.x!.map((k) => [k.t, k.v])).toEqual([
      [0, -40],
      [1, 10]
    ])
    expect(b.emphasis!.start).toBe(2)
  })
})

describe('keyframe-assistent (Easy Ease)', () => {
  const kfs = () => [
    { t: 0, v: 0, e: 'linear' as const },
    { t: 1, v: 100, e: 'linear' as const },
    { t: 2, v: 50, e: 'bounceOut' as const },
    { t: 3, v: 0, e: 'linear' as const }
  ]
  it('Easy Ease op de middelste keyframe: rustig aankomen én vertrekken', async () => {
    const { applyKeyAssist } = await import('../src/shared/keys')
    const out = applyKeyAssist(kfs(), [1], 'easy')
    expect(out.map((k) => k.e)).toEqual(['easeOut', 'easeIn', 'bounceOut', 'linear'])
  })
  it('Easy Ease op twee keyframes: segment ertussen wordt ease in-out', async () => {
    const { applyKeyAssist } = await import('../src/shared/keys')
    const out = applyKeyAssist(kfs(), [0, 1], 'easy')
    expect(out[0].e).toBe('easeInOut')
  })
  it('In en Out apart, en terug naar lineair', async () => {
    const { applyKeyAssist } = await import('../src/shared/keys')
    expect(applyKeyAssist(kfs(), [1], 'in').map((k) => k.e).slice(0, 2)).toEqual(['easeOut', 'linear'])
    expect(applyKeyAssist(kfs(), [1], 'out').map((k) => k.e).slice(0, 2)).toEqual(['linear', 'easeIn'])
    const lin = applyKeyAssist(applyKeyAssist(kfs(), [1], 'easy'), [1], 'linear')
    expect(lin.map((k) => k.e).slice(0, 2)).toEqual(['linear', 'linear'])
  })
})

describe('anchor point', () => {
  it('verplaatsen houdt de laag op dezelfde plek (ook geschaald en gedraaid)', async () => {
    const { moveAnchor, layerCorners } = await import('../src/shared/geometry')
    const l = createLayer('shape', { width: 300, height: 600 })
    Object.assign(l, { x: 50, y: 80, width: 100, height: 40, scale: 1.5, rotation: 30 })
    const before = layerCorners(l.x, l.y, l.width, l.height, 0.5, 0.5, 1.5, 30).corners
    moveAnchor(l, 0, 1, 1.5, 30)
    const after = layerCorners(l.x, l.y, l.width, l.height, 0, 1, 1.5, 30).corners
    after.forEach((c, i) => {
      expect(c[0]).toBeCloseTo(before[i][0], 1)
      expect(c[1]).toBeCloseTo(before[i][1], 1)
    })
  })
  it('wordt als transform-origin geëxporteerd', () => {
    const p = createStarterProject()
    p.compositions[0].layers[0].anchorX = 0
    p.compositions[0].layers[0].anchorY = 1
    expect(build(p).html).toContain('transform-origin:0% 100%')
  })
})

describe('vormen', () => {
  it('ellips, rechthoek zonder vulling, en pen-pad', async () => {
    const { penToPath } = await import('../src/shared/path')
    const p = createStarterProject()
    const comp = p.compositions[0]
    const e = createLayer('shape', comp)
    e.shape!.kind = 'ellipse'
    const r = createLayer('shape', comp)
    r.shape!.fillEnabled = false
    r.shape!.strokeWidth = 2
    const path = penToPath(
      [
        { x: 10, y: 10 },
        { x: 60, y: 10, hx: 80, hy: 30 },
        { x: 30, y: 70 }
      ],
      true
    )!
    expect(path.d.startsWith('M0 ')).toBe(true)
    expect(path.y).toBe(-10)
    expect(path.d).toContain('C')
    expect(path.d.endsWith('Z')).toBe(true)
    const pen = createLayer('shape', comp)
    pen.shape!.kind = 'path'
    pen.shape!.strokeWidth = 3
    pen.shape!.path = { d: path.d, w: path.w, h: path.h, closed: true }
    comp.layers.unshift(e, r, pen)
    const html = build(p).html
    expect(html).toContain('border-radius:50%')
    expect(html).toContain('vector-effect="non-scaling-stroke"')
    expect(html).toMatch(/border:2px solid/)
  })
})

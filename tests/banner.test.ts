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
    expect(html).toContain('var clickTag = "https://www.example.com";')
    expect(html).toContain('window.open(window.clickTag)')
    expect(html).not.toMatch(/src=["']?https?:/)
  })

  it('clickTag: fallback, door het ad-server meegegeven URL, en geen javascript:-URL', () => {
    const p = createStarterProject('Klik')
    p.clickTag = 'https://www.makro.nl'
    const out = build(p).html
    const clickTagAt = (url: string) => {
      const dom = new JSDOM(out, { url, runScripts: 'dangerously', pretendToBeVisual: true })
      return (dom.window as unknown as { clickTag: string }).clickTag
    }
    expect(clickTagAt('https://s0.2mdn.net/ads/index.html')).toBe('https://www.makro.nl')
    expect(clickTagAt('https://ads.example/index.html?clickTag=' + encodeURIComponent('https://ad.server/click?u=https%3A%2F%2Fwww.makro.nl'))).toBe(
      'https://ad.server/click?u=https%3A%2F%2Fwww.makro.nl'
    )
    expect(clickTagAt('https://ads.example/index.html?clickTAG=https%3A%2F%2Fx.nl')).toBe('https://x.nl')
    expect(clickTagAt('https://ads.example/index.html?clickTag=javascript%3Aalert(1)')).toBe('https://www.makro.nl')
    expect(clickTagAt('https://ads.example/index.html?clickTag=')).toBe('https://www.makro.nl')
  })

  it('waarschuwt als de clickTag nog de voorbeeld-URL is', () => {
    const comp = project.compositions[0]
    const issues = validateBanner({ target: 'cm360', comp, html, files: [], zipBytes: 1000, politeLoad: true } as never)
    expect(issues.some((i) => i.rule === 'clickTag' && i.level === 'warning')).toBe(true)
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
        const m = el.style.transform.match(/translate\(([-\d.e]+)px, ?([-\d.e]+)px\) rotate\(([-\d.e]+)deg\) scale\(([-\d.e]+)(?:, ?([-\d.e]+))?\)/)!
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

describe('lagen verslepen', () => {
  it('verandert de volgorde binnen een lijst', async () => {
    const { reorderLayer } = await import('../src/shared/tree')
    const comp = createStarterProject().compositions[0]
    const names = () => comp.layers.map((l) => l.name)
    const [first, , third] = comp.layers
    reorderLayer(comp, first.id, third.id, 'after')
    expect(names().indexOf(first.name)).toBe(2)
  })
  it('naar een andere compositie: blijft op dezelfde plek en hetzelfde moment', async () => {
    const { reorderLayer, groupLayers, shiftTiming, findDeep } = await import('../src/shared/tree')
    const comp = createStarterProject().compositions[0]
    const cta = comp.layers.find((l) => l.name === 'CTA')!
    const sub = comp.layers.find((l) => l.name === 'Subline')!
    const g = groupLayers(comp, [cta.id])!
    shiftTiming(g, 1)
    const before = { x: sub.x, y: sub.y, t: sub.intro!.start }
    reorderLayer(comp, sub.id, cta.id, 'before')
    const f = findDeep(comp.layers, sub.id)!
    expect(f.ancestors[0].id).toBe(g.id)
    expect(sub.x + g.x).toBeCloseTo(before.x)
    expect(sub.y + g.y).toBeCloseTo(before.y)
    expect(sub.intro!.start + g.start!).toBeCloseTo(before.t)
  })
})

describe('SVG-paden omzetten', () => {
  it('leest relatieve, H/V, S/T en Z-commando’s als absolute segmenten', async () => {
    const { parsePath, segsToD } = await import('../src/shared/svgpath')
    expect(segsToD(parsePath('m10 10h20v10h-20z'))).toBe('M10 10L30 10L30 20L10 20Z')
    const s = parsePath('M0 0C0 10 10 10 10 0s10-10 10 0')
    expect(s[2]).toEqual({ c: 'C', p: [10, -10, 20, -10, 20, 0] })
    const t = parsePath('M0 0Q5 10 10 0T20 0')
    expect(t[2]).toEqual({ c: 'Q', p: [15, -10, 20, 0] })
  })

  it('boog (ook met aan elkaar geschreven vlaggen) eindigt exact op het eindpunt', async () => {
    const { parsePath } = await import('../src/shared/svgpath')
    const a = parsePath('M0 0a10 10 0 0120 20')
    const last = a[a.length - 1]
    expect(last.c).toBe('C')
    if (last.c === 'C') expect([last.p[4], last.p[5]]).toEqual([20, 20])
    // halve cirkel van (0,0) naar (20,0) met straal 10 loopt tot y = -10 (sweep 1 = met de klok mee, boven langs)
    const half = parsePath('M0 0A10 10 0 0 1 20 0')
    const ys = half.flatMap((s) => (s.c === 'C' ? [s.p[1], s.p[3], s.p[5]] : []))
    expect(Math.min(...ys)).toBeLessThan(-9)
  })

  it('transformatie, kader en basisvormen', async () => {
    const { parsePath, transformSegs, segsBounds, rectPath, ellipsePath, pointsPath } = await import('../src/shared/svgpath')
    const segs = transformSegs(parsePath(rectPath(0, 0, 10, 20)), { a: 2, b: 0, c: 0, d: 2, e: 5, f: 5 })
    expect(segsBounds(segs)).toEqual({ x: 5, y: 5, w: 20, h: 40 })
    expect(segsBounds(parsePath(ellipsePath(50, 50, 10, 5)))).toMatchObject({ x: 40, w: 20 })
    expect(pointsPath('0,0 10,0 5,8', true)).toBe('M0 0L10 0L5 8Z')
    expect(parsePath(rectPath(0, 0, 40, 20, 5)).some((s) => s.c === 'C')).toBe(true)
  })
})

describe('schaal X/Y en gekoppelde eigenschappen', () => {
  it('ontkoppelde schaal: X en Y apart, ook in de runtime', async () => {
    const p = createStarterProject()
    const l = p.compositions[0].layers.find((x) => x.name === 'CTA')!
    l.intro = null
    l.scaleLinked = false
    l.scale = 1
    l.scaleY = 1
    l.tracks.scale = [
      { t: 0, v: 0.5, e: 'linear' },
      { t: 1, v: 1, e: 'linear' }
    ]
    l.tracks.scaleY = [
      { t: 0, v: 2, e: 'linear' },
      { t: 1, v: 1, e: 'linear' }
    ]
    expect(layerStateAt(l, 0.5)).toMatchObject({ scale: 0.75, scaleY: 1.5 })
    const dom = new JSDOM(build(p, 'preview').html, { runScripts: 'dangerously', pretendToBeVisual: true })
    await new Promise((r) => dom.window.addEventListener('load', () => setTimeout(r, 20)))
    const win = dom.window as unknown as { BS: { seek(t: number): void }; document: Document }
    win.BS.seek(0.5)
    const transforms = [...win.document.querySelectorAll<HTMLElement>('.L')].map((e) => e.style.transform)
    expect(transforms.some((t) => /scale\(0\.75, ?1\.5\)/.test(t))).toBe(true)
  })
  it('gekoppelde schaal: Y volgt X', () => {
    const l = createLayer('shape', { width: 300, height: 600 })
    l.tracks.scale = [
      { t: 0, v: 0, e: 'linear' },
      { t: 1, v: 1, e: 'linear' }
    ]
    expect(layerStateAt(l, 0.5)).toMatchObject({ scale: 0.5, scaleY: 0.5 })
  })
})

describe('anchor bij ongelijke schaal', () => {
  it('blijft op dezelfde plek', async () => {
    const { moveAnchor, layerCorners } = await import('../src/shared/geometry')
    const l = createLayer('shape', { width: 300, height: 600 })
    Object.assign(l, { x: 10, y: 20, width: 80, height: 50, rotation: 20 })
    const before = layerCorners(l.x, l.y, l.width, l.height, 0.5, 0.5, 2, 20, 0.5).corners
    moveAnchor(l, 1, 0, 2, 20, 0.5)
    const after = layerCorners(l.x, l.y, l.width, l.height, 1, 0, 2, 20, 0.5).corners
    after.forEach((c, i) => {
      expect(c[0]).toBeCloseTo(before[i][0], 1)
      expect(c[1]).toBeCloseTo(before[i][1], 1)
    })
  })
})

describe('werkruimte-indeling (dock)', () => {
  it('standaard: tijdlijn alleen onder het canvas', async () => {
    const m = await import('../src/renderer/src/dock/model')
    const root = m.defaultLayout()
    expect(root.kind).toBe('split')
    const mid = (root as m.SplitNode).children[1] as m.SplitNode
    expect(mid.dir).toBe('col')
    expect(m.visiblePanels(mid)).toEqual(['viewer', 'code', 'timeline'])
  })
  it('paneel als tab naar een andere groep, en naast/onder een groep', async () => {
    const m = await import('../src/renderer/src/dock/model')
    let root = m.defaultLayout()
    const designGroup = m.findTabsWith(root, 'design')!
    root = m.dropPanel(root, 'library', designGroup.id, 'center')
    expect(m.findTabsWith(root, 'library')!.panels).toEqual(['design', 'motion', 'ai', 'library'])
    // assets bleef alleen over in de linker groep
    expect(m.findTabsWith(root, 'assets')!.panels).toEqual(['assets'])
    const tl = m.findTabsWith(root, 'timeline')!
    root = m.dropPanel(root, 'assets', tl.id, 'right')
    const parent = (n: m.DockNode): m.SplitNode | null => {
      if (n.kind === 'tabs') return null
      if (n.children.some((c) => c.kind === 'tabs' && c.panels.includes('timeline'))) return n
      for (const c of n.children) {
        const p = parent(c)
        if (p) return p
      }
      return null
    }
    const p = parent(root)!
    expect(p.dir).toBe('row')
    expect(m.visiblePanels(p)).toEqual(['timeline', 'assets'])
    expect(m.visiblePanels(root).sort()).toEqual([...m.ALL_PANELS].sort())
  })
  it('sluiten en weer openen; ongeldige opslag wordt geweigerd', async () => {
    const m = await import('../src/renderer/src/dock/model')
    let root = m.removePanel(m.defaultLayout(), 'ai')
    expect(m.visiblePanels(root)).not.toContain('ai')
    root = m.showPanel(root, 'ai')
    expect(m.findTabsWith(root, 'ai')!.panels).toContain('design')
    // alle panelen van een groep sluiten ruimt de groep op
    root = m.removePanel(m.removePanel(root, 'library'), 'assets')
    expect(root.kind === 'split' && root.children.length).toBe(2)
    expect(m.validLayout({ kind: 'tabs', id: 'x', panels: ['viewer', 'viewer'], active: 'viewer' })).toBeNull()
    expect(m.validLayout(root)).not.toBeNull()
  })
})

describe('codeweergave', () => {
  it('kleurt HTML in één doorgang, zonder geneste of kapotte markup', async () => {
    const { highlight } = await import('../src/renderer/src/lib/codeformat')
    const out = highlight('<meta charset="utf-8">\n<a href="x">tekst & meer</a>')
    expect(out).toContain('&lt;<span class="c-tag">meta</span> <span class="c-attr">charset</span>=<span class="c-str">"utf-8"</span>&gt;')
    expect(out).toContain('tekst &amp; meer')
    expect(out).not.toMatch(/"c-attr">class/)
    // Weer naar platte tekst: identiek aan de invoer
    const plain = out.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    expect(plain).toBe('<meta charset="utf-8">\n<a href="x">tekst & meer</a>')
  })
  it('kleurt CSS-eigenschappen en selectors', async () => {
    const { highlight } = await import('../src/renderer/src/lib/codeformat')
    expect(highlight('  width:300px;')).toBe('  <span class="c-prop">width</span>:300px;')
    expect(highlight('  html,body {')).toBe('  <span class="c-sel">html,body</span> {')
  })
})

describe('uitlijnen en verdelen', () => {
  it('lijnt uit op de selectie en op de banner, in hele pixels', async () => {
    const { alignDeltas, unionBox } = await import('../src/shared/align')
    const boxes = [
      { x: 10, y: 10, w: 50, h: 20 },
      { x: 100, y: 40, w: 31, h: 31 }
    ]
    expect(alignDeltas(boxes, 'left', unionBox(boxes))).toEqual([{ dx: 0, dy: 0 }, { dx: -90, dy: 0 }])
    expect(alignDeltas(boxes, 'bottom', unionBox(boxes))).toEqual([{ dx: 0, dy: 41 }, { dx: 0, dy: 0 }])
    const banner = { x: 0, y: 0, w: 300, h: 600 }
    const c = alignDeltas(boxes, 'hcenter', banner)
    expect(c.every((d) => Number.isInteger(d.dx))).toBe(true)
    expect(boxes[1].x + c[1].dx).toBe(135) // (300-31)/2 = 134,5 → hele pixel
  })
  it('verdeelt met gelijke tussenruimte; buitenste blijven staan', async () => {
    const { distributeDeltas } = await import('../src/shared/align')
    const boxes = [
      { x: 0, y: 0, w: 20, h: 10 },
      { x: 200, y: 0, w: 20, h: 10 },
      { x: 30, y: 0, w: 40, h: 10 }
    ]
    const d = distributeDeltas(boxes, 'h')
    expect(d[0].dx).toBe(0)
    expect(d[1].dx).toBe(0)
    expect(boxes[2].x + d[2].dx).toBe(90) // ruimte (220-80)/2 = 70 → 20+70
    const banner = distributeDeltas([{ x: 5, y: 0, w: 100, h: 10 }], 'h', { x: 0, y: 0, w: 300, h: 600 })
    expect(banner[0].dx).toBe(95) // gecentreerd: (300-100)/2
  })
})

describe('hele pixels', () => {
  it('rondt posities, maten, rotatie en keyframes af; schaal en dekking op hele procenten', async () => {
    const { snapProject } = await import('../src/shared/pixels')
    const p = createStarterProject('Pixels')
    const l = p.compositions[0].layers[0]
    Object.assign(l, { x: 10.4, y: 20.6, width: 99.5, height: 0.2, rotation: 12.7, scale: 1.2345, opacity: 0.505 })
    l.tracks.x = [{ t: 0, v: 3.3, e: 'linear' }, { t: 1, v: 7.8, e: 'linear' }]
    l.tracks.scale = [{ t: 0, v: 0.333, e: 'linear' }]
    snapProject(p)
    expect([l.x, l.y, l.width, l.height, l.rotation]).toEqual([10, 21, 100, 1, 13])
    expect(l.scale).toBe(1.23)
    expect(l.opacity).toBe(0.51)
    expect(l.tracks.x.map((k) => k.v)).toEqual([3, 8])
    expect(l.tracks.scale[0].v).toBe(0.33)
  })
})

describe('klikgebieden', () => {
  const setup = () => {
    const p = createStarterProject('Klik')
    p.clickTag = 'https://www.makro.nl'
    const layers = p.compositions[0].layers
    layers[0].exit = { url: 'https://www.makro.nl/actie' }
    layers[1].exit = { url: '' } // leeg = zelfde als algemeen
    return p
  }
  const run = (html: string, extra?: (w: Window & Record<string, unknown>) => void) => {
    const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://ads.example/index.html' })
    const w = dom.window as unknown as Window & Record<string, unknown>
    const opened: string[] = []
    w.open = ((u: string) => void opened.push(u)) as never
    extra?.(w)
    return { w, opened, doc: w.document }
  }

  it('standaard: één klikveld, geen klikgebieden', () => {
    const { html } = build(createStarterProject('x'))
    expect(html).not.toContain('clickTag1')
    expect(html).not.toContain('.X{')
  })

  it('CM360: clickTag1, clickTag2 boven de algemene klik', () => {
    const p = setup()
    const { html } = build(p)
    expect(html).toContain('var clickTag1 = "https://www.makro.nl/actie";')
    expect(html).toContain('var clickTag2 = "https://www.makro.nl";')
    expect(html).toContain('.L{pointer-events:none}.X{pointer-events:auto;cursor:pointer}')
    const { opened, doc } = run(html)
    const exits = doc.querySelectorAll('.X')
    expect(exits.length).toBe(2)
    ;(exits[exits.length - 1] as HTMLElement).click() // bovenste laag staat als laatste in de HTML
    expect(opened).toEqual(['https://www.makro.nl/actie'])
    const issues = validateBanner({ target: 'cm360', comp: p.compositions[0], html, files: [{ name: 'index.html', bytes: 1 }], zipBytes: 1000, politeLoad: true } as never)
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
  })

  it('ad-server-URL per klikgebied via de querystring', () => {
    const { html } = build(setup())
    const dom = new JSDOM(html, { runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://x.nl/i.html?clickTag=https%3A%2F%2Fa.nl&clickTag1=https%3A%2F%2Fb.nl' })
    const w = dom.window as unknown as Record<string, string>
    expect([w.clickTag, w.clickTag1, w.clickTag2]).toEqual(['https://a.nl', 'https://b.nl', 'https://www.makro.nl'])
  })

  it('Adform: manifest.json, Adform.DHTML.js en dhtml.getVar', () => {
    const p = setup()
    const out = buildBanner(p, p.compositions[0], { mode: 'export', target: 'adform', assetUrl: (x) => x, fontSrc: {} })
    const manifest = JSON.parse(out.extraFiles['manifest.json'])
    expect(manifest.clicktags).toEqual({ clickTAG: 'https://www.makro.nl', clickTAG1: 'https://www.makro.nl/actie', clickTAG2: 'https://www.makro.nl' })
    expect(manifest.width).toBe('300')
    expect(out.html).toContain(`Adform.DHTML.js?bv='+Math.random())+'"><\\/script>')`)
    expect(out.html).not.toContain('var clickTag')
    const { opened, doc } = run(out.html.replace(/<script>document\.write[^]*?<\/script>/, ''), (w) => {
      w.dhtml = { getVar: (n: string, f: string) => (n === 'landingPageTarget' ? '_blank' : `adform:${n}:${f}`) }
    })
    ;(doc.getElementById('ad') as HTMLElement).click()
    const exits = doc.querySelectorAll('.X')
    ;(exits[exits.length - 1] as HTMLElement).click()
    expect(opened).toEqual(['adform:clickTAG:https://www.makro.nl', 'adform:clickTAG1:https://www.makro.nl/actie'])
    const issues = validateBanner({ target: 'adform', comp: p.compositions[0], html: out.html, files: [{ name: 'index.html', bytes: 1 }, { name: 'manifest.json', bytes: 1 }], zipBytes: 1000, politeLoad: true } as never)
    expect(issues.filter((i) => i.level === 'error')).toEqual([])
  })
})

describe('fonts en Azerion', () => {
  it('eigen fonts standaard als Base64; verplicht voor Google Ads en Azerion', async () => {
    const { fontsInline } = await import('../src/shared/specs')
    expect(fontsInline('cm360', {})).toBe(true)
    expect(fontsInline('cm360', { embedFonts: true })).toBe(true)
    expect(fontsInline('cm360', { embedFonts: false })).toBe(false)
    expect(fontsInline('azerion', { embedFonts: false })).toBe(true)
    expect(fontsInline('google-ads', { embedFonts: false })).toBe(true)
  })
  it('subset per formaat: alleen de letters van dat formaat', async () => {
    const { charsPerFont } = await import('../src/shared/build')
    const p = createStarterProject('Subset')
    const fid = 'font1'
    const base = p.compositions[0]
    const t = base.layers.find((l) => l.type === 'text')!
    t.text!.fontId = fid
    t.text!.content = 'Abba'
    const other = structuredClone(base)
    other.id = 'c2'
    other.layers.find((l) => l.type === 'text')!.text!.content = 'Zoef'
    p.compositions.push(other)
    expect([...charsPerFont(p, base)[fid]].sort().join('')).toBe('Aab')
    expect([...charsPerFont(p)[fid]].sort().join('')).toBe('AZabefo')
  })
  it('Azerion: max. 300 KB en geen losse fontbestanden', () => {
    const p = createStarterProject('Az')
    p.clickTag = 'https://www.makro.nl'
    const { html } = build(p)
    const comp = p.compositions[0]
    const ok = validateBanner({ target: 'azerion', comp, html, files: [{ name: 'index.html', bytes: 9000 }], zipBytes: 290 * 1024, politeLoad: true } as never)
    expect(ok.filter((i) => i.level === 'error')).toEqual([])
    const bad = validateBanner({ target: 'azerion', comp, html, files: [{ name: 'index.html', bytes: 9000 }, { name: 'f0.woff2', bytes: 9000 }], zipBytes: 310 * 1024, politeLoad: true } as never)
    expect(bad.filter((i) => i.level === 'error').map((i) => i.rule).sort()).toEqual(['bestandstype', 'gewicht'])
  })
})

describe('veiligheid', () => {
  it('SVG-import: geen scripts, event-handlers of externe links', async () => {
    const { sanitizeSvg } = await import('../src/renderer/src/lib/svgimport')
    const dom = new JSDOM('')
    const doc = new dom.window.DOMParser().parseFromString(
      `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" onload="alert(1)">
        <script>alert(2)</script>
        <defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs>
        <image href="x" onerror="alert(3)"/>
        <a xlink:href="javascript:alert(4)"><rect width="10" height="10" fill="url(#g)"/></a>
        <use href="#g"/><foreignObject><div onclick="x"/></foreignObject>
      </svg>`,
      'image/svg+xml'
    )
    sanitizeSvg(doc as unknown as Document)
    const out = doc.documentElement.outerHTML
    expect(out).not.toMatch(/onload|onerror|onclick|<script|javascript:|foreignObject|href="x"/i)
    expect(out).toContain('fill="url(#g)"')
    expect(out).toContain('href="#g"')
  })

  it('export: velden uit een projectbestand kunnen de HTML niet openbreken', () => {
    const p = createStarterProject('<script>alert(1)</script>')
    p.clickTag = 'https://x.nl/"</script><script>alert(2)</script>'
    const ls = p.compositions[0].layers
    const t = ls.find((l) => l.type === 'text')!
    Object.assign(t.text!, { align: 'left"><img src=x onerror=alert(3)>', weight: '700;}</style><script>alert(4)</script>', content: '</div><script>alert(5)</script>' })
    t.name = '<img src=x onerror=alert(6)>'
    const img = createLayer('image', p.compositions[0])
    img.image!.src = 'assets/a.png'
    img.image!.fit = 'contain;"><script>alert(7)</script>' as never
    ls.push(img)
    const s = createLayer('shape', p.compositions[0])
    s.shape!.fill = 'red;}</style><script>alert(8)</script>'
    ls.push(s)
    const { html } = build(p)
    const dom = new JSDOM(html)
    expect(dom.window.document.querySelectorAll('script').length).toBe(2) // clickTag + runtime
    expect(dom.window.document.querySelectorAll('img[onerror], [onerror]').length).toBe(0)
    expect(html).not.toMatch(/<script>alert/)
  })
})

describe('paden binnen de projectmap', () => {
  it('weigert .., absolute paden en symlinks naar buiten', async () => {
    const { inside, safeName } = await import('../src/main/paths')
    const { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const root = mkdtempSync(join(tmpdir(), 'bs-'))
    const proj = join(root, 'project')
    mkdirSync(join(proj, 'assets'), { recursive: true })
    writeFileSync(join(root, 'geheim.txt'), 'x')
    writeFileSync(join(proj, 'assets', 'a.png'), 'x')
    symlinkSync(join(root, 'geheim.txt'), join(proj, 'assets', 'link.png'))
    expect(inside(proj, 'assets/a.png')).toBe(join(proj, 'assets', 'a.png'))
    expect(() => inside(proj, '../geheim.txt')).toThrow()
    expect(() => inside(proj, 'assets/../../geheim.txt')).toThrow()
    expect(() => inside(proj, join(root, 'geheim.txt'))).toThrow()
    expect(() => inside(proj, 'assets/link.png')).toThrow()
    expect(safeName('mijn-boilerplate-1')).toBe(true)
    expect(safeName('..')).toBe(false)
    expect(safeName('a/../b')).toBe(false)
    expect(safeName('a\\..\\b')).toBe(false)
  })
})

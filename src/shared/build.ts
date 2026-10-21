import { baseValue, easeIndex, round } from './anim'
import { effectiveLayer, endFrameTime } from './motion'
import { minifiedRuntime, WIPE_INDEX } from './runtime'
import { allLayers, walk } from './tree'
import { anchorOf } from './geometry'
import { cleanCodeHtml, scopeCodeCss } from './code'
import { BLEND_MODES, type AnimProp, type Composition, type ExportTarget, type FontAsset, type Gradient, type Layer, type LayerMask, type Project, type Shadow, type ShapeProps, type WriteOnDirection } from './types'

// Bouwt de banner-HTML uit een compositie. Wordt zowel door de editor (preview)
// als door de exporter gebruikt, zodat wat je ziet ook echt is wat je exporteert.

export interface BuildOptions {
  mode: 'preview' | 'export'
  target: ExportTarget
  /** Zet een projectpad (bijv. `assets/logo.png`) om naar de URL in de HTML. */
  assetUrl: (projectPath: string) => string
  /** CSS `src:` waarde per font-id. Ontbrekende fonts worden overgeslagen. */
  fontSrc: Record<string, string>
}

export interface BuildOutput {
  html: string
  /** Projectpaden van gebruikte afbeeldingen. */
  assets: string[]
  /** Font-ids die echt gebruikt worden. */
  fontIds: string[]
  /** Extra bestanden voor in de zip (bijv. manifest.json voor Adform). */
  extraFiles: Record<string, string>
}

const PROP_KEY: Record<AnimProp, string> = { x: 'x', y: 'y', scale: 's', scaleY: 'q', rotation: 'r', opacity: 'o', reveal: 'v' }

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Houd CSS-waarden veilig: geen tekens waarmee je uit een declaratie kunt breken. */
export const cssValue = (s: string): string =>
  String(s ?? '')
    .replace(/[<>{};"\\]/g, '')
    // Kleuren en verlopen hebben nooit een url() of image-set() nodig: geen externe bestanden of tracking
    .replace(/url\s*\(|image-set\s*\(|[a-z][a-z0-9+.-]*:\/\//gi, '')

const n4 = (v: number): string => String(Number.isFinite(v) ? Math.round(v * 10000) / 10000 : 1)
const n = (v: number): string => {
  const r = round(Number(v), 2)
  return String(Number.isFinite(r) ? r : 0)
}
/** Alleen bekende waarden uit het projectbestand in CSS/HTML; al het andere wordt de standaard. */
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)
const weightOf = (w: unknown) => {
  const v = Math.round(Number(w) / 100) * 100
  return Number.isFinite(v) && v >= 100 && v <= 900 ? v : 400
}

export function usedFontIds(comp: Composition): string[] {
  const ids = new Set<string>()
  const visit = (list: Layer[]) => {
    for (const l of list) {
      if (!l.visible) continue
      if (l.type === 'text' && l.text?.fontId) ids.add(l.text.fontId)
      if (l.children) visit(l.children)
    }
  }
  visit(comp.layers)
  return [...ids]
}

export const TEXT_CASE = { upper: 'uppercase', lower: 'lowercase', title: 'capitalize' } as const

/** Alle tekens per font (voor subsetting). */
export function charsPerFont(project: Project, only?: Composition): Record<string, string> {
  const out: Record<string, Set<string>> = {}
  for (const c of only ? [only] : project.compositions)
    for (const l of allLayers(c.layers))
      if (l.type === 'text' && l.text?.fontId) {
        const set = (out[l.text.fontId] ??= new Set())
        // Met hoofdletters/kleine letters toont de browser andere tekens dan getypt: die moeten ook in het font
        const text = l.text.case ? l.text.content + l.text.content.toUpperCase() + l.text.content.toLowerCase() : l.text.content
        for (const ch of text) set.add(ch)
      }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].join('')]))
}

function isAnimated(l: Layer): boolean {
  return Object.values(l.tracks).some((k) => k && k.length > 0) || l.type === 'writeon' || l.revealMode !== 'none'
}

function staticTransform(l: Layer): string {
  const sy = l.scaleLinked === false ? (l.scaleY ?? l.scale) : l.scale
  // Alleen wat afwijkt van de standaard: kortere CSS, hetzelfde resultaat
  const t: string[] = []
  if (l.x || l.y) t.push(`translate(${n(l.x)}px,${n(l.y)}px)`)
  if (l.rotation) t.push(`rotate(${n(l.rotation)}deg)`)
  if (l.scale !== 1 || sy !== 1) t.push(l.scale === sy ? `scale(${n(l.scale)})` : `scale(${n(l.scale)},${n(sy)})`)
  const rules = t.length ? [`transform:${t.join(' ')}`] : []
  if (l.opacity !== 1) rules.push(`opacity:${n(l.opacity)}`)
  return rules.join(';')
}

/** CSS font-family: meegeleverd font (f0, f1…), systeemfont op naam, altijd met fallback. */
function fontStack(fonts: FontAsset[], id: string | null): string {
  const i = fonts.findIndex((f) => f.id === id)
  const f = fonts[i]
  if (!f) return 'Arial,Helvetica,sans-serif'
  if (f.system) return `"${cssValue(f.family)}",Arial,Helvetica,sans-serif`
  return `f${i},Arial,Helvetica,sans-serif`
}

export function buildBanner(project: Project, comp: Composition, opts: BuildOptions): BuildOutput {
  // Altijd hele getallen (het projectbestand komt niet per se uit deze app)
  const W = Math.max(1, Math.min(10000, Math.round(Number(comp.width)) || 1))
  const H = Math.max(1, Math.min(10000, Math.round(Number(comp.height)) || 1))
  const css: string[] = []
  const body: string[] = []
  const assets: string[] = []
  const fontIds = usedFontIds(comp)
  // Klikgebieden: genummerd van boven naar onder in de lagenlijst (clickTag1, clickTag2 …)
  const click = clickSetup(project, comp, opts)

  project.fonts.forEach((f, i) => {
    if (f.system || !fontIds.includes(f.id) || !opts.fontSrc[f.id]) return
    css.push(
      `@font-face{font-family:f${i};src:${opts.fontSrc[f.id]};font-weight:${weightOf(f.weight)};font-style:${oneOf(f.style, ['normal', 'italic'] as const, 'normal')};font-display:block}`
    )
  })

  css.push(
    '*{margin:0;padding:0;box-sizing:border-box}',
    `html,body{width:${W}px;height:${H}px;overflow:hidden}`,
    // isolation: overvloeimodi mengen alleen binnen de banner, nooit met de pagina eromheen
    `#ad{position:relative;display:block;width:${W}px;height:${H}px;overflow:hidden;isolation:isolate;background:${cssValue(comp.background)};cursor:pointer;text-decoration:none}`,
    '.L{position:absolute;left:0;top:0;transform-origin:50% 50%;visibility:hidden}',
    '.r .L{visibility:visible}'
  )
  if (click.exitOf.size) css.push('.L{pointer-events:none}.X{pointer-events:auto;cursor:pointer}')

  const polite = opts.mode === 'export' && project.politeLoad
  let counter = 0
  let usesMask = false

  /** Bouwt een lijst lagen (recursief voor groepen). `offset` = absolute starttijd van de lijst. */
  const emit = (list: Layer[], offset: number): string => {
    const out: string[] = []
    // Index 0 is de bovenste laag; in HTML komt de onderste eerst.
    for (const raw of [...list].reverse()) {
      if (!raw.visible) continue
      const l = effectiveLayer(raw)
      const id = `a${counter++}`
      const hasRange = (l.start ?? 0) > 0 || l.end != null
      const animated = isAnimated(l) || hasRange
      const rules: string[] = [`width:${n(l.width)}px`, `height:${n(l.height)}px`]
      const { ax, ay } = anchorOf(l)
      if (ax !== 0.5 || ay !== 0.5) rules.push(`transform-origin:${n(ax * 100)}% ${n(ay * 100)}%`)
      if (!isAnimated(l) && staticTransform(l)) rules.push(staticTransform(l))
      let inner = ''

      switch (l.type) {
        case 'text': {
          const t = l.text!
          rules.push(
            `font-family:${fontStack(project.fonts, t.fontId)}`,
            `font-size:${n(t.size)}px`,
            `font-weight:${weightOf(t.weight)}`,
            `color:${cssValue(t.color)}`,
            `text-align:${oneOf(t.align, ['left', 'center', 'right'] as const, 'left')}`,
            t.leading != null && Number.isFinite(Number(t.leading)) ? `line-height:${n(Number(t.leading))}px` : `line-height:${n(t.lineHeight)}`,
            t.tracking != null && Number.isFinite(Number(t.tracking)) ? `letter-spacing:${n(Number(t.tracking) / 1000)}em` : `letter-spacing:${n(t.letterSpacing)}px`,
            'white-space:pre-wrap'
          )
          if (t.case === 'upper' || t.case === 'lower' || t.case === 'title') rules.push(`text-transform:${TEXT_CASE[t.case]}`)
          // Lijn rond de letters: dubbel zo dik met de vulling erboven, zodat de lijn alleen buiten de letter valt
          if (t.stroke && Number(t.stroke.width) > 0) rules.push(`-webkit-text-stroke:${n(Number(t.stroke.width) * 2)}px ${cssValue(t.stroke.color)}`, 'paint-order:stroke fill')
          inner = escapeHtml(t.content)
          break
        }
        case 'image': {
          const img = l.image!
          if (img.src) {
            assets.push(img.src)
            inner = `<img ${polite ? 'data-src' : 'src'}="${escapeHtml(opts.assetUrl(img.src))}" alt="" style="width:100%;height:100%;object-fit:${oneOf(img.fit, ['contain', 'cover', 'fill'] as const, 'contain')};display:block">`
          }
          break
        }
        case 'shape': {
          const sh = l.shape!
          const fill = sh.fillEnabled === false ? 'none' : cssValue(sh.fill)
          const sw = Number(sh.strokeWidth) > 0 ? Number(sh.strokeWidth) : 0
          const svgStroke = (nonScaling: boolean) => strokeAttrs(sh, sw, l.revealMode === 'draw', nonScaling)
          if (sh.kind === 'path' && sh.path) {
            // Vrije vorm: SVG die meeschaalt met de laag; lijndikte blijft gelijk.
            const stroke = sw > 0 ? svgStroke(true) : ''
            const grad = sh.gradient && fill !== 'none' && sh.path.closed ? svgGradient(`${id}g`, sh.fill, sh.gradient) : ''
            const pathFill = sh.path.closed ? (grad ? `url(#${id}g)` : fill) : 'none'
            inner = `<svg viewBox="0 0 ${n(sh.path.w)} ${n(sh.path.h)}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;display:block">${grad}<path d="${escapeHtml(sh.path.d)}" fill="${pathFill}"${sh.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : ''}${stroke}/></svg>`
          } else {
            // Rechthoek / ellips: gewone CSS (lichtst).
            if (fill !== 'none') rules.push(`background:${sh.gradient ? gradientCss(sh.fill, sh.gradient, sh.kind === 'ellipse') : fill}`)
            rules.push(`border-radius:${sh.kind === 'ellipse' ? '50%' : `${n(sh.radius)}px`}`)
            const plain = (sh.strokeAlign ?? 'inside') === 'inside' && !sh.strokeDash && l.revealMode !== 'draw'
            if (sw > 0 && plain) rules.push(`border:${n(sw)}px solid ${cssValue(sh.strokeColor)}`)
            else if (sw > 0) {
              // Lijn op de rand of buiten, stippellijn of tekenen: als SVG over de vorm
              const o = sh.strokeAlign === 'center' ? 0 : sh.strokeAlign === 'outside' ? -sw / 2 : sw / 2
              const W = l.width
              const H = l.height
              const shape =
                sh.kind === 'ellipse'
                  ? `<ellipse cx="${n(W / 2)}" cy="${n(H / 2)}" rx="${n(Math.max(0, W / 2 - o))}" ry="${n(Math.max(0, H / 2 - o))}"`
                  : `<rect x="${n(o)}" y="${n(o)}" width="${n(Math.max(0, W - 2 * o))}" height="${n(Math.max(0, H - 2 * o))}" rx="${n(Math.max(0, Math.min(Number(sh.radius) || 0, W / 2, H / 2) - o))}"`
              inner = `<svg width="100%" height="100%" style="position:absolute;left:0;top:0;overflow:visible">${shape} fill="none"${svgStroke(false)}/></svg>`
            }
          }
          break
        }
        case 'writeon': {
          const w = l.writeon!
          // Volgorde van de letters = volgorde van schrijven (de runtime tekent pad na pad)
          const paths = orderGlyphs(w.glyphs, w.direction)
            .map((g) => `<path pathLength="1" d="${escapeHtml(g.d)}"/>`)
            .join('')
          const vb = w.viewBox.map(n).join(' ')
          inner = `<svg viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" fill="${cssValue(w.color)}" stroke="${cssValue(w.color)}" stroke-width="${n(w.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 1" style="overflow:visible">${paths}</svg>`
          break
        }
        case 'code': {
          // Code-element: eigen HTML/SVG + CSS-animatie, afgeschermd per laag en meeschalend met de laag.
          // De runtime zet de CSS-animaties op de tijd van de tijdlijn (vanaf het in-punt).
          const c = l.code!
          const cw = Math.max(1, Number(c.w) || l.width)
          const ch = Math.max(1, Number(c.h) || l.height)
          css.push(
            `#${id}>.K{position:absolute;left:0;top:0;width:${n(cw)}px;height:${n(ch)}px;transform:scale(${n4(l.width / cw)},${n4(l.height / ch)});transform-origin:0 0}`,
            scopeCodeCss(c.css ?? '', `#${id}>.K`, id)
          )
          inner = `<div class="K">${cleanCodeHtml(c.html ?? '')}</div>`
          codeEntries.push([id, round(offset + (l.start ?? 0))])
          break
        }
        case 'group':
          // Inhoud van de groep: posities relatief aan de groep, tijd vanaf het in-punt.
          inner = emit(l.children ?? [], offset + (l.start ?? 0))
          break
      }

      // Masker: een binnenste laag die bijsnijdt (de laag zelf gebruikt clip-path al voor wipes)
      if (l.mask && l.type !== 'text') {
        const m = maskCss(l.mask)
        if (m) {
          inner = `<div class="M">${inner}</div>`
          css.push(`#${id}>.M{${m}}`)
          usesMask = true
        }
      }
      if (l.blend && l.blend !== 'normal' && BLEND_MODES.includes(l.blend)) rules.push(`mix-blend-mode:${l.blend}`)
      const shadow = shadowFilter(l.shadows)
      if (shadow) rules.push(`filter:${shadow}`)
      if (l.cta) css.push(`#ad:hover #${id}{filter:${shadow ? shadow + ' ' : ''}brightness(1.12)}`, `#${id}{transition:filter .2s}`)
      css.push(`#${id}{${rules.join(';')}}`)
      const exitNo = click.exitOf.get(raw.id)
      // Tekst: passend maken (data-fit); in de editor-preview de laag-id voor de "past niet"-melding (data-t)
      const textAttrs = l.type === 'text' ? `${l.text?.fit ? ' data-fit' : ''}${opts.mode === 'preview' ? ` data-t="${escapeHtml(raw.id)}"` : ''}` : ''
      out.push(exitNo ? `<div id="${id}" class="L X"${textAttrs}${click.exitAttr(exitNo)}>${inner}</div>` : `<div id="${id}" class="L"${textAttrs}>${inner}</div>`)

      if (animated) {
        const b: Record<string, number> = {}
        const p: Record<string, number[][]> = {}
        for (const prop of Object.keys(PROP_KEY) as AnimProp[]) {
          // Gekoppelde schaal: alleen `s`, de runtime gebruikt die voor beide richtingen
          if (prop === 'scaleY' && l.scaleLinked !== false) continue
          b[PROP_KEY[prop]] = round(baseValue(l, prop))
          const kfs = l.tracks[prop]
          if (kfs && kfs.length) p[PROP_KEY[prop]] = kfs.map((k) => [round(k.t + offset), round(k.v), easeIndex(k.e)])
        }
        const entry: Record<string, unknown> = { i: id, b, p }
        if (l.type === 'writeon') {
          entry.g = 1
          entry.f = round(l.writeon!.fillAfter, 2)
        } else if (l.revealMode !== 'none') {
          entry.w = WIPE_INDEX[l.revealMode]
        }
        if (hasRange) entry.r = [round(offset + (l.start ?? 0)), l.end == null ? 1e9 : round(offset + l.end)]
        animatedEntries.push(entry)
      }
    }
    return out.join('')
  }
  const animatedEntries: unknown[] = []
  const codeEntries: [string, number][] = []
  body.push(emit(comp.layers, 0))
  if (usesMask) css.push('.M{position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden}')

  if (comp.border && comp.border.width > 0) {
    css.push(
      `#bd{position:absolute;left:0;top:0;width:${W}px;height:${H}px;border:${n(comp.border.width)}px solid ${cssValue(comp.border.color)};pointer-events:none}`
    )
    body.push('<div id="bd"></div>')
  }

  const data = {
    w: W,
    h: H,
    d: round(comp.duration),
    l: Math.max(1, Math.round(comp.loops)),
    e: endFrameTime(comp),
    a: opts.mode === 'export' ? 1 : 0,
    L: animatedEntries,
    ...(codeEntries.length ? { C: codeEntries } : {})
  }

  const html =
    `${CREDIT}\n` +
    '<!DOCTYPE html>' +
    '<html lang="nl"><head><meta charset="utf-8">' +
    `<meta name="ad.size" content="width=${W},height=${H}">` +
    `<title>${escapeHtml(project.name)} ${W}x${H}</title>` +
    click.head +
    `<style>${css.join('')}</style>` +
    '</head><body>' +
    click.anchor +
    body.join('') +
    '</a>' +
    `<script>${minifiedRuntime()}${JSON.stringify(data)});</script>` +
    '</body></html>'

  return { html, assets: [...new Set(assets)], fontIds, extraFiles: click.files }
}

/** Midden en hoogte van een glyph-pad (uit de coördinaten in het pad; goed genoeg om op te sorteren). */
function glyphCenter(d: string): { x: number; y: number; h: number } {
  const n = (d.match(/-?\d*\.?\d+(?:e-?\d+)?/gi) ?? []).map(Number)
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i])
    x1 = Math.max(x1, n[i])
    y0 = Math.min(y0, n[i + 1])
    y1 = Math.max(y1, n[i + 1])
  }
  return Number.isFinite(x0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2, h: y1 - y0 } : { x: 0, y: 0, h: 0 }
}

/**
 * Glyphs in de volgorde waarin ze geschreven worden. Van links: zoals getypt. Van rechts: elke regel
 * van rechts naar links. Van boven / van onder: regel voor regel (boven → onder of onder → boven),
 * binnen een regel van links naar rechts.
 */
export function orderGlyphs<T extends { d: string }>(glyphs: T[], direction?: WriteOnDirection): T[] {
  if (!direction || direction === 'left' || glyphs.length < 2) return glyphs
  const c = glyphs.map((g, i) => ({ g, i, ...glyphCenter(g.d) }))
  // Regels herkennen: glyphs waarvan het midden minder dan een halve letterhoogte verschilt, staan op dezelfde regel
  const hs = c.map((x) => x.h).sort((a, b) => a - b)
  const tol = Math.max(1, hs[Math.floor(hs.length / 2)] * 0.5)
  const byY = [...c].sort((a, b) => a.y - b.y)
  const lines: (typeof c)[] = []
  for (const x of byY) {
    const line = lines[lines.length - 1]
    if (line && x.y - line[0].y < tol) line.push(x)
    else lines.push([x])
  }
  for (const line of lines) line.sort((a, b) => (direction === 'right' ? b.x - a.x : a.x - b.x) || a.i - b.i)
  if (direction === 'bottom') lines.reverse()
  return lines.flat().map((x) => x.g)
}

/** SVG-lijnattributen van een vorm: kleur, dikte, uiteinden, stippellijn of tekenen (`draw`, via pathLength). */
function strokeAttrs(sh: ShapeProps, sw: number, draw: boolean, nonScaling: boolean): string {
  const cap = sh.strokeCap === 'butt' ? 'butt' : 'round'
  let a = ` stroke="${cssValue(sh.strokeColor)}" stroke-width="${n(sw)}"${nonScaling ? ' vector-effect="non-scaling-stroke"' : ''} stroke-linejoin="${cap === 'round' ? 'round' : 'miter'}" stroke-linecap="${cap}"`
  if (draw) a += ' pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" data-d'
  else if (Array.isArray(sh.strokeDash) && sh.strokeDash.length === 2) a += ` stroke-dasharray="${n(Math.max(0, Number(sh.strokeDash[0]) || 0))} ${n(Math.max(0.5, Number(sh.strokeDash[1]) || 0))}"`
  return a
}

/** Klikgebieden in exportvolgorde: van boven naar onder in de lagenlijst (clickTag1, clickTag2 …). */
export function exitLayers(comp: Composition): Layer[] {
  const out: Layer[] = []
  walk(comp.layers, (l, anc) => {
    if (l.exit && l.visible && anc.every((a) => a.visible)) out.push(l)
  })
  return out
}

/** Schaduwen als CSS-filter: drop-shadow volgt de vorm (ook tekst, transparante afbeeldingen en groepen). */
/**
 * Schaduw in CSS-waarden. Met Photoshop-waarden (hoek, afstand, grootte, spreiden) gelijk aan de slagschaduw in PS:
 * de schaduw valt tegenover het licht (hoek 90° = licht van boven, schaduw naar beneden), grootte = vervaging,
 * spreiden maakt de rand harder (minder vervaging).
 */
export function shadowCss(s: Shadow): { x: number; y: number; blur: number } {
  if (s.size == null || !Number.isFinite(Number(s.size))) return { x: Number(s.x) || 0, y: Number(s.y) || 0, blur: Math.max(0, Number(s.blur) || 0) }
  const a = ((Number(s.angle) || 0) * Math.PI) / 180
  const d = Number(s.distance) || 0
  const spread = Math.min(100, Math.max(0, Number(s.spread) || 0)) / 100
  const r = (v: number) => Math.round(v * 100) / 100 || 0
  return { x: r(-Math.cos(a) * d), y: r(Math.sin(a) * d), blur: r(Math.max(0, Number(s.size)) * (1 - spread)) }
}

/** Photoshop-waarden bij een (oudere) schaduw met alleen x/y/vervaging. */
export function shadowPs(s: Shadow): { angle: number; distance: number; spread: number; size: number } {
  if (s.size != null) return { angle: s.angle ?? 90, distance: s.distance ?? 0, spread: s.spread ?? 0, size: s.size }
  const distance = Math.round(Math.hypot(s.x, s.y) * 10) / 10
  const angle = distance ? Math.round(((Math.atan2(s.y, -s.x) * 180) / Math.PI + 360) % 360) : 90
  return { angle, distance, spread: 0, size: Math.max(0, s.blur) }
}

export function shadowFilter(shadows: Shadow[] | undefined): string {
  return (shadows ?? [])
    .filter((s) => s && Number(s.opacity) > 0)
    .map((s) => {
      const hex = /^#[0-9a-f]{6}$/i.test(s.color) ? s.color : '#000000'
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
      const a = Math.min(1, Math.max(0, Number(s.opacity) || 0))
      const c = shadowCss(s)
      return `drop-shadow(${n(c.x)}px ${n(c.y)}px ${n(c.blur)}px rgba(${r},${g},${b},${n(a)}))`
    })
    .join(' ')
}

const HEX = /^#[0-9a-f]{6}$/i
const clamp01 = (v: unknown) => Math.min(1, Math.max(0, Number(v) || 0))
/** #rrggbb + dekking → rgba(); ongeldige kleur wordt zwart. */
export function rgba(color: string, opacity: number): string {
  const hex = HEX.test(color) ? color : '#000000'
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${n(clamp01(opacity))})`
}

/** CSS-verloop voor een rechthoek of ellips (lineair met hoek, of radiaal vanuit het midden). */
export function gradientCss(from: string, g: Gradient, ellipse = false): string {
  const a = rgba(from, g.fromOpacity ?? 1)
  const b = rgba(g.to, g.toOpacity ?? 1)
  if (g.type === 'radial') return `radial-gradient(${ellipse ? 'closest-side' : 'farthest-corner'} at 50% 50%,${a},${b})`
  return `linear-gradient(${n(Number(g.angle) || 0)}deg,${a},${b})`
}

/** Hetzelfde verloop als SVG-definitie (voor pen-vormen); hoek zoals in CSS (0 = naar boven). */
export function svgGradient(id: string, from: string, g: Gradient): string {
  const hex = (c: string) => (HEX.test(c) ? c : '#000000')
  const stops = `<stop offset="0" stop-color="${hex(from)}" stop-opacity="${n(clamp01(g.fromOpacity ?? 1))}"/><stop offset="1" stop-color="${hex(g.to)}" stop-opacity="${n(clamp01(g.toOpacity ?? 1))}"/>`
  if (g.type === 'radial') return `<defs><radialGradient id="${id}" cx=".5" cy=".5" r=".5">${stops}</radialGradient></defs>`
  const r = ((Number(g.angle) || 0) * Math.PI) / 180
  const dx = Math.sin(r) / 2
  const dy = -Math.cos(r) / 2
  return `<defs><linearGradient id="${id}" x1="${n(0.5 - dx)}" y1="${n(0.5 - dy)}" x2="${n(0.5 + dx)}" y2="${n(0.5 + dy)}">${stops}</linearGradient></defs>`
}

/** Masker: overflow + border-radius, plus clip-path (zodat ook getransformeerde inhoud in Safari netjes wordt bijgesneden). */
export function maskCss(m: LayerMask): string {
  if (m.shape === 'ellipse') return 'border-radius:50%;clip-path:ellipse(50% 50% at 50% 50%)'
  if (m.shape === 'rect') {
    const r = Math.max(0, Number(m.radius) || 0)
    return r > 0 ? `border-radius:${n(r)}px;clip-path:inset(0 round ${n(r)}px)` : 'clip-path:inset(0)'
  }
  return ''
}

/** Bovenaan elke banner (ook in de codeweergave). Een commentaar vóór de doctype is geldig HTML5. */
export const CREDIT = '<!-- This banner was proudly created by Connect & Create -->'

const jsString = (v: string) => JSON.stringify(v).replace(/</g, '\\u003c')

/**
 * Klik-afhandeling per platform.
 *
 * - CM360, Google Ads, Ad Manager, generiek: `var clickTag = "…"` zoals Google het voorschrijft. De URL is
 *   de fallback; het ad-server overschrijft hem bij het uitserveren. Komt een klik-URL als `?clickTag=…`
 *   binnen (generieke ad-servers), dan wordt die gebruikt (alleen http/https).
 * - Adform: `dhtml.getVar('clickTAG', fallback)` met Adform.DHTML.js en een manifest.json.
 *
 * De hele banner is het algemene klikveld. Klikgebieden (lagen met `exit`) liggen daarboven: alleen zij
 * vangen klikken op, al het andere laat de klik door naar de banner.
 */
function clickSetup(project: Project, comp: Composition, opts: BuildOptions) {
  // Alleen http(s)-adressen; iets anders (bijv. javascript:) komt nooit in de banner
  const web = (u: unknown) => (typeof u === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(u.trim()) ? u.trim() : '')
  const fallback = web(project.clickTag) || 'https://www.example.com'
  const exits = exitLayers(comp)
  const exitOf = new Map(exits.map((l, i) => [l.id, i + 1]))
  const exitUrl = (n: number) => web(exits[n - 1].exit?.url) || fallback
  const preview = opts.mode !== 'export'

  if (opts.target === 'adform') {
    const names = ['clickTAG', ...exits.map((_, i) => `clickTAG${i + 1}`)]
    const urls = [fallback, ...exits.map((_, i) => exitUrl(i + 1))]
    const manifest = {
      version: '1.0',
      title: `${project.name} ${comp.width}x${comp.height}`,
      description: '',
      width: String(comp.width),
      height: String(comp.height),
      events: { enabled: 1, list: {} },
      clicktags: Object.fromEntries(names.map((n, i) => [n, urls[i]])),
      source: 'index.html'
    }
    const fn = (n: string, u: string) =>
      `window.open(window.dhtml?dhtml.getVar(${jsString(n)},${jsString(u)}):${jsString(u)},window.dhtml?dhtml.getVar('landingPageTarget','_blank'):'_blank')`
    return {
      exitOf,
      head: preview
        ? ''
        : `<script>document.write('<script src="'+(window.API_URL||'https://s1.adform.net/banners/scripts/rmb/Adform.DHTML.js?bv='+Math.random())+'"><\\/script>');</script>`,
      anchor: preview ? '<a id="ad" href="javascript:void(0)">' : `<a id="ad" href="javascript:void(0)" onclick="${escapeHtml(fn('clickTAG', fallback))};return false">`,
      exitAttr: (n: number) => (preview ? '' : ` onclick="event.stopPropagation();${escapeHtml(fn(`clickTAG${n}`, exitUrl(n)))};return false"`),
      files: { 'manifest.json': JSON.stringify(manifest, null, 2) } as Record<string, string>
    }
  }

  const names = ['clickTag', ...exits.map((_, i) => `clickTag${i + 1}`)]
  const vars = names.map((n, i) => `var ${n} = ${jsString(i ? exitUrl(i) : fallback)};`).join('')
  return {
    exitOf,
    head:
      `<script>${vars}` +
      `(function(){var q=location.search,n=${JSON.stringify(names)},i,m,u;for(i=0;i<n.length;i++)try{m=new RegExp('[?&]'+n[i]+'=([^&#]+)','i').exec(q);u=m&&decodeURIComponent(m[1]);if(u&&/^https?:/i.test(u))window[n[i]]=u}catch(e){}})();` +
      '</script>',
    anchor: preview ? '<a id="ad" href="javascript:void(0)">' : '<a id="ad" href="javascript:window.open(window.clickTag)">',
    exitAttr: (n: number) => (preview ? '' : ` onclick="event.preventDefault();event.stopPropagation();window.open(window.clickTag${n})"`),
    files: {} as Record<string, string>
  }
}

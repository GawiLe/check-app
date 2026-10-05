import { easeIndex, round } from './anim'
import { effectiveLayer, endFrameTime } from './motion'
import { minifiedRuntime, WIPE_INDEX } from './runtime'
import type { AnimProp, Composition, ExportTarget, FontAsset, Layer, Project } from './types'

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
}

const PROP_KEY: Record<AnimProp, string> = { x: 'x', y: 'y', scale: 's', rotation: 'r', opacity: 'o', reveal: 'v' }

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Houd CSS-waarden veilig: geen tekens waarmee je uit een declaratie kunt breken. */
export const cssValue = (s: string): string => s.replace(/[<>{};"\\]/g, '')

const n = (v: number): string => String(round(v, 2))

export function usedFontIds(comp: Composition): string[] {
  const ids = new Set<string>()
  for (const l of comp.layers) {
    if (!l.visible) continue
    if (l.type === 'text' && l.text?.fontId) ids.add(l.text.fontId)
  }
  return [...ids]
}

/** Alle tekens per font (voor subsetting). */
export function charsPerFont(project: Project): Record<string, string> {
  const out: Record<string, Set<string>> = {}
  for (const c of project.compositions)
    for (const l of c.layers)
      if (l.type === 'text' && l.text?.fontId) {
        const set = (out[l.text.fontId] ??= new Set())
        for (const ch of l.text.content) set.add(ch)
      }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].join('')]))
}

function isAnimated(l: Layer): boolean {
  return Object.values(l.tracks).some((k) => k && k.length > 0) || l.type === 'writeon' || l.revealMode !== 'none'
}

function staticTransform(l: Layer): string {
  return `transform:translate(${n(l.x)}px,${n(l.y)}px) rotate(${n(l.rotation)}deg) scale(${n(l.scale)});opacity:${n(l.opacity)}`
}

function fontFamilyName(fonts: FontAsset[], id: string | null): string | null {
  const i = fonts.findIndex((f) => f.id === id)
  return i < 0 ? null : `f${i}`
}

export function buildBanner(project: Project, comp: Composition, opts: BuildOptions): BuildOutput {
  const { width: W, height: H } = comp
  const css: string[] = []
  const body: string[] = []
  const assets: string[] = []
  const animated: unknown[] = []
  const fontIds = usedFontIds(comp)

  project.fonts.forEach((f, i) => {
    if (!fontIds.includes(f.id) || !opts.fontSrc[f.id]) return
    css.push(
      `@font-face{font-family:f${i};src:${opts.fontSrc[f.id]};font-weight:${f.weight};font-style:${f.style};font-display:block}`
    )
  })

  css.push(
    '*{margin:0;padding:0;box-sizing:border-box}',
    `html,body{width:${W}px;height:${H}px;overflow:hidden}`,
    `#ad{position:relative;display:block;width:${W}px;height:${H}px;overflow:hidden;background:${cssValue(comp.background)};cursor:pointer;text-decoration:none}`,
    '.L{position:absolute;left:0;top:0;transform-origin:50% 50%;visibility:hidden}',
    '.r .L{visibility:visible}'
  )

  const polite = opts.mode === 'export' && project.politeLoad
  const layers = comp.layers.filter((l) => l.visible).map(effectiveLayer)
  // Index 0 is de bovenste laag; in HTML komt de onderste eerst.
  ;[...layers].reverse().forEach((l, idx) => {
    const id = `a${idx}`
    const rules: string[] = [`width:${n(l.width)}px`, `height:${n(l.height)}px`]
    if (!isAnimated(l)) rules.push(staticTransform(l))
    let inner = ''

    switch (l.type) {
      case 'text': {
        const t = l.text!
        const fam = fontFamilyName(project.fonts, t.fontId)
        rules.push(
          `font-family:${fam ? fam + ',' : ''}Arial,Helvetica,sans-serif`,
          `font-size:${n(t.size)}px`,
          `font-weight:${t.weight}`,
          `color:${cssValue(t.color)}`,
          `text-align:${t.align}`,
          `line-height:${n(t.lineHeight)}`,
          `letter-spacing:${n(t.letterSpacing)}px`,
          'white-space:pre-wrap'
        )
        inner = escapeHtml(t.content)
        break
      }
      case 'image': {
        const img = l.image!
        if (img.src) {
          assets.push(img.src)
          inner = `<img ${polite ? 'data-src' : 'src'}="${escapeHtml(opts.assetUrl(img.src))}" alt="" style="width:100%;height:100%;object-fit:${img.fit};display:block">`
        }
        break
      }
      case 'shape': {
        const s = l.shape!
        rules.push(`background:${cssValue(s.fill)}`, `border-radius:${n(s.radius)}px`)
        if (s.strokeWidth > 0) rules.push(`border:${n(s.strokeWidth)}px solid ${cssValue(s.strokeColor)}`)
        break
      }
      case 'writeon': {
        const w = l.writeon!
        const paths = w.glyphs
          .map((g) => `<path pathLength="1" d="${escapeHtml(g.d)}"/>`)
          .join('')
        const vb = w.viewBox.map(n).join(' ')
        inner = `<svg viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" fill="${cssValue(w.color)}" stroke="${cssValue(w.color)}" stroke-width="${n(w.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 1" style="overflow:visible">${paths}</svg>`
        break
      }
    }

    if (l.cta) css.push(`#ad:hover #${id}{filter:brightness(1.12)}`, `#${id}{transition:filter .2s}`)
    css.push(`#${id}{${rules.join(';')}}`)
    body.push(`<div id="${id}" class="L">${inner}</div>`)

    if (isAnimated(l)) {
      const b: Record<string, number> = {}
      const p: Record<string, number[][]> = {}
      for (const prop of Object.keys(PROP_KEY) as AnimProp[]) {
        b[PROP_KEY[prop]] = round(l[prop])
        const kfs = l.tracks[prop]
        if (kfs && kfs.length) p[PROP_KEY[prop]] = kfs.map((k) => [round(k.t), round(k.v), easeIndex(k.e)])
      }
      const entry: Record<string, unknown> = { i: id, b, p }
      if (l.type === 'writeon') {
        entry.g = 1
        entry.f = round(l.writeon!.fillAfter, 2)
      } else if (l.revealMode !== 'none') {
        entry.w = WIPE_INDEX[l.revealMode]
      }
      animated.push(entry)
    }
  })

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
    L: animated
  }

  const clickUrl = JSON.stringify(project.clickTag || 'https://www.example.com').replace(/</g, '\\u003c')
  const click =
    opts.mode === 'export'
      ? `<a id="ad" href="javascript:window.open(window.clickTag)">`
      : `<a id="ad" href="javascript:void(0)">`

  const html =
    '<!DOCTYPE html>' +
    '<html lang="nl"><head><meta charset="utf-8">' +
    `<meta name="ad.size" content="width=${W},height=${H}">` +
    `<title>${escapeHtml(project.name)} ${W}x${H}</title>` +
    `<script>var clickTag=${clickUrl};</script>` +
    `<style>${css.join('')}</style>` +
    '</head><body>' +
    click +
    body.join('') +
    '</a>' +
    `<script>${minifiedRuntime()}${JSON.stringify(data)});</script>` +
    '</body></html>'

  return { html, assets: [...new Set(assets)], fontIds }
}

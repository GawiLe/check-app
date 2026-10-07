import { baseValue, easeIndex, round } from './anim'
import { effectiveLayer, endFrameTime } from './motion'
import { minifiedRuntime, WIPE_INDEX } from './runtime'
import { allLayers, walk } from './tree'
import { anchorOf } from './geometry'
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
  /** Extra bestanden voor in de zip (bijv. manifest.json voor Adform). */
  extraFiles: Record<string, string>
}

const PROP_KEY: Record<AnimProp, string> = { x: 'x', y: 'y', scale: 's', scaleY: 'q', rotation: 'r', opacity: 'o', reveal: 'v' }

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Houd CSS-waarden veilig: geen tekens waarmee je uit een declaratie kunt breken. */
export const cssValue = (s: string): string => s.replace(/[<>{};"\\]/g, '')

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

/** Alle tekens per font (voor subsetting). */
export function charsPerFont(project: Project, only?: Composition): Record<string, string> {
  const out: Record<string, Set<string>> = {}
  for (const c of only ? [only] : project.compositions)
    for (const l of allLayers(c.layers))
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
  const { width: W, height: H } = comp
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
    `#ad{position:relative;display:block;width:${W}px;height:${H}px;overflow:hidden;background:${cssValue(comp.background)};cursor:pointer;text-decoration:none}`,
    '.L{position:absolute;left:0;top:0;transform-origin:50% 50%;visibility:hidden}',
    '.r .L{visibility:visible}'
  )
  if (click.exitOf.size) css.push('.L{pointer-events:none}.X{pointer-events:auto;cursor:pointer}')

  const polite = opts.mode === 'export' && project.politeLoad
  let counter = 0

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
            inner = `<img ${polite ? 'data-src' : 'src'}="${escapeHtml(opts.assetUrl(img.src))}" alt="" style="width:100%;height:100%;object-fit:${oneOf(img.fit, ['contain', 'cover', 'fill'] as const, 'contain')};display:block">`
          }
          break
        }
        case 'shape': {
          const sh = l.shape!
          const fill = sh.fillEnabled === false ? 'none' : cssValue(sh.fill)
          if (sh.kind === 'path' && sh.path) {
            // Vrije vorm: SVG die meeschaalt met de laag; lijndikte blijft gelijk.
            const stroke = sh.strokeWidth > 0 ? ` stroke="${cssValue(sh.strokeColor)}" stroke-width="${n(sh.strokeWidth)}" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"` : ''
            inner = `<svg viewBox="0 0 ${n(sh.path.w)} ${n(sh.path.h)}" width="100%" height="100%" preserveAspectRatio="none" style="overflow:visible;display:block"><path d="${escapeHtml(sh.path.d)}" fill="${sh.path.closed ? fill : 'none'}"${sh.fillRule === 'evenodd' ? ' fill-rule="evenodd"' : ''}${stroke}/></svg>`
          } else {
            // Rechthoek / ellips: gewone CSS (lichtst).
            if (fill !== 'none') rules.push(`background:${fill}`)
            rules.push(`border-radius:${sh.kind === 'ellipse' ? '50%' : `${n(sh.radius)}px`}`)
            if (sh.strokeWidth > 0) rules.push(`border:${n(sh.strokeWidth)}px solid ${cssValue(sh.strokeColor)}`)
          }
          break
        }
        case 'writeon': {
          const w = l.writeon!
          const paths = w.glyphs.map((g) => `<path pathLength="1" d="${escapeHtml(g.d)}"/>`).join('')
          const vb = w.viewBox.map(n).join(' ')
          inner = `<svg viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" fill="${cssValue(w.color)}" stroke="${cssValue(w.color)}" stroke-width="${n(w.strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="1 1" style="overflow:visible">${paths}</svg>`
          break
        }
        case 'group':
          // Inhoud van de groep: posities relatief aan de groep, tijd vanaf het in-punt.
          inner = emit(l.children ?? [], offset + (l.start ?? 0))
          break
      }

      if (l.cta) css.push(`#ad:hover #${id}{filter:brightness(1.12)}`, `#${id}{transition:filter .2s}`)
      css.push(`#${id}{${rules.join(';')}}`)
      const exitNo = click.exitOf.get(raw.id)
      out.push(exitNo ? `<div id="${id}" class="L X"${click.exitAttr(exitNo)}>${inner}</div>` : `<div id="${id}" class="L">${inner}</div>`)

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
  body.push(emit(comp.layers, 0))

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
    L: animatedEntries
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

/** Klikgebieden in exportvolgorde: van boven naar onder in de lagenlijst (clickTag1, clickTag2 …). */
export function exitLayers(comp: Composition): Layer[] {
  const out: Layer[] = []
  walk(comp.layers, (l, anc) => {
    if (l.exit && l.visible && anc.every((a) => a.visible)) out.push(l)
  })
  return out
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
  const fallback = project.clickTag || 'https://www.example.com'
  const exits = exitLayers(comp)
  const exitOf = new Map(exits.map((l, i) => [l.id, i + 1]))
  const exitUrl = (n: number) => exits[n - 1].exit!.url.trim() || fallback
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

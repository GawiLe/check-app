// Code-elementen: eigen HTML/SVG + CSS-animatie in een banner. De code komt van de AI of de
// gebruiker en wordt daarom altijd eerst opgeschoond (geen scripts, geen externe bestanden) en
// per laag afgeschermd, zodat de CSS nooit iets anders in de banner raakt.

// Toegestane elementen: HTML-opmaak, SVG-vormen, verlopen, filters en SVG-animatie. Al het andere
// (script, style, iframe, a, img, form, foreignObject …) valt weg; script/style e.d. mét inhoud.
const TAGS = new Set(
  (
    'div span p br b i u strong em small sup sub ul ol li h1 h2 h3 h4 h5 h6 section figure ' +
    'svg g path circle ellipse rect line polyline polygon defs symbol use text tspan title desc ' +
    'lineargradient radialgradient stop clippath mask pattern marker ' +
    'filter fegaussianblur feoffset feblend fecolormatrix femerge femergenode feflood fecomposite fedropshadow femorphology feturbulence fedisplacementmap ' +
    'animate animatetransform animatemotion mpath'
  ).split(' ')
)
const VOID = new Set(['br'])
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'textarea', 'select', 'xmp', 'noembed', 'noframes', 'math', 'foreignobject'])
const ATTRS = new Set(
  (
    'id class style viewbox preserveaspectratio xmlns xmlns:xlink version width height x y x1 y1 x2 y2 cx cy r rx ry fx fy fr d points ' +
    'fill fill-opacity fill-rule clip-rule stroke stroke-width stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-opacity stroke-miterlimit ' +
    'opacity transform transform-origin offset stop-color stop-opacity gradientunits gradienttransform spreadmethod clippathunits maskunits maskcontentunits ' +
    'patternunits patterncontentunits patterntransform pathlength vector-effect font-family font-size font-weight font-style text-anchor dominant-baseline ' +
    'alignment-baseline letter-spacing dx dy rotate textlength lengthadjust href xlink:href clip-path mask filter marker-start marker-mid marker-end ' +
    'markerwidth markerheight refx refy orient stddeviation in in2 result mode values type flood-color flood-opacity operator k1 k2 k3 k4 radius ' +
    'basefrequency numoctaves seed scale xchannelselector ychannelselector ' +
    'attributename attributetype from to by dur begin end repeatcount repeatdur keytimes keysplines keypoints calcmode additive accumulate path ' +
    'aria-hidden role display visibility overflow color'
  ).split(' ')
)
// SVG-animatie mag alleen deze eigenschappen animeren (nooit href of event-handlers)
const ANIMATABLE = new Set(
  'transform opacity fill stroke fill-opacity stroke-opacity stroke-width stroke-dasharray stroke-dashoffset r rx ry cx cy x y x1 y1 x2 y2 width height d points offset stop-color stop-opacity visibility display'.split(
    ' '
  )
)

/** Alleen eenvoudige entiteiten; de rest (&colon; &Tab; …) weg, zodat niets verstopt kan worden. */
function decodeEntities(v: string): string {
  return v
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)[^;\s]*;?/gi, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(Math.min(0x10ffff, parseInt(h, 16))))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Math.min(0x10ffff, Number(d))))
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
}

const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const DANGEROUS = /javascript:|vbscript:|data:|expression\s*\(|url\s*\(\s*['"]?\s*(?!#)|image-set|@import|\\/i

/** Eén style-attribuut: zelfde regels als de CSS van het element (geen externe bestanden, geen escapes). */
function cleanStyleAttr(v: string): string {
  return cleanCodeCss(v).replace(/[{}]/g, '')
}

function cleanAttr(tag: string, name: string, raw: string): string | null {
  const n = name.toLowerCase()
  if (!ATTRS.has(n) || n.startsWith('on')) return null
  const v = decodeEntities(raw)
  if (n === 'style') return cleanStyleAttr(v)
  // Verwijzingen alleen naar iets in het element zelf (#id)
  if (n === 'href' || n === 'xlink:href') return /^#[\w-]+$/.test(v.trim()) ? v.trim() : null
  if (n === 'attributename') return ANIMATABLE.has(v.trim().toLowerCase()) ? v.trim() : null
  if ((n === 'values' || n === 'from' || n === 'to' || n === 'by') && /^(animate|animatetransform|animatemotion)$/.test(tag) && /[:(]/.test(v) && !/^[\d\s.,;()a-z#%-]*$/i.test(v)) return null
  if (DANGEROUS.test(v)) return null
  return v
}

/**
 * HTML/SVG opschonen met een allowlist. De invoer wordt in onderdelen gelezen en opnieuw opgebouwd:
 * alleen toegestane elementen en attributen komen terug, met netjes geëscapete waarden. Er wordt
 * dus nooit "iets weggehaald" waardoor de rest weer een tag vormt.
 */
export function cleanCodeHtml(html: string): string {
  const s = String(html ?? '')
  let out = ''
  let i = 0
  const stack: string[] = []
  const tagRe = /<(\/?)([a-zA-Z][\w:-]*)/y
  while (i < s.length) {
    if (s.startsWith('<!--', i)) {
      const j = s.indexOf('-->', i + 4)
      i = j < 0 ? s.length : j + 3
      continue
    }
    if (s[i] !== '<') {
      const j = s.indexOf('<', i)
      out += s.slice(i, j < 0 ? s.length : j).replace(/>/g, '&gt;')
      i = j < 0 ? s.length : j
      continue
    }
    tagRe.lastIndex = i
    const m = tagRe.exec(s)
    if (!m) {
      out += '&lt;'
      i++
      continue
    }
    // Einde van de tag, met aanhalingstekens meegeteld
    let j = i + m[0].length
    let quote: string | null = null
    for (; j < s.length; j++) {
      const c = s[j]
      if (quote) {
        if (c === quote) quote = null
      } else if (c === '"' || c === "'") quote = c
      else if (c === '>') break
    }
    const raw = s.slice(i + m[0].length, j)
    i = j < s.length ? j + 1 : s.length
    const closing = m[1] === '/'
    const name = m[2]
    const lower = name.toLowerCase()
    if (!TAGS.has(lower)) {
      if (!closing && DROP_WITH_CONTENT.has(lower)) {
        // Inhoud meenemen tot en met de bijbehorende sluittag
        const end = s.toLowerCase().indexOf('</' + lower, i)
        if (end < 0) i = s.length
        else {
          const gt = s.indexOf('>', end)
          i = gt < 0 ? s.length : gt + 1
        }
      }
      continue
    }
    if (closing) {
      const at = stack.lastIndexOf(lower)
      if (at >= 0) while (stack.length > at) out += `</${stack.pop()}>`
      continue
    }
    const attrs: string[] = []
    const attrRe = /([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g
    let a: RegExpExecArray | null
    while ((a = attrRe.exec(raw))) {
      const an = a[1]
      if (!/^[a-zA-Z_:][\w:.-]*$/.test(an)) continue
      const rawVal = a[2] == null ? '' : a[2].replace(/^["']|["']$/g, '')
      const v = cleanAttr(lower, an, rawVal)
      if (v != null) attrs.push(` ${an}="${escAttr(v)}"`)
    }
    const selfClose = /\/\s*$/.test(raw)
    out += `<${lower}${attrs.join('')}${selfClose ? '/>' : '>'}`
    if (!selfClose && !VOID.has(lower)) stack.push(lower)
  }
  while (stack.length) out += `</${stack.pop()}>`
  return out.trim()
}

/** CSS opschonen: geen @import, geen externe url() of image-set(), geen escapes, niets waarmee je uit de <style> breekt. */
export function cleanCodeCss(css: string): string {
  return (
    String(css ?? '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // Escapes (\75 rl( …) zijn nergens voor nodig en kunnen filters omzeilen: helemaal weg, met de code erachter
      .replace(/\\(?:[0-9a-f]{1,6}\s?|[\s\S]?)/gi, '')
      // Geen adressen naar buiten, in welke vorm dan ook
      .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s;)'"}]*/gi, '')
      // '<' komt in CSS niet voor; zonder '<' kan de code niet uit de <style> breken
      .replace(/</g, '')
      .replace(/url\s*\(\s*(['"]?)\s*(?!#)[^)]*\)/gi, 'none')
      .replace(/(?:-webkit-)?image-set\s*\(/gi, '(')
      .replace(/expression\s*\(|-moz-binding|behavior\s*:/gi, '')
  )
}

/**
 * Maakt de CSS uniek voor één laag: `.root` wordt de container van de laag, andere selectors
 * komen daaronder te hangen, en keyframe-namen krijgen een eigen voorvoegsel.
 */
export function scopeCodeCss(css: string, scope: string, prefix: string): string {
  const src = cleanCodeCss(css).replace(/\bkf-/g, `${prefix}-`)
  let i = 0
  const block = (): string => {
    // Leest tot en met de bijbehorende '}' (i staat net na '{')
    let depth = 1
    const start = i
    while (i < src.length && depth > 0) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') depth--
      i++
    }
    return src.slice(start, i - 1)
  }
  const rules = (until: () => boolean): string => {
    let out = ''
    while (i < src.length && !until()) {
      const brace = src.indexOf('{', i)
      const semi = src.indexOf(';', i)
      const close = src.indexOf('}', i)
      if (close !== -1 && (brace === -1 || close < brace) && (semi === -1 || close < semi)) break
      if (brace === -1 || (semi !== -1 && semi < brace)) {
        // Losse @-regel zonder blok (bijv. @import): weg
        i = semi === -1 ? src.length : semi + 1
        continue
      }
      const prelude = src.slice(i, brace).trim()
      i = brace + 1
      if (/^@(-webkit-)?keyframes\b/i.test(prelude)) out += `${prelude}{${block()}}`
      else if (/^@(media|supports)\b/i.test(prelude)) {
        const inner = rules(() => src[i] === '}')
        i++ // '}'
        out += `${prelude}{${inner}}`
      } else if (prelude.startsWith('@')) block()
      else {
        const sel = prelude
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => {
            const scoped = s.replace(/\.root(?![\w-])/g, scope)
            return scoped.startsWith(scope) ? scoped : `${scope} ${scoped}`
          })
          .join(',')
        out += `${sel}{${block()}}`
      }
    }
    return out
  }
  return rules(() => false)
}

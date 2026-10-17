// Code-elementen: eigen HTML/SVG + CSS-animatie in een banner. De code komt van de AI of de
// gebruiker en wordt daarom altijd eerst opgeschoond (geen scripts, geen externe bestanden) en
// per laag afgeschermd, zodat de CSS nooit iets anders in de banner raakt.

/** HTML opschonen: geen scripts, event-handlers, links, formulieren of ingesloten pagina's. */
export function cleanCodeHtml(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|iframe|object|embed|noscript|template)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|style|iframe|object|embed|noscript|template|link|meta|base|a|form|input|button|textarea|select|html|head|body)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\s(href|xlink:href|src)\s*=\s*("\s*(?:javascript|https?|\/\/)[^"]*"|'\s*(?:javascript|https?|\/\/)[^']*')/gi, '')
    .trim()
}

/** CSS opschonen: geen @import, geen externe url(), niets waarmee je uit de <style> breekt. */
export function cleanCodeCss(css: string): string {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // '<' komt in CSS niet voor; zonder '<' kan de code niet uit de <style> breken
    .replace(/<|\\0*3c/gi, '')
    .replace(/url\(\s*(['"]?)(?!data:|#)[^)]*\)/gi, 'none')
    .replace(/expression\s*\(/gi, '')
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

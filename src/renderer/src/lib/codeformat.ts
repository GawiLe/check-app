// Banner-HTML leesbaar maken voor de Code-weergave (de export zelf blijft compact).

const indent = (n: number) => '  '.repeat(n)

function formatCss(css: string, base: number): string {
  const out: string[] = []
  for (const rule of css.split('}')) {
    const i = rule.indexOf('{')
    if (i < 0) continue
    const sel = rule.slice(0, i).trim()
    const decls = rule
      .slice(i + 1)
      .split(/;(?![^(]*\))/)
      .map((d) => d.trim())
      .filter(Boolean)
      // Ingebedde fonts/afbeeldingen inkorten in de leesbare weergave
      .map((d) => d.replace(/base64,([A-Za-z0-9+/=]{40})[A-Za-z0-9+/=]+/g, (_, h) => `base64,${h}…`))
    out.push(`${indent(base)}${sel} {`, ...decls.map((d) => `${indent(base + 1)}${d};`), `${indent(base)}}`)
  }
  return out.join('\n')
}

function formatBody(html: string, base: number): string {
  const parts = html.split(/(<[^>]+>)/).filter((p) => p !== '')
  const out: string[] = []
  let depth = base
  let line = ''
  const flush = () => {
    if (line) out.push(indent(depth) + line)
    line = ''
  }
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    const isTag = p.startsWith('<')
    const closing = p.startsWith('</')
    const selfClosing = /\/>$/.test(p) || /^<(img|br|meta|path)\b/i.test(p)
    // Korte elementen met alleen tekst op één regel houden: <div …>tekst</div>
    if (isTag && !closing && !selfClosing && parts[i + 2]?.startsWith('</') && !parts[i + 1]?.startsWith('<')) {
      flush()
      out.push(indent(depth) + p + parts[i + 1].replace(/\n/g, '⏎') + parts[i + 2])
      i += 2
      continue
    }
    if (!isTag) {
      if (p.trim()) {
        flush()
        out.push(indent(depth) + p.trim())
      }
      continue
    }
    flush()
    if (closing) depth = Math.max(base, depth - 1)
    out.push(indent(depth) + p)
    if (!closing && !selfClosing) depth++
  }
  flush()
  return out.join('\n')
}

/** Leesbare versie: CSS per regel, elementen ingesprongen, runtime-data als JSON. */
export function prettyBanner(html: string): string {
  const style = html.match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? ''
  const head = html.slice(0, html.indexOf('<style>'))
  const bodyStart = html.indexOf('<body>') + 6
  const scriptAt = html.lastIndexOf('<script>')
  const body = html.slice(bodyStart, scriptAt)
  const script = html.slice(scriptAt + 8, html.lastIndexOf('</script>'))
  const split = script.lastIndexOf('})(')
  const runtime = split > 0 ? script.slice(0, split + 3) : script
  let data = split > 0 ? script.slice(split + 3).replace(/\);$/, '') : ''
  try {
    data = JSON.stringify(JSON.parse(data), null, 2)
  } catch {
    /* laat staan */
  }
  const headLines = head
    .replace('<!DOCTYPE html>', '<!DOCTYPE html>\n')
    .replace(/(<html[^>]*>)/, '$1\n')
    .replace(/<head>/, '<head>\n')
    .split(/(?=<meta|<title|<script)/)
    .map((l) => l.trim())
    .filter(Boolean)
  return [
    headLines[0],
    headLines[1],
    '<head>',
    ...headLines.slice(3).map((l) => indent(1) + l),
    `${indent(1)}<style>`,
    formatCss(style, 2),
    `${indent(1)}</style>`,
    '</head>',
    '<body>',
    formatBody(body, 1),
    `${indent(1)}<script>`,
    `${indent(2)}// Banner-runtime (${(runtime.length / 1024).toFixed(1)} KB): speelt de animatie af`,
    indent(2) + runtime.replace(/;/g, ';\n' + indent(2)).trim(),
    data
      .split('\n')
      .map((l) => indent(2) + l)
      .join('\n') + ')',
    `${indent(1)}</script>`,
    '</body>',
    '</html>'
  ]
    .filter((l) => l != null)
    .join('\n')
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Eenvoudige kleuring voor HTML/CSS/JS (alleen voor weergave). */
export function highlight(code: string): string {
  const span = (cls: string, t: string) => `<span class="${cls}">${esc(t)}</span>`
  // Eén doorgang per regel: elk stuk tekst wordt precies één keer gekleurd en ge-escaped
  const TOKENS = /(<\/?)([a-zA-Z!][\w-]*)|([\w:-]+)(?==["'])|("[^"]*"|'[^']*')/g
  return code
    .split('\n')
    .map((line) => {
      if (/^\s*\/\//.test(line)) return span('c-com', line)
      const prop = /^(\s*)([a-z-]+)(:)(?!\/\/)(.*)$/.exec(line)
      if (prop && !line.includes('<') && !line.includes('=')) return esc(prop[1]) + span('c-prop', prop[2]) + ':' + tokens(prop[4])
      const sel = /^(\s*)([#.@*a-z][^{=<]*)( \{)$/i.exec(line)
      if (sel) return esc(sel[1]) + span('c-sel', sel[2]) + sel[3]
      return tokens(line)
    })
    .join('\n')

  function tokens(text: string) {
    let out = ''
    let last = 0
    for (const m of text.matchAll(TOKENS)) {
      out += esc(text.slice(last, m.index))
      if (m[2]) out += esc(m[1]) + span('c-tag', m[2])
      else if (m[3]) out += span('c-attr', m[3])
      else out += span('c-str', m[4])
      last = m.index! + m[0].length
    }
    return out + esc(text.slice(last))
  }
}

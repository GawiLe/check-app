// Rooktest: de opschoner van code-elementen (en de andere invoer) tegen ~120 bekende aanvalspatronen.
// Elk patroon wordt een echte geëxporteerde banner (CM360 en Adform) en wordt in Chromium geladen: alles
// aanwijzen, klikken en focussen. Er mag nooit code draaien en nooit iets van buiten geladen worden
// (behalve het officiële Adform-script). Daarnaast een statische controle van de opgeschoonde code.
// Gebruik: xvfb-run node scripts/smoke-sanitizer.mjs <ongebruikt> <screenshotmap>
import { build } from 'esbuild'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright-core'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const [, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const entry = "import { buildBanner } from './src/shared/build'\nimport { createLayer, createStarterProject } from './src/shared/factory'\nimport { cleanCodeHtml, scopeCodeCss } from './src/shared/code'\n\nconst X = (n: number) => `__x(${n})`\nconst E = 'https://evil.example'\nconst html: string[] = [\n  `<script>${X(1)}</script>`,\n  `<img src=x onerror=${X(2)}>`,\n  `<svg onload=${X(3)}>`,\n  `<svg><script>${X(4)}</script></svg>`,\n  `<svg><animate onbegin=${X(5)} attributeName=x dur=1s>`,\n  `<svg><set attributeName=onload to=${X(6)} />`,\n  `<svg><a id=q><text x=20 y=20>X</text></a><animate xlink:href=#q attributeName=href values=javascript:${X(7)} /></svg>`,\n  `<a href=\"javascript:${X(8)}\">x</a>`,\n  `<svg><a xlink:href=\"javascript:${X(9)}\"><text>t</text></a></svg>`,\n  `<svg><use href=\"data:image/svg+xml,<svg id='x' xmlns='http://www.w3.org/2000/svg'><image href='1' onerror='${X(10)}'/></svg>#x\"/></svg>`,\n  `<iframe srcdoc=\"<script>parent.${X(11)}</script>\">`,\n  `<math><mtext><table><mglyph><style><img src=x onerror=${X(12)}>`,\n  `<noscript><p title=\"</noscript><img src=x onerror=${X(13)}>\">`,\n  `<svg></p><style><a id=\"</style><img src=1 onerror=${X(14)}>\">`,\n  `<div style=\"background:url(javascript:${X(15)})\">a</div>`,\n  `<div style=\"behavior:url(x.htc)\">a</div>`,\n  `<div style=\"width:expression(${X(16)})\">a</div>`,\n  `<object data=\"javascript:${X(17)}\"></object><embed src=\"javascript:${X(17)}\">`,\n  `<form action=\"javascript:${X(18)}\"><button>b</button></form>`,\n  `<details open ontoggle=${X(19)}>d</details>`,\n  `<div onmouseover=${X(20)} style=\"width:300px;height:250px\">hover</div>`,\n  `<div ONMOUSEOVER=${X(21)} style=\"width:300px;height:250px\">x</div>`,\n  `<div onmouseover\\n=${X(22)} style=\"width:300px;height:250px\">x</div>`,\n  `<div/onmouseover=${X(23)} style=\"width:300px;height:250px\">x</div>`,\n  `<div class=\"x\" onmouseover=\"${X(24)}\" style=\"width:300px;height:250px\">x</div>`,\n  `<<script>${X(25)}//<</script>`,\n  `<scr<script>ipt>${X(26)}</scr</script>ipt>`,\n  `<svg><foreignObject><img src=x onerror=${X(27)}></foreignObject></svg>`,\n  `<svg><image href=x onerror=${X(28)}></svg>`,\n  `<svg><pattern id=p><image href=\"${E}/i.png\"/></pattern><rect fill=\"url(#p)\" width=10 height=10 /></svg>`,\n  `<svg><a href=\"&#106;avascript:${X(29)}\"><text>t</text></a></svg>`,\n  `<div style=\"x:expr/**/ession(${X(30)})\">a</div>`,\n  `<svg><animateTransform attributeName=\"transform\" type=\"rotate\" values=\"0;javascript:${X(31)}\"/></svg>`,\n  `<svg><animate attributeName=\"HREF\" to=\"javascript:${X(32)}\"/></svg>`,\n  `<svg><animate attributeName=\"onload\" to=\"${X(33)}\"/></svg>`,\n  `<template><img src=x onerror=${X(34)}></template>`,\n  `<textarea><img src=x onerror=${X(35)}></textarea>`,\n  `<title><img src=x onerror=${X(36)}></title>`,\n  `<title><div class=\"</title><img src=x onerror=${X(37)}>\"></div></title>`,\n  `<svg><![CDATA[><img src=x onerror=${X(38)}>]]></svg>`,\n  `<!--><img src=x onerror=${X(39)}>-->`,\n  `<div class=a>b onmouseover=${X(40)}>c</div>`,\n  `<scr\\0ipt>${X(41)}</scr\\0ipt>`,\n  `<svg><animate attributeName=\"fill\" values=\"red;url(${E}/x)\"/></svg>`,\n  `<svg><rect width=10 height=10 filter=\"url(${E}/f.svg#f)\" fill=\"url('${E}/p.png')\"/></svg>`,\n  `<div style=\"background-image:url(${E}/track.png)\">a</div>`,\n  `<div style=\"background:\\\\75\\\\72\\\\6c(${E}/a.png)\">a</div>`,\n  `<div style=\"background:u&#114;l(${E}/a.png)\">a</div>`,\n  `<div style=\"background:image-set('${E}/a.png' 1x)\">a</div>`,\n  `<link rel=stylesheet href=\"${E}/x.css\"><meta http-equiv=refresh content=\"0;url=${E}\"><base href=\"${E}/\">`,\n  `<svg><style>@import '${E}/x.css'</style></svg>`,\n  `<style>*{background:url(${E}/a)}</style>`,\n  `<svg><use href=\"${E}/sprite.svg#x\"/></svg>`,\n  `<svg><use xlink:href=\"${E}/sprite.svg#x\"/></svg>`,\n  `<svg><mpath xlink:href=\"${E}/p.svg#a\"/></svg>`,\n  `<svg><feImage href=\"${E}/i.png\"/></svg>`,\n  `<svg><animate attributeName=\"href\" to=\"${E}/x.svg\"/></svg>`,\n  `<div id=\"a3\">kaap laag a3</div><div id=\"ad\">x</div><div id=\"API_URL\">y</div><div id=\"dhtml\">z</div>`,\n  `<div style=\"position:fixed;left:0;top:0;width:9999px;height:9999px;z-index:2147483647\" onclick=\"${X(42)}\">overlay</div>`,\n  `<svg width=300 height=250><rect width=300 height=250 onclick=\"${X(43)}\"/></svg>`,\n  `<svg><animate attributeName=\"fill\" begin=\"0s\" dur=\"1s\" onend=\"${X(44)}\"/></svg>`,\n  `<svg><set attributeName=\"fill\" to=\"red\" onbegin=\"${X(45)}\"/></svg>`,\n  `<svg><animate attributename=\"href\" from=\"#a\" to=\"javascript:${X(46)}\"/></svg>`,\n  `<svg><animate attributeName=\"xlink:href\" to=\"javascript:${X(47)}\"/></svg>`,\n  `<div style=\"--x:url(${E}/v.png);background:var(--x)\">a</div>`,\n  `<div style=\"background:url(&quot;${E}/q.png&quot;)\">a</div>`,\n  `<div style=\"background:url(%22${E}/q.png%22)\">a</div>`,\n  `<div style=\"background:\\\\0075rl(${E}/a.png)\">a</div>`,\n  `<p style=\"font-family:x}body{background:url(${E}/b.png)\">a</p>`,\n  `<svg><text><tspan style=\"fill:url(${E}/g.svg#g)\">t</tspan></text></svg>`,\n  `<keygen autofocus onfocus=${X(48)}><input autofocus onfocus=${X(49)}><select autofocus onfocus=${X(49)}></select>`,\n  `<marquee onstart=${X(50)}>m</marquee><video><source onerror=${X(51)}></video><audio src=x onerror=${X(52)}></audio>`,\n  `<body onload=${X(53)}><html onmouseover=${X(54)}>`,\n  `<svg><discard onbegin=${X(55)} /></svg>`,\n  `<div style=\"animation:x 1s\" onanimationstart=${X(56)}>a</div>`,\n  `<div tabindex=1 autofocus onfocusin=${X(57)}>a</div>`,\n  `<svg><animate attributeName=x dur=1s repeatCount=2 onrepeat=${X(58)} /></svg>`,\n  `<div style=\"background:url( ${E}/sp.png )\">a</div>`,\n  `<div style=\"background:URL(${E}/up.png)\">a</div>`,\n  `<div style=\"background:url(${E.replace('https:', '')}/rel.png)\">a</div>`,\n  `<div style=\"background:url(/abs.png)\">a</div>`\n]\nconst css: string[] = [\n  `@import url(${E}/x.css);.root{color:red}`,\n  `@import '${E}/x.css';`,\n  `@import '//evil.example/x.css';`,\n  `.root{background:url(//evil.example/a.png)}`,\n  `.root{background:url( \"//evil.example/b.png\")}`,\n  `.root{background:image-set(\"//evil.example/c.png\" 1x)}`,\n  `.root{background:-webkit-image-set(\"//evil.example/d.png\" 1x)}`,\n  `.root{background:cross-fade(url(//evil.example/e1),url(//evil.example/e2),50%)}`,\n  `.root{background:u\\\\72l(//evil.example/f.png)}`,\n  `.root{background:url/**/(//evil.example/g.png)}`,\n  `.root{background: URL(//evil.example/h.png)}`,\n  `.root{font-family:x}@font-face{font-family:x;src:url(//evil.example/f.woff)}`,\n  `@media all{@import url(//evil.example/m.css);.root{background:url(//evil.example/m.png)}}`,\n  `</style><script>${X(60)}</script>`,\n  `.root{content:\"\\\\3c/style\\\\3e<script>${X(61)}</script>\"}`,\n  `.root{behavior:url(x.htc);-moz-binding:url(${E}/b.xml#x)}`,\n  `}*{background:url(${E}/esc.png)}`,\n  `.root ~ *, body, html, #ad, :root{background:red !important;display:none !important}`,\n  `@namespace url(${E});@charset \"utf-8\";`,\n  `.root{--a:url(${E}/v1.png);background:var(--a)}`,\n  `.root::after{content:url(${E}/after.png)}`,\n  `.root{list-style:url(${E}/li.png)}`,\n  `.root{cursor:url(${E}/cur.png),auto}`,\n  `.root{mask:url(${E}/mask.svg#m)}`,\n  `.root{filter:url(${E}/f.svg#f)}`,\n  `.root{background:src(\"${E}/src.png\")}`,\n  `@supports (display:grid){.root{background:url(${E}/sup.png)}}`,\n  `@keyframes kf-a{from{background:url(${E}/kf.png)}}.root{animation:kf-a 1s}`,\n  `@property --x{syntax:'<url>';inherits:false;initial-value:url(${E}/prop.png)}`,\n  `@layer x{.root{background:url(${E}/layer.png)}}@container (min-width:1px){.root{background:url(${E}/cont.png)}}`,\n  `.root{background:url(${E}/a.png}`,\n  `.root{background:\\\\75 \\\\72 \\\\6c (${E}/sp-esc.png)}`,\n  `.root{background:url(&#x2F;&#x2F;evil.example/ent.png)}`,\n  `.root{background-image:url('data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" onload=\"${X(62)}\"/>')}`,\n  `.root{background:url(javascript:${X(63)})}`,\n  `.root{width:expression(${X(64)})}`,\n  `.root{x:expr\\\\65ssion(${X(65)})}`,\n  `@import url(\"${E}/q.css\") screen;`,\n  `.root{background:url( ${E}/w s.png )}`\n]\nconst cases: { id: string; kind: string; payload: string; html: string; clean?: string }[] = []\nconst build = (mut: (p: ReturnType<typeof createStarterProject>) => void, target: 'cm360' | 'adform') => {\n  const p = createStarterProject()\n  mut(p)\n  return buildBanner(p, p.compositions[0], { mode: 'export', target, assetUrl: (x) => x.split('/').pop()!, fontSrc: {} }).html\n}\nconst codeLayer = (p: ReturnType<typeof createStarterProject>, h: string, c: string) => {\n  const comp = p.compositions[0]\n  const l = createLayer('code', comp)\n  l.code = { html: h, css: c, w: 300, h: 250 } as never\n  Object.assign(l, { x: 0, y: 0, width: 300, height: 600 })\n  comp.layers.push(l)\n}\nhtml.forEach((h, i) => {\n  for (const t of ['cm360', 'adform'] as const) cases.push({ id: `html${i}-${t}`, kind: 'html', payload: h, html: build((p) => codeLayer(p, h, ''), t), clean: cleanCodeHtml(h) })\n})\ncss.forEach((c, i) => cases.push({ id: `css${i}`, kind: 'css', payload: c, html: build((p) => codeLayer(p, '<div class=\"root\" style=\"width:100px;height:100px\">x</div>', c), 'cm360'), clean: scopeCodeCss(c, '#a9>.K', 'a9') }))\n// Andere invoer: tekst, kleuren, font, clickTag, klikgebied, projectnaam\nconst other: [string, (p: ReturnType<typeof createStarterProject>) => void][] = [\n  ['tekst', (p) => (p.compositions[0].layers.find((l) => l.type === 'text')!.text!.content = `</div><script>${X(70)}</script><img src=x onerror=${X(70)}>`)],\n  ['kleur', (p) => (p.compositions[0].layers.find((l) => l.type === 'text')!.text!.color = `red;}</style><script>${X(71)}</script><style>{`)],\n  ['achtergrond', (p) => (p.compositions[0].background = `url(${E}/bg.png)`)],\n  ['rand', (p) => (p.compositions[0].border = { color: `red}body{background:url(${E}/bd.png)}`, width: 1 })],\n  ['font', (p) => {\n    p.fonts.push({ id: 'fx', family: `x\";}</style><script>${X(72)}</script>`, file: '', weight: 400, style: 'normal', system: true })\n    p.compositions[0].layers.find((l) => l.type === 'text')!.text!.fontId = 'fx'\n  }],\n  ['clicktag', (p) => (p.clickTag = `javascript:${X(73)}`)],\n  ['clicktag2', (p) => (p.clickTag = `https://x.example/\"</script><script>${X(74)}</script>`)],\n  ['exit', (p) => (p.compositions[0].layers[0].exit = { url: `javascript:${X(75)}` })],\n  ['naam', (p) => (p.name = `</title><script>${X(76)}</script>`)],\n  ['vulling', (p) => (p.compositions[0].layers.find((l) => l.type === 'shape')!.shape!.fill = `url(${E}/fill.png)`)],\n  ['blend', (p) => ((p.compositions[0].layers[0] as unknown as { blend: string }).blend = `multiply;background:url(${E}/blend.png)`)]\n]\nfor (const [k, mut] of other) for (const t of ['cm360', 'adform'] as const) cases.push({ id: `${k}-${t}`, kind: 'andere', payload: k, html: build(mut, t) })\nexport default cases\n"
const out = await build({ stdin: { contents: entry, resolveDir: root, loader: 'ts', sourcefile: 'cases.ts' }, bundle: true, platform: 'node', format: 'esm', write: false, alias: { '@shared': join(root, 'src/shared') } })
const file = join(shots, 'sanitizer-cases.mjs')
await writeFile(file, out.outputFiles[0].text)
const cases = (await import(pathToFileURL(file).href)).default

let fails = 0
const check = (label, ok, detail = []) => {
  if (!ok) fails++
  console.log(label, ok ? 'OK' : 'MISLUKT')
  if (!ok) for (const d of detail.slice(0, 12)) console.log('   ', d)
}
const ADFORM = /^https:\/\/s1\.adform\.net\/banners\/scripts\/rmb\/Adform\.DHTML\.js/
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium' }).catch(() => chromium.launch())
const ctx = await browser.newContext({ viewport: { width: 400, height: 700 } })
const results = []
for (const c of cases) {
  const page = await ctx.newPage()
  const hits = []
  const requests = []
  await page.exposeFunction('__x', (n) => hits.push(`__x(${n})`))
  await page.addInitScript(() => {
    window.alert = window.confirm = window.prompt = (m) => window.__x('alert:' + m)
  })
  page.on('dialog', (d) => (hits.push('dialog:' + d.message()), d.dismiss().catch(() => {})))
  page.on('popup', (p) => (hits.push('popup:' + p.url()), p.close().catch(() => {})))
  await page.route('**/*', (route) => {
    const u = route.request().url()
    if (!u.startsWith('data:') && !u.startsWith('about:') && !ADFORM.test(u)) requests.push(u)
    route.abort().catch(() => {})
  })
  try {
    await page.setContent(c.html, { waitUntil: 'load', timeout: 8000 })
    await page.waitForTimeout(250)
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('*'))
        for (const t of ['mouseover', 'mouseenter', 'focus', 'focusin', 'animationstart', 'toggle']) el.dispatchEvent(new Event(t, { bubbles: true }))
    })
    await page.mouse.move(150, 120)
    await page.mouse.move(150, 300)
    await page.waitForTimeout(1200)
    const dom = await page.evaluate(() => ({ api: typeof window.API_URL, dhtml: typeof window.dhtml, a3: document.getElementById('a3')?.className ?? '' }))
    results.push({ ...c, hits, requests, dom })
  } catch (e) {
    results.push({ ...c, hits, requests, error: String(e).slice(0, 120) })
  }
  await page.close()
}
await browser.close()

// Statisch: alleen toegestane tags, geen on*-attributen, geen gevaarlijke waarden, verwijzingen alleen #id
const TAGS = /^(div|span|p|br|b|i|u|strong|em|small|sup|sub|ul|ol|li|h[1-6]|section|figure|svg|g|path|circle|ellipse|rect|line|polyline|polygon|defs|symbol|use|text|tspan|title|desc|lineargradient|radialgradient|stop|clippath|mask|pattern|marker|filter|fe[a-z]+|animate|animatetransform|animatemotion|mpath)$/
const staticBad = []
for (const c of cases.filter((x) => x.kind === 'html')) {
  for (const m of c.clean.matchAll(/<\/?([a-z][\w:-]*)([^>]*)>/gi)) {
    if (!TAGS.test(m[1].toLowerCase()) || m[1].toLowerCase() === 'feimage') staticBad.push(`${c.id}: tag ${m[1]}`)
    for (const a of m[2].matchAll(/\s([^\s=]+)="([^"]*)"/g)) {
      const v = a[2].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      if (/^on/i.test(a[1])) staticBad.push(`${c.id}: attribuut ${a[1]}`)
      if (/javascript:|vbscript:|data:/i.test(v) || (/:\/\//.test(v) && !/^xmlns/i.test(a[1]))) staticBad.push(`${c.id}: waarde ${a[1]}=${v}`)
      if (/href$/i.test(a[1]) && !v.startsWith('#')) staticBad.push(`${c.id}: href ${v}`)
      if (/url\(\s*['"]?\s*(?!#)/i.test(v)) staticBad.push(`${c.id}: url in ${a[1]}`)
      if (a[1].toLowerCase() === 'id' && /^(a\d+|ad|bd|api_url|dhtml)$/i.test(v)) staticBad.push(`${c.id}: gereserveerde id ${v}`)
    }
  }
}
for (const c of cases.filter((x) => x.kind === 'css')) {
  const s = c.clean
  if (/url\(\s*['"]?\s*(?!#)/i.test(s)) staticBad.push(`${c.id}: url( in CSS`)
  if (/@import|@font-face|@namespace|@property|@layer|@container|expression\(|-moz-binding|behavior\s*:|[a-z]+:\/\/|</i.test(s)) staticBad.push(`${c.id}: verboden CSS`)
  // Elke regel hangt onder de laag (#a9>.K), behalve keyframes/media/supports
  let depth = 0
  let start = 0
  const kf = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '{') {
      const prelude = s.slice(start, i).trim()
      const inKf = kf.length && kf[kf.length - 1]
      if (!inKf && !/^@(-webkit-)?keyframes|^@(media|supports)/.test(prelude) && !prelude.split(',').every((p) => p.trim().startsWith('#a9>.K'))) staticBad.push(`${c.id}: selector buiten de laag: ${prelude}`)
      kf.push(/^@(-webkit-)?keyframes/.test(prelude) || inKf)
      depth++
      start = i + 1
    } else if (s[i] === '}') {
      kf.pop()
      depth--
      start = i + 1
    } else if (s[i] === ';' && depth === 0) start = i + 1
  }
}

check(`${results.length} banners geladen zonder fouten`, results.every((r) => !r.error), results.filter((r) => r.error).map((r) => `${r.id}: ${r.error}`))
check('nergens code uitgevoerd (ook niet bij aanwijzen, klikken of focussen)', results.every((r) => !r.hits.length), results.filter((r) => r.hits.length).map((r) => `${r.id}: ${r.hits.join(' ')}`))
check('niets van buiten geladen (alleen het Adform-script bij Adform)', results.every((r) => !r.requests.length), results.filter((r) => r.requests.length).map((r) => `${r.id}: ${r.requests.join(' ')}`))
check('opgeschoonde code: alleen toegestane tags, attributen en waarden; CSS alleen binnen de laag', !staticBad.length, staticBad)
const clob = results.filter((r) => r.dom && (r.dom.api !== 'undefined' || r.dom.dhtml !== 'undefined' || (r.dom.a3 && !/(^|\s)L(\s|$)/.test(r.dom.a3))))
check("id's van de banner niet te kapen (a3, API_URL, dhtml)", !clob.length, clob.map((r) => `${r.id}: ${JSON.stringify(r.dom)}`))

console.log(fails ? `${fails} controle(s) mislukt` : 'Opschoner: alles in orde')
process.exit(fails ? 1 : 0)

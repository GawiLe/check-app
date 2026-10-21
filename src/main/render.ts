// Afgeschermde vensters om een geëxporteerde banner te renderen (backup-afbeelding, MP4, GIF).
// De banner-HTML komt (deels) uit het projectbestand en wordt dus niet vertrouwd: hij draait in een
// eigen sessie, via een eigen adres (bsrender://) dat alleen de tijdelijke exportmap kan zien, met
// een strenge CSP, zonder netwerk, zonder nieuwe vensters of navigatie en zonder permissies.
import { BrowserWindow, session, type Session } from 'electron'
import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { MIME } from './exporter'
import { inside } from './paths'

export const RENDER_SCHEME = 'bsrender'
const FONT_MIME: Record<string, string> = { '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' }
const RENDER_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src bsrender: data:; font-src bsrender: data:; media-src 'none'; connect-src 'none'; frame-src 'none'; worker-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'"

const roots = new Map<string, string>()
let ses: Session | null = null

function renderSession(): Session {
  if (ses) return ses
  const s = session.fromPartition('bnnr-render')
  void s.protocol.handle(RENDER_SCHEME, async (req) => {
    try {
      const url = new URL(req.url)
      const root = roots.get(url.hostname)
      if (!root) return new Response('Niet gevonden', { status: 404 })
      const file = inside(root, decodeURIComponent(url.pathname.slice(1)) || 'index.html')
      const ext = extname(file).toLowerCase()
      const html = ext === '.html'
      return new Response(await readFile(file), {
        headers: {
          'content-type': html ? 'text/html; charset=utf-8' : (MIME[ext] ?? FONT_MIME[ext] ?? 'application/octet-stream'),
          ...(html ? { 'content-security-policy': RENDER_CSP } : {}),
          'cache-control': 'no-store'
        }
      })
    } catch {
      return new Response('Niet gevonden', { status: 404 })
    }
  })
  // Geen netwerk: alleen de eigen bestanden en data:-URL's
  s.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (d, cb) => cb({ cancel: !/^(bsrender|data):/i.test(d.url) }))
  s.setPermissionRequestHandler((_wc, _p, cb) => cb(false))
  s.setPermissionCheckHandler(() => false)
  ses = s
  return s
}

/** Map tijdelijk beschikbaar maken; geeft het adres van index.html en een functie om hem weer af te sluiten. */
export function serveDir(dir: string): { url: string; release: () => void } {
  const token = randomUUID().replace(/-/g, '')
  roots.set(token, dir)
  return { url: `${RENDER_SCHEME}://${token}/index.html`, release: () => void roots.delete(token) }
}

/** Onzichtbaar, afgeschermd venster van de gevraagde maat. */
export function renderWindow(width: number, height: number): BrowserWindow {
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    webPreferences: { session: renderSession(), offscreen: true, sandbox: true, javascript: true, backgroundThrottling: false, spellcheck: false }
  })
  const wc = win.webContents
  wc.setWindowOpenHandler(() => ({ action: 'deny' }))
  wc.on('will-navigate', (e) => e.preventDefault())
  wc.on('will-frame-navigate', (e) => {
    if (!e.isMainFrame || !e.url.startsWith(`${RENDER_SCHEME}://`)) e.preventDefault()
  })
  wc.on('will-redirect', (e) => e.preventDefault())
  return win
}

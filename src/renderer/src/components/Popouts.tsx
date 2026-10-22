import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { PanelLeftClose } from 'lucide-react'
import { PANEL_TITLE, type PanelId } from '../dock/model'
import { useDock } from '../dock/store'
import { trackActiveDoc } from '../lib/windows'
import { trackThemedDoc } from '../lib/theme'

// Losgekoppelde panelen: een eigen venster (bijv. op een tweede scherm). Het paneel draait gewoon mee in
// de editor (zelfde project, selectie en tijd); alleen de weergave staat in het andere venster (React-portal).

type Bounds = { x: number; y: number; w: number; h: number }
const BOUNDS = 'bs-popout-bounds'
const loadBounds = (): Partial<Record<PanelId, Bounds>> => {
  try {
    return JSON.parse(localStorage.getItem(BOUNDS) ?? '{}') ?? {}
  } catch {
    return {}
  }
}
const saveBounds = (panel: PanelId, b: Bounds) => {
  try {
    localStorage.setItem(BOUNDS, JSON.stringify({ ...loadBounds(), [panel]: b }))
  } catch {
    /* alleen deze sessie */
  }
}
const DEFAULT_SIZE: Partial<Record<PanelId, [number, number]>> = { viewer: [900, 760], timeline: [1100, 360], code: [700, 700] }

/** Alle losgekoppelde panelen, elk in een eigen venster. */
export function Popouts({ render }: { render: (id: PanelId) => ReactNode }) {
  const detached = useDock((s) => s.detached)
  return (
    <>
      {detached.map((p) => (
        <PopoutWindow key={p} panel={p} render={render} />
      ))}
    </>
  )
}

function PopoutWindow({ panel, render }: { panel: PanelId; render: (id: PanelId) => ReactNode }) {
  const [root, setRoot] = useState<HTMLElement | null>(null)

  useEffect(() => {
    const b = loadBounds()[panel]
    const at = useDock.getState().detachAt[panel]
    const [w, h] = b ? [b.w, b.h] : (DEFAULT_SIZE[panel] ?? [380, 720])
    const pos = at ? { x: at.x - 60, y: at.y - 14 } : b ? { x: b.x, y: b.y } : null
    const features = `popup,width=${Math.round(w)},height=${Math.round(h)}${pos ? `,left=${Math.round(pos.x)},top=${Math.round(pos.y)}` : ''}`
    const pw = window.open('about:blank', `bs-panel-${panel}`, features)
    if (!pw) {
      useDock.getState().attach(panel)
      return
    }
    const doc = pw.document
    doc.title = `${PANEL_TITLE[panel]} – Bnnr Studio`
    // Zelfde stijlen en thema als de editor
    for (const n of document.querySelectorAll('style, link[rel="stylesheet"]')) {
      const c = n.cloneNode(true) as HTMLElement
      if (c instanceof HTMLLinkElement) c.href = (n as HTMLLinkElement).href
      doc.head.appendChild(c)
    }
    for (const a of document.documentElement.attributes) doc.documentElement.setAttribute(a.name, a.value)
    // Kleuren aanpassen in Instellingen werkt ook in dit venster
    const untheme = trackThemedDoc(doc)
    doc.body.className = `${document.body.className} popout-window`
    const el = doc.createElement('div')
    el.className = 'popout-root'
    doc.body.appendChild(el)
    trackActiveDoc(doc)

    // Sneltoetsen in het losse venster werken zoals in de editor (niet tijdens typen)
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      const copy = new KeyboardEvent('keydown', e)
      window.dispatchEvent(copy)
      if (copy.defaultPrevented) e.preventDefault()
    }
    pw.addEventListener('keydown', onKey)

    const remember = () => {
      if (!pw.closed) saveBounds(panel, { x: pw.screenX, y: pw.screenY, w: pw.outerWidth, h: pw.outerHeight })
    }
    const timer = setInterval(remember, 1500)
    // Dichtklikken van het venster meldt het hoofdproces (attachPanel), zodat afsluiten van de app
    // het paneel niet "terugzet": dan staat het de volgende keer weer los
    pw.addEventListener('pagehide', remember)
    setRoot(el)
    return () => {
      clearInterval(timer)
      remember()
      untheme()
      pw.removeEventListener('keydown', onKey)
      pw.close()
      setRoot(null)
    }
  }, [panel])

  if (!root) return null
  return createPortal(
    <div className="dock-tabs popout" data-panel={panel}>
      <div className="dock-head">
        <div className="dock-tab on">
          <span>{PANEL_TITLE[panel]}</span>
        </div>
        <span className="dock-head-space" />
        <button className="icon sm" title="Terug in de app zetten" onClick={() => useDock.getState().attach(panel)}>
          <PanelLeftClose size={13} />
        </button>
      </div>
      <div className="dock-body">{render(panel)}</div>
    </div>,
    root
  )
}

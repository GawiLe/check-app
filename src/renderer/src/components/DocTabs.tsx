import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ChevronDown, FolderOpen, Plus, X } from 'lucide-react'
import { openProject } from '../lib/actions'
import { closeDocument, docInfo, switchDocument, useDocs } from '../lib/documents'
import { useStore } from '../store'

/** Tabbladen met de geopende projecten, bovenaan het venster (zoals in een browser). */
export function DocTabs() {
  const docs = useDocs((s) => s.docs)
  const active = useDocs((s) => s.active)
  const project = useStore((s) => s.project)
  const dirty = useStore((s) => s.dirty)
  return (
    <div className="doc-tabs">
      {docs.map((d) => {
        const info = docInfo(d, { project, dirty })
        return (
          <div
            key={d.id}
            className={`doc-tab${d.id === active ? ' on' : ''}`}
            title={d.dir}
            onClick={() => void switchDocument(d.id)}
            onAuxClick={(e) => e.button === 1 && void closeDocument(d.id)}
          >
            <span className="doc-name">{info.name}</span>
            {info.dirty && <span className="doc-dirty" title="Niet opgeslagen" />}
            <button
              className="doc-close"
              title="Tabblad sluiten (Cmd/Ctrl+W)"
              onClick={(e) => {
                e.stopPropagation()
                void closeDocument(d.id)
              }}
            >
              <X size={11} />
            </button>
          </div>
        )
      })}
      {/* + = meteen een project kiezen (zoals een nieuw tabblad); het pijltje toont recente projecten */}
      <button className="icon doc-add" title="Project openen in een nieuw tabblad (Cmd/Ctrl+O)" onClick={() => void openProject()}>
        <Plus size={14} />
      </button>
      <OpenMenu className="icon doc-recent" title="Recente projecten">
        <ChevronDown size={12} />
      </OpenMenu>
    </div>
  )
}

/** Openen: map kiezen of een recent project, in een (nieuw) tabblad. */
export function OpenMenu(props: { children: ReactNode; title: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const docs = useDocs((s) => s.docs)
  const openDirs = docs.map((d) => d.dir)
  useEffect(() => {
    if (!open) return
    void window.bs.getSettings().then((s) => setRecent(s.recent))
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  const pick = (dir?: string) => {
    setOpen(false)
    void openProject(dir)
  }
  return (
    <div className="menu-wrap" ref={ref}>
      <button
        className={props.className ?? 'icon'}
        title={props.title}
        onClick={(e) => {
          // Vaste positie onder de knop: ook zichtbaar als de balk eromheen weinig ruimte heeft
          const r = e.currentTarget.getBoundingClientRect()
          setAt({ left: Math.max(4, Math.min(r.left, window.innerWidth - 270)), top: r.bottom + 4 })
          setOpen(!open)
        }}
      >
        {props.children}
      </button>
      {open && (
        <div className="menu open-menu" style={at ? { position: 'fixed', left: at.left, top: at.top, marginTop: 0 } : undefined}>
          <button onClick={() => pick()}>
            <FolderOpen size={14} /> Map kiezen…
          </button>
          <div className="ctx-sep" />
          <div className="menu-label">Recent</div>
          {recent.length ? (
            recent.map((d) => (
              <button key={d} onClick={() => pick(d)} title={d}>
                <span className="grow">{d.split(/[\\/]/).pop()}</span>
                {openDirs.includes(d) && <span className="meta">open</span>}
              </button>
            ))
          ) : (
            <div className="menu-label faint">Nog geen recente projecten</div>
          )}
        </div>
      )}
    </div>
  )
}


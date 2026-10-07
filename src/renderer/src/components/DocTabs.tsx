import { useEffect, useRef, useState, type ReactNode } from 'react'
import { FolderOpen, Plus, X } from 'lucide-react'
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
      <OpenMenu title="Project openen (ook recente)">
        <Plus size={14} />
      </OpenMenu>
    </div>
  )
}

/** Openen: map kiezen of een recent project, in een (nieuw) tabblad. */
export function OpenMenu(props: { children: ReactNode; title: string; className?: string }) {
  const [open, setOpen] = useState(false)
  const [recent, setRecent] = useState<string[]>([])
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
      <button className={props.className ?? 'icon'} title={props.title} onClick={() => setOpen(!open)}>
        {props.children}
      </button>
      {open && (
        <div className="menu open-menu">
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


import { useEffect, useRef, useState } from 'react'
import {
  BookmarkPlus,
  FilePlus2,
  FolderOpen,
  ImagePlus,
  Circle,
  LayoutGrid,
  MousePointer2,
  PanelsTopLeft,
  PenTool,
  MousePointerClick,
  Link2,
  Link2Off,
  PenLine,
  Plus,
  Redo2,
  Save,
  Settings,
  Square,
  Type,
  Undo2,
  Upload
} from 'lucide-react'
import { addLayer, importImages, openProject, regenerateWriteOn, renameComposition, save } from '../lib/actions'
import { InlineRename } from './ui'
import { ALL_PANELS, PANEL_TITLE, visiblePanels } from '../dock/model'
import { useDock } from '../dock/store'
import { useStore } from '../store'

export function Toolbar() {
  const project = useStore((s) => s.project)!
  const compId = useStore((s) => s.compId)
  const dirty = useStore((s) => s.dirty)
  const overview = useStore((s) => s.overview)
  const renaming = useStore((s) => s.renaming)
  const canUndo = useStore((s) => s.past.length > 0)
  const canRedo = useStore((s) => s.future.length > 0)
  const s = useStore.getState

  return (
    <div className="toolbar">
      <div className="group">
        <div className="brand">
          <div className="logo" />
        </div>
        <span className="project-name" title={project.name}>
          {project.name}
        </span>
        {dirty && <span className="dirty-dot" title="Niet opgeslagen" />}
        <div className="vsep" />
        <button className="icon" title="Nieuw project (Ctrl/Cmd+N)" onClick={() => s().setDialog('new')}>
          <FilePlus2 size={16} />
        </button>
        <button className="icon" title="Open project (Ctrl/Cmd+O)" onClick={() => openProject()}>
          <FolderOpen size={16} />
        </button>
        <button className="icon" title="Opslaan (Ctrl/Cmd+S)" disabled={!dirty} onClick={save}>
          <Save size={16} />
        </button>
        <button className="icon" title="Ongedaan maken" disabled={!canUndo} onClick={() => s().undo()}>
          <Undo2 size={16} />
        </button>
        <button className="icon" title="Opnieuw" disabled={!canRedo} onClick={() => s().redo()}>
          <Redo2 size={16} />
        </button>
        <div className="vsep" />
        <Tools />
        <AddMenu />
      </div>

      <div className="formats">
        <button
          className={overview ? 'on' : ''}
          title="Alle formaten naast elkaar"
          onClick={() => s().setOverview(!overview)}
        >
          <LayoutGrid size={14} /> Alle
        </button>
        {project.compositions.map((c) =>
          renaming === c.id ? (
            <InlineRename
              key={c.id}
              value={c.name}
              className="format-rename"
              onDone={(v) => {
                if (v) renameComposition(c.id, v)
                s().setRenaming(null)
              }}
            />
          ) : (
            <button
              key={c.id}
              className={!overview && c.id === compId ? 'on' : ''}
              onClick={() => {
                s().setComp(c.id)
                s().setOverview(false)
              }}
              onDoubleClick={() => s().setRenaming(c.id)}
              title={`${c.name} (${c.width}×${c.height}) · dubbelklik om de naam te wijzigen`}
            >
              {c.width}×{c.height}
              {!/^(basis )?\d+x\d+$/i.test(c.name) && <span className="format-name">{c.name}</span>}
              {c.id === project.baseCompositionId && <span className="base-mark">●</span>}
            </button>
          )
        )}
        <button className="icon sm" title="Formaat toevoegen" onClick={() => s().setDialog('addFormat')}>
          <Plus size={14} />
        </button>
        <button
          className={`icon sm${project.syncFormats ? ' on' : ''}`}
          title={
            project.syncFormats
              ? 'Formaten gekoppeld: tekst, kleuren, afbeeldingen en timing gelden voor alle formaten. Positie en maat per formaat.'
              : 'Formaten los: wijzigingen gelden alleen voor dit formaat.'
          }
          onClick={() => s().update((p) => void (p.syncFormats = !p.syncFormats))}
        >
          {project.syncFormats ? <Link2 size={14} /> : <Link2Off size={14} />}
        </button>
      </div>

      <div className="group end">
        <ClickTagField />
        <WindowMenu />
        <button className="icon" title="Opslaan als boilerplate" onClick={() => s().setDialog('saveBoilerplate')}>
          <BookmarkPlus size={16} />
        </button>
        <button className="icon" title="Instellingen" onClick={() => s().setDialog('settings')}>
          <Settings size={16} />
        </button>
        <div className="vsep" />
        <button className="primary" onClick={() => s().setDialog('export')}>
          <Upload size={14} /> Exporteren
        </button>
      </div>
    </div>
  )
}

function AddMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  const pick = (fn: () => void) => () => {
    setOpen(false)
    fn()
  }
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="ghost" onClick={() => setOpen(!open)}>
        <Plus size={14} /> Laag
      </button>
      {open && (
        <div className="menu">
          <button onClick={pick(() => addLayer('text'))}>
            <Type size={14} /> Tekst
          </button>
          <button onClick={pick(() => addLayer('shape'))}>
            <Square size={14} /> Vorm
          </button>
          <button
            onClick={pick(() => {
              const l = addLayer('writeon', (x) => {
                x.writeon!.fontId = useStore.getState().project?.fonts[0]?.id ?? null
                x.intro = { start: 0.3, duration: 1.2, ease: 'easeInOut', fade: false, dx: 0, dy: 0, scale: 1, rotation: 0, reveal: true }
              })
              if (l) void regenerateWriteOn(l.id)
            })}
          >
            <PenLine size={14} /> Write-on tekst
          </button>
          <button onClick={pick(importImages)}>
            <ImagePlus size={14} /> Afbeelding importeren…
          </button>
        </div>
      )}
    </div>
  )
}

/** De clickTag (landings-URL) altijd binnen handbereik; geldt voor alle formaten en exports. */
function ClickTagField() {
  const url = useStore((s) => s.project!.clickTag)
  const [v, setV] = useState(url)
  useEffect(() => setV(url), [url])
  const valid = /^https?:\/\/[^\s.]+\.[^\s]+$/.test(v.trim())
  const commit = () => v.trim() !== url && useStore.getState().update((p) => void (p.clickTag = v.trim()))
  return (
    <label className={`clicktag${valid ? '' : ' invalid'}`} title="clickTag-fallback: de landings-URL voor alle formaten. Het ad-server (CM360, Google Ads, GAM) vult bij uitserveren zijn eigen klik-URL in; deze URL wordt alleen gebruikt als dat niet gebeurt (bijv. bij lokaal testen).">
      <MousePointerClick size={14} />
      <input
        value={v}
        placeholder="https://landingspagina.nl"
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </label>
  )
}

/** Gereedschap op het canvas (zoals in After Effects). */
function Tools() {
  const tool = useStore((s) => s.tool)
  const set = useStore.getState().setTool
  const items = [
    { id: 'select', icon: <MousePointer2 size={15} />, title: 'Selecteren (V)' },
    { id: 'text', icon: <Type size={15} />, title: 'Tekst (T): klik op het canvas' },
    { id: 'rect', icon: <Square size={15} />, title: 'Rechthoek (R): sleep op het canvas, Shift = vierkant' },
    { id: 'ellipse', icon: <Circle size={15} />, title: 'Ellips (E): sleep op het canvas, Shift = cirkel' },
    { id: 'pen', icon: <PenTool size={15} />, title: 'Pen tool (G): klik voor punten, sleep voor bochten' }
  ] as const
  return (
    <div className="seg" style={{ marginRight: 4 }}>
      {items.map((i) => (
        <button key={i.id} className={`icon${tool === i.id ? ' on' : ''}`} title={i.title} onClick={() => set(i.id)}>
          {i.icon}
        </button>
      ))}
    </div>
  )
}

/** Venster-menu: panelen aan/uit zetten en de indeling herstellen (zoals in After Effects). */
function WindowMenu() {
  const [open, setOpen] = useState(false)
  const root = useDock((d) => d.root)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  const shown = visiblePanels(root)
  return (
    <div className="menu-wrap" ref={ref}>
      <button className="ghost" onClick={() => setOpen(!open)} title="Panelen tonen/verbergen en indeling">
        <PanelsTopLeft size={14} /> Venster
      </button>
      {open && (
        <div className="menu" style={{ right: 0 }}>
          {ALL_PANELS.map((p) => (
            <button key={p} onClick={() => useDock.getState().toggle(p, !shown.includes(p))}>
              <span style={{ width: 14, color: 'var(--accent)' }}>{shown.includes(p) ? '✓' : ''}</span>
              {PANEL_TITLE[p]}
            </button>
          ))}
          <div className="ctx-sep" />
          <button
            onClick={() => {
              useDock.getState().reset()
              setOpen(false)
            }}
          >
            <span style={{ width: 14 }} />
            Indeling herstellen
          </button>
          <div className="hint-text" style={{ padding: '4px 10px 6px', maxWidth: 230 }}>
            Sleep een tabblad naar een andere groep, of naar de rand van een paneel om het ernaast of eronder te zetten. Dubbelklik op een tab om te
            maximaliseren.
          </div>
        </div>
      )}
    </div>
  )
}

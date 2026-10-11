import { useEffect, useRef, useState } from 'react'
import {
  BookmarkPlus,
  ChevronDown,
  Copy,
  FilePlus2,
  FolderOpen,
  ImagePlus,
  Circle,
  MousePointer2,
  PanelsTopLeft,
  PenTool,
  MousePointerClick,
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
import { addClickArea, addLayer, importImages, regenerateWriteOn, save } from '../lib/actions'
import { OpenMenu } from './DocTabs'
import { AlignBar } from './AlignBar'
import { ALL_PANELS, PANEL_TITLE, visiblePanels } from '../dock/model'
import { useDock } from '../dock/store'
import { useStore } from '../store'

export function Toolbar() {
  const project = useStore((s) => s.project)!
  const compId = useStore((s) => s.compId)
  const dirty = useStore((s) => s.dirty)
  const selCount = useStore((s) => s.selection.length)
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
        <OpenMenu className="icon open-btn" title="Openen: map kiezen of een recent project (in een nieuw tabblad)">
          <FolderOpen size={16} />
          <ChevronDown size={10} />
        </OpenMenu>
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

      <div className="formats toolbar-align">
        <AlignBar count={selCount} inline />
      </div>

      <div className="group end">
        <ClickTagField />
        <WindowMenu />
        <button className="icon" title="Opslaan als boilerplate" onClick={() => s().setDialog('saveBoilerplate')}>
          <BookmarkPlus size={16} />
        </button>
        <button className="icon" title="Varianten: dit bestand als template, met per variant andere teksten en afbeeldingen" onClick={() => s().setDialog('variants')}>
          <Copy size={16} />
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
          <div className="ctx-sep" />
          <button onClick={pick(() => void addClickArea())} title="Eigen klik-URL (clickTag1, clickTag2 …) boven de algemene klik op de hele banner">
            <MousePointerClick size={14} /> Klikgebied
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
    { id: 'rect', icon: <Square size={15} />, title: 'Rechthoek (Q): sleep op het canvas, Shift = vierkant' },
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
  const detached = useDock((d) => d.detached)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  const shown = [...visiblePanels(root), ...detached]
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
              <span className="grow">{PANEL_TITLE[p]}</span>
              {detached.includes(p) && <span className="faint">eigen venster</span>}
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
            maximaliseren. Sleep een tab buiten de app (of klik ↗ rechtsboven in een paneel) voor een eigen venster, bijv. op een tweede scherm.
          </div>
        </div>
      )}
    </div>
  )
}

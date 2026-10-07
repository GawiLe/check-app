import { Fragment, useRef, useState, type ReactNode } from 'react'
import { Maximize2, Minimize2, X } from 'lucide-react'
import { PANEL_TITLE, type DockNode, type PanelId, type SplitNode, type TabsNode, type Zone } from './model'
import { useDock } from './store'

export const PANEL_DRAG = 'application/x-banner-panel'

/** Werkruimte: splitsingen en tabgroepen, zoals de panelen in After Effects. */
export function Dock({ render }: { render: (id: PanelId) => ReactNode }) {
  const root = useDock((s) => s.root)
  const maximized = useDock((s) => s.maximized)
  if (maximized)
    return (
      <div className="dock-max">
        <TabsView node={{ kind: 'tabs', id: 'max', panels: [maximized], active: maximized }} render={render} maximized />
      </div>
    )
  return <NodeView node={root} render={render} />
}

function NodeView({ node, render }: { node: DockNode; render: (id: PanelId) => ReactNode }) {
  if (node.kind === 'tabs') return <TabsView node={node} render={render} />
  return <SplitView node={node} render={render} />
}

function SplitView({ node, render }: { node: SplitNode; render: (id: PanelId) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  /** Scheidingslijn slepen: grootte van de twee buren aanpassen. */
  const startResize = (e: React.PointerEvent, i: number) => {
    e.preventDefault()
    // iframes (canvas-preview) mogen de muisbewegingen niet opslokken tijdens het slepen
    document.body.classList.add('dock-resizing', `dock-resizing-${node.dir}`)
    const rect = ref.current!.getBoundingClientRect()
    const total = node.dir === 'row' ? rect.width : rect.height
    const p0 = node.dir === 'row' ? e.clientX : e.clientY
    const s0 = [...node.sizes]
    const move = (ev: PointerEvent) => {
      const d = ((node.dir === 'row' ? ev.clientX : ev.clientY) - p0) / total
      const min = 0.06
      const a = Math.max(min, Math.min(s0[i] + s0[i + 1] - min, s0[i] + d))
      const sizes = [...s0]
      sizes[i] = a
      sizes[i + 1] = s0[i] + s0[i + 1] - a
      useDock.getState().resize(node.id, sizes)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      document.body.classList.remove('dock-resizing', 'dock-resizing-row', 'dock-resizing-col')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div ref={ref} className={`dock-split dock-${node.dir}`}>
      {node.children.map((c, i) => (
        <Fragment key={c.id}>
          <div className="dock-cell" style={{ flex: `${node.sizes[i]} 1 0px` }}>
            <NodeView node={c} render={render} />
          </div>
          {i < node.children.length - 1 && <div className={`dock-splitter dock-${node.dir}`} onPointerDown={(e) => startResize(e, i)} />}
        </Fragment>
      ))}
    </div>
  )
}

function zoneAt(e: React.DragEvent, el: HTMLElement): Zone {
  const r = el.getBoundingClientRect()
  const x = (e.clientX - r.left) / r.width
  const y = (e.clientY - r.top) / r.height
  const edge = 0.25
  const d = { left: x, right: 1 - x, top: y, bottom: 1 - y }
  const [best, v] = Object.entries(d).sort((a, b) => a[1] - b[1])[0] as [Zone, number]
  return v < edge ? best : 'center'
}

function TabsView({ node, render, maximized }: { node: TabsNode; render: (id: PanelId) => ReactNode; maximized?: boolean }) {
  const dock = useDock.getState
  const [zone, setZone] = useState<Zone | null>(null)
  const isPanelDrag = (e: React.DragEvent) => e.dataTransfer.types.includes(PANEL_DRAG)
  const onDrop = (e: React.DragEvent, z: Zone) => {
    const id = e.dataTransfer.getData(PANEL_DRAG) as PanelId
    setZone(null)
    if (!id || maximized) return
    e.preventDefault()
    dock().drop(id, node.id, z)
  }
  return (
    <div className="dock-tabs" data-panel={node.active}>
      <div
        className={`dock-head${zone === 'center' ? ' drop' : ''}`}
        onDragOver={(e) => {
          if (!isPanelDrag(e)) return
          e.preventDefault()
          setZone('center')
        }}
        onDragLeave={() => setZone(null)}
        onDrop={(e) => onDrop(e, 'center')}
      >
        {node.panels.map((p) => (
          <div
            key={p}
            className={`dock-tab${p === node.active ? ' on' : ''}`}
            draggable={!maximized}
            title="Sleep naar een andere groep of naar een rand · dubbelklik = maximaliseren"
            onDragStart={(e) => {
              e.dataTransfer.setData(PANEL_DRAG, p)
              e.dataTransfer.effectAllowed = 'move'
            }}
            onClick={() => dock().activate(p)}
            onDoubleClick={() => dock().setMaximized(maximized ? null : p)}
          >
            <span>{PANEL_TITLE[p]}</span>
            {!maximized && (
              <button
                className="dock-close"
                title={`${PANEL_TITLE[p]} sluiten (terug via Venster)`}
                onClick={(e) => {
                  e.stopPropagation()
                  dock().close(p)
                }}
              >
                <X size={11} />
              </button>
            )}
          </div>
        ))}
        <span className="dock-head-space" />
        <button
          className="icon sm dock-max-btn"
          title={maximized ? 'Terug naar de indeling' : 'Maximaliseren'}
          onClick={() => dock().setMaximized(maximized ? null : node.active)}
        >
          {maximized ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
        </button>
      </div>
      <div
        className="dock-body"
        onDragOver={(e) => {
          if (!isPanelDrag(e)) return
          e.preventDefault()
          setZone(zoneAt(e, e.currentTarget))
        }}
        onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setZone(null)}
        onDrop={(e) => isPanelDrag(e) && onDrop(e, zoneAt(e, e.currentTarget))}
      >
        {render(node.active)}
        {zone && zone !== 'center' && <div className={`dock-drop ${zone}`} />}
        {zone === 'center' && <div className="dock-drop center" />}
      </div>
    </div>
  )
}

/** ` (backtick) maximaliseert het paneel onder de muis, zoals in After Effects. */
let pointer = { x: 0, y: 0 }
if (typeof window !== 'undefined') window.addEventListener('pointermove', (e) => (pointer = { x: e.clientX, y: e.clientY }), { passive: true })
export function toggleMaximizeUnderPointer() {
  const d = useDock.getState()
  if (d.maximized) return d.setMaximized(null)
  const el = document.elementFromPoint(pointer.x, pointer.y)?.closest('[data-panel]') as HTMLElement | null
  if (el?.dataset.panel) d.setMaximized(el.dataset.panel as PanelId)
}

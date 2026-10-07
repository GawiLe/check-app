import { exitLayers } from '@shared/build'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus, Star } from 'lucide-react'
import { layerStateAt, restStateAt } from '@shared/anim'
import { buildBanner } from '@shared/build'
import type { Composition, Layer, Project } from '@shared/types'
import { anchorOf } from '@shared/geometry'
import type { PenPoint } from '@shared/path'
import { activeAt, findDeep, localTime } from '@shared/tree'
import { addPenShape, addShapeRect, addTextAt, applyLibrary, importDroppedFiles, openComp, setAnchor } from '../lib/actions'
import { openEmptyMenu, openLayerMenu } from '../lib/menus'
import { assetUrl, currentComp, setLayerValue, updateLayer, useStore } from '../store'
import { DRAG_TYPE } from './Library'

/**
 * De echte banner-HTML (zelfde builder als de export) in een iframe. Twee iframes
 * wisselen elkaar af zodat herladen niet flikkert; de tijd gaat via postMessage.
 */
function BannerFrame(props: { project: Project; comp: Composition; time: number; zoom: number; rev: number }) {
  const { project, comp, time, zoom, rev } = props
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)]
  const active = useRef(0)
  const timeRef = useRef(time)
  timeRef.current = time

  const html = useMemo(() => {
    const fontSrc = Object.fromEntries(project.fonts.map((f) => [f.id, `url("${assetUrl(f.file, rev)}")`]))
    return buildBanner(project, comp, {
      mode: 'preview',
      target: project.targets[0] ?? 'cm360',
      assetUrl: (p) => assetUrl(p, rev),
      fontSrc
    }).html
    // project.fonts en comp zijn genoeg; de rest van het project raakt de HTML niet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.fonts, project.name, project.clickTag, comp, rev])

  useEffect(() => {
    const t = setTimeout(() => {
      const next = 1 - active.current
      const f = frames[next].current
      if (!f) return
      f.onload = () => {
        const seek = () => f.contentWindow?.postMessage({ bs: 'seek', t: timeRef.current }, '*')
        seek()
        setTimeout(() => {
          seek()
          f.style.visibility = 'visible'
          const old = frames[active.current].current
          if (old && old !== f) old.style.visibility = 'hidden'
          active.current = next
        }, 40)
      }
      f.srcdoc = html
    }, 30)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html])

  useEffect(() => {
    frames[active.current].current?.contentWindow?.postMessage({ bs: 'seek', t: time }, '*')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [time])

  return (
    <>
      {frames.map((ref, i) => (
        <iframe
          key={i}
          ref={ref}
          sandbox="allow-scripts"
          title={`${comp.name}-${i}`}
          width={comp.width}
          height={comp.height}
          style={{ transform: `scale(${zoom})`, visibility: i === 0 ? 'visible' : 'hidden' }}
        />
      ))}
    </>
  )
}

export function Viewer() {
  const overview = useStore((s) => s.overview)
  return overview ? <Overview /> : <SingleViewer />
}

/** Alle formaten naast elkaar, synchroon afspelend. Klik om dat formaat te bewerken. */
function Overview() {
  const project = useStore((s) => s.project)!
  const compId = useStore((s) => s.compId)
  const time = useStore((s) => s.time)
  const rev = useStore((s) => s.assetsRev)
  const maxH = 420
  return (
    <div className="viewer">
      <div className="overview">
        {project.compositions.map((c) => {
          const z = Math.min(1, maxH / c.height, 560 / c.width)
          return (
            <div
              key={c.id}
              className={`tile${c.id === compId ? ' active' : ''}`}
              onClick={() => {
                useStore.getState().setComp(c.id)
                useStore.getState().setOverview(false)
              }}
            >
              <div className="cap">
                {c.id === project.baseCompositionId && <Star size={11} />}
                {c.width}×{c.height}
                {z < 1 && <span className="faint">{Math.round(z * 100)}%</span>}
              </div>
              <div className="frame" style={{ width: c.width * z, height: c.height * z }}>
                <BannerFrame project={project} comp={c} time={Math.min(time, c.duration)} zoom={z} rev={rev} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Een laag op het canvas: positie van het anchor point in de wereld, totale schaal en rotatie. */
interface Box {
  layer: Layer
  ax: number
  ay: number
  /** Anchor point in canvas-coördinaten. */
  wx: number
  wy: number
  scale: number
  scaleY: number
  rotation: number
  /** Schaal en rotatie van de bovenliggende composities (voor slepen). */
  parentScale: number
  parentRot: number
  ancestors: Layer[]
}

type Mapper = (x: number, y: number) => [number, number]
const rad = (d: number) => (d * Math.PI) / 180

function boxesAt(layers: Layer[], t: number): Box[] {
  const out: Box[] = []
  const visit = (list: Layer[], lt: number, map: Mapper, ps: number, pr: number, ancestors: Layer[]) => {
    for (const l of list) {
      if (!l.visible || !activeAt(l, lt)) continue
      const st = layerStateAt(l, lt)
      const { ax, ay } = anchorOf(l)
      const [wx, wy] = map(st.x + ax * l.width, st.y + ay * l.height)
      out.push({ layer: l, ax, ay, wx, wy, scale: st.scale * ps, scaleY: st.scaleY * ps, rotation: st.rotation + pr, parentScale: ps, parentRot: pr, ancestors })
      if (l.children) {
        const r = rad(st.rotation)
        const ox = st.x + ax * l.width
        const oy = st.y + ay * l.height
        const inner: Mapper = (x, y) => {
          const dx = (x - ax * l.width) * st.scale
          const dy = (y - ay * l.height) * st.scaleY
          return map(ox + dx * Math.cos(r) - dy * Math.sin(r), oy + dx * Math.sin(r) + dy * Math.cos(r))
        }
        visit(l.children, lt - (l.start ?? 0), inner, st.scale * ps, st.rotation + pr, [...ancestors, l])
      }
    }
  }
  visit(layers, t, (x, y) => [x, y], 1, 0, [])
  return out
}

/** Canvaspunt → coördinaat binnen het kader van de laag (0..breedte, 0..hoogte). */
function toLocal(b: Box, x: number, y: number): [number, number] {
  // Eerst terugdraaien, dan terugschalen (wereld = anchor + R·S·lokaal)
  const r = rad(-b.rotation)
  const dx = x - b.wx
  const dy = y - b.wy
  const u = (dx * Math.cos(r) - dy * Math.sin(r)) / (b.scale || 1e-6)
  const v = (dx * Math.sin(r) + dy * Math.cos(r)) / (b.scaleY || 1e-6)
  return [u + b.ax * b.layer.width, v + b.ay * b.layer.height]
}

const inside = (b: Box, x: number, y: number) => {
  const [u, v] = toLocal(b, x, y)
  return u >= 0 && u <= b.layer.width && v >= 0 && v <= b.layer.height
}

type Drag =
  | { kind: 'move'; x: number; y: number; start: { id: string; x: number; y: number; ps: number; pr: number }[] }
  | { kind: 'resize'; x: number; y: number; id: string; w: number; h: number; ratio: number; box: Box }
  | { kind: 'anchor'; box: Box }
  | { kind: 'draw'; tool: 'rect' | 'ellipse'; x: number; y: number; x2: number; y2: number }
  | { kind: 'pen-handle'; index: number }

function SingleViewer() {
  const project = useStore((s) => s.project)!
  const comp = useStore(currentComp)!
  const zoom = useStore((s) => s.zoom)
  const time = useStore((s) => s.time)
  const rev = useStore((s) => s.assetsRev)
  const selection = useStore((s) => s.selection)
  const tool = useStore((s) => s.tool)
  const activeTab = useStore((s) => s.activeTab)
  const editingText = useStore((s) => s.editingText)
  const [hover, setHover] = useState<string | null>(null)
  const [, force] = useState(0)
  const drag = useRef<Drag | null>(null)
  const pen = useRef<PenPoint[]>([])
  const [penCursor, setPenCursor] = useState<[number, number] | null>(null)

  const boxes = boxesAt(comp.layers, time)
  const boxOf = (id: string) => boxes.find((b) => b.layer.id === id)
  const ctxGroup = activeTab ? findDeep(comp.layers, activeTab)?.layer : null
  // Alleen lagen in de lijst waarin je werkt zijn klikbaar (formaat of geopende compositie).
  const ctxList = ctxGroup?.children ?? comp.layers
  const candidates = boxes.filter((b) => !b.layer.locked && ctxList.includes(b.layer))

  const toComp = (e: { clientX: number; clientY: number }) => {
    const r = overlayRef.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }
  }
  const hitTest = (x: number, y: number): Layer | null => {
    for (const b of candidates) if (inside(b, x, y)) return b.layer
    return null
  }

  const startMove = (sel: string[], p: { x: number; y: number }) => {
    const start = sel
      .map((id) => {
        const f = findDeep(comp.layers, id)
        const b = boxOf(id)
        if (!f || !b || f.layer.locked) return null
        const st = restStateAt(f.layer, localTime(time, f.ancestors))
        const anim = (q: 'x' | 'y') => !!f.layer.tracks[q]?.length
        return { id, x: anim('x') ? st.x : f.layer.x, y: anim('y') ? st.y : f.layer.y, ps: b.parentScale, pr: b.parentRot }
      })
      .filter((x): x is { id: string; x: number; y: number; ps: number; pr: number } => !!x)
    drag.current = { kind: 'move', x: p.x, y: p.y, start }
  }

  const finishPen = (closed: boolean) => {
    if (pen.current.length >= 2) addPenShape(pen.current, closed)
    pen.current = []
    setPenCursor(null)
    force((n) => n + 1)
  }

  // Pen tool: Enter = open vorm afronden, Escape = annuleren
  useEffect(() => {
    if (tool !== 'pen') return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Enter') finishPen(false)
      if (e.key === 'Escape') {
        pen.current = []
        setPenCursor(null)
        useStore.getState().setTool('select')
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool])

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    const s = useStore.getState()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = toComp(e)

    if (tool === 'rect' || tool === 'ellipse') {
      drag.current = { kind: 'draw', tool, x: p.x, y: p.y, x2: p.x, y2: p.y }
      return
    }
    if (tool === 'text') {
      addTextAt(p.x, p.y)
      return
    }
    if (tool === 'pen') {
      const first = pen.current[0]
      if (first && pen.current.length >= 2 && Math.hypot(first.x - p.x, first.y - p.y) < 8 / zoom) {
        finishPen(true)
        return
      }
      pen.current = [...pen.current, { x: Math.round(p.x), y: Math.round(p.y) }]
      drag.current = { kind: 'pen-handle', index: pen.current.length - 1 }
      force((n) => n + 1)
      return
    }

    // Selecteren
    const hit = hitTest(p.x, p.y)
    if (!hit) {
      s.select([])
      s.setEditingText(null)
      return
    }
    let sel = selection
    if (e.shiftKey) sel = selection.includes(hit.id) ? selection.filter((i) => i !== hit.id) : [...selection, hit.id]
    else if (!selection.includes(hit.id)) sel = [hit.id]
    if (editingText && editingText !== hit.id) s.setEditingText(null)
    s.select(sel)
    startMove(sel, p)
  }

  const onMove = (e: React.PointerEvent) => {
    const p = toComp(e)
    let d = drag.current
    if (tool === 'pen') setPenCursor([p.x, p.y])
    // Knop is al los (bijv. losgelaten buiten het venster): sleepactie afbreken in plaats van te blijven volgen
    if (d && e.buttons === 0) {
      cancelDrag()
      d = null
    }
    if (!d) {
      if (tool === 'select') setHover(hitTest(p.x, p.y)?.id ?? null)
      return
    }
    switch (d.kind) {
      case 'move':
        for (const st of d.start) {
          // Verschuiving omrekenen naar de ruimte van de compositie waar de laag in zit
          const r = rad(-st.pr)
          const wx = (p.x - d.x) / st.ps
          const wy = (p.y - d.y) / st.ps
          setLayerValue(st.id, 'x', Math.round(st.x + wx * Math.cos(r) - wy * Math.sin(r)), 'move')
          setLayerValue(st.id, 'y', Math.round(st.y + wx * Math.sin(r) + wy * Math.cos(r)), 'move')
        }
        break
      case 'resize': {
        const [u, v] = toLocal(d.box, p.x, p.y)
        const w = Math.max(4, Math.round(u))
        const h = e.shiftKey || d.box.layer.sizeLinked ? Math.round(w / d.ratio) : Math.max(4, Math.round(v))
        updateLayer(d.id, (l) => void Object.assign(l, { width: w, height: h }), 'resize')
        break
      }
      case 'anchor': {
        const [u, v] = toLocal(d.box, p.x, p.y)
        let ax = u / d.box.layer.width
        let ay = v / d.box.layer.height
        // Klikt vast op hoeken, randen en midden
        for (const s of [0, 0.5, 1]) {
          if (Math.abs(ax - s) < 0.06) ax = s
          if (Math.abs(ay - s) < 0.06) ay = s
        }
        setAnchor(d.box.layer.id, ax, ay, 'anchor')
        break
      }
      case 'draw':
        d.x2 = p.x
        d.y2 = e.shiftKey ? d.y + Math.sign(p.y - d.y || 1) * Math.abs(p.x - d.x) : p.y
        force((n) => n + 1)
        break
      case 'pen-handle': {
        const pt = pen.current[d.index]
        if (Math.hypot(p.x - pt.x, p.y - pt.y) > 3 / zoom) {
          pen.current[d.index] = { ...pt, hx: Math.round(p.x), hy: Math.round(p.y) }
          force((n) => n + 1)
        }
        break
      }
    }
  }

  /** Sleepactie afbreken zonder iets toe te passen (focus kwijt, pointer geannuleerd). */
  const cancelDrag = () => {
    if (!drag.current) return
    drag.current = null
    force((n) => n + 1)
  }

  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (d?.kind === 'draw') {
      const x = Math.min(d.x, d.x2)
      const y = Math.min(d.y, d.y2)
      const w = Math.abs(d.x2 - d.x)
      const h = Math.abs(d.y2 - d.y)
      // Alleen klikken (niet slepen): standaardmaat
      if (w < 4 && h < 4) addShapeRect(d.tool, d.x - 50, d.y - 50, 100, 100)
      else addShapeRect(d.tool, x, y, w, h)
    }
  }

  /** Dubbelklik: compositie openen in een eigen tab, of tekst op het canvas bewerken. */
  const onDouble = (e: React.MouseEvent) => {
    if (tool !== 'select') return
    const p = toComp(e)
    const hit = hitTest(p.x, p.y)
    if (!hit) return
    const s = useStore.getState()
    if (hit.type === 'group') openComp(hit.id)
    else if (hit.type === 'text') {
      s.select([hit.id])
      s.setEditingText(hit.id)
    }
  }

  const onContext = (e: React.MouseEvent) => {
    if (tool === 'pen') {
      e.preventDefault()
      finishPen(false)
      return
    }
    const hit = hitTest(...(Object.values(toComp(e)) as [number, number]))
    if (hit) openLayerMenu(e, hit.id)
    else openEmptyMenu(e)
  }

  const startResize = (e: React.PointerEvent, b: Box) => {
    e.stopPropagation()
    overlayRef.current!.setPointerCapture(e.pointerId)
    const p = toComp(e)
    drag.current = { kind: 'resize', x: p.x, y: p.y, id: b.layer.id, w: b.layer.width, h: b.layer.height, ratio: b.layer.width / b.layer.height, box: b }
  }
  const startAnchor = (e: React.PointerEvent, b: Box) => {
    e.stopPropagation()
    overlayRef.current!.setPointerCapture(e.pointerId)
    drag.current = { kind: 'anchor', box: b }
  }

  /** Kader van een laag: exact gedraaid en geschaald rond het anchor point. */
  const frameStyle = (b: Box): React.CSSProperties => ({
    width: b.layer.width * zoom,
    height: b.layer.height * zoom,
    transformOrigin: `${b.ax * 100}% ${b.ay * 100}%`,
    transform: `translate(${(b.wx - b.ax * b.layer.width) * zoom}px,${(b.wy - b.ay * b.layer.height) * zoom}px) rotate(${b.rotation}deg) scale(${b.scale},${b.scaleY})`
  })

  const box = (b: Box, cls: string, handles: boolean) => (
    <div key={cls + b.layer.id} className={`sel ${cls}${b.layer.type === 'group' ? ' group' : ''}`} style={frameStyle(b)}>
      {handles && (
        <>
          <div className="size-label" style={{ transform: `scale(${1 / (b.scale || 1)},${1 / (b.scaleY || 1)})`, transformOrigin: '0 100%' }}>
            {b.layer.type === 'group' ? `${b.layer.name} · ` : ''}
            {Math.round(b.layer.width)} × {Math.round(b.layer.height)}
          </div>
          <div className="handle" style={{ transform: `scale(${1 / (b.scale || 1)},${1 / (b.scaleY || 1)})` }} onPointerDown={(e) => startResize(e, b)} />
        </>
      )}
    </div>
  )

  const selected = selection.map(boxOf).filter((b): b is Box => !!b)
  const hovered = hover && !selection.includes(hover) ? boxOf(hover) : undefined
  const single = selected.length === 1 && !selected[0].layer.locked ? selected[0] : null
  const editBox = editingText ? boxOf(editingText) : undefined
  const d = drag.current
  const setZoom = useStore.getState().setZoom
  const overlayRef = useRef<HTMLDivElement>(null)

  // "Passend" blijft actief tot je zelf zoomt; dan volgt het canvas ook als je panelen versleept.
  const viewerRef = useRef<HTMLDivElement>(null)
  const fitMode = useRef(true)
  const fit = () => {
    const el = viewerRef.current
    if (!el) return
    fitMode.current = true
    setZoom(Math.min(1, (el.clientWidth - 64) / comp.width, (el.clientHeight - 64) / comp.height))
  }
  const zoomTo = (z: number) => {
    fitMode.current = false
    setZoom(z)
  }
  useEffect(fit, [comp.id]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const el = viewerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => fitMode.current && fit())
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.id, comp.width, comp.height])

  const ctxBox = ctxGroup ? boxOf(ctxGroup.id) : undefined
  const penPts = pen.current

  return (
    <div ref={viewerRef} className={`viewer tool-${tool}`} onWheel={(e) => (e.ctrlKey || e.metaKey) && zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 0.9))}>
      <div className="stage-wrap">
        <div className="stage" style={{ width: comp.width * zoom, height: comp.height * zoom }}>
          <BannerFrame project={project} comp={comp} time={time} zoom={zoom} rev={rev} />
          <div
            ref={overlayRef}
            className="overlay"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={cancelDrag}
            onLostPointerCapture={cancelDrag}
            onPointerLeave={() => setHover(null)}
            onContextMenu={onContext}
            onDoubleClick={onDouble}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes('Files')) {
                e.preventDefault()
                e.dataTransfer.dropEffect = 'copy'
                return
              }
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              const p = toComp(e)
              setHover(hitTest(p.x, p.y)?.id ?? null)
            }}
            onDragLeave={() => setHover(null)}
            onDrop={(e) => {
              if (e.dataTransfer.files.length) {
                e.preventDefault()
                void importDroppedFiles(e.dataTransfer.files, toComp(e))
                return
              }
              const id = e.dataTransfer.getData(DRAG_TYPE)
              if (!id) return
              e.preventDefault()
              const p = toComp(e)
              const hit = hitTest(p.x, p.y)
              setHover(null)
              const targets = hit ? [hit.id] : selection
              if (targets.length) applyLibrary(id, targets)
              else useStore.getState().setStatus('Laat de animatie los op een laag.', 'error')
            }}
          >
            {ctxBox && <div className="sel context" style={frameStyle(ctxBox)} />}
            {/* Klikgebieden: altijd zichtbaar als gestippeld kader met hun clickTag-nummer */}
            {exitLayers(comp).map((l, i) => {
              const b = boxes.find((x) => x.layer.id === l.id)
              return (
                b && (
                  <div key={'x' + l.id} className="exit-frame" style={frameStyle(b)}>
                    <span style={{ transform: `scale(${1 / (b.scale || 1)},${1 / (b.scaleY || 1)})` }}>clickTag{i + 1}</span>
                  </div>
                )
              )
            })}
            {hovered && box(hovered, 'hover', false)}
            {selected.map((b) => box(b, '', !!single && b === single))}
            {single && tool === 'select' && !editBox && (
              <div
                className="anchor"
                title="Anchor point: sleep om het draaipunt te verplaatsen"
                style={{ left: single.wx * zoom, top: single.wy * zoom }}
                onPointerDown={(e) => startAnchor(e, single)}
              />
            )}
            {d?.kind === 'draw' && (
              <div
                className={`draw-preview ${d.tool}`}
                style={{
                  left: Math.min(d.x, d.x2) * zoom,
                  top: Math.min(d.y, d.y2) * zoom,
                  width: Math.abs(d.x2 - d.x) * zoom,
                  height: Math.abs(d.y2 - d.y) * zoom
                }}
              />
            )}
            {tool === 'pen' && penPts.length > 0 && (
              <svg className="pen-preview" width={comp.width * zoom} height={comp.height * zoom}>
                <path
                  d={penPreviewPath([...penPts, ...(penCursor && !drag.current ? [{ x: penCursor[0], y: penCursor[1] }] : [])], zoom)}
                  fill="none"
                />
                {penPts.map((p, i) => (
                  <g key={i}>
                    {p.hx != null && (
                      <>
                        <line x1={(2 * p.x - p.hx) * zoom} y1={(2 * p.y - p.hy!) * zoom} x2={p.hx * zoom} y2={p.hy! * zoom} className="pen-handle-line" />
                        <circle cx={p.hx * zoom} cy={p.hy! * zoom} r={3} className="pen-handle" />
                      </>
                    )}
                    <rect x={p.x * zoom - 4} y={p.y * zoom - 4} width={8} height={8} className={`pen-point${i === 0 && penPts.length > 1 ? ' first' : ''}`} />
                  </g>
                ))}
              </svg>
            )}
            {editBox && <TextEditor box={editBox} zoom={zoom} project={project} />}
          </div>
        </div>
      </div>
      {tool === 'pen' && (
        <div className="tool-hint">Klik voor punten, sleep voor een bocht. Klik op het eerste punt om te sluiten, Enter of rechtermuisknop voor een open lijn, Esc om te stoppen.</div>
      )}
      {ctxGroup && <div className="tool-hint top">Compositie "{ctxGroup.name}" geopend: je bewerkt de lagen hierin. Klik op het formaat-tabblad onder om terug te gaan.</div>}
      <div className="floating">
        <button className="icon sm" title="Uitzoomen" onClick={() => zoomTo(zoom / 1.25)}>
          <Minus size={14} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon sm" title="Inzoomen" onClick={() => zoomTo(zoom * 1.25)}>
          <Plus size={14} />
        </button>
        <button className="icon sm" title="Passend" onClick={fit}>
          <Maximize size={13} />
        </button>
        <button className="icon sm" title="100%" onClick={() => zoomTo(1)} style={{ width: 'auto', padding: '0 6px', fontSize: 11 }}>
          1:1
        </button>
      </div>
    </div>
  )
}

function penPreviewPath(pts: PenPoint[], z: number) {
  if (!pts.length) return ''
  const P = (x: number, y: number) => `${x * z} ${y * z}`
  let d = `M${P(pts[0].x, pts[0].y)}`
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a.hx == null && b.hx == null) d += `L${P(b.x, b.y)}`
    else {
      const o = a.hx != null ? [a.hx, a.hy!] : [a.x, a.y]
      const n = b.hx != null ? [2 * b.x - b.hx, 2 * b.y - b.hy!] : [b.x, b.y]
      d += `C${P(o[0], o[1])} ${P(n[0], n[1])} ${P(b.x, b.y)}`
    }
  }
  return d
}

/** Tekst direct op het canvas bewerken (dubbelklik op een tekstlaag). */
function TextEditor({ box, zoom, project }: { box: Box; zoom: number; project: Project }) {
  const l = box.layer
  const t = l.text!
  const [value, setValue] = useState(t.content)
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const font = project.fonts.find((f) => f.id === t.fontId)
  const commit = () => {
    if (value !== t.content) updateLayer(l.id, (x) => void (x.text!.content = value))
    useStore.getState().setEditingText(null)
  }
  return (
    <textarea
      ref={ref}
      className="text-editor"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) {
          e.preventDefault()
          ;(e.target as HTMLTextAreaElement).blur()
        }
      }}
      style={{
        width: l.width * zoom,
        height: l.height * zoom,
        transformOrigin: `${box.ax * 100}% ${box.ay * 100}%`,
        transform: `translate(${(box.wx - box.ax * l.width) * zoom}px,${(box.wy - box.ay * l.height) * zoom}px) rotate(${box.rotation}deg) scale(${box.scale},${box.scaleY})`,
        fontFamily: font?.system ? font.family : font ? `${font.family}, Arial` : 'Arial, Helvetica, sans-serif',
        fontSize: t.size * zoom,
        fontWeight: t.weight,
        lineHeight: t.lineHeight,
        letterSpacing: t.letterSpacing * zoom,
        textAlign: t.align,
        color: t.color
      }}
    />
  )
}

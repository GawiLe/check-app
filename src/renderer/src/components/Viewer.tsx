import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus, Star } from 'lucide-react'
import { layerStateAt } from '@shared/anim'
import { buildBanner } from '@shared/build'
import type { Composition, Layer, Project } from '@shared/types'
import { applyLibrary } from '../lib/actions'
import { activeAt, findDeep, localTime } from '@shared/tree'
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

/** Positie van een laag op het canvas, ook als hij in (geneste) groepen zit. */
interface Box {
  layer: Layer
  cx: number
  cy: number
  scale: number
  rotation: number
  /** Gezamenlijke schaal van de bovenliggende groepen (voor slepen). */
  parentScale: number
  depth: number
}

function boxesAt(layers: Layer[], t: number): Box[] {
  const out: Box[] = []
  const visit = (list: Layer[], lt: number, map: (x: number, y: number) => [number, number], ps: number, pr: number, depth: number) => {
    for (const l of list) {
      if (!l.visible || !activeAt(l, lt)) continue
      const st = layerStateAt(l, lt)
      const [cx, cy] = map(st.x + l.width / 2, st.y + l.height / 2)
      out.push({ layer: l, cx, cy, scale: st.scale * ps, rotation: st.rotation + pr, parentScale: ps, depth })
      if (l.children) {
        const gs = st.scale * ps
        const ox = st.x
        const oy = st.y
        const hw = l.width / 2
        const hh = l.height / 2
        const inner = (x: number, y: number) => map(ox + hw + (x - hw) * st.scale, oy + hh + (y - hh) * st.scale)
        visit(l.children, lt - (l.start ?? 0), inner, gs, st.rotation + pr, depth + 1)
      }
    }
  }
  visit(layers, t, (x, y) => [x, y], 1, 0, 0)
  return out
}

function SingleViewer() {
  const project = useStore((s) => s.project)!
  const comp = useStore(currentComp)!
  const zoom = useStore((s) => s.zoom)
  const time = useStore((s) => s.time)
  const rev = useStore((s) => s.assetsRev)
  const selection = useStore((s) => s.selection)
  const [hover, setHover] = useState<string | null>(null)
  const drag = useRef<
    | { kind: 'move'; x: number; y: number; start: { id: string; x: number; y: number; ps: number }[] }
    | { kind: 'resize'; x: number; y: number; id: string; w: number; h: number; ratio: number; ps: number }
    | null
  >(null)

  const boxes = boxesAt(comp.layers, time)
  const boxOf = (id: string) => boxes.find((b) => b.layer.id === id)

  const toComp = (e: { clientX: number; clientY: number; currentTarget: EventTarget }) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }
  }

  const inside = (b: Box, x: number, y: number) => {
    const w = (b.layer.width * b.scale) / 2
    const h = (b.layer.height * b.scale) / 2
    return x >= b.cx - w && x <= b.cx + w && y >= b.cy - h && y <= b.cy + h
  }

  /**
   * Klikken pakt de bovenste laag op het hoogste niveau (een groep als geheel).
   * Ben je al "in" een groep (een laag erin geselecteerd), of dubbelklik je, dan
   * pak je de lagen binnen die groep.
   */
  const hitTest = (x: number, y: number, deep = false): Layer | null => {
    const sel = selection[0] ? findDeep(comp.layers, selection[0]) : null
    const ctx = sel?.ancestors.length ? sel.ancestors[sel.ancestors.length - 1] : null
    const candidates = boxes.filter((b) => !b.layer.locked)
    if (deep || ctx) {
      // Lagen in de huidige groep (of diepste niveau bij dubbelklik), bovenste eerst
      const inner = candidates
        .filter((b) => (deep ? b.depth > 0 : ctx && findDeep(ctx.children ?? [], b.layer.id)?.list === ctx.children))
        .filter((b) => b.layer.type !== 'group' || !deep)
      for (const b of inner) if (inside(b, x, y)) return b.layer
    }
    for (const b of candidates) if (b.depth === 0 && inside(b, x, y)) return b.layer
    return null
  }

  const startMove = (sel: string[], p: { x: number; y: number }) => {
    const start = sel
      .map((id) => {
        const f = findDeep(comp.layers, id)
        const b = boxOf(id)
        if (!f || !b || f.layer.locked) return null
        const lt = localTime(time, f.ancestors)
        const st = layerStateAt(f.layer, lt)
        const anim = (q: 'x' | 'y') => !!f.layer.tracks[q]?.length
        return { id, x: anim('x') ? st.x : f.layer.x, y: anim('y') ? st.y : f.layer.y, ps: b.parentScale }
      })
      .filter((x): x is { id: string; x: number; y: number; ps: number } => !!x)
    drag.current = { kind: 'move', x: p.x, y: p.y, start }
  }

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = toComp(e)
    const hit = hitTest(p.x, p.y, e.detail >= 2)
    const s = useStore.getState()
    if (!hit) {
      s.select([])
      return
    }
    let sel = selection
    if (e.shiftKey) sel = selection.includes(hit.id) ? selection.filter((i) => i !== hit.id) : [...selection, hit.id]
    else if (!selection.includes(hit.id)) sel = [hit.id]
    s.select(sel)
    startMove(sel, p)
  }

  const onMove = (e: React.PointerEvent) => {
    const p = toComp(e)
    const d = drag.current
    if (!d) {
      setHover(hitTest(p.x, p.y)?.id ?? null)
      return
    }
    if (d.kind === 'move') {
      for (const st of d.start) {
        const dx = Math.round((p.x - d.x) / st.ps)
        const dy = Math.round((p.y - d.y) / st.ps)
        setLayerValue(st.id, 'x', st.x + dx, 'move')
        setLayerValue(st.id, 'y', st.y + dy, 'move')
      }
    } else {
      const w = Math.max(4, Math.round(d.w + (p.x - d.x) / d.ps))
      const h = e.shiftKey ? Math.round(w / d.ratio) : Math.max(4, Math.round(d.h + (p.y - d.y) / d.ps))
      updateLayer(
        d.id,
        (l) => {
          l.width = w
          l.height = h
        },
        'resize'
      )
    }
  }

  const startResize = (e: React.PointerEvent, b: Box) => {
    e.stopPropagation()
    const overlay = (e.currentTarget as HTMLElement).closest('.overlay') as HTMLElement
    overlay.setPointerCapture(e.pointerId)
    const r = overlay.getBoundingClientRect()
    drag.current = {
      kind: 'resize',
      x: (e.clientX - r.left) / zoom,
      y: (e.clientY - r.top) / zoom,
      id: b.layer.id,
      w: b.layer.width,
      h: b.layer.height,
      ratio: b.layer.width / b.layer.height,
      ps: b.parentScale
    }
  }

  const box = (b: Box, cls: string, handle: boolean) => {
    const l = b.layer
    return (
      <div
        key={cls + l.id}
        className={`sel ${cls}${l.type === 'group' ? ' group' : ''}`}
        style={{
          width: l.width * zoom,
          height: l.height * zoom,
          transform: `translate(${(b.cx - l.width / 2) * zoom}px,${(b.cy - l.height / 2) * zoom}px) rotate(${b.rotation}deg) scale(${b.scale})`
        }}
      >
        {handle && (
          <>
            <div className="size-label">
              {l.type === 'group' ? `${l.name} · ` : ''}
              {Math.round(l.width)} × {Math.round(l.height)}
            </div>
            <div className="handle" onPointerDown={(e) => startResize(e, b)} />
          </>
        )}
      </div>
    )
  }

  const selected = selection.map(boxOf).filter((b): b is Box => !!b)
  const hovered = hover && !selection.includes(hover) ? boxOf(hover) : undefined
  const setZoom = useStore.getState().setZoom

  // Bij openen of wisselen van formaat: passend inzoomen (max. 100%).
  const viewerRef = useRef<HTMLDivElement>(null)
  // "Passend" blijft actief tot je zelf zoomt; dan volgt het canvas ook als je panelen versleept.
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

  return (
    <div ref={viewerRef} className="viewer" onWheel={(e) => (e.ctrlKey || e.metaKey) && zoomTo(zoom * (e.deltaY < 0 ? 1.1 : 0.9))}>
      <div className="stage-wrap">
        <div className="stage" style={{ width: comp.width * zoom, height: comp.height * zoom }}>
          <BannerFrame project={project} comp={comp} time={time} zoom={zoom} rev={rev} />
          <div
            className="overlay"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => setHover(null)}
            onDragOver={(e) => {
              if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
              e.preventDefault()
              e.dataTransfer.dropEffect = 'copy'
              const p = toComp(e)
              setHover(hitTest(p.x, p.y)?.id ?? null)
            }}
            onDragLeave={() => setHover(null)}
            onDrop={(e) => {
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
            {hovered && box(hovered, 'hover', false)}
            {selected.map((b) => box(b, '', selected.length === 1 && !b.layer.locked))}
          </div>
        </div>
      </div>
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

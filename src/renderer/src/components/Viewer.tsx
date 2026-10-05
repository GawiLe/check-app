import { useEffect, useMemo, useRef, useState } from 'react'
import { Maximize, Minus, Plus, Star } from 'lucide-react'
import { layerStateAt } from '@shared/anim'
import { buildBanner } from '@shared/build'
import type { Composition, Layer, Project } from '@shared/types'
import { applyLibrary } from '../lib/actions'
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

function SingleViewer() {
  const project = useStore((s) => s.project)!
  const comp = useStore(currentComp)!
  const zoom = useStore((s) => s.zoom)
  const time = useStore((s) => s.time)
  const rev = useStore((s) => s.assetsRev)
  const selection = useStore((s) => s.selection)
  const [hover, setHover] = useState<string | null>(null)
  const drag = useRef<
    | { kind: 'move'; x: number; y: number; start: { id: string; x: number; y: number }[] }
    | { kind: 'resize'; x: number; y: number; id: string; w: number; h: number; ratio: number }
    | null
  >(null)

  const toComp = (e: React.PointerEvent) => {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    return { x: (e.clientX - r.left) / zoom, y: (e.clientY - r.top) / zoom }
  }

  const hitTest = (x: number, y: number): Layer | null => {
    for (const l of comp.layers) {
      if (!l.visible || l.locked) continue
      const st = layerStateAt(l, time)
      const w = l.width * st.scale
      const h = l.height * st.scale
      const cx = st.x + l.width / 2
      const cy = st.y + l.height / 2
      if (x >= cx - w / 2 && x <= cx + w / 2 && y >= cy - h / 2 && y <= cy + h / 2) return l
    }
    return null
  }

  const onDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const p = toComp(e)
    const hit = hitTest(p.x, p.y)
    const s = useStore.getState()
    if (!hit) {
      s.select([])
      return
    }
    let sel = selection
    if (e.shiftKey) sel = selection.includes(hit.id) ? selection.filter((i) => i !== hit.id) : [...selection, hit.id]
    else if (!selection.includes(hit.id)) sel = [hit.id]
    s.select(sel)
    // Verplaatsen werkt op de rustpositie (basis of huidige keyframe-waarde).
    const start = comp.layers
      .filter((l) => sel.includes(l.id) && !l.locked)
      .map((l) => {
        const animated = (p: 'x' | 'y') => !!l.tracks[p]?.length
        const st = layerStateAt(l, time)
        return { id: l.id, x: animated('x') ? st.x : l.x, y: animated('y') ? st.y : l.y }
      })
    drag.current = { kind: 'move', x: p.x, y: p.y, start }
  }

  const onMove = (e: React.PointerEvent) => {
    const p = toComp(e)
    const d = drag.current
    if (!d) {
      setHover(hitTest(p.x, p.y)?.id ?? null)
      return
    }
    if (d.kind === 'move') {
      const dx = Math.round(p.x - d.x)
      const dy = Math.round(p.y - d.y)
      for (const s of d.start) {
        setLayerValue(s.id, 'x', s.x + dx, 'move')
        setLayerValue(s.id, 'y', s.y + dy, 'move')
      }
    } else {
      const w = Math.max(4, Math.round(d.w + p.x - d.x))
      const h = e.shiftKey ? Math.round(w / d.ratio) : Math.max(4, Math.round(d.h + p.y - d.y))
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

  const startResize = (e: React.PointerEvent, l: Layer) => {
    e.stopPropagation()
    const overlay = (e.currentTarget as HTMLElement).closest('.overlay') as HTMLElement
    overlay.setPointerCapture(e.pointerId)
    const r = overlay.getBoundingClientRect()
    drag.current = {
      kind: 'resize',
      x: (e.clientX - r.left) / zoom,
      y: (e.clientY - r.top) / zoom,
      id: l.id,
      w: l.width,
      h: l.height,
      ratio: l.width / l.height
    }
  }

  const box = (l: Layer, cls: string, handle: boolean) => {
    const st = layerStateAt(l, time)
    return (
      <div
        key={cls + l.id}
        className={`sel ${cls}`}
        style={{
          width: l.width * zoom,
          height: l.height * zoom,
          transform: `translate(${st.x * zoom}px,${st.y * zoom}px) rotate(${st.rotation}deg) scale(${st.scale})`
        }}
      >
        {handle && (
          <>
            <div className="size-label">
              {Math.round(l.width)} × {Math.round(l.height)}
            </div>
            <div className="handle" onPointerDown={(e) => startResize(e, l)} />
          </>
        )}
      </div>
    )
  }

  const selected = comp.layers.filter((l) => selection.includes(l.id))
  const hovered = comp.layers.find((l) => l.id === hover && !selection.includes(l.id))
  const setZoom = useStore.getState().setZoom

  // Bij openen of wisselen van formaat: passend inzoomen (max. 100%).
  const viewerRef = useRef<HTMLDivElement>(null)
  const fit = () => {
    const el = viewerRef.current
    if (!el) return
    setZoom(Math.min(1, (el.clientWidth - 64) / comp.width, (el.clientHeight - 64) / comp.height))
  }
  useEffect(fit, [comp.id]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div ref={viewerRef} className="viewer" onWheel={(e) => (e.ctrlKey || e.metaKey) && setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9))}>
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
              const r = e.currentTarget.getBoundingClientRect()
              setHover(hitTest((e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom)?.id ?? null)
            }}
            onDragLeave={() => setHover(null)}
            onDrop={(e) => {
              const id = e.dataTransfer.getData(DRAG_TYPE)
              if (!id) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              const hit = hitTest((e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom)
              setHover(null)
              const targets = hit ? [hit.id] : selection
              if (targets.length) applyLibrary(id, targets)
              else useStore.getState().setStatus('Laat de animatie los op een laag.', 'error')
            }}
          >
            {hovered && box(hovered, 'hover', false)}
            {selected.map((l) => box(l, '', selected.length === 1 && !l.locked))}
          </div>
        </div>
      </div>
      <div className="floating">
        <button className="icon sm" title="Uitzoomen" onClick={() => setZoom(zoom / 1.25)}>
          <Minus size={14} />
        </button>
        <span>{Math.round(zoom * 100)}%</span>
        <button className="icon sm" title="Inzoomen" onClick={() => setZoom(zoom * 1.25)}>
          <Plus size={14} />
        </button>
        <button className="icon sm" title="Passend" onClick={fit}>
          <Maximize size={13} />
        </button>
        <button className="icon sm" title="100%" onClick={() => setZoom(1)} style={{ width: 'auto', padding: '0 6px', fontSize: 11 }}>
          1:1
        </button>
      </div>
    </div>
  )
}

import { useEffect, useMemo, useRef, useState } from 'react'
import { layerStateAt } from '@shared/anim'
import { buildBanner } from '@shared/build'
import type { Layer } from '@shared/types'
import { assetUrl, currentComp, setLayerValue, updateLayer, useStore } from '../store'

/**
 * Het canvas. De preview is de echte banner-HTML (zelfde builder als de export) in
 * een iframe; daaroverheen ligt een overlay voor selecteren, verplaatsen en schalen.
 * Twee iframes wisselen elkaar af zodat herladen niet flikkert.
 */
export function Viewer() {
  const project = useStore((s) => s.project)!
  const comp = useStore(currentComp)!
  const zoom = useStore((s) => s.zoom)
  const time = useStore((s) => s.time)
  const rev = useStore((s) => s.assetsRev)
  const selection = useStore((s) => s.selection)
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
  }, [project, comp, rev])

  // Nieuwe HTML in de verborgen iframe laden en na het laden omwisselen.
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
    const start = comp.layers
      .filter((l) => sel.includes(l.id) && !l.locked)
      .map((l) => {
        const st = layerStateAt(l, time)
        return { id: l.id, x: st.x, y: st.y }
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
      let h = Math.max(4, Math.round(d.h + p.y - d.y))
      if (e.shiftKey) h = Math.round(w / d.ratio)
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
              {l.name} · {Math.round(l.width)}×{Math.round(l.height)}
            </div>
            <div className="handle" onPointerDown={(e) => startResize(e, l)} />
          </>
        )}
      </div>
    )
  }

  const selected = comp.layers.filter((l) => selection.includes(l.id))
  const hovered = comp.layers.find((l) => l.id === hover && !selection.includes(l.id))

  return (
    <div className="viewer" onWheel={(e) => (e.ctrlKey || e.metaKey) && useStore.getState().setZoom(zoom * (e.deltaY < 0 ? 1.1 : 0.9))}>
      <div className="stage-wrap">
        <div className="stage" style={{ width: comp.width * zoom, height: comp.height * zoom }}>
          {frames.map((ref, i) => (
            <iframe
              key={i}
              ref={ref}
              sandbox="allow-scripts"
              title={`preview-${i}`}
              width={comp.width}
              height={comp.height}
              style={{ transform: `scale(${zoom})`, visibility: i === 0 ? 'visible' : 'hidden' }}
            />
          ))}
          <div
            className="overlay"
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerLeave={() => setHover(null)}
          >
            {hovered && box(hovered, 'hover', false)}
            {selected.map((l) => box(l, '', selected.length === 1 && !l.locked))}
          </div>
        </div>
      </div>
      <div className="zoom">
        <button className="icon" onClick={() => useStore.getState().setZoom(zoom / 1.25)}>
          −
        </button>
        <span style={{ minWidth: 40, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
        <button className="icon" onClick={() => useStore.getState().setZoom(zoom * 1.25)}>
          +
        </button>
        <button className="icon" onClick={() => useStore.getState().setZoom(1)}>
          1:1
        </button>
      </div>
    </div>
  )
}

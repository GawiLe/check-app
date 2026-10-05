import { useRef, useState } from 'react'
import { round, sortKeyframes } from '@shared/anim'
import type { AnimProp, EaseName, Layer } from '@shared/types'
import { ANIM_PROPS, EASES } from '@shared/types'
import { moveLayer } from '../lib/actions'
import { currentComp, updateComp, updateLayer, useStore } from '../store'
import { formatTime } from './ui'

const FPS = 30
const snap = (t: number) => Math.max(0, Math.round(t * FPS) / FPS)

const PROP_LABEL: Record<AnimProp, string> = {
  x: 'Positie X',
  y: 'Positie Y',
  scale: 'Schaal',
  rotation: 'Rotatie',
  opacity: 'Dekking',
  reveal: 'Reveal'
}

const EASE_LABEL: Record<EaseName, string> = {
  linear: 'Lineair',
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  easeInOut: 'Ease in-out',
  backOut: 'Back out (overshoot)',
  elasticOut: 'Elastic',
  bounceOut: 'Bounce',
  hold: 'Hold'
}

export function Timeline() {
  const comp = useStore(currentComp)!
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const selection = useStore((s) => s.selection)
  const selectedKey = useStore((s) => s.selectedKey)
  const [pps, setPps] = useState(110) // pixels per seconde
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const s = useStore.getState

  const span = Math.max(comp.duration + 1, 4)
  const width = span * pps + 20
  const xOf = (t: number) => t * pps + 8
  const tOf = (x: number) => (x - 8) / pps

  const scrub = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const set = (ev: { clientX: number }) => {
      const r = el.getBoundingClientRect()
      s().setTime(Math.min(span, snap(tOf(ev.clientX - r.left))))
    }
    set(e)
    s().setPlaying(false)
    el.onpointermove = (ev) => set(ev)
    el.onpointerup = () => (el.onpointermove = null)
  }

  const keyDrag = useRef<{ layerId: string; prop: AnimProp; t: number; x: number } | null>(null)

  const onKeyDown = (e: React.PointerEvent, layerId: string, prop: AnimProp, t: number) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    s().selectKey({ layerId, prop, t })
    s().setTime(t)
    keyDrag.current = { layerId, prop, t, x: e.clientX }
  }
  const onKeyMove = (e: React.PointerEvent) => {
    const d = keyDrag.current
    if (!d) return
    const nt = snap(d.t + (e.clientX - d.x) / pps)
    const cur = s().selectedKey
    if (!cur || Math.abs(nt - cur.t) < 1e-6) return
    updateLayer(
      d.layerId,
      (l) => {
        const kfs = l.tracks[d.prop]
        if (!kfs) return
        const k = kfs.find((x) => Math.abs(x.t - cur.t) < 1e-4)
        if (!k || kfs.some((x) => x !== k && Math.abs(x.t - nt) < 1e-4)) return
        k.t = round(nt)
        l.tracks[d.prop] = sortKeyframes(kfs)
      },
      'kfdrag'
    )
    s().selectKey({ ...cur, t: nt })
    s().setTime(nt)
  }

  const selKf = (() => {
    if (!selectedKey) return null
    const l = comp.layers.find((x) => x.id === selectedKey.layerId)
    return l?.tracks[selectedKey.prop]?.find((k) => Math.abs(k.t - selectedKey.t) < 1e-4) ?? null
  })()

  const ticks = []
  const minor = pps >= 80 ? 0.1 : pps >= 40 ? 0.5 : 1
  for (let t = 0; t <= span + 1e-6; t = round(t + minor, 3)) {
    const major = Math.abs(t - Math.round(t)) < 1e-6
    ticks.push(
      <div key={t} className={`tick${major ? ' major' : ''}`} style={{ left: xOf(t) }}>
        {major && <span>{Math.round(t)}s</span>}
      </div>
    )
  }

  const keyframes = (l: Layer, prop: AnimProp, summary = false) =>
    (l.tracks[prop] ?? []).map((k) => {
      const sel = !summary && selectedKey?.layerId === l.id && selectedKey.prop === prop && Math.abs(selectedKey.t - k.t) < 1e-4
      return (
        <div
          key={prop + k.t}
          className={`diamond${sel ? ' sel' : ''}${summary ? ' summary' : ''}`}
          style={{ left: xOf(k.t) }}
          title={`${PROP_LABEL[prop]} ${round(k.v, 2)} @ ${k.t.toFixed(2)}s · ${EASE_LABEL[k.e]}`}
          onPointerDown={summary ? undefined : (e) => onKeyDown(e, l.id, prop, k.t)}
          onPointerMove={summary ? undefined : onKeyMove}
          onPointerUp={() => (keyDrag.current = null)}
        />
      )
    })

  const rows: React.ReactNode[] = []
  comp.layers.forEach((l, i) => {
    const animated = ANIM_PROPS.filter((p) => l.tracks[p]?.length)
    const active = selection.includes(l.id)
    rows.push(
      <div key={l.id + 'n'} className={`tl-name${active ? ' active' : ''}`}>
        <button className="mini" onClick={() => setExpanded({ ...expanded, [l.id]: !expanded[l.id] })} title="Eigenschappen tonen">
          {animated.length ? (expanded[l.id] ? '▾' : '▸') : ' '}
        </button>
        <button
          className={`mini${l.visible ? ' on' : ''}`}
          title="Zichtbaar"
          onClick={() => updateLayer(l.id, (x) => void (x.visible = !x.visible))}
        >
          {l.visible ? '●' : '○'}
        </button>
        <button
          className={`mini${l.locked ? ' on' : ''}`}
          title="Vergrendelen"
          onClick={() => updateLayer(l.id, (x) => void (x.locked = !x.locked))}
        >
          {l.locked ? '🔒' : '·'}
        </button>
        <span className="muted" style={{ width: 16, textAlign: 'right' }}>
          {i + 1}
        </span>
        <span
          className="grow"
          onClick={(e) =>
            s().select(e.shiftKey ? (active ? selection.filter((x) => x !== l.id) : [...selection, l.id]) : [l.id])
          }
          title={l.name}
        >
          {l.name}
        </span>
        <button className="mini" title="Naar voren" onClick={() => moveLayer(l.id, -1)}>
          ↑
        </button>
        <button className="mini" title="Naar achteren" onClick={() => moveLayer(l.id, 1)}>
          ↓
        </button>
      </div>,
      <div key={l.id + 't'} className="tl-track" onPointerDown={() => s().select([l.id])}>
        <div className={`tl-bar${active ? ' active' : ''}`} style={{ left: xOf(0), width: comp.duration * pps }} />
        {!expanded[l.id] && animated.map((p) => keyframes(l, p, true))}
      </div>
    )
    if (expanded[l.id])
      for (const p of animated)
        rows.push(
          <div key={l.id + p + 'n'} className="tl-name sub">
            {PROP_LABEL[p]}
          </div>,
          <div key={l.id + p + 't'} className="tl-track">
            {keyframes(l, p)}
          </div>
        )
  })

  return (
    <div className="timeline">
      <div className="transport">
        <button className="icon" title="Naar begin (Home)" onClick={() => s().setTime(0)}>
          ⏮
        </button>
        <button className="icon primary" title="Afspelen/pauze (spatie)" onClick={() => s().setPlaying(!playing)}>
          {playing ? '⏸' : '▶'}
        </button>
        <button className="icon" title="Naar einde (End)" onClick={() => s().setTime(comp.duration)}>
          ⏭
        </button>
        <span className="timecode">{formatTime(time)}</span>
        <span className="muted">
          / {formatTime(comp.duration)} · {comp.loops}× · totaal {(comp.duration * comp.loops).toFixed(1)}s
        </span>
        <div style={{ flex: 1 }} />
        {selKf && selectedKey && (
          <>
            <span className="muted">Keyframe {PROP_LABEL[selectedKey.prop]} @ {selectedKey.t.toFixed(2)}s</span>
            <select
              value={selKf.e}
              onChange={(e) =>
                updateLayer(selectedKey.layerId, (l) => {
                  const k = l.tracks[selectedKey.prop]?.find((x) => Math.abs(x.t - selectedKey.t) < 1e-4)
                  if (k) k.e = e.target.value as EaseName
                })
              }
            >
              {EASES.map((e) => (
                <option key={e} value={e}>
                  {EASE_LABEL[e]}
                </option>
              ))}
            </select>
          </>
        )}
        <button title="Duur aanpassen aan laatste keyframe" onClick={() => {
          const last = Math.max(0, ...comp.layers.flatMap((l) => Object.values(l.tracks).flatMap((k) => (k ?? []).map((x) => x.t))))
          updateComp((c) => void (c.duration = Math.max(1, Math.ceil((last + 1.5) * 2) / 2)))
        }}>
          Duur passend
        </button>
        <span className="muted">Zoom</span>
        <input type="range" min={30} max={300} value={pps} onChange={(e) => setPps(+e.target.value)} style={{ width: 100 }} />
      </div>
      <div className="body">
        <div className="grid" style={{ gridTemplateColumns: `260px ${width}px` }}>
          <div className="tl-head names">Lagen</div>
          <div className="tl-head">
            <div className="ruler" onPointerDown={scrub}>
              {ticks}
            </div>
          </div>
          {rows}
          <div style={{ position: 'absolute', left: 260, top: 0, bottom: 0, width, pointerEvents: 'none', zIndex: 1 }}>
            <div className="out-of-range" style={{ left: xOf(comp.duration), right: 0 }} />
            <div className="endmarker" style={{ left: xOf(comp.duration) }} />
            <div className="playhead" style={{ left: xOf(time) }} />
          </div>
        </div>
      </div>
    </div>
  )
}

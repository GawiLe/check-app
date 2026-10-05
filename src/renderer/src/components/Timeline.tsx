import { useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Lock,
  Pause,
  PenLine,
  Play,
  SkipBack,
  SkipForward,
  Square,
  Type,
  Unlock
} from 'lucide-react'
import { round, sortKeyframes } from '@shared/anim'
import { effectiveLayer, endFrameTime } from '@shared/motion'
import { overrideLabel } from '@shared/sync'
import type { AnimProp, EaseName, Layer } from '@shared/types'
import { ANIM_PROPS, EASES } from '@shared/types'
import { applyLibrary, moveLayer } from '../lib/actions'
import { DRAG_TYPE } from './Library'
import { currentComp, updateComp, updateLayer, useStore } from '../store'
import { EASE_LABEL } from './Inspector'
import { formatTime } from './ui'

const FPS = 30
const snap = (t: number) => Math.max(0, Math.round(t * FPS) / FPS)
const NAME_W = 240

const PROP_LABEL: Record<AnimProp, string> = {
  x: 'Positie X',
  y: 'Positie Y',
  scale: 'Schaal',
  rotation: 'Rotatie',
  opacity: 'Dekking',
  reveal: 'Reveal'
}
const TYPE_ICON = { text: Type, image: ImageIcon, shape: Square, writeon: PenLine }

/** Sleepgedrag via pointer capture; geeft de verschuiving in seconden door. */
function useTimeDrag(pps: number) {
  return (e: React.PointerEvent, onDelta: (dt: number) => void, onClick?: () => void) => {
    e.stopPropagation()
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const x0 = e.clientX
    let moved = false
    el.onpointermove = (ev) => {
      if (Math.abs(ev.clientX - x0) > 2) moved = true
      if (moved) onDelta(snap((ev.clientX - x0) / pps))
    }
    el.onpointerup = () => {
      el.onpointermove = null
      el.onpointerup = null
      if (!moved) onClick?.()
    }
  }
}

export function Timeline() {
  const comp = useStore(currentComp)!
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const autoKey = useStore((s) => s.autoKey)
  const selection = useStore((s) => s.selection)
  const selectedKey = useStore((s) => s.selectedKey)
  const [pps, setPps] = useState(120)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const s = useStore.getState
  const drag = useTimeDrag(pps)

  const span = Math.max(comp.duration + 1, 4)
  const width = span * pps + 24
  const xOf = (t: number) => t * pps + 10
  const tOf = (x: number) => (x - 10) / pps
  const endFrame = endFrameTime(comp)

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

  // Keyframe slepen
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

  /** Hele laag in de tijd verschuiven: alle keyframes, binnenkomst en uitgang. */
  const shiftLayer = (e: React.PointerEvent, l: Layer) => {
    s().select([l.id])
    const orig = structuredClone(l)
    drag(e, (dt) => {
      updateLayer(
        l.id,
        (x) => {
          const minT = Math.min(
            ...Object.values(orig.tracks).flatMap((k) => (k ?? []).map((kf) => kf.t)),
            orig.intro?.start ?? Infinity,
            orig.outro?.start ?? Infinity,
            orig.emphasis?.start ?? Infinity
          )
          const d = Math.max(dt, -minT)
          for (const p of ANIM_PROPS) if (orig.tracks[p]) x.tracks[p] = orig.tracks[p]!.map((k) => ({ ...k, t: round(k.t + d) }))
          if (orig.intro && x.intro) x.intro.start = round(orig.intro.start + d)
          if (orig.outro && x.outro) x.outro.start = round(orig.outro.start + d)
          if (orig.emphasis && x.emphasis) x.emphasis.start = round(orig.emphasis.start + d)
        },
        'shift'
      )
    })
  }

  const motionSegment = (l: Layer, kind: 'intro' | 'outro') => {
    const m = l[kind]
    if (!m) return null
    const orig = { ...m }
    return (
      <div
        key={kind}
        className={`seg-motion ${kind}`}
        style={{ left: xOf(m.start), width: Math.max(6, m.duration * pps) }}
        title={`${kind === 'intro' ? 'Binnenkomst' : 'Uitgang'} ${m.start.toFixed(2)}s – ${(m.start + m.duration).toFixed(2)}s · sleep om te verschuiven`}
        onPointerDown={(e) => {
          s().select([l.id])
          s().setTab('motion')
          drag(e, (dt) => updateLayer(l.id, (x) => void (x[kind] && (x[kind]!.start = Math.max(0, round(orig.start + dt)))), `seg-${kind}`))
        }}
      >
        {m.duration * pps > 50 && (kind === 'intro' ? 'IN' : 'UIT')}
        <div
          className="edge"
          onPointerDown={(e) =>
            drag(e, (dt) => updateLayer(l.id, (x) => void (x[kind] && (x[kind]!.duration = Math.max(0.05, round(orig.duration + dt)))), `edge-${kind}`))
          }
        />
      </div>
    )
  }

  // Animaties uit de bibliotheek op een laag laten vallen. Op het spoor: start waar je loslaat.
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const dropProps = (layerId: string, onTrack: boolean) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      setDropOn(layerId)
      if (onTrack) {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        setDropAt(snap(tOf(e.clientX - r.left)))
      } else setDropAt(null)
    },
    onDragLeave: () => {
      setDropOn(null)
      setDropAt(null)
    },
    onDrop: (e: React.DragEvent) => {
      const id = e.dataTransfer.getData(DRAG_TYPE)
      if (!id) return
      e.preventDefault()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      applyLibrary(id, [layerId], onTrack ? snap(tOf(e.clientX - r.left)) : undefined)
      setDropOn(null)
      setDropAt(null)
    }
  })

  const emphasisSegment = (l: Layer) => {
    const em = l.emphasis
    if (!em) return null
    const orig = { ...em }
    return (
      <div
        className="seg-motion emphasis"
        style={{ left: xOf(em.start), width: Math.max(6, em.duration * pps) }}
        title={`Accent ${em.start.toFixed(2)}s – ${(em.start + em.duration).toFixed(2)}s · sleep om te verschuiven`}
        onPointerDown={(e) => {
          s().select([l.id])
          s().setTab('motion')
          drag(e, (dt) => updateLayer(l.id, (x) => void (x.emphasis && (x.emphasis.start = Math.max(0, round(orig.start + dt)))), 'seg-em'))
        }}
      >
        {em.duration * pps > 50 && 'ACCENT'}
        <div
          className="edge"
          onPointerDown={(e) =>
            drag(e, (dt) => updateLayer(l.id, (x) => void (x.emphasis && (x.emphasis.duration = Math.max(0.1, round(orig.duration + dt)))), 'edge-em'))
          }
        />
      </div>
    )
  }

  const selKf = (() => {
    if (!selectedKey) return null
    const l = comp.layers.find((x) => x.id === selectedKey.layerId)
    return l?.tracks[selectedKey.prop]?.find((k) => Math.abs(k.t - selectedKey.t) < 1e-4) ?? null
  })()

  const ticks = []
  const minor = pps >= 90 ? 0.1 : pps >= 45 ? 0.5 : 1
  for (let t = 0; t <= span + 1e-6; t = round(t + minor, 3)) {
    const major = Math.abs(t - Math.round(t)) < 1e-6
    ticks.push(
      <div key={t} className={`tick${major ? ' major' : ''}`} style={{ left: xOf(t) }}>
        {major && <span>{Math.round(t)}s</span>}
      </div>
    )
  }

  const diamonds = (l: Layer, prop: AnimProp, summary = false) =>
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

  const project = useStore((st) => st.project)!
  const derived = project.syncFormats && comp.id !== project.baseCompositionId
  const baseLinks = new Set(project.compositions.find((c) => c.id === project.baseCompositionId)?.layers.map((x) => x.linkId))
  const rows: React.ReactNode[] = []
  comp.layers.forEach((l) => {
    const animated = ANIM_PROPS.filter((p) => l.tracks[p]?.length)
    const active = selection.includes(l.id)
    const Icon = TYPE_ICON[l.type]
    const eff = effectiveLayer(l)
    const times = Object.values(eff.tracks).flatMap((k) => (k ?? []).map((x) => x.t))
    const barStart = times.length ? Math.min(...times) : 0
    const select = (e: React.MouseEvent) =>
      s().select(e.shiftKey ? (active ? selection.filter((x) => x !== l.id) : [...selection, l.id]) : [l.id])
    rows.push(
      <div
        key={l.id + 'n'}
        className={`tl-name${active ? ' active' : ''}${l.visible ? '' : ' hidden'}${dropOn === l.id ? ' drop-hint' : ''}`}
        onClick={select}
        {...dropProps(l.id, false)}
      >
        <button
          className="icon sm"
          style={{ width: 16, visibility: animated.length ? 'visible' : 'hidden' }}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded({ ...expanded, [l.id]: !expanded[l.id] })
          }}
        >
          {expanded[l.id] ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <Icon size={13} className="type" />
        <span className="grow" title={l.name}>
          {l.name}
        </span>
        {derived && l.overrides?.length ? (
          <span className="override-dot" title={`Wijkt af van basis: ${l.overrides.map(overrideLabel).join(', ')}`} />
        ) : null}
        {derived && !baseLinks.has(l.linkId) && <span className="faint" style={{ fontSize: 10 }}>eigen</span>}
        <span className="tools" onClick={(e) => e.stopPropagation()}>
          <button title="Naar voren" onClick={() => moveLayer(l.id, -1)}>
            <ChevronUp size={13} />
          </button>
          <button title="Naar achteren" onClick={() => moveLayer(l.id, 1)}>
            <ChevronDown size={13} />
          </button>
          <button className={l.locked ? 'keep' : ''} title="Vergrendelen" onClick={() => updateLayer(l.id, (x) => void (x.locked = !x.locked))}>
            {l.locked ? <Lock size={12} /> : <Unlock size={12} />}
          </button>
          <button className={l.visible ? '' : 'keep'} title="Zichtbaar" onClick={() => updateLayer(l.id, (x) => void (x.visible = !x.visible))}>
            {l.visible ? <Eye size={12} /> : <EyeOff size={12} />}
          </button>
        </span>
      </div>,
      <div key={l.id + 't'} className={`tl-track${dropOn === l.id ? ' drop-hint' : ''}`} {...dropProps(l.id, true)}>
        {dropOn === l.id && dropAt != null && <div className="endframe" style={{ left: xOf(dropAt), borderColor: 'var(--accent)' }} />}
        <div
          className={`tl-bar${active ? ' active' : ''}`}
          style={{ left: xOf(Math.min(barStart, comp.duration)), width: Math.max(0, (comp.duration - Math.min(barStart, comp.duration)) * pps) }}
          title="Sleep om de hele laag in de tijd te verschuiven"
          onPointerDown={(e) => shiftLayer(e, l)}
        />
        {motionSegment(l, 'intro')}
        {emphasisSegment(l)}
        {motionSegment(l, 'outro')}
        {!expanded[l.id] && animated.map((p) => diamonds(l, p, true))}
      </div>
    )
    if (expanded[l.id])
      for (const p of animated)
        rows.push(
          <div key={l.id + p + 'n'} className="tl-name sub">
            {PROP_LABEL[p]}
          </div>,
          <div key={l.id + p + 't'} className="tl-track">
            {diamonds(l, p)}
          </div>
        )
  })

  return (
    <div className="timeline">
      <div className="transport">
        <button className="icon" title="Naar begin (Home)" onClick={() => s().setTime(0)}>
          <SkipBack size={15} />
        </button>
        <button className="icon" title="Afspelen / pauze (spatie)" onClick={() => s().setPlaying(!playing)}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </button>
        <button className="icon" title="Naar eindframe (End)" onClick={() => s().setTime(endFrame)}>
          <SkipForward size={15} />
        </button>
        <span className="timecode">{formatTime(time)}</span>
        <span className="faint">
          / {formatTime(comp.duration)}
          {comp.loops > 1 ? ` · ${comp.loops}×` : ''}
        </span>
        <div className="vsep" />
        <button
          className={`icon rec${autoKey ? ' on' : ''}`}
          title="Auto-keyframe: elke wijziging in positie, schaal, rotatie of dekking zet een keyframe op de huidige tijd"
          onClick={() => s().setAutoKey(!autoKey)}
        >
          ●
        </button>
        {autoKey && <span style={{ color: '#ff5b5b', fontSize: 11 }}>Auto-key</span>}
        <div style={{ flex: 1 }} />
        {selKf && selectedKey && (
          <>
            <span className="faint">
              ◆ {PROP_LABEL[selectedKey.prop]} @ {selectedKey.t.toFixed(2)}s
            </span>
            <select
              style={{ width: 130 }}
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
            <div className="vsep" />
          </>
        )}
        <button
          className="ghost sm"
          title="Duur aanpassen aan de laatste animatie"
          onClick={() => {
            const last = Math.max(
              0,
              ...comp.layers.flatMap((l) => Object.values(effectiveLayer({ ...l, outro: null }).tracks).flatMap((k) => (k ?? []).map((x) => x.t)))
            )
            updateComp((c) => void (c.duration = Math.max(1, Math.ceil((last + 1.5) * 2) / 2)))
          }}
        >
          Duur passend
        </button>
        <input type="range" min={40} max={320} value={pps} onChange={(e) => setPps(+e.target.value)} style={{ width: 90 }} title="Zoom tijdlijn" />
      </div>
      <div className="body">
        <div className="grid" style={{ gridTemplateColumns: `${NAME_W}px ${width}px` }}>
          <div className="tl-head names">LAGEN</div>
          <div className="tl-head">
            <div className="ruler" onPointerDown={scrub}>
              {ticks}
            </div>
          </div>
          {rows}
          <div style={{ position: 'absolute', left: NAME_W, top: 0, bottom: 0, width, pointerEvents: 'none', zIndex: 1 }}>
            <div className="out-of-range" style={{ left: xOf(comp.duration), right: 0 }} />
            <div className="endmarker" style={{ left: xOf(comp.duration) }} />
            {endFrame < comp.duration && <div className="endframe" style={{ left: xOf(endFrame) }} title="Eindframe" />}
            <div className="playhead" style={{ left: xOf(time) }} />
          </div>
        </div>
      </div>
    </div>
  )
}

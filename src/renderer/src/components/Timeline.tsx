import { useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  ChevronUp,
  Eye,
  EyeOff,
  Folder,
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
import { layerStateAt, round, sortKeyframes, upsertKeyframe } from '@shared/anim'
import { effectiveLayer, endFrameTime } from '@shared/motion'
import { overrideLabel } from '@shared/sync'
import { allLayers, layerLength, shiftTiming, trimIn, trimOut } from '@shared/tree'
import type { AnimProp, EaseName, Layer } from '@shared/types'
import { ANIM_PROPS, EASES } from '@shared/types'
import { applyLibrary, moveLayer } from '../lib/actions'
import { currentComp, updateComp, updateLayer, useStore } from '../store'
import { EASE_LABEL } from './Inspector'
import { DRAG_TYPE } from './Library'
import { formatTime } from './ui'

const FPS = 30
const snap = (t: number) => Math.round(t * FPS) / FPS
const NAME_W = 260

const PROP_LABEL: Record<AnimProp, string> = {
  x: 'Positie X',
  y: 'Positie Y',
  scale: 'Schaal',
  rotation: 'Rotatie',
  opacity: 'Dekking',
  reveal: 'Reveal'
}
const TYPE_ICON = { text: Type, image: ImageIcon, shape: Square, writeon: PenLine, group: Folder }

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

const propsFor = (l: Layer): AnimProp[] =>
  ANIM_PROPS.filter((p) => p !== 'reveal' || l.type === 'writeon' || l.revealMode !== 'none')

export function Timeline() {
  const comp = useStore(currentComp)!
  const project = useStore((st) => st.project)!
  const time = useStore((s) => s.time)
  const playing = useStore((s) => s.playing)
  const autoKey = useStore((s) => s.autoKey)
  const selection = useStore((s) => s.selection)
  const selectedKey = useStore((s) => s.selectedKey)
  const expanded = useStore((s) => s.expanded)
  const [pps, setPps] = useState(120)
  const s = useStore.getState
  const drag = useTimeDrag(pps)
  const setExpanded = (id: string, on: boolean) => s().setExpanded({ ...s().expanded, [id]: on })

  const span = Math.max(comp.duration + 1, 4)
  const width = span * pps + 24
  const xOf = (t: number) => t * pps + 10
  const tOf = (x: number) => (x - 10) / pps
  const endFrame = endFrameTime(comp)
  const derived = project.syncFormats && comp.id !== project.baseCompositionId
  const baseLinks = new Set(project.compositions.find((c) => c.id === project.baseCompositionId)?.layers.map((x) => x.linkId))

  const scrub = (e: React.PointerEvent) => {
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    const set = (ev: { clientX: number }) => {
      const r = el.getBoundingClientRect()
      s().setTime(Math.max(0, Math.min(span, snap(tOf(ev.clientX - r.left)))))
    }
    set(e)
    s().setPlaying(false)
    el.onpointermove = (ev) => set(ev)
    el.onpointerup = () => (el.onpointermove = null)
  }

  // Keyframe slepen (tijden zijn lokaal binnen een groep; offset = in-punten van de groepen)
  const keyDrag = useRef<{ layerId: string; prop: AnimProp; t: number; x: number; offset: number } | null>(null)
  const onKeyDown = (e: React.PointerEvent, layerId: string, prop: AnimProp, t: number, offset: number) => {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    s().selectKey({ layerId, prop, t })
    s().setTime(t + offset)
    keyDrag.current = { layerId, prop, t, x: e.clientX, offset }
  }
  const onKeyMove = (e: React.PointerEvent) => {
    const d = keyDrag.current
    if (!d) return
    const nt = Math.max(0, snap(d.t + (e.clientX - d.x) / pps))
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
    s().setTime(nt + d.offset)
  }

  /** Hele laag in de tijd verschuiven (balk slepen), of in/uit trimmen (randen slepen). */
  const barDrag = (e: React.PointerEvent, l: Layer, mode: 'move' | 'in' | 'out', shownEnd = 0) => {
    s().select([l.id])
    const orig = structuredClone(l)
    drag(e, (dt) =>
      updateLayer(
        l.id,
        (x) => {
          if (mode === 'move') {
            Object.assign(x, structuredClone(orig))
            shiftTiming(x, Math.max(dt, -(orig.start ?? 0)))
          } else if (mode === 'in') {
            Object.assign(x, structuredClone(orig))
            trimIn(x, (orig.start ?? 0) + dt)
          } else trimOut(x, shownEnd + dt)
        },
        `bar-${mode}`
      )
    )
  }

  const motionSegment = (l: Layer, kind: 'intro' | 'outro', offset: number) => {
    const m = l[kind]
    if (!m) return null
    const orig = { ...m }
    return (
      <div
        key={kind}
        className={`seg-motion ${kind}`}
        style={{ left: xOf(offset + m.start), width: Math.max(6, m.duration * pps) }}
        title={`${kind === 'intro' ? 'Binnenkomst' : 'Uitgang'} · sleep om te verschuiven, rand = duur`}
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

  const emphasisSegment = (l: Layer, offset: number) => {
    const em = l.emphasis
    if (!em) return null
    const orig = { ...em }
    return (
      <div
        className="seg-motion emphasis"
        style={{ left: xOf(offset + em.start), width: Math.max(6, em.duration * pps) }}
        title="Accent · sleep om te verschuiven, rand = duur"
        onPointerDown={(e) => {
          s().select([l.id])
          s().setTab('motion')
          drag(e, (dt) => updateLayer(l.id, (x) => void (x.emphasis && (x.emphasis.start = Math.max(0, round(orig.start + dt)))), 'seg-em'))
        }}
      >
        {em.duration * pps > 60 && 'ACCENT'}
        <div
          className="edge"
          onPointerDown={(e) =>
            drag(e, (dt) => updateLayer(l.id, (x) => void (x.emphasis && (x.emphasis.duration = Math.max(0.1, round(orig.duration + dt)))), 'edge-em'))
          }
        />
      </div>
    )
  }

  // Animaties uit de bibliotheek op een laag laten vallen. Op het spoor: start waar je loslaat.
  const [dropOn, setDropOn] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const dropProps = (layerId: string, offset: number, onTrack: boolean) => ({
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      setDropOn(layerId)
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      setDropAt(onTrack ? snap(tOf(e.clientX - r.left)) : null)
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
      applyLibrary(id, [layerId], onTrack ? Math.max(0, snap(tOf(e.clientX - r.left)) - offset) : undefined)
      setDropOn(null)
      setDropAt(null)
    }
  })

  /** Keyframes van één eigenschap: eigen keyframes (sleepbaar) en die uit binnenkomst/accent/uitgang (hol). */
  const propDiamonds = (l: Layer, prop: AnimProp, offset: number) => {
    const own = l.tracks[prop]
    if (own?.length)
      return own.map((k) => {
        const sel = selectedKey?.layerId === l.id && selectedKey.prop === prop && Math.abs(selectedKey.t - k.t) < 1e-4
        return (
          <div
            key={'k' + k.t}
            className={`diamond${sel ? ' sel' : ''}`}
            style={{ left: xOf(offset + k.t) }}
            title={`${PROP_LABEL[prop]} ${round(k.v, 2)} @ ${(offset + k.t).toFixed(2)}s · ${EASE_LABEL[k.e]}`}
            onPointerDown={(e) => onKeyDown(e, l.id, prop, k.t, offset)}
            onPointerMove={onKeyMove}
            onPointerUp={() => (keyDrag.current = null)}
          />
        )
      })
    return (effectiveLayer(l).tracks[prop] ?? []).map((k) => (
      <div
        key={'g' + k.t}
        className="diamond generated"
        style={{ left: xOf(offset + k.t) }}
        title={`${PROP_LABEL[prop]} ${round(k.v, 2)} @ ${(offset + k.t).toFixed(2)}s · uit binnenkomst/accent/uitgang (sleep het gekleurde blok)`}
      />
    ))
  }

  /** Keyframe op de playhead toevoegen of weghalen (◆ in de eigenschap-rij). */
  const toggleKeyAtPlayhead = (l: Layer, prop: AnimProp, offset: number) => {
    const t = round(time - offset)
    const v = layerStateAt(l, t)[prop]
    updateLayer(l.id, (x) => {
      const kfs = x.tracks[prop] ?? []
      const has = kfs.find((k) => Math.abs(k.t - t) < 1 / 60)
      if (has) {
        const rest = kfs.filter((k) => k !== has)
        if (rest.length) x.tracks[prop] = rest
        else {
          x[prop] = v
          delete x.tracks[prop]
        }
      } else x.tracks[prop] = upsertKeyframe(kfs, t, v)
    })
  }

  const rows: React.ReactNode[] = []
  const renderLayer = (l: Layer, depth: number, offset: number, ancestors: Layer[]) => {
    const active = selection.includes(l.id)
    const Icon = TYPE_ICON[l.type]
    const open = !!expanded[l.id]
    const start = offset + (l.start ?? 0)
    const barEnd = start + layerLength(l)
    const ranged = l.start != null || l.end != null
    const select = (e: React.MouseEvent) =>
      s().select(e.shiftKey || e.metaKey ? (active ? selection.filter((x) => x !== l.id) : [...selection, l.id]) : [l.id])
    const pad = { paddingLeft: 8 + depth * 16 }
    rows.push(
      <div
        key={l.id + 'n'}
        className={`tl-name${active ? ' active' : ''}${l.visible ? '' : ' hidden'}${dropOn === l.id ? ' drop-hint' : ''}`}
        style={pad}
        onClick={select}
        onDoubleClick={() => setExpanded(l.id, !open)}
        {...dropProps(l.id, offset, false)}
      >
        <button
          className="icon sm"
          style={{ width: 16 }}
          title={l.type === 'group' ? 'Groep openklappen' : 'Eigenschappen tonen (U)'}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(l.id, !open)
          }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <Icon size={13} className="type" />
        <span className="grow" title={l.name}>
          {l.name}
        </span>
        {derived && depth === 0 && l.overrides?.length ? (
          <span className="override-dot" title={`Wijkt af van basis: ${l.overrides.map(overrideLabel).join(', ')}`} />
        ) : null}
        {derived && depth === 0 && !baseLinks.has(l.linkId) && (
          <span className="faint" style={{ fontSize: 10 }}>
            eigen
          </span>
        )}
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
      <div key={l.id + 't'} className={`tl-track${dropOn === l.id ? ' drop-hint' : ''}`} {...dropProps(l.id, offset, true)}>
        {dropOn === l.id && dropAt != null && <div className="endframe" style={{ left: xOf(dropAt), borderColor: 'var(--accent)' }} />}
        <div
          className={`tl-bar${active ? ' active' : ''}${l.type === 'group' ? ' group' : ''}`}
          style={{ left: xOf(start), width: Math.max(4, ((ranged ? barEnd : Math.max(barEnd, comp.duration)) - start) * pps) }}
          title="Sleep om de laag in de tijd te verschuiven; sleep de randen om in- en uitpunt te zetten"
          onPointerDown={(e) => barDrag(e, l, 'move')}
        >
          <div className="trim in" onPointerDown={(e) => barDrag(e, l, 'in')} />
          <div className="trim out" onPointerDown={(e) => barDrag(e, l, 'out', (ranged ? barEnd : Math.max(barEnd, comp.duration)) - offset)} />
        </div>
        {motionSegment(l, 'intro', offset)}
        {emphasisSegment(l, offset)}
        {motionSegment(l, 'outro', offset)}
        {!open &&
          ANIM_PROPS.filter((p) => l.tracks[p]?.length).flatMap((p) =>
            l.tracks[p]!.map((k) => <div key={p + k.t} className="diamond summary" style={{ left: xOf(offset + k.t) }} />)
          )}
      </div>
    )
    if (!open) return
    // Eigenschappen met keyframes (positie, schaal, rotatie, dekking …)
    const st = layerStateAt(l, time - offset)
    for (const p of propsFor(l)) {
      const hasKeyHere = l.tracks[p]?.some((k) => Math.abs(k.t - (time - offset)) < 1 / 60)
      rows.push(
        <div key={l.id + p + 'n'} className="tl-name sub" style={{ paddingLeft: 30 + depth * 16 }}>
          <button
            className={`kf-btn${l.tracks[p]?.length ? ' on' : ''}${hasKeyHere ? ' here' : ''}`}
            title={hasKeyHere ? 'Keyframe op de playhead weghalen' : 'Keyframe op de playhead zetten'}
            onClick={() => toggleKeyAtPlayhead(l, p, offset)}
          >
            ◆
          </button>
          <span className="grow">{PROP_LABEL[p]}</span>
          <span className="faint" style={{ fontVariantNumeric: 'tabular-nums' }}>
            {p === 'scale' || p === 'opacity' || p === 'reveal' ? `${Math.round(st[p] * 100)}%` : p === 'rotation' ? `${Math.round(st[p])}°` : Math.round(st[p])}
          </span>
        </div>,
        <div key={l.id + p + 't'} className="tl-track sub">
          {propDiamonds(l, p, offset)}
        </div>
      )
    }
    if (l.children) for (const c of l.children) renderLayer(c, depth + 1, start, [...ancestors, l])
  }
  comp.layers.forEach((l) => renderLayer(l, 0, 0, []))

  const selLayer = selectedKey ? allLayers(comp.layers).find((x) => x.id === selectedKey.layerId) : null
  const selKf = selLayer?.tracks[selectedKey!.prop]?.find((k) => Math.abs(k.t - selectedKey!.t) < 1e-4) ?? null

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

  const anyOpen = Object.values(expanded).some(Boolean)

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
        <button
          className="icon"
          title={anyOpen ? 'Alles inklappen' : 'Alle lagen uitklappen'}
          onClick={() => s().setExpanded(anyOpen ? {} : Object.fromEntries(allLayers(comp.layers).map((l) => [l.id, true])))}
        >
          {anyOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
        </button>
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
            const last = Math.max(0, ...comp.layers.map((l) => (l.start ?? 0) + layerLength({ ...l, outro: null }) - 1.5))
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

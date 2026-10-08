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
import { baseValue, layerStateAt, round, sampleTrack, sortKeyframes, upsertKeyframe } from '@shared/anim'
import { effectiveLayer, endFrameTime } from '@shared/motion'
import { overrideLabel } from '@shared/sync'
import { GROUP_LABEL, groupOf, groupProps, groupTimes, visibleGroups, type PropGroupId } from '@shared/propgroups'
import { allLayers, findDeep, layerLength, shiftTiming, trimIn, trimOut } from '@shared/tree'
import type { AnimProp, EaseName, Layer } from '@shared/types'
import { ANIM_PROPS, EASES } from '@shared/types'
import { applyLibrary, keyAssist, moveLayer, openComp, renameLayer, reorderTo, replaceImage } from '../lib/actions'
import { ASSET_DRAG } from './LeftPanel'
import { openEmptyMenu, openKeyMenu, openLayerMenu } from '../lib/menus'
import { contextOf, currentComp, updateComp, updateLayer, useStore } from '../store'
import { EASE_LABEL } from './Inspector'
import { DRAG_TYPE } from './Library'
import { formatTime, InlineRename } from './ui'

const FPS = 30
const snap = (t: number) => Math.round(t * FPS) / FPS
const NAME_W = 260
const LAYER_DRAG = 'application/x-banner-layer'

const PROP_LABEL: Record<AnimProp, string> = {
  x: 'Positie X',
  y: 'Positie Y',
  scale: 'Schaal',
  scaleY: 'Schaal Y',
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
  const selectedKeys = useStore((s) => s.selectedKeys)
  const tabs = useStore((s) => s.tabs)
  const activeTab = useStore((s) => s.activeTab)
  const renaming = useStore((s) => s.renaming)
  const expanded = useStore((s) => s.expanded)
  const shownProps = useStore((s) => s.shownProps)
  const [pps, setPps] = useState(120)
  const s = useStore.getState
  const drag = useTimeDrag(pps)
  // Met de hand uitklappen toont weer alle eigenschappen (een P/S/R/O/U-filter vervalt)
  const setExpanded = (id: string, on: boolean) => {
    s().setExpanded({ ...s().expanded, [id]: on })
    const { [id]: _drop, ...rest } = s().shownProps
    void _drop
    s().setShownProps(rest)
  }

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

  // Keyframe slepen (tijden zijn lokaal binnen een groep; offset = in-punten van de groepen).
  // Via window-listeners: het ruitje krijgt bij elke stap een nieuwe plek (en key), dus pointer capture zou wegvallen.
  const onKeyDown = (e: React.PointerEvent, layerId: string, prop: AnimProp, t0: number, offset: number) => {
    e.stopPropagation()
    e.preventDefault()
    s().selectKey({ layerId, prop, t: t0 }, e.shiftKey || e.metaKey)
    s().setTime(t0 + offset)
    s().setPlaying(false)
    const x0 = e.clientX
    let cur = t0
    let moved = false
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - x0) < 3) return
      moved = true
      const nt = round(Math.max(0, snap(t0 + (ev.clientX - x0) / pps)))
      if (Math.abs(nt - cur) < 1e-6) return
      let ok = false
      updateLayer(
        layerId,
        (l) => {
          // Alle onderdelen van de groep (bijv. X en Y van Positie) samen verschuiven
          const members = groupProps(l, groupOf(prop))
          if (members.some((m) => l.tracks[m]?.some((x) => Math.abs(x.t - nt) < 1e-4))) return
          for (const m of members) {
            const kfs = l.tracks[m]
            const k = kfs?.find((x) => Math.abs(x.t - cur) < 1e-4)
            if (!kfs || !k) continue
            k.t = nt
            l.tracks[m] = sortKeyframes(kfs)
            ok = true
          }
        },
        'kfdrag'
      )
      if (!ok) return // bezet door een ander keyframe: blijf staan
      cur = nt
      s().selectKey({ layerId, prop, t: nt })
      s().setTime(nt + offset)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
      window.removeEventListener('blur', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    // Ook opruimen als de muis buiten het venster wordt losgelaten of de app de focus verliest
    window.addEventListener('pointercancel', up)
    window.addEventListener('blur', up)
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
  // Lagen verslepen: waar komt de laag terecht (boven of onder de laag onder de muis)?
  const [dropLine, setDropLine] = useState<{ id: string; where: 'before' | 'after' } | null>(null)
  const dropProps = (layerId: string, offset: number, onTrack: boolean) => ({
    onDragOver: (e: React.DragEvent) => {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      if (e.dataTransfer.types.includes(LAYER_DRAG)) {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        setDropLine({ id: layerId, where: e.clientY < r.top + r.height / 2 ? 'before' : 'after' })
        return
      }
      if (e.dataTransfer.types.includes(ASSET_DRAG)) {
        // Alleen een afbeeldingslaag kan een asset ontvangen (vervangen)
        if (!findDeep(comp.layers, layerId)?.layer.image) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDropOn(layerId)
        return
      }
      if (!e.dataTransfer.types.includes(DRAG_TYPE)) return
      e.preventDefault()
      setDropOn(layerId)
      setDropAt(onTrack ? snap(tOf(e.clientX - r.left)) : null)
    },
    onDragLeave: () => {
      setDropOn(null)
      setDropAt(null)
    },
    onDrop: (e: React.DragEvent) => {
      const moving = e.dataTransfer.getData(LAYER_DRAG)
      if (moving) {
        e.preventDefault()
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
        reorderTo(moving, layerId, e.clientY < r.top + r.height / 2 ? 'before' : 'after')
        setDropLine(null)
        return
      }
      const asset = e.dataTransfer.getData(ASSET_DRAG)
      if (asset) {
        e.preventDefault()
        setDropOn(null)
        void replaceImage(layerId, asset)
        return
      }
      const id = e.dataTransfer.getData(DRAG_TYPE)
      if (!id) return
      e.preventDefault()
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      applyLibrary(id, [layerId], onTrack ? Math.max(0, snap(tOf(e.clientX - r.left)) - offset) : undefined)
      setDropOn(null)
      setDropAt(null)
    }
  })


  /** Keyframes van een eigenschapsgroep (Positie = X+Y …): eigen keyframes sleepbaar, die uit binnenkomst/accent/uitgang hol. */
  const groupDiamonds = (l: Layer, g: PropGroupId, offset: number) => {
    const members = groupProps(l, g)
    const prop = members[0]
    const times = groupTimes(l, g)
    if (times.length)
      return times.map((t) => {
        const sel = selectedKeys.some((sk) => sk.layerId === l.id && groupOf(sk.prop) === g && Math.abs(sk.t - t) < 1e-4)
        const k = members.map((m) => l.tracks[m]?.find((x) => Math.abs(x.t - t) < 1e-4)).find(Boolean)
        const vals = members.map((m) => round(sampleTrack(l.tracks[m], t, baseValue(l, m)), 2)).join(', ')
        return (
          <div
            key={'k' + t}
            className={`diamond${sel ? ' sel' : ''}${k?.ei || k?.eo ? ' eased' : ''}`}
            style={{ left: xOf(offset + t) }}
            title={`${GROUP_LABEL[g]} ${vals} @ ${(offset + t).toFixed(2)}s${k ? ` · ${EASE_LABEL[k.e]}` : ''}`}
            onPointerDown={(e) => e.button === 0 && onKeyDown(e, l.id, prop, t, offset)}
            onContextMenu={(e) => openKeyMenu(e, { layerId: l.id, prop, t })}
          />
        )
      })
    const eff = effectiveLayer(l)
    const gen = [...new Set(members.flatMap((m) => (eff.tracks[m] ?? []).map((k) => k.t)))]
    return gen.map((t) => (
      <div
        key={'g' + t}
        className="diamond generated"
        style={{ left: xOf(offset + t) }}
        title={`${GROUP_LABEL[g]} @ ${(offset + t).toFixed(2)}s · uit binnenkomst/accent/uitgang (sleep het gekleurde blok)`}
      />
    ))
  }

  /** Keyframe op de playhead voor de hele groep toevoegen of weghalen (◆ in de eigenschap-rij). */
  const toggleKeyAtPlayhead = (l: Layer, g: PropGroupId, offset: number) => {
    const t = round(time - offset)
    const st = layerStateAt(l, t)
    updateLayer(l.id, (x) => {
      const members = groupProps(x, g)
      const has = members.some((m) => x.tracks[m]?.some((k) => Math.abs(k.t - t) < 1 / 60))
      for (const m of members) {
        const kfs = x.tracks[m] ?? []
        if (has) {
          const rest = kfs.filter((k) => Math.abs(k.t - t) >= 1 / 60)
          if (rest.length) x.tracks[m] = rest
          else {
            if (m === 'scaleY') x.scaleY = st[m]
            else x[m] = st[m]
            delete x.tracks[m]
          }
        } else x.tracks[m] = upsertKeyframe(kfs, t, st[m])
      }
    })
  }

  const rows: React.ReactNode[] = []
  const renderLayer = (l: Layer, depth: number, offset: number, ancestors: Layer[]) => {
    const active = selection.includes(l.id)
    const Icon = TYPE_ICON[l.type]
    const open = !!expanded[l.id]
    const start = offset + (l.start ?? 0)
    const barEnd = start + layerLength(l)
    const ranged = l.end != null
    const select = (e: React.MouseEvent) =>
      s().select(e.shiftKey || e.metaKey ? (active ? selection.filter((x) => x !== l.id) : [...selection, l.id]) : [l.id])
    const pad = { paddingLeft: 8 + depth * 16 }
    rows.push(
      <div
        key={l.id + 'n'}
        className={`tl-name${active ? ' active' : ''}${l.visible ? '' : ' hidden'}${dropOn === l.id ? ' drop-hint' : ''}${dropLine?.id === l.id ? ` drop-${dropLine.where}` : ''}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData(LAYER_DRAG, l.id)
          e.dataTransfer.effectAllowed = 'move'
          if (!selection.includes(l.id)) s().select([l.id])
        }}
        onDragEnd={() => setDropLine(null)}
        style={pad}
        onClick={select}
        onDoubleClick={() => (l.type === 'group' ? openComp(l.id) : setExpanded(l.id, !open))}
        onContextMenu={(e) => openLayerMenu(e, l.id)}
        {...dropProps(l.id, offset, false)}
      >
        <button
          className="icon sm"
          style={{ width: 16 }}
          title={l.type === 'group' ? 'Inhoud tonen (dubbelklik = compositie openen in eigen tab)' : 'Eigenschappen tonen (U)'}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(l.id, !open)
          }}
        >
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        <Icon size={13} className="type" />
        {renaming === l.id ? (
          <InlineRename
            value={l.name}
            onDone={(v) => {
              if (v) renameLayer(l.id, v)
              s().setRenaming(null)
            }}
          />
        ) : (
          <span
            className="grow"
            title={l.type === 'group' ? `${l.name} · dubbelklik = openen, Enter = naam wijzigen` : `${l.name} · dubbelklik of Enter = naam wijzigen`}
            onDoubleClick={(e) => {
              // Composities openen met dubbelklik (zoals in After Effects); andere lagen hernoemen
              if (l.type === 'group') return
              e.stopPropagation()
              s().setRenaming(l.id)
            }}
          >
            {l.name}
          </span>
        )}
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
      <div
        key={l.id + 't'}
        className={`tl-track${dropOn === l.id ? ' drop-hint' : ''}${dropLine?.id === l.id ? ` drop-${dropLine.where}` : ''}`}
        onContextMenu={(e) => openLayerMenu(e, l.id)}
        {...dropProps(l.id, offset, true)}
      >
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
          [...new Set(ANIM_PROPS.flatMap((p) => (l.tracks[p] ?? []).map((k) => k.t)))].map((t) => (
            <div key={'s' + t} className="diamond summary" style={{ left: xOf(offset + t) }} />
          ))}
      </div>
    )
    if (!open) return
    // Eigenschappen, zoals in After Effects: Positie (X+Y), Schaal, Rotatie, Dekking …
    const st = layerStateAt(l, time - offset)
    for (const g of visibleGroups(l, shownProps[l.id])) {
      const members = groupProps(l, g)
      const hasKeyHere = members.some((m) => l.tracks[m]?.some((k) => Math.abs(k.t - (time - offset)) < 1 / 60))
      // Keyframe-navigator (zoals in After Effects): playhead precies op het vorige / volgende keyframe
      const keyTimes = groupTimes(effectiveLayer(l), g).map((t) => offset + t)
      const prevKey = [...keyTimes].reverse().find((t) => t < time - 1e-4)
      const nextKey = keyTimes.find((t) => t > time + 1e-4)
      const goTo = (t: number | undefined) => {
        if (t == null) return
        s().setPlaying(false)
        s().setTime(t)
      }
      const on = members.some((m) => l.tracks[m]?.length)
      const value =
        g === 'position'
          ? `${Math.round(st.x)}, ${Math.round(st.y)}`
          : g === 'scale'
            ? l.scaleLinked === false
              ? `${Math.round(st.scale * 100)}, ${Math.round(st.scaleY * 100)}%`
              : `${Math.round(st.scale * 100)}%`
            : g === 'rotation'
              ? `${Math.round(st.rotation)}°`
              : `${Math.round(st[g] * 100)}%`
      rows.push(
        <div key={l.id + g + 'n'} className="tl-name sub" style={{ paddingLeft: 30 + depth * 16 }}>
          <button className="kf-nav" title="Naar vorig keyframe" disabled={prevKey == null} onClick={() => goTo(prevKey)}>
            ◀
          </button>
          <button
            className={`kf-btn${on ? ' on' : ''}${hasKeyHere ? ' here' : ''}`}
            title={hasKeyHere ? 'Keyframe op de playhead weghalen' : 'Keyframe op de playhead zetten'}
            onClick={() => toggleKeyAtPlayhead(l, g, offset)}
          >
            ◆
          </button>
          <button className="kf-nav" title="Naar volgend keyframe" disabled={nextKey == null} onClick={() => goTo(nextKey)}>
            ▶
          </button>
          <span className="grow">{GROUP_LABEL[g]}</span>
          <span className={on ? 'kf-val' : 'faint'} style={{ fontVariantNumeric: 'tabular-nums' }}>
            {value}
          </span>
        </div>,
        <div key={l.id + g + 't'} className="tl-track sub">
          {groupDiamonds(l, g, offset)}
        </div>
      )
    }
    if (l.children) for (const c of l.children) renderLayer(c, depth + 1, start, [...ancestors, l])
  }
  const ctx = contextOf(project, comp.id, activeTab)
  ctx.list.forEach((l) => renderLayer(l, 0, ctx.offset, ctx.ancestors))

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
      <div className="tl-tabs">
        <button className={activeTab ? '' : 'on'} onClick={() => s().setActiveTab(null)} title="Het formaat zelf">
          {comp.width}×{comp.height}
        </button>
        {tabs
          .map((id) => allLayers(comp.layers).find((x) => x.id === id))
          .filter((g): g is Layer => !!g)
          .map((g) => (
            <span key={g.id} className={`tl-tab${activeTab === g.id ? ' on' : ''}`}>
              {renaming === g.id ? (
                <InlineRename
                  value={g.name}
                  onDone={(v) => {
                    if (v) renameLayer(g.id, v)
                    s().setRenaming(null)
                  }}
                />
              ) : (
                <button onClick={() => s().setActiveTab(g.id)} onDoubleClick={() => s().setRenaming(g.id)} title="Compositie · dubbelklik om de naam te wijzigen">
                  <Folder size={12} /> {g.name}
                </button>
              )}
              <button className="close" title="Tab sluiten" onClick={() => s().closeTab(g.id)}>
                ×
              </button>
            </span>
          ))}
        <span className="faint tl-tabs-hint">Dubbelklik op een compositie om hem hier te openen</span>
      </div>
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
        <span className="faint" style={{ whiteSpace: 'nowrap' }}>
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
          onClick={() => {
            s().setShownProps({})
            s().setExpanded(anyOpen ? {} : Object.fromEntries(allLayers(comp.layers).map((l) => [l.id, true])))
          }}
        >
          {anyOpen ? <ChevronsDownUp size={15} /> : <ChevronsUpDown size={15} />}
        </button>
        <div style={{ flex: 1 }} />
        {selectedKeys.length > 0 && (
          <>
            <span className="faint">◆ {selectedKeys.length}</span>
            <button className="ghost sm" title="Easy Ease (F9)" onClick={() => keyAssist('easy')}>
              Easy Ease
            </button>
            <button className="ghost sm" title="Easy Ease In: rustig aankomen (Shift+F9)" onClick={() => keyAssist('in')}>
              In
            </button>
            <button className="ghost sm" title="Easy Ease Out: rustig vertrekken (Ctrl/Cmd+Shift+F9)" onClick={() => keyAssist('out')}>
              Out
            </button>
          </>
        )}
        {selKf && selectedKey && (
          <>
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
      <div
        className="body"
        onContextMenu={(e) => e.target === e.currentTarget && openEmptyMenu(e)}
        onDragOver={(e) => {
          // Automatisch meescrollen als je een laag naar de rand sleept
          const el = e.currentTarget
          const r = el.getBoundingClientRect()
          if (e.clientY < r.top + 40) el.scrollTop -= 12
          else if (e.clientY > r.bottom - 30) el.scrollTop += 12
        }}
      >
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

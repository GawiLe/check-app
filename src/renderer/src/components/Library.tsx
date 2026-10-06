import { useRef, useState } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { layerStateAt } from '@shared/anim'
import { createLayer } from '@shared/factory'
import { applyLibraryItem, applyUserPreset, LIBRARY, LIBRARY_GROUPS, type UserPreset } from '@shared/library'
import type { Layer } from '@shared/types'
import { applyLibrary, deletePreset } from '../lib/actions'
import { useStore } from '../store'

export const DRAG_TYPE = 'application/x-banner-animation'

/** Bouwt een WAAPI-animatie voor de hover-preview uit dezelfde logica als de banner. */
function previewFrames(apply: (l: Layer) => void, writeon: boolean): { frames: Keyframe[]; duration: number } {
  const comp = { width: 60, height: 60, duration: 4 } as never
  const l = createLayer(writeon ? 'writeon' : 'shape', comp)
  Object.assign(l, { x: 0, y: 0, width: 20, height: 20 })
  apply(l)
  const ends = [
    l.intro ? l.intro.start + l.intro.duration : 0,
    l.emphasis ? l.emphasis.start + l.emphasis.duration : 0,
    l.outro ? l.outro.start + l.outro.duration : 0,
    ...Object.values(l.tracks).flatMap((k) => (k ?? []).map((x) => x.t))
  ]
  const total = Math.max(0.6, ...ends) + 0.6
  const frames: Keyframe[] = []
  const steps = 40
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * total
    const st = layerStateAt(l, t)
    const k = 0.35 // afstanden verkleinen voor het tegeltje
    const reveal = l.revealMode !== 'none' || l.type === 'writeon' ? `inset(0 ${(1 - st.reveal) * 100}% 0 0)` : 'inset(0)'
    frames.push({
      offset: i / steps,
      transform: `translate(${st.x * k}px,${st.y * k}px) rotate(${st.rotation}deg) scale(${st.scale})`,
      opacity: st.opacity,
      clipPath: reveal
    })
  }
  return { frames, duration: total * 1000 }
}

function Tile(props: { id: string; label: string; kind: string; apply: (l: Layer) => void; writeon?: boolean; onDelete?: () => void }) {
  const dot = useRef<HTMLDivElement>(null)
  const anim = useRef<Animation | null>(null)
  const selection = useStore((s) => s.selection)
  return (
    <div
      className={`lib-tile ${props.kind}`}
      draggable
      title={`Sleep op een laag (canvas of tijdlijn)${selection.length ? ', of klik om toe te passen op de selectie' : ''}`}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, props.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => selection.length && applyLibrary(props.id, selection)}
      onMouseEnter={() => {
        const { frames, duration } = previewFrames(props.apply, !!props.writeon)
        anim.current = dot.current?.animate(frames, { duration, iterations: Infinity }) ?? null
      }}
      onMouseLeave={() => anim.current?.cancel()}
    >
      <div className="lib-preview">
        <div ref={dot} className="lib-dot" />
        {props.onDelete && (
          <button
            className="icon sm lib-del"
            title="Preset verwijderen"
            onClick={(e) => {
              e.stopPropagation()
              props.onDelete!()
            }}
          >
            <X size={11} />
          </button>
        )}
      </div>
      <span>{props.label}</span>
    </div>
  )
}

function loadCollapsed(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem('bs-lib-collapsed') ?? '{}')
  } catch {
    return {}
  }
}

export function Library() {
  const presets = useStore((s) => s.presets)
  const [collapsed, setCollapsedState] = useState<Record<string, boolean>>(loadCollapsed)
  const toggle = (k: string) => {
    const next = { ...collapsed, [k]: !collapsed[k] }
    setCollapsedState(next)
    try {
      localStorage.setItem('bs-lib-collapsed', JSON.stringify(next))
    } catch {
      /* geen opslag */
    }
  }
  const comp = { width: 60, height: 60, duration: 4 } as never

  const group = (key: string, label: string, swatch: string, count: number, tiles: React.ReactNode) => (
    <div key={key} className="section">
      <div className="section-head lib-head" onClick={() => toggle(key)}>
        <span className="title">
          {collapsed[key] ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
          <span className={`lib-swatch ${swatch}`} /> {label}
          <span className="hint">{count}</span>
        </span>
      </div>
      {!collapsed[key] && <div className="lib-grid">{tiles}</div>}
    </div>
  )

  return (
    <div>
      {group(
        'custom',
        'Eigen presets',
        'custom',
        presets.length,
        presets.length ? (
          presets.map((p: UserPreset) => (
            <Tile
              key={p.id}
              id={`user:${p.id}`}
              label={p.name}
              kind="custom"
              apply={(l) => applyUserPreset(l, p, 0.15)}
              onDelete={() => window.confirm(`Preset "${p.name}" verwijderen?`) && deletePreset(p.id)}
            />
          ))
        ) : (
          <div className="empty" style={{ gridColumn: 'span 2' }}>
            Animeer een laag en kies in de tab Animatie <b>Opslaan als preset</b>. Hij verschijnt dan hier.
          </div>
        )
      )}
      {LIBRARY_GROUPS.map((g) => {
        const items = LIBRARY.filter((i) => i.kind === g.kind)
        return group(
          g.kind,
          g.label,
          g.kind,
          items.length,
          items.map((i) => (
            <Tile
              key={i.id}
              id={i.id}
              label={i.label}
              kind={i.kind}
              writeon={i.reveal === 'writeon'}
              apply={(l) => applyLibraryItem(l, i, comp, 0.15)}
            />
          ))
        )
      })}
      <div className="hint-text" style={{ padding: '0 12px 14px' }}>
        Sleep een animatie op een laag in het canvas of in de tijdlijn. In de tijdlijn begint hij waar je loslaat.
      </div>
    </div>
  )
}

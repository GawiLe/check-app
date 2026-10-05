import { useRef } from 'react'
import { layerStateAt } from '@shared/anim'
import { createLayer } from '@shared/factory'
import { applyLibraryItem, LIBRARY, LIBRARY_GROUPS, type LibraryItem } from '@shared/library'
import { applyLibrary } from '../lib/actions'
import { useStore } from '../store'

export const DRAG_TYPE = 'application/x-banner-animation'

/** Bouwt een WAAPI-animatie voor de hover-preview uit dezelfde logica als de banner. */
function previewFrames(item: LibraryItem): { frames: Keyframe[]; duration: number } {
  const comp = { width: 60, height: 60, duration: 4 } as never
  const l = createLayer(item.reveal === 'writeon' ? 'writeon' : 'shape', comp)
  Object.assign(l, { x: 0, y: 0, width: 20, height: 20 })
  applyLibraryItem(l, item, comp, 0.15)
  const end = item.kind === 'emphasis' ? l.emphasis!.duration : (l[item.kind as 'intro']?.duration ?? 0.6)
  const total = end + 0.6
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

function Tile({ item }: { item: LibraryItem }) {
  const dot = useRef<HTMLDivElement>(null)
  const anim = useRef<Animation | null>(null)
  const selection = useStore((s) => s.selection)
  return (
    <div
      className={`lib-tile ${item.kind}`}
      draggable
      title={`Sleep op een laag (canvas of tijdlijn)${selection.length ? ', of klik om toe te passen op de selectie' : ''}`}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, item.id)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => selection.length && applyLibrary(item.id, selection)}
      onMouseEnter={() => {
        const { frames, duration } = previewFrames(item)
        anim.current = dot.current?.animate(frames, { duration, iterations: Infinity }) ?? null
      }}
      onMouseLeave={() => anim.current?.cancel()}
    >
      <div className="lib-preview">
        <div ref={dot} className="lib-dot" />
      </div>
      <span>{item.label}</span>
    </div>
  )
}

export function Library() {
  return (
    <div>
      {LIBRARY_GROUPS.map((g) => (
        <div key={g.kind} className="section">
          <div className="section-head">
            <span className="title">
              <span className={`lib-swatch ${g.kind}`} /> {g.label}
            </span>
          </div>
          <div className="lib-grid">
            {LIBRARY.filter((i) => i.kind === g.kind).map((i) => (
              <Tile key={i.id} item={i} />
            ))}
          </div>
        </div>
      ))}
      <div className="hint-text" style={{ padding: '0 12px 14px' }}>
        Sleep een animatie op een laag in het canvas of in de tijdlijn. In de tijdlijn begint hij waar je loslaat. Daarna pas je hem aan in de tab Animatie.
      </div>
    </div>
  )
}

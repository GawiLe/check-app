import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Getal-veld zoals in After Effects: sleep horizontaal om de waarde te wijzigen,
 * klik om te typen. Shift = 10× sneller.
 */
export function Scrub(props: {
  value: number
  onChange: (v: number, coalesce: boolean) => void
  step?: number
  min?: number
  max?: number
  decimals?: number
  suffix?: string
  animated?: boolean
}) {
  const { value, onChange, step = 1, min = -Infinity, max = Infinity, decimals = 1, suffix = '', animated } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const drag = useRef<{ x: number; v: number; moved: boolean } | null>(null)
  const clamp = (v: number) => Math.min(max, Math.max(min, v))
  const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(decimals))

  if (editing)
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = parseFloat(draft.replace(',', '.'))
          if (!Number.isNaN(v)) onChange(clamp(v), false)
          setEditing(false)
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
          if (e.key === 'Escape') setEditing(false)
        }}
      />
    )

  return (
    <input
      readOnly
      className={`scrub${animated ? ' animated' : ''}`}
      value={fmt(value) + suffix}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, v: value, moved: false }
      }}
      onPointerMove={(e) => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x
        if (Math.abs(dx) > 2) d.moved = true
        if (d.moved) {
          const raw = d.v + dx * step * (e.shiftKey ? 10 : 1)
          onChange(clamp(Math.round(raw / step) * step), true)
        }
      }}
      onPointerUp={() => {
        if (drag.current && !drag.current.moved) {
          setDraft(fmt(value))
          setEditing(true)
        }
        drag.current = null
      }}
    />
  )
}

/** Tekstveld dat pas bij blur/Enter doorgeeft (één undo-stap per wijziging). */
export function TextInput(props: { value: string; onCommit: (v: string) => void; multiline?: boolean; placeholder?: string }) {
  const [v, setV] = useState(props.value)
  useEffect(() => setV(props.value), [props.value])
  const commit = () => v !== props.value && props.onCommit(v)
  if (props.multiline)
    return <textarea rows={3} value={v} placeholder={props.placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
  return (
    <input
      value={v}
      placeholder={props.placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

export function Field(props: { label: string; children: ReactNode; stopwatch?: ReactNode }) {
  if (props.stopwatch === undefined)
    return (
      <div className="field nosw">
        <label title={props.label}>{props.label}</label>
        <div className="row">{props.children}</div>
      </div>
    )
  return (
    <div className="field">
      {props.stopwatch}
      <label title={props.label}>{props.label}</label>
      <div className="row">{props.children}</div>
    </div>
  )
}

export function Section(props: { title: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="section">
      <h3>
        <span>{props.title}</span>
        {props.actions && <span>{props.actions}</span>}
      </h3>
      {props.children}
    </div>
  )
}

export function Modal(props: { title: string; wide?: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [props])
  return (
    <div className="modal-bg" onPointerDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal${props.wide ? ' wide' : ''}`}>
        <h2>{props.title}</h2>
        {props.children}
      </div>
    </div>
  )
}

export const formatTime = (t: number) => {
  const s = Math.floor(t)
  const f = Math.floor((t - s) * 30)
  return `${String(s).padStart(2, '0')}:${String(f).padStart(2, '0')}`
}

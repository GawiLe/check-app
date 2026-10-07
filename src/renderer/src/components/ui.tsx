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

/** Getal met een kort label erin ("X", "B", "°"), zoals in Figma. */
export function Num(props: Parameters<typeof Scrub>[0] & { label: string; title?: string }) {
  const { label, title, ...rest } = props
  return (
    <div className="num" title={title} style={{ ['--lbl' as string]: `${12 + label.length * 7}px` }}>
      <span className="lbl">{label}</span>
      <Scrub {...rest} />
    </div>
  )
}

export function Row(props: { label?: string; children: ReactNode }) {
  return (
    <div className="row">
      {props.label && <span className="label">{props.label}</span>}
      <div className="grow" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        {props.children}
      </div>
    </div>
  )
}

export function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="switch">
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      {props.label}
    </label>
  )
}

export function Section(props: {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Inklapbaar; undefined = altijd open. */
  defaultOpen?: boolean
}) {
  const collapsible = props.defaultOpen !== undefined
  const [open, setOpen] = useState(props.defaultOpen ?? true)
  return (
    <div className={`section${collapsible ? ' collapsible' : ''}${open ? ' open' : ''}`}>
      <div className="section-head" onClick={collapsible ? () => setOpen(!open) : undefined}>
        <span className="title">
          {collapsible && <span className="faint">{open ? '▾' : '▸'}</span>}
          {props.title}
        </span>
        {props.actions && <span onClick={(e) => e.stopPropagation()}>{props.actions}</span>}
      </div>
      {open && props.children}
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

/** Naam direct bewerken (Enter = opslaan, Esc = annuleren). */
export function InlineRename(props: { value: string; onDone: (v: string | null) => void; className?: string }) {
  const [v, setV] = useState(props.value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const done = (save: boolean) => props.onDone(save && v.trim() && v.trim() !== props.value ? v.trim() : null)
  return (
    <input
      ref={ref}
      className={`inline-rename ${props.className ?? ''}`}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => done(true)}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') done(true)
        if (e.key === 'Escape') done(false)
      }}
    />
  )
}

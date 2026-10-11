import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

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

/** Volgorde van de blokken in een paneel (Ontwerp, Animatie), zelf te schikken door de kop te slepen. */
const StackCtx = createContext<{
  orderOf: (key: string) => number
  move: (dragged: string, target: string, after: boolean) => void
} | null>(null)
const SECTION_DRAG = 'application/x-bs-section'
const loadOrder = (id: string): string[] => {
  try {
    const v = JSON.parse(localStorage.getItem(`bs-sections-${id}`) ?? '[]')
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []
  } catch {
    return []
  }
}

/**
 * Paneel waarin je de blokken (Sections) kunt verslepen naar de volgorde die je zelf wilt.
 * De volgorde wordt per paneel onthouden; blokken die er nog niet in staan komen achteraan in hun gewone volgorde.
 */
export function SectionStack(props: { id: string; className?: string; children: ReactNode }) {
  const [order, setOrder] = useState(() => loadOrder(props.id))
  const ref = useRef<HTMLDivElement>(null)
  const orderOf = (key: string) => {
    const i = order.indexOf(key)
    return i < 0 ? 1000 : 1 + i
  }
  const move = (dragged: string, target: string, after: boolean) => {
    if (dragged === target || !ref.current) return
    // Huidige zichtbare volgorde (van boven naar onder), dan het gesleepte blok verplaatsen
    const els = [...ref.current.querySelectorAll<HTMLElement>(':scope > [data-section]')].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top)
    const visible = els.map((e) => e.dataset.section!).filter((k) => k !== dragged)
    const at = visible.indexOf(target)
    if (at < 0) return
    visible.splice(after ? at + 1 : at, 0, dragged)
    // Blokken die nu niet zichtbaar zijn (andere laagsoort) houden hun plek achter de zichtbare
    const next = [...visible, ...order.filter((k) => !visible.includes(k))]
    setOrder(next)
    try {
      localStorage.setItem(`bs-sections-${props.id}`, JSON.stringify(next))
    } catch {
      /* alleen deze sessie */
    }
  }
  return (
    <StackCtx.Provider value={{ orderOf, move }}>
      <div ref={ref} className={`section-stack ${props.className ?? ''}`}>
        {props.children}
      </div>
    </StackCtx.Provider>
  )
}

export function Section(props: {
  title: ReactNode
  actions?: ReactNode
  children: ReactNode
  /** Inklapbaar; undefined = altijd open. */
  defaultOpen?: boolean
  /** Sleutel om de plek te onthouden als de titel geen tekst is. */
  id?: string
}) {
  const collapsible = props.defaultOpen !== undefined
  const [open, setOpen] = useState(props.defaultOpen ?? true)
  const stack = useContext(StackCtx)
  const key = props.id ?? (typeof props.title === 'string' ? props.title : undefined)
  const [drop, setDrop] = useState<'before' | 'after' | null>(null)
  const sortable = !!stack && !!key
  return (
    <div
      className={`section${collapsible ? ' collapsible' : ''}${open ? ' open' : ''}${drop ? ` drop-${drop}` : ''}`}
      data-section={sortable ? key : undefined}
      style={sortable ? { order: stack!.orderOf(key!) } : undefined}
      onDragOver={
        sortable
          ? (e) => {
              if (!e.dataTransfer.types.includes(SECTION_DRAG)) return
              e.preventDefault()
              const r = e.currentTarget.getBoundingClientRect()
              setDrop(e.clientY > r.top + r.height / 2 ? 'after' : 'before')
            }
          : undefined
      }
      onDragLeave={sortable ? () => setDrop(null) : undefined}
      onDrop={
        sortable
          ? (e) => {
              const dragged = e.dataTransfer.getData(SECTION_DRAG)
              setDrop(null)
              if (!dragged) return
              e.preventDefault()
              stack!.move(dragged, key!, drop === 'after')
            }
          : undefined
      }
    >
      <div
        className={`section-head${sortable ? ' sortable' : ''}`}
        draggable={sortable}
        title={sortable ? 'Sleep om dit blok te verplaatsen' : undefined}
        onDragStart={
          sortable
            ? (e) => {
                e.dataTransfer.setData(SECTION_DRAG, key!)
                e.dataTransfer.effectAllowed = 'move'
              }
            : undefined
        }
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
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

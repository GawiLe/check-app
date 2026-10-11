import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { getActiveDoc } from '../lib/windows'
import { useStore } from '../store'

/** Rechtermuisknop-menu. Wordt geopend via useStore.openMenu(x, y, items). */
export function ContextMenu() {
  const menu = useStore((s) => s.menu)
  const ref = useRef<HTMLDivElement>(null)
  // Openen in het venster waar geklikt is (hoofdvenster of een los paneel)
  const doc = useMemo(() => (menu ? getActiveDoc() : document), [menu])
  const w = doc.defaultView ?? window
  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if (e instanceof PointerEvent && ref.current?.contains(e.target as Node)) return
      useStore.getState().closeMenu()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && useStore.getState().closeMenu()
    w.addEventListener('pointerdown', close)
    w.addEventListener('blur', close)
    w.addEventListener('keydown', key)
    return () => {
      w.removeEventListener('pointerdown', close)
      w.removeEventListener('blur', close)
      w.removeEventListener('keydown', key)
    }
  }, [menu, w])
  if (!menu) return null
  // Binnen het venster houden
  const h = menu.items.reduce((a, i) => a + ('separator' in i ? 9 : 28), 8)
  const x = Math.min(menu.x, w.innerWidth - 240)
  const y = Math.min(menu.y, w.innerHeight - h - 8)
  const el = (
    <div ref={ref} className="ctx-menu" style={{ left: x, top: y }} onContextMenu={(e) => e.preventDefault()}>
      {menu.items.map((item, i) =>
        'separator' in item ? (
          <div key={i} className="ctx-sep" />
        ) : (
          <button
            key={i}
            disabled={item.disabled}
            className={item.danger ? 'danger' : ''}
            onClick={() => {
              useStore.getState().closeMenu()
              item.onClick()
            }}
          >
            <span>{item.label}</span>
            {item.shortcut && <span className="ctx-key">{item.shortcut}</span>}
          </button>
        )
      )}
    </div>
  )
  return doc === document ? el : createPortal(el, doc.body)
}

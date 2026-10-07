import { useEffect, useRef } from 'react'
import { useStore } from '../store'

/** Rechtermuisknop-menu. Wordt geopend via useStore.openMenu(x, y, items). */
export function ContextMenu() {
  const menu = useStore((s) => s.menu)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if (e instanceof PointerEvent && ref.current?.contains(e.target as Node)) return
      useStore.getState().closeMenu()
    }
    const key = (e: KeyboardEvent) => e.key === 'Escape' && useStore.getState().closeMenu()
    window.addEventListener('pointerdown', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', key)
    }
  }, [menu])
  if (!menu) return null
  // Binnen het venster houden
  const h = menu.items.reduce((a, i) => a + ('separator' in i ? 9 : 28), 8)
  const x = Math.min(menu.x, window.innerWidth - 240)
  const y = Math.min(menu.y, window.innerHeight - h - 8)
  return (
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
}

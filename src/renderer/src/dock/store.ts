import { create } from 'zustand'
import { activate, ALL_PANELS, defaultLayout, dropPanel, removePanel, resize, showPanel, validLayout, visiblePanels, withPanel, type DockNode, type PanelId, type Zone } from './model'

const KEY = 'bs-dock-v1'

const SEEN = 'bs-dock-seen-formats'

function load(): DockNode {
  try {
    let root = validLayout(JSON.parse(localStorage.getItem(KEY) ?? 'null')) ?? defaultLayout()
    // Eenmalig: het paneel Formaten toevoegen aan een indeling van vóór dat paneel
    if (!localStorage.getItem(SEEN)) {
      root = withPanel(root, 'formats', 'library')
      localStorage.setItem(SEEN, '1')
    }
    return root
  } catch {
    return defaultLayout()
  }
}

function save(root: DockNode) {
  try {
    localStorage.setItem(KEY, JSON.stringify(root))
  } catch {
    /* geen opslag: indeling geldt alleen deze sessie */
  }
}

const DETACHED = 'bs-dock-detached'
const loadDetached = (): PanelId[] => {
  try {
    const v = JSON.parse(localStorage.getItem(DETACHED) ?? '[]')
    return Array.isArray(v) ? v.filter((p) => ALL_PANELS.includes(p)) : []
  } catch {
    return []
  }
}

interface DockState {
  root: DockNode
  /** Panelen in een eigen venster (bijv. op een tweede scherm). */
  detached: PanelId[]
  /** Paneel loskoppelen naar een eigen venster; `at` = schermpositie (bijv. waar je de tab losliet). */
  detach(panel: PanelId, at?: { x: number; y: number }): void
  /** Paneel terug in de werkruimte. */
  attach(panel: PanelId): void
  /** Gewenste plek voor een nieuw los venster (eenmalig). */
  detachAt: Partial<Record<PanelId, { x: number; y: number }>>
  /** Gemaximaliseerd paneel (dubbelklik op tab, of ` zoals in AE). */
  maximized: PanelId | null
  drop(panel: PanelId, targetId: string, zone: Zone): void
  close(panel: PanelId): void
  show(panel: PanelId): void
  toggle(panel: PanelId, visible: boolean): void
  activate(panel: PanelId): void
  resize(splitId: string, sizes: number[]): void
  reset(): void
  setMaximized(p: PanelId | null): void
}

export const useDock = create<DockState>((set, get) => {
  const apply = (root: DockNode) => {
    save(root)
    set({ root })
  }
  const saveDetached = (d: PanelId[]) => {
    try {
      localStorage.setItem(DETACHED, JSON.stringify(d))
    } catch {
      /* alleen deze sessie */
    }
  }
  const initial = load()
  // Een paneel dat los stond, staat niet ook in de indeling
  const detached0 = loadDetached()
  return {
    root: detached0.reduce((r, p) => (visiblePanels(r).includes(p) && visiblePanels(r).length > 1 ? removePanel(r, p) : r), initial),
    detached: detached0,
    detachAt: {},
    detach: (panel, at) => {
      if (get().detached.includes(panel)) return
      const root = get().root
      // Het laatste paneel in de werkruimte blijft staan
      if (visiblePanels(root).filter((p) => p !== panel).length === 0) return
      if (get().maximized === panel) set({ maximized: null })
      const detached = [...get().detached, panel]
      saveDetached(detached)
      set({ detached, detachAt: at ? { ...get().detachAt, [panel]: at } : get().detachAt })
      apply(removePanel(root, panel))
    },
    attach: (panel) => {
      if (!get().detached.includes(panel)) return
      const detached = get().detached.filter((p) => p !== panel)
      saveDetached(detached)
      set({ detached })
      apply(showPanel(get().root, panel))
    },
    maximized: null,
    drop: (panel, targetId, zone) => apply(dropPanel(get().root, panel, targetId, zone)),
    close: (panel) => {
      if (get().detached.includes(panel)) {
        const detached = get().detached.filter((p) => p !== panel)
        saveDetached(detached)
        return set({ detached })
      }
      if (get().maximized === panel) set({ maximized: null })
      apply(removePanel(get().root, panel))
    },
    show: (panel) => (get().detached.includes(panel) ? get().attach(panel) : apply(showPanel(get().root, panel))),
    toggle: (panel, visible) => (visible ? get().show(panel) : get().close(panel)),
    activate: (panel) => apply(activate(get().root, panel)),
    resize: (splitId, sizes) => apply(resize(get().root, splitId, sizes)),
    reset: () => {
      saveDetached([])
      set({ maximized: null, detached: [] })
      apply(defaultLayout())
    },
    setMaximized: (p) => set({ maximized: p })
  }
})

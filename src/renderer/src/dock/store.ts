import { create } from 'zustand'
import { activate, defaultLayout, dropPanel, removePanel, resize, showPanel, validLayout, type DockNode, type PanelId, type Zone } from './model'

const KEY = 'bs-dock-v1'

function load(): DockNode {
  try {
    return validLayout(JSON.parse(localStorage.getItem(KEY) ?? 'null')) ?? defaultLayout()
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

interface DockState {
  root: DockNode
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
  return {
    root: load(),
    maximized: null,
    drop: (panel, targetId, zone) => apply(dropPanel(get().root, panel, targetId, zone)),
    close: (panel) => {
      if (get().maximized === panel) set({ maximized: null })
      apply(removePanel(get().root, panel))
    },
    show: (panel) => apply(showPanel(get().root, panel)),
    toggle: (panel, visible) => (visible ? get().show(panel) : get().close(panel)),
    activate: (panel) => apply(activate(get().root, panel)),
    resize: (splitId, sizes) => apply(resize(get().root, splitId, sizes)),
    reset: () => {
      set({ maximized: null })
      apply(defaultLayout())
    },
    setMaximized: (p) => set({ maximized: p })
  }
})

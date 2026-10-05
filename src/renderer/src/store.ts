import { create } from 'zustand'
import { upsertKeyframe } from '@shared/anim'
import { normalizeProject, syncFormats } from '@shared/sync'
import type { AnimProp, Composition, ExportResult, Layer, Project } from '@shared/types'
import { ANIM_PROPS } from '@shared/types'

export type Dialog = null | 'new' | 'export' | 'settings' | 'saveBoilerplate' | 'addFormat'

export interface SelectedKey {
  layerId: string
  prop: AnimProp
  t: number
}

interface State {
  dir: string | null
  project: Project | null
  compId: string | null
  selection: string[]
  selectedKey: SelectedKey | null
  time: number
  playing: boolean
  zoom: number
  dirty: boolean
  past: Project[]
  future: Project[]
  lastCoalesce: { key: string; at: number } | null
  assets: string[]
  assetsRev: number
  dialog: Dialog
  status: { text: string; kind: 'info' | 'error' } | null
  exportResults: ExportResult[] | null
  /** Alle formaten naast elkaar tonen. */
  overview: boolean
  /** Auto-keyframe (zoals de opname-knop in AE): elke wijziging zet een keyframe. */
  autoKey: boolean
  tab: InspectorTab

  openProject(dir: string, project: Project): void
  /** Wijzig het project. Met `coalesce` worden snelle opeenvolgende wijzigingen één undo-stap. */
  update(fn: (p: Project) => void, coalesce?: string): void
  undo(): void
  redo(): void
  markSaved(): void
  setComp(id: string): void
  select(ids: string[]): void
  selectKey(k: SelectedKey | null): void
  setTime(t: number): void
  setPlaying(p: boolean): void
  setZoom(z: number): void
  setDialog(d: Dialog): void
  setStatus(text: string, kind?: 'info' | 'error'): void
  setAssets(a: string[]): void
  bumpAssets(): void
  setExportResults(r: ExportResult[] | null): void
  setOverview(o: boolean): void
  setAutoKey(a: boolean): void
  setTab(t: InspectorTab): void
}

export type InspectorTab = 'design' | 'motion' | 'ai'

const HISTORY = 100

export const useStore = create<State>((set, get) => ({
  dir: null,
  project: null,
  compId: null,
  selection: [],
  selectedKey: null,
  time: 0,
  playing: false,
  zoom: 1,
  dirty: false,
  past: [],
  future: [],
  lastCoalesce: null,
  assets: [],
  assetsRev: 0,
  dialog: null,
  status: null,
  exportResults: null,
  overview: false,
  autoKey: false,
  tab: 'design',

  openProject: (dir, project) =>
    set({
      dir,
      project: normalizeProject(project),
      compId: project.baseCompositionId ?? project.compositions[0]?.id ?? null,
      selection: [],
      selectedKey: null,
      time: 0,
      playing: false,
      dirty: false,
      past: [],
      future: [],
      exportResults: null
    }),

  update: (fn, coalesce) => {
    const { project, past, lastCoalesce } = get()
    if (!project) return
    const next = structuredClone(project)
    fn(next)
    const { compId } = get()
    if (compId) syncFormats(project, next, compId)
    const now = Date.now()
    const merge = coalesce && lastCoalesce && lastCoalesce.key === coalesce && now - lastCoalesce.at < 1000
    set({
      project: next,
      dirty: true,
      past: merge ? past : [...past.slice(-HISTORY), project],
      future: [],
      lastCoalesce: coalesce ? { key: coalesce, at: now } : null
    })
  },

  undo: () => {
    const { past, project, future } = get()
    if (!past.length || !project) return
    set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future], dirty: true, lastCoalesce: null })
  },

  redo: () => {
    const { past, project, future } = get()
    if (!future.length || !project) return
    set({ project: future[0], future: future.slice(1), past: [...past, project], dirty: true, lastCoalesce: null })
  },

  markSaved: () => set({ dirty: false }),
  setComp: (id) => set({ compId: id, selection: [], selectedKey: null }),
  select: (ids) => set({ selection: ids, selectedKey: null }),
  selectKey: (k) => set({ selectedKey: k, selection: k ? [k.layerId] : get().selection }),
  setTime: (t) => set({ time: Math.max(0, t) }),
  setPlaying: (p) => set({ playing: p }),
  setZoom: (z) => set({ zoom: Math.min(4, Math.max(0.25, z)) }),
  setDialog: (d) => set({ dialog: d }),
  setStatus: (text, kind = 'info') => set({ status: { text, kind } }),
  setAssets: (a) => set({ assets: a }),
  bumpAssets: () => set({ assetsRev: get().assetsRev + 1 }),
  setExportResults: (r) => set({ exportResults: r }),
  setOverview: (o) => set({ overview: o }),
  setAutoKey: (a) => set({ autoKey: a }),
  setTab: (t) => set({ tab: t })
}))

// ---------- Selectors & helpers ----------

export const currentComp = (s: Pick<State, 'project' | 'compId'>): Composition | null =>
  s.project?.compositions.find((c) => c.id === s.compId) ?? null

export function findComp(p: Project, id: string | null): Composition {
  const c = p.compositions.find((x) => x.id === id)
  if (!c) throw new Error('Geen compositie')
  return c
}

export function findLayer(p: Project, compId: string | null, layerId: string): Layer | undefined {
  return findComp(p, compId).layers.find((l) => l.id === layerId)
}

export const isAnimProp = (k: string): k is AnimProp => (ANIM_PROPS as string[]).includes(k)

/**
 * Zet een eigenschap zoals in After Effects: staat de stopwatch aan (er zijn
 * keyframes), dan komt er een keyframe op de huidige tijd; anders wijzigt de basiswaarde.
 */
export function setLayerValue(layerId: string, prop: AnimProp, value: number, coalesce?: string) {
  const { compId, time, autoKey } = useStore.getState()
  useStore.getState().update((p) => {
    const l = findLayer(p, compId, layerId)
    if (!l) return
    const kfs = l.tracks[prop]
    if (kfs && kfs.length) l.tracks[prop] = upsertKeyframe(kfs, time, value)
    else if (autoKey && time > 0.01) {
      // Eerste wijziging met auto-key: oude waarde op 0s, nieuwe op de huidige tijd.
      l.tracks[prop] = upsertKeyframe(upsertKeyframe([], 0, l[prop]), time, value)
    } else l[prop] = value
  }, coalesce)
}

/** Stopwatch aan/uit: aan = eerste keyframe op huidige tijd met huidige waarde. */
export function toggleStopwatch(layerId: string, prop: AnimProp, currentValue: number) {
  const { compId, time } = useStore.getState()
  useStore.getState().update((p) => {
    const l = findLayer(p, compId, layerId)
    if (!l) return
    if (l.tracks[prop]?.length) {
      l[prop] = currentValue
      delete l.tracks[prop]
    } else l.tracks[prop] = upsertKeyframe([], time, currentValue)
  })
}

export function updateLayer(layerId: string, fn: (l: Layer) => void, coalesce?: string) {
  const { compId } = useStore.getState()
  useStore.getState().update((p) => {
    const l = findLayer(p, compId, layerId)
    if (l) fn(l)
  }, coalesce)
}

export function updateComp(fn: (c: Composition) => void, coalesce?: string) {
  const { compId } = useStore.getState()
  useStore.getState().update((p) => fn(findComp(p, compId)), coalesce)
}

export const assetUrl = (path: string, rev: number) => `bsproj://${path.split('/').map(encodeURIComponent).join('/')}?v=${rev}`

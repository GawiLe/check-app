import { snapProject } from '@shared/pixels'
import { create } from 'zustand'
import { baseValue, layerStateAt, upsertKeyframe } from '@shared/anim'
import { groupOf, groupProps } from '@shared/propgroups'
import type { UserPreset } from '@shared/library'
import { useDock } from './dock/store'
import { normalizeProject, syncFormats } from '@shared/sync'
import { findDeep, localTime } from '@shared/tree'
import type { AnimProp, Composition, ExportResult, Layer, Project } from '@shared/types'
import { ANIM_PROPS } from '@shared/types'

export type Dialog = null | 'new' | 'export' | 'settings' | 'saveBoilerplate' | 'addFormat' | 'replaceImage' | 'variants' | 'shortcuts' | 'versions'

export interface SelectedKey {
  layerId: string
  prop: AnimProp
  t: number
}

export interface State {
  dir: string | null
  project: Project | null
  compId: string | null
  selection: string[]
  selectedKey: SelectedKey | null
  /** Alle geselecteerde keyframes (Shift-klik voegt toe). */
  selectedKeys: SelectedKey[]
  /** Gekopieerde lagen (Cmd+C / Cmd+X). */
  clipboard: Layer[]
  /** Open rechtermuisknop-menu. */
  menu: { x: number; y: number; items: MenuItem[] } | null
  /** Geopende composities (groepen) als tabs bij de tijdlijn; null = het formaat zelf. */
  tabs: string[]
  activeTab: string | null
  /** Gereedschap op het canvas. */
  tool: Tool
  /** Tekstlaag die nu op het canvas bewerkt wordt. */
  editingText: string | null
  /** Laag, compositie of formaat waarvan de naam nu bewerkt wordt. */
  renaming: string | null
  /** Open keuzevenster bij het importeren van een SVG. */
  /** Laag waarvan de afbeelding vervangen wordt (venster 'replaceImage'). */
  replaceId: string | null
  /** Tekstlagen die in de preview niet in hun kader passen (gemeld door de banner-runtime). */
  overflowIds: string[]
  svgChoice: { name: string; resolve: (mode: SvgMode | null, remember: boolean) => void } | null
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
  /** Uitgeklapte lagen in de tijdlijn (eigenschappen en/of inhoud van groepen). */
  expanded: Record<string, boolean>
  /** Eigen animatie-presets (gedeeld over projecten). */
  presets: UserPreset[]

  openProject(dir: string, project: Project): void
  /** Wijzig het project. Met `coalesce` worden snelle opeenvolgende wijzigingen één undo-stap. */
  update(fn: (p: Project) => void, coalesce?: string, skipSync?: boolean): void
  undo(): void
  redo(): void
  markSaved(): void
  setComp(id: string): void
  select(ids: string[]): void
  selectKey(k: SelectedKey | null, additive?: boolean): void
  setClipboard(l: Layer[]): void
  openMenu(x: number, y: number, items: MenuItem[]): void
  closeMenu(): void
  openTab(id: string): void
  closeTab(id: string): void
  setActiveTab(id: string | null): void
  setTool(t: Tool): void
  setEditingText(id: string | null): void
  setRenaming(id: string | null): void
  setSvgChoice(c: State['svgChoice']): void
  openReplace(layerId: string): void
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
  setExpanded(e: Record<string, boolean>): void
  setPresets(p: UserPreset[]): void
}

export type InspectorTab = 'design' | 'motion' | 'ai'

export type Tool = 'select' | 'rect' | 'ellipse' | 'pen' | 'text'

export type SvgMode = 'image' | 'shapes'

export type MenuItem =
  | { label: string; shortcut?: string; onClick: () => void; disabled?: boolean; danger?: boolean }
  | { separator: true }

const HISTORY = 100

export const useStore = create<State>((set, get) => ({
  dir: null,
  project: null,
  compId: null,
  selection: [],
  selectedKey: null,
  selectedKeys: [],
  clipboard: [],
  menu: null,
  tabs: [],
  activeTab: null,
  tool: 'select',
  editingText: null,
  renaming: null,
  svgChoice: null,
  replaceId: null,
  overflowIds: [],
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
  expanded: {},
  presets: [],

  openProject: (dir, project) =>
    set({
      dir,
      project: snapProject(normalizeProject(project)),
      compId: project.baseCompositionId ?? project.compositions[0]?.id ?? null,
      selection: [],
      selectedKey: null,
      selectedKeys: [],
      tabs: [],
      activeTab: null,
      editingText: null,
      time: 0,
      playing: false,
      dirty: false,
      past: [],
      future: [],
      exportResults: null
    }),

  update: (fn, coalesce, skipSync) => {
    const { project, past, lastCoalesce } = get()
    if (!project) return
    const next = structuredClone(project)
    fn(next)
    snapProject(next)
    const { compId } = get()
    if (compId && !skipSync) syncFormats(project, next, compId)
    snapProject(next)
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
  setComp: (id) => set({ compId: id, selection: [], selectedKey: null, selectedKeys: [], tabs: [], activeTab: null, editingText: null }),
  select: (ids) => set({ selection: ids, selectedKey: null, selectedKeys: [] }),
  selectKey: (k, additive) => {
    if (!k) return set({ selectedKey: null, selectedKeys: [] })
    const same = (a: SelectedKey) => a.layerId === k.layerId && a.prop === k.prop && Math.abs(a.t - k.t) < 1e-4
    const prev = get().selectedKeys
    const keys = additive ? (prev.some(same) ? prev.filter((x) => !same(x)) : [...prev, k]) : prev.some(same) && prev.length > 1 ? prev : [k]
    const layers = [...new Set(keys.map((x) => x.layerId))]
    set({ selectedKey: k, selectedKeys: keys, selection: layers.length ? layers : get().selection })
  },
  setClipboard: (l) => set({ clipboard: l }),
  openMenu: (x, y, items) => set({ menu: { x, y, items } }),
  closeMenu: () => set({ menu: null }),
  openTab: (id) => set({ tabs: get().tabs.includes(id) ? get().tabs : [...get().tabs, id], activeTab: id, selection: [], selectedKeys: [], selectedKey: null }),
  closeTab: (id) => {
    const tabs = get().tabs.filter((t) => t !== id)
    set({ tabs, activeTab: get().activeTab === id ? (tabs[tabs.length - 1] ?? null) : get().activeTab })
  },
  setActiveTab: (id) => set({ activeTab: id, selection: [], selectedKeys: [], selectedKey: null }),
  setTool: (t) => set({ tool: t, editingText: null }),
  setEditingText: (id) => set({ editingText: id }),
  setRenaming: (id) => set({ renaming: id }),
  setSvgChoice: (c) => set({ svgChoice: c }),
  openReplace: (layerId) => set({ replaceId: layerId, dialog: 'replaceImage' }),
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
  setTab: (t) => {
    set({ tab: t })
    // Het bijbehorende paneel naar voren halen (of tonen als het gesloten was)
    useDock.getState().show(t)
  },
  setExpanded: (e) => set({ expanded: e }),
  setPresets: (p) => set({ presets: p })
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
  return findDeep(findComp(p, compId).layers, layerId)?.layer
}

/** Tijd binnen de groep waar de laag in zit (de playhead min de in-punten van de groepen). */
export function layerLocalTime(p: Project, compId: string | null, layerId: string, t: number): number {
  const f = findDeep(findComp(p, compId).layers, layerId)
  return f ? localTime(t, f.ancestors) : t
}

export const isAnimProp = (k: string): k is AnimProp => (ANIM_PROPS as string[]).includes(k)

/**
 * Zet een eigenschap zoals in After Effects: staat de stopwatch aan (er zijn
 * keyframes), dan komt er een keyframe op de huidige tijd; anders wijzigt de basiswaarde.
 */
export function setLayerValue(layerId: string, prop: AnimProp, value: number, coalesce?: string) {
  const { compId, autoKey, project } = useStore.getState()
  const time = layerLocalTime(project!, compId, layerId, useStore.getState().time)
  useStore.getState().update((p) => {
    const l = findLayer(p, compId, layerId)
    if (!l) return
    // Gekoppelde schaal: X en Y tegelijk (scaleY volgt scale)
    const members = groupProps(l, groupOf(prop))
    const animated = members.some((m) => l.tracks[m]?.length)
    if (animated || (autoKey && time > 0.01)) {
      // Eén keyframe voor de hele groep (bijv. Positie = X én Y op hetzelfde moment)
      const st = layerStateAt(l, time)
      for (const m of members) {
        const v = m === prop ? value : st[m]
        const kfs = l.tracks[m]
        if (kfs?.length) l.tracks[m] = upsertKeyframe(kfs, time, v)
        else if (animated) l.tracks[m] = upsertKeyframe([], time, v)
        else l.tracks[m] = upsertKeyframe(upsertKeyframe([], 0, baseValue(l, m)), time, v)
      }
    } else if (prop === 'scaleY') l.scaleY = value
    else l[prop] = value
  }, coalesce)
}

/** Stopwatch aan/uit voor een hele groep (Positie, Schaal, …): aan = keyframe op de huidige tijd. */
export function toggleStopwatch(layerId: string, prop: AnimProp) {
  const { compId, project } = useStore.getState()
  const time = layerLocalTime(project!, compId, layerId, useStore.getState().time)
  useStore.getState().update((p) => {
    const l = findLayer(p, compId, layerId)
    if (!l) return
    const members = groupProps(l, groupOf(prop))
    const st = layerStateAt(l, time)
    if (members.some((m) => l.tracks[m]?.length)) {
      for (const m of members) {
        if (m === 'scaleY') l.scaleY = st[m]
        else l[m] = st[m]
        delete l.tracks[m]
      }
    } else for (const m of members) l.tracks[m] = upsertKeyframe([], time, st[m])
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

/** De lagenlijst waarin je nu werkt: het formaat zelf, of de geopende compositie (tab). */
export function contextOf(p: Project, compId: string | null, activeTab: string | null) {
  const comp = findComp(p, compId)
  const f = activeTab ? findDeep(comp.layers, activeTab) : null
  if (!f || !f.layer.children) return { list: comp.layers, group: null as Layer | null, ancestors: [] as Layer[], offset: 0 }
  const ancestors = [...f.ancestors, f.layer]
  const offset = ancestors.reduce((a, g) => a + (g.start ?? 0), 0)
  return { list: f.layer.children, group: f.layer, ancestors, offset }
}

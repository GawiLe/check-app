import { create } from 'zustand'
import { newId } from '@shared/factory'
import { snapProject } from '@shared/pixels'
import { normalizeProject } from '@shared/sync'
import type { Project } from '@shared/types'
import { useStore, type State } from '../store'
import { refreshAssets, save } from './actions'

// Meerdere projecten tegelijk open, als tabbladen bovenin. Het actieve project leeft in de
// gewone store; van de andere tabbladen bewaren we de volledige werkstatus (geschiedenis,
// selectie, tijd, zoom …) en zetten die terug bij het wisselen.

const KEYS = [
  'dir',
  'project',
  'compId',
  'selection',
  'selectedKey',
  'selectedKeys',
  'tabs',
  'activeTab',
  'expanded',
  'time',
  'dirty',
  'past',
  'future',
  'lastCoalesce',
  'assets',
  'overview',
  'zoom'
] as const
type Snap = Pick<State, (typeof KEYS)[number]>

export interface Doc {
  id: string
  dir: string
  /** Werkstatus van een tabblad op de achtergrond; null voor het actieve tabblad (dat staat in de store). */
  snap: Snap | null
}

export const useDocs = create<{ docs: Doc[]; active: string | null }>(() => ({ docs: [], active: null }))

const S = useStore.getState
const D = useDocs.getState
const samePath = (a: string, b: string) => a.replace(/[\\/]+$/, '') === b.replace(/[\\/]+$/, '')

function freshSnap(dir: string, project: Project): Snap {
  const p = snapProject(normalizeProject(project))
  return {
    dir,
    project: p,
    compId: p.baseCompositionId ?? p.compositions[0]?.id ?? null,
    selection: [],
    selectedKey: null,
    selectedKeys: [],
    tabs: [],
    activeTab: null,
    expanded: {},
    time: 0,
    dirty: false,
    past: [],
    future: [],
    lastCoalesce: null,
    assets: [],
    overview: false,
    zoom: S().zoom
  }
}

/** Huidige werkstatus van het actieve tabblad wegzetten. */
function stash() {
  const { active, docs } = D()
  if (!active) return
  const s = S()
  const snap = Object.fromEntries(KEYS.map((k) => [k, s[k]])) as Snap
  useDocs.setState({ docs: docs.map((d) => (d.id === active ? { ...d, snap } : d)) })
}

/** Werkstatus van een tabblad in de store zetten en het project in het hoofdproces actief maken. */
async function load(doc: Doc) {
  useStore.setState({ ...doc.snap!, playing: false, editingText: null, renaming: null, menu: null, dialog: null, exportResults: null, replaceId: null })
  useDocs.setState({ docs: D().docs.map((d) => (d.id === doc.id ? { ...d, snap: null } : d)), active: doc.id })
  await window.bs.activateProject(doc.dir)
  S().bumpAssets()
  await refreshAssets()
}

/** Naam en status van een tabblad (het actieve leest live uit de store). */
export function docInfo(doc: Doc, live: Pick<State, 'project' | 'dirty'>) {
  const p = doc.snap ? doc.snap.project : live.project
  return { name: p?.name ?? doc.dir.split(/[\\/]/).pop() ?? 'Project', dirty: doc.snap ? doc.snap.dirty : live.dirty }
}

/**
 * Project openen in een tabblad. Staat het al open, dan wordt naar dat tabblad gewisseld.
 * `background`: openen zonder te wisselen (bijv. net aangemaakte varianten). `refresh`: een al open,
 * ongewijzigd tabblad bijwerken met de nieuwe inhoud van schijf.
 */
export async function openDocument(dir: string, project: Project, opts: { background?: boolean; refresh?: boolean } = {}) {
  const existing = D().docs.find((d) => samePath(d.dir, dir))
  if (existing) {
    if (opts.refresh && existing.snap && !existing.snap.dirty)
      useDocs.setState({ docs: D().docs.map((d) => (d.id === existing.id ? { ...d, snap: freshSnap(dir, project) } : d)) })
    if (!opts.background) await switchDocument(existing.id)
    return
  }
  const id = newId('d')
  if (opts.background && D().active) {
    useDocs.setState({ docs: [...D().docs, { id, dir, snap: freshSnap(dir, project) }] })
    return
  }
  stash()
  useDocs.setState({ docs: [...D().docs, { id, dir, snap: null }], active: id })
  S().openProject(dir, project)
}

export async function switchDocument(id: string) {
  const { active, docs } = D()
  if (id === active) return
  const doc = docs.find((d) => d.id === id)
  if (!doc?.snap) return
  stash()
  await load(doc)
}

/** Volgende/vorige tabblad (Ctrl+Tab / Ctrl+Shift+Tab). */
export function cycleDocument(dir: 1 | -1) {
  const { docs, active } = D()
  if (docs.length < 2) return
  const i = docs.findIndex((d) => d.id === active)
  void switchDocument(docs[(i + dir + docs.length) % docs.length].id)
}

/** Tabblad sluiten; bij niet-opgeslagen wijzigingen eerst vragen. false = geannuleerd. */
export async function closeDocument(id: string): Promise<boolean> {
  if (!D().docs.some((d) => d.id === id)) return true
  if (D().active !== id) await switchDocument(id)
  if (S().dirty) {
    const answer = await window.bs.askSave()
    if (answer === 'cancel') return false
    if (answer === 'save') {
      await save()
      if (S().dirty) return false
    }
    // Bewust niet opgeslagen: herstelkopie weggooien
    if (answer === 'discard' && S().dir) await window.bs.clearAutosave(S().dir!)
  }
  const { docs } = D()
  const index = docs.findIndex((d) => d.id === id)
  const closing = docs[index]
  const rest = docs.filter((d) => d.id !== id)
  await window.bs.closeProject(closing.dir)
  useDocs.setState({ docs: rest, active: null })
  if (!rest.length) {
    useStore.setState({ ...freshSnap('', { ...S().project! }), dir: null, project: null, compId: null, playing: false, dialog: null })
    return true
  }
  await load(rest[Math.min(index, rest.length - 1)])
  return true
}

/** Herstelkopie bewaren van elk tabblad met niet-opgeslagen wijzigingen (elke minuut). */
export async function autosaveAll() {
  const { docs, active } = D()
  for (const d of docs) {
    const live = d.id === active
    const dirty = live ? S().dirty : d.snap?.dirty
    const project = live ? S().project : d.snap?.project
    if (dirty && project) await window.bs.autosave(d.dir, project).catch(() => {})
  }
}

/** Zijn er in een van de tabbladen niet-opgeslagen wijzigingen? */
export function anyDirty() {
  const { docs, active } = D()
  return docs.some((d) => (d.id === active ? S().dirty : !!d.snap?.dirty))
}

/** Alle tabbladen met wijzigingen opslaan (bij afsluiten). */
export async function saveAll() {
  for (const d of D().docs) {
    if (d.id === D().active) {
      if (S().dirty) await save()
    } else if (d.snap?.dirty && d.snap.project) {
      await window.bs.saveProject(d.dir, d.snap.project)
      useDocs.setState({ docs: D().docs.map((x) => (x.id === d.id ? { ...x, snap: { ...x.snap!, dirty: false } } : x)) })
    }
  }
}

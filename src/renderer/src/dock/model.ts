// Indeling van de werkruimte, zoals in After Effects: een boom van splitsingen
// (naast/onder elkaar) met op de bladeren tabgroepen van panelen. Pure functies,
// zodat ze los te testen zijn.

export type PanelId = 'viewer' | 'code' | 'timeline' | 'library' | 'assets' | 'design' | 'motion' | 'ai'

export const PANEL_TITLE: Record<PanelId, string> = {
  viewer: 'Canvas',
  code: 'Code',
  timeline: 'Tijdlijn',
  library: 'Animaties',
  assets: 'Assets & fonts',
  design: 'Ontwerp',
  motion: 'Animatie',
  ai: 'AI'
}

export const ALL_PANELS: PanelId[] = ['viewer', 'code', 'timeline', 'library', 'assets', 'design', 'motion', 'ai']

export interface TabsNode {
  kind: 'tabs'
  id: string
  panels: PanelId[]
  active: PanelId
}
export interface SplitNode {
  kind: 'split'
  id: string
  /** row = naast elkaar, col = onder elkaar */
  dir: 'row' | 'col'
  children: DockNode[]
  /** Verhoudingen (som = 1). */
  sizes: number[]
}
export type DockNode = TabsNode | SplitNode
export type Zone = 'center' | 'left' | 'right' | 'top' | 'bottom'

let counter = 0
const nid = (p: string) => `${p}${Date.now().toString(36)}${(counter++).toString(36)}`
export const tabs = (panels: PanelId[], active = panels[0]): TabsNode => ({ kind: 'tabs', id: nid('t'), panels, active })
export const split = (dir: 'row' | 'col', children: DockNode[], sizes?: number[]): SplitNode => ({
  kind: 'split',
  id: nid('s'),
  dir,
  children,
  sizes: sizes ?? children.map(() => 1 / children.length)
})

/** Standaardindeling: tijdlijn alleen onder het canvas, panelen links en rechts. */
export function defaultLayout(): DockNode {
  return split(
    'row',
    [tabs(['library', 'assets']), split('col', [tabs(['viewer', 'code']), tabs(['timeline'])], [0.62, 0.38]), tabs(['design', 'motion', 'ai'])],
    [0.17, 0.6, 0.23]
  )
}

export function findTabsWith(node: DockNode, panel: PanelId): TabsNode | null {
  if (node.kind === 'tabs') return node.panels.includes(panel) ? node : null
  for (const c of node.children) {
    const f = findTabsWith(c, panel)
    if (f) return f
  }
  return null
}

export function findNode(node: DockNode, id: string): DockNode | null {
  if (node.id === id) return node
  if (node.kind === 'split') for (const c of node.children) {
    const f = findNode(c, id)
    if (f) return f
  }
  return null
}

export function visiblePanels(node: DockNode): PanelId[] {
  return node.kind === 'tabs' ? [...node.panels] : node.children.flatMap(visiblePanels)
}

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/** Lege tabgroepen weg, splitsingen met één kind opvouwen, gelijke richtingen samenvoegen. */
export function normalize(node: DockNode): DockNode | null {
  if (node.kind === 'tabs') {
    if (!node.panels.length) return null
    if (!node.panels.includes(node.active)) node.active = node.panels[0]
    return node
  }
  const kids: DockNode[] = []
  const sizes: number[] = []
  node.children.forEach((c, i) => {
    const n = normalize(c)
    if (!n) return
    if (n.kind === 'split' && n.dir === node.dir) {
      // Zelfde richting: kinderen direct opnemen
      n.children.forEach((cc, j) => {
        kids.push(cc)
        sizes.push(node.sizes[i] * n.sizes[j])
      })
    } else {
      kids.push(n)
      sizes.push(node.sizes[i] ?? 0)
    }
  })
  if (!kids.length) return null
  if (kids.length === 1) return kids[0]
  const total = sizes.reduce((a, b) => a + b, 0) || 1
  node.children = kids
  node.sizes = sizes.map((s) => s / total)
  return node
}

export function removePanel(root: DockNode, panel: PanelId): DockNode {
  const r = clone(root)
  const t = findTabsWith(r, panel)
  if (t) t.panels = t.panels.filter((p) => p !== panel)
  return normalize(r) ?? defaultLayout()
}

/**
 * Paneel neerzetten bij een tabgroep: in het midden (als tabblad) of aan een rand
 * (links/rechts = naast elkaar, boven/onder = onder elkaar).
 */
export function dropPanel(root: DockNode, panel: PanelId, targetId: string, zone: Zone): DockNode {
  let r = clone(root)
  const target0 = findNode(r, targetId)
  // Op zichzelf laten vallen als enige tab: niets doen
  if (target0?.kind === 'tabs' && target0.panels.length === 1 && target0.panels[0] === panel) return root
  const src = findTabsWith(r, panel)
  if (src) {
    src.panels = src.panels.filter((p) => p !== panel)
    if (!src.panels.length && src.id !== targetId) src.panels = [] // wordt hieronder opgeruimd
  }
  const target = findNode(r, targetId) as TabsNode | null
  if (!target || target.kind !== 'tabs') return normalize(r) ?? defaultLayout()
  if (zone === 'center') {
    target.panels.push(panel)
    target.active = panel
    return normalize(r) ?? defaultLayout()
  }
  const dir = zone === 'left' || zone === 'right' ? 'row' : 'col'
  const fresh = tabs([panel])
  const before = zone === 'left' || zone === 'top'
  // Doel vervangen door een splitsing [nieuw, doel] of [doel, nieuw]
  const replace = (node: DockNode): DockNode => {
    if (node.id === target.id) {
      const copy: TabsNode = { ...target }
      return split(dir, before ? [fresh, copy] : [copy, fresh], before ? [0.35, 0.65] : [0.65, 0.35])
    }
    if (node.kind === 'split') node.children = node.children.map(replace)
    return node
  }
  r = replace(r)
  return normalize(r) ?? defaultLayout()
}

/** Paneel tonen dat niet in de indeling staat: bij zijn gebruikelijke buren, anders bij de grootste groep. */
export function showPanel(root: DockNode, panel: PanelId): DockNode {
  if (findTabsWith(root, panel)) return activate(root, panel)
  const near: Record<PanelId, PanelId[]> = {
    viewer: ['code', 'timeline'],
    code: ['viewer', 'timeline'],
    timeline: ['viewer'],
    library: ['assets'],
    assets: ['library'],
    design: ['motion', 'ai'],
    motion: ['design', 'ai'],
    ai: ['design', 'motion']
  }
  const r = clone(root)
  for (const n of near[panel]) {
    const t = findTabsWith(r, n)
    if (t) {
      t.panels.push(panel)
      t.active = panel
      return r
    }
  }
  const first = (node: DockNode): TabsNode => (node.kind === 'tabs' ? node : first(node.children[0]))
  const t = first(r)
  t.panels.push(panel)
  t.active = panel
  return r
}

export function activate(root: DockNode, panel: PanelId): DockNode {
  const r = clone(root)
  const t = findTabsWith(r, panel)
  if (t) t.active = panel
  return r
}

export function resize(root: DockNode, splitId: string, sizes: number[]): DockNode {
  const r = clone(root)
  const n = findNode(r, splitId)
  if (n?.kind === 'split') n.sizes = sizes
  return r
}

/** Opgeslagen indeling controleren (onbekende/dubbele panelen weg). */
export function validLayout(x: unknown): DockNode | null {
  try {
    const n = normalize(clone(x as DockNode))
    if (!n) return null
    const seen = new Set<string>()
    const ok = (node: DockNode): boolean => {
      if (node.kind === 'tabs') return node.panels.every((p) => ALL_PANELS.includes(p) && !seen.has(p) && (seen.add(p), true))
      return Array.isArray(node.children) && node.children.length === node.sizes.length && node.children.every(ok)
    }
    return ok(n) ? n : null
  } catch {
    return null
  }
}

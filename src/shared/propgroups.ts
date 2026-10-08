import type { AnimProp, Layer } from './types'

// Eigenschappen die samen één regel vormen, zoals in After Effects:
// Positie = X + Y, Schaal = X + Y (Y alleen als de schaal ontkoppeld is).
// Een keyframe op de regel zet keyframes voor alle onderdelen tegelijk.

export type PropGroupId = 'position' | 'scale' | 'rotation' | 'opacity' | 'reveal'

export const GROUP_LABEL: Record<PropGroupId, string> = {
  position: 'Positie',
  scale: 'Schaal',
  rotation: 'Rotatie',
  opacity: 'Dekking',
  reveal: 'Reveal'
}

export function groupOf(prop: AnimProp): PropGroupId {
  if (prop === 'x' || prop === 'y') return 'position'
  if (prop === 'scale' || prop === 'scaleY') return 'scale'
  return prop
}

export function groupProps(l: Pick<Layer, 'scaleLinked'>, g: PropGroupId): AnimProp[] {
  if (g === 'position') return ['x', 'y']
  if (g === 'scale') return l.scaleLinked === false ? ['scale', 'scaleY'] : ['scale']
  return [g]
}

/** Groepen die voor deze laag zichtbaar zijn (reveal alleen bij write-on of wipe). */
export function layerGroups(l: Layer): PropGroupId[] {
  const out: PropGroupId[] = ['position', 'scale', 'rotation', 'opacity']
  if (l.type === 'writeon' || l.revealMode !== 'none') out.push('reveal')
  return out
}

/** Alle keyframe-tijden van een groep (vereniging van de onderdelen). */
export function groupTimes(l: Layer, g: PropGroupId): number[] {
  const set = new Map<string, number>()
  for (const p of groupProps(l, g)) for (const k of l.tracks[p] ?? []) set.set(k.t.toFixed(4), k.t)
  return [...set.values()].sort((a, b) => a - b)
}

/** Welke eigenschappen een uitgeklapte laag in de tijdlijn toont: een keuze (P/S/R/O), of 'keyed' = alles met keyframes (U). */
export type PropFilter = PropGroupId[] | 'keyed'

/** Zichtbare eigenschap-regels voor een laag, volgens het filter (geen filter = alle). */
export function visibleGroups(l: Layer, filter?: PropFilter): PropGroupId[] {
  const all = layerGroups(l)
  if (!filter) return all
  if (filter === 'keyed') return all.filter((g) => groupProps(l, g).some((p) => l.tracks[p]?.length))
  return all.filter((g) => filter.includes(g))
}

/**
 * Sneltoets P/S/R/O/U op de selectie (zoals in After Effects): alleen die eigenschap tonen.
 * Nog een keer dezelfde toets = inklappen. Met Shift = erbij tonen.
 */
export function toggleShownProps(
  selection: string[],
  expanded: Record<string, boolean>,
  shown: Record<string, PropFilter>,
  want: PropFilter,
  add: boolean
): { expanded: Record<string, boolean>; shown: Record<string, PropFilter> } {
  const e = { ...expanded }
  const s = { ...shown }
  const key = (f: PropFilter | undefined) => (f === undefined ? 'all' : f === 'keyed' ? 'keyed' : [...f].sort().join())
  const same = selection.every((id) => e[id] && key(s[id]) === key(want))
  for (const id of selection) {
    if (add && Array.isArray(want)) {
      const cur = e[id] ? s[id] : []
      // Bij "alles" (geen filter) of U: erbij zetten begint opnieuw vanaf deze keuze
      const base = Array.isArray(cur) ? cur : []
      const has = want.every((g) => base.includes(g))
      const next = has ? base.filter((g) => !want.includes(g)) : [...new Set([...base, ...want])]
      if (next.length) {
        e[id] = true
        s[id] = next
      } else {
        e[id] = false
        delete s[id]
      }
    } else if (same) {
      e[id] = false
      delete s[id]
    } else {
      e[id] = true
      s[id] = want
    }
  }
  return { expanded: e, shown: s }
}

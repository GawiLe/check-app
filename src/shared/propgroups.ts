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

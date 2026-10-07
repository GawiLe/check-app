import type { EaseName, Keyframe } from './types'

// Keyframe-assistent zoals in After Effects:
//   Easy Ease (F9)            rustig aankomen én vertrekken
//   Easy Ease In (Shift+F9)   rustig aankomen bij deze keyframe
//   Easy Ease Out (Ctrl+Shift+F9) rustig vertrekken uit deze keyframe
// Per segment (van keyframe A naar B) volgt de curve uit A.eo en B.ei.

export type KeyAssist = 'easy' | 'in' | 'out' | 'linear'

/** Curve van een segment: vertrekt rustig (A.eo) en/of komt rustig aan (B.ei). */
export function segmentEase(a: Keyframe, b: Keyframe): EaseName {
  if (a.eo && b.ei) return 'easeInOut'
  if (a.eo) return 'easeIn'
  if (b.ei) return 'easeOut'
  return 'linear'
}

/** Past de assistent toe op de keyframes op de gegeven tijden. Andere segmenten blijven ongemoeid. */
export function applyKeyAssist(kfs: Keyframe[], times: number[], mode: KeyAssist): Keyframe[] {
  const out = kfs.map((k) => ({ ...k }))
  const touched = new Set<number>()
  out.forEach((k, i) => {
    if (!times.some((t) => Math.abs(t - k.t) < 1e-4)) return
    if (mode === 'easy') k.ei = k.eo = true
    if (mode === 'in') k.ei = true
    if (mode === 'out') k.eo = true
    if (mode === 'linear') k.ei = k.eo = false
    touched.add(i)
  })
  for (const i of touched) {
    if (i > 0) out[i - 1].e = segmentEase(out[i - 1], out[i])
    if (i < out.length - 1) out[i].e = segmentEase(out[i], out[i + 1])
  }
  return out
}

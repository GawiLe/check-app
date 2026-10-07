// Uitlijnen en verdelen, zoals in Illustrator/After Effects. Werkt op kaders (de zichtbare
// omtrek van een laag, inclusief schaal en rotatie) en geeft per kader de verschuiving terug.
// Verschuivingen zijn hele pixels.

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export type AlignMode = 'left' | 'hcenter' | 'right' | 'top' | 'vcenter' | 'bottom'
export type Axis = 'h' | 'v'

export function unionBox(boxes: Box[]): Box {
  const x1 = Math.min(...boxes.map((b) => b.x))
  const y1 = Math.min(...boxes.map((b) => b.y))
  const x2 = Math.max(...boxes.map((b) => b.x + b.w))
  const y2 = Math.max(...boxes.map((b) => b.y + b.h))
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
}

/** Verschuiving per kader om ze uit te lijnen op `ref` (de selectie of de banner). */
export function alignDeltas(boxes: Box[], mode: AlignMode, ref: Box): { dx: number; dy: number }[] {
  return boxes.map((b) => {
    let dx = 0
    let dy = 0
    if (mode === 'left') dx = ref.x - b.x
    if (mode === 'hcenter') dx = ref.x + ref.w / 2 - (b.x + b.w / 2)
    if (mode === 'right') dx = ref.x + ref.w - (b.x + b.w)
    if (mode === 'top') dy = ref.y - b.y
    if (mode === 'vcenter') dy = ref.y + ref.h / 2 - (b.y + b.h / 2)
    if (mode === 'bottom') dy = ref.y + ref.h - (b.y + b.h)
    return { dx: Math.round(dx), dy: Math.round(dy) }
  })
}

/**
 * Gelijke tussenruimte: de buitenste twee blijven staan, de rest komt er met gelijke
 * ruimte tussen. Met `ref` (de banner) worden ook de buitenste verdeeld, met gelijke
 * ruimte tot de randen.
 */
export function distributeDeltas(boxes: Box[], axis: Axis, ref?: Box): { dx: number; dy: number }[] {
  const pos = (b: Box) => (axis === 'h' ? b.x : b.y)
  const size = (b: Box) => (axis === 'h' ? b.w : b.h)
  const order = boxes.map((b, i) => i).sort((a, b) => pos(boxes[a]) + size(boxes[a]) / 2 - (pos(boxes[b]) + size(boxes[b]) / 2))
  const out = boxes.map(() => ({ dx: 0, dy: 0 }))
  if (boxes.length < (ref ? 1 : 3)) return out
  const total = order.reduce((s, i) => s + size(boxes[i]), 0)
  let start: number
  let gap: number
  if (ref) {
    gap = ((axis === 'h' ? ref.w : ref.h) - total) / (boxes.length + 1)
    start = (axis === 'h' ? ref.x : ref.y) + gap
  } else {
    const first = boxes[order[0]]
    const last = boxes[order[order.length - 1]]
    gap = (pos(last) + size(last) - pos(first) - total) / (boxes.length - 1)
    start = pos(first)
  }
  let p = start
  for (const i of order) {
    const d = Math.round(p - pos(boxes[i]))
    out[i] = axis === 'h' ? { dx: d, dy: 0 } : { dx: 0, dy: d }
    p += size(boxes[i]) + gap
  }
  return out
}

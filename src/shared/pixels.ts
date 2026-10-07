import type { AnimProp, Layer, Motion, Project } from './types'

// Alles op hele pixels: posities, maten en rotatie zijn gehele getallen, schaal en dekking
// hele procenten. Zo staat elke laag in rust precies op de pixelgrid (geen wazige randen of
// "pixelstoring"). Tijdens een beweging mag de runtime tussenwaarden gebruiken; de rustwaarden
// en keyframes zelf zijn altijd heel.

const whole = (v: number) => Math.round(v)
const pct = (v: number) => Math.round(v * 100) / 100

const TRACK_ROUND: Record<AnimProp, (v: number) => number> = {
  x: whole,
  y: whole,
  rotation: whole,
  scale: pct,
  scaleY: pct,
  opacity: pct,
  reveal: (v) => v
}

function snapMotion(m: Motion | null | undefined) {
  if (!m) return
  m.dx = whole(m.dx)
  m.dy = whole(m.dy)
  m.rotation = whole(m.rotation)
  m.scale = pct(m.scale)
}

export function snapLayer(l: Layer) {
  l.x = whole(l.x)
  l.y = whole(l.y)
  l.width = Math.max(1, whole(l.width))
  l.height = Math.max(1, whole(l.height))
  l.rotation = whole(l.rotation)
  l.scale = pct(l.scale)
  if (l.scaleY != null) l.scaleY = pct(l.scaleY)
  l.opacity = pct(l.opacity)
  for (const p of Object.keys(l.tracks) as AnimProp[]) {
    const r = TRACK_ROUND[p]
    const kfs = l.tracks[p]
    if (r && kfs) for (const k of kfs) k.v = r(k.v)
  }
  snapMotion(l.intro)
  snapMotion(l.outro)
  if (l.text) l.text.size = Math.max(1, whole(l.text.size))
  if (l.shape) l.shape.radius = whole(l.shape.radius)
  for (const sh of l.shadows ?? []) {
    sh.x = whole(sh.x)
    sh.y = whole(sh.y)
    sh.blur = Math.max(0, whole(sh.blur))
    sh.opacity = Math.min(1, Math.max(0, pct(sh.opacity)))
  }
  if (l.children) for (const c of l.children) snapLayer(c)
}

/** Rondt het hele project af op hele pixels (in-place). */
export function snapProject(p: Project): Project {
  for (const c of p.compositions) {
    c.width = whole(c.width)
    c.height = whole(c.height)
    for (const l of c.layers) snapLayer(l)
  }
  return p
}

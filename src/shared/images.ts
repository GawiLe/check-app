// Hoe groot moet elke afbeelding in een banner echt zijn? Basis voor het optimaliseren bij export.
import { effectiveLayer } from './motion'
import type { Composition, ImageProps, Layer } from './types'

/** Een plek waar een afbeelding getoond wordt: benodigde pixels (CSS-pixels × schaal × pixeldichtheid). */
export interface ImageUse {
  w: number
  h: number
  fit: ImageProps['fit']
}

/** Pixeldichtheid waarvoor we bewaren: 2× blijft scherp op retina-schermen. */
export const IMAGE_DENSITY = 2

const maxAbs = (base: number, keys: { v: number }[] | undefined) => Math.max(Math.abs(base), ...(keys ?? []).map((k) => Math.abs(k.v)))

/** Alle plekken per afbeeldingspad in deze compositie, inclusief groepen (schaal van de groep telt mee). */
export function imageUses(comp: Composition, density = IMAGE_DENSITY): Record<string, ImageUse[]> {
  const out: Record<string, ImageUse[]> = {}
  const walk = (list: Layer[], psx: number, psy: number) => {
    for (const raw of list) {
      if (!raw.visible) continue
      const l = effectiveLayer(raw)
      const sx = maxAbs(l.scale, l.tracks.scale) * psx
      const sy = (l.scaleLinked === false ? maxAbs(l.scaleY ?? l.scale, l.tracks.scaleY) : maxAbs(l.scale, l.tracks.scale)) * psy
      if (l.type === 'image' && l.image?.src) {
        ;(out[l.image.src] ??= []).push({ w: l.width * sx * density, h: l.height * sy * density, fit: l.image.fit })
      }
      if (l.children) walk(l.children, sx, sy)
    }
  }
  walk(comp.layers, 1, 1)
  return out
}

/**
 * Verkleiningsfactor (≤ 1) voor een afbeelding van natW×natH, zodat hij op elke plek nog scherp is.
 * contain: de afbeelding past in het kader (kleinste verhouding telt); cover/fill: hij vult het kader.
 */
export function resizeFactor(uses: ImageUse[], natW: number, natH: number): number {
  if (!uses.length || natW <= 0 || natH <= 0) return 1
  let f = 0
  for (const u of uses) {
    const rw = u.w / natW
    const rh = u.h / natH
    f = Math.max(f, u.fit === 'contain' ? Math.min(rw, rh) : Math.max(rw, rh))
  }
  return Math.min(1, f)
}

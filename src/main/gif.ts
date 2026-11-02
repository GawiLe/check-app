// GIF-encoder voor de MP4/GIF-export. Beter dan "elk beeldje met één palet":
// - Kleuren in volle precisie naar het palet (geen afronding vooraf), met een palet uit veel beeldjes.
// - Alleen wat verandert wordt per beeldje opgeslagen; de rest is transparant en laat het vorige beeld
//   staan. Dat scheelt veel KB, zodat ook 25–50 fps binnen een maximum past.
// - Kwaliteit "hoog": een eigen palet per beeldje (alleen voor wat verandert) en geordende dithering,
//   zodat verlopen en foto's vloeiend blijven zonder flikkerende ruis.
import { GIFEncoder, quantize } from 'gifenc'

export type GifQuality = 'normal' | 'high'

export interface GifSettings {
  width: number
  height: number
  fps: number
  /** Kleuren per palet (2–256); één plek is voor "onveranderd" (transparant). */
  colors: number
  quality: GifQuality
}

type Palette = number[][]

// Bayer 8×8: drempels voor geordende dithering (stabiel van beeldje tot beeldje, dus geen "kruipende" ruis)
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27,
  49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21
].map((v) => v / 64 - 0.5)

/** Zoekt per kleur het dichtstbijzijnde paletkleur (met een tabel, 6 bits per kanaal). */
class Mapper {
  private cache = new Int16Array(1 << 18).fill(-1)
  constructor(
    private palette: Palette,
    private usable: number
  ) {}
  index(r: number, g: number, b: number): number {
    const key = ((r >> 2) << 12) | ((g >> 2) << 6) | (b >> 2)
    const hit = this.cache[key]
    if (hit >= 0) return hit
    const cr = ((r >> 2) << 2) + 2
    const cg = ((g >> 2) << 2) + 2
    const cb = ((b >> 2) << 2) + 2
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < this.usable; i++) {
      const p = this.palette[i]
      const dr = p[0] - cr
      const dg = p[1] - cg
      const db = p[2] - cb
      const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db
      if (d < bestD) {
        bestD = d
        best = i
      }
    }
    this.cache[key] = best
    return best
  }
}

/** Palet uit pixels (RGBA); de laatste plek is gereserveerd voor transparant. */
function paletteOf(rgba: Uint8Array, colors: number): Palette {
  const max = Math.max(2, Math.min(256, Math.round(colors)) - 1)
  const p = quantize(rgba, max, { format: 'rgb565' }) as Palette
  return [...p.map((c) => [c[0], c[1], c[2]]), [255, 0, 255]]
}

/** Gezamenlijk palet voor de hele GIF, uit beeldjes verspreid over de animatie (hooguit ~600k pixels). */
export function buildPalette(samples: Uint8Array[], colors: number): Palette {
  const total = samples.reduce((a, s) => a + s.length / 4, 0)
  const step = Math.max(1, Math.ceil(total / 600_000))
  const out = new Uint8Array(Math.ceil(total / step) * 4 + 4)
  let o = 0
  let n = 0
  for (const s of samples)
    for (let i = 0; i < s.length; i += 4, n++) {
      if (n % step) continue
      out[o] = s[i]
      out[o + 1] = s[i + 1]
      out[o + 2] = s[i + 2]
      out[o + 3] = 255
      o += 4
    }
  return paletteOf(out.subarray(0, o), colors)
}

/**
 * Sterkte van de dithering: ongeveer de afstand tussen naburige paletkleuren. Liggen de kleuren dicht
 * bij elkaar (256 kleuren voor een verloop), dan maar een beetje; anders meer. Nooit grover dan nodig.
 */
function ditherStrength(palette: Palette, usable: number): number {
  const nn: number[] = []
  for (let i = 0; i < usable; i++) {
    let best = Infinity
    for (let j = 0; j < usable; j++) {
      if (i === j) continue
      const dr = palette[i][0] - palette[j][0]
      const dg = palette[i][1] - palette[j][1]
      const db = palette[i][2] - palette[j][2]
      best = Math.min(best, Math.sqrt(dr * dr + dg * dg + db * db))
    }
    if (Number.isFinite(best)) nn.push(best)
  }
  if (!nn.length) return 0
  nn.sort((a, b) => a - b)
  return Math.max(2, Math.min(16, nn[Math.floor(nn.length / 2)]))
}

/** Verschil per kanaal waaronder een pixel als "onveranderd" telt (renderruis). */
const TOLERANCE = 2

/**
 * Schrijft een GIF beeldje voor beeldje (zonder alle beeldjes in het geheugen te houden). Gelijke
 * opeenvolgende beeldjes worden één beeldje met een langere vertraging. Speelt één keer af.
 */
export function createGifWriter(s: GifSettings, globalPalette?: Palette) {
  const { width: W, height: H, fps, quality } = s
  const N = W * H
  const gif = GIFEncoder()
  const ms = 1000 / fps
  const useDither = quality === 'high'
  const local = quality === 'high' || !globalPalette
  const globalMapper = globalPalette ? new Mapper(globalPalette, globalPalette.length - 1) : null
  /** Laatst vastgelegde (rauwe) kleur per pixel, en het vorige beeldje als geheel. */
  const shown = new Uint8Array(N * 4)
  let prev: Uint8Array | null = null
  let pending: { index: Uint8Array; palette: Palette; frames: number; transparent: boolean } | null = null
  let exact = 0
  let written = 0
  let first = true

  const flush = () => {
    if (!pending) return
    // GIF-vertragingen zijn hele honderdsten: het afrondingsverschil schuift door naar het volgende beeldje
    exact += ms * pending.frames
    const delay = Math.max(20, Math.round((exact - written) / 10) * 10)
    written += delay
    gif.writeFrame(pending.index, W, H, {
      palette: first || local ? pending.palette : undefined,
      delay,
      repeat: first ? -1 : undefined,
      transparent: pending.transparent,
      transparentIndex: pending.palette.length - 1,
      // Niet wissen: transparante pixels laten het vorige beeld staan
      dispose: 1
    })
    first = false
    pending = null
  }

  return {
    add(rgba: Uint8Array) {
      if (prev && Buffer.compare(Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength), Buffer.from(prev.buffer, prev.byteOffset, prev.byteLength)) === 0) {
        if (pending) pending.frames++
        return
      }
      // Welke pixels zijn veranderd ten opzichte van wat er nu in beeld staat?
      const changed = new Uint8Array(N)
      let count = 0
      for (let i = 0, p = 0; i < N; i++, p += 4) {
        if (
          !prev ||
          Math.abs(rgba[p] - shown[p]) > TOLERANCE ||
          Math.abs(rgba[p + 1] - shown[p + 1]) > TOLERANCE ||
          Math.abs(rgba[p + 2] - shown[p + 2]) > TOLERANCE
        ) {
          changed[i] = 1
          count++
        }
      }
      prev = rgba
      if (!count) {
        if (pending) pending.frames++
        return
      }
      flush()
      let palette = globalPalette
      let mapper = globalMapper
      if (local || !palette) {
        // Palet alleen uit de pixels die veranderen (hooguit ~200k, gelijkmatig verspreid)
        const step = Math.max(1, Math.ceil(count / 200_000))
        const px = new Uint8Array(Math.ceil(count / step) * 4)
        let o = 0
        for (let i = 0, k = 0; i < N; i++) {
          if (!changed[i] || k++ % step) continue
          px.set(rgba.subarray(i * 4, i * 4 + 3), o)
          px[o + 3] = 255
          o += 4
        }
        palette = paletteOf(px.subarray(0, o), s.colors)
        mapper = new Mapper(palette, palette.length - 1)
      }
      const transparentIndex = palette!.length - 1
      const dither = useDither ? ditherStrength(palette!, transparentIndex) : 0
      const index = new Uint8Array(N)
      for (let y = 0, i = 0; y < H; y++)
        for (let x = 0; x < W; x++, i++) {
          if (!changed[i]) {
            index[i] = transparentIndex
            continue
          }
          const p = i * 4
          let r = rgba[p]
          let g = rgba[p + 1]
          let b = rgba[p + 2]
          shown[p] = r
          shown[p + 1] = g
          shown[p + 2] = b
          if (dither) {
            const o = BAYER[(y & 7) * 8 + (x & 7)] * dither
            r = Math.max(0, Math.min(255, r + o)) | 0
            g = Math.max(0, Math.min(255, g + o)) | 0
            b = Math.max(0, Math.min(255, b + o)) | 0
          }
          index[i] = mapper!.index(r, g, b)
        }
      // Het eerste beeldje is altijd volledig (er is nog niets om doorheen te kijken)
      pending = { index, palette: palette!, frames: 1, transparent: !first }
    },
    finish(): Uint8Array {
      flush()
      gif.finish()
      return gif.bytes()
    }
  }
}

/** Hele GIF in één keer (voor tests en kleine animaties). */
export function encodeGif(frames: Uint8Array[], width: number, height: number, fps: number, colors: number, quality: GifQuality = 'normal'): Uint8Array {
  const pick = [...new Set(Array.from({ length: Math.min(24, frames.length) }, (_, k) => Math.round((k * (frames.length - 1)) / Math.max(1, Math.min(24, frames.length) - 1))))]
  const palette = quality === 'normal' ? buildPalette(pick.map((i) => frames[i]), colors) : undefined
  const w = createGifWriter({ width, height, fps, colors, quality }, palette)
  for (const f of frames) w.add(f)
  return w.finish()
}

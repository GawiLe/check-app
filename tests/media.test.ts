import { describe, expect, it, vi } from 'vitest'

// media.ts gebruikt Electron alleen in de export zelf; tijden en GIF-codering zijn los te testen.
vi.mock('electron', () => ({ BrowserWindow: class {}, ipcMain: { on() {}, removeListener() {} }, session: { fromPartition: () => ({}) } }))
vi.mock('../src/main/exporter', () => ({ fileStem: (s: string) => s, bannerName: () => 'b', pack: async () => ({}), prepareFonts: async () => ({}) }))
const { frameTimes } = await import('../src/main/media')
const { encodeGif } = await import('../src/main/gif')

describe('MP4/GIF', () => {
  it('beeldjes: alle loops achter elkaar, de laatste tot het eindbeeld', () => {
    const t = frameTimes({ duration: 3, loops: 2, endFrame: 2.5, layers: [] }, 2)
    expect(t).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 0, 0.5, 1, 1.5, 2, 2.5])
    expect(frameTimes({ duration: 4, loops: 1, endFrame: null, layers: [] }, 1)).toEqual([0, 1, 2, 3, 4])
  })

  it('GIF: geldig bestand, gelijke beeldjes samengevoegd', () => {
    const w = 4
    const h = 2
    const red = new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 0 || i % 4 === 3 ? 255 : 0))
    const blue = new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 2 || i % 4 === 3 ? 255 : 0))
    const bytes = encodeGif([red, red, red, blue], w, h, 10, 16)
    expect(new TextDecoder().decode(bytes.subarray(0, 6))).toBe('GIF89a')
    // Twee beeldjes (rood 3× samengevoegd, blauw): twee image descriptors (0x2C)
    const descriptors = [...bytes].filter((b, i) => b === 0x2c && bytes[i - 1] === 0x00).length
    expect(descriptors).toBeGreaterThanOrEqual(2)
    expect(bytes[bytes.length - 1]).toBe(0x3b)
  })

  // Minimale GIF-lezer: per beeldje vertraging, transparantie, dispose en of er een eigen palet is
  const parseGif = (b: Uint8Array) => {
    let i = 6
    const packed = b[i + 4]
    i += 7
    if (packed & 0x80) i += 3 * (1 << ((packed & 7) + 1))
    const frames: { delay: number; transparent: boolean; dispose: number; local: boolean }[] = []
    let gce = { delay: 0, transparent: false, dispose: 0 }
    const skipBlocks = () => {
      while (b[i]) i += b[i] + 1
      i++
    }
    while (i < b.length && b[i] !== 0x3b) {
      if (b[i] === 0x21) {
        if (b[i + 1] === 0xf9) gce = { delay: (b[i + 4] | (b[i + 5] << 8)) * 10, transparent: !!(b[i + 3] & 1), dispose: (b[i + 3] >> 2) & 7 }
        i += 2
        skipBlocks()
      } else if (b[i] === 0x2c) {
        const p = b[i + 9]
        frames.push({ ...gce, local: !!(p & 0x80) })
        i += 10
        if (p & 0x80) i += 3 * (1 << ((p & 7) + 1))
        i++ // LZW-minimum
        skipBlocks()
      } else throw new Error(`onverwacht blok ${b[i]} op ${i}`)
    }
    return frames
  }
  // Statische achtergrond (verloop) met een bewegend blok
  const scene = (w: number, h: number, n: number) =>
    Array.from({ length: n }, (_, f) => {
      const a = new Uint8Array(w * h * 4)
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4
          const inBox = x >= f * 3 && x < f * 3 + 12 && y >= 10 && y < 22
          a[i] = inBox ? 255 : (x * 255) / w
          a[i + 1] = inBox ? 255 : 80
          a[i + 2] = inBox ? 255 : 200 - (x * 150) / w
          a[i + 3] = 255
        }
      return a
    })

  it('GIF: alleen wat verandert wordt opgeslagen (rest transparant), dus veel kleiner', () => {
    const w = 120
    const h = 60
    const frames = scene(w, h, 30)
    const bytes = encodeGif(frames, w, h, 25, 256)
    const fr = parseGif(bytes)
    expect(fr.length).toBe(30)
    expect(fr[0].transparent).toBe(false)
    expect(fr.slice(1).every((f) => f.transparent && f.dispose === 1)).toBe(true)
    // Ruim kleiner dan 30 volledige beeldjes zonder compressie (30 × 7200 bytes)
    expect(bytes.byteLength).toBeLessThan(30 * w * h * 0.25)
  })

  it('GIF: 50 fps = 20 ms per beeldje, totaal precies de duur', () => {
    const fr = parseGif(encodeGif(scene(80, 40, 25), 80, 40, 50, 256))
    expect(fr.every((f) => f.delay === 20)).toBe(true)
    expect(fr.reduce((a, f) => a + f.delay, 0)).toBe(500)
  })

  it('GIF hoge kwaliteit: eigen palet per beeldje (alleen voor wat verandert)', () => {
    const fr = parseGif(encodeGif(scene(80, 40, 10), 80, 40, 25, 256, 'high'))
    expect(fr.length).toBe(10)
    expect(fr.slice(1).every((f) => f.local && f.transparent)).toBe(true)
  })

  it('GIF: vertragingen tellen precies op tot de echte duur (geen drift)', () => {
    const w = 2
    const h = 2
    // 30 verschillende beeldjes op 30 fps = 1 s; per beeldje 33,3 ms, in GIF alleen hele honderdsten
    const frames = Array.from({ length: 30 }, (_, k) => new Uint8Array(w * h * 4).map((_, i) => (i % 4 === 3 ? 255 : (k * 8 + i) % 256)))
    const bytes = encodeGif(frames, w, h, 30, 64)
    let total = 0
    for (let i = 0; i < bytes.length - 5; i++) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) total += (bytes[i + 4] | (bytes[i + 5] << 8)) * 10
    expect(total).toBe(1000)
  })
})

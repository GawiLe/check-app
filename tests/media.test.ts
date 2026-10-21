import { describe, expect, it, vi } from 'vitest'

// media.ts gebruikt Electron alleen in de export zelf; tijden en GIF-codering zijn los te testen.
vi.mock('electron', () => ({ BrowserWindow: class {}, ipcMain: { on() {}, removeListener() {} }, session: { fromPartition: () => ({}) } }))
vi.mock('../src/main/exporter', () => ({ fileStem: (s: string) => s, bannerName: () => 'b', pack: async () => ({}), prepareFonts: async () => ({}) }))
const { encodeGif, frameTimes } = await import('../src/main/media')

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

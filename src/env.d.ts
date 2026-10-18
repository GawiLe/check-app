declare module '*.css'

declare module 'subset-font' {
  export default function subsetFont(
    buffer: Buffer,
    text: string | undefined,
    options?: { targetFormat?: 'sfnt' | 'woff' | 'woff2' | 'truetype'; preserveNameIds?: number[] }
  ): Promise<Buffer>
}

declare module 'fontverter' {
  const fontverter: { convert(buffer: Buffer, to: 'sfnt' | 'woff' | 'woff2'): Promise<Buffer> }
  export default fontverter
}

declare module 'gifenc' {
  export type Palette = number[][]
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, width: number, height: number, opts: { palette?: Palette; delay?: number; repeat?: number; first?: boolean }): void
    finish(): void
    bytes(): Uint8Array
  }
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array
}

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

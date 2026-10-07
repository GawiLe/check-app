import { inside } from './paths'
import { readFile } from 'node:fs/promises'
import * as opentypeNs from 'opentype.js'
import subsetFont from 'subset-font'
import fontverter from 'fontverter'
import { newId } from '@shared/factory'
import type { FontAsset, WriteOnGlyph } from '@shared/types'

// opentype.js is CommonJS; afhankelijk van de bundler zit de API op .default of op de namespace.
const opentype = ((opentypeNs as unknown as { default?: typeof opentypeNs }).default ?? opentypeNs) as typeof opentypeNs

async function toSfnt(buf: Buffer): Promise<Buffer> {
  return fontverter.convert(buf, 'sfnt')
}

function parse(buf: Buffer): opentype.Font {
  return opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer)
}

/** Leest familienaam, gewicht en stijl uit een font-bestand (woff, woff2, ttf, otf). */
export async function describeFont(dir: string, file: string): Promise<FontAsset> {
  const font = parse(await toSfnt(await readFile(inside(dir, file))))
  // opentype.js 2.x groepeert namen per platform; 1.x had ze plat.
  type NameTable = Record<string, Record<string, string> | undefined>
  const all = font.names as unknown as Record<string, NameTable | undefined> & NameTable
  const tables = [all.windows, all.macintosh, all.unicode, all as NameTable].filter(Boolean) as NameTable[]
  const pick = (key: string) => tables.map((t) => t[key]?.en ?? Object.values(t[key] ?? {})[0]).find(Boolean)
  const family =
    pick('typographicFamily') ?? pick('preferredFamily') ?? pick('fontFamily') ?? file.split('/').pop()!.replace(/\.\w+$/, '')
  const os2 = font.tables.os2 as { usWeightClass?: number; fsSelection?: number } | undefined
  const italic = ((os2?.fsSelection ?? 0) & 1) === 1
  return { id: newId('f'), family, file, weight: os2?.usWeightClass ?? 400, style: italic ? 'italic' : 'normal' }
}

/** Subset naar alleen de gebruikte tekens, als WOFF2. Spatie wordt altijd meegenomen. */
export async function subsetToWoff2(dir: string, file: string, chars: string): Promise<Buffer> {
  const buf = await readFile(inside(dir, file))
  return subsetFont(buf, chars + ' ', { targetFormat: 'woff2' })
}

/**
 * Zet tekst om naar SVG-paden per glyph, voor het write-on effect.
 * Elke glyph wordt apart getekend zodat de runtime ze na elkaar kan onthullen.
 */
export async function textToGlyphPaths(
  dir: string,
  file: string,
  text: string,
  size: number
): Promise<{ glyphs: WriteOnGlyph[]; viewBox: [number, number, number, number]; width: number; height: number }> {
  const font = parse(await toSfnt(await readFile(inside(dir, file))))
  const lineHeight = size * 1.15
  const glyphs: WriteOnGlyph[] = []
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  text.split('\n').forEach((line, i) => {
    const baseline = size + i * lineHeight
    // Eigen layout per teken (met kerning) in plaats van font.getPaths: de shaping
    // van opentype.js crasht op sommige GSUB-tabellen en is voor write-on niet nodig.
    const scale = size / font.unitsPerEm
    let x = 0
    let prev: opentype.Glyph | null = null
    for (const ch of line) {
      const glyph = font.charToGlyph(ch)
      if (prev) x += font.getKerningValue(prev, glyph) * scale
      const ox = x
      x += (glyph.advanceWidth ?? 0) * scale
      prev = glyph
      const d = glyphPathData(glyph, ox, baseline, scale)
      if (!d) continue
      const bb = glyph.getBoundingBox()
      x1 = Math.min(x1, ox + bb.x1 * scale)
      x2 = Math.max(x2, ox + bb.x2 * scale)
      y1 = Math.min(y1, baseline - bb.y2 * scale)
      y2 = Math.max(y2, baseline - bb.y1 * scale)
      glyphs.push({ d })
    }
  })
  if (!glyphs.length) return { glyphs, viewBox: [0, 0, 10, 10], width: 10, height: 10 }
  const pad = 2
  const vb: [number, number, number, number] = [
    Math.floor(x1 - pad),
    Math.floor(y1 - pad),
    Math.ceil(x2 - x1 + pad * 2),
    Math.ceil(y2 - y1 + pad * 2)
  ]
  return { glyphs, viewBox: vb, width: vb[2], height: vb[3] }
}

/** SVG-paddata van een glyph, vanuit font-eenheden (y omhoog) naar scherm (y omlaag). */
function glyphPathData(glyph: opentype.Glyph, ox: number, baseline: number, scale: number): string {
  const f = (v: number) => String(Math.round(v * 10) / 10)
  const X = (v: number) => f(ox + v * scale)
  const Y = (v: number) => f(baseline - v * scale)
  let d = ''
  for (const c of glyph.path.commands as Array<Record<string, number> & { type: string }>) {
    if (c.type === 'M' || c.type === 'L') d += `${c.type}${X(c.x)} ${Y(c.y)}`
    else if (c.type === 'Q') d += `Q${X(c.x1)} ${Y(c.y1)} ${X(c.x)} ${Y(c.y)}`
    else if (c.type === 'C') d += `C${X(c.x1)} ${Y(c.y1)} ${X(c.x2)} ${Y(c.y2)} ${X(c.x)} ${Y(c.y)}`
    else if (c.type === 'Z') d += 'Z'
  }
  return d
}

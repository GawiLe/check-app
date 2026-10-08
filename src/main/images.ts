// Afbeeldingen optimaliseren bij export: verkleinen tot de maat waarop ze getoond worden (2× voor retina)
// en opnieuw comprimeren. Alleen als het resultaat echt kleiner is; het origineel in assets/ blijft staan.
import { nativeImage } from 'electron'
import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { resizeFactor, type ImageUse } from '@shared/images'
import { inside } from './paths'

export interface OptimizedImage {
  data: Buffer
  /** Extensie van het resultaat (een PNG zonder transparantie kan een JPG worden). */
  ext: string
  origBytes: number
  from: [number, number]
  to: [number, number]
}

const JPEG_QUALITY = 82
const cache = new Map<string, Promise<OptimizedImage | null>>()

/** Geeft de geoptimaliseerde versie, of null als het origineel al zo klein mogelijk is (of geen JPG/PNG). */
export function optimizeImage(dir: string, src: string, uses: ImageUse[]): Promise<OptimizedImage | null> {
  const ext = extname(src).toLowerCase()
  if (!['.jpg', '.jpeg', '.png'].includes(ext)) return Promise.resolve(null)
  const file = inside(dir, src)
  const key = `${file}|${JSON.stringify(uses)}`
  return stat(file).then((st) => {
    const k = `${key}|${st.mtimeMs}|${st.size}`
    if (!cache.has(k)) {
      if (cache.size > 300) cache.clear()
      cache.set(k, run(file, ext, uses).catch(() => null))
    }
    return cache.get(k)!
  })
}

async function run(file: string, ext: string, uses: ImageUse[]): Promise<OptimizedImage | null> {
  const orig = await readFile(file)
  const img = nativeImage.createFromBuffer(orig)
  if (img.isEmpty()) return null
  const { width: natW, height: natH } = img.getSize()
  const f = resizeFactor(uses, natW, natH)
  const tw = Math.max(1, Math.round(natW * f))
  const th = Math.max(1, Math.round(natH * f))
  const resized = tw < natW ? img.resize({ width: tw, height: th, quality: 'best' }) : img

  let data: Buffer
  let outExt = ext
  if (ext === '.png') {
    data = resized === img ? orig : resized.toPNG()
    // Foto als PNG zonder transparantie: als JPG vaak vele malen kleiner. Vlakke graphics (logo's)
    // comprimeren als PNG al goed; die blijven PNG tenzij JPG minder dan de helft is.
    if (!hasAlpha(resized)) {
      const jpg = resized.toJPEG(JPEG_QUALITY + 6)
      if (jpg.byteLength < data.byteLength * 0.5) {
        data = jpg
        outExt = '.jpg'
      }
    }
  } else {
    data = resized.toJPEG(JPEG_QUALITY)
  }
  if (data.byteLength >= orig.byteLength * 0.97) return null
  return { data, ext: outExt, origBytes: orig.byteLength, from: [natW, natH], to: [tw, th] }
}

function hasAlpha(img: Electron.NativeImage): boolean {
  const bmp = img.toBitmap()
  for (let i = 3; i < bmp.length; i += 4) if (bmp[i] !== 255) return true
  return false
}

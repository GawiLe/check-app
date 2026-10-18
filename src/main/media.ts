// Banners als MP4 en GIF: de geëxporteerde banner wordt in een onzichtbaar venster beeldje voor beeldje
// op de juiste tijd gezet (BS.seek, dezelfde runtime als de export) en vastgelegd. MP4 wordt gecodeerd
// met WebCodecs in een apart onzichtbaar venster (preload/media.ts), GIF met gifenc in dit proces.
// Resultaat altijd in een eigen map: <exportmap>/<project>/MP4/ en /GIF/.
import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import type { MediaRequest, MediaResult } from '@shared/api'
import { endFrameTime } from '@shared/motion'
import type { Composition } from '@shared/types'
import { fileStem, pack, prepareFonts } from './exporter'

/**
 * Bannertijd van elk beeldje: alle loops achter elkaar, de laatste loop tot het eindbeeld
 * (zoals de banner echt afspeelt). Het laatste beeldje is altijd precies het eindbeeld.
 */
export function frameTimes(comp: Pick<Composition, 'duration' | 'loops' | 'endFrame' | 'layers'>, fps: number): number[] {
  const T = comp.duration
  const N = Math.max(1, Math.round(comp.loops))
  const E = endFrameTime(comp as Composition)
  const total = T * (N - 1) + E
  const out: number[] = []
  const n = Math.max(1, Math.floor(total * fps + 1e-6))
  for (let i = 0; i < n; i++) {
    const t = i / fps
    const before = T * (N - 1)
    out.push(Math.round((t < before ? t % T : Math.min(E, t - before)) * 1000) / 1000)
  }
  out.push(E)
  return out
}

/** Onzichtbaar venster met de banner; `grab(t)` geeft het beeld op bannertijd t als BGRA. */
async function openBanner(indexHtml: string, comp: Composition, scale: number, even: boolean) {
  const round = (v: number) => (even ? Math.ceil(v / 2) * 2 : Math.round(v))
  const width = round(comp.width * scale)
  const height = round(comp.height * scale)
  const win = new BrowserWindow({
    show: false,
    width,
    height,
    useContentSize: true,
    webPreferences: { offscreen: true, sandbox: true, javascript: true, backgroundThrottling: false }
  })
  await win.loadURL(pathToFileURL(indexHtml).href)
  win.webContents.setZoomFactor(scale)
  // Wachten tot afbeeldingen en fonts geladen zijn (de runtime zet dan class "r" op body)
  await win.webContents.executeJavaScript(`new Promise(function(res){var n=0;(function w(){if(document.body.className.indexOf('r')>=0||n++>200){if(window.BS)BS.pause();res()}else setTimeout(w,30)})()})`)
  const grab = async (t: number): Promise<Buffer> => {
    await win.webContents.executeJavaScript(`BS.seek(${t});new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})`)
    let img = await win.webContents.capturePage({ x: 0, y: 0, width, height })
    const s = img.getSize()
    if (s.width !== width || s.height !== height) img = img.resize({ width, height, quality: 'best' })
    return img.toBitmap()
  }
  return { win, width, height, grab }
}

/** BGRA (capturePage) → RGBA (gifenc). */
function toRgba(bgra: Buffer): Uint8Array {
  const out = new Uint8Array(bgra.length)
  for (let i = 0; i < bgra.length; i += 4) {
    out[i] = bgra[i + 2]
    out[i + 1] = bgra[i + 1]
    out[i + 2] = bgra[i]
    out[i + 3] = 255
  }
  return out
}

/**
 * GIF van de beeldjes. Gelijke opeenvolgende beeldjes worden samengevoegd (langere vertraging), één
 * palet voor de hele GIF (geen flikkerende kleuren). Speelt één keer af: de loops zitten er al in.
 */
export function encodeGif(frames: Uint8Array[], width: number, height: number, fps: number, colors: number): Uint8Array {
  // Palet uit een handvol beeldjes verspreid over de animatie
  const pick = [...new Set([0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => Math.round(f * (frames.length - 1))))]
  const sample = new Uint8Array(pick.length * frames[0].length)
  pick.forEach((idx, k) => sample.set(frames[idx], k * frames[0].length))
  const palette = quantize(sample, colors)
  const gif = GIFEncoder()
  const ms = 1000 / fps
  let i = 0
  let first = true
  while (i < frames.length) {
    let j = i + 1
    while (j < frames.length && sameFrame(frames[j], frames[i])) j++
    const delay = Math.round((ms * (j - i)) / 10) * 10
    gif.writeFrame(applyPalette(frames[i], palette), width, height, { palette: first ? palette : undefined, delay: Math.max(20, delay), repeat: first ? -1 : undefined, first })
    first = false
    i = j
  }
  gif.finish()
  return gif.bytes()
}

const sameFrame = (a: Uint8Array, b: Uint8Array) => a === b || Buffer.compare(Buffer.from(a.buffer, a.byteOffset, a.byteLength), Buffer.from(b.buffer, b.byteOffset, b.byteLength)) === 0

/** Onzichtbaar venster dat MP4 codeert (WebCodecs, H.264). */
async function openEncoder(tmp: string) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/media.js'), sandbox: false, contextIsolation: true, backgroundThrottling: false }
  })
  const page = join(tmp, 'encoder.html')
  await writeFile(page, '<!doctype html><meta charset="utf-8"><title>mp4</title>')
  await win.loadFile(page)
  const next = (channel: string) =>
    new Promise<unknown[]>((resolve) => {
      const h = (e: IpcMainEvent, ...args: unknown[]) => {
        if (e.sender !== win.webContents) return
        ipcMain.removeListener(channel, h)
        resolve(args)
      }
      ipcMain.on(channel, h)
    })
  return { win, next }
}

export async function exportMedia(req: MediaRequest, onProgress?: (msg: string) => void): Promise<MediaResult[]> {
  const results: MediaResult[] = []
  const { mp4, gif } = req.media
  if (!mp4 && !gif) return results
  const stem = fileStem(req.project.name)
  const base = join(req.outDir, stem)
  const tmp = await mkdtemp(join(tmpdir(), 'bnnr-media-'))
  let encoder: Awaited<ReturnType<typeof openEncoder>> | null = null
  try {
    for (const id of req.compositionIds) {
      const comp = req.project.compositions.find((c) => c.id === id)
      if (!comp) continue
      // De banner zoals hij geëxporteerd wordt, tijdelijk uitgepakt
      const dir = join(tmp, comp.id.replace(/[^\w-]/g, '_'))
      await mkdir(dir, { recursive: true })
      const fonts = await prepareFonts(req.dir, req.project, comp)
      const { files } = await pack(req.dir, req.project, comp, 'generic', fonts)
      for (const [n, data] of Object.entries(files)) await writeFile(join(dir, n), data)
      const index = join(dir, 'index.html')
      const name = `${stem}_${comp.width}x${comp.height}px`

      if (mp4) {
        onProgress?.(`MP4 ${comp.width}×${comp.height}…`)
        const fps = Math.min(60, Math.max(10, Math.round(mp4.fps || 30)))
        const scale = mp4.scale === 1 ? 1 : 2
        encoder ??= await openEncoder(tmp)
        const banner = await openBanner(index, comp, scale, true)
        try {
          const ready = encoder.next('mp4:ready')
          encoder.win.webContents.send('mp4:start', { width: banner.width, height: banner.height, fps })
          await ready
          const times = frameTimes(comp, fps)
          for (let i = 0; i < times.length; i++) {
            const data = await banner.grab(times[i])
            const ack = encoder.next('mp4:ack')
            encoder.win.webContents.send('mp4:frame', { i, data })
            const [err] = await ack
            if (err) throw new Error(`MP4-codering mislukt: ${err}`)
          }
          const done = encoder.next('mp4:done')
          encoder.win.webContents.send('mp4:end')
          const [err, bytes] = (await done) as [string | null, Uint8Array | null]
          if (err || !bytes) throw new Error(`MP4-codering mislukt: ${err ?? 'geen uitvoer'}`)
          const file = join(base, 'MP4', `${name}.mp4`)
          await mkdir(join(base, 'MP4'), { recursive: true })
          await writeFile(file, bytes)
          results.push({ kind: 'mp4', composition: comp.name, file, bytes: bytes.byteLength, note: `${banner.width}×${banner.height} (${scale}×), ${fps} fps, ${(times.length / fps).toFixed(1)} s` })
        } finally {
          banner.win.destroy()
        }
      }

      if (gif) {
        onProgress?.(`GIF ${comp.width}×${comp.height}…`)
        const fps0 = Math.min(30, Math.max(4, Math.round(gif.fps || 15)))
        const banner = await openBanner(index, comp, 1, false)
        try {
          // Elk uniek tijdstip één keer vastleggen (loops herhalen dezelfde beeldjes)
          const cache = new Map<number, Uint8Array>()
          const framesAt = async (fps: number) => {
            const out: Uint8Array[] = []
            for (const t of frameTimes(comp, fps)) {
              let f = cache.get(t)
              if (!f) cache.set(t, (f = toRgba(await banner.grab(t))))
              out.push(f)
            }
            return out
          }
          const max = gif.maxKb && gif.maxKb > 0 ? gif.maxKb * 1024 : Infinity
          // Steeds iets lichter tot hij onder de maximale grootte blijft
          const tries: [number, number][] = [
            [fps0, 128],
            [fps0, 64],
            [Math.min(fps0, 10), 64],
            [Math.min(fps0, 10), 32],
            [Math.min(fps0, 8), 16]
          ]
          let best: { bytes: Uint8Array; fps: number; colors: number } | null = null
          for (const [fps, colors] of tries) {
            const bytes = encodeGif(await framesAt(fps), banner.width, banner.height, fps, colors)
            best = { bytes, fps, colors }
            if (bytes.byteLength <= max) break
          }
          const file = join(base, 'GIF', `${name}.gif`)
          await mkdir(join(base, 'GIF'), { recursive: true })
          await writeFile(file, best!.bytes)
          const over = best!.bytes.byteLength > max
          results.push({
            kind: 'gif',
            composition: comp.name,
            file,
            bytes: best!.bytes.byteLength,
            note: `${banner.width}×${banner.height}, ${best!.fps} fps, ${best!.colors} kleuren`,
            ...(over ? { warning: `Groter dan ${gif.maxKb} KB, ook met minder kleuren en een lagere fps. Maak de animatie korter of rustiger.` } : {})
          })
        } finally {
          banner.win.destroy()
        }
      }
    }
  } finally {
    encoder?.win.destroy()
    await rm(tmp, { recursive: true, force: true })
  }
  return results
}

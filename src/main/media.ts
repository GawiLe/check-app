// Banners als MP4 en GIF: de geëxporteerde banner wordt in een onzichtbaar venster beeldje voor beeldje
// op de juiste tijd gezet (BS.seek, dezelfde runtime als de export) en vastgelegd. MP4 wordt gecodeerd
// met WebCodecs in een apart onzichtbaar venster (preload/media.ts), GIF met gifenc in dit proces.
// Resultaat altijd in een eigen map: <exportmap>/<project>/MP4/ en /GIF/.
import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import { renderWindow, serveDir } from './render'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { applyPalette, GIFEncoder, quantize } from 'gifenc'
import type { MediaRequest, MediaResult } from '@shared/api'
import { endFrameTime } from '@shared/motion'
import type { Composition } from '@shared/types'
import { bannerName, fileStem, pack, prepareFonts } from './exporter'

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
  // Venster op de echte maat; voor MP4 (H.264 wil even maten) wordt het beeld daarna hooguit 1 px
  // opgerekt in plaats van er een strook achtergrond bij te zetten
  const winW = Math.max(1, Math.round((Number(comp.width) || 1) * scale))
  const winH = Math.max(1, Math.round((Number(comp.height) || 1) * scale))
  const width = even ? Math.ceil(winW / 2) * 2 : winW
  const height = even ? Math.ceil(winH / 2) * 2 : winH
  // Afgeschermd renderen: alleen de tijdelijke exportmap, geen netwerk en geen toegang tot andere bestanden
  const served = serveDir(dirname(indexHtml))
  const win = renderWindow(winW, winH)
  win.on('closed', served.release)
  await win.loadURL(served.url)
  win.webContents.setZoomFactor(scale)
  // Wachten tot afbeeldingen en fonts geladen zijn (de runtime zet dan class "r" op body)
  await win.webContents.executeJavaScript(`new Promise(function(res){var n=0;(function w(){if(document.body.className.indexOf('r')>=0||n++>200){if(window.BS)BS.pause();res()}else setTimeout(w,30)})()})`)
  const grab = async (t: number): Promise<Buffer> => {
    await win.webContents.executeJavaScript(`BS.seek(${Number(t) || 0});new Promise(function(r){requestAnimationFrame(function(){requestAnimationFrame(r)})})`)
    let img = await win.webContents.capturePage({ x: 0, y: 0, width: winW, height: winH })
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
  // GIF-vertragingen zijn hele honderdsten: het afrondingsverschil schuift door naar het volgende beeldje,
  // zodat de GIF in totaal precies even lang duurt als de banner (geen drift bij bijv. 15 of 30 fps)
  let exact = 0
  let written = 0
  while (i < frames.length) {
    let j = i + 1
    while (j < frames.length && sameFrame(frames[j], frames[i])) j++
    exact += ms * (j - i)
    const delay = Math.max(20, Math.round((exact - written) / 10) * 10)
    written += delay
    gif.writeFrame(applyPalette(frames[i], palette), width, height, { palette: first ? palette : undefined, delay, repeat: first ? -1 : undefined, first })
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
    webPreferences: { preload: join(__dirname, '../preload/media.js'), sandbox: true, contextIsolation: true, backgroundThrottling: false }
  })
  const page = join(tmp, 'encoder.html')
  await writeFile(page, '<!doctype html><meta charset="utf-8"><title>mp4</title>')
  await win.loadFile(page)
  // Antwoord van het encodervenster, met een time-out: loopt de encoder vast, dan een duidelijke fout
  const next = (channel: string, ms = 30000) =>
    new Promise<unknown[]>((resolve, reject) => {
      const done = () => {
        clearTimeout(timer)
        ipcMain.removeListener(channel, h)
        if (!win.isDestroyed()) win.webContents.removeListener('render-process-gone', gone)
      }
      const h = (e: IpcMainEvent, ...args: unknown[]) => {
        if (e.sender !== win.webContents) return
        done()
        resolve(args)
      }
      const gone = () => {
        done()
        reject(new Error('De MP4-encoder is gestopt.'))
      }
      const timer = setTimeout(() => {
        done()
        reject(new Error('De MP4-encoder reageert niet (time-out).'))
      }, ms)
      ipcMain.on(channel, h)
      win.webContents.on('render-process-gone', gone)
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
      const name = bannerName(req.project, comp)

      // Gaat één formaat mis, dan de rest gewoon afmaken en de fout bij dat formaat melden
      const failed = (kind: 'mp4' | 'gif', err: unknown) =>
        results.push({ kind, composition: comp.name, file: '', bytes: 0, note: `${comp.width}×${comp.height}`, warning: `Mislukt: ${(err as Error)?.message ?? err}` })

      if (mp4) {
        onProgress?.(`MP4 ${comp.width}×${comp.height}…`)
        const fps = Math.min(60, Math.max(10, Math.round(mp4.fps || 30)))
        const scale = mp4.scale === 1 ? 1 : 2
        let banner: Awaited<ReturnType<typeof openBanner>> | null = null
        try {
          encoder ??= await openEncoder(tmp)
          banner = await openBanner(index, comp, scale, true)
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
          const done = encoder.next('mp4:done', 120000)
          encoder.win.webContents.send('mp4:end')
          const [err, bytes] = (await done) as [string | null, Uint8Array | null]
          if (err || !bytes) throw new Error(`MP4-codering mislukt: ${err ?? 'geen uitvoer'}`)
          const file = join(base, 'MP4', `${name}.mp4`)
          await mkdir(join(base, 'MP4'), { recursive: true })
          await writeFile(file, bytes)
          results.push({ kind: 'mp4', composition: comp.name, file, bytes: bytes.byteLength, note: `${banner.width}×${banner.height} (${scale}×), ${fps} fps, ${(times.length / fps).toFixed(1)} s` })
        } catch (err) {
          failed('mp4', err)
          // Een vastgelopen encoder niet hergebruiken voor het volgende formaat
          encoder?.win.destroy()
          encoder = null
        } finally {
          banner?.win.destroy()
        }
      }

      if (gif) {
        onProgress?.(`GIF ${comp.width}×${comp.height}…`)
        const fps0 = Math.min(30, Math.max(4, Math.round(gif.fps || 15)))
        let banner: Awaited<ReturnType<typeof openBanner>> | null = null
        try {
          banner = await openBanner(index, comp, 1, false)
          const b = banner
          // Elk uniek tijdstip één keer vastleggen (loops herhalen dezelfde beeldjes)
          const cache = new Map<number, Uint8Array>()
          const framesAt = async (fps: number) => {
            const out: Uint8Array[] = []
            for (const t of frameTimes(comp, fps)) {
              let f = cache.get(t)
              if (!f) cache.set(t, (f = toRgba(await b.grab(t))))
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
            const bytes = encodeGif(await framesAt(fps), b.width, b.height, fps, colors)
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
            note: `${b.width}×${b.height}, ${best!.fps} fps, ${best!.colors} kleuren`,
            ...(over ? { warning: `Groter dan ${gif.maxKb} KB, ook met minder kleuren en een lagere fps. Maak de animatie korter of rustiger.` } : {})
          })
        } catch (err) {
          failed('gif', err)
        } finally {
          banner?.win.destroy()
        }
      }
    }
  } finally {
    encoder?.win.destroy()
    await rm(tmp, { recursive: true, force: true })
  }
  return results
}

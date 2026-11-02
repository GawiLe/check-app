// Banners als MP4 en GIF: de geëxporteerde banner wordt in een onzichtbaar venster beeldje voor beeldje
// op de juiste tijd gezet (BS.seek, dezelfde runtime als de export) en vastgelegd. MP4 wordt gecodeerd
// met WebCodecs in een apart onzichtbaar venster (preload/media.ts), GIF met gifenc in dit proces.
// Resultaat altijd in een eigen map: <exportmap>/<project>/MP4/ en /GIF/.
import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import { renderWindow, serveDir } from './render'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { buildPalette, createGifWriter, type GifQuality } from './gif'
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
        // GIF-vertragingen zijn honderdsten; 50 fps (20 ms) is het snelste dat browsers goed afspelen
        const fps0 = Math.min(50, Math.max(5, Math.round(gif.fps || 25)))
        const quality: GifQuality = gif.quality === 'high' ? 'high' : 'normal'
        let banner: Awaited<ReturnType<typeof openBanner>> | null = null
        try {
          banner = await openBanner(index, comp, 1, false)
          const b = banner
          // Elk uniek tijdstip één keer vastleggen (loops herhalen dezelfde beeldjes), zolang het geheugen
          // het toelaat; daarboven wordt een beeldje bij een volgende poging opnieuw vastgelegd
          const cache = new Map<number, Uint8Array>()
          let cached = 0
          const frameAt = async (t: number) => {
            let f = cache.get(t)
            if (!f) {
              f = toRgba(await b.grab(t))
              if (cached + f.byteLength <= 384 * 1024 * 1024) {
                cache.set(t, f)
                cached += f.byteLength
              }
            }
            return f
          }
          const encode = async (fps: number, colors: number, q: GifQuality) => {
            const times = frameTimes(comp, fps)
            let palette: number[][] | undefined
            if (q === 'normal') {
              // Eén palet uit beeldjes verspreid over de hele animatie
              const uniq = [...new Set(times)]
              const n = Math.min(24, uniq.length)
              const samples: Uint8Array[] = []
              for (let k = 0; k < n; k++) samples.push(await frameAt(uniq[Math.round((k * (uniq.length - 1)) / Math.max(1, n - 1))]))
              palette = buildPalette(samples, colors)
            }
            const w = createGifWriter({ width: b.width, height: b.height, fps, colors, quality: q }, palette)
            for (const t of times) w.add(await frameAt(t))
            return w.finish()
          }
          const max = gif.maxKb && gif.maxKb > 0 ? gif.maxKb * 1024 : Infinity
          // Steeds iets lichter tot hij onder de maximale grootte blijft (nooit meer fps dan gekozen)
          const ladder: [number, number, GifQuality][] = [
            ...(quality === 'high' ? ([[fps0, 256, 'high'], [fps0, 128, 'high']] as [number, number, GifQuality][]) : []),
            [fps0, 256, 'normal'],
            [fps0, 128, 'normal'],
            [Math.min(fps0, 25), 128, 'normal'],
            [Math.min(fps0, 20), 96, 'normal'],
            [Math.min(fps0, 15), 64, 'normal'],
            [Math.min(fps0, 10), 64, 'normal'],
            [Math.min(fps0, 8), 32, 'normal']
          ]
          const tries = ladder.filter((t, i) => ladder.findIndex((u) => u.join() === t.join()) === i)
          let best: { bytes: Uint8Array; fps: number; colors: number; quality: GifQuality } | null = null
          for (const [fps, colors, q] of tries) {
            const bytes = await encode(fps, colors, q)
            best = { bytes, fps, colors, quality: q }
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
            note: `${b.width}×${b.height}, ${best!.fps} fps, ${best!.colors} kleuren${best!.quality === 'high' ? ', hoge kwaliteit' : ''}`,
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

// Preload van het onzichtbare MP4-venster: codeert beeldjes (BGRA van capturePage) met WebCodecs
// (H.264; op de Mac via de hardware-encoder) en verpakt ze als MP4. Het hoofdproces stuurt de beeldjes
// één voor één en wacht steeds op een "klaar" zodat er nooit te veel tegelijk in het geheugen zitten.
import { ipcRenderer } from 'electron'
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'

let encoder: VideoEncoder | null = null
let muxer: Muxer<ArrayBufferTarget> | null = null
let failure: string | null = null
let size = { width: 0, height: 0, fps: 30 }

ipcRenderer.on('mp4:start', async (_e, opts: { width: number; height: number; fps: number }) => {
  size = opts
  failure = null
  const bitrate = Math.round(opts.width * opts.height * opts.fps * 0.15)
  let codec = 'avc1.640032'
  for (const c of ['avc1.640032', 'avc1.4d0032', 'avc1.42003e']) {
    const ok = await VideoEncoder.isConfigSupported({ codec: c, width: opts.width, height: opts.height, bitrate, framerate: opts.fps }).catch(() => null)
    if (ok?.supported) {
      codec = c
      break
    }
  }
  muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: 'avc', width: opts.width, height: opts.height, frameRate: opts.fps }, fastStart: 'in-memory' })
  encoder = new VideoEncoder({
    output: (chunk, meta) => muxer!.addVideoChunk(chunk, meta),
    error: (e) => void (failure = e.message)
  })
  encoder.configure({ codec, width: opts.width, height: opts.height, bitrate, framerate: opts.fps, avc: { format: 'avc' } })
  ipcRenderer.send('mp4:ready')
})

ipcRenderer.on('mp4:frame', async (_e, msg: { i: number; data: Uint8Array }) => {
  if (!encoder || failure) return ipcRenderer.send('mp4:ack', failure)
  const frame = new VideoFrame(msg.data, {
    format: 'BGRA',
    codedWidth: size.width,
    codedHeight: size.height,
    timestamp: Math.round((msg.i * 1e6) / size.fps),
    duration: Math.round(1e6 / size.fps)
  })
  encoder.encode(frame, { keyFrame: msg.i % (size.fps * 2) === 0 })
  frame.close()
  // Niet te ver vooruit lopen
  while (encoder.encodeQueueSize > 4) await new Promise((r) => setTimeout(r, 5))
  ipcRenderer.send('mp4:ack', failure)
})

ipcRenderer.on('mp4:end', async () => {
  try {
    if (!encoder || !muxer) throw new Error('MP4-encoder niet gestart')
    await encoder.flush()
    encoder.close()
    muxer.finalize()
    if (failure) throw new Error(failure)
    ipcRenderer.send('mp4:done', null, new Uint8Array(muxer.target.buffer))
  } catch (e) {
    ipcRenderer.send('mp4:done', (e as Error).message, null)
  } finally {
    encoder = null
    muxer = null
  }
})

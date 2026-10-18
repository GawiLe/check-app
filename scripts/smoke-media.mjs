// Rooktest: export als MP4 en GIF via het exportvenster — altijd in een eigen map MP4/ en GIF/,
// juiste maat, duur (alle loops tot het eindbeeld), en de GIF blijft onder een ingestelde maximale grootte.
// Gebruik: npm run build && xvfb-run node scripts/smoke-media.mjs <projectmap> <screenshotmap>
// (ffprobe nodig voor de controle van de bestanden)
import { _electron as electron } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pickFolder } from './lib/export.mjs'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
let fails = 0
const check = async (label, fn) => {
  const ok = await fn().catch((e) => (console.log('   ', e.message.split('\n')[0]), false))
  if (!ok) fails++
  console.log(label, ok ? 'OK' : 'MISLUKT')
}
const S = (fn, a) => page.evaluate(fn, a)
const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-show_streams', '-show_format', '-of', 'json', file]).toString())

await page.waitForSelector('.welcome')
await S((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')
// Korte banner (3 s, 2 loops) zodat de test snel is; eindbeeld 2,5 s
await S(() =>
  window.__bsStore.getState().update((p) => {
    const c = p.compositions[0]
    c.duration = 3
    c.loops = 2
    c.endFrame = 2.5
    p.name = 'Media Test'
  })
)
const out = `${shots}/out`
await pickFolder(app, out)

// 1. Alleen MP4 en GIF (geen HTML5-platform aangevinkt)
await page.getByRole('button', { name: 'Exporteren' }).first().click()
for (const box of await page.locator('.modal .target-row input[type=checkbox]').all()) if (await box.isChecked()) await box.uncheck()
const mediaRow = (label) => page.locator('.media-row', { has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) })
await mediaRow('MP4').locator('input[type=checkbox]').check()
await mediaRow('GIF').locator('input[type=checkbox]').check()
await mediaRow('GIF').locator('.media-max').fill('400')
await check('knop: Exporteer + MP4 + GIF', async () => /Exporteer \+ MP4 \+ GIF/.test(await page.locator('.modal .actions .primary').innerText()))
await page.screenshot({ path: `${shots}/m1-exportvenster.png` })
await page.locator('.modal .actions .primary').click()
await page.waitForSelector('.modal .result', { timeout: 180000 })
await page.screenshot({ path: `${shots}/m2-resultaat.png` })

const base = join(out, 'Media-Test')
const mp4 = join(base, 'MP4', 'Media-Test_300x600px.mp4')
const gif = join(base, 'GIF', 'Media-Test_300x600px.gif')
await check('MP4 en GIF elk in een eigen map (ook met één/geen platform)', async () => existsSync(mp4) && existsSync(gif) && (await readdir(base)).sort().join() === 'GIF,MP4')
await check('MP4: H.264, 600×1200 (2×), 30 fps, duur 3 + 2,5 s', async () => {
  const p = probe(mp4)
  const v = p.streams[0]
  const dur = Number(p.format.duration)
  console.log(`   (mp4: ${v.codec_name} ${v.width}×${v.height} ${v.r_frame_rate} ${dur.toFixed(2)} s, ${v.nb_read_frames} beeldjes, ${((await stat(mp4)).size / 1024).toFixed(0)} KB)`)
  return v.codec_name === 'h264' && v.width === 600 && v.height === 1200 && v.r_frame_rate === '30/1' && Math.abs(dur - 5.5) < 0.15
})
await check('GIF: 300×600, ≤ 400 KB', async () => {
  const p = probe(gif)
  const v = p.streams[0]
  const kb = (await stat(gif)).size / 1024
  console.log(`   (gif: ${v.width}×${v.height}, ${v.nb_read_frames} beeldjes, ${kb.toFixed(0)} KB, ${Number(p.format.duration).toFixed(2)} s)`)
  return v.codec_name === 'gif' && v.width === 300 && v.height === 600 && kb <= 400 && Math.abs(Number(p.format.duration) - 5.5) < 0.3
})
await check('GIF: laatste beeldje = eindbeeld (zelfde als de backup)', async () => {
  // Laatste beeldje uit de GIF en het eindbeeld uit de MP4 vergelijken op gemiddelde kleur
  const avg = (file) => {
    const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=30:60', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { maxBuffer: 1 << 28 })
    const last = buf.subarray(buf.length - 30 * 60 * 3)
    let s = 0
    for (const b of last) s += b
    return s / last.length
  }
  const a = avg(gif)
  const b = avg(mp4)
  console.log(`   (gemiddelde helderheid eind: gif ${a.toFixed(1)}, mp4 ${b.toFixed(1)})`)
  return Math.abs(a - b) < 8
})
await check('resultaat in het venster met grootte en Toon-knop', async () => (await page.locator('.modal .result', { hasText: 'MP4' }).count()) === 1 && (await page.locator('.modal .result', { hasText: 'GIF' }).count()) === 1)
await check('keuze onthouden in het project', async () => {
  const m = await S(() => window.__bsStore.getState().project.media)
  return m.mp4?.fps === 30 && m.gif?.maxKb === 400
})

// 2. Lage maximale grootte: GIF wordt lichter gemaakt, met waarschuwing als het niet lukt
await mediaRow('MP4').locator('input[type=checkbox]').uncheck()
await mediaRow('GIF').locator('.media-max').fill('20')
await page.locator('.modal .actions .primary').click()
await page.waitForFunction(() => window.__bsStore.getState().mediaResults?.length === 1 && window.__bsStore.getState().mediaResults[0].kind === 'gif', null, { timeout: 180000 })
await check('GIF lichter gemaakt (minder kleuren/fps) of waarschuwing', async () => {
  const r = (await S(() => window.__bsStore.getState().mediaResults))[0]
  console.log(`   (${r.note}, ${(r.bytes / 1024).toFixed(0)} KB${r.warning ? ', waarschuwing' : ''})`)
  return (r.bytes <= 20 * 1024 && !r.warning) || (!!r.warning && !/128 kleuren/.test(r.note))
})

console.log(fails ? `${fails} controle(s) mislukt` : 'MP4/GIF: alles in orde')
await S(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

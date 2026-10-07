import { BrowserWindow } from 'electron'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zipSync } from 'fflate'
import type { ExportRequest } from '@shared/api'
import { buildBanner, charsPerFont } from '@shared/build'
import { fontsInline, TARGET_IDS, TARGETS } from '@shared/specs'
import { inside } from './paths'
import type { Composition, ExportResult, ExportTarget, Project } from '@shared/types'
import { initialLoad, validateBanner } from '@shared/validate'
import { subsetToWoff2 } from './fonts'

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'banner'

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp'
}

/**
 * Fonts verkleinen tot de letters die in dít formaat echt gebruikt worden (subset), als woff2.
 * Per formaat, want elke banner bevat zijn eigen kopie (zeker bij Base64). Gelijke sets worden hergebruikt.
 */
const subsetCache = new Map<string, Promise<Buffer>>()
async function prepareFonts(dir: string, project: Project, comp: Composition): Promise<Record<string, Buffer>> {
  const chars = charsPerFont(project, comp)
  const out: Record<string, Buffer> = {}
  for (const f of project.fonts) {
    if (f.system || !chars[f.id]) continue
    const set = [...new Set(chars[f.id] + ' ')].sort().join('')
    const key = `${dir}|${f.file}|${set}`
    if (!subsetCache.has(key)) subsetCache.set(key, subsetToWoff2(dir, f.file, set))
    try {
      out[f.id] = await subsetCache.get(key)!
    } catch (err) {
      subsetCache.delete(key)
      throw err
    }
  }
  return out
}

async function exportOne(
  dir: string,
  project: Project,
  comp: Composition,
  target: ExportTarget,
  fonts: Record<string, Buffer>
): Promise<ExportResult> {
  const spec = TARGETS[target]
  const name = `${slug(project.name)}_${comp.width}x${comp.height}`
  const targetDir = join(dir, 'export', target)
  const outDir = join(targetDir, name)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  const files: Record<string, Uint8Array> = {}

  // Afbeeldingen plat in de root, met unieke, veilige namen.
  const assetNames: Record<string, string> = {}
  const taken = new Set(['index.html'])
  const assetUrl = (p: string) => {
    if (!assetNames[p]) {
      const ext = extname(p).toLowerCase()
      const stem = slug(basename(p, extname(p)))
      let n = `${stem}${ext}`
      for (let i = 2; taken.has(n); i++) n = `${stem}-${i}${ext}`
      taken.add(n)
      assetNames[p] = n
    }
    return assetNames[p]
  }

  const fontSrc: Record<string, string> = {}
  project.fonts.forEach((f, i) => {
    const buf = fonts[f.id]
    if (!buf) return
    if (fontsInline(target, project)) {
      fontSrc[f.id] = `url(data:font/woff2;base64,${buf.toString('base64')}) format("woff2")`
    } else {
      const fname = `f${i}.woff2`
      fontSrc[f.id] = `url(${fname}) format("woff2")`
      files[fname] = buf
    }
  })

  const built = buildBanner(project, comp, { mode: 'export', target, assetUrl, fontSrc })
  // Alleen fonts meenemen die in déze compositie gebruikt worden.
  for (const [fid, src] of Object.entries(fontSrc)) {
    const m = src.match(/^url\((f\d+\.woff2)\)/)
    if (m && !built.fontIds.includes(fid)) delete files[m[1]]
  }
  for (const p of built.assets) files[assetNames[p]] = await readFile(inside(dir, p))
  files['index.html'] = new TextEncoder().encode(built.html)
  for (const [n, text] of Object.entries(built.extraFiles)) files[n] = new TextEncoder().encode(text)

  for (const [n, data] of Object.entries(files)) await writeFile(join(outDir, n), data)

  const zip = zipSync(files, { level: 9 })
  const zipPath = join(targetDir, `${name}.zip`)
  await writeFile(zipPath, zip)

  let backup: string | null = null
  let backupBytes: number | null = null
  // Backup-afbeelding van het eindframe, met dezelfde naam als de zip: CM360 koppelt hem dan bij
  // het (bulk)uploaden automatisch aan de juiste creative. Ook voor Google Ads, handig als statische variant.
  {
    try {
      backup = join(targetDir, `${name}.jpg`)
      await renderBackup(join(outDir, 'index.html'), comp, backup)
      backupBytes = (await stat(backup)).size
    } catch (err) {
      console.error('Backup render mislukt', err)
      backup = null
    }
  }

  const fileList = Object.entries(files).map(([n, d]) => ({ name: n, bytes: d.byteLength }))
  const issues = validateBanner({ target, comp, html: built.html, files: fileList, zipBytes: zip.byteLength, backupBytes, politeLoad: project.politeLoad })

  // Laat zien wat het verkleinen van de fonts oplevert
  const chars = charsPerFont(project, comp)
  for (const f of project.fonts) {
    const buf = fonts[f.id]
    if (!buf || !built.fontIds.includes(f.id)) continue
    const orig = await stat(inside(dir, f.file)).then((st) => st.size).catch(() => 0)
    const n = new Set(chars[f.id]).size
    const kbs = (b: number) => `${(b / 1024).toFixed(1)} KB`
    const at = issues.findIndex((i) => i.rule === 'ok')
    issues.splice(at < 0 ? issues.length : at, 0, {
      level: 'info',
      rule: 'font',
      message: `${f.family} ${f.weight}: ${n} tekens gebruikt, verkleind van ${kbs(orig)} tot ${kbs(buf.byteLength)}${fontsInline(target, project) ? ' en als Base64 in de HTML gezet' : ' (los .woff2-bestand)'}.`
    })
  }

  return {
    target,
    composition: comp.name,
    folder: outDir,
    zip: zipPath,
    zipBytes: zip.byteLength,
    initialLoadBytes: initialLoad(fileList, project.politeLoad),
    files: fileList,
    backup,
    issues
  }
}

/** Rendert het eindframe van de banner naar een JPG (backup-afbeelding voor CM360/GAM). */
export async function renderBackup(indexHtml: string, comp: Composition, outFile: string): Promise<void> {
  const win = new BrowserWindow({
    show: false,
    width: comp.width,
    height: comp.height,
    useContentSize: true,
    webPreferences: { offscreen: true, javascript: true, sandbox: true }
  })
  try {
    await win.loadURL(pathToFileURL(indexHtml).href)
    await win.webContents.executeJavaScript(`new Promise(function(res){
      var n=0;(function w(){ if(document.body.className.indexOf('r')>=0||n++>100){ if(window.BS)BS.seek(BS.end); requestAnimationFrame(function(){requestAnimationFrame(res)}) } else setTimeout(w,30) })()
    })`)
    const img = await win.webContents.capturePage({ x: 0, y: 0, width: comp.width, height: comp.height })
    let q = 85
    let jpg = img.toJPEG(q)
    while (jpg.byteLength > 40 * 1024 && q > 40) jpg = img.toJPEG((q -= 10))
    await writeFile(outFile, jpg)
  } finally {
    win.destroy()
  }
}

export async function exportBanners(req: ExportRequest): Promise<ExportResult[]> {
  // Cache alleen binnen één export: een vervangen fontbestand moet de volgende keer opnieuw worden verkleind
  subsetCache.clear()
  const results: ExportResult[] = []
  // Alleen bekende platforms: de naam wordt een mapnaam die vóór het schrijven wordt leeggemaakt
  const targets = req.targets.filter((t) => TARGET_IDS.includes(t))
  for (const id of req.compositionIds) {
    const comp = req.project.compositions.find((c) => c.id === id)
    if (!comp) continue
    const fonts = await prepareFonts(req.dir, req.project, comp)
    for (const target of targets) results.push(await exportOne(req.dir, req.project, comp, target, fonts))
  }
  await writeFile(join(req.dir, 'export', 'rapport.json'), JSON.stringify(results, null, 2))
  return results
}

export { MIME }

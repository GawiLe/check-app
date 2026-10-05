import { BrowserWindow } from 'electron'
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { zipSync } from 'fflate'
import type { ExportRequest } from '@shared/api'
import { buildBanner, charsPerFont } from '@shared/build'
import { TARGETS } from '@shared/specs'
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

/** Subset fonts één keer per export, over alle formaten heen. */
async function prepareFonts(dir: string, project: Project): Promise<Record<string, Buffer>> {
  const chars = charsPerFont(project)
  const out: Record<string, Buffer> = {}
  for (const f of project.fonts) if (chars[f.id]) out[f.id] = await subsetToWoff2(dir, f.file, chars[f.id])
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
    if (spec.inlineFonts) {
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
  for (const p of built.assets) files[assetNames[p]] = await readFile(join(dir, p))
  files['index.html'] = new TextEncoder().encode(built.html)

  for (const [n, data] of Object.entries(files)) await writeFile(join(outDir, n), data)

  const zip = zipSync(files, { level: 9 })
  const zipPath = join(targetDir, `${name}.zip`)
  await writeFile(zipPath, zip)

  let backup: string | null = null
  let backupBytes: number | null = null
  if (spec.backupImage) {
    try {
      backup = join(targetDir, `${name}_backup.jpg`)
      await renderBackup(join(outDir, 'index.html'), comp, backup)
      backupBytes = (await stat(backup)).size
    } catch (err) {
      console.error('Backup render mislukt', err)
      backup = null
    }
  }

  const fileList = Object.entries(files).map(([n, d]) => ({ name: n, bytes: d.byteLength }))
  const issues = validateBanner({ target, comp, html: built.html, files: fileList, zipBytes: zip.byteLength, backupBytes, politeLoad: project.politeLoad })

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
  const fonts = await prepareFonts(req.dir, req.project)
  const results: ExportResult[] = []
  for (const target of req.targets)
    for (const id of req.compositionIds) {
      const comp = req.project.compositions.find((c) => c.id === id)
      if (comp) results.push(await exportOne(req.dir, req.project, comp, target, fonts))
    }
  await writeFile(join(req.dir, 'export', 'rapport.json'), JSON.stringify(results, null, 2))
  return results
}

export { MIME }

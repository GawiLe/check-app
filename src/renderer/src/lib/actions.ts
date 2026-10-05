import { createLayer, deriveComposition, newId } from '@shared/factory'
import { mergeTracks, PRESETS } from '@shared/presets'
import type { ExportTarget, Layer, LayerType } from '@shared/types'
import { assetUrl, currentComp, findComp, findLayer, updateLayer, useStore } from '../store'

const S = () => useStore.getState()

function fail(err: unknown) {
  const msg = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
  S().setStatus(msg, 'error')
}

export async function refreshAssets() {
  const { dir } = S()
  if (dir) S().setAssets(await window.bs.listAssets(dir))
}

export async function confirmDiscard(): Promise<boolean> {
  return !S().dirty || window.confirm('Er zijn niet-opgeslagen wijzigingen. Doorgaan zonder opslaan?')
}

export async function newProject(boilerplateId: string | null, name: string) {
  try {
    const opened = await window.bs.newProject(boilerplateId, name)
    if (!opened) return
    S().openProject(opened.dir, opened.project)
    S().setDialog(null)
    await refreshAssets()
    S().setStatus(`Project aangemaakt in ${opened.dir}`)
  } catch (e) {
    fail(e)
  }
}

export async function openProject(dir?: string) {
  if (!(await confirmDiscard())) return
  try {
    const opened = await window.bs.openProject(dir)
    if (!opened) return
    S().openProject(opened.dir, opened.project)
    await refreshAssets()
    S().setStatus(`Geopend: ${opened.dir}`)
  } catch (e) {
    fail(e)
  }
}

export async function save() {
  const { dir, project } = S()
  if (!dir || !project) return
  try {
    await window.bs.saveProject(dir, project)
    S().markSaved()
    S().setStatus('Opgeslagen')
  } catch (e) {
    fail(e)
  }
}

export function addLayer(type: LayerType, init?: (l: Layer) => void) {
  const comp = currentComp(S())
  if (!comp) return
  const layer = createLayer(type, comp)
  init?.(layer)
  const { compId } = S()
  S().update((p) => findComp(p, compId).layers.unshift(layer))
  S().select([layer.id])
  return layer
}

export async function addImageLayer(path: string) {
  const comp = currentComp(S())
  if (!comp) return
  const img = new Image()
  img.src = assetUrl(path, S().assetsRev)
  try {
    await img.decode()
  } catch {
    /* onbekende maat: standaard gebruiken */
  }
  const w = img.naturalWidth || 200
  const h = img.naturalHeight || 150
  const s = Math.min(1, (comp.width - 40) / w, (comp.height - 40) / h)
  addLayer('image', (l) => {
    l.name = path.split('/').pop()!
    l.image!.src = path
    l.width = Math.round(w * s)
    l.height = Math.round(h * s)
    l.x = Math.round((comp.width - l.width) / 2)
    l.y = Math.round((comp.height - l.height) / 2)
  })
}

export async function importImages() {
  const { dir } = S()
  if (!dir) return
  try {
    const paths = await window.bs.importImages(dir)
    await refreshAssets()
    if (paths.length) S().setStatus(`${paths.length} afbeelding(en) toegevoegd aan assets/`)
  } catch (e) {
    fail(e)
  }
}

export async function importFonts() {
  const { dir } = S()
  if (!dir) return
  try {
    const fonts = await window.bs.importFonts(dir)
    if (!fonts.length) return
    S().update((p) => p.fonts.push(...fonts))
    S().setStatus(`Font(s) toegevoegd: ${fonts.map((f) => `${f.family} ${f.weight}`).join(', ')}`)
  } catch (e) {
    fail(e)
  }
}

export function duplicateSelection() {
  const { selection, compId } = S()
  if (!selection.length) return
  const ids: string[] = []
  S().update((p) => {
    const comp = findComp(p, compId)
    for (const id of selection) {
      const i = comp.layers.findIndex((l) => l.id === id)
      if (i < 0) continue
      const copy: Layer = { ...structuredClone(comp.layers[i]), id: newId('l'), name: comp.layers[i].name + ' kopie' }
      copy.x += 10
      copy.y += 10
      comp.layers.splice(i, 0, copy)
      ids.push(copy.id)
    }
  })
  S().select(ids)
}

export function deleteSelection() {
  const { selection, selectedKey, compId } = S()
  if (selectedKey) {
    updateLayer(selectedKey.layerId, (l) => {
      const kfs = (l.tracks[selectedKey.prop] ?? []).filter((k) => Math.abs(k.t - selectedKey.t) > 1e-4)
      if (kfs.length) l.tracks[selectedKey.prop] = kfs
      else delete l.tracks[selectedKey.prop]
    })
    S().selectKey(null)
    return
  }
  if (!selection.length) return
  S().update((p) => {
    const comp = findComp(p, compId)
    comp.layers = comp.layers.filter((l) => !selection.includes(l.id))
  })
  S().select([])
}

export function moveLayer(layerId: string, dir: -1 | 1) {
  const { compId } = S()
  S().update((p) => {
    const layers = findComp(p, compId).layers
    const i = layers.findIndex((l) => l.id === layerId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= layers.length) return
    ;[layers[i], layers[j]] = [layers[j], layers[i]]
  })
}

export function applyPreset(presetId: string, start: number, duration: number) {
  const { selection, compId } = S()
  const preset = PRESETS.find((p) => p.id === presetId)
  const comp = currentComp(S())
  if (!preset || !comp || !selection.length) return
  S().update((p) => {
    for (const id of selection) {
      const l = findLayer(p, compId, id)
      if (!l) continue
      const res = preset.apply(l, { start, duration, compWidth: comp.width, compHeight: comp.height })
      l.tracks = mergeTracks(l.tracks, res.tracks)
      if (res.revealMode) {
        l.revealMode = res.revealMode
        l.reveal = 1
      }
    }
    const c = findComp(p, compId)
    c.duration = Math.max(c.duration, Math.ceil(start + duration))
  })
}

export async function aiAnimate(prompt: string): Promise<string | null> {
  const { project, compId, selection } = S()
  if (!project || !compId) return null
  try {
    const res = await window.bs.aiAnimate(project, compId, selection, prompt)
    S().update((p) => {
      const comp = findComp(p, compId)
      for (const r of res.layers) {
        const l = comp.layers.find((x) => x.id === r.layerId)
        if (!l) continue
        l.tracks = { ...l.tracks, ...r.tracks }
        if (r.revealMode) l.revealMode = r.revealMode
        if (r.revealMode && r.revealMode !== 'none') l.reveal = 1
      }
      if (res.duration && res.duration > 0) comp.duration = Math.min(30, res.duration)
    })
    S().setStatus('AI-animatie toegepast (Ctrl/Cmd+Z om ongedaan te maken)')
    return res.explanation
  } catch (e) {
    fail(e)
    return null
  }
}

/** Genereert de paden voor een write-on laag uit het gekozen font. */
export async function regenerateWriteOn(layerId: string) {
  const { dir, project, compId } = S()
  if (!dir || !project) return
  const l = findLayer(project, compId, layerId)
  const w = l?.writeon
  if (!l || !w) return
  const font = project.fonts.find((f) => f.id === w.fontId) ?? project.fonts[0]
  if (!font) {
    S().setStatus('Importeer eerst een font (woff/woff2/ttf/otf) voor write-on.', 'error')
    return
  }
  try {
    const res = await window.bs.generateWriteOn(dir, font.file, w.content, w.size)
    updateLayer(layerId, (x) => {
      x.writeon!.glyphs = res.glyphs
      x.writeon!.viewBox = res.viewBox
      x.writeon!.fontId = font.id
      x.width = res.width
      x.height = res.height
    })
  } catch (e) {
    fail(e)
  }
}

export function addFormat(width: number, height: number, name?: string) {
  const { project, compId } = S()
  if (!project) return
  const base = project.compositions.find((c) => c.id === project.baseCompositionId) ?? findComp(project, compId)
  const comp = deriveComposition(base, width, height, name)
  S().update((p) => p.compositions.push(comp))
  S().setComp(comp.id)
  S().setDialog(null)
}

export function deleteComposition(id: string) {
  const { project } = S()
  if (!project || id === project.baseCompositionId) return
  if (!window.confirm('Dit formaat verwijderen?')) return
  S().update((p) => {
    p.compositions = p.compositions.filter((c) => c.id !== id)
  })
  S().setComp(project.baseCompositionId)
}

export async function runExport(compositionIds: string[], targets: ExportTarget[]) {
  const { dir, project } = S()
  if (!dir || !project) return
  try {
    S().setStatus('Exporteren…')
    await save()
    const results = await window.bs.exportBanners({ dir, project: S().project!, compositionIds, targets })
    S().setExportResults(results)
    const errors = results.reduce((n, r) => n + r.issues.filter((i) => i.level === 'error').length, 0)
    S().setStatus(
      errors ? `Export klaar met ${errors} fout(en). Zie het exportvenster.` : `${results.length} banner(s) geëxporteerd en gevalideerd.`,
      errors ? 'error' : 'info'
    )
  } catch (e) {
    fail(e)
  }
}

export async function saveAsBoilerplate(name: string) {
  const { dir, project } = S()
  if (!dir || !project) return
  try {
    await window.bs.saveBoilerplate(dir, project, name)
    S().setDialog(null)
    S().setStatus(`Boilerplate "${name}" opgeslagen`)
  } catch (e) {
    fail(e)
  }
}

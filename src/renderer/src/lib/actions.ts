import { anyDirty, openDocument, saveAll } from './documents'
import { createLayer, deriveComposition, newId } from '@shared/factory'
import { applyLibraryItem, applyUserPreset, LIBRARY, presetFromLayer } from '@shared/library'
import { mergeTracks, PRESETS } from '@shared/presets'
import { resetCompOverrides, resetOverrides } from '@shared/sync'
import { allLayers, cloneLayer, findDeep, groupLayers, layerLength, localTime, reorderLayer, sequenceLayers, shiftTiming, ungroup } from '@shared/tree'
import { effectiveLayer } from '@shared/motion'
import type { PropGroupId } from '@shared/propgroups'
import { layerStateAt, restStateAt, upsertKeyframe } from '@shared/anim'
import { layerCorners, moveAnchor } from '@shared/geometry'
import { alignDeltas, distributeDeltas, unionBox, type AlignMode, type Axis, type Box } from '@shared/align'
import { applyKeyAssist, type KeyAssist } from '@shared/keys'
import { groupOf, groupProps } from '@shared/propgroups'
import { penToPath, type PenPoint } from '@shared/path'
import { ANIM_PROPS } from '@shared/types'
import type { ExportTarget, Layer, LayerType } from '@shared/types'
import { parseSvg, shapesToLayers } from './svgimport'
import { round } from '@shared/anim'
import { assetUrl, contextOf, currentComp, findComp, findLayer, layerLocalTime, setLayerValue, updateLayer, useStore, type SelectedKey, type SvgMode } from '../store'

const S = () => useStore.getState()

function fail(err: unknown) {
  const msg = err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err)
  S().setStatus(msg, 'error')
}

export async function refreshAssets() {
  const { dir } = S()
  if (dir) S().setAssets(await window.bs.listAssets(dir))
}

/** Opslaan (alle tabbladen) en daarna het venster sluiten (gekozen in de vraag bij sluiten). */
export async function saveAndClose() {
  await saveAll()
  if (!anyDirty()) await window.bs.closeWindow()
}

/** Projecten (bijv. net aangemaakte varianten) als tabbladen op de achtergrond openen. */
export async function openInBackground(dirs: string[]) {
  const active = S().dir
  for (const dir of dirs) {
    const opened = await window.bs.openProject(dir, true).catch(() => null)
    if (opened) await openDocument(opened.dir, opened.project, { background: true, refresh: true })
  }
  if (active) await window.bs.activateProject(active)
}

export async function newProject(boilerplateId: string | null, name: string) {
  try {
    const opened = await window.bs.newProject(boilerplateId, name)
    if (!opened) return
    // Nieuw project in een eigen tabblad
    await openDocument(opened.dir, opened.project)
    S().setDialog(null)
    await refreshAssets()
    S().setStatus(`Project aangemaakt in ${opened.dir}`)
  } catch (e) {
    fail(e)
  }
}

/** Project openen in een tabblad (staat het al open, dan wordt het dat tabblad). */
export async function openProject(dir?: string) {
  try {
    const opened = await window.bs.openProject(dir)
    if (!opened) return
    await openDocument(opened.dir, opened.project)
    await refreshAssets()
    S().setStatus(`Geopend: ${opened.dir.split(/[\\/]/).pop()}`)
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
  const { compId, activeTab } = S()
  const ctx = contextOf(S().project!, compId, activeTab)
  const layer = createLayer(type, ctx.group ?? comp)
  init?.(layer)
  S().update((p) => void contextOf(p, compId, activeTab).list.unshift(layer))
  S().select([layer.id])
  return layer
}

/** Klikgebied: onzichtbare rechthoek bovenaan met een eigen clickTag (ligt boven de algemene klik). */
export function addClickArea() {
  const comp = currentComp(S())
  if (!comp) return
  const n = allLayers(comp.layers).filter((l) => l.exit).length + 1
  return addLayer('shape', (l) => {
    l.name = `Klikgebied ${n}`
    l.shape!.fillEnabled = false
    l.shape!.strokeWidth = 0
    l.exit = { url: '' }
    Object.assign(l, { width: 200, height: 60 })
    l.x = Math.round(((S().activeTab ? l.width : comp.width) - l.width) / 2)
  })
}

/** Klikgebied aan/uit voor een bestaande laag (bijv. de CTA-knop). */
export function toggleExit(layerId: string) {
  updateLayer(layerId, (l) => {
    if (l.exit) delete l.exit
    else l.exit = { url: '' }
  })
}

/** Canvas-coördinaat → coördinaat binnen de geopende compositie (zonder schaal/rotatie van de groepen). */
export function toContext(x: number, y: number) {
  const { project, compId, activeTab } = S()
  const ctx = contextOf(project!, compId, activeTab)
  return ctx.ancestors.reduce((p, g) => ({ x: p.x - g.x, y: p.y - g.y }), { x, y })
}

/** Vorm tekenen met het rechthoek- of ellipsgereedschap. */
export function addShapeRect(kind: 'rect' | 'ellipse', x: number, y: number, w: number, h: number) {
  const p0 = toContext(x, y)
  const l = addLayer('shape', (l) => {
    l.name = kind === 'ellipse' ? 'Ellips' : 'Rechthoek'
    l.shape!.kind = kind
    Object.assign(l, { x: Math.round(p0.x), y: Math.round(p0.y), width: Math.max(4, Math.round(w)), height: Math.max(4, Math.round(h)) })
  })
  S().setTool('select')
  return l
}

/** Vorm van de pen tool. */
export function addPenShape(points: PenPoint[], closed: boolean) {
  const pts = points.map((pt) => {
    const a = toContext(pt.x, pt.y)
    const h = pt.hx != null ? toContext(pt.hx, pt.hy!) : null
    return { x: a.x, y: a.y, ...(h ? { hx: h.x, hy: h.y } : {}) }
  })
  const path = penToPath(pts, closed)
  if (!path) return
  addLayer('shape', (l) => {
    l.name = closed ? 'Vorm' : 'Lijn'
    Object.assign(l, { x: path.x, y: path.y, width: path.w, height: path.h })
    l.shape!.kind = 'path'
    l.shape!.path = { d: path.d, w: path.w, h: path.h, closed }
    if (!closed) {
      l.shape!.strokeWidth = 3
      l.shape!.strokeColor = '#111111'
    }
  })
  S().setTool('select')
}

/** Tekstgereedschap: nieuwe tekst op de klikplek, meteen bewerken. */
export function addTextAt(x: number, y: number) {
  const p0 = toContext(x, y)
  const l = addLayer('text', (l) => {
    Object.assign(l, { x: Math.round(p0.x), y: Math.round(p0.y), width: 200, height: 40 })
    l.text!.content = 'Tekst'
  })
  S().setTool('select')
  if (l) S().setEditingText(l.id)
}

export async function addImageLayer(path: string, at?: { x: number; y: number }) {
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
    if (at) {
      const p0 = toContext(at.x, at.y)
      l.x = Math.round(p0.x - l.width / 2)
      l.y = Math.round(p0.y - l.height / 2)
    } else {
      l.x = Math.round((comp.width - l.width) / 2)
      l.y = Math.round((comp.height - l.height) / 2)
    }
  })
}

/** Natuurlijke maat van een asset (0 als onbekend). */
async function naturalSize(path: string) {
  const img = new Image()
  img.src = assetUrl(path, S().assetsRev)
  try {
    await img.decode()
  } catch {
    /* onbekend */
  }
  return { w: img.naturalWidth, h: img.naturalHeight }
}

/**
 * Afbeelding van een laag vervangen (zoals "Replace footage" in After Effects):
 * positie, animatie en breedte blijven, de hoogte volgt de verhouding van de nieuwe afbeelding.
 */
export async function replaceImage(layerId: string, path: string) {
  const comp = currentComp(S())
  const found = comp && findDeep(comp.layers, layerId)
  if (!found?.layer.image) return
  const { w, h } = await naturalSize(path)
  const file = path.split('/').pop()!
  updateLayer(layerId, (l) => {
    const old = l.image!.src.split('/').pop()
    l.image!.src = path
    if (l.name === old || !l.name) l.name = file
    if (w && h) {
      const nh = Math.round((l.width * h) / w)
      l.y = Math.round(l.y + (l.height - nh) * (l.anchorY ?? 0.5))
      l.height = nh
    }
  })
  S().setStatus(`Afbeelding vervangen door ${file}`)
}

/** Kies een bestand uit een map, zet het in assets/ en vervang er de afbeelding mee. */
export async function uploadAndReplace(layerId: string) {
  const { dir } = S()
  if (!dir) return
  try {
    const paths = await window.bs.importImages(dir)
    await refreshAssets()
    if (paths[0]) await replaceImage(layerId, paths[0])
    return paths.length > 0
  } catch (e) {
    fail(e)
  }
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
    if (!fonts.length) return []
    S().update((p) => p.fonts.push(...fonts))
    S().setStatus(`Font(s) toegevoegd: ${fonts.map((f) => `${f.family} ${f.weight}`).join(', ')}`)
    return fonts
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
      const f = findDeep(comp.layers, id)
      if (!f) continue
      const copy = cloneLayer(f.layer)
      copy.name = f.layer.name + ' kopie'
      f.list.splice(f.index, 0, copy)
      ids.push(copy.id)
    }
  })
  S().select(ids)
}

export function deleteSelection() {
  const { selection, selectedKey, compId } = S()
  if (selectedKey) {
    // Alle geselecteerde keyframes, per groep (Positie verwijdert X én Y op dat moment)
    const keys = S().selectedKeys.length ? S().selectedKeys : [selectedKey]
    for (const key of keys)
      updateLayer(key.layerId, (l) => {
        for (const m of groupProps(l, groupOf(key.prop))) {
          const kfs = (l.tracks[m] ?? []).filter((k) => Math.abs(k.t - key.t) > 1e-4)
          if (kfs.length) l.tracks[m] = kfs
          else delete l.tracks[m]
        }
      })
    S().selectKey(null)
    return
  }
  if (!selection.length) return
  S().update((p) => {
    const comp = findComp(p, compId)
    for (const id of selection) {
      const f = findDeep(comp.layers, id)
      if (f) f.list.splice(f.index, 1)
    }
  })
  S().select([])
}

export function moveLayer(layerId: string, dir: -1 | 1) {
  const { compId } = S()
  S().update((p) => {
    const f = findDeep(findComp(p, compId).layers, layerId)
    if (!f) return
    const j = f.index + dir
    if (j < 0 || j >= f.list.length) return
    ;[f.list[f.index], f.list[j]] = [f.list[j], f.list[f.index]]
  })
}

/** Selectie onderbrengen in een nieuwe compositie (precompose / Cmd+G). */
export function groupSelection() {
  const { selection, compId, project } = S()
  if (!selection.length || !project) return
  const n = allLayers(findComp(project, compId).layers).filter((l) => l.type === 'group').length + 1
  let gid: string | null = null
  S().update((p) => {
    const g = groupLayers(findComp(p, compId), selection, `Comp ${n}`)
    gid = g?.id ?? null
  })
  if (gid) S().select([gid])
  S().setStatus('Toegevoegd aan een nieuwe compositie. Dubbelklik om hem te openen.')
}

/** Compositie openen in een eigen tab bij de tijdlijn (zoals dubbelklik op een pre-comp in AE). */
export function openComp(id: string) {
  const l = findLayer(S().project!, S().compId, id)
  if (l?.type !== 'group') return
  S().openTab(id)
}

// ---------- Klembord ----------

export function copySelection() {
  const { selection, project, compId } = S()
  if (!selection.length || !project) return
  const layers = selection.map((id) => findLayer(project, compId, id)).filter((l): l is Layer => !!l)
  S().setClipboard(layers.map((l) => structuredClone(l)))
  S().setStatus(`${layers.length} laag/lagen gekopieerd`)
}

export function cutSelection() {
  copySelection()
  deleteSelection()
}

/** Plakken in de lijst waar je nu werkt (formaat of geopende compositie), op dezelfde plek. */
export function pasteClipboard() {
  const { clipboard, compId, activeTab } = S()
  if (!clipboard.length) return
  const copies = clipboard.map(cloneLayer)
  S().update((p) => void contextOf(p, compId, activeTab).list.unshift(...copies))
  S().select(copies.map((c) => c.id))
}

// ---------- Volgorde en animatie ----------

export function moveToEdge(layerId: string, where: 'front' | 'back') {
  const { compId } = S()
  S().update((p) => {
    const f = findDeep(findComp(p, compId).layers, layerId)
    if (!f) return
    const [l] = f.list.splice(f.index, 1)
    if (where === 'front') f.list.unshift(l)
    else f.list.push(l)
  })
}

/** Alle animatie van de selectie verwijderen (keyframes, binnenkomst, accent, uitgang). */
export function removeAnimation() {
  for (const id of S().selection)
    updateLayer(id, (l) => {
      for (const p of ANIM_PROPS) {
        const kfs = l.tracks[p]
        if (kfs?.length) l[p] = kfs[kfs.length - 1].v
      }
      l.tracks = {}
      l.intro = l.outro = l.emphasis = null
    })
}

// ---------- Keyframe-assistent ----------

/** Easy Ease / In / Out / Lineair op de geselecteerde keyframes. */
export function keyAssist(mode: KeyAssist) {
  const { selectedKeys, compId } = S()
  if (!selectedKeys.length) {
    S().setStatus('Selecteer eerst keyframes (klik op ◆, Shift-klik voor meer).', 'error')
    return
  }
  S().update((p) => {
    const byTrack = new Map<string, SelectedKey[]>()
    for (const k of selectedKeys) {
      const l = findLayer(p, compId, k.layerId)
      for (const m of l ? groupProps(l, groupOf(k.prop)) : [k.prop]) {
        const key = `${k.layerId}|${m}`
        byTrack.set(key, [...(byTrack.get(key) ?? []), { ...k, prop: m }])
      }
    }
    for (const keys of byTrack.values()) {
      const l = findLayer(p, compId, keys[0].layerId)
      const kfs = l?.tracks[keys[0].prop]
      if (l && kfs)
        l.tracks[keys[0].prop] = applyKeyAssist(
          kfs,
          keys.map((k) => k.t),
          mode
        )
    }
  })
  const label = { easy: 'Easy Ease', in: 'Easy Ease In', out: 'Easy Ease Out', linear: 'Lineair' }[mode]
  S().setStatus(`${label} op ${selectedKeys.length} keyframe(s)`)
}

/** Anchor point zetten zonder dat de laag verspringt. */
export function setAnchor(layerId: string, ax: number, ay: number, coalesce?: string) {
  const { project, compId, time } = S()
  const l = findLayer(project!, compId, layerId)
  if (!l) return
  const st = layerStateAt(l, layerLocalTime(project!, compId, layerId, time))
  updateLayer(layerId, (x) => moveAnchor(x, Math.min(1, Math.max(0, ax)), Math.min(1, Math.max(0, ay)), st.scale, st.rotation, st.scaleY), coalesce)
}

export function ungroupSelection() {
  const { selection, compId } = S()
  const ids: string[] = []
  S().update((p) => {
    for (const id of selection) ids.push(...ungroup(findComp(p, compId), id))
  })
  if (ids.length) S().select(ids)
}

/** Geselecteerde lagen/groepen achter elkaar zetten in de tijd. */
export function sequenceSelection(overlap = 0) {
  const { selection, compId } = S()
  if (selection.length < 2) {
    S().setStatus('Selecteer minstens twee lagen of groepen (Shift-klik) om ze achter elkaar te zetten.', 'error')
    return
  }
  S().update((p) => sequenceLayers(findComp(p, compId), selection, overlap))
  S().setStatus('Achter elkaar gezet. Sleep de balken om de timing aan te passen.')
}

/** In- of uit-punt op de huidige tijd zetten (zoals Alt+[ en Alt+] in After Effects). */
export function setInOut(which: 'in' | 'out') {
  const { selection, compId, project, time } = S()
  if (!selection.length || !project) return
  S().update((p) => {
    for (const id of selection) {
      const f = findDeep(findComp(p, compId).layers, id)
      if (!f) continue
      const t = Math.round(localTime(time, f.ancestors) * 1000) / 1000
      if (which === 'in') f.layer.start = Math.max(0, Math.min(t, (f.layer.end ?? Infinity) - 0.1))
      else f.layer.end = Math.max(t, (f.layer.start ?? 0) + 0.1)
    }
  })
}

export function clearInOut() {
  const { selection } = S()
  for (const id of selection)
    updateLayer(id, (l) => {
      if (l.type !== 'group') delete l.start
      else l.start = 0
      delete l.end
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
  const files = project.fonts.filter((f) => !f.system)
  const font = files.find((f) => f.id === w.fontId) ?? files[0]
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

/** Geeft meerdere lagen dezelfde binnenkomst, na elkaar (van boven naar onder in beeld). */
export function staggerIntros(libraryId: string, gap: number) {
  const { selection, compId } = S()
  const item = LIBRARY.find((i) => i.id === libraryId)
  if (!item) return
  S().update((p) => {
    const comp = findComp(p, compId)
    const targets = comp.layers
      .filter((l) => l.visible && (selection.length > 1 ? selection.includes(l.id) : !l.locked))
      .sort((a, b) => a.y - b.y || a.x - b.x)
    targets.forEach((l, i) => {
      const at = Math.round((0.2 + i * gap) * 100) / 100
      // Write-on lagen schrijven zich in; de rest krijgt de gekozen animatie.
      if (l.type === 'writeon') applyLibraryItem(l, LIBRARY.find((x) => x.id === 'writeOn')!, comp, at)
      else applyLibraryItem(l, item, comp, at)
    })
    const last = targets.length ? 0.2 + (targets.length - 1) * gap + 1.2 : 0
    comp.duration = Math.max(comp.duration, Math.ceil(last + 2))
  })
  S().setStatus('Binnenkomst toegepast. Per laag bij te stellen in de tab Animatie.')
}

/** Bibliotheek-animatie toepassen op lagen (na slepen of klikken). `at` = starttijd. */
export function applyLibrary(itemId: string, layerIds: string[], at?: number) {
  const { compId, presets } = S()
  const user = itemId.startsWith('user:') ? presets.find((p) => `user:${p.id}` === itemId) : undefined
  const item = user ? { label: user.name } : LIBRARY.find((i) => i.id === itemId)
  if (!item || !layerIds.length) return
  S().update((p) => {
    const comp = findComp(p, compId)
    for (const id of layerIds) {
      const l = findDeep(comp.layers, id)?.layer
      if (!l) continue
      if (user) applyUserPreset(l, user, at)
      else applyLibraryItem(l, item as (typeof LIBRARY)[number], comp, at)
    }
    // Duur verlengen als de animatie er buiten valt
    const ends = comp.layers.flatMap((l) => [
      l.intro ? l.intro.start + l.intro.duration : 0,
      l.emphasis ? l.emphasis.start + l.emphasis.duration : 0
    ])
    comp.duration = Math.max(comp.duration, Math.ceil(Math.max(...ends) + 1))
  })
  S().select(layerIds)
  S().setTab('motion')
  S().setStatus(`${item.label} toegepast. Pas tijd, duur en afstand aan in de tab Animatie.`)
}

export function resetLayerOverrides(layerId: string, keys?: string[]) {
  const { compId } = S()
  if (!compId) return
  // Herstellen is zelf geen nieuwe override, dus zonder sync.
  S().update((p) => resetOverrides(p, compId, layerId, keys), undefined, true)
}

export function resetCompositionOverrides(keys?: string[]) {
  const { compId } = S()
  if (!compId) return
  S().update((p) => resetCompOverrides(p, compId, keys), undefined, true)
}

export async function loadPresets() {
  S().setPresets(await window.bs.listPresets())
}

/** Animatie van de geselecteerde laag opslaan als eigen preset in de bibliotheek. */
export async function savePresetFromLayer(layerId: string, name: string) {
  const { project, compId, presets } = S()
  const l = project && findLayer(project, compId, layerId)
  if (!l) return
  const preset = presetFromLayer(l, name, newId('p'))
  if (!preset.intro && !preset.outro && !preset.emphasis && !Object.keys(preset.tracks ?? {}).length) {
    S().setStatus('Deze laag heeft nog geen animatie om op te slaan.', 'error')
    return
  }
  const list = [...presets, preset]
  await window.bs.savePresets(list)
  S().setPresets(list)
  S().setStatus(`Preset "${name}" opgeslagen in de bibliotheek.`)
}

export async function deletePreset(id: string) {
  const list = S().presets.filter((p) => p.id !== id)
  await window.bs.savePresets(list)
  S().setPresets(list)
}

/** Laag slepen in de tijdlijn: vóór of na een andere laag (ook naar een andere compositie). */
export function reorderTo(id: string, targetId: string, where: 'before' | 'after') {
  const { compId } = S()
  let ok = false
  S().update((p) => {
    ok = reorderLayer(findComp(p, compId), id, targetId, where)
  })
  if (!ok && id !== targetId) S().setStatus('Een compositie kan niet in zichzelf.', 'error')
}

/** Bestanden uit de Finder: afbeeldingen/SVG worden lagen (op de plek van loslaten), fonts gaan naar het project. */
export async function importDroppedFiles(files: FileList, at?: { x: number; y: number }, asLayers = true) {
  const { dir } = S()
  if (!dir || !files.length) return
  const paths = [...files].map((f) => window.bs.pathForFile(f)).filter(Boolean)
  try {
    const res = await window.bs.importPaths(dir, paths)
    await refreshAssets()
    if (res.fonts.length) S().update((p) => void p.fonts.push(...res.fonts))
    let i = 0
    if (asLayers) for (const a of res.assets) await addAsset(a, at ? { x: at.x + i * 12, y: at.y + i++ * 12 } : undefined)
    const parts = [
      res.assets.length ? `${res.assets.length} afbeelding(en)` : '',
      res.fonts.length ? `${res.fonts.length} font(s)` : ''
    ].filter(Boolean)
    if (parts.length) S().setStatus(`${parts.join(' en ')} toegevoegd`)
    if (res.skipped.length) S().setStatus(`Niet ondersteund: ${res.skipped.map((p) => p.split(/[\\/]/).pop()).join(', ')}`, 'error')
  } catch (e) {
    fail(e)
  }
}

// ---------- SVG importeren: als afbeelding of als bewerkbare vormen ----------

const SVG_MODE_KEY = 'bs-svg-mode'

export function rememberedSvgMode(): SvgMode | null {
  try {
    const v = localStorage.getItem(SVG_MODE_KEY)
    return v === 'image' || v === 'shapes' ? v : null
  } catch {
    return null
  }
}

export function setRememberedSvgMode(mode: SvgMode | null) {
  try {
    if (mode) localStorage.setItem(SVG_MODE_KEY, mode)
    else localStorage.removeItem(SVG_MODE_KEY)
  } catch {
    /* geen opslag */
  }
}

/** Vraagt (met een venster) hoe een SVG geïmporteerd moet worden, tenzij de keuze is onthouden. */
export function askSvgMode(name: string): Promise<SvgMode | null> {
  const remembered = rememberedSvgMode()
  if (remembered) return Promise.resolve(remembered)
  return new Promise((resolve) =>
    S().setSvgChoice({
      name,
      resolve: (mode, remember) => {
        S().setSvgChoice(null)
        if (mode && remember) setRememberedSvgMode(mode)
        resolve(mode)
      }
    })
  )
}

/** Asset als laag toevoegen; bij een SVG eerst kiezen: afbeelding of losse vormen. */
export async function addAsset(path: string, at?: { x: number; y: number }) {
  if (!/\.svg$/i.test(path)) return addImageLayer(path, at)
  const mode = await askSvgMode(path.split('/').pop()!)
  if (mode === 'image') return addImageLayer(path, at)
  if (mode === 'shapes') return importSvgAsShapes(path, at)
}

/** SVG als losse, bewerkbare vormen: elke vorm een eigen laag, samen in een nieuwe compositie. */
export async function importSvgAsShapes(path: string, at?: { x: number; y: number }) {
  const { project, compId, activeTab, assetsRev } = S()
  if (!project) return
  try {
    const text = await (await fetch(assetUrl(path, assetsRev))).text()
    const parsed = parseSvg(text)
    if (!parsed.shapes.length) {
      S().setStatus('Geen vormen gevonden in deze SVG; hij is als afbeelding toegevoegd.', 'error')
      return addImageLayer(path, at)
    }
    const ctx = contextOf(project, compId, activeTab)
    const box = ctx.group ?? findComp(project, compId)
    const k = Math.min(1, (0.8 * box.width) / parsed.width, (0.8 * box.height) / parsed.height)
    const shapes = shapesToLayers(parsed, k)
    const center = at ? toContext(at.x, at.y) : { x: box.width / 2, y: box.height / 2 }
    const ox = Math.round(center.x - (parsed.width * k) / 2)
    const oy = Math.round(center.y - (parsed.height * k) / 2)
    const name = path.split('/').pop()!
    const layers = shapes.map((sh) => {
      const l = createLayer('shape', box)
      l.name = sh.name
      Object.assign(l, { x: round(ox + sh.x, 2), y: round(oy + sh.y, 2), width: round(sh.w, 2), height: round(sh.h, 2) })
      Object.assign(l.shape!, {
        kind: 'path',
        path: { d: sh.d, w: round(sh.w, 2), h: round(sh.h, 2), closed: sh.closed },
        fill: sh.fill ?? '#000000',
        fillEnabled: !!sh.fill,
        fillRule: sh.fillRule,
        strokeColor: sh.stroke ?? '#000000',
        strokeWidth: sh.stroke ? round(sh.strokeWidth, 2) : 0,
        radius: 0
      })
      return l
    })
    let gid: string | null = null
    S().update((p) => {
      const list = contextOf(p, compId, activeTab).list
      // In SVG ligt het laatste element bovenop; in de lagenlijst staat bovenop eerst.
      list.unshift(...[...layers].reverse())
      gid = groupLayers(findComp(p, compId), layers.map((l) => l.id), name)?.id ?? null
    })
    if (gid) S().select([gid])
    const skipped = parsed.skipped.length ? ` (${parsed.skipped.length} element(en) zoals tekst overgeslagen)` : ''
    S().setStatus(`${layers.length} vormen geïmporteerd in compositie "${name}"${skipped}. Dubbelklik om ze te bewerken.`)
  } catch (e) {
    fail(e)
  }
}

export function renameLayer(id: string, name: string) {
  updateLayer(id, (l) => void (l.name = name))
}

export function renameComposition(id: string, name: string) {
  S().update((p) => {
    const c = p.compositions.find((x) => x.id === id)
    if (c) c.name = name
  })
}

/**
 * Rustpositie van een laag op de huidige tijd: eigen waarden en keyframes, zónder binnenkomst,
 * accent en uitgang (anders lijn je een laag uit die net nog binnenvliegt of onzichtbaar klein is).
 */
function restState(l: Layer) {
  const st = S()
  const t = layerLocalTime(st.project!, st.compId, l.id, st.time)
  return restStateAt(l, t)
}

/** Zichtbaar kader van een laag in rust (in de ruimte van zijn ouder). */
function visibleBox(l: Layer): Box {
  const v = restState(l)
  const pts = layerCorners(v.x, v.y, l.width, l.height, l.anchorX ?? 0.5, l.anchorY ?? 0.5, v.scale, v.rotation, v.scaleY).corners
  const xs = pts.map((p) => p[0])
  const ys = pts.map((p) => p[1])
  return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }
}

/** Geselecteerde, niet-vergrendelde lagen, gegroepeerd per ouder (uitlijnen werkt binnen één ruimte). */
function selectionByParent() {
  const st = S()
  const comp = currentComp(st)
  if (!comp) return []
  const groups = new Map<string, { layers: Layer[]; container: Box }>()
  for (const id of st.selection) {
    const f = findDeep(comp.layers, id)
    if (!f || f.layer.locked) continue
    const parent = f.ancestors[f.ancestors.length - 1]
    const key = parent?.id ?? ''
    if (!groups.has(key)) groups.set(key, { layers: [], container: { x: 0, y: 0, w: parent?.width ?? comp.width, h: parent?.height ?? comp.height } })
    groups.get(key)!.layers.push(f.layer)
  }
  return [...groups.values()]
}

function shiftLayers(layers: Layer[], deltas: { dx: number; dy: number }[]) {
  layers.forEach((l, i) => {
    const { dx, dy } = deltas[i]
    if (!dx && !dy) return
    const v = restState(l)
    if (dx) setLayerValue(l.id, 'x', Math.round(v.x + dx), 'align')
    if (dy) setLayerValue(l.id, 'y', Math.round(v.y + dy), 'align')
  })
}

/**
 * Uitlijnen. `to`: 'selection' = op elkaar (de buitenste laag blijft staan),
 * 'canvas' = op de banner (of de compositie waar de lagen in zitten). Eén laag gaat altijd op de banner.
 */
export function alignSelection(mode: AlignMode, to: 'selection' | 'canvas' = 'selection') {
  for (const g of selectionByParent()) {
    const boxes = g.layers.map(visibleBox)
    const ref = to === 'canvas' || boxes.length === 1 ? g.container : unionBox(boxes)
    shiftLayers(g.layers, alignDeltas(boxes, mode, ref))
  }
}

/** Verdelen met gelijke tussenruimte (vanaf 3 lagen; op de banner al vanaf 1). */
export function distributeSelection(axis: Axis, to: 'selection' | 'canvas' = 'selection') {
  for (const g of selectionByParent()) {
    const boxes = g.layers.map(visibleBox)
    shiftLayers(g.layers, distributeDeltas(boxes, axis, to === 'canvas' ? g.container : undefined))
  }
}

// ---------- Tijdlijn-sneltoetsen (zoals in After Effects) ----------

/** Absolute starttijd van de compositie waarin een laag zit (som van de in-punten van de groepen). */
function offsetOf(ancestors: Layer[]) {
  return ancestors.reduce((a, g) => a + (g.start ?? 0), 0)
}

/** I / O: playhead naar het in- of uitpunt van de (eerste) geselecteerde laag. */
export function goToLayerEdge(which: 'in' | 'out') {
  const { selection, project, compId } = S()
  const comp = currentComp(S())
  if (!project || !comp || !selection.length) return
  const f = findDeep(comp.layers, selection[0])
  if (!f) return
  const off = offsetOf(f.ancestors)
  const start = f.layer.start ?? 0
  const t = which === 'in' ? off + start : off + (f.layer.end ?? start + layerLength(f.layer))
  S().setPlaying(false)
  S().setTime(Math.max(0, Math.min(findComp(project, compId).duration, t)))
}

/** J / K: naar het vorige / volgende keyframe (van de selectie, of van alle lagen). */
export function jumpKeyframe(dir: -1 | 1) {
  const comp = currentComp(S())
  if (!comp) return
  const { selection, time } = S()
  const times: number[] = []
  const visit = (list: Layer[], ancestors: Layer[]) => {
    for (const l of list) {
      const off = offsetOf(ancestors)
      if (!selection.length || selection.includes(l.id)) {
        const eff = effectiveLayer(l)
        for (const k of Object.values(eff.tracks)) for (const kf of k ?? []) times.push(round(off + kf.t, 3))
      }
      if (l.children) visit(l.children, [...ancestors, l])
    }
  }
  visit(comp.layers, [])
  const eps = 1e-3
  const sorted = [...new Set(times)].sort((a, b) => a - b)
  const next = dir > 0 ? sorted.find((t) => t > time + eps) : [...sorted].reverse().find((t) => t < time - eps)
  if (next == null) return
  S().setPlaying(false)
  S().setTime(next)
}

/** ⌥⇧P/S/R/T: keyframe op de playhead voor positie, schaal, rotatie of dekking van de selectie. */
export function addKeyAtPlayhead(group: PropGroupId) {
  const { selection, project, compId, time } = S()
  const comp = currentComp(S())
  if (!project || !comp || !selection.length) return
  S().update((p) => {
    const c = findComp(p, compId)
    for (const id of selection) {
      const f = findDeep(c.layers, id)
      if (!f || f.layer.locked) continue
      const l = f.layer
      const t = round(localTime(time, f.ancestors), 3)
      const st = restStateAt(l, t)
      for (const m of groupProps(l, group)) l.tracks[m] = upsertKeyframe(l.tracks[m], t, st[m])
    }
  })
  S().setExpanded({ ...S().expanded, ...Object.fromEntries(selection.map((id) => [id, true])) })
}

/** ⇧[ / ⇧]: laag (met animatie) in de tijd verschuiven zodat hij op de playhead begint / eindigt. */
export function moveLayerToPlayhead(which: 'in' | 'out') {
  const { selection, compId, time } = S()
  if (!selection.length) return
  S().update((p) => {
    const c = findComp(p, compId)
    for (const id of selection) {
      const f = findDeep(c.layers, id)
      if (!f || f.layer.locked) continue
      const l = f.layer
      const t = localTime(time, f.ancestors)
      const start = l.start ?? 0
      const end = l.end ?? start + layerLength(l)
      shiftTiming(l, which === 'in' ? t - start : t - end)
    }
  })
}

/** ⌥⌘/: afbeelding van de geselecteerde laag vervangen (zoals Replace Footage in AE). */
export function replaceSelectedImage() {
  const comp = currentComp(S())
  const id = S().selection[0]
  const l = comp && id ? findDeep(comp.layers, id)?.layer : undefined
  if (l?.image) S().openReplace(l.id)
  else S().setStatus('Selecteer een afbeeldingslaag om te vervangen.', 'error')
}

/** ⌘] / ⌘[ (met ⇧: helemaal): selectie naar voren of naar achteren. */
export function arrangeSelection(where: 'forward' | 'backward' | 'front' | 'back') {
  const sel = S().selection
  if (where === 'forward') sel.forEach((id) => moveLayer(id, -1))
  if (where === 'backward') [...sel].reverse().forEach((id) => moveLayer(id, 1))
  if (where === 'front') [...sel].reverse().forEach((id) => moveToEdge(id, 'front'))
  if (where === 'back') sel.forEach((id) => moveToEdge(id, 'back'))
}

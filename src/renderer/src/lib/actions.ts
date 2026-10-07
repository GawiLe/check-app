import { createLayer, deriveComposition, newId } from '@shared/factory'
import { applyLibraryItem, applyUserPreset, LIBRARY, presetFromLayer } from '@shared/library'
import { mergeTracks, PRESETS } from '@shared/presets'
import { resetCompOverrides, resetOverrides } from '@shared/sync'
import { allLayers, cloneLayer, findDeep, groupLayers, localTime, reorderLayer, sequenceLayers, ungroup } from '@shared/tree'
import { layerStateAt } from '@shared/anim'
import { moveAnchor } from '@shared/geometry'
import { applyKeyAssist, type KeyAssist } from '@shared/keys'
import { penToPath, type PenPoint } from '@shared/path'
import { ANIM_PROPS } from '@shared/types'
import type { ExportTarget, Layer, LayerType } from '@shared/types'
import { assetUrl, contextOf, currentComp, findComp, findLayer, layerLocalTime, updateLayer, useStore, type SelectedKey } from '../store'

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
      const key = `${k.layerId}|${k.prop}`
      byTrack.set(key, [...(byTrack.get(key) ?? []), k])
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
  updateLayer(layerId, (x) => moveAnchor(x, Math.min(1, Math.max(0, ax)), Math.min(1, Math.max(0, ay)), st.scale, st.rotation), coalesce)
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
    if (asLayers) for (const a of res.assets) await addImageLayer(a, at ? { x: at.x + i * 12, y: at.y + i++ * 12 } : undefined)
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

import { useEffect, useState } from 'react'
import { ContextMenu } from './components/ContextMenu'
import { Dialogs, SvgChoiceDialog } from './components/Dialogs'
import { Toolbar } from './components/Toolbar'
import { Workspace } from './components/Workspace'
import {
  copySelection,
  cutSelection,
  keyAssist,
  pasteClipboard,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  loadPresets,
  openProject,
  refreshAssets,
  save,
  saveAndClose,
  sequenceSelection,
  setInOut,
  addKeyAtPlayhead,
  alignSelection,
  arrangeSelection,
  distributeSelection,
  goToLayerEdge,
  jumpKeyframe,
  moveLayerToPlayhead,
  replaceSelectedImage,
  ungroupSelection
} from './lib/actions'
import { contextOf, currentComp, layerLocalTime, setLayerValue, useStore } from './store'
import { allLayers, findDeep } from '@shared/tree'
import { restStateAt } from '@shared/anim'
import { endFrameTime } from '@shared/motion'
import { FilePlus2, FolderOpen } from 'lucide-react'
import { useDock } from './dock/store'
import type { AlignMode } from '@shared/align'
import type { PropGroupId } from '@shared/propgroups'

/** Uitlijnen op selectie of banner: dezelfde keuze als de knoppen in het paneel Ontwerp. */
const alignTarget = (): 'selection' | 'canvas' => {
  try {
    return localStorage.getItem('bs-align-to') === 'canvas' ? 'canvas' : 'selection'
  } catch {
    return 'selection'
  }
}
import { anyDirty, closeDocument, cycleDocument, useDocs } from './lib/documents'
import { DocTabs } from './components/DocTabs'
import { toggleMaximizeUnderPointer } from './dock/Dock'
import type { PanelId } from './dock/model'

const isTyping = () => {
  const el = document.activeElement
  return !!el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !(el as HTMLInputElement).readOnly) || el.tagName === 'SELECT')
}

export function App() {
  const project = useStore((s) => s.project)
  const dialog = useStore((s) => s.dialog)
  const playing = useStore((s) => s.playing)
  const status = useStore((s) => s.status)

  // Menu-acties vanuit het hoofdproces
  useEffect(
    () =>
      window.bs.onMenu(async (action) => {
        const s = useStore.getState()
        if (action === 'new') s.setDialog('new')
        if (action === 'open') void openProject()
        if (action.startsWith('openRecent:')) void openProject(action.slice('openRecent:'.length))
        if (action === 'closeTab') {
          const active = useDocs.getState().active
          if (active) void closeDocument(active)
        }
        if (action.startsWith('panel:')) useDock.getState().show(action.slice(6) as PanelId)
        if (action === 'resetLayout') useDock.getState().reset()
        if (action === 'saveAndClose') void saveAndClose()
        if (!s.project) return
        if (action === 'save') void save()
        if (action === 'export') s.setDialog('export')
        if (action === 'saveBoilerplate') s.setDialog('saveBoilerplate')
        if (action === 'variants') s.setDialog('variants')
        if (action === 'shortcuts') s.setDialog('shortcuts')
        if (action === 'duplicate' && !isTyping()) duplicateSelection()
        if (action === 'group' && !isTyping()) groupSelection()
        if (action === 'ungroup' && !isTyping()) ungroupSelection()
        if (action === 'sequence') sequenceSelection()
        if (['cut', 'copy', 'paste', 'selectAll'].includes(action)) {
          if (isTyping()) return void window.bs.nativeEdit(action as 'cut')
          if (action === 'cut') cutSelection()
          if (action === 'copy') copySelection()
          if (action === 'paste') pasteClipboard()
          if (action === 'selectAll') {
            const c = contextOf(s.project, s.compId, s.activeTab)
            s.select(c.list.map((l) => l.id))
          }
        }
        if (action === 'undo') isTyping() ? document.execCommand('undo') : s.undo()
        if (action === 'redo') isTyping() ? document.execCommand('redo') : s.redo()
      }),
    []
  )

  // Niet-opgeslagen wijzigingen (in welk tabblad dan ook) doorgeven aan het hoofdproces
  useEffect(() => {
    let last: boolean | null = null
    const sync = () => {
      const d = anyDirty()
      if (d !== last) void window.bs.setDirty((last = d))
    }
    sync()
    const a = useStore.subscribe(sync)
    const b = useDocs.subscribe(sync)
    return () => {
      a()
      b()
    }
  }, [])

  // Bestanden die naast een drop-zone vallen niet in het venster openen
  useEffect(() => {
    const stop = (e: DragEvent) => e.dataTransfer?.types.includes('Files') && e.preventDefault()
    window.addEventListener('dragover', stop)
    window.addEventListener('drop', stop)
    return () => {
      window.removeEventListener('dragover', stop)
      window.removeEventListener('drop', stop)
    }
  }, [])

  // Eigen presets laden (gedeeld over alle projecten)
  useEffect(() => void loadPresets(), [])

  // Bronbestanden gewijzigd (assets/ of fonts/): preview en assetlijst verversen
  useEffect(
    () =>
      window.bs.onFilesChanged(() => {
        useStore.getState().bumpAssets()
        void refreshAssets()
      }),
    []
  )

  // Afspelen: de editor stuurt de tijd, de preview volgt.
  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const s = useStore.getState()
      const comp = currentComp(s)
      if (!comp) return
      let t = s.time + (now - last) / 1000
      last = now
      if (t >= comp.duration) t = 0
      s.setTime(t)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing])

  // Sneltoetsen
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping() || dialog) return
      // Enter in een invoerveld (dat zichzelf daarbij sluit) is geen sneltoets
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      const s = useStore.getState()
      const comp = currentComp(s)
      if (!comp) return
      const frame = 1 / 30
      // Ctrl+Tab / Ctrl+Shift+Tab: volgende/vorige project-tabblad
      if (e.key === 'Tab' && e.ctrlKey) {
        e.preventDefault()
        cycleDocument(e.shiftKey ? -1 : 1)
        return
      }
      // Toetsen op fysieke positie (e.code): werkt met elk toetsenbord en met Option/Alt
      const mod = e.metaKey || e.ctrlKey
      const code = e.code
      const run = (fn: () => void) => {
        e.preventDefault()
        fn()
      }
      if (code === 'Slash' && mod && e.altKey) return run(replaceSelectedImage)
      if ((code === 'Slash' && mod && !e.altKey) || (e.key === '?' && !mod)) return run(() => s.setDialog('shortcuts'))
      if (code === 'KeyA' && mod && e.shiftKey) return run(() => s.select([]))
      if (e.altKey && !mod) {
        const keyframe: Record<string, PropGroupId> = { KeyP: 'position', KeyS: 'scale', KeyR: 'rotation', KeyT: 'opacity' }
        if (e.shiftKey && keyframe[code]) return run(() => addKeyAtPlayhead(keyframe[code]))
        if (e.shiftKey && (code === 'KeyH' || code === 'KeyV')) return run(() => distributeSelection(code === 'KeyH' ? 'h' : 'v', alignTarget()))
        const align: Record<string, AlignMode> = { KeyA: 'left', KeyH: 'hcenter', KeyD: 'right', KeyW: 'top', KeyV: 'vcenter', KeyS: 'bottom' }
        if (!e.shiftKey && align[code]) return run(() => alignSelection(align[code], alignTarget()))
      }
      if (code === 'BracketLeft' || code === 'BracketRight') {
        const left = code === 'BracketLeft'
        if (mod) return run(() => arrangeSelection(e.shiftKey ? (left ? 'back' : 'front') : left ? 'backward' : 'forward'))
        if (e.shiftKey) return run(() => moveLayerToPlayhead(left ? 'in' : 'out'))
        return run(() => setInOut(left ? 'in' : 'out'))
      }
      if (!mod && !e.altKey && !e.shiftKey) {
        if (code === 'KeyI' || code === 'KeyO') return run(() => goToLayerEdge(code === 'KeyI' ? 'in' : 'out'))
        if (code === 'KeyJ' || code === 'KeyK') return run(() => jumpKeyframe(code === 'KeyJ' ? -1 : 1))
      }
      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.setPlaying(!s.playing)
          break
        case 'Home':
          s.setTime(0)
          break
        case 'End':
          s.setTime(endFrameTime(comp))
          break
        case 'PageDown':
          s.setTime(Math.min(comp.duration, s.time + (e.shiftKey ? 10 * frame : frame)))
          break
        case 'PageUp':
          s.setTime(s.time - (e.shiftKey ? 10 * frame : frame))
          break
        case 'Delete':
        case 'Backspace':
          deleteSelection()
          break
        case 'F9':
          e.preventDefault()
          keyAssist(e.shiftKey && (e.metaKey || e.ctrlKey) ? 'out' : e.shiftKey ? 'in' : 'easy')
          break
        case 'v':
        case 't':
        case 'r':
        case 'e':
        case 'g':
          if (e.metaKey || e.ctrlKey || e.altKey) break
          s.setTool(({ v: 'select', t: 'text', r: 'rect', e: 'ellipse', g: 'pen' } as const)[e.key])
          break
        case '`':
          e.preventDefault()
          toggleMaximizeUnderPointer()
          break
        case 'Enter':
          // Enter = naam wijzigen (zoals in After Effects); tekst bewerk je met dubbelklik op het canvas
          if (s.selection.length === 1 && s.tool === 'select' && findDeep(comp.layers, s.selection[0])) {
            e.preventDefault()
            s.setRenaming(s.selection[0])
          }
          break
        case 'u':
        case 'U':
          // Eigenschappen van de geselecteerde lagen uit-/inklappen (zoals U in After Effects)
          if (s.selection.length) {
            const open = s.selection.some((id) => !s.expanded[id])
            s.setExpanded({ ...s.expanded, ...Object.fromEntries(s.selection.map((id) => [id, open])) })
          }
          break
        case 'Escape':
          s.select([])
          break
        case 'ArrowLeft':
        case 'ArrowRight':
        case 'ArrowUp':
        case 'ArrowDown': {
          if (!s.selection.length) return
          e.preventDefault()
          const d = e.shiftKey ? 10 : 1
          const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0
          const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0
          for (const l of allLayers(comp.layers).filter((x) => s.selection.includes(x.id) && !x.locked)) {
            const st = restStateAt(l, layerLocalTime(s.project!, s.compId, l.id, s.time))
            if (dx) setLayerValue(l.id, 'x', st.x + dx, 'nudge')
            if (dy) setLayerValue(l.id, 'y', st.y + dy, 'nudge')
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dialog])

  useEffect(() => {
    const t = setTimeout(() => status && useStore.setState({ status: null }), status?.kind === 'error' ? 10000 : 4000)
    return () => clearTimeout(t)
  }, [status])

  if (!project)
    return (
      <>
        <Welcome />
        <Dialogs />
      </>
    )

  return (
    <div className="app">
      <DocTabs />
      <Toolbar />
      <Workspace />
      <Toast />
      <ContextMenu />
      <Dialogs />
      <SvgChoiceDialog />
    </div>
  )
}

function Toast() {
  const status = useStore((s) => s.status)
  if (!status) return null
  return <div className={`toast${status.kind === 'error' ? ' err' : ''}`}>{status.text}</div>
}

function Welcome() {
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    window.bs.getSettings().then((s) => setRecent(s.recent))
  }, [])
  return (
    <div className="welcome">
      <div className="card">
        <div className="brand">
          <div className="logo" /> Bnnr Studio
        </div>
        <p>Lichte HTML5-banners voor CM360, Google Ads en Ad Manager. Eén werkbestand, alle formaten.</p>
        <div className="buttons">
          <button className="primary" onClick={() => useStore.getState().setDialog('new')}>
            <FilePlus2 size={15} /> Nieuw project
          </button>
          <button className="ghost" onClick={() => openProject()}>
            <FolderOpen size={15} /> Open map
          </button>
        </div>
        {recent.length > 0 && (
          <>
            <div className="faint" style={{ marginBottom: 6, fontSize: 11 }}>
              RECENT
            </div>
            <div className="list">
              {recent.map((r) => (
                <div key={r} className="list-item" onClick={() => openProject(r)}>
                  <FolderOpen size={14} className="faint" />
                  <span className="grow">{r.split(/[\\/]/).pop()}</span>
                  <span className="meta" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

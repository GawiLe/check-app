import { useEffect, useState } from 'react'
import { Dialogs } from './components/Dialogs'
import { Inspector } from './components/Inspector'
import { LeftPanel } from './components/LeftPanel'
import { Timeline } from './components/Timeline'
import { Toolbar } from './components/Toolbar'
import { Viewer } from './components/Viewer'
import { confirmDiscard, deleteSelection, duplicateSelection, openProject, refreshAssets, save } from './lib/actions'
import { currentComp, setLayerValue, useStore } from './store'
import { layerStateAt } from '@shared/anim'

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
        if (action === 'new') (await confirmDiscard()) && s.setDialog('new')
        if (action === 'open') void openProject()
        if (!s.project) return
        if (action === 'save') void save()
        if (action === 'export') s.setDialog('export')
        if (action === 'saveBoilerplate') s.setDialog('saveBoilerplate')
        if (action === 'duplicate' && !isTyping()) duplicateSelection()
        if (action === 'undo') isTyping() ? document.execCommand('undo') : s.undo()
        if (action === 'redo') isTyping() ? document.execCommand('redo') : s.redo()
      }),
    []
  )

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
      const s = useStore.getState()
      const comp = currentComp(s)
      if (!comp) return
      const frame = 1 / 30
      switch (e.key) {
        case ' ':
          e.preventDefault()
          s.setPlaying(!s.playing)
          break
        case 'Home':
          s.setTime(0)
          break
        case 'End':
          s.setTime(comp.duration)
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
          for (const l of comp.layers.filter((x) => s.selection.includes(x.id) && !x.locked)) {
            const st = layerStateAt(l, s.time)
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
      <Toolbar />
      <LeftPanel />
      <Viewer />
      <Inspector />
      <Timeline />
      <StatusBar />
      <Dialogs />
    </div>
  )
}

function StatusBar() {
  const status = useStore((s) => s.status)
  const dir = useStore((s) => s.dir)
  const comp = useStore(currentComp)
  return (
    <div className="statusbar">
      <span>{dir}</span>
      {comp && (
        <span>
          {comp.width}×{comp.height} · {comp.layers.length} lagen
        </span>
      )}
      <span style={{ flex: 1 }} />
      {status && <span className={status.kind === 'error' ? 'err' : ''}>{status.text}</span>}
    </div>
  )
}

function Welcome() {
  const [recent, setRecent] = useState<string[]>([])
  useEffect(() => {
    window.bs.getSettings().then((s) => setRecent(s.recent))
  }, [])
  return (
    <div className="welcome">
      <div className="card">
        <h1>Banner Studio</h1>
        <p>Lichte, gevalideerde HTML5-banners voor CM360, Google Ads en Ad Manager.</p>
        <div className="buttons">
          <button className="primary" onClick={() => useStore.getState().setDialog('new')}>
            Nieuw project…
          </button>
          <button onClick={() => openProject()}>Open projectmap…</button>
        </div>
        {recent.length > 0 && (
          <>
            <div className="muted" style={{ marginBottom: 6 }}>
              Recent
            </div>
            <div className="list">
              {recent.map((r) => (
                <div key={r} className="list-item" onClick={() => openProject(r)}>
                  <span className="grow">{r}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

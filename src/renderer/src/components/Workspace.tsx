import { useState } from 'react'
import { Code2, Columns2, PenTool } from 'lucide-react'
import { Dock } from '../dock/Dock'
import type { PanelId } from '../dock/model'
import { CodeView } from './CodeView'
import { AiPanelView, DesignPanel, MotionPanel } from './Inspector'
import { AssetsPanel } from './LeftPanel'
import { Library } from './Library'
import { Timeline } from './Timeline'
import { Viewer } from './Viewer'

type ViewMode = 'design' | 'code' | 'both'

function loadMode(): ViewMode {
  try {
    const v = localStorage.getItem('bs-view-mode')
    return v === 'code' || v === 'both' ? v : 'design'
  } catch {
    return 'design'
  }
}

/** Canvas-paneel met keuze: ontwerp, code of beide naast elkaar. */
function CanvasPanel() {
  const [mode, setModeState] = useState<ViewMode>(loadMode)
  const setMode = (m: ViewMode) => {
    setModeState(m)
    try {
      localStorage.setItem('bs-view-mode', m)
    } catch {
      /* geen opslag */
    }
  }
  return (
    <div className="canvas-panel">
      <div className="canvas-modes seg">
        <button className={mode === 'design' ? 'on' : ''} onClick={() => setMode('design')} title="Alleen het ontwerp">
          <PenTool size={12} /> Ontwerp
        </button>
        <button className={mode === 'code' ? 'on' : ''} onClick={() => setMode('code')} title="Alleen de code">
          <Code2 size={12} /> Code
        </button>
        <button className={mode === 'both' ? 'on' : ''} onClick={() => setMode('both')} title="Ontwerp en code naast elkaar">
          <Columns2 size={12} /> Beide
        </button>
      </div>
      <div className={`canvas-split ${mode}`}>
        {mode !== 'code' && (
          <div className="canvas-part">
            <Viewer />
          </div>
        )}
        {mode !== 'design' && (
          <div className="canvas-part code">
            <CodeView />
          </div>
        )}
      </div>
    </div>
  )
}

const PANELS: Record<PanelId, () => React.ReactNode> = {
  viewer: () => <CanvasPanel />,
  code: () => <CodeView />,
  timeline: () => <Timeline />,
  library: () => (
    <div className="panel-scroll">
      <Library />
    </div>
  ),
  assets: () => <AssetsPanel />,
  design: () => <DesignPanel />,
  motion: () => <MotionPanel />,
  ai: () => <AiPanelView />
}

export function Workspace() {
  return (
    <div className="dock-root">
      <Dock render={(id) => PANELS[id]()} />
    </div>
  )
}

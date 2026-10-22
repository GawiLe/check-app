import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'
import { useStore } from './store'
import { parseSvg } from './lib/svgimport'
import { useDock } from './dock/store'
import { applyTheme, loadTheme } from './lib/theme'

// Eigen kleuren van de editor (Instellingen → Kleuren)
applyTheme(loadTheme())

// Voor de rooktest (scripts/smoke.mjs)
;(window as unknown as { __bsStore: typeof useStore }).__bsStore = useStore
;(window as unknown as { __bsParseSvg: typeof parseSvg }).__bsParseSvg = parseSvg

;(window as unknown as { __bsDock: typeof useDock }).__bsDock = useDock

// Eén sleepbeweging = één undo-stap: na het loslaten begint de volgende bewerking een nieuwe stap
// (pas na de afhandeling van het loslaten zelf, die nog een laatste wijziging kan doen)
window.addEventListener('pointerup', () =>
  setTimeout(() => {
    if (useStore.getState().lastCoalesce) useStore.setState({ lastCoalesce: null })
  })
)

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)

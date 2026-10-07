import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { useStore } from './store'
import { parseSvg } from './lib/svgimport'

// Voor de rooktest (scripts/smoke.mjs)
;(window as unknown as { __bsStore: typeof useStore }).__bsStore = useStore
;(window as unknown as { __bsParseSvg: typeof parseSvg }).__bsParseSvg = parseSvg

createRoot(document.getElementById('root')!).render(<App />)

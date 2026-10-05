import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles.css'
import { useStore } from './store'

// Voor de rooktest (scripts/smoke.mjs)
;(window as unknown as { __bsStore: typeof useStore }).__bsStore = useStore

createRoot(document.getElementById('root')!).render(<App />)

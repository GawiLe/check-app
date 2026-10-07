import { useMemo, useState } from 'react'
import { Copy } from 'lucide-react'
import { buildBanner } from '@shared/build'
import { fontsInline, TARGET_IDS, TARGETS } from '@shared/specs'
import type { ExportTarget } from '@shared/types'
import { highlight, prettyBanner } from '../lib/codeformat'
import { currentComp, useStore } from '../store'

/**
 * De code van de banner zoals hij geëxporteerd wordt (fonts als f0.woff2, afbeeldingen
 * als bestandsnaam). Live: elke wijziging in het ontwerp is hier meteen te zien.
 */
export function CodeView() {
  const project = useStore((s) => s.project)!
  const comp = useStore(currentComp)!
  const [readable, setReadable] = useState(true)
  const [target, setTarget] = useState<ExportTarget>(project.targets[0] ?? 'cm360')
  const html = useMemo(() => {
    const fontSrc = Object.fromEntries(
      project.fonts.map((f, i) => [f.id, fontsInline(target, project) ? 'url(data:font/woff2;base64,…) format("woff2")' : `url(f${i}.woff2) format("woff2")`])
    )
    return buildBanner(project, comp, { mode: 'export', target, assetUrl: (p) => p.split('/').pop()!, fontSrc }).html
  }, [project, comp, target])
  const shown = readable ? prettyBanner(html) : html
  const colored = useMemo(() => highlight(shown), [shown])

  return (
    <div className="code-view">
      <div className="code-bar">
        <div className="seg">
          <button className={readable ? 'on' : ''} onClick={() => setReadable(true)}>
            Leesbaar
          </button>
          <button className={readable ? '' : 'on'} onClick={() => setReadable(false)} title="Precies zoals in index.html">
            Exact
          </button>
        </div>
        <select value={target} onChange={(e) => setTarget(e.target.value as ExportTarget)} style={{ width: 'auto' }}>
          {project.targets.concat((TARGET_IDS as string[]).filter((t) => !project.targets.includes(t as ExportTarget)) as ExportTarget[]).map((t) => (
            <option key={t} value={t}>
              {TARGETS[t].label}
            </option>
          ))}
        </select>
        <span className="faint">
          index.html · {(new Blob([html]).size / 1024).toFixed(1)} KB · {comp.width}×{comp.height}
        </span>
        <span style={{ flex: 1 }} />
        <button
          className="ghost sm"
          onClick={() => {
            void navigator.clipboard.writeText(html)
            useStore.getState().setStatus('Code gekopieerd (exacte index.html)')
          }}
        >
          <Copy size={12} /> Kopieer
        </button>
      </div>
      <pre className={`code${readable ? '' : ' wrap'}`} dangerouslySetInnerHTML={{ __html: colored }} />
    </div>
  )
}

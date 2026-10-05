import { addImageLayer, deleteComposition, importFonts, importImages } from '../lib/actions'
import { assetUrl, useStore } from '../store'
import { Section } from './ui'

export function LeftPanel() {
  const project = useStore((s) => s.project)!
  const compId = useStore((s) => s.compId)
  const assets = useStore((s) => s.assets)
  const rev = useStore((s) => s.assetsRev)
  const s = useStore.getState

  return (
    <div className="panel left">
      <Section title="Formaten" actions={<button onClick={() => s().setDialog('addFormat')}>+ Formaat</button>}>
        <div className="list">
          {project.compositions.map((c) => (
            <div key={c.id} className={`list-item${c.id === compId ? ' active' : ''}`} onClick={() => s().setComp(c.id)}>
              <span className="grow">{c.name}</span>
              <span className="meta">
                {c.width}×{c.height}
                {c.id === project.baseCompositionId ? ' · basis' : ''}
              </span>
              {c.id !== project.baseCompositionId && (
                <button
                  className="icon"
                  title="Verwijderen"
                  onClick={(e) => {
                    e.stopPropagation()
                    deleteComposition(c.id)
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Assets" actions={<button onClick={importImages}>Importeer</button>}>
        <div className="list">
          {assets.length === 0 && <div className="muted">Zet afbeeldingen in de map assets/ of klik Importeer.</div>}
          {assets.map((a) => (
            <div key={a} className="list-item" title="Klik om als laag toe te voegen" onClick={() => addImageLayer(a)}>
              <img className="thumb" src={assetUrl(a, rev)} alt="" />
              <span className="grow">{a.replace(/^assets\//, '')}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Fonts" actions={<button onClick={importFonts}>Importeer</button>}>
        <div className="list">
          {project.fonts.length === 0 && <div className="muted">WOFF, WOFF2, TTF of OTF. Bij export automatisch gesubset naar WOFF2.</div>}
          {project.fonts.map((f) => (
            <div key={f.id} className="list-item" title={f.file}>
              <span className="grow">{f.family}</span>
              <span className="meta">
                {f.weight}
                {f.style === 'italic' ? ' i' : ''}
              </span>
              <button
                className="icon"
                title="Uit project halen"
                onClick={() =>
                  s().update((p) => {
                    p.fonts = p.fonts.filter((x) => x.id !== f.id)
                    for (const c of p.compositions)
                      for (const l of c.layers) {
                        if (l.text?.fontId === f.id) l.text.fontId = null
                        if (l.writeon?.fontId === f.id) l.writeon.fontId = null
                      }
                  })
                }
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}

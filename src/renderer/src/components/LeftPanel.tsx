import { useState } from 'react'
import { ImagePlus, Type, X } from 'lucide-react'
import { Library } from './Library'
import { addImageLayer, importDroppedFiles, importFonts, importImages } from '../lib/actions'
import { assetUrl, useStore } from '../store'
import { Section } from './ui'

export function LeftPanel() {
  const project = useStore((s) => s.project)!
  const assets = useStore((s) => s.assets)
  const rev = useStore((s) => s.assetsRev)
  const s = useStore.getState
  const [tab, setTab] = useState<'library' | 'assets'>('library')

  return (
    <div
      className="panel left"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        // In het paneel: alleen in het project zetten (afbeeldingen worden geen laag)
        void importDroppedFiles(e.dataTransfer.files, undefined, false)
      }}
    >
      <div className="left-tabs">
        <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>
          Animaties
        </button>
        <button className={tab === 'assets' ? 'on' : ''} onClick={() => setTab('assets')}>
          Assets & fonts
        </button>
      </div>
      {tab === 'library' ? (
        <Library />
      ) : (
        <>
      <Section
        title="Assets"
        actions={
          <button className="icon sm" title="Afbeeldingen importeren" onClick={importImages}>
            <ImagePlus size={14} />
          </button>
        }
      >
        <div className="list">
          {assets.length === 0 && (
            <div className="empty">Sleep afbeeldingen in de map assets/ of klik op + om te importeren.</div>
          )}
          {assets.map((a) => (
            <div key={a} className="list-item" title="Klik om als laag toe te voegen" onClick={() => addImageLayer(a)}>
              <img className="thumb" src={assetUrl(a, rev)} alt="" />
              <span className="grow">{a.replace(/^assets\//, '')}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Fonts"
        actions={
          <button className="icon sm" title="Fonts importeren (woff, woff2, ttf, otf)" onClick={importFonts}>
            <Type size={14} />
          </button>
        }
      >
        <div className="list">
          {project.fonts.length === 0 && (
            <div className="empty">Importeer WOFF, WOFF2, TTF of OTF. Bij export automatisch verkleind tot de gebruikte tekens.</div>
          )}
          {project.fonts.map((f) => (
            <div key={f.id} className="list-item" title={f.file}>
              <span className="grow">{f.family}</span>
              <span className="meta">
                {f.weight}
                {f.style === 'italic' ? ' i' : ''}
              </span>
              <button
                className="icon sm show-hover"
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
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </Section>
        </>
      )}
    </div>
  )
}

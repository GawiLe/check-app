import { ImagePlus, Type, X } from 'lucide-react'
import { addAsset, importDroppedFiles, importFonts, importImages, replaceImage } from '../lib/actions'
import { assetUrl, currentComp, useStore } from '../store'
import { allLayers } from '@shared/tree'

/** Asset slepen naar een afbeeldingslaag in de tijdlijn = afbeelding vervangen. */
export const ASSET_DRAG = 'application/x-banner-asset'

/** Geselecteerde afbeeldingslagen in de huidige compositie. */
function selectedImages() {
  const st = useStore.getState()
  const comp = currentComp(st)
  return comp ? allLayers(comp.layers).filter((l) => l.image && st.selection.includes(l.id)) : []
}
import { Section } from './ui'

export function AssetsPanel() {
  const project = useStore((s) => s.project)!
  const assets = useStore((s) => s.assets)
  const rev = useStore((s) => s.assetsRev)
  const s = useStore.getState

  return (
    <div
      className="panel-scroll"
      onDragOver={(e) => e.dataTransfer.types.includes('Files') && e.preventDefault()}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return
        e.preventDefault()
        // In het paneel: alleen in het project zetten (afbeeldingen worden geen laag)
        void importDroppedFiles(e.dataTransfer.files, undefined, false)
      }}
    >
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
            <div
              key={a}
              className="list-item"
              title="Klik om als laag toe te voegen · sleep op een afbeeldingslaag in de tijdlijn of rechtermuisknop om te vervangen"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData(ASSET_DRAG, a)
                e.dataTransfer.effectAllowed = 'copy'
              }}
              onClick={() => addAsset(a)}
              onContextMenu={(e) => {
                e.preventDefault()
                const imgs = selectedImages()
                s().openMenu(e.clientX, e.clientY, [
                  { label: 'Toevoegen als nieuwe laag', onClick: () => void addAsset(a) },
                  {
                    label: imgs.length > 1 ? `Vervang ${imgs.length} geselecteerde afbeeldingen` : 'Vervang geselecteerde afbeelding',
                    disabled: !imgs.length,
                    onClick: () => imgs.forEach((l) => void replaceImage(l.id, a))
                  }
                ])
              }}
            >
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
    </div>
  )
}

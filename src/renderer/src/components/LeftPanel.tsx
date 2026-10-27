import { useEffect, useRef, useState } from 'react'
import { ImagePlus, LayoutGrid, List, Trash2, Type, X } from 'lucide-react'
import { addAsset, assetUsage, deleteAsset, importDroppedFiles, importFonts, importImages, replaceImage } from '../lib/actions'
import { assetUrl, currentComp, useStore } from '../store'
import { ensureProjectFont, projectFontFamily } from '../lib/projectFonts'
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
  const [sort, setSortState] = useState<'name' | 'usage'>(() => {
    try {
      return localStorage.getItem('bs-asset-sort') === 'usage' ? 'usage' : 'name'
    } catch {
      return 'name'
    }
  })
  const setSort = (v: 'name' | 'usage') => {
    setSortState(v)
    try {
      localStorage.setItem('bs-asset-sort', v)
    } catch {
      /* niet erg */
    }
  }
  const [view, setViewState] = useState<'list' | 'grid'>(() => {
    try {
      return localStorage.getItem('bs-asset-view') === 'grid' ? 'grid' : 'list'
    } catch {
      return 'list'
    }
  })
  const setView = (v: 'list' | 'grid') => {
    setViewState(v)
    try {
      localStorage.setItem('bs-asset-view', v)
    } catch {
      /* niet erg */
    }
  }
  // Gewicht per bestand (uit het hoofdproces) en afmetingen (zodra het voorbeeldje geladen is)
  const dir = useStore((st) => st.dir)
  const [sizes, setSizes] = useState<Record<string, number>>({})
  const [dims, setDims] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!dir) return
    let live = true
    void window.bs
      .assetSizes(dir)
      .then((r) => live && setSizes(r))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [dir, assets, rev])
  // Fontnamen in hun eigen font laten zien
  const fontsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const doc = fontsRef.current?.ownerDocument ?? document
    for (const f of project.fonts) ensureProjectFont(doc, f, rev)
  }, [project.fonts, rev])
  const usage = assetUsage(project)
  const label = (a: string) => a.replace(/^assets\//, '')
  const kb = (b?: number) => (b == null ? '' : b < 1024 ? `${b} B` : `${(b / 1024).toFixed(b < 10240 ? 1 : 0)} KB`)
  const info = (a: string) => [dims[a], kb(sizes[a])].filter(Boolean).join(' · ')
  const tip = (a: string) =>
    `${label(a)}${info(a) ? `\n${info(a)}` : ''}\n${usage.get(a) ? `In ${usage.get(a)} laag/lagen gebruikt` : 'Nergens gebruikt'}\n\nKlik = als laag toevoegen · sleep op een afbeeldingslaag of rechtermuisknop = vervangen`
  const menu = (e: React.MouseEvent, a: string) => {
    e.preventDefault()
    const imgs = selectedImages()
    s().openMenu(e.clientX, e.clientY, [
      { label: 'Toevoegen als nieuwe laag', onClick: () => void addAsset(a) },
      {
        label: imgs.length > 1 ? `Vervang ${imgs.length} geselecteerde afbeeldingen` : 'Vervang geselecteerde afbeelding',
        disabled: !imgs.length,
        onClick: () => imgs.forEach((l) => void replaceImage(l.id, a))
      },
      { label: 'Verwijderen…', onClick: () => void deleteAsset(a) }
    ])
  }
  const common = (a: string) => ({
    title: tip(a),
    draggable: true,
    onDragStart: (e: React.DragEvent) => {
      e.dataTransfer.setData(ASSET_DRAG, a)
      e.dataTransfer.effectAllowed = 'copy'
    },
    onClick: () => void addAsset(a),
    onContextMenu: (e: React.MouseEvent) => menu(e, a)
  })
  const thumb = (a: string) => (
    <img
      className="thumb"
      src={assetUrl(a, rev)}
      alt=""
      draggable={false}
      onLoad={(e) => {
        const d = `${e.currentTarget.naturalWidth}×${e.currentTarget.naturalHeight}`
        if (dims[a] !== d) setDims((x) => ({ ...x, [a]: d }))
      }}
    />
  )
  const remove = (a: string) => (
    <button
      className="icon sm show-hover"
      title="Verwijderen (naar de prullenbak)"
      onClick={(e) => {
        e.stopPropagation()
        void deleteAsset(a)
      }}
    >
      <Trash2 size={12} />
    </button>
  )
  const sorted = [...assets].sort((a, b) =>
    sort === 'usage' ? (usage.get(b) ?? 0) - (usage.get(a) ?? 0) || label(a).localeCompare(label(b), 'nl', { numeric: true }) : label(a).localeCompare(label(b), 'nl', { numeric: true })
  )

  return (
    <div
      ref={fontsRef}
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
          <>
            {assets.length > 0 && (
              <button
                className="icon sm asset-view"
                title={view === 'list' ? 'Raster met grote voorbeelden' : 'Lijst'}
                onClick={(e) => {
                  e.stopPropagation()
                  setView(view === 'list' ? 'grid' : 'list')
                }}
              >
                {view === 'list' ? <LayoutGrid size={14} /> : <List size={14} />}
              </button>
            )}
            <button className="icon sm" title="Afbeeldingen importeren" onClick={importImages}>
              <ImagePlus size={14} />
            </button>
          </>
        }
      >
        {assets.length > 1 && (
          <div className="row asset-sort">
            <span className="faint">Sorteer</span>
            <div className="seg">
              <button className={sort === 'name' ? 'on' : ''} onClick={() => setSort('name')}>
                Naam
              </button>
              <button className={sort === 'usage' ? 'on' : ''} onClick={() => setSort('usage')}>
                Gebruik
              </button>
            </div>
          </div>
        )}
        {assets.length === 0 && <div className="empty">Sleep afbeeldingen in de map assets/ of klik op + om te importeren.</div>}
        {view === 'list' ? (
          <div className="list">
            {sorted.map((a) => (
              <div key={a} className={`list-item asset-item${usage.get(a) ? '' : ' unused'}`} {...common(a)}>
                {thumb(a)}
                <span className="grow asset-name">
                  <span className="ellipsis">{label(a)}</span>
                  {info(a) && <span className="asset-info">{info(a)}</span>}
                </span>
                <span className="meta asset-uses" title={usage.get(a) ? `In ${usage.get(a)} laag/lagen gebruikt (alle formaten)` : 'Nergens gebruikt'}>
                  {usage.get(a) ? `${usage.get(a)}×` : '0×'}
                </span>
                {remove(a)}
              </div>
            ))}
          </div>
        ) : (
          <div className="asset-grid">
            {sorted.map((a) => (
              <div key={a} className={`asset-tile asset-item${usage.get(a) ? '' : ' unused'}`} {...common(a)}>
                <div className="asset-tile-img">
                  {thumb(a)}
                  <span className="asset-uses">{usage.get(a) ? `${usage.get(a)}×` : '0×'}</span>
                  {remove(a)}
                </div>
                <div className="asset-tile-name ellipsis">{label(a)}</div>
                <div className="asset-info">{info(a) || '\u00a0'}</div>
              </div>
            ))}
          </div>
        )}
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
              <span className="grow font-sample" style={{ fontFamily: f.system ? `"${f.family}", inherit` : `"${projectFontFamily(f)}", inherit`, fontWeight: f.weight, fontStyle: f.style }}>
                {f.family}
              </span>
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

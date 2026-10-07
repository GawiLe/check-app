import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Download, FilePlus2, Loader2, Search } from 'lucide-react'
import { newId } from '@shared/factory'
import type { FontAsset } from '@shared/types'
import { fontFileUrl, POPULAR_FONTS, POPULAR_IDS, SYSTEM_FONTS, WEIGHT_NAME, type WebFont } from '@shared/webfonts'
import { useStore } from '../store'
import { importFonts } from '../lib/actions'

let catalog: WebFont[] | null = null
let catalogPromise: Promise<WebFont[]> | null = null
const loadCatalog = () =>
  (catalogPromise ??= window.bs.fontCatalog().then((r) => {
    catalog = r.fonts
    return r.fonts
  }))

/** Voorbeeld van een Google Font laden (alleen voor de lijst; niet in de banner). */
const previewed = new Set<string>()
function previewFont(f: WebFont) {
  if (previewed.has(f.id)) return
  previewed.add(f.id)
  const w = f.weights.includes(400) ? 400 : f.weights[0]
  const face = new FontFace(`bsprev-${f.id}`, `url(${fontFileUrl(f.id, w, 'normal')})`)
  face.load().then((ff) => document.fonts.add(ff)).catch(() => previewed.delete(f.id))
}

/**
 * Font kiezen: fonts in dit project, web-safe systeemfonts en de complete Google
 * Fonts-catalogus. Een Google Font wordt bij het kiezen gedownload naar fonts/.
 */
export function FontPicker(props: { value: string | null; onPick: (fontId: string | null, weight?: number) => void; allowSystem?: boolean }) {
  const project = useStore((s) => s.project)!
  const dir = useStore((s) => s.dir)!
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [fonts, setFonts] = useState<WebFont[]>(catalog ?? POPULAR_FONTS)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const current = project.fonts.find((f) => f.id === props.value)

  useEffect(() => {
    if (!open) return
    void loadCatalog().then(setFonts)
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase()
    const hits = needle ? fonts.filter((f) => f.family.toLowerCase().includes(needle)) : fonts.filter((f) => POPULAR_IDS.has(f.id))
    return hits.slice(0, 120)
  }, [q, fonts])

  const pickAsset = (asset: FontAsset) => {
    const existing = project.fonts.find(
      (f) => f.family === asset.family && f.weight === asset.weight && f.style === asset.style && !!f.system === !!asset.system
    )
    if (existing) props.onPick(existing.id, asset.weight)
    else {
      useStore.getState().update((p) => void p.fonts.push(asset))
      props.onPick(asset.id, asset.weight)
    }
    setOpen(false)
  }

  const install = async (f: WebFont, weight: number, style: 'normal' | 'italic') => {
    const key = `${f.id}-${weight}-${style}`
    const have = project.fonts.find((x) => x.family === f.family && x.weight === weight && x.style === style && !x.system)
    if (have) return pickAsset(have)
    setBusy(key)
    try {
      pickAsset(await window.bs.installWebFont(dir, f, weight, style))
      useStore.getState().setStatus(`${f.family} ${WEIGHT_NAME[weight] ?? weight} toegevoegd aan fonts/`)
    } catch (err) {
      useStore.getState().setStatus(err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err), 'error')
    } finally {
      setBusy(null)
    }
  }

  const needle = q.trim().toLowerCase()
  const projectFonts = project.fonts.filter((f) => (props.allowSystem !== false || !f.system) && f.family.toLowerCase().includes(needle))
  const systemFonts = props.allowSystem === false ? [] : SYSTEM_FONTS.filter((f) => f.toLowerCase().includes(needle))

  return (
    <div className="font-picker" ref={ref}>
      <button className="font-current" onClick={() => setOpen(!open)}>
        <span style={{ fontFamily: current?.system ? current.family : undefined }}>
          {current ? `${current.family} ${WEIGHT_NAME[current.weight] ?? current.weight}${current.style === 'italic' ? ' Italic' : ''}` : props.allowSystem === false ? 'Kies een font…' : 'Arial (standaard)'}
        </span>
        <ChevronDown size={13} />
      </button>
      {open && (
        <div className="font-pop">
          <div className="font-search">
            <Search size={13} />
            <input autoFocus placeholder="Zoek in Google Fonts…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="font-list">
            {projectFonts.length > 0 && <div className="font-group">In dit project</div>}
            {projectFonts.map((f) => (
              <div key={f.id} className={`font-row${f.id === props.value ? ' on' : ''}`} onClick={() => pickAsset(f)}>
                <span className="grow">{f.family}</span>
                <span className="meta">
                  {WEIGHT_NAME[f.weight] ?? f.weight}
                  {f.style === 'italic' ? ' Italic' : ''}
                </span>
              </div>
            ))}
            <div
              className="font-row add-font"
              title="WOFF, WOFF2, TTF of OTF. Bij export verkleind tot de gebruikte letters en (standaard) als Base64 ingebed."
              onClick={async () => {
                setOpen(false)
                const added = await importFonts()
                if (added?.[0]) props.onPick(added[0].id, added[0].weight)
              }}
            >
              <FilePlus2 size={13} />
              <span className="grow">Eigen font toevoegen…</span>
              <span className="meta">woff · ttf · otf</span>
            </div>
            {systemFonts.length > 0 && <div className="font-group">Systeem (niet meegeleverd)</div>}
            {systemFonts.map((name) => (
              <div
                key={name}
                className="font-row"
                onClick={() => pickAsset({ id: newId('f'), family: name, file: '', weight: 400, style: 'normal', system: true })}
              >
                <span className="grow" style={{ fontFamily: name }}>
                  {name}
                </span>
                <span className="meta">0 KB</span>
              </div>
            ))}
            <div className="font-group">{needle ? `Google Fonts (${list.length}${list.length === 120 ? '+' : ''})` : 'Google Fonts · populair (zoek voor alle)'}</div>
            {list.map((f) => (
              <div key={f.id}>
                <div className="font-row" onMouseEnter={() => previewFont(f)} onClick={() => setExpanded(expanded === f.id ? null : f.id)}>
                  <span className="grow" style={{ fontFamily: `bsprev-${f.id}, ${f.category === 'serif' ? 'Georgia' : 'Arial'}` }}>
                    {f.family}
                  </span>
                  <span className="meta">{f.weights.length} gewichten</span>
                </div>
                {expanded === f.id && (
                  <div className="font-weights">
                    {f.weights.flatMap((w) =>
                      f.styles.map((st) => {
                        const key = `${f.id}-${w}-${st}`
                        return (
                          <button key={key} disabled={!!busy} onClick={() => install(f, w, st)}>
                            {busy === key ? <Loader2 size={11} className="spin" /> : <Download size={11} />}
                            {WEIGHT_NAME[w] ?? w}
                            {st === 'italic' ? ' It.' : ''}
                          </button>
                        )
                      })
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

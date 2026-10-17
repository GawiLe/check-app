import { useEffect, useMemo, useRef, useState } from 'react'
import { Copy, FileSpreadsheet, FolderOpen, Image as ImageIcon, Plus, Type, Undo2, X } from 'lucide-react'
import type { VariantResult } from '@shared/api'
import { newId } from '@shared/factory'
import { TARGETS } from '@shared/specs'
import type { VariantSet } from '@shared/types'
import { tableToVariants, toCsv, variantsToTable } from '@shared/sheet'
import { variantFieldGroups, type FieldGroup, type VariantField } from '@shared/variants'
import { exportFolder, openInBackground, openProject, refreshAssets, save } from '../lib/actions'
import { assetUrl, useStore } from '../store'
import { Modal } from './ui'

const EMPTY: VariantSet = { fields: [], variants: [] }
const isImage = (a: string) => /\.(png|jpe?g|gif|svg|webp)$/i.test(a)
const file = (p: string) => p.split('/').pop() ?? p

/** Variantinstellingen in het project wijzigen (één ongedaan-maken-stap per veld). */
function edit(fn: (v: VariantSet) => void, coalesce?: string) {
  useStore.getState().update((p) => {
    p.variants ??= structuredClone(EMPTY)
    fn(p.variants)
  }, coalesce)
}

/**
 * Varianten (template): kies welke teksten en afbeeldingen variabel zijn, vul per variant in wat
 * anders is, en maak per variant een eigen projectmap (desgewenst meteen geëxporteerd).
 */
export function VariantsDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!
  const dir = useStore((s) => s.dir)!
  const groups = useMemo(() => variantFieldGroups(project), [project])
  const fields = useMemo(() => groups.flatMap((g) => [g.base, ...(g.formats.length > 1 ? g.formats : [])]), [groups])
  const set = project.variants ?? EMPTY
  const chosen = fields.filter((f) => set.fields.includes(f.key))
  const [step, setStep] = useState<1 | 2>(chosen.length ? 2 : 1)
  const [exportNow, setExportNow] = useState(true)
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<VariantResult[] | null>(null)
  const [sheetMsg, setSheetMsg] = useState<{ text: string; level: 'info' | 'warning' } | null>(null)

  /** Varianten uit CSV of Excel: rij = variant, kolom = veld (laagnaam). Zelfde naam = bijwerken. */
  const importSheet = async () => {
    setSheetMsg(null)
    try {
      const res = await window.bs.importVariantSheet(dir)
      if (!res) return
      const r = tableToVariants(res.table, fields, set.variants, res.images, () => newId('v'))
      if (!r.fieldKeys.length) {
        setSheetMsg({ level: 'warning', text: `Geen enkele kolom in ${res.file} past bij een tekst of afbeelding. Gebruik de laagnamen als kolomkop (bijv. ${fields.slice(0, 2).map((f) => `"${f.label}"`).join(' of ')}).` })
        return
      }
      edit((v) => {
        v.variants = r.variants
        v.fields = [...new Set([...v.fields, ...r.fieldKeys])]
      })
      await refreshAssets()
      const parts = [`${res.file}: ${r.added} variant(en) toegevoegd${r.updated ? `, ${r.updated} bijgewerkt` : ''}`]
      if (r.unknown.length) parts.push(`kolom(men) niet herkend: ${r.unknown.join(', ')}`)
      if (r.missingImages.length) parts.push(`afbeelding(en) niet gevonden: ${r.missingImages.join(', ')} (zet ze in assets/ of naast de spreadsheet)`)
      setSheetMsg({ level: r.unknown.length || r.missingImages.length ? 'warning' : 'info', text: parts.join(' · ') })
      setStep(2)
    } catch (e) {
      setSheetMsg({ level: 'warning', text: e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e) })
    }
  }
  const saveSheet = async () => {
    const path = await window.bs.saveVariantSheet(dir, toCsv(variantsToTable(chosen, set.variants)))
    if (path) setSheetMsg({ level: 'info', text: `Opgeslagen als ${path.split(/[\\/]/).pop()}. Vul het in Excel in (elke rij een variant) en importeer het weer.` })
  }
  const sheetNote = sheetMsg && <div className={`sheet-msg ${sheetMsg.level}`}>{sheetMsg.text}</div>

  // Een veld is variabel voor alle formaten tegelijk (base.key), of per formaat (de formaat-sleutels)
  const groupKeys = (g: FieldGroup) => [g.base.key, ...g.formats.map((f) => f.key)]
  const isOn = (g: FieldGroup) => groupKeys(g).some((k) => set.fields.includes(k))
  const isPerFormat = (g: FieldGroup) => g.formats.length > 1 && g.formats.some((f) => set.fields.includes(f.key))
  const setGroup = (g: FieldGroup, mode: 'off' | 'all' | 'per') =>
    edit((v) => {
      const rest = v.fields.filter((k) => !groupKeys(g).includes(k))
      v.fields = mode === 'off' ? rest : mode === 'all' ? [...rest, g.base.key] : [...rest, ...g.formats.map((f) => f.key)]
    })
  const toggleField = (key: string, on: boolean) =>
    edit((v) => {
      v.fields = on ? [...new Set([...v.fields, key])] : v.fields.filter((k) => k !== key)
    })
  const toggleKind = (kind: VariantField['kind']) => {
    const list = groups.filter((g) => g.base.kind === kind)
    const all = list.every(isOn)
    edit((v) => {
      for (const g of list) {
        const rest = v.fields.filter((k) => !groupKeys(g).includes(k))
        // Verschilt het origineel per formaat (bijv. een eigen achtergrond per formaat), dan per formaat
        v.fields = all ? rest : isOn(g) ? v.fields : [...rest, ...(g.differs && g.formats.length > 1 ? g.formats.map((f) => f.key) : [g.base.key])]
      }
    })
  }
  const addVariant = (copyOf?: string) =>
    edit((v) => {
      const src = v.variants.find((x) => x.id === copyOf)
      v.variants.push({ id: newId('v'), name: src ? `${src.name} kopie` : `Variant ${v.variants.length + 1}`, values: src ? { ...src.values } : {} })
    })
  const setValue = (variantId: string, key: string, value: string) =>
    edit((v) => {
      const x = v.variants.find((y) => y.id === variantId)
      if (!x) return
      if (value) x.values[key] = value
      else delete x.values[key]
    }, `var-${variantId}-${key}`)

  const goToVariants = () => {
    if (!set.variants.length) addVariant()
    setStep(2)
  }

  const create = async () => {
    setBusy(true)
    try {
      await save()
      // Meteen exporteren: naar de exportmap van het template (eerste keer kiezen); elke variant krijgt daar zijn eigen map
      const exportOutDir = exportNow ? await exportFolder() : null
      if (exportNow && !exportOutDir) return
      const res = await window.bs.createVariants({ dir, project: useStore.getState().project!, exportTargets: exportNow ? project.targets : null, exportOutDir })
      // Elke variant meteen als tabblad bovenin (op de achtergrond; je blijft in het template)
      await openInBackground(res.map((r) => r.dir))
      setResults(res)
      useStore.getState().setStatus(`${res.length} variant(en) aangemaakt${exportNow ? ' en geëxporteerd' : ''}; ze staan als tabbladen bovenin.`)
    } catch (e) {
      useStore.getState().setStatus(e instanceof Error ? e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (results)
    return (
      <Modal title="Varianten aangemaakt" wide onClose={onClose}>
        <div className="variant-results">
          {results.map((r) => {
            const errors = r.exports.flatMap((e) => e.issues).filter((i) => i.level === 'error').length
            const warnings = r.exports.flatMap((e) => e.issues).filter((i) => i.level === 'warning').length
            return (
              <div key={r.dir} className="result">
                <header>
                  <b>{r.name}</b>
                  <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {r.dir}
                  </span>
                  <button onClick={() => window.bs.revealInFolder(r.dir)}>Toon map</button>
                  <button
                    onClick={async () => {
                      onClose()
                      await openProject(r.dir)
                    }}
                  >
                    Openen
                  </button>
                </header>
                {r.exports.length > 0 && (
                  <ul className="issues">
                    <li className={errors ? 'error' : warnings ? 'warning' : 'info'}>
                      {r.exports.length} banner(s) geëxporteerd
                      {errors ? ` · ${errors} fout(en)` : ''}
                      {warnings ? ` · ${warnings} waarschuwing(en)` : ''}
                      {!errors && !warnings ? ' · alles in orde' : ''}
                    </li>
                  </ul>
                )}
              </div>
            )
          })}
        </div>
        <div className="actions">
          <button onClick={() => setResults(null)}>Terug</button>
          <button className="primary" onClick={onClose}>
            Klaar
          </button>
        </div>
      </Modal>
    )

  return (
    <Modal title="Varianten (template)" wide onClose={onClose}>
      <div className="seg variant-steps">
        <button className={step === 1 ? 'on' : ''} onClick={() => setStep(1)}>
          1. Velden kiezen
        </button>
        <button className={step === 2 ? 'on' : ''} disabled={!chosen.length} onClick={goToVariants}>
          2. Varianten invullen
        </button>
      </div>

      {step === 1 ? (
        <>
          <p className="muted">
            Dit bestand is de template; elke variant krijgt alle formaten. Vink aan wat per variant anders kan zijn, voor alle formaten tegelijk of per formaat (bijv. een eigen achtergrond per formaat). Opmaak, positie en animatie blijven gelijk.
          </p>
          {(['text', 'image'] as const).map((kind) => {
            const list = groups.filter((g) => g.base.kind === kind)
            if (!list.length) return null
            return (
              <div key={kind} className="variant-fieldgroup">
                <div className="variant-grouphead">
                  <b>{kind === 'text' ? 'Teksten' : 'Afbeeldingen en SVG'}</b>
                  <button className="ghost sm" onClick={() => toggleKind(kind)}>
                    {list.every(isOn) ? 'Niets' : 'Alles'}
                  </button>
                </div>
                {list.map((g) => {
                  const on = isOn(g)
                  const per = isPerFormat(g)
                  return (
                    <div key={g.base.key} className={`variant-field-wrap${on ? ' on' : ''}`}>
                      <label className="variant-field">
                        <input
                          type="checkbox"
                          checked={on}
                          onChange={(e) => setGroup(g, !e.target.checked ? 'off' : g.differs && g.formats.length > 1 ? 'per' : 'all')}
                        />
                        {kind === 'text' ? <Type size={13} className="faint" /> : <ImageIcon size={13} className="faint" />}
                        <span className="variant-label">{g.base.label}</span>
                        {kind === 'text' ? <span className="variant-preview">{g.base.value.replace(/\n/g, ' ⏎ ')}</span> : <Thumb src={g.base.value} />}
                      </label>
                      {on && g.formats.length > 1 && (
                        <div className="variant-formats">
                          <div className="seg">
                            <button className={per ? '' : 'on'} onClick={() => setGroup(g, 'all')} title="Eén waarde per variant, voor alle formaten">
                              Alle formaten
                            </button>
                            <button className={per ? 'on' : ''} onClick={() => setGroup(g, 'per')} title="Per formaat een eigen waarde (bijv. een eigen achtergrond per formaat)">
                              Per formaat
                            </button>
                          </div>
                          {g.differs && !per && <span className="variant-warn">Verschilt per formaat in het origineel</span>}
                          {per &&
                            g.formats.map((f) => (
                              <label key={f.key} className="variant-format" title={kind === 'text' ? f.value : f.value.split('/').pop()}>
                                <input type="checkbox" checked={set.fields.includes(f.key)} onChange={(e) => toggleField(f.key, e.target.checked)} />
                                {f.label.split(' · ').pop()}
                              </label>
                            ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
          {!fields.length && <p className="faint">Er staan nog geen teksten of afbeeldingen in de basis.</p>}
          {sheetNote}
          <div className="actions">
            <button className="ghost" style={{ marginRight: 'auto' }} disabled={!fields.length} onClick={importSheet} title="Elke rij een variant, elke kolom een veld (laagnaam als kolomkop)">
              <FileSpreadsheet size={14} /> Uit CSV/Excel…
            </button>
            <button onClick={onClose}>Sluiten</button>
            <button className="primary" disabled={!chosen.length} onClick={goToVariants}>
              Verder ({chosen.length} veld{chosen.length === 1 ? '' : 'en'})
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">Vul alleen in wat anders is; een leeg vak houdt de waarde van het origineel.</p>
          <div className="variant-table-wrap">
            <table className="variant-table">
              <thead>
                <tr>
                  <th>Veld</th>
                  <th>Origineel</th>
                  {set.variants.map((v) => (
                    <th key={v.id}>
                      <div className="variant-col-head">
                        <input
                          value={v.name}
                          onChange={(e) =>
                            edit((s) => {
                              const x = s.variants.find((y) => y.id === v.id)
                              if (x) x.name = e.target.value
                            }, `vname-${v.id}`)
                          }
                        />
                        <button className="icon sm" title="Variant dupliceren" onClick={() => addVariant(v.id)}>
                          <Copy size={12} />
                        </button>
                        <button className="icon sm" title="Variant verwijderen" onClick={() => edit((s) => void (s.variants = s.variants.filter((y) => y.id !== v.id)))}>
                          <X size={12} />
                        </button>
                      </div>
                    </th>
                  ))}
                  <th className="variant-add">
                    <button className="ghost sm" onClick={() => addVariant()}>
                      <Plus size={13} /> Variant
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {chosen.map((f) => (
                  <tr key={f.key}>
                    <td className="variant-label" title={f.label}>
                      {f.compId ? (
                        <>
                          {/* Formaat altijd zichtbaar, ook als de naam lang is */}
                          <span className="variant-size">{f.label.split(' · ').pop()}</span>
                          <span className="variant-name">{f.label.split(' · ').slice(0, -1).join(' · ')}</span>
                        </>
                      ) : (
                        f.label
                      )}
                    </td>
                    <td>{f.kind === 'text' ? <div className="variant-orig">{f.value}</div> : <Thumb src={f.value} big />}</td>
                    {set.variants.map((v) => (
                      <td key={v.id}>
                        {f.kind === 'text' ? (
                          <textarea
                            rows={Math.min(4, Math.max(2, f.value.split('\n').length))}
                            placeholder={f.value}
                            value={v.values[f.key] ?? ''}
                            onChange={(e) => setValue(v.id, f.key, e.target.value)}
                          />
                        ) : (
                          <ImageCell value={v.values[f.key] ?? ''} original={f.value} dir={dir} onChange={(val) => setValue(v.id, f.key, val)} />
                        )}
                      </td>
                    ))}
                    <td />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="check" style={{ marginTop: 12 }}>
            <input type="checkbox" checked={exportNow} onChange={(e) => setExportNow(e.target.checked)} />
            Meteen exporteren ({project.targets.map((t) => TARGETS[t].label).join(', ') || 'geen platform gekozen'})
          </label>
          <div className="hint-text">
            Elke variant wordt een eigen projectmap naast deze, in dezelfde map ({dir.split(/[\\/]/).slice(-2, -1)[0] ?? ''}). Met meteen exporteren komt elke variant als eigen map in je exportmap
            (de eerste keer kies je die). Opnieuw aanmaken werkt bestaande variantmappen bij.
          </div>
          {sheetNote}
          <div className="actions">
            <button className="ghost" onClick={importSheet} title="Elke rij een variant, elke kolom een veld (laagnaam als kolomkop). Zelfde variantnaam = bijwerken.">
              <FileSpreadsheet size={14} /> Uit CSV/Excel…
            </button>
            <button className="ghost" style={{ marginRight: 'auto' }} onClick={saveSheet} title="Sla de varianten op als CSV om ze in Excel aan te vullen">
              Opslaan als CSV…
            </button>
            <button onClick={() => setStep(1)}>Velden</button>
            <button className="primary" disabled={busy || !set.variants.length} onClick={create}>
              {busy ? 'Bezig…' : `${set.variants.length} variant(en) aanmaken`}
            </button>
          </div>
        </>
      )}
    </Modal>
  )
}

function Thumb({ src, big }: { src: string; big?: boolean }) {
  const rev = useStore((s) => s.assetsRev)
  return (
    <span className={`variant-thumb${big ? ' big' : ''}`} title={file(src)}>
      {src ? <img src={assetUrl(src, rev)} alt="" draggable={false} /> : null}
    </span>
  )
}

/** Afbeelding per variant: kiezen uit de assets, uploaden uit een map, of terug naar het origineel. */
function ImageCell(props: { value: string; original: string; dir: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const assets = useStore((s) => s.assets).filter(isImage)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('pointerdown', close)
    return () => window.removeEventListener('pointerdown', close)
  }, [open])
  const upload = async () => {
    setOpen(false)
    const paths = await window.bs.importImages(props.dir)
    await refreshAssets()
    if (paths[0]) props.onChange(paths[0])
  }
  const shown = props.value || props.original
  return (
    <div className="variant-image" ref={ref}>
      <button className={`variant-image-btn${props.value ? ' changed' : ''}`} onClick={() => setOpen(!open)} title={props.value ? file(props.value) : 'Zelfde als origineel'}>
        <Thumb src={shown} big />
        <span>{props.value ? file(props.value) : 'origineel'}</span>
      </button>
      {open && (
        <div className="variant-pop">
          <button className="primary sm" onClick={upload}>
            <FolderOpen size={13} /> Uploaden uit map…
          </button>
          {props.value && (
            <button
              className="ghost sm"
              onClick={() => {
                props.onChange('')
                setOpen(false)
              }}
            >
              <Undo2 size={13} /> Zelfde als origineel
            </button>
          )}
          <div className="variant-pop-grid">
            {assets.map((a) => (
              <button
                key={a}
                className={`replace-tile${a === shown ? ' on' : ''}`}
                title={a}
                onClick={() => {
                  props.onChange(a === props.original ? '' : a)
                  setOpen(false)
                }}
              >
                <Thumb src={a} />
                <span className="replace-name">{file(a)}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

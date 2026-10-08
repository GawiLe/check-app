import { useEffect, useState } from 'react'
import type { Boilerplate, Settings } from '@shared/api'
import { IAB_SIZES, TARGET_IDS, TARGETS } from '@shared/specs'
import type { ExportTarget } from '@shared/types'
import { addFormat, newProject, rememberedSvgMode, replaceImage, runExport, saveAsBoilerplate, setRememberedSvgMode, uploadAndReplace } from '../lib/actions'
import { FolderOpen, Image as ImageIcon, Shapes } from 'lucide-react'
import { assetUrl, currentComp, useStore } from '../store'
import { findDeep } from '@shared/tree'
import { Modal, Row } from './ui'
import { VariantsDialog } from './Variants'
import { SHORTCUT_GROUPS } from '../lib/shortcuts'

const kb = (b: number) => `${(b / 1024).toFixed(1)} KB`

export function Dialogs() {
  const dialog = useStore((s) => s.dialog)
  const close = () => useStore.getState().setDialog(null)
  switch (dialog) {
    case 'new':
      return <NewProjectDialog onClose={close} />
    case 'addFormat':
      return <AddFormatDialog onClose={close} />
    case 'export':
      return <ExportDialog onClose={close} />
    case 'settings':
      return <SettingsDialog onClose={close} />
    case 'saveBoilerplate':
      return <SaveBoilerplateDialog onClose={close} />
    case 'replaceImage':
      return <ReplaceImageDialog onClose={close} />
    case 'variants':
      return <VariantsDialog onClose={close} />
    case 'shortcuts':
      return <ShortcutsDialog onClose={close} />
    default:
      return null
  }
}

export function BoilerplatePicker(props: { value: string | null; onChange: (id: string) => void; onListChange?: () => void }) {
  const [list, setList] = useState<Boilerplate[]>([])
  const load = () => window.bs.listBoilerplates().then(setList)
  useEffect(() => {
    void load()
  }, [])
  useEffect(() => {
    if (!props.value && list[0]) props.onChange(list[0].id)
  }, [list, props])
  return (
    <div className="list">
      {list.map((b) => (
        <div key={b.id} className={`list-item${props.value === b.id ? ' active' : ''}`} onClick={() => props.onChange(b.id)}>
          <span className="grow">{b.name}</span>
          <span className="meta">{b.builtIn ? 'ingebouwd' : 'eigen'}</span>
          {!b.builtIn && (
            <button
              className="icon danger"
              title="Boilerplate verwijderen"
              onClick={async (e) => {
                e.stopPropagation()
                if (!window.confirm(`Boilerplate "${b.name}" verwijderen?`)) return
                await window.bs.deleteBoilerplate(b.id)
                if (props.value === b.id) props.onChange(list[0].id)
                await load()
              }}
            >
              ×
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function NewProjectDialog({ onClose }: { onClose: () => void }) {
  const [bp, setBp] = useState<string | null>(null)
  const [name, setName] = useState('Nieuwe campagne')
  return (
    <Modal title="Nieuw project" onClose={onClose}>
      <Row label="Projectnaam">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Row>
      <div className="hint-text">Kies een boilerplate als startpunt. De basis is 300×600; andere formaten leid je daarvan af.</div>
      <BoilerplatePicker value={bp} onChange={setBp} />
      <div className="hint-text">Je kiest hierna een (lege) map. Daarin komen project.bsproj, assets/, fonts/ en export/.</div>
      <div className="actions">
        <button onClick={onClose}>Annuleren</button>
        <button className="primary" onClick={() => newProject(bp, name)}>
          Kies map en maak aan…
        </button>
      </div>
    </Modal>
  )
}

function AddFormatDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!
  const existing = new Set(project.compositions.map((c) => `${c.width}x${c.height}`))
  const [w, setW] = useState(300)
  const [h, setH] = useState(250)
  return (
    <Modal title="Formaat toevoegen" onClose={onClose}>
      <div className="hint-text">
        Het nieuwe formaat wordt afgeleid van de basis (posities relatief, maten geschaald). Daarna kun je het per formaat bijstellen.
      </div>
      <div className="list" style={{ marginBottom: 12 }}>
        {IAB_SIZES.map((s) => {
          const key = `${s.width}x${s.height}`
          return (
            <div key={key} className="list-item" onClick={() => !existing.has(key) && addFormat(s.width, s.height)}>
              <span className="grow">{s.name}</span>
              <span className="meta">{existing.has(key) ? 'bestaat al' : `${s.width}×${s.height}`}</span>
            </div>
          )
        })}
      </div>
      <Row label="Eigen formaat">
        <input type="number" value={w} onChange={(e) => setW(+e.target.value)} />
        <span className="muted" style={{ flex: '0 0 auto' }}>×</span>
        <input type="number" value={h} onChange={(e) => setH(+e.target.value)} />
        <button className="primary" disabled={w < 10 || h < 10} onClick={() => addFormat(w, h)}>
          Toevoegen
        </button>
      </Row>
    </Modal>
  )
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!
  const results = useStore((s) => s.exportResults)
  const [comps, setComps] = useState<string[]>(project.compositions.map((c) => c.id))
  const [targets, setTargets] = useState<ExportTarget[]>(project.targets.length ? project.targets : ['cm360'])
  const [busy, setBusy] = useState(false)
  const toggle = <T,>(list: T[], v: T, on: boolean) => (on ? [...list, v] : list.filter((x) => x !== v))

  return (
    <Modal title="Exporteren" wide onClose={onClose}>
      <div className="cols">
        <div>
          <div className="sub">Formaten</div>
          {project.compositions.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" checked={comps.includes(c.id)} onChange={(e) => setComps(toggle(comps, c.id, e.target.checked))} />
              {c.name} ({c.width}×{c.height})
            </label>
          ))}
        </div>
        <div>
          <div className="sub">Platform</div>
          {TARGET_IDS.map((t) => (
            <label key={t} className="check" title={TARGETS[t].notes}>
              <input type="checkbox" checked={targets.includes(t)} onChange={(e) => setTargets(toggle(targets, t, e.target.checked))} />
              {TARGETS[t].label}
            </label>
          ))}
          <div className="hint-text">clickTag: {project.clickTag}</div>
          <div className="hint-text">Polite loading: {project.politeLoad ? 'aan' : 'uit'} · rand en backup volgens formaat-instellingen</div>
        </div>
      </div>

      {results && (
        <div style={{ marginTop: 14 }}>
          {results.map((r) => (
            <div className="result" key={r.zip}>
              <header>
                <b>
                  {TARGETS[r.target].label} · {r.composition}
                </b>
                <span className="muted">
                  ZIP {kb(r.zipBytes)} · {r.files.length} bestanden
                </span>
                <button onClick={() => window.bs.revealInFolder(r.zip)}>Toon ZIP</button>
              </header>
              <ul className="issues">
                {r.issues.map((i, n) => (
                  <li key={n} className={i.level}>
                    {i.message}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className="actions">
        <button onClick={onClose}>Sluiten</button>
        <button
          className="primary"
          disabled={busy || !comps.length || !targets.length}
          onClick={async () => {
            setBusy(true)
            await runExport(comps, targets)
            setBusy(false)
          }}
        >
          {busy ? 'Bezig…' : `Exporteer ${comps.length * targets.length} banner(s)`}
        </button>
      </div>
    </Modal>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  useEffect(() => {
    window.bs.getSettings().then((s) => {
      setSettings(s)
      setModel(s.model)
    })
  }, [])
  return (
    <Modal title="Instellingen" onClose={onClose}>
      <Row label="Anthropic API-sleutel">
        <input
          type="password"
          placeholder={settings?.hasApiKey ? '•••••• (ingesteld)' : 'sk-ant-…'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </Row>
      <div className="hint-text">Nodig voor AI-animatie. Wordt versleuteld opgeslagen op deze computer (OS-sleutelhanger).</div>
      <Row label="Model">
        <input value={model} onChange={(e) => setModel(e.target.value)} />
      </Row>
      <Row label="SVG importeren">
        <select defaultValue={rememberedSvgMode() ?? 'ask'} onChange={(e) => setRememberedSvgMode(e.target.value === 'ask' ? null : (e.target.value as 'image'))}>
          <option value="ask">Elke keer vragen</option>
          <option value="image">Altijd als afbeelding</option>
          <option value="shapes">Altijd als bewerkbare vormen</option>
        </select>
      </Row>
      <div className="actions">
        {settings?.hasApiKey && (
          <button
            className="danger"
            onClick={async () => {
              await window.bs.setApiKey('')
              onClose()
            }}
          >
            Sleutel verwijderen
          </button>
        )}
        <button onClick={onClose}>Annuleren</button>
        <button
          className="primary"
          onClick={async () => {
            if (key) await window.bs.setApiKey(key.trim())
            await window.bs.setModel(model.trim())
            useStore.getState().setStatus('Instellingen opgeslagen')
            onClose()
          }}
        >
          Opslaan
        </button>
      </div>
    </Modal>
  )
}

function SaveBoilerplateDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!
  const [name, setName] = useState(`${project.name} boilerplate`)
  return (
    <Modal title="Opslaan als boilerplate" onClose={onClose}>
      <div className="hint-text">
        Slaat alle formaten, lagen, animaties, assets en fonts op als startpunt voor nieuwe projecten.
      </div>
      <Row label="Naam">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Row>
      <div className="actions">
        <button onClick={onClose}>Annuleren</button>
        <button className="primary" disabled={!name.trim()} onClick={() => saveAsBoilerplate(name.trim())}>
          Opslaan
        </button>
      </div>
    </Modal>
  )
}

/** Keuzevenster bij het importeren van een SVG. */
export function SvgChoiceDialog() {
  const choice = useStore((s) => s.svgChoice)
  const [remember, setRemember] = useState(false)
  if (!choice) return null
  const pick = (mode: 'image' | 'shapes' | null) => choice.resolve(mode, remember)
  return (
    <Modal title={`SVG importeren: ${choice.name}`} onClose={() => pick(null)}>
      <div className="choice-cards">
        <button className="choice-card" autoFocus onClick={() => pick('image')}>
          <ImageIcon size={22} />
          <b>Als afbeelding</b>
          <span>Eén laag, blijft scherp op elk formaat. Het lichtst en exact zoals het bestand. Je animeert hem als geheel.</span>
        </button>
        <button className="choice-card" onClick={() => pick('shapes')}>
          <Shapes size={22} />
          <b>Als bewerkbare vormen</b>
          <span>Elke vorm wordt een eigen laag in een nieuwe compositie, met eigen vulling, lijn en animatie. Handig voor logo-animaties.</span>
        </button>
      </div>
      <label className="check" style={{ marginTop: 12 }}>
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        Onthoud mijn keuze (aan te passen in Instellingen)
      </label>
      <div className="actions">
        <button onClick={() => pick(null)}>Annuleren</button>
      </div>
    </Modal>
  )
}

/** Afbeelding vervangen: kies uit de assets van het project, of upload een nieuw bestand uit een map. */
function ReplaceImageDialog({ onClose }: { onClose: () => void }) {
  const layerId = useStore((s) => s.replaceId)
  const assets = useStore((s) => s.assets)
  const rev = useStore((s) => s.assetsRev)
  const layer = useStore((s) => {
    const c = currentComp(s)
    return c && layerId ? findDeep(c.layers, layerId)?.layer : undefined
  })
  if (!layer?.image) return null
  const images = assets.filter((a) => /\.(png|jpe?g|gif|svg|webp)$/i.test(a))
  const pick = async (path: string) => {
    onClose()
    if (path !== layer.image!.src) await replaceImage(layer.id, path)
  }
  return (
    <Modal title={`Afbeelding vervangen: ${layer.name}`} onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Positie, animatie en breedte blijven behouden; de hoogte volgt de verhouding van de nieuwe afbeelding.
      </p>
      {images.length ? (
        <div className="replace-grid">
          {images.map((a) => (
            <button key={a} className={`replace-tile${a === layer.image!.src ? ' on' : ''}`} title={a} onClick={() => pick(a)}>
              <span className="replace-thumb">
                <img src={assetUrl(a, rev)} alt="" draggable={false} />
              </span>
              <span className="replace-name">{a.replace(/^assets\//, '')}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="faint">Nog geen afbeeldingen in assets/.</p>
      )}
      <div className="actions">
        <button
          className="primary"
          onClick={async () => {
            if (await uploadAndReplace(layer.id)) onClose()
          }}
        >
          <FolderOpen size={14} /> Uploaden uit map…
        </button>
        <button onClick={onClose}>Annuleren</button>
      </div>
    </Modal>
  )
}

/** Overzicht van alle sneltoetsen (Help → Sneltoetsen, of ?). */
function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Sneltoetsen" wide onClose={onClose}>
      <div className="shortcut-groups">
        {SHORTCUT_GROUPS.map((g) => (
          <div key={g.title} className="shortcut-group">
            <h3>{g.title}</h3>
            {g.items.map(([keys, what]) => (
              <div key={keys + what} className="shortcut-row">
                <span className="shortcut-keys">
                  {keys.split(' / ').map((k, i) => (
                    <span key={k}>
                      {i > 0 && <span className="faint"> / </span>}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </span>
                <span>{what}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="actions">
        <button className="primary" onClick={onClose}>
          Sluiten
        </button>
      </div>
    </Modal>
  )
}

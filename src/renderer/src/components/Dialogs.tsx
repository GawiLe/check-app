import { useEffect, useState } from 'react'
import type { Boilerplate, Settings } from '@shared/api'
import { IAB_SIZES, TARGET_IDS, TARGETS } from '@shared/specs'
import type { ExportTarget } from '@shared/types'
import { addFormat, newProject, runExport, saveAsBoilerplate } from '../lib/actions'
import { useStore } from '../store'
import { Field, Modal } from './ui'

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
      <Field label="Projectnaam">
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="hint">Kies een boilerplate als startpunt. De basis is 300×600; andere formaten leid je daarvan af.</div>
      <BoilerplatePicker value={bp} onChange={setBp} />
      <div className="hint">Je kiest hierna een (lege) map. Daarin komen project.bsproj, assets/, fonts/ en export/.</div>
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
      <div className="hint">
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
      <Field label="Eigen formaat">
        <input type="number" value={w} onChange={(e) => setW(+e.target.value)} />
        <span className="muted" style={{ flex: '0 0 auto' }}>×</span>
        <input type="number" value={h} onChange={(e) => setH(+e.target.value)} />
        <button className="primary" disabled={w < 10 || h < 10} onClick={() => addFormat(w, h)}>
          Toevoegen
        </button>
      </Field>
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
          <div className="muted">Formaten</div>
          {project.compositions.map((c) => (
            <label key={c.id} className="check">
              <input type="checkbox" checked={comps.includes(c.id)} onChange={(e) => setComps(toggle(comps, c.id, e.target.checked))} />
              {c.name} ({c.width}×{c.height})
            </label>
          ))}
        </div>
        <div>
          <div className="muted">Platform</div>
          {TARGET_IDS.map((t) => (
            <label key={t} className="check" title={TARGETS[t].notes}>
              <input type="checkbox" checked={targets.includes(t)} onChange={(e) => setTargets(toggle(targets, t, e.target.checked))} />
              {TARGETS[t].label}
            </label>
          ))}
          <div className="hint">clickTag: {project.clickTag}</div>
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
      <Field label="Anthropic API-sleutel">
        <input
          type="password"
          placeholder={settings?.hasApiKey ? '•••••• (ingesteld)' : 'sk-ant-…'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </Field>
      <div className="hint">Nodig voor AI-animatie. Wordt versleuteld opgeslagen op deze computer (OS-sleutelhanger).</div>
      <Field label="Model">
        <input value={model} onChange={(e) => setModel(e.target.value)} />
      </Field>
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
      <div className="hint">
        Slaat alle formaten, lagen, animaties, assets en fonts op als startpunt voor nieuwe projecten.
      </div>
      <Field label="Naam">
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="actions">
        <button onClick={onClose}>Annuleren</button>
        <button className="primary" disabled={!name.trim()} onClick={() => saveAsBoilerplate(name.trim())}>
          Opslaan
        </button>
      </div>
    </Modal>
  )
}

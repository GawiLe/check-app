import { useEffect, useState } from 'react'
import type { Boilerplate, Settings, VersionInfo } from '@shared/api'
import { IAB_SIZES, TARGET_IDS, TARGETS } from '@shared/specs'
import type { ExportTarget, MediaOptions, Project } from '@shared/types'
import { addFormat, exportFolder, newProject, rememberedSvgMode, replaceImage, runExport, saveAsBoilerplate, setRememberedSvgMode, uploadAndReplace } from '../lib/actions'
import { FolderOpen, Image as ImageIcon, Shapes } from 'lucide-react'
import { assetUrl, currentComp, useStore } from '../store'
import { findDeep } from '@shared/tree'
import { Modal, Row } from './ui'
import { VariantsDialog } from './Variants'
import { SHORTCUT_GROUPS } from '../lib/shortcuts'

const kb = (b: number) => (b >= 1024 * 1024 ? `${+(b / 1024 / 1024).toFixed(1)} MB` : `${+(b / 1024).toFixed(1)} KB`)

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
    case 'versions':
      return <VersionsDialog onClose={close} />
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
      <div className="hint-text">Je kiest hierna waar het project komt; daar maken we een eigen map met de projectnaam (met project.bsproj, assets/ en fonts/). Waar je exporteert kies je bij het exporteren.</div>
      <div className="actions">
        <button onClick={onClose}>Annuleren</button>
        <button className="primary" onClick={() => newProject(bp, name)}>
          Kies locatie en maak aan…
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
  const [from, setFrom] = useState(project.baseCompositionId ?? '')
  const add = (width: number, height: number) => addFormat(width, height, undefined, from)
  return (
    <Modal title="Formaat toevoegen" onClose={onClose}>
      <Row label="Uitgaan van">
        <select value={from} onChange={(e) => setFrom(e.target.value)}>
          {project.compositions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.width}×{c.height}
              {c.id === project.baseCompositionId ? ' (basis)' : ''}
            </option>
          ))}
        </select>
      </Row>
      <div className="hint-text">
        {from === project.baseCompositionId
          ? 'Het nieuwe formaat wordt afgeleid van de basis (posities relatief, maten geschaald). Daarna kun je het per formaat bijstellen.'
          : 'Het nieuwe formaat neemt de lay-out van dit formaat over (omgerekend naar de nieuwe maat). Het blijft gekoppeld aan de basis: teksten en afbeeldingen uit de basis lopen gewoon door.'}
      </div>
      <div className="list" style={{ marginBottom: 12 }}>
        {IAB_SIZES.map((s) => {
          const key = `${s.width}x${s.height}`
          return (
            <div key={key} className="list-item" onClick={() => !existing.has(key) && add(s.width, s.height)}>
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
        <button className="primary" disabled={w < 10 || h < 10} onClick={() => add(w, h)}>
          Toevoegen
        </button>
      </Row>
    </Modal>
  )
}

function ExportDialog({ onClose }: { onClose: () => void }) {
  const project = useStore((s) => s.project)!
  const results = useStore((s) => s.exportResults)
  const mediaResults = useStore((s) => s.mediaResults)
  const media = project.media ?? {}
  const setMedia = (fn: (m: MediaOptions) => void) =>
    useStore.getState().update((p) => {
      p.media ??= {}
      fn(p.media)
    })
  const wantsMedia = !!(media.mp4 || media.gif)
  const [comps, setComps] = useState<string[]>(project.compositions.filter((c) => !c.disabled).map((c) => c.id))
  const [targets, setTargets] = useState<ExportTarget[]>(project.targets.length ? project.targets : ['cm360'])
  const [busy, setBusy] = useState(false)
  const [info, setInfo] = useState<ExportTarget>(targets[0] ?? 'cm360')
  const dir = useStore((s) => s.dir)
  const [outDir, setOutDir] = useState<string | null>(null)
  useEffect(() => {
    if (dir) void window.bs.getExportDir(dir).then(setOutDir)
  }, [dir])
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
          <div className="sub">Platform (klik op de naam voor de eisen)</div>
          {TARGET_IDS.map((t) => (
            <div key={t} className={`target-row${info === t ? ' on' : ''}`} onClick={() => setInfo(t)}>
              <input type="checkbox" checked={targets.includes(t)} onClick={(e) => e.stopPropagation()} onChange={(e) => setTargets(toggle(targets, t, e.target.checked))} />
              <span className="grow">{TARGETS[t].label}</span>
              <span className="meta">max. {kb(TARGETS[t].maxZipBytes)}</span>
            </div>
          ))}
          <TargetInfo target={info} project={project} multi={targets.length > 1} />
          <div className="hint-text">clickTag: {project.clickTag}</div>
          <div className="hint-text">Polite loading: {project.politeLoad ? 'aan' : 'uit'} · rand en backup volgens formaat-instellingen</div>
          <label className="check" style={{ marginTop: 8 }} title="JPG en PNG verkleinen tot de getoonde maat (2× voor retina) en opnieuw comprimeren. De originelen blijven staan.">
            <input type="checkbox" checked={!!project.optimizeImages} onChange={(e) => useStore.getState().update((p) => void (p.optimizeImages = e.target.checked))} />
            Afbeeldingen optimaliseren
          </label>
          <div className="sub" style={{ marginTop: 14 }}>
            Ook als video of GIF
          </div>
          <div className="media-row">
            <label className="check">
              <input type="checkbox" checked={!!media.mp4} onChange={(e) => setMedia((m) => void (m.mp4 = e.target.checked ? { fps: 30, scale: 2 } : null))} />
              MP4
            </label>
            {media.mp4 && (
              <>
                <select value={media.mp4.fps} onChange={(e) => setMedia((m) => void (m.mp4!.fps = Number(e.target.value)))}>
                  <option value={25}>25 fps</option>
                  <option value={30}>30 fps</option>
                  <option value={60}>60 fps</option>
                </select>
                <select value={media.mp4.scale} onChange={(e) => setMedia((m) => void (m.mp4!.scale = Number(e.target.value) as 1 | 2))}>
                  <option value={2}>2× (scherp)</option>
                  <option value={1}>1× (ware grootte)</option>
                </select>
              </>
            )}
          </div>
          <div className="media-row">
            <label className="check">
              <input type="checkbox" checked={!!media.gif} onChange={(e) => setMedia((m) => void (m.gif = e.target.checked ? { fps: 15, maxKb: null } : null))} />
              GIF
            </label>
            {media.gif && (
              <>
                <select value={media.gif.fps} onChange={(e) => setMedia((m) => void (m.gif!.fps = Number(e.target.value)))}>
                  <option value={8}>8 fps</option>
                  <option value={10}>10 fps</option>
                  <option value={15}>15 fps</option>
                  <option value={20}>20 fps</option>
                </select>
                <input
                  type="number"
                  className="media-max"
                  min={0}
                  placeholder="max. KB"
                  title="Maximale grootte: de GIF wordt zo nodig lichter gemaakt (minder kleuren, lagere fps). Leeg = geen maximum."
                  value={media.gif.maxKb ?? ''}
                  onChange={(e) => setMedia((m) => void (m.gif!.maxKb = e.target.value ? Math.max(0, Number(e.target.value)) : null))}
                />
              </>
            )}
          </div>
          {wantsMedia && <div className="hint-text">Altijd in een eigen map: {folderOf(project)}/MP4/ en {folderOf(project)}/GIF/, met alle loops tot het eindbeeld.</div>}
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

      {mediaResults && (
        <div style={{ marginTop: 14 }}>
          {mediaResults.map((r) => (
            <div className="result" key={r.file}>
              <header>
                <b>
                  {r.kind.toUpperCase()} · {r.composition}
                </b>
                <span className="muted">
                  {kb(r.bytes)} · {r.note}
                </span>
                <button onClick={() => window.bs.revealInFolder(r.file)}>Toon {r.kind.toUpperCase()}</button>
              </header>
              {r.warning && (
                <ul className="issues">
                  <li className="warning">{r.warning}</li>
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      <div className="export-dest">
        <span className="faint">Exporteren naar</span>
        <span className="export-path" title={outDir ?? ''}>{outDir ? `${outDir}/${project.name.trim().replace(/\s+/g, '-')}` : 'nog niet gekozen (je kiest bij exporteren)'}</span>
        <button
          className="ghost sm"
          onClick={async () => {
            const d = await exportFolder(true)
            if (d) setOutDir(d)
          }}
        >
          {outDir ? 'Wijzigen…' : 'Kiezen…'}
        </button>
      </div>
      <div className="actions">
        <button onClick={onClose}>Sluiten</button>
        <button
          className="primary"
          disabled={busy || !comps.length || (!targets.length && !wantsMedia)}
          onClick={async () => {
            setBusy(true)
            await runExport(comps, targets, media)
            if (dir) setOutDir(await window.bs.getExportDir(dir))
            setBusy(false)
          }}
        >
          {busy
            ? 'Bezig…'
            : [targets.length ? `Exporteer ${comps.length * targets.length} banner(s)` : 'Exporteer', media.mp4 && 'MP4', media.gif && 'GIF'].filter(Boolean).join(' + ')}
        </button>
      </div>
    </Modal>
  )
}

/** Mapnaam van de export (zoals fileStem in het hoofdproces). */
const folderOf = (project: Project) =>
  (project.name.replace(/[\\/:*?"<>|]+/g, '-').replace(/^[.\s-]+/, '').trim() || 'banner').slice(0, 80).replace(/\s*[–—]\s*/g, '-').replace(/\s+/g, '-')

/** Wat een platform is en welke eisen (presets) de export daarvoor gebruikt. */
function TargetInfo({ target, project, multi }: { target: ExportTarget; project: Project; multi: boolean }) {
  const t = TARGETS[target]
  const folder = folderOf(project)
  const rows: [string, string][] = [
    ['Max. ZIP', kb(t.maxZipBytes)],
    ['Initial load', `${kb(t.initialLoadBytes)} (richtlijn)`],
    ['Max. bestanden', String(t.maxFiles)],
    ['Bestandstypen', t.allowedExtensions.join(', ')],
    ['Fonts', t.inlineFonts ? 'altijd ingebed (Base64)' : project.embedFonts !== false ? 'ingebed (Base64), instelbaar' : 'losse .woff2, instelbaar'],
    ['Animatie', `max. ${t.maxAnimationSeconds} s, ${t.maxLoops} loops`],
    ['Backup-JPG', t.backupImage ? 'ja, van het eindframe (≤ 40 KB)' : 'ja (handig als statische variant)'],
    ['Klik', t.click],
    ['Bestanden', `${folder}/${multi ? `${t.folder}/` : ''}${folder}_300x600px.zip + .jpg`]
  ]
  return (
    <div className="target-info">
      <b>{t.label}</b>
      <p>{t.about}</p>
      <table>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [key, setKey] = useState('')
  const [model, setModel] = useState('')
  const [provider, setProvider] = useState<'anthropic' | 'fal'>('anthropic')
  const [falKey, setFalKey] = useState('')
  const [falModel, setFalModel] = useState('')
  useEffect(() => {
    window.bs.getSettings().then((s) => {
      setSettings(s)
      setModel(s.model)
      setProvider(s.aiProvider)
      setFalModel(s.falModel)
    })
  }, [])
  return (
    <Modal title="Instellingen" onClose={onClose}>
      <Row label="AI via">
        <select value={provider} onChange={(e) => setProvider(e.target.value as 'anthropic' | 'fal')}>
          <option value="anthropic">Anthropic (Claude)</option>
          <option value="fal">fal.ai (tegoed, bijv. via Vercel)</option>
        </select>
      </Row>
      {provider === 'fal' && (
        <>
          <Row label="fal.ai-sleutel">
            <input type="password" placeholder={settings?.hasFalKey ? '•••••• (ingesteld)' : 'fal-sleutel (Keys in het fal-dashboard)'} value={falKey} onChange={(e) => setFalKey(e.target.value)} />
          </Row>
          <Row label="fal-model">
            <input value={falModel} onChange={(e) => setFalModel(e.target.value)} />
          </Row>
          <div className="hint-text">
            Gebruikt het fal-endpoint any-llm. Je fal-sleutel maak je in het fal-dashboard (bij Vercel: Integrations → fal → Open in fal → Keys). Elke vraag kost een klein beetje tegoed.
          </div>
        </>
      )}
      <Row label="Anthropic API-sleutel">
        <input
          type="password"
          placeholder={settings?.hasApiKey ? '•••••• (ingesteld)' : 'sk-ant-…'}
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </Row>
      <div className="hint-text">Nodig als je AI via Anthropic gebruikt. Sleutels worden versleuteld opgeslagen op deze computer (OS-sleutelhanger).</div>
      {settings?.keyPlain && (
        <div className="warn-text">
          Let op: de sleutelhanger van dit systeem is niet beschikbaar, dus je sleutel staat onversleuteld in de instellingen (alleen leesbaar voor jouw gebruiker).
        </div>
      )}
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
        {(provider === 'fal' ? settings?.hasFalKey : settings?.hasApiKey) && (
          <button
            className="danger"
            onClick={async () => {
              await window.bs.setApiKey('', provider)
              onClose()
            }}
          >
            {provider === 'fal' ? 'fal-sleutel verwijderen' : 'Sleutel verwijderen'}
          </button>
        )}
        <button onClick={onClose}>Annuleren</button>
        <button
          className="primary"
          onClick={async () => {
            if (key) await window.bs.setApiKey(key.trim())
            if (falKey) await window.bs.setApiKey(falKey.trim(), 'fal')
            await window.bs.setModel(model.trim())
            await window.bs.setAiProvider(provider, falModel.trim())
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

/** Versiegeschiedenis: elke keer Opslaan is een versie; terugzetten kan weer ongedaan gemaakt worden. */
function VersionsDialog({ onClose }: { onClose: () => void }) {
  const dir = useStore((s) => s.dir)!
  const [list, setList] = useState<VersionInfo[] | null>(null)
  useEffect(() => {
    void window.bs.listVersions(dir).then(setList)
  }, [dir])
  const restore = async (id: string) => {
    const version = await window.bs.readVersion(dir, id)
    useStore.getState().update((p) => {
      for (const k of Object.keys(p)) delete (p as unknown as Record<string, unknown>)[k]
      Object.assign(p, structuredClone(version))
    }, undefined, true)
    useStore.getState().setStatus('Versie teruggezet. Ongedaan maken (Cmd/Ctrl+Z) zet je huidige werk terug; opslaan maakt het definitief.')
    onClose()
  }
  const fmt = (t: number) => new Date(t).toLocaleString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  return (
    <Modal title="Versiegeschiedenis" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Elke keer dat je opslaat wordt een versie bewaard (de laatste 50). Terugzetten kun je weer ongedaan maken.
      </p>
      {list === null ? (
        <p className="faint">Laden…</p>
      ) : list.length ? (
        <div className="list versions-list">
          {list.map((v, i) => (
            <div key={v.id} className="list-item">
              <span className="grow">
                {fmt(v.savedAt)}
                {i === 0 && <span className="meta"> · laatst opgeslagen</span>}
              </span>
              <span className="meta">{(v.bytes / 1024).toFixed(0)} KB</span>
              <button className="ghost sm" onClick={() => void restore(v.id)}>
                Terugzetten
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="faint">Nog geen versies. Er wordt er een bewaard zodra je opslaat.</p>
      )}
      <div className="actions">
        <button onClick={onClose}>Sluiten</button>
      </div>
    </Modal>
  )
}

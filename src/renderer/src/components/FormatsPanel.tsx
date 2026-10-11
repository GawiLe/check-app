import { LayoutGrid, Link2, Link2Off, MoreHorizontal, Plus, Star } from 'lucide-react'
import { copyFormat, resetCompOverrides, resetOverrides } from '@shared/sync'
import type { Composition, Project } from '@shared/types'
import { deleteComposition, renameComposition } from '../lib/actions'
import { useStore, type MenuItem } from '../store'
import { InlineRename } from './ui'

const S = () => useStore.getState()
const size = (c: Composition) => `${c.width}×${c.height}`

/** Aantal aangepaste en eigen lagen in een afgeleid formaat (t.o.v. de basis). */
function changes(p: Project, c: Composition) {
  const base = p.compositions.find((x) => x.id === p.baseCompositionId)
  if (!base || c.id === base.id) return { changed: 0, own: 0 }
  const links = new Set(base.layers.map((l) => l.linkId))
  return {
    changed: c.layers.filter((l) => l.overrides?.length).length + (c.overrides?.length ? 1 : 0),
    own: c.layers.filter((l) => !links.has(l.linkId)).length
  }
}

/** Lay-out van een ander formaat overnemen in dit formaat (ongedaan te maken). */
export function takeLayoutFrom(fromId: string, toId: string) {
  const p = S().project!
  const from = p.compositions.find((c) => c.id === fromId)
  const to = p.compositions.find((c) => c.id === toId)
  if (!from || !to) return
  S().update((pr) => copyFormat(pr, fromId, toId), undefined, true)
  S().setComp(toId)
  S().setOverview(false)
  S().setStatus(`Lay-out van ${size(from)} overgenomen in ${size(to)}. Ongedaan maken kan met Cmd/Ctrl+Z.`)
}

function openFormatMenu(e: React.MouseEvent, c: Composition) {
  e.preventDefault()
  e.stopPropagation()
  const p = S().project!
  const isBase = c.id === p.baseCompositionId
  const others = p.compositions.filter((x) => x.id !== c.id)
  const items: MenuItem[] = [{ label: 'Naam wijzigen', onClick: () => S().setRenaming(c.id) }]
  if (!isBase && others.length) {
    items.push({ separator: true })
    for (const o of others) items.push({ label: `Lay-out overnemen van ${size(o)}${o.id === p.baseCompositionId ? ' (basis)' : ''}`, onClick: () => takeLayoutFrom(o.id, c.id) })
  }
  if (!isBase) {
    items.push(
      { separator: true },
      {
        label: 'Alle aanpassingen terug naar de basis',
        disabled: !changes(p, c).changed,
        onClick: () =>
          S().update((pr) => {
            const comp = pr.compositions.find((x) => x.id === c.id)!
            for (const l of comp.layers) if (l.overrides?.length) resetOverrides(pr, c.id, l.id)
            resetCompOverrides(pr, c.id)
          }, undefined, true)
      },
      { label: 'Formaat verwijderen', danger: true, onClick: () => deleteComposition(c.id) }
    )
  }
  S().openMenu(e.clientX, e.clientY, items)
}

/**
 * Paneel "Formaten": alle formaten op een rij. Klik = bewerken, vinkje = meenemen in overzicht en export,
 * rechtermuisknop of ⋯ = naam, lay-out overnemen van een ander formaat, terugzetten, verwijderen.
 */
export function FormatsPanel() {
  const project = useStore((s) => s.project)!
  const compId = useStore((s) => s.compId)
  const overview = useStore((s) => s.overview)
  const renaming = useStore((s) => s.renaming)
  const active = project.compositions.filter((c) => !c.disabled).length

  return (
    <div className="panel-scroll formats-panel">
      <div className="fp-head">
        <button className={`ghost sm${overview ? ' on' : ''}`} title="Alle aangevinkte formaten naast elkaar" onClick={() => S().setOverview(!overview)}>
          <LayoutGrid size={13} /> Alle formaten
        </button>
        <span className="grow" />
        <button
          className={`icon sm${project.syncFormats ? ' on' : ''}`}
          title={
            project.syncFormats
              ? 'Formaten gekoppeld aan de basis: wat je in de basis doet, gaat naar alle formaten. Aanpassingen in een ander formaat blijven alleen daar.'
              : 'Formaten los: wijzigingen gelden alleen voor het formaat waarin je werkt.'
          }
          onClick={() => S().update((p) => void (p.syncFormats = !p.syncFormats))}
        >
          {project.syncFormats ? <Link2 size={14} /> : <Link2Off size={14} />}
        </button>
        <button className="icon sm" title="Formaat toevoegen" onClick={() => S().setDialog('addFormat')}>
          <Plus size={14} />
        </button>
      </div>
      <div className="fp-list">
        {project.compositions.map((c) => {
          const isBase = c.id === project.baseCompositionId
          const ch = changes(project, c)
          return (
            <div
              key={c.id}
              className={`fp-item${!overview && c.id === compId ? ' on' : ''}${c.disabled ? ' off' : ''}`}
              onClick={() => {
                S().setComp(c.id)
                S().setOverview(false)
              }}
              onDoubleClick={() => S().setRenaming(c.id)}
              onContextMenu={(e) => openFormatMenu(e, c)}
            >
              <input
                type="checkbox"
                checked={!c.disabled}
                title={c.disabled ? 'Uitgezet: niet in het overzicht en standaard niet in de export' : 'Aan: in het overzicht en in de export'}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) =>
                  S().update((p) => {
                    const x = p.compositions.find((y) => y.id === c.id)!
                    if (e.target.checked) delete x.disabled
                    else x.disabled = true
                  })
                }
              />
              {renaming === c.id ? (
                <InlineRename
                  value={c.name}
                  onDone={(v) => {
                    if (v) renameComposition(c.id, v)
                    S().setRenaming(null)
                  }}
                />
              ) : (
                <span className="fp-label">
                  <span className="fp-size">{size(c)}</span>
                  {!/^(basis )?\d+x\d+$/i.test(c.name) && <span className="fp-name">{c.name}</span>}
                </span>
              )}
              {isBase ? (
                <span className="fp-badge base" title="Basis: wat je hier doet, gaat naar alle formaten">
                  <Star size={10} /> basis
                </span>
              ) : (
                <>
                  {ch.changed > 0 && (
                    <span className="fp-badge changed" title={`${ch.changed} laag/lagen aangepast in dit formaat (oranje in de tijdlijn)`}>
                      <span className="dot" />
                      {ch.changed}
                    </span>
                  )}
                  {ch.own > 0 && (
                    <span className="fp-badge own" title={`${ch.own} eigen laag/lagen, alleen in dit formaat (blauwgroen in de tijdlijn)`}>
                      +{ch.own}
                    </span>
                  )}
                </>
              )}
              <button className="icon sm fp-more" title="Meer: naam, lay-out overnemen, terugzetten, verwijderen" onClick={(e) => openFormatMenu(e, c)}>
                <MoreHorizontal size={14} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="hint-text fp-hint">
        {project.syncFormats ? (
          <>
            De <b>basis</b> is leidend: wat je daar toevoegt of wijzigt, gaat naar alle formaten. In een ander formaat pas je inhoud, plek en maat
            aan, verberg je lagen of voeg je eigen lagen toe: dat geldt alleen voor dat formaat (<span className="fp-c-changed">oranje</span> = aangepast,{' '}
            <span className="fp-c-own">blauwgroen</span> = eigen laag).
          </>
        ) : (
          <>Formaten staan los van elkaar: wijzigingen gelden alleen voor het formaat waarin je werkt.</>
        )}{' '}
        {active < project.compositions.length && `${project.compositions.length - active} formaat/formaten uitgezet.`}
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { AlignCenter, AlignLeft, AlignRight, BookmarkPlus, Folder, Plus, Image as ImageIcon, Link2, Link2Off, ListOrdered, PenLine, RotateCcw, Sparkles, Square, Timer, Trash2, Type, Wand2, X, Code2 } from 'lucide-react'
import { layerStateAt } from '@shared/anim'
import { endFrameTime } from '@shared/motion'
import { LIBRARY } from '@shared/library'
import { baseComp, isLinkedToBase, overrideLabel } from '@shared/sync'
import { GROUP_LABEL, groupProps, layerGroups, type PropGroupId } from '@shared/propgroups'
import { findDeep, layerLength, shiftTiming, trimIn, trimOut } from '@shared/tree'
import { PRESETS } from '@shared/presets'
import { TARGET_IDS, TARGETS } from '@shared/specs'
import { exitLayers, shadowCss, shadowPs } from '@shared/build'
import type { AnimProp, BlendMode, EaseName, Layer, RevealMode, Shadow, ShapeProps } from '@shared/types'
import { BLEND_MODES } from '@shared/types'
import {
  aiAnimate,
  aiCodeElement,
  animateStrokeDraw,
  applyPreset,
  deleteComposition,
  regenerateWriteOn,
  clearInOut,
  duplicateSelection,
  groupSelection,
  openComp,
  setAnchor,
  resetCompositionOverrides,
  savePresetFromLayer,
  resetLayerOverrides,
  sequenceSelection,
  setInOut,
  staggerIntros,
  ungroupSelection
} from '../lib/actions'
import { currentComp, layerLocalTime, setLayerValue, toggleStopwatch, updateComp, updateLayer, useStore, viewRange } from '../store'
import { FontPicker } from './FontPicker'
import { ColorInput, Num, Row, Scrub, Section, SectionStack, Switch, TextInput } from './ui'

export const EASE_LABEL: Record<EaseName, string> = {
  linear: 'Lineair',
  easeIn: 'Ease in',
  easeOut: 'Ease out',
  easeInOut: 'Ease in-out',
  backOut: 'Overshoot',
  elasticOut: 'Elastisch',
  bounceOut: 'Stuiter',
  hold: 'Hold'
}

const TYPE_ICON = { text: Type, image: ImageIcon, shape: Square, writeon: PenLine, group: Folder, code: Code2 }

function useSelectedLayer() {
  const comp = useStore(currentComp)!
  const selection = useStore((s) => s.selection)
  const layer = selection.length === 1 ? findDeep(comp.layers, selection[0])?.layer : undefined
  return { layer, count: selection.length }
}

/** Paneel "Ontwerp": inhoud, transform en tijd van de selectie, of het formaat/project. */
export function DesignPanel() {
  const { layer, count } = useSelectedLayer()
  return (
    <SectionStack id="design" className="panel-scroll">
      <FormatNotice />
      {layer ? <LayerDesign layer={layer} /> : count > 1 ? <Multi n={count} /> : <OpenCompOr />}
    </SectionStack>
  )
}

/** Paneel "Animatie": binnenkomst, accent, uitgang en keyframes. */
export function MotionPanel() {
  const { layer } = useSelectedLayer()
  return (
    <SectionStack id="motion" className="panel-scroll">
      <FormatNotice />
      {layer ? <LayerMotion layer={layer} /> : <CompMotion />}
    </SectionStack>
  )
}

/** Paneel "AI". */
export function AiPanelView() {
  return (
    <div className="panel-scroll">
      <AiPanel />
    </div>
  )
}

/** In een afgeleid formaat: uitleg dat wijzigingen hier alleen voor dit formaat gelden. */
function FormatNotice() {
  const project = useStore((s) => s.project)!
  const comp = useStore(currentComp)!
  if (!project.syncFormats || comp.id === project.baseCompositionId) return null
  const base = baseComp(project)
  return (
    <div className="notice">
      <b style={{ color: 'var(--text)' }}>Afgeleid van {base ? `${base.width}×${base.height}` : 'de basis'}.</b> Wat je hier aanpast geldt alleen voor{' '}
      {comp.width}×{comp.height} en wordt niet meer overschreven door de basis. Herstellen kan per eigenschap.
    </div>
  )
}

/** Lijst van eigenschappen die in dit formaat afwijken van de basis, met herstelknoppen. */
function Overrides(props: { keys: string[] | undefined; onReset: (keys?: string[]) => void; title?: string }) {
  if (!props.keys?.length) return null
  return (
    <Section
      title={
        <>
          <span className="override-dot" /> {props.title ?? 'Afwijkend van basis'}
        </>
      }
      actions={
        <button className="ghost sm" onClick={() => props.onReset()} title="Alles terug naar de basis">
          <RotateCcw size={12} /> Alles
        </button>
      }
    >
      <div className="override-list">
        {props.keys.map((k) => (
          <span key={k} className="chip">
            {overrideLabel(k)}
            <button className="icon sm" title="Herstel naar basis" onClick={() => props.onReset([k])}>
              <X size={11} />
            </button>
          </span>
        ))}
      </div>
    </Section>
  )
}

function Multi({ n }: { n: number }) {
  const [overlap, setOverlap] = useState(0)
  return (
    <>
      <Section title={`${n} lagen geselecteerd`}>
        <div className="grid2">
          <button className="ghost" onClick={groupSelection} title="Cmd/Ctrl+G">
            <Folder size={13} /> Nieuwe compositie
          </button>
          <button className="ghost" onClick={() => sequenceSelection(overlap)} title="Zoals Sequence Layers in After Effects">
            <ListOrdered size={13} /> Achter elkaar
          </button>
        </div>
        <Row label="Overlap">
          <Num label="s" value={overlap} step={0.05} min={0} max={5} decimals={2} onChange={(v) => setOverlap(v)} />
        </Row>
        <div className="hint-text">
          Nieuwe compositie (precompose) maakt er één laag van die je als geheel animeert, dupliceert en in de tijd verschuift. Dubbelklik om hem te openen. Achter elkaar zet de lagen (bijv. scènes) na
          elkaar in de tijd.
        </div>
      </Section>
    </>
  )
}

/** In- en uit-punt van een laag: wanneer hij zichtbaar is. */
function TimeRange({ layer }: { layer: Layer }) {
  const start = layer.start ?? 0
  const compDuration = useStore(currentComp)!.duration
  return (
    <Section title="Tijd">
      <div className="grid2">
        <Num label="In" value={start} step={0.05} min={0} max={60} decimals={2} suffix="s" onChange={(v, co) => updateLayer(layer.id, (l) => trimIn(l, v), co ? 'tin' : undefined)} />
        <Num
          label="Uit"
          value={layer.end ?? Math.max(start, compDuration)}
          step={0.05}
          min={0}
          max={60}
          decimals={2}
          suffix="s"
          animated={layer.end != null}
          onChange={(v, co) => updateLayer(layer.id, (l) => trimOut(l, v), co ? 'tout' : undefined)}
        />
      </div>
      <div className="grid2">
        <button className="ghost sm" onClick={() => setInOut('in')} title="Alt+[">
          In op playhead
        </button>
        <button className="ghost sm" onClick={() => setInOut('out')} title="Alt+]">
          Uit op playhead
        </button>
      </div>
      {(layer.end != null || start > 0) && (
        <button className="sm" onClick={clearInOut}>
          Altijd zichtbaar
        </button>
      )}
    </Section>
  )
}

// ---------------- Ontwerp ----------------

/** Niets geselecteerd: in een geopende compositie de instellingen van die compositie, anders van het formaat. */
function OpenCompOr() {
  const project = useStore((s) => s.project)!
  const compId = useStore((s) => s.compId)
  const activeTab = useStore((s) => s.activeTab)
  const group = viewRange({ project, compId, activeTab }).group
  return group ? <GroupCompDesign group={group} /> : <CompDesign />
}

/** Instellingen van een geopende compositie: naam, maat (het canvas van de compositie), duur en in-punt. */
function GroupCompDesign({ group }: { group: Layer }) {
  const up = (fn: (l: Layer) => void, co?: string) => updateLayer(group.id, fn, co)
  const start = group.start ?? 0
  const length = layerLength(group)
  return (
    <Section title={<><Folder size={13} /> Compositie</>}>
      <Row label="Naam">
        <TextInput value={group.name} onCommit={(v) => v.trim() && up((l) => void (l.name = v.trim()))} />
      </Row>
      <div className="row">
        <span className="label">Maat</span>
        <div className="grow">
          <Num label="B" value={Math.round(group.width)} min={1} max={4000} onChange={(v, co) => up((l) => void (l.width = Math.round(v)), co ? 'gw' : undefined)} />
        </div>
        <div className="grow">
          <Num label="H" value={Math.round(group.height)} min={1} max={4000} onChange={(v, co) => up((l) => void (l.height = Math.round(v)), co ? 'gh' : undefined)} />
        </div>
      </div>
      <div className="row">
        <span className="label">Duur</span>
        <div className="grow">
          <Num label="s" value={Math.round(length * 10) / 10} step={0.1} min={0.1} max={30} decimals={1} onChange={(v, co) => up((l) => void (l.end = Math.round((start + v) * 100) / 100), co ? 'gd' : undefined)} />
        </div>
      </div>
      <div className="row">
        <span className="label">Begint op</span>
        <div className="grow">
          <Num
            label="s"
            title="In-punt in het formaat: de hele compositie (met al zijn animaties) schuift mee"
            value={Math.round(start * 100) / 100}
            step={0.05}
            min={0}
            max={60}
            decimals={2}
            onChange={(v, co) => up((l) => shiftTiming(l, v - (l.start ?? 0)), co ? 'gs' : undefined)}
          />
        </div>
      </div>
      <div className="hint-text">
        De maat is het canvas van de compositie (zo zie je hem als je hem opent). De lagen erin blijven staan; wat buiten de maat valt is in het formaat gewoon zichtbaar, tenzij je een masker gebruikt. Formaat-instellingen vind je via het formaat-tabblad onder in de tijdlijn.
      </div>
    </Section>
  )
}

function CompDesign() {
  const project = useStore((s) => s.project)!
  const comp = useStore(currentComp)!
  const update = useStore((s) => s.update)
  const isBase = comp.id === project.baseCompositionId
  return (
    <>
      <Overrides keys={comp.overrides} onReset={resetCompositionOverrides} title="Formaat wijkt af van basis" />
      <Section
        title={
          <>
            Formaat <span className="hint">{isBase ? 'basis' : 'afgeleid'}</span>
          </>
        }
        actions={
          !isBase && (
            <button className="icon sm" title="Formaat verwijderen" onClick={() => deleteComposition(comp.id)}>
              <Trash2 size={13} />
            </button>
          )
        }
      >
        <div className="grid2">
          <Num label="B" value={comp.width} min={10} max={2000} onChange={(v, co) => updateComp((c) => void (c.width = v), co ? 'cw' : undefined)} />
          <Num label="H" value={comp.height} min={10} max={2000} onChange={(v, co) => updateComp((c) => void (c.height = v), co ? 'ch' : undefined)} />
        </div>
        <div className="grid2">
          <Num label="Duur" title="Duur van één loop" value={comp.duration} step={0.1} min={0.5} max={30} decimals={1} suffix="s" onChange={(v, co) => updateComp((c) => void (c.duration = v), co ? 'cd' : undefined)} />
          <select value={comp.loops} onChange={(e) => updateComp((c) => void (c.loops = +e.target.value))}>
            <option value={1}>Niet loopen</option>
            <option value={2}>2× afspelen</option>
            <option value={3}>3× afspelen</option>
          </select>
        </div>
        <Row label="Eindbeeld">
          <span title="Hier stopt de laatste loop, en hiervan wordt de backup-afbeelding gemaakt. Zet hem vóór een uitgaande animatie." style={{ display: 'contents' }}>
            <Num
              label="op"
              value={endFrameTime(comp)}
              step={0.05}
              min={0}
              max={comp.duration}
              decimals={2}
              suffix="s"
              onChange={(v, co) => updateComp((c) => void (c.endFrame = v >= c.duration ? null : v), co ? 'ef' : undefined)}
            />
            <button className="ghost sm" title="Eindbeeld op de playhead" onClick={() => updateComp((c) => void (c.endFrame = Math.round(useStore.getState().time * 100) / 100))}>
              Playhead
            </button>
            {comp.endFrame != null && (
              <button className="ghost sm" title="Eindbeeld = einde" onClick={() => updateComp((c) => void (c.endFrame = null))}>
                Einde
              </button>
            )}
          </span>
        </Row>
        <Row label="Achtergrond">
          <ColorInput value={comp.background} coalesce="bg" onChange={(v, co) => updateComp((c) => void (c.background = v), co)} />
        </Row>
        <Row label="Rand">
          <Switch
            checked={!!comp.border && comp.border.width > 0}
            onChange={(on) => updateComp((c) => void (c.border = on ? { color: '#000000', width: 1 } : null))}
          />
          {comp.border && (
            <>
              <ColorInput value={comp.border.color} coalesce="bc" onChange={(v, co) => updateComp((c) => void (c.border!.color = v), co)} />
              <Num label="px" value={comp.border.width} min={1} max={10} onChange={(v, co) => updateComp((c) => void (c.border!.width = v), co ? 'bw' : undefined)} />
            </>
          )}
        </Row>
      </Section>

      <Section title="Export">
        <Row label="clickTag">
          <span title="Fallback-URL: het ad-server overschrijft hem bij uitserveren. Wordt hij niet ingevuld, dan opent deze URL." style={{ display: "contents" }}>
          <TextInput value={project.clickTag} placeholder="https:// (fallback)" onCommit={(v) => update((p) => void (p.clickTag = v.trim()))} />
          </span>
        </Row>
        <Row label="Polite load">
          <Switch checked={project.politeLoad} onChange={(v) => update((p) => void (p.politeLoad = v))} />
          <span className="faint">afbeeldingen na page load</span>
        </Row>
        <Row label="Fonts">
          <Switch checked={project.embedFonts !== false} onChange={(v) => update((p) => void (p.embedFonts = v))} />
          <span className="faint">{project.embedFonts !== false ? 'ingebed (Base64)' : 'losse .woff2'}</span>
        </Row>
        <Row label="Afbeeldingen">
          <span title="Bij export: JPG en PNG verkleinen tot de maat waarop ze getoond worden (2× voor retina) en opnieuw comprimeren. Een PNG zonder transparantie kan een JPG worden. De originelen in assets/ blijven staan." style={{ display: 'contents' }}>
            <Switch checked={!!project.optimizeImages} onChange={(v) => update((p) => void (p.optimizeImages = v))} />
            <span className="faint">{project.optimizeImages ? 'optimaliseren bij export' : 'zoals ze zijn'}</span>
          </span>
        </Row>
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <span className="label" style={{ paddingTop: 6 }}>
            Platform
          </span>
          <div className="grow">
            {TARGET_IDS.map((t) => (
              <label key={t} className="list-item" style={{ height: 26, padding: '0 4px' }}>
                <input
                  type="checkbox"
                  checked={project.targets.includes(t)}
                  onChange={(e) =>
                    update((p) => {
                      p.targets = e.target.checked ? [...p.targets, t] : p.targets.filter((x) => x !== t)
                    })
                  }
                />
                <span className="grow">{TARGETS[t].label}</span>
              </label>
            ))}
          </div>
        </div>
      </Section>

      <Section title="Project">
        <Row label="Naam">
          <TextInput value={project.name} onCommit={(v) => update((p) => void (p.name = v))} />
        </Row>
        <Row label="Formaten">
          <Switch checked={project.syncFormats} onChange={(v) => update((p) => void (p.syncFormats = v))} />
          <span className="faint">{project.syncFormats ? 'gekoppeld' : 'los'}</span>
        </Row>
        <div className="hint-text">
          Gekoppeld: tekst, kleuren, afbeeldingen en animatie gelden voor alle formaten. Positie en maat stel je per formaat in.
        </div>
      </Section>
    </>
  )
}

function LayerDesign({ layer }: { layer: Layer }) {
  const overflowIds = useStore((s) => s.overflowIds)
  const project = useStore((s) => s.project)!
  const up = (fn: (l: Layer) => void, co?: string) => updateLayer(layer.id, fn, co)
  const Icon = TYPE_ICON[layer.type]
  const anim = (p: AnimProp) => !!layer.tracks[p]?.length
  const set = (p: AnimProp) => (v: number, co: boolean) => setLayerValue(layer.id, p, v, co ? `p-${p}` : undefined)
  const fonts = project.fonts
  const derived = project.syncFormats && useStore.getState().compId !== project.baseCompositionId
  const own = derived && !isLinkedToBase(project, layer)

  return (
    <>
      {derived && <Overrides keys={layer.overrides} onReset={(keys) => resetLayerOverrides(layer.id, keys)} />}
      {own && <div className="notice">Eigen laag: bestaat alleen in dit formaat.</div>}
      <Section id="soort" title={<Icon size={14} />} actions={<span className="faint">{{ text: 'Tekst', image: 'Afbeelding', shape: 'Vorm', writeon: 'Write-on', group: 'Compositie', code: 'Code-element' }[layer.type]}</span>}>
        <TextInput value={layer.name} onCommit={(v) => up((l) => void (l.name = v))} />
      </Section>

      {layer.text && (
        <Section title="Tekst">
          <TextInput multiline value={layer.text.content} onCommit={(v) => up((l) => void (l.text!.content = v))} />
          <div style={{ height: 6 }} />
          <FontPicker
            value={layer.text.fontId}
            onPick={(id, weight) =>
              up((l) => {
                l.text!.fontId = id
                if (weight) l.text!.weight = weight
              })
            }
          />
          <div className="row">
            <ColorInput value={layer.text.color} coalesce="tc" onChange={(v, co) => up((l) => void (l.text!.color = v), co)} />
            <div className="grow">
              <Num label="pt" value={layer.text.size} min={4} max={300} onChange={(v, co) => up((l) => void (l.text!.size = v), co ? 'ts' : undefined)} />
            </div>
            <select value={layer.text.weight} onChange={(e) => up((l) => void (l.text!.weight = +e.target.value))} style={{ width: 70 }}>
              {[300, 400, 500, 600, 700, 800, 900].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </div>
          <div className="grid3">
            <div className="seg" style={{ gridColumn: 'span 1' }}>
              {(['left', 'center', 'right'] as const).map((a) => (
                <button
                  key={a}
                  className={layer.text!.align === a ? 'on' : ''}
                  title={a === 'left' ? 'Links uitlijnen' : a === 'center' ? 'Centreren' : 'Rechts uitlijnen'}
                  onClick={() => up((l) => void (l.text!.align = a))}
                  style={{ flex: 1, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                >
                  {a === 'left' ? <AlignLeft size={14} /> : a === 'center' ? <AlignCenter size={14} /> : <AlignRight size={14} />}
                </button>
              ))}
            </div>
            <Num
              label="↕pt"
              title="Regelafstand in pt, zoals in Photoshop (blijft gelijk als je de lettergrootte wijzigt)"
              value={layer.text.leading ?? Math.round(layer.text.size * layer.text.lineHeight * 10) / 10}
              step={0.5}
              min={1}
              max={1000}
              decimals={1}
              onChange={(v, co) => up((l) => void (l.text!.leading = v), co ? 'lh' : undefined)}
            />
            <Num
              label="VA"
              title="Tracking in duizendsten van een em, zoals in Photoshop (bijv. -40)"
              value={layer.text.tracking ?? Math.round((layer.text.letterSpacing / (layer.text.size || 1)) * 1000)}
              step={5}
              min={-500}
              max={2000}
              decimals={0}
              onChange={(v, co) =>
                up((l) => {
                  l.text!.tracking = v
                  l.text!.letterSpacing = 0
                }, co ? 'ls' : undefined)
              }
            />
          </div>
          <div className="row">
            <span className="label">Lijn</span>
            <Switch
              checked={!!layer.text.stroke && layer.text.stroke.width > 0}
              onChange={(v) => up((l) => void (l.text!.stroke = v ? { color: l.text!.stroke?.color ?? '#000000', width: l.text!.stroke?.width || 1 } : null))}
            />
            {layer.text.stroke && layer.text.stroke.width > 0 && (
              <>
                <ColorInput value={layer.text.stroke.color} coalesce="tsc" onChange={(v, co) => up((l) => void (l.text!.stroke!.color = v), co)} />
                <div className="grow">
                  <Num label="px" value={layer.text.stroke.width} min={0.5} max={20} step={0.5} decimals={1} onChange={(v, co) => up((l) => void (l.text!.stroke!.width = v), co ? 'tsw' : undefined)} />
                </div>
              </>
            )}
          </div>
          <div className="row">
            <span className="label">Hoofdletters</span>
            <div className="seg grow text-case">
              {(
                [
                  [null, 'Aa', 'Zoals getypt'],
                  ['upper', 'AA', 'ALLES HOOFDLETTERS'],
                  ['lower', 'aa', 'alles kleine letters'],
                  ['title', 'Aa Bb', 'Elk Woord Met Een Hoofdletter']
                ] as const
              ).map(([v, label, title]) => (
                <button key={label} title={title} className={(layer.text!.case ?? null) === v ? 'on' : ''} onClick={() => up((l) => void (v ? (l.text!.case = v) : delete l.text!.case))}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Row label="Passend">
            <Switch checked={!!layer.text.fit} onChange={(v) => up((l) => void (l.text!.fit = v))} />
            <span className="faint">{layer.text.fit ? 'verkleint tot het in het kader past' : 'vaste grootte'}</span>
          </Row>
          {overflowIds.includes(layer.id) && (
            <div className="warn-text">
              Deze tekst past niet in zijn kader. Maak het kader groter, de tekst korter, of zet <b>Passend</b> aan.
            </div>
          )}
        </Section>
      )}

      {layer.writeon && (
        <Section title="Write-on">
          <TextInput
            multiline
            value={layer.writeon.content}
            onCommit={(v) => {
              up((l) => void (l.writeon!.content = v))
              void regenerateWriteOn(layer.id)
            }}
          />
          <div style={{ height: 6 }} />
          <FontPicker
            allowSystem={false}
            value={layer.writeon.fontId}
            onPick={(id) => {
              up((l) => void (l.writeon!.fontId = id))
              void regenerateWriteOn(layer.id)
            }}
          />
          <div className="row">
            <ColorInput value={layer.writeon.color} coalesce="wc" onChange={(v, co) => up((l) => void (l.writeon!.color = v), co)} />
            <div className="grow">
              <Num label="Lijn" value={layer.writeon.strokeWidth} step={0.1} min={0} max={20} decimals={1} onChange={(v, co) => up((l) => void (l.writeon!.strokeWidth = v), co ? 'wsw' : undefined)} />
            </div>
            <div className="grow">
              <Num label="Vul" title="Hoe snel de vulling na de lijn komt (0 = alleen lijn)" value={layer.writeon.fillAfter} step={0.01} min={0} max={1} decimals={2} onChange={(v, co) => up((l) => void (l.writeon!.fillAfter = v), co ? 'wf' : undefined)} />
            </div>
          </div>
          <div className="row">
            <span className="label">Richting</span>
            <div className="seg grow writeon-dir">
              {(
                [
                  ['left', '→', 'Van links naar rechts'],
                  ['right', '←', 'Van rechts naar links'],
                  ['top', '↓', 'Van boven naar onder (regel voor regel)'],
                  ['bottom', '↑', 'Van onder naar boven (regel voor regel)']
                ] as const
              ).map(([v, label, title]) => (
                <button key={v} title={title} className={(layer.writeon!.direction ?? 'left') === v ? 'on' : ''} onClick={() => up((l) => void (v === 'left' ? delete l.writeon!.direction : (l.writeon!.direction = v)))}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {!layer.writeon.glyphs.length && (
            <div className="row">
              <span className="faint grow">Nog geen paden.</span>
              <button className="ghost sm" onClick={() => regenerateWriteOn(layer.id)}>
                Genereer
              </button>
            </div>
          )}
        </Section>
      )}

      {layer.code && (
        <Section title="Code-element">
          <div className="hint-text">
            HTML/SVG met CSS-animatie ({layer.code.w}×{layer.code.h}px ontwerpmaat, schaalt mee met de laag). De animatie loopt mee met de tijdlijn vanaf het in-punt. Aanpassen kan hieronder of via het paneel AI.
          </div>
          <CodeField label="HTML / SVG" value={layer.code.html} onCommit={(v) => up((l) => void (l.code!.html = v))} />
          <CodeField label="CSS (.root = het element, @keyframes kf-…)" value={layer.code.css} onCommit={(v) => up((l) => void (l.code!.css = v))} />
          {(layer.width !== layer.code.w || layer.height !== layer.code.h) && (
            <div className="row">
              <span className="faint grow">Geschaald naar {layer.width}×{layer.height}</span>
              <button className="ghost sm" onClick={() => up((l) => Object.assign(l, { width: l.code!.w, height: l.code!.h }))}>
                Ware grootte
              </button>
            </div>
          )}
        </Section>
      )}

      {layer.image && (
        <Section title="Afbeelding">
          <Row label="Bestand">
            <span className="muted grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {layer.image.src.replace(/^assets\//, '') || '—'}
            </span>
            <button className="ghost sm" title="Vervangen uit assets of uit een map" onClick={() => useStore.getState().openReplace(layer.id)}>
              Vervangen…
            </button>
          </Row>
          <Row label="Passend">
            <select value={layer.image.fit} onChange={(e) => up((l) => void (l.image!.fit = e.target.value as 'contain'))}>
              <option value="contain">Passend</option>
              <option value="cover">Vullend</option>
              <option value="fill">Uitrekken</option>
            </select>
          </Row>
        </Section>
      )}

      {layer.shape && (
        <Section title="Vorm">
          {layer.shape.kind !== 'path' && (
            <div className="seg" style={{ width: '100%', marginBottom: 8 }}>
              {(
                [
                  ['rect', 'Rechthoek'],
                  ['ellipse', 'Ellips']
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  className={(layer.shape!.kind ?? 'rect') === k ? 'on' : ''}
                  style={{ flex: 1 }}
                  onClick={() => up((l) => void (l.shape!.kind = k))}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {layer.shape.kind === 'path' && (
            <div className="hint-text" style={{ marginTop: 0, marginBottom: 8 }}>
              Pen-vorm ({layer.shape.path?.closed ? 'gesloten' : 'open lijn'}). Schaalt mee met breedte en hoogte.
            </div>
          )}
          {/* Een open lijn heeft geen vulling */}
          {!(layer.shape.kind === 'path' && !layer.shape.path?.closed) && (
            <div className="row">
              <span className="label">Vulling</span>
              <Switch checked={layer.shape.fillEnabled !== false} onChange={(v) => up((l) => void (l.shape!.fillEnabled = v))} />
              {layer.shape.fillEnabled !== false && (
                <>
                  <ColorInput value={layer.shape.fill} coalesce="sf" onChange={(v, co) => up((l) => void (l.shape!.fill = v), co)} />
                </>
              )}
            </div>
          )}
          {layer.shape.fillEnabled !== false && (layer.shape.kind !== 'path' || layer.shape.path?.closed) && <GradientRows layer={layer} />}
          <div className="row">
            <span className="label">Lijn</span>
            <Switch
              checked={layer.shape.strokeWidth > 0}
              onChange={(v) => up((l) => void (l.shape!.strokeWidth = v ? Math.max(1, l.shape!.strokeWidth || 2) : 0))}
            />
            {layer.shape.strokeWidth > 0 && (
              <>
                <ColorInput value={layer.shape.strokeColor} coalesce="sc" onChange={(v, co) => up((l) => void (l.shape!.strokeColor = v), co)} />
                <div className="grow">
                  <Num label="px" value={layer.shape.strokeWidth} min={0.5} max={50} step={0.5} decimals={1} onChange={(v, co) => up((l) => void (l.shape!.strokeWidth = v), co ? 'ss' : undefined)} />
                </div>
              </>
            )}
          </div>
          {layer.shape.strokeWidth > 0 && <StrokeRows layer={layer} />}
          {(layer.shape.kind ?? 'rect') === 'rect' && (
            <div className="row">
              <span className="label">Hoekradius</span>
              <div className="grow">
                <Num label="◜" value={layer.shape.radius} min={0} max={1000} onChange={(v, co) => up((l) => void (l.shape!.radius = v), co ? 'sr' : undefined)} />
              </div>
              <button className="ghost sm" title="Pil-vorm" onClick={() => up((l) => void (l.shape!.radius = Math.round(Math.min(l.width, l.height) / 2)))}>
                Rond
              </button>
            </div>
          )}
        </Section>
      )}

      {layer.type === 'group' && (
        <Section title="Compositie">
          <div className="hint-text" style={{ marginTop: 0, marginBottom: 8 }}>
            {layer.children?.length ?? 0} lagen. Animeer de compositie als geheel via de tab Animatie, of open hem (dubbelklik) om de lagen erin te bewerken.
          </div>
          <div className="grid2">
            <button className="ghost sm" onClick={() => openComp(layer.id)}>
              Openen
            </button>
            <button className="ghost sm" onClick={duplicateSelection}>
              Dupliceren
            </button>
            <button className="ghost sm" onClick={ungroupSelection}>
              Opheffen
            </button>
          </div>
        </Section>
      )}
      <TimeRange layer={layer} />
      <Section title="Transform">
        <TransformRows layer={layer} />
        <div className="row" style={{ alignItems: 'flex-start', marginTop: 4 }}>
          <span className="label" style={{ paddingTop: 4 }}>
            Anchor
          </span>
          <div className="anchor-grid" title="Anchor point (draaipunt voor schaal en rotatie). Je kunt hem ook op het canvas slepen.">
            {[0, 0.5, 1].flatMap((ay) =>
              [0, 0.5, 1].map((ax) => (
                <button
                  key={`${ax}-${ay}`}
                  className={(layer.anchorX ?? 0.5) === ax && (layer.anchorY ?? 0.5) === ay ? 'on' : ''}
                  onClick={() => setAnchor(layer.id, ax, ay)}
                />
              ))
            )}
          </div>
          <div className="grow" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <Num label="X%" value={Math.round((layer.anchorX ?? 0.5) * 100)} min={0} max={100} onChange={(v, co) => setAnchor(layer.id, v / 100, layer.anchorY ?? 0.5, co ? 'anchor' : undefined)} />
            <Num label="Y%" value={Math.round((layer.anchorY ?? 0.5) * 100)} min={0} max={100} onChange={(v, co) => setAnchor(layer.id, layer.anchorX ?? 0.5, v / 100, co ? 'anchor' : undefined)} />
          </div>
        </div>
        <Row label="CTA-hover">
          <Switch checked={layer.cta} onChange={(v) => up((l) => void (l.cta = v))} />
        </Row>
      </Section>
      <LookSection layer={layer} />
      <ShadowSection layer={layer} />
      <ExitSection layer={layer} />
    </>
  )
}

/** Schaduw met Photoshop-waarden (hoek, afstand, spreiden, grootte); x/y/blur worden daaruit berekend. */
const psShadow = (angle: number, distance: number, spread: number, size: number, color: string, opacity: number): Shadow => ({
  ...shadowCss({ x: 0, y: 0, blur: 0, color, opacity, angle, distance, spread, size }),
  color,
  opacity,
  angle,
  distance,
  spread,
  size
})
const SHADOW_PRESETS: Record<string, Shadow[]> = {
  Zacht: [psShadow(90, 4, 0, 12, '#000000', 0.25)],
  Hard: [psShadow(135, 6, 100, 0, '#000000', 0.4)],
  Dubbel: [psShadow(90, 1, 0, 2, '#000000', 0.3), psShadow(90, 8, 0, 24, '#000000', 0.2)],
  Gloed: [psShadow(90, 0, 0, 16, '#ffffff', 0.8)]
}

/** Schaduwen: één of meer (gestapeld), voor tekst, vormen, afbeeldingen en composities. */
/** Verloop voor een vorm: van de vulkleur naar een tweede kleur, lineair of radiaal, met dekking per kant. */
function GradientRows({ layer }: { layer: Layer }) {
  const g = layer.shape!.gradient
  const up = (fn: (gr: NonNullable<ShapeProps['gradient']>) => void, co?: string) =>
    updateLayer(layer.id, (l) => {
      if (l.shape?.gradient) fn(l.shape.gradient)
    }, co)
  return (
    <>
      <Row label="Verloop">
        <Switch
          checked={!!g}
          onChange={(v) =>
            updateLayer(layer.id, (l) => {
              if (v) l.shape!.gradient = { type: 'linear', angle: 180, to: '#000000', fromOpacity: 1, toOpacity: 1 }
              else delete l.shape!.gradient
            })
          }
        />
        {g && (
          <div className="seg" style={{ flex: 1 }}>
            {(
              [
                ['linear', 'Lineair'],
                ['radial', 'Radiaal']
              ] as const
            ).map(([k, label]) => (
              <button key={k} className={g.type === k ? 'on' : ''} style={{ flex: 1 }} onClick={() => up((gr) => void (gr.type = k))}>
                {label}
              </button>
            ))}
          </div>
        )}
      </Row>
      {g && (
        <>
          <Row label="Naar">
            <ColorInput value={g.to} coalesce="gto" onChange={(v, co) => up((gr) => void (gr.to = v), co)} />
            {g.type === 'linear' && (
              <div style={{ width: 74 }}>
                <Num label="°" value={g.angle} min={-360} max={360} onChange={(v, co) => up((gr) => void (gr.angle = v), co ? 'gan' : undefined)} />
              </div>
            )}
          </Row>
          <Row label="Dekking">
            <span className="faint" style={{ fontSize: 11 }}>
              begin
            </span>
            <input type="range" min={0} max={100} value={Math.round(g.fromOpacity * 100)} onChange={(e) => up((gr) => void (gr.fromOpacity = +e.target.value / 100), 'gfo')} />
            <span className="faint" style={{ fontSize: 11 }}>
              eind
            </span>
            <input type="range" min={0} max={100} value={Math.round(g.toOpacity * 100)} onChange={(e) => up((gr) => void (gr.toOpacity = +e.target.value / 100), 'gtoo')} />
          </Row>
        </>
      )}
    </>
  )
}

const BLEND_LABEL: Record<BlendMode, string> = {
  normal: 'Normaal',
  multiply: 'Vermenigvuldigen',
  screen: 'Bleken',
  overlay: 'Bedekken',
  darken: 'Donkerder',
  lighten: 'Lichter',
  'color-dodge': 'Kleur tegenhouden',
  'color-burn': 'Kleur doordrukken',
  'hard-light': 'Fel licht',
  'soft-light': 'Zacht licht',
  difference: 'Verschil',
  exclusion: 'Uitsluiting',
  hue: 'Kleurtoon',
  saturation: 'Verzadiging',
  color: 'Kleur',
  luminosity: 'Lichtsterkte'
}

/** Overvloeien en masker: werkt in alle moderne browsers (Chrome, Safari, Firefox, Edge). */
function LookSection({ layer }: { layer: Layer }) {
  const up = (fn: (l: Layer) => void, co?: string) => updateLayer(layer.id, fn, co)
  const mask = layer.mask
  return (
    <Section title="Weergave">
      <Row label="Overvloeien">
        <select value={layer.blend ?? 'normal'} onChange={(e) => up((l) => (e.target.value === 'normal' ? void delete l.blend : void (l.blend = e.target.value as BlendMode)))}>
          {BLEND_MODES.map((m) => (
            <option key={m} value={m}>
              {BLEND_LABEL[m]}
            </option>
          ))}
        </select>
      </Row>
      {layer.type !== 'text' && (
        <>
          <Row label="Masker">
            <div className="seg" style={{ flex: 1, minWidth: 0 }}>
              {(
                [
                  [null, 'Geen'],
                  ['rect', 'Rechthoek'],
                  ['ellipse', 'Ellips']
                ] as const
              ).map(([k, label]) => (
                <button
                  key={label}
                  className={(mask?.shape ?? null) === k ? 'on' : ''}
                  style={{ flex: 1, minWidth: 0, padding: '0 4px' }}
                  onClick={() => up((l) => (k ? void (l.mask = { shape: k, radius: l.mask?.radius ?? 0 }) : void delete l.mask))}
                >
                  {label}
                </button>
              ))}
            </div>
          </Row>
          {mask?.shape === 'rect' && (
            <Row label="Hoekradius">
              <div className="grow">
                <Num label="◜" value={mask.radius} min={0} max={1000} onChange={(v, co) => up((l) => void (l.mask && (l.mask.radius = v)), co ? 'mr' : undefined)} />
              </div>
            </Row>
          )}
          {mask && <div className="hint-text">{layer.type === 'group' ? 'Alles in deze compositie wordt bijgesneden tot het kader.' : 'De inhoud wordt bijgesneden tot het kader van de laag.'}</div>}
        </>
      )}
    </Section>
  )
}

/** Veld zoals in een Photoshop-dialoog: label, waarde (slepen of typen) en eenheid. */
function PsField(props: { label: string; unit: string; value: number; min: number; max: number; onChange: (v: number, coalesce: boolean) => void }) {
  return (
    <label className="ps-field">
      <span className="ps-l">{props.label}</span>
      <span className="ps-v">
        <Scrub value={props.value} min={props.min} max={props.max} decimals={1} onChange={props.onChange} />
      </span>
      <span className="ps-u">{props.unit}</span>
    </label>
  )
}

function ShadowSection({ layer }: { layer: Layer }) {
  const list = layer.shadows ?? []
  const up = (fn: (l: Layer) => void, co?: string) => updateLayer(layer.id, fn, co)
  const set = (i: number, patch: Partial<Shadow>, co?: string) =>
    up((l) => {
      if (l.shadows?.[i]) Object.assign(l.shadows[i], patch)
    }, co)
  // Photoshop-waarden aanpassen (oudere schaduwen worden eerst omgerekend); x/y/blur rekenen mee
  const setPs = (i: number, patch: Partial<ReturnType<typeof shadowPs>>, co?: string) =>
    up((l) => {
      const sh = l.shadows?.[i]
      if (!sh) return
      Object.assign(sh, shadowPs(sh), patch)
      Object.assign(sh, shadowCss(sh))
    }, co)
  return (
    <Section
      title="Schaduw"
      actions={
        <button
          className="icon sm"
          title="Schaduw toevoegen (meerdere = gestapeld, bijv. een dubbele schaduw)"
          onClick={() => up((l) => void (l.shadows = [...(l.shadows ?? []), psShadow(120, 5, 0, 5, '#000000', 0.75)]))}
        >
          <Plus size={14} />
        </button>
      }
    >
      <div className="shadow-presets">
        {Object.entries(SHADOW_PRESETS).map(([name, preset]) => (
          <button key={name} className="ghost sm" onClick={() => up((l) => void (l.shadows = structuredClone(preset)))}>
            {name}
          </button>
        ))}
        {list.length > 0 && (
          <button className="ghost sm" onClick={() => up((l) => void delete l.shadows)}>
            Geen
          </button>
        )}
      </div>
      {list.map((sh, i) => {
        const ps = shadowPs(sh)
        return (
          <div key={i} className="shadow-row ps-shadow">
            <div className="ps-head">
              <ColorInput value={sh.color} title="Kleur" coalesce={`shc${i}`} onChange={(v, co) => set(i, { color: v }, co)} />
              <span className="faint">Slagschaduw {list.length > 1 ? i + 1 : ''}</span>
              <span className="grow" />
              <button className="icon sm" title="Schaduw verwijderen" onClick={() => up((l) => void (l.shadows = l.shadows!.filter((_, j) => j !== i)))}>
                <Trash2 size={13} />
              </button>
            </div>
            <div className="ps-grid">
              <PsField label="Dekking" unit="%" value={Math.round(sh.opacity * 100)} min={0} max={100} onChange={(v, co) => set(i, { opacity: v / 100 }, co ? `sho${i}` : undefined)} />
              <PsField label="Hoek" unit="°" value={ps.angle} min={-360} max={360} onChange={(v, co) => setPs(i, { angle: v }, co ? `sha${i}` : undefined)} />
              <PsField label="Afstand" unit="px" value={ps.distance} min={0} max={1000} onChange={(v, co) => setPs(i, { distance: v }, co ? `shd${i}` : undefined)} />
              <PsField label="Spreiden" unit="%" value={ps.spread} min={0} max={100} onChange={(v, co) => setPs(i, { spread: v }, co ? `shs${i}` : undefined)} />
              <PsField label="Grootte" unit="px" value={ps.size} min={0} max={250} onChange={(v, co) => setPs(i, { size: v }, co ? `shz${i}` : undefined)} />
            </div>
          </div>
        )
      })}
      {!list.length && <div className="hint-text">Geen schaduw. Kies een voorbeeld of voeg er een toe; met twee of meer krijg je een gestapelde (dubbele) schaduw.</div>}
      {list.length > 0 && (
        <div className="hint-text">Zoals de slagschaduw in Photoshop: neem dekking, hoek, afstand, spreiden en grootte over. Overvloeimodus wordt niet meegenomen (bij zwart maakt dat niets uit).</div>
      )}
    </Section>
  )
}

/** Klikgebied: optioneel een eigen clickTag voor deze laag, boven de algemene klik op de hele banner. */
function ExitSection({ layer }: { layer: Layer }) {
  const comp = useStore(currentComp)!
  const fallback = useStore((s) => s.project!.clickTag)
  const n = exitLayers(comp).findIndex((l) => l.id === layer.id) + 1
  const up = (fn: (l: Layer) => void) => updateLayer(layer.id, fn)
  return (
    <Section title="Klikgebied">
      <Row label="Eigen klik">
        <Switch checked={!!layer.exit} onChange={(v) => up((l) => (v ? void (l.exit = { url: '' }) : void delete l.exit))} />
        {layer.exit && n > 0 && <span className="faint">clickTag{n}</span>}
      </Row>
      {layer.exit ? (
        <>
          <Row label="URL">
            <TextInput value={layer.exit.url} placeholder={fallback || 'https://'} onCommit={(v) => up((l) => void (l.exit = { url: v.trim() }))} />
          </Row>
          <div className="hint-text">
            Klikken op deze laag opent clickTag{n || '?'} in plaats van de algemene clickTag. Ligt boven de rest, ook als er een andere laag overheen ligt. Leeg = de algemene URL. De echte URL vul je
            in het ad-server in; dit is de fallback.
          </div>
        </>
      ) : (
        <div className="hint-text">Standaard is de hele banner één klikveld. Zet dit aan voor een eigen klik-URL op deze laag (bijv. een tweede knop).</div>
      )}
    </Section>
  )
}

// ---------------- Animatie ----------------

/**
 * Transform-eigenschappen zoals in After Effects: één regel per eigenschap met één
 * keyframe-knop (◆). Positie = X+Y, Schaal = X+Y (te koppelen), Maat = B+H (te koppelen).
 */
function TransformRows({ layer, showSize = true }: { layer: Layer; showSize?: boolean }) {
  const time = useStore((s) => s.time)
  const project = useStore((s) => s.project)!
  const compId = useStore((s) => s.compId)
  const st = layerStateAt(layer, layerLocalTime(project, compId, layer.id, time))
  const up = (fn: (l: Layer) => void, co?: string) => updateLayer(layer.id, fn, co)
  const set = (p: AnimProp) => (v: number, co: boolean) => setLayerValue(layer.id, p, v, co ? `p-${p}` : undefined)
  const animated = (g: PropGroupId) => groupProps(layer, g).some((p) => layer.tracks[p]?.length)
  const scaleLinked = layer.scaleLinked !== false
  const sizeLinked = !!layer.sizeLinked

  const kf = (g: PropGroupId) => (
    <button
      className={`icon sm kf${animated(g) ? ' on' : ''}`}
      title={animated(g) ? `${GROUP_LABEL[g]}: keyframes verwijderen` : `${GROUP_LABEL[g]} animeren: keyframe op de huidige tijd`}
      onClick={() => toggleStopwatch(layer.id, groupProps(layer, g)[0])}
    >
      ◆
    </button>
  )
  const link = (on: boolean, title: string, toggle: () => void) => (
    <button className={`icon sm link${on ? ' on' : ''}`} title={title} onClick={toggle}>
      {on ? <Link2 size={13} /> : <Link2Off size={13} />}
    </button>
  )

  return (
    <div className="transform-rows">
      <div className="trow">
        {kf('position')}
        <span className="label">Positie</span>
        <Num label="X" value={Math.round(st.x)} animated={animated('position')} onChange={set('x')} />
        <Num label="Y" value={Math.round(st.y)} animated={animated('position')} onChange={set('y')} />
      </div>
      {showSize && (
        <div className="trow">
          <span className="kf-space" />
          <span className="label">Maat</span>
          <Num
            label="B"
            value={layer.width}
            min={1}
            onChange={(v, co) =>
              up((l) => {
                if (l.sizeLinked && l.width) l.height = Math.max(1, Math.round((v * l.height) / l.width))
                l.width = v
              }, co ? 'w' : undefined)
            }
          />
          {link(sizeLinked, sizeLinked ? 'Breedte en hoogte gekoppeld' : 'Breedte en hoogte los', () => up((l) => void (l.sizeLinked = !l.sizeLinked)))}
          <Num
            label="H"
            value={layer.height}
            min={1}
            onChange={(v, co) =>
              up((l) => {
                if (l.sizeLinked && l.height) l.width = Math.max(1, Math.round((v * l.width) / l.height))
                l.height = v
              }, co ? 'h' : undefined)
            }
          />
        </div>
      )}
      <div className="trow">
        {kf('scale')}
        <span className="label">Schaal</span>
        <Num label="X%" value={Math.round(st.scale * 100)} animated={animated('scale')} min={0} max={2000} decimals={0} onChange={(v, co) => set('scale')(v / 100, co)} />
        {link(scaleLinked, scaleLinked ? 'Schaal X en Y gekoppeld (klik om los te maken)' : 'Schaal X en Y los (klik om te koppelen)', () =>
          up((l) => {
            if (l.scaleLinked === false) {
              // Koppelen: Y volgt weer X
              l.scaleLinked = true
              delete l.scaleY
              delete l.tracks.scaleY
            } else {
              // Loskoppelen: Y begint gelijk aan X (ook de keyframes)
              l.scaleLinked = false
              l.scaleY = l.scale
              if (l.tracks.scale) l.tracks.scaleY = structuredClone(l.tracks.scale)
            }
          })
        )}
        <Num
          label="Y%"
          value={Math.round(st.scaleY * 100)}
          animated={animated('scale')}
          min={0}
          max={2000}
          decimals={0}
          onChange={(v, co) => set(scaleLinked ? 'scale' : 'scaleY')(v / 100, co)}
        />
      </div>
      <div className="trow">
        {kf('rotation')}
        <span className="label">Rotatie</span>
        <Num label="°" value={Math.round(st.rotation)} animated={animated('rotation')} onChange={set('rotation')} />
      </div>
      <div className="trow">
        {kf('opacity')}
        <span className="label">Dekking</span>
        <input type="range" min={0} max={100} value={Math.round(st.opacity * 100)} onChange={(e) => setLayerValue(layer.id, 'opacity', +e.target.value / 100, 'p-opacity')} />
        <span className={animated('opacity') ? 'kf-val' : 'muted'} style={{ width: 38, textAlign: 'right', flex: '0 0 auto' }}>
          {Math.round(st.opacity * 100)}%
        </span>
      </div>
      {layerGroups(layer).includes('reveal') && (
        <div className="trow">
          {kf('reveal')}
          <span className="label">Reveal</span>
          <input type="range" min={0} max={100} value={Math.round(st.reveal * 100)} onChange={(e) => setLayerValue(layer.id, 'reveal', +e.target.value / 100, 'p-reveal')} />
          <span className={animated('reveal') ? 'kf-val' : 'muted'} style={{ width: 38, textAlign: 'right', flex: '0 0 auto' }}>
            {Math.round(st.reveal * 100)}%
          </span>
        </div>
      )}
    </div>
  )
}

function CompMotion() {
  const comp = useStore(currentComp)!
  const [preset, setPreset] = useState('slideUp')
  const selection = useStore((s) => s.selection)
  const [gap, setGap] = useState(0.2)
  return (
    <Section title="Na elkaar laten binnenkomen">
      <div className="hint-text" style={{ marginTop: 0, marginBottom: 10 }}>
        Zet op {selection.length > 1 ? 'de geselecteerde lagen' : 'alle lagen (behalve vergrendelde)'} dezelfde keyframes, van boven naar onder na
        elkaar.
      </div>
      <div className="chips">
        {LIBRARY.filter((i) => i.kind === 'intro' && !i.reveal).map((i) => (
          <button key={i.id} className={preset === i.id ? 'on' : ''} onClick={() => setPreset(i.id)}>
            {i.label}
          </button>
        ))}
      </div>
      <div className="grid2">
        <Num label="Na" title="Tijd tussen lagen" value={gap} step={0.05} min={0} max={3} decimals={2} suffix="s" onChange={(v) => setGap(v)} />
        <button className="primary" onClick={() => staggerIntros(preset, gap)}>
          <Wand2 size={14} /> Toepassen
        </button>
      </div>
      <div className="hint-text">Formaat: {comp.width}×{comp.height}. Elke laag kun je daarna los bijstellen.</div>
    </Section>
  )
}

/** "Op 2.35s": volgt de playhead (los onderdeel, zodat het paneel niet elk beeldje opnieuw tekent). */
function AtTime() {
  const time = useStore((s) => s.time)
  return <span className="label">Op {time.toFixed(2)}s</span>
}

function LayerMotion({ layer }: { layer: Layer }) {
  const [dur, setDur] = useState(0.6)

  return (
    <>
      <SavePreset layer={layer} />

      <Section id="keyframes" title={<><Timer size={13} /> Keyframes</>}>
        <div className="hint-text" style={{ marginTop: 0, marginBottom: 8 }}>
          Klik op ◆ om een eigenschap te animeren; elke wijziging zet dan een keyframe op de playhead. Positie zet X én Y tegelijk. Een preset uit het paneel
          Animaties (klik of sleep op de laag) zet ook gewone keyframes, vanaf de playhead.
        </div>
        <TransformRows layer={layer} showSize={false} />
        {layer.type !== 'writeon' && (
          <Row label="Wipe">
            <select
              value={layer.revealMode}
              onChange={(e) =>
                updateLayer(layer.id, (l) => {
                  l.revealMode = e.target.value as RevealMode
                  if (l.revealMode === 'none') delete l.tracks.reveal
                })
              }
            >
              <option value="none">Geen</option>
              <option value="wipeLeft">Van links</option>
              <option value="wipeRight">Van rechts</option>
              <option value="wipeUp">Van onder</option>
              <option value="wipeDown">Van boven</option>
              {layer.shape && layer.shape.strokeWidth > 0 && <option value="draw">Lijn tekenen</option>}
            </select>
          </Row>
        )}
      </Section>

      <Section title="Extra effecten" defaultOpen={false}>
        <div className="row">
          <AtTime />
          <div className="grow">
            <Num label="Duur" value={dur} step={0.05} min={0.05} max={10} decimals={2} suffix="s" onChange={(v) => setDur(v)} />
          </div>
        </div>
        <div className="chips">
          {PRESETS.filter((p) => ['pulse', 'wipeLeft', 'wipeUp', 'writeOn', 'fadeOut'].includes(p.id)).map((p) => (
            <button key={p.id} onClick={() => applyPreset(p.id, useStore.getState().time, dur)}>
              {p.label}
            </button>
          ))}
        </div>
      </Section>
    </>
  )
}

function SavePreset({ layer }: { layer: Layer }) {
  const [name, setName] = useState('')
  const has = !!(layer.intro || layer.outro || layer.emphasis || Object.keys(layer.tracks).length)
  if (!has) return null
  return (
    <div className="section">
      <div className="row" style={{ marginBottom: 0 }}>
        <div className="grow">
          <input placeholder="Naam voor preset…" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <button
          className="ghost"
          disabled={!name.trim()}
          onClick={() => {
            void savePresetFromLayer(layer.id, name.trim())
            setName('')
          }}
        >
          <BookmarkPlus size={13} /> Opslaan als preset
        </button>
      </div>
    </div>
  )
}

/** Extra lijn-opties van een vorm: positie, stippellijn, uiteinden en de lijn laten tekenen. */
function StrokeRows({ layer }: { layer: Layer }) {
  const sh = layer.shape!
  const up = (fn: (l: Layer) => void, co?: string) => updateLayer(layer.id, fn, co)
  const isPath = sh.kind === 'path'
  const dash = sh.strokeDash ?? null
  const open = isPath && !sh.path?.closed
  return (
    <>
      {!isPath && (
        <div className="row">
          <span className="label">Positie</span>
          <div className="seg grow stroke-align">
            {(
              [
                ['inside', 'Binnen'],
                ['center', 'Midden'],
                ['outside', 'Buiten']
              ] as const
            ).map(([v, label]) => (
              <button key={v} className={(sh.strokeAlign ?? 'inside') === v ? 'on' : ''} onClick={() => up((l) => void (l.shape!.strokeAlign = v))}>
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="row">
        <span className="label">Stippel</span>
        <Switch
          checked={!!dash}
          onChange={(v) => up((l) => void (l.shape!.strokeDash = v ? [Math.max(2, Math.round(l.shape!.strokeWidth * 3)), Math.max(2, Math.round(l.shape!.strokeWidth * 2))] : null))}
        />
        {dash && (
          <>
            <div className="grow">
              <Num label="Streep" title="Lengte van een streep (0 met ronde uiteinden = stippen)" value={dash[0]} min={0} max={200} step={1} decimals={1} onChange={(v, co) => up((l) => void (l.shape!.strokeDash = [v, l.shape!.strokeDash?.[1] ?? v]), co ? 'sd0' : undefined)} />
            </div>
            <div className="grow">
              <Num label="Gat" title="Ruimte tussen de strepen" value={dash[1]} min={0.5} max={200} step={1} decimals={1} onChange={(v, co) => up((l) => void (l.shape!.strokeDash = [l.shape!.strokeDash?.[0] ?? v, v]), co ? 'sd1' : undefined)} />
            </div>
          </>
        )}
      </div>
      {(open || dash || isPath || (sh.strokeAlign && sh.strokeAlign !== 'inside')) && (
        <div className="row">
          <span className="label">Uiteinden</span>
          <div className="seg grow stroke-cap">
            <button className={sh.strokeCap !== 'butt' ? 'on' : ''} onClick={() => up((l) => void (l.shape!.strokeCap = 'round'))}>
              Rond
            </button>
            <button className={sh.strokeCap === 'butt' ? 'on' : ''} onClick={() => up((l) => void (l.shape!.strokeCap = 'butt'))}>
              Recht
            </button>
          </div>
        </div>
      )}
      <div className="row">
        <span className="label">Animatie</span>
        <button className="ghost sm grow" title="De lijn tekent zich vanaf de playhead in 1 seconde (keyframes op Reveal, aan te passen in de tijdlijn)" onClick={() => animateStrokeDraw(layer.id)}>
          <PenLine size={13} /> Lijn laten tekenen
        </button>
      </div>
      {layer.revealMode === 'draw' && dash && <div className="hint-text">Tijdens het tekenen wordt de lijn doorgetrokken getoond; stippels gaan niet samen met tekenen.</div>}
    </>
  )
}

function CodeField(props: { label: string; value: string; onCommit: (v: string) => void }) {
  const [v, setV] = useState(props.value)
  useEffect(() => setV(props.value), [props.value])
  return (
    <label className="code-field">
      <span className="faint">{props.label}</span>
      <textarea className="code-area" rows={6} spellCheck={false} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== props.value && props.onCommit(v)} />
    </label>
  )
}

function AiPanel() {
  const selection = useStore((s) => s.selection)
  const selectedCode = useStore((s) => {
    const c = currentComp(s)
    return s.selection.length === 1 && !!c && findDeep(c.layers, s.selection[0])?.layer.type === 'code'
  })
  const [mode, setMode] = useState<'element' | 'animate'>('element')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [explain, setExplain] = useState<string | null>(null)
  const run = async () => {
    setBusy(true)
    setExplain(null)
    setExplain(await (mode === 'element' ? aiCodeElement(prompt) : aiAnimate(prompt)))
    setBusy(false)
  }
  const examples =
    mode === 'element'
      ? selectedCode
        ? ['Maak hem twee keer zo snel', 'Gebruik de kleuren van de banner', 'Laat hem na 3 seconden stoppen']
        : [
            'Een laadsymbool met drie stippen die op en neer stuiteren',
            'Een cirkelvormige loader die draait',
            'Een glans die schuin over de knop schuift',
            'Een pijltje naar rechts dat zachtjes heen en weer beweegt',
            'Confetti die naar beneden dwarrelt'
          ]
      : [
          'Laat de headline letter voor letter inschrijven',
          'Rustige premium intro, alles binnen 3 seconden in beeld',
          'CTA na 4 seconden twee keer laten pulseren',
          'Packshot met een kleine zoom-in en lichte rotatie'
        ]
  return (
    <Section title={<><Sparkles size={13} /> AI</>}>
      <div className="seg ai-mode" style={{ marginBottom: 8 }}>
        <button className={mode === 'element' ? 'on' : ''} onClick={() => setMode('element')} title="De AI schrijft animatiecode (HTML/SVG + CSS) als nieuw element">
          {selectedCode ? 'Element aanpassen' : 'Nieuw element'}
        </button>
        <button className={mode === 'animate' ? 'on' : ''} onClick={() => setMode('animate')} title="De AI zet keyframes op je bestaande lagen">
          Lagen animeren
        </button>
      </div>
      <textarea
        rows={4}
        placeholder={mode === 'element' ? (selectedCode ? 'Wat moet er anders aan dit element?' : 'Beschrijf het bewegende element, bijv. een laadsymbool…') : 'Beschrijf de animatie…'}
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim() && !busy && run()}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <span className="faint grow">
          {mode === 'element' ? (selectedCode ? 'Past het geselecteerde code-element aan' : 'Komt als nieuwe laag in het midden') : selection.length ? `${selection.length} laag/lagen geselecteerd` : 'Hele formaat'}
        </span>
        <button className="primary" disabled={busy || !prompt.trim()} onClick={run}>
          {busy ? 'Bezig…' : mode === 'element' ? (selectedCode ? 'Aanpassen' : 'Maak element') : 'Genereer'}
        </button>
      </div>
      {explain && <div className="hint-text">{explain}</div>}
      <div className="hint-text" style={{ marginTop: 14, marginBottom: 6 }}>
        Voorbeelden
      </div>
      <div className="list">
        {examples.map((e) => (
          <div key={e} className="list-item" onClick={() => setPrompt(e)}>
            <span className="grow muted">{e}</span>
          </div>
        ))}
      </div>
    </Section>
  )
}

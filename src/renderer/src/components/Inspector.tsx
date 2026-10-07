import { useState } from 'react'
import { BookmarkPlus, Folder, Image as ImageIcon, Link2, Link2Off, ListOrdered, PenLine, RotateCcw, Sparkles, Square, Timer, Trash2, Type, Wand2, X } from 'lucide-react'
import { layerStateAt } from '@shared/anim'
import { applyLibraryItem, LIBRARY, matchLibraryItem } from '@shared/library'
import { defaultIntro, defaultOutro } from '@shared/motion'
import { baseComp, isLinkedToBase, overrideLabel } from '@shared/sync'
import { GROUP_LABEL, groupProps, layerGroups, type PropGroupId } from '@shared/propgroups'
import { findDeep, layerLength, trimIn, trimOut } from '@shared/tree'
import { PRESETS } from '@shared/presets'
import { TARGET_IDS, TARGETS } from '@shared/specs'
import { exitLayers } from '@shared/build'
import type { AnimProp, EaseName, Emphasis, EmphasisType, Layer, Motion, RevealMode } from '@shared/types'
import { EASES } from '@shared/types'
import {
  aiAnimate,
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
import { currentComp, layerLocalTime, setLayerValue, toggleStopwatch, updateComp, updateLayer, useStore } from '../store'
import { AlignBar } from './AlignBar'
import { FontPicker } from './FontPicker'
import { Num, Row, Scrub, Section, Switch, TextInput } from './ui'

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

const TYPE_ICON = { text: Type, image: ImageIcon, shape: Square, writeon: PenLine, group: Folder }

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
    <div className="panel-scroll">
      <FormatNotice />
      {count > 0 && <AlignBar count={count} />}
      {layer ? <LayerDesign layer={layer} /> : count > 1 ? <Multi n={count} /> : <CompDesign />}
    </div>
  )
}

/** Paneel "Animatie": binnenkomst, accent, uitgang en keyframes. */
export function MotionPanel() {
  const { layer } = useSelectedLayer()
  return (
    <div className="panel-scroll">
      <FormatNotice />
      {layer ? <LayerMotion layer={layer} /> : <CompMotion />}
    </div>
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
        <Row label="Achtergrond">
          <input type="color" value={comp.background} onChange={(e) => updateComp((c) => void (c.background = e.target.value), 'bg')} />
          <TextInput value={comp.background} onCommit={(v) => updateComp((c) => void (c.background = v))} />
        </Row>
        <Row label="Rand">
          <Switch
            checked={!!comp.border && comp.border.width > 0}
            onChange={(on) => updateComp((c) => void (c.border = on ? { color: '#cccccc', width: 1 } : null))}
          />
          {comp.border && (
            <>
              <input type="color" value={comp.border.color} onChange={(e) => updateComp((c) => void (c.border!.color = e.target.value), 'bc')} />
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
  const time = useStore((s) => s.time)
  const project = useStore((s) => s.project)!
  const project_ = useStore.getState().project!
  const st = layerStateAt(layer, layerLocalTime(project_, useStore.getState().compId, layer.id, time))
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
      <Section title={<Icon size={14} />} actions={<span className="faint">{{ text: 'Tekst', image: 'Afbeelding', shape: 'Vorm', writeon: 'Write-on', group: 'Compositie' }[layer.type]}</span>}>
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
            <input type="color" value={layer.text.color} onChange={(e) => up((l) => void (l.text!.color = e.target.value), 'tc')} />
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
                <button key={a} className={layer.text!.align === a ? 'on' : ''} onClick={() => up((l) => void (l.text!.align = a))} style={{ flex: 1, padding: 0 }}>
                  {a === 'left' ? '⇤' : a === 'center' ? '↔' : '⇥'}
                </button>
              ))}
            </div>
            <Num label="↕" title="Regelhoogte" value={layer.text.lineHeight} step={0.01} min={0.5} max={3} decimals={2} onChange={(v, co) => up((l) => void (l.text!.lineHeight = v), co ? 'lh' : undefined)} />
            <Num label="↔" title="Letterspatiëring" value={layer.text.letterSpacing} step={0.1} decimals={1} onChange={(v, co) => up((l) => void (l.text!.letterSpacing = v), co ? 'ls' : undefined)} />
          </div>
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
            <input type="color" value={layer.writeon.color} onChange={(e) => up((l) => void (l.writeon!.color = e.target.value), 'wc')} />
            <div className="grow">
              <Num label="Lijn" value={layer.writeon.strokeWidth} step={0.1} min={0} max={20} decimals={1} onChange={(v, co) => up((l) => void (l.writeon!.strokeWidth = v), co ? 'wsw' : undefined)} />
            </div>
            <div className="grow">
              <Num label="Vul" title="Hoe snel de vulling na de lijn komt (0 = alleen lijn)" value={layer.writeon.fillAfter} step={0.01} min={0} max={1} decimals={2} onChange={(v, co) => up((l) => void (l.writeon!.fillAfter = v), co ? 'wf' : undefined)} />
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
          <div className="row">
            <span className="label">Vulling</span>
            <Switch checked={layer.shape.fillEnabled !== false} onChange={(v) => up((l) => void (l.shape!.fillEnabled = v))} />
            {layer.shape.fillEnabled !== false && (
              <>
                <input type="color" value={layer.shape.fill} onChange={(e) => up((l) => void (l.shape!.fill = e.target.value), 'sf')} />
                <div className="grow">
                  <TextInput value={layer.shape.fill} onCommit={(v) => up((l) => void (l.shape!.fill = v))} />
                </div>
              </>
            )}
          </div>
          <div className="row">
            <span className="label">Lijn</span>
            <Switch
              checked={layer.shape.strokeWidth > 0}
              onChange={(v) => up((l) => void (l.shape!.strokeWidth = v ? Math.max(1, l.shape!.strokeWidth || 2) : 0))}
            />
            {layer.shape.strokeWidth > 0 && (
              <>
                <input type="color" value={layer.shape.strokeColor} onChange={(e) => up((l) => void (l.shape!.strokeColor = e.target.value), 'sc')} />
                <div className="grow">
                  <Num label="px" value={layer.shape.strokeWidth} min={0.5} max={50} step={0.5} decimals={1} onChange={(v, co) => up((l) => void (l.shape!.strokeWidth = v), co ? 'ss' : undefined)} />
                </div>
              </>
            )}
          </div>
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
      <ExitSection layer={layer} />
    </>
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
    <Section title="Alles laten binnenkomen">
      <div className="hint-text" style={{ marginTop: 0, marginBottom: 10 }}>
        Geeft {selection.length > 1 ? 'de geselecteerde lagen' : 'alle lagen (behalve vergrendelde)'} dezelfde binnenkomst, van boven naar onder
        na elkaar.
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

function LayerMotion({ layer }: { layer: Layer }) {
  const comp = useStore(currentComp)!
  const time = useStore((s) => s.time)
  const project_ = useStore.getState().project!
  const st = layerStateAt(layer, layerLocalTime(project_, useStore.getState().compId, layer.id, time))
  const [dur, setDur] = useState(0.6)
  const canReveal = layer.type === 'writeon' || layer.revealMode !== 'none'

  const setMotion = (kind: 'intro' | 'outro', m: Motion | null, co?: string) =>
    updateLayer(layer.id, (l) => void (l[kind] = m), co)
  const pick = (id: string) => {
    const item = LIBRARY.find((i) => i.id === id)!
    updateLayer(layer.id, (l) => applyLibraryItem(l, item, comp))
  }

  return (
    <>
      <MotionCard
        kind="intro"
        title="Binnenkomst"
        motion={layer.intro ?? null}
        canReveal={canReveal}
        onToggle={(on) => setMotion('intro', on ? defaultIntro(layer) : null)}
        onChange={(m, co) => setMotion('intro', m, co)}
        onPick={pick}
        active={matchLibraryItem(layer, 'intro')}
      />
      <EmphasisCard layer={layer} onPick={pick} />
      <MotionCard
        kind="outro"
        title="Uitgang"
        motion={layer.outro ?? null}
        canReveal={canReveal}
        onToggle={(on) => setMotion('outro', on ? defaultOutro(comp) : null)}
        onChange={(m, co) => setMotion('outro', m, co)}
        onPick={pick}
        active={matchLibraryItem(layer, 'outro')}
      />
      {layer.outro && (
        <div className="hint-text" style={{ padding: '0 12px 8px' }}>
          De laatste loop stopt vóór de uitgang, zodat het eindbeeld (en de backup) alles toont.
        </div>
      )}

      <SavePreset layer={layer} />

      <Section title={<><Timer size={13} /> Keyframes</>} defaultOpen={Object.keys(layer.tracks).length > 0}>
        <div className="hint-text" style={{ marginTop: 0, marginBottom: 8 }}>
          Klik op ◆ om een eigenschap te animeren; elke wijziging zet dan een keyframe op de huidige tijd. Positie zet X én Y tegelijk. Eigen keyframes gaan
          vóór de binnenkomst/uitgang.
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
            </select>
          </Row>
        )}
      </Section>

      <Section title="Extra effecten" defaultOpen={false}>
        <div className="row">
          <span className="label">Op {time.toFixed(2)}s</span>
          <div className="grow">
            <Num label="Duur" value={dur} step={0.05} min={0.05} max={10} decimals={2} suffix="s" onChange={(v) => setDur(v)} />
          </div>
        </div>
        <div className="chips">
          {PRESETS.filter((p) => ['pulse', 'wipeLeft', 'wipeUp', 'writeOn', 'fadeOut'].includes(p.id)).map((p) => (
            <button key={p.id} onClick={() => applyPreset(p.id, time, dur)}>
              {p.label}
            </button>
          ))}
        </div>
      </Section>
    </>
  )
}

function MotionCard(props: {
  kind: 'intro' | 'outro'
  title: string
  motion: Motion | null
  canReveal: boolean
  onToggle: (on: boolean) => void
  onChange: (m: Motion, coalesce?: string) => void
  onPick: (libraryId: string) => void
  active: string | null
}) {
  const { kind, motion: m, canReveal } = props
  const set = (patch: Partial<Motion>, co?: string) => m && props.onChange({ ...m, ...patch }, co)
  const active = props.active

  return (
    <div className="section">
      <div className={`motion-card ${kind}`}>
        <div className="row" style={{ marginBottom: m ? 10 : 0 }}>
          <span className="grow" style={{ fontWeight: 600 }}>
            {props.title}
          </span>
          <Switch checked={!!m} onChange={props.onToggle} />
        </div>
        {m && (
          <>
            <div className="chips">
              {LIBRARY.filter((i) => i.kind === kind && (!i.reveal || canReveal || i.reveal !== 'writeon')).map((i) => (
                <button key={i.id} className={active === i.id ? 'on' : ''} onClick={() => props.onPick(i.id)}>
                  {i.label}
                </button>
              ))}
            </div>
            <div className="grid2">
              <Num label="Start" value={m.start} step={0.05} min={0} max={30} decimals={2} suffix="s" onChange={(v, co) => set({ start: v }, co ? `${kind}-s` : undefined)} />
              <Num label="Duur" value={m.duration} step={0.05} min={0.05} max={10} decimals={2} suffix="s" onChange={(v, co) => set({ duration: v }, co ? `${kind}-d` : undefined)} />
            </div>
            <select value={m.ease} onChange={(e) => set({ ease: e.target.value as EaseName })} style={{ marginBottom: 6 }}>
              {EASES.filter((e) => e !== 'hold').map((e) => (
                <option key={e} value={e}>
                  {EASE_LABEL[e]}
                </option>
              ))}
            </select>
            <div className="grid2">
              <Num label="↔" title="Verschuiving X (px)" value={m.dx} onChange={(v, co) => set({ dx: v }, co ? `${kind}-dx` : undefined)} />
              <Num label="↕" title="Verschuiving Y (px)" value={m.dy} onChange={(v, co) => set({ dy: v }, co ? `${kind}-dy` : undefined)} />
            </div>
            <div className="grid2">
              <Num label="%" title="Schaal" value={Math.round(m.scale * 100)} min={0} max={500} onChange={(v, co) => set({ scale: v / 100 }, co ? `${kind}-sc` : undefined)} />
              <Num label="°" title="Rotatie" value={m.rotation} onChange={(v, co) => set({ rotation: v }, co ? `${kind}-r` : undefined)} />
            </div>
            <Row label="Fade">
              <Switch checked={m.fade} onChange={(v) => set({ fade: v })} />
            </Row>
          </>
        )}
      </div>
    </div>
  )
}

/** Animatie van deze laag bewaren als eigen preset in de bibliotheek. */
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

function EmphasisCard({ layer, onPick }: { layer: Layer; onPick: (id: string) => void }) {
  const em = layer.emphasis
  const comp = useStore(currentComp)!
  const set = (patch: Partial<Emphasis>, co?: string) => em && updateLayer(layer.id, (l) => void (l.emphasis = { ...em, ...patch }), co)
  return (
    <div className="section">
      <div className="motion-card emphasis">
        <div className="row" style={{ marginBottom: em ? 10 : 0 }}>
          <span className="grow" style={{ fontWeight: 600 }}>
            Accent
          </span>
          <Switch
            checked={!!em}
            onChange={(on) =>
              updateLayer(layer.id, (l) => {
                l.emphasis = on ? { type: 'pulse', start: Math.min(3, Math.max(0, comp.duration - 2)), duration: 1, repeat: 2, strength: 1 } : null
              })
            }
          />
        </div>
        {em && (
          <>
            <div className="chips">
              {LIBRARY.filter((i) => i.kind === 'emphasis').map((i) => (
                <button key={i.id} className={em.type === (i.emphasis as EmphasisType) ? 'on' : ''} onClick={() => onPick(i.id)}>
                  {i.label}
                </button>
              ))}
            </div>
            <div className="grid2">
              <Num label="Start" value={em.start} step={0.05} min={0} max={30} decimals={2} suffix="s" onChange={(v, co) => set({ start: v }, co ? 'em-s' : undefined)} />
              <Num label="Duur" value={em.duration} step={0.05} min={0.1} max={10} decimals={2} suffix="s" onChange={(v, co) => set({ duration: v }, co ? 'em-d' : undefined)} />
            </div>
            <div className="grid2">
              <Num label="×" title="Herhalingen" value={em.repeat} min={1} max={10} onChange={(v, co) => set({ repeat: Math.round(v) }, co ? 'em-r' : undefined)} />
              <Num label="Kracht" value={em.strength} step={0.1} min={0.1} max={5} decimals={1} onChange={(v, co) => set({ strength: v }, co ? 'em-k' : undefined)} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ---------------- AI ----------------

function AiPanel() {
  const selection = useStore((s) => s.selection)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)
  const [explain, setExplain] = useState<string | null>(null)
  const run = async () => {
    setBusy(true)
    setExplain(null)
    setExplain(await aiAnimate(prompt))
    setBusy(false)
  }
  const examples = [
    'Laat de headline letter voor letter inschrijven',
    'Rustige premium intro, alles binnen 3 seconden in beeld',
    'CTA na 4 seconden twee keer laten pulseren',
    'Packshot met een kleine zoom-in en lichte rotatie'
  ]
  return (
    <Section title={<><Sparkles size={13} /> Animeren met AI</>}>
      <textarea
        rows={4}
        placeholder="Beschrijf de animatie…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim() && !busy && run()}
      />
      <div className="row" style={{ marginTop: 8 }}>
        <span className="faint grow">{selection.length ? `${selection.length} laag/lagen geselecteerd` : 'Hele formaat'}</span>
        <button className="primary" disabled={busy || !prompt.trim()} onClick={run}>
          {busy ? 'Bezig…' : 'Genereer'}
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

import { useState } from 'react'
import { Image as ImageIcon, PenLine, RotateCcw, Sparkles, Square, Timer, Trash2, Type, Wand2, X } from 'lucide-react'
import { layerStateAt } from '@shared/anim'
import { applyLibraryItem, LIBRARY, matchLibraryItem } from '@shared/library'
import { defaultIntro, defaultOutro } from '@shared/motion'
import { baseComp, isLinkedToBase, overrideLabel } from '@shared/sync'
import { PRESETS } from '@shared/presets'
import { TARGET_IDS, TARGETS } from '@shared/specs'
import type { AnimProp, EaseName, Emphasis, EmphasisType, Layer, Motion, RevealMode } from '@shared/types'
import { EASES } from '@shared/types'
import {
  aiAnimate,
  applyPreset,
  deleteComposition,
  regenerateWriteOn,
  resetCompositionOverrides,
  resetLayerOverrides,
  staggerIntros
} from '../lib/actions'
import { currentComp, setLayerValue, toggleStopwatch, updateComp, updateLayer, useStore } from '../store'
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

const TYPE_ICON = { text: Type, image: ImageIcon, shape: Square, writeon: PenLine }

export function Inspector() {
  const tab = useStore((s) => s.tab)
  const comp = useStore(currentComp)!
  const selection = useStore((s) => s.selection)
  const layer = selection.length === 1 ? comp.layers.find((l) => l.id === selection[0]) : undefined
  const setTab = useStore.getState().setTab

  return (
    <div className="inspector">
      <div className="tabs">
        <button className={tab === 'design' ? 'on' : ''} onClick={() => setTab('design')}>
          Ontwerp
        </button>
        <button className={tab === 'motion' ? 'on' : ''} onClick={() => setTab('motion')}>
          Animatie
        </button>
        <button className={tab === 'ai' ? 'on' : ''} onClick={() => setTab('ai')}>
          <Sparkles size={13} /> AI
        </button>
      </div>
      <div className="scroll">
        <FormatNotice />
        {tab === 'design' && (layer ? <LayerDesign layer={layer} /> : selection.length > 1 ? <Multi n={selection.length} /> : <CompDesign />)}
        {tab === 'motion' && (layer ? <LayerMotion layer={layer} /> : <CompMotion />)}
        {tab === 'ai' && <AiPanel />}
      </div>
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
  return (
    <Section title={`${n} lagen geselecteerd`}>
      <div className="hint-text">Sleep in het canvas om ze samen te verplaatsen. In de tab Animatie kun je ze in één keer laten binnenkomen.</div>
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
          <TextInput value={project.clickTag} placeholder="https://" onCommit={(v) => update((p) => void (p.clickTag = v.trim()))} />
        </Row>
        <Row label="Polite load">
          <Switch checked={project.politeLoad} onChange={(v) => update((p) => void (p.politeLoad = v))} />
          <span className="faint">afbeeldingen na page load</span>
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
  const st = layerStateAt(layer, time)
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
      <Section title={<Icon size={14} />} actions={<span className="faint">{{ text: 'Tekst', image: 'Afbeelding', shape: 'Vorm', writeon: 'Write-on' }[layer.type]}</span>}>
        <TextInput value={layer.name} onCommit={(v) => up((l) => void (l.name = v))} />
      </Section>

      {layer.text && (
        <Section title="Tekst">
          <TextInput multiline value={layer.text.content} onCommit={(v) => up((l) => void (l.text!.content = v))} />
          <div style={{ height: 6 }} />
          <select value={layer.text.fontId ?? ''} onChange={(e) => up((l) => void (l.text!.fontId = e.target.value || null))} style={{ marginBottom: 6 }}>
            <option value="">Arial (systeem)</option>
            {fonts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.family} {f.weight}
                {f.style === 'italic' ? ' italic' : ''}
              </option>
            ))}
          </select>
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
          <select
            value={layer.writeon.fontId ?? ''}
            onChange={(e) => {
              up((l) => void (l.writeon!.fontId = e.target.value || null))
              void regenerateWriteOn(layer.id)
            }}
            style={{ marginBottom: 6 }}
          >
            <option value="">Kies een font…</option>
            {fonts.map((f) => (
              <option key={f.id} value={f.id}>
                {f.family} {f.weight}
              </option>
            ))}
          </select>
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
            <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {layer.image.src.replace(/^assets\//, '') || '—'}
            </span>
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
          <div className="row">
            <input type="color" value={layer.shape.fill} onChange={(e) => up((l) => void (l.shape!.fill = e.target.value), 'sf')} />
            <div className="grow">
              <TextInput value={layer.shape.fill} onCommit={(v) => up((l) => void (l.shape!.fill = v))} />
            </div>
            <div style={{ width: 80 }}>
              <Num label="◜" title="Hoekradius" value={layer.shape.radius} min={0} max={1000} onChange={(v, co) => up((l) => void (l.shape!.radius = v), co ? 'sr' : undefined)} />
            </div>
          </div>
          <div className="row">
            <input type="color" value={layer.shape.strokeColor} onChange={(e) => up((l) => void (l.shape!.strokeColor = e.target.value), 'sc')} />
            <div className="grow">
              <Num label="Rand" value={layer.shape.strokeWidth} min={0} max={50} suffix="px" onChange={(v, co) => up((l) => void (l.shape!.strokeWidth = v), co ? 'ss' : undefined)} />
            </div>
          </div>
        </Section>
      )}

      <Section title="Positie en maat">
        <div className="grid2">
          <Num label="X" value={st.x} animated={anim('x')} onChange={set('x')} />
          <Num label="Y" value={st.y} animated={anim('y')} onChange={set('y')} />
        </div>
        <div className="grid2">
          <Num label="B" value={layer.width} min={1} onChange={(v, co) => up((l) => void (l.width = v), co ? 'w' : undefined)} />
          <Num label="H" value={layer.height} min={1} onChange={(v, co) => up((l) => void (l.height = v), co ? 'h' : undefined)} />
        </div>
        <div className="grid2">
          <Num label="°" title="Rotatie" value={st.rotation} animated={anim('rotation')} onChange={set('rotation')} />
          <Num label="%" title="Schaal" value={Math.round(st.scale * 100)} animated={anim('scale')} min={0} max={1000} onChange={(v, co) => set('scale')(v / 100, co)} />
        </div>
        <Row label="Dekking">
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(st.opacity * 100)}
            onChange={(e) => setLayerValue(layer.id, 'opacity', +e.target.value / 100, 'p-opacity')}
          />
          <span className="muted" style={{ width: 34, textAlign: 'right' }}>
            {Math.round(st.opacity * 100)}%
          </span>
        </Row>
        <Row label="CTA-hover">
          <Switch checked={layer.cta} onChange={(v) => up((l) => void (l.cta = v))} />
        </Row>
      </Section>
    </>
  )
}

// ---------------- Animatie ----------------

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
  const st = layerStateAt(layer, time)
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

      <Section title={<><Timer size={13} /> Keyframes</>} defaultOpen={Object.keys(layer.tracks).length > 0}>
        <div className="hint-text" style={{ marginTop: 0, marginBottom: 8 }}>
          Voor eigen bewegingen: klik op ◆ om een eigenschap te animeren. Een keyframe op een eigenschap gaat vóór de binnenkomst/uitgang.
        </div>
        {(
          [
            ['x', 'Positie X', 1, undefined, undefined, 0],
            ['y', 'Positie Y', 1, undefined, undefined, 0],
            ['scale', 'Schaal', 0.01, 0, 10, 2],
            ['rotation', 'Rotatie', 1, undefined, undefined, 0],
            ['opacity', 'Dekking', 0.01, 0, 1, 2],
            ['reveal', 'Reveal', 0.01, 0, 1, 2]
          ] as [AnimProp, string, number, number | undefined, number | undefined, number][]
        )
          .filter(([p]) => p !== 'reveal' || canReveal)
          .map(([p, label, step, min, max, decimals]) => {
            const on = !!layer.tracks[p]?.length
            return (
              <div className="row" key={p}>
                <button
                  className={`icon sm${on ? ' on' : ''}`}
                  style={on ? { color: 'var(--key)', background: 'rgba(242,193,78,.12)' } : undefined}
                  title={on ? 'Keyframes verwijderen' : 'Animeren vanaf hier'}
                  onClick={() => toggleStopwatch(layer.id, p, st[p])}
                >
                  ◆
                </button>
                <span className="label">{label}</span>
                <div className="grow">
                  <Scrub value={st[p]} step={step} min={min} max={max} decimals={decimals} animated={on} onChange={(v, co) => setLayerValue(layer.id, p, v, co ? `p-${p}` : undefined)} />
                </div>
              </div>
            )
          })}
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

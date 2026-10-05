import { useState } from 'react'
import { layerStateAt } from '@shared/anim'
import { PRESETS } from '@shared/presets'
import { TARGET_IDS, TARGETS } from '@shared/specs'
import type { AnimProp, Layer, RevealMode } from '@shared/types'
import { aiAnimate, applyPreset, regenerateWriteOn } from '../lib/actions'
import { currentComp, setLayerValue, toggleStopwatch, updateComp, updateLayer, useStore } from '../store'
import { Field, Scrub, Section, TextInput } from './ui'

export function Inspector() {
  const comp = useStore(currentComp)!
  const selection = useStore((s) => s.selection)
  const layer = selection.length === 1 ? comp.layers.find((l) => l.id === selection[0]) : undefined

  return (
    <div className="panel right">
      {layer ? <LayerProps layer={layer} /> : selection.length > 1 ? <MultiInfo n={selection.length} /> : <CompProps />}
      <Effects />
      <AiPanel />
    </div>
  )
}

function MultiInfo({ n }: { n: number }) {
  return (
    <Section title="Selectie">
      <div className="muted">{n} lagen geselecteerd. Effecten en AI werken op alle geselecteerde lagen.</div>
    </Section>
  )
}

function CompProps() {
  const project = useStore((s) => s.project)!
  const comp = useStore(currentComp)!
  const update = useStore((s) => s.update)
  return (
    <>
      <Section title="Compositie">
        <Field label="Naam">
          <TextInput value={comp.name} onCommit={(v) => updateComp((c) => void (c.name = v))} />
        </Field>
        <Field label="Formaat">
          <Scrub value={comp.width} min={10} max={2000} onChange={(v, co) => updateComp((c) => void (c.width = v), co ? 'cw' : undefined)} />
          <span className="muted" style={{ flex: '0 0 auto' }}>×</span>
          <Scrub value={comp.height} min={10} max={2000} onChange={(v, co) => updateComp((c) => void (c.height = v), co ? 'ch' : undefined)} />
        </Field>
        <Field label="Duur (s)">
          <Scrub value={comp.duration} step={0.1} min={0.5} max={30} decimals={1} onChange={(v, co) => updateComp((c) => void (c.duration = v), co ? 'cd' : undefined)} />
        </Field>
        <Field label="Afspelen">
          <select value={comp.loops} onChange={(e) => updateComp((c) => void (c.loops = +e.target.value))}>
            <option value={1}>1× (geen loop)</option>
            <option value={2}>2×</option>
            <option value={3}>3× (max. IAB/Google)</option>
          </select>
        </Field>
        <Field label="Achtergrond">
          <input type="color" value={comp.background} onChange={(e) => updateComp((c) => void (c.background = e.target.value), 'bg')} />
          <TextInput value={comp.background} onCommit={(v) => updateComp((c) => void (c.background = v))} />
        </Field>
        <Field label="Rand">
          <input
            type="checkbox"
            checked={!!comp.border && comp.border.width > 0}
            onChange={(e) => updateComp((c) => void (c.border = e.target.checked ? { color: '#cccccc', width: 1 } : null))}
          />
          {comp.border && (
            <>
              <input type="color" value={comp.border.color} onChange={(e) => updateComp((c) => void (c.border!.color = e.target.value), 'bc')} />
              <Scrub value={comp.border.width} min={1} max={10} onChange={(v, co) => updateComp((c) => void (c.border!.width = v), co ? 'bw' : undefined)} suffix="px" />
            </>
          )}
        </Field>
      </Section>
      <Section title="Project">
        <Field label="Projectnaam">
          <TextInput value={project.name} onCommit={(v) => update((p) => void (p.name = v))} />
        </Field>
        <Field label="clickTag-URL">
          <TextInput value={project.clickTag} placeholder="https://" onCommit={(v) => update((p) => void (p.clickTag = v.trim()))} />
        </Field>
        <div className="muted" style={{ margin: '6px 0 4px' }}>Standaard exportplatform(s)</div>
        {TARGET_IDS.map((t) => (
          <label key={t} className="list-item" style={{ cursor: 'pointer' }}>
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
      </Section>
    </>
  )
}

const PROPS: { prop: AnimProp; label: string; step: number; min?: number; max?: number; decimals?: number; suffix?: string }[] = [
  { prop: 'x', label: 'Positie X', step: 1 },
  { prop: 'y', label: 'Positie Y', step: 1 },
  { prop: 'scale', label: 'Schaal', step: 0.01, min: 0, max: 10, decimals: 2 },
  { prop: 'rotation', label: 'Rotatie', step: 1, suffix: '°' },
  { prop: 'opacity', label: 'Dekking', step: 0.01, min: 0, max: 1, decimals: 2 },
  { prop: 'reveal', label: 'Reveal', step: 0.01, min: 0, max: 1, decimals: 2 }
]

function LayerProps({ layer }: { layer: Layer }) {
  const time = useStore((s) => s.time)
  const project = useStore((s) => s.project)!
  const st = layerStateAt(layer, time)
  const up = (fn: (l: Layer) => void, co?: string) => updateLayer(layer.id, fn, co)
  const fonts = project.fonts

  return (
    <>
      <Section title={{ text: 'Tekstlaag', image: 'Afbeeldingslaag', shape: 'Vormlaag', writeon: 'Write-on laag' }[layer.type]}>
        <Field label="Naam">
          <TextInput value={layer.name} onCommit={(v) => up((l) => void (l.name = v))} />
        </Field>
        <Field label="Breedte × hoogte">
          <Scrub value={layer.width} min={1} onChange={(v, co) => up((l) => void (l.width = v), co ? 'w' : undefined)} />
          <Scrub value={layer.height} min={1} onChange={(v, co) => up((l) => void (l.height = v), co ? 'h' : undefined)} />
        </Field>
        <Field label="CTA (hover)">
          <input type="checkbox" checked={layer.cta} onChange={(e) => up((l) => void (l.cta = e.target.checked))} />
          <span className="muted">licht op bij hover</span>
        </Field>
      </Section>

      <Section title="Transform">
        {PROPS.filter((p) => p.prop !== 'reveal' || layer.type === 'writeon' || layer.revealMode !== 'none').map((p) => {
          const animated = !!layer.tracks[p.prop]?.length
          return (
            <Field
              key={p.prop}
              label={p.label}
              stopwatch={
                <button
                  className={`stopwatch${animated ? ' on' : ''}`}
                  title={animated ? 'Keyframes verwijderen' : 'Animeren: keyframe op huidige tijd'}
                  onClick={() => toggleStopwatch(layer.id, p.prop, st[p.prop])}
                >
                  ⏱
                </button>
              }
            >
              <Scrub
                value={st[p.prop]}
                step={p.step}
                min={p.min}
                max={p.max}
                decimals={p.decimals}
                suffix={p.suffix}
                animated={animated}
                onChange={(v, co) => setLayerValue(layer.id, p.prop, v, co ? `p-${p.prop}` : undefined)}
              />
            </Field>
          )
        })}
        {layer.type !== 'writeon' && (
          <Field label="Reveal-modus">
            <select
              value={layer.revealMode}
              onChange={(e) =>
                up((l) => {
                  l.revealMode = e.target.value as RevealMode
                  if (l.revealMode === 'none') delete l.tracks.reveal
                })
              }
            >
              <option value="none">Geen</option>
              <option value="wipeLeft">Wipe van links</option>
              <option value="wipeRight">Wipe van rechts</option>
              <option value="wipeUp">Wipe van onder</option>
              <option value="wipeDown">Wipe van boven</option>
            </select>
          </Field>
        )}
      </Section>

      {layer.text && (
        <Section title="Tekst">
          <TextInput multiline value={layer.text.content} onCommit={(v) => up((l) => void (l.text!.content = v))} />
          <div style={{ height: 6 }} />
          <Field label="Font">
            <select value={layer.text.fontId ?? ''} onChange={(e) => up((l) => void (l.text!.fontId = e.target.value || null))}>
              <option value="">Systeem (Arial)</option>
              {fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.family} {f.weight}
                  {f.style === 'italic' ? ' italic' : ''}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Grootte">
            <Scrub value={layer.text.size} min={4} max={300} onChange={(v, co) => up((l) => void (l.text!.size = v), co ? 'ts' : undefined)} suffix="px" />
            <input type="color" value={layer.text.color} onChange={(e) => up((l) => void (l.text!.color = e.target.value), 'tc')} />
          </Field>
          <Field label="Gewicht">
            <select value={layer.text.weight} onChange={(e) => up((l) => void (l.text!.weight = +e.target.value))}>
              {[100, 200, 300, 400, 500, 600, 700, 800, 900].map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
            <select value={layer.text.align} onChange={(e) => up((l) => void (l.text!.align = e.target.value as 'left'))}>
              <option value="left">Links</option>
              <option value="center">Midden</option>
              <option value="right">Rechts</option>
            </select>
          </Field>
          <Field label="Regel / spatie">
            <Scrub value={layer.text.lineHeight} step={0.01} min={0.5} max={3} decimals={2} onChange={(v, co) => up((l) => void (l.text!.lineHeight = v), co ? 'lh' : undefined)} />
            <Scrub value={layer.text.letterSpacing} step={0.1} decimals={1} onChange={(v, co) => up((l) => void (l.text!.letterSpacing = v), co ? 'ls' : undefined)} suffix="px" />
          </Field>
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
          <Field label="Font">
            <select
              value={layer.writeon.fontId ?? ''}
              onChange={(e) => {
                up((l) => void (l.writeon!.fontId = e.target.value || null))
                void regenerateWriteOn(layer.id)
              }}
            >
              <option value="">Kies een font…</option>
              {fonts.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.family} {f.weight}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Kleur / lijn">
            <input type="color" value={layer.writeon.color} onChange={(e) => up((l) => void (l.writeon!.color = e.target.value), 'wc')} />
            <Scrub value={layer.writeon.strokeWidth} step={0.1} min={0} max={20} decimals={1} onChange={(v, co) => up((l) => void (l.writeon!.strokeWidth = v), co ? 'wsw' : undefined)} />
          </Field>
          <Field label="Vulling">
            <Scrub value={layer.writeon.fillAfter} step={0.01} min={0} max={1} decimals={2} onChange={(v, co) => up((l) => void (l.writeon!.fillAfter = v), co ? 'wf' : undefined)} />
          </Field>
          <div className="muted" style={{ marginBottom: 6 }}>
            {layer.writeon.glyphs.length ? `${layer.writeon.glyphs.length} letters als paden.` : 'Nog geen paden: kies een font en klik op Genereer.'} Animeer
            met de “Reveal”-eigenschap of het effect “Write-on”.
          </div>
          <button onClick={() => regenerateWriteOn(layer.id)}>Genereer paden</button>
        </Section>
      )}

      {layer.image && (
        <Section title="Afbeelding">
          <Field label="Bestand">
            <span className="muted" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{layer.image.src || '—'}</span>
          </Field>
          <Field label="Passend">
            <select value={layer.image.fit} onChange={(e) => up((l) => void (l.image!.fit = e.target.value as 'contain'))}>
              <option value="contain">Contain</option>
              <option value="cover">Cover</option>
              <option value="fill">Uitrekken</option>
            </select>
          </Field>
        </Section>
      )}

      {layer.shape && (
        <Section title="Vorm">
          <Field label="Vulling">
            <input type="color" value={layer.shape.fill} onChange={(e) => up((l) => void (l.shape!.fill = e.target.value), 'sf')} />
            <TextInput value={layer.shape.fill} onCommit={(v) => up((l) => void (l.shape!.fill = v))} />
          </Field>
          <Field label="Hoekradius">
            <Scrub value={layer.shape.radius} min={0} max={1000} onChange={(v, co) => up((l) => void (l.shape!.radius = v), co ? 'sr' : undefined)} suffix="px" />
          </Field>
          <Field label="Rand">
            <input type="color" value={layer.shape.strokeColor} onChange={(e) => up((l) => void (l.shape!.strokeColor = e.target.value), 'sc')} />
            <Scrub value={layer.shape.strokeWidth} min={0} max={50} onChange={(v, co) => up((l) => void (l.shape!.strokeWidth = v), co ? 'ss' : undefined)} suffix="px" />
          </Field>
        </Section>
      )}
    </>
  )
}

function Effects() {
  const selection = useStore((s) => s.selection)
  const time = useStore((s) => s.time)
  const [duration, setDuration] = useState(0.6)
  return (
    <Section title="Effecten">
      <Field label="Start / duur">
        <span className="muted">{time.toFixed(2)}s</span>
        <Scrub value={duration} step={0.05} min={0.05} max={10} decimals={2} onChange={(v) => setDuration(v)} suffix="s" />
      </Field>
      <div className="presets">
        {PRESETS.map((p) => (
          <button key={p.id} disabled={!selection.length} onClick={() => applyPreset(p.id, time, duration)}>
            {p.label}
          </button>
        ))}
      </div>
      {!selection.length && <div className="muted" style={{ marginTop: 6 }}>Selecteer eerst een of meer lagen.</div>}
    </Section>
  )
}

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
  return (
    <Section title="AI-animatie">
      <div className="ai-box">
        <textarea
          placeholder={
            selection.length
              ? 'Bijv. "laat de headline letter voor letter inschrijven en de CTA na 3s pulseren"'
              : 'Geen selectie: AI animeert de hele compositie. Bijv. "rustige premium intro, alles binnen 4s in beeld"'
          }
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => (e.metaKey || e.ctrlKey) && e.key === 'Enter' && prompt.trim() && !busy && run()}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 6, alignItems: 'center' }}>
          <button className="primary" disabled={busy || !prompt.trim()} onClick={run}>
            {busy ? 'Bezig…' : 'Genereer animatie'}
          </button>
          <span className="muted">{selection.length ? `${selection.length} laag/lagen` : 'hele compositie'}</span>
        </div>
        {explain && <div className="explain">{explain}</div>}
      </div>
    </Section>
  )
}

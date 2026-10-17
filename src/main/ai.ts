import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { AiAnimationResult, AiCodeRequest, AiCodeResult } from '@shared/api'
import { ANIM_PROPS, EASES } from '@shared/types'
import type { AnimProp, Project, Tracks } from '@shared/types'

// Claude maakt keyframes binnen het vaste animatiemodel van de app. Het schrijft
// dus nooit vrije code in de banner: de export blijft licht en voorspelbaar.

const AnimationSchema = z.object({
  explanation: z.string(),
  duration: z.number().nullable(),
  layers: z.array(
    z.object({
      layerId: z.string(),
      revealMode: z.enum(['none', 'wipeLeft', 'wipeRight', 'wipeUp', 'wipeDown']).nullable(),
      tracks: z.array(
        z.object({
          prop: z.enum(ANIM_PROPS as [AnimProp, ...AnimProp[]]),
          keyframes: z.array(z.object({ t: z.number(), v: z.number(), e: z.enum(EASES as [string, ...string[]]) }))
        })
      )
    })
  )
})

const SYSTEM = `Je bent motion designer voor HTML5 display banners (IAB). Je animeert lagen door keyframes te leveren.

Animatiemodel:
- Coördinaten in pixels; (0,0) is linksboven van de banner. x/y is de linkerbovenhoek van de laag.
- Transform-origin is het midden van de laag. scale 1 = normaal. rotation in graden. opacity 0..1.
- reveal 0..1: bij type "writeon" tekent de tekst zich letter voor letter (lijn, daarna vulling).
  Bij andere lagen werkt reveal alleen met een revealMode (wipeLeft, wipeRight, wipeUp, wipeDown).
- Keyframe: t (seconden), v (waarde), e (easing naar de volgende keyframe):
  ${EASES.join(', ')}.
- Een eigenschap zonder keyframes houdt zijn basiswaarde.

Regels:
- Animeer alleen de gevraagde lagen (of alle lagen als er niets is geselecteerd).
- Eindig elke eigenschap op de basiswaarde, tenzij de vraag anders zegt, zodat de eindcompositie klopt.
- Blijf binnen de duur van de compositie, tenzij je in "duration" een nieuwe duur (max. 30s) voorstelt; anders null.
- Geef per laag alleen de eigenschappen die je verandert. revealMode null = niet wijzigen.
- Banners moeten rustig en leesbaar blijven: tekst moet lang genoeg stilstaan om gelezen te worden.
- Leg in "explanation" in één of twee zinnen in het Nederlands uit wat je hebt gedaan.`

export async function aiAnimate(
  provider: AiProvider,
  apiKey: string,
  model: string,
  project: Project,
  compositionId: string,
  layerIds: string[],
  prompt: string
): Promise<AiAnimationResult> {
  const comp = project.compositions.find((c) => c.id === compositionId)
  if (!comp) throw new Error('Compositie niet gevonden.')

  const summary = {
    width: comp.width,
    height: comp.height,
    duration: comp.duration,
    selectedLayerIds: layerIds,
    layers: comp.layers.map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type,
      text: l.text?.content ?? l.writeon?.content,
      box: { x: l.x, y: l.y, width: l.width, height: l.height },
      base: { scale: l.scale, rotation: l.rotation, opacity: l.opacity, reveal: l.reveal },
      revealMode: l.revealMode,
      tracks: l.tracks
    }))
  }

  const parsed = await askJson(provider, apiKey, model, SYSTEM, `Compositie (lagen van boven naar onder):\n${JSON.stringify(summary)}\n\nOpdracht: ${prompt}`, AnimationSchema)

  const known = new Set(comp.layers.map((l) => l.id))
  return {
    explanation: parsed.explanation,
    duration: parsed.duration,
    layers: parsed.layers
      .filter((l) => known.has(l.layerId))
      .map((l) => {
        const tracks: Tracks = {}
        for (const tr of l.tracks)
          tracks[tr.prop] = tr.keyframes
            .map((k) => ({ t: Math.max(0, k.t), v: k.v, e: k.e as (typeof EASES)[number] }))
            .sort((a, b) => a.t - b.t)
        return { layerId: l.layerId, revealMode: l.revealMode, tracks }
      })
  }
}

// ---------- Code-elementen (bijv. een laadsymbool) ----------

const CodeSchema = z.object({
  name: z.string(),
  width: z.number(),
  height: z.number(),
  html: z.string(),
  css: z.string(),
  explanation: z.string()
})

const CODE_SYSTEM = `Je bent motion designer en front-end developer voor HTML5 display banners (IAB).
Je maakt één los animatie-element (bijvoorbeeld een laadsymbool, glans-effect, confetti, pijltje dat beweegt)
als kleine HTML/SVG-code met CSS-animatie.

Regels:
- Alleen HTML/inline SVG en CSS. Geen JavaScript, geen <script>, geen event-handlers, geen <style> in de HTML.
- Geen externe bestanden: geen afbeeldingen, fonts of url()'s naar internet. Teken alles met HTML/SVG/CSS.
- Het element heeft een vaste ontwerpmaat (width × height in px). In de CSS heet de container ".root";
  begin elke selector met ".root" (bijv. ".root .dot"). Gebruik geen selectors voor html, body of *.
- Geef elke @keyframes een naam die begint met "kf-" (bijv. "kf-spin").
- Animaties starten op t=0. Herhalen mag (animation-iteration-count: infinite).
- Houd het licht (bij voorkeur < 4 KB) en vloeiend: animeer bij voorkeur transform en opacity.
- Gebruik de gevraagde kleuren; anders neutrale kleuren die bij de banner passen.
- "name": korte Nederlandse laagnaam. "explanation": één of twee zinnen in het Nederlands.
- Bij een aanpassing van bestaande code: houd wat goed is en verander alleen wat gevraagd wordt.`

export type AiProvider = 'anthropic' | 'fal'

function codeMessage(req: AiCodeRequest): string {
  const parts = [`Banner: ${req.banner.width}×${req.banner.height}px, achtergrond ${req.banner.background}.`]
  if (req.banner.colors.length) parts.push(`Kleuren in de banner: ${req.banner.colors.join(', ')}.`)
  if (req.existing) parts.push(`Huidige code (${req.existing.w}×${req.existing.h}px):\nHTML:\n${req.existing.html}\nCSS:\n${req.existing.css}`)
  parts.push(`Opdracht: ${req.prompt}`)
  return parts.join('\n\n')
}

const MOCK_LOADER: AiCodeResult = {
  name: 'Laadsymbool',
  width: 80,
  height: 80,
  html: '<svg viewBox="0 0 80 80" width="80" height="80"><circle class="ring" cx="40" cy="40" r="30" fill="none" stroke="#e30613" stroke-width="8" stroke-linecap="round" stroke-dasharray="120 80"/></svg>',
  css: '.root svg{animation:kf-spin 1s linear infinite;transform-origin:50% 50%}@keyframes kf-spin{to{transform:rotate(360deg)}}',
  explanation: 'Een rode ring die rond draait (testantwoord).'
}

export async function aiCode(provider: AiProvider, apiKey: string, model: string, req: AiCodeRequest): Promise<AiCodeResult> {
  if (process.env.BS_AI_MOCK) return MOCK_LOADER
  const raw = await askJson(provider, apiKey, model, CODE_SYSTEM, codeMessage(req), CodeSchema)
  const w = Math.round(Math.min(2000, Math.max(4, raw.width || 100)))
  const h = Math.round(Math.min(2000, Math.max(4, raw.height || 100)))
  if (!raw.html.trim() && !raw.css.trim()) throw new Error('De AI gaf geen code terug. Probeer het anders te formuleren.')
  return { ...raw, width: w, height: h }
}

/** Vraagt de AI om een antwoord in de vorm van `schema`: via Anthropic (gestructureerde uitvoer) of via fal.ai. */
async function askJson<T>(provider: AiProvider, apiKey: string, model: string, system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  if (provider === 'fal') return viaFal(apiKey, model, system, user, schema)
  const client = new Anthropic({ apiKey })
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(schema) },
    system,
    messages: [{ role: 'user', content: user }]
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude heeft dit verzoek geweigerd. Probeer het anders te formuleren.')
  if (response.stop_reason === 'max_tokens') throw new Error('Antwoord was te lang. Vraag om iets eenvoudigers of minder lagen tegelijk.')
  if (!response.parsed_output) throw new Error('Kon het antwoord van Claude niet lezen.')
  return response.parsed_output as T
}

/** Via fal.ai (tegoed op fal, bijv. via Vercel): het LLM-endpoint fal-ai/any-llm, antwoord als JSON in tekst. */
async function viaFal<T>(apiKey: string, model: string, system: string, user: string, schema: z.ZodType<T>): Promise<T> {
  const res = await fetch('https://fal.run/fal-ai/any-llm', {
    method: 'POST',
    headers: { Authorization: `Key ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      system_prompt: `${system}\n\nAntwoord met alleen één JSON-object volgens dit schema, zonder markdown:\n${JSON.stringify(z.toJSONSchema(schema))}`,
      prompt: user
    })
  })
  const body = (await res.json().catch(() => null)) as { output?: string; error?: string; detail?: unknown } | null
  if (!res.ok) {
    const detail = body?.detail ? (typeof body.detail === 'string' ? body.detail : JSON.stringify(body.detail)) : res.statusText
    throw new Error(res.status === 401 || res.status === 403 ? 'fal.ai weigert de sleutel. Controleer de fal-sleutel in Instellingen.' : `fal.ai: ${detail}`)
  }
  if (body?.error) throw new Error(`fal.ai: ${body.error}`)
  const text = body?.output ?? ''
  let data: unknown = null
  try {
    data = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
  } catch {
    /* hieronder afgehandeld */
  }
  const parsed = schema.safeParse(data)
  if (!parsed.success) throw new Error('Kon het antwoord van fal.ai niet lezen. Probeer het nog eens of kies een ander fal-model.')
  return parsed.data
}

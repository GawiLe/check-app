import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { AiAnimationResult } from '@shared/api'
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

  const client = new Anthropic({ apiKey })
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(AnimationSchema) },
    system: SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Compositie (lagen van boven naar onder):\n${JSON.stringify(summary)}\n\nOpdracht: ${prompt}`
      }
    ]
  })

  if (response.stop_reason === 'refusal') throw new Error('Claude heeft dit verzoek geweigerd. Probeer het anders te formuleren.')
  if (response.stop_reason === 'max_tokens') throw new Error('Antwoord was te lang. Probeer minder lagen tegelijk.')
  const parsed = response.parsed_output
  if (!parsed) throw new Error('Kon het antwoord van Claude niet lezen.')

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

import type { FontAsset } from '@shared/types'
import { assetUrl } from '../store'

// Fonts uit het project in de editor zelf (tekst bewerken op het canvas, fontnamen in het paneel). Altijd
// het bestand uit het project, onder een eigen naam: anders pakt de editor een geïnstalleerd font met
// dezelfde naam, en zie je tijdens het bewerken iets anders dan in de banner.

const loaded = new WeakMap<Document, Map<string, { key: string; face: FontFace }>>()

/** CSS-naam waaronder het projectfont in de editor beschikbaar is. */
export const projectFontFamily = (f: FontAsset) => `bsfont-${f.id}`

/** Laadt het fontbestand in dit document (het hoofdvenster of een los paneel); opnieuw als het bestand wijzigt. */
export function ensureProjectFont(doc: Document, f: FontAsset, rev: number) {
  if (f.system || !f.file) return
  const win = doc.defaultView as (Window & typeof globalThis) | null
  if (!win) return
  const map = loaded.get(doc) ?? new Map<string, { key: string; face: FontFace }>()
  loaded.set(doc, map)
  const key = `${f.file}|${rev}|${f.weight}|${f.style}`
  const cur = map.get(f.id)
  if (cur?.key === key) return
  if (cur) doc.fonts.delete(cur.face)
  const face = new win.FontFace(projectFontFamily(f), `url("${assetUrl(f.file, rev)}")`, { weight: String(f.weight), style: f.style })
  map.set(f.id, { key, face })
  doc.fonts.add(face)
  face.load().catch(() => map.delete(f.id))
}

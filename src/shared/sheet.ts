// Varianten uit een spreadsheet (CSV, TSV of Excel .xlsx): elke rij is een variant, elke kolom een veld.
import { unzipSync } from 'fflate'
import type { Variant } from './types'
import type { VariantField } from './variants'

export type Table = string[][]

/** CSV/TSV inlezen (RFC 4180-aanhalingstekens). Scheidingsteken wordt herkend: tab, puntkomma of komma. */
export function parseDelimited(text: string): Table {
  let src = text.replace(/^﻿/, '')
  let sep: string | null = null
  const sepLine = src.match(/^sep=(.)\r?\n/i)
  if (sepLine) {
    sep = sepLine[1]
    src = src.slice(sepLine[0].length)
  }
  if (!sep) {
    // Tellen in de eerste regel, buiten aanhalingstekens
    const counts: Record<string, number> = { '\t': 0, ';': 0, ',': 0 }
    let q = false
    for (const ch of src) {
      if (ch === '"') q = !q
      else if (!q && (ch === '\n' || ch === '\r')) break
      else if (!q && ch in counts) counts[ch]++
    }
    const [best, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
    sep = n > 0 ? best : ','
  }
  const rows: Table = []
  let row: string[] = []
  let cell = ''
  let q = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (q) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"'
        i++
      } else if (ch === '"') q = false
      else cell += ch
    } else if (ch === '"' && cell === '') q = true
    else if (ch === sep) {
      row.push(cell)
      cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += ch
  }
  if (cell !== '' || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

/** CSV schrijven met puntkomma's (zoals Excel in het Nederlands verwacht). */
export function toCsv(table: Table): string {
  const esc = (s: string) => (/[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  return table.map((r) => r.map(esc).join(';')).join('\r\n') + '\r\n'
}

const xmlText = (s: string) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')

/** Alle tekst binnen <t>-elementen (ook rich text met meerdere runs). */
const runs = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => xmlText(m[1])).join('')

const colIndex = (ref: string) => {
  const letters = ref.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? 'A'
  let n = 0
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64)
  return n - 1
}

/** Eerste werkblad van een Excel-bestand (.xlsx) als tabel. Alleen waarden; geen formules of opmaak. */
export function parseXlsx(data: Uint8Array): Table {
  const zip = unzipSync(data)
  const dec = new TextDecoder()
  const read = (name: string) => (zip[name] ? dec.decode(zip[name]) : '')
  const shared = [...read('xl/sharedStrings.xml').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]))
  // Eerste blad volgens de werkmap (volgorde van de tabbladen), anders sheet1.xml
  let sheetPath = 'xl/worksheets/sheet1.xml'
  const rid = read('xl/workbook.xml').match(/<sheet\b[^>]*\br:id="([^"]+)"/)?.[1]
  if (rid) {
    const target = read('xl/_rels/workbook.xml.rels').match(new RegExp(`<Relationship\\b[^>]*Id="${rid}"[^>]*Target="([^"]+)"`))?.[1] ?? read('xl/_rels/workbook.xml.rels').match(new RegExp(`<Relationship\\b[^>]*Target="([^"]+)"[^>]*Id="${rid}"`))?.[1]
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target}`
  }
  const sheet = read(sheetPath) || read(Object.keys(zip).find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)) ?? '')
  if (!sheet) throw new Error('Geen werkblad gevonden in dit Excel-bestand.')
  const rows: Table = []
  for (const r of sheet.matchAll(/<row\b[^>]*?(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const row: string[] = []
    for (const c of (r[1] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1]
      const body = c[2] ?? ''
      const ref = attrs.match(/\br="([A-Z]+\d+)"/i)?.[1]
      const type = attrs.match(/\bt="([^"]+)"/)?.[1]
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let value = ''
      if (type === 's') value = shared[Number(v)] ?? ''
      else if (type === 'inlineStr') value = runs(body)
      else if (v != null) value = xmlText(v)
      const idx = ref ? colIndex(ref) : row.length
      while (row.length < idx) row.push('')
      row[idx] = value
    }
    rows.push(row)
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const IMAGE_RE = /\.(png|jpe?g|gif|svg|webp)$/i
export const looksLikeImage = (s: string) => IMAGE_RE.test(s.trim())
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const NAME_HEADERS = ['variant', 'varianten', 'naam', 'name']

/** Kopregel voor een sjabloon: Variant + de gekozen velden. */
export function variantsToTable(fields: VariantField[], variants: Variant[]): Table {
  const head = ['Variant', ...fields.map((f) => f.label)]
  const rows = variants.length ? variants : [{ id: '', name: 'Variant 1', values: {} }]
  return [head, ...rows.map((v) => [v.name, ...fields.map((f) => v.values[f.key] ?? '')])]
}

export interface SheetImport {
  /** Varianten na het samenvoegen (zelfde naam = bijgewerkt, anders nieuw). */
  variants: Variant[]
  /** Velden die in de tabel staan (worden aangezet). */
  fieldKeys: string[]
  /** Kolommen die niet bij een tekst of afbeelding passen. */
  unknown: string[]
  /** Afbeeldingen die niet gevonden zijn. */
  missingImages: string[]
  added: number
  updated: number
}

/**
 * Tabel → varianten. Kolomkoppen worden gekoppeld aan veldnamen (de laagnaam, of het volledige label
 * "Scène › Headline"). De kolom "Variant" (of de eerste kolom) is de naam. Lege cellen = zoals het origineel.
 * `images` vertaalt een bestandsnaam uit de tabel naar een asset-pad (assets/…).
 */
export function tableToVariants(
  table: Table,
  fields: VariantField[],
  existing: Variant[],
  images: Record<string, string>,
  makeId: () => string
): SheetImport {
  if (table.length < 2) throw new Error('De tabel is leeg: zet de veldnamen in de eerste rij en elke variant op een eigen rij.')
  const head = table[0].map((h) => h.trim())
  let nameCol = head.findIndex((h) => NAME_HEADERS.includes(norm(h)))
  if (nameCol < 0) nameCol = 0
  const used = new Set<string>()
  const cols: { i: number; field: VariantField }[] = []
  const unknown: string[] = []
  head.forEach((h, i) => {
    if (i === nameCol || !h) return
    const n = norm(h)
    const match =
      fields.find((f) => !used.has(f.key) && norm(f.label) === n) ??
      fields.find((f) => !used.has(f.key) && norm(f.label.split('›').pop()!) === n) ??
      fields.find((f) => !used.has(f.key) && f.key === h)
    if (!match) return void unknown.push(h)
    used.add(match.key)
    cols.push({ i, field: match })
  })

  const variants = structuredClone(existing)
  const missing = new Set<string>()
  let added = 0
  let updated = 0
  for (const row of table.slice(1)) {
    const name = (row[nameCol] ?? '').trim() || `Variant ${variants.length + 1}`
    if (norm(name) === 'origineel') continue
    const values: Record<string, string> = {}
    for (const { i, field } of cols) {
      const raw = row[i] ?? ''
      if (field.kind === 'text') {
        if (raw.trim() !== '') values[field.key] = raw.replace(/\r\n/g, '\n')
      } else if (raw.trim() !== '') {
        const v = raw.trim()
        const asset = images[v] ?? (v.startsWith('assets/') ? v : undefined)
        if (asset) values[field.key] = asset
        else missing.add(v)
      }
    }
    const same = variants.find((v) => norm(v.name) === norm(name))
    if (same) {
      for (const { field } of cols) delete same.values[field.key]
      Object.assign(same.values, values)
      updated++
    } else {
      variants.push({ id: makeId(), name, values })
      added++
    }
  }
  return { variants, fieldKeys: cols.map((c) => c.field.key), unknown, missingImages: [...missing], added, updated }
}

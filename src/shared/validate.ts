import { TARGETS } from './specs'
import type { Composition, ExportTarget, ValidationIssue } from './types'

export interface ValidationInput {
  target: ExportTarget
  comp: Composition
  html: string
  files: { name: string; bytes: number }[]
  zipBytes: number
  backupBytes: number | null
  politeLoad?: boolean
}

const IMAGE_EXT = /\.(png|jpe?g|gif|svg|webp)$/i

/** Initial load: bij polite loading tellen afbeeldingen niet mee (die laden na window.load). */
export function initialLoad(files: { name: string; bytes: number }[], politeLoad = false): number {
  return files.filter((f) => !politeLoad || !IMAGE_EXT.test(f.name)).reduce((s, f) => s + f.bytes, 0)
}

const kb = (b: number) => `${(b / 1024).toFixed(1)}KB`

/**
 * Controles gebaseerd op de eisen van Google (Ads/CM360/Ad Manager) en de IAB-
 * richtlijnen. Errors = afkeuring te verwachten, warnings = afwijking van richtlijn.
 */
export function validateBanner(input: ValidationInput): ValidationIssue[] {
  const spec = TARGETS[input.target]
  const { comp, html, files } = input
  const issues: ValidationIssue[] = []
  const add = (level: ValidationIssue['level'], rule: string, message: string) => issues.push({ level, rule, message })

  // Formaat-meta
  const meta = html.match(/<meta name="ad\.size" content="width=(\d+),height=(\d+)">/)
  if (!meta) add('error', 'ad.size', 'Meta-tag ad.size ontbreekt.')
  else if (+meta[1] !== comp.width || +meta[2] !== comp.height)
    add('error', 'ad.size', `ad.size (${meta[1]}x${meta[2]}) komt niet overeen met ${comp.width}x${comp.height}.`)

  // clickTag
  if (!/var clickTag\s*=\s*"https?:\/\/[^"]+"/.test(html))
    add('error', 'clickTag', 'clickTag is niet gedeclareerd met een geldige http(s)-URL.')
  if (!/window\.open\(window\.clickTag\)/.test(html)) add('error', 'clickTag', 'clickTag wordt niet gebruikt in de klik-actie.')
  if (/var clickTag\s*=\s*"https?:\/\/(www\.)?example\.(com|org|nl)/i.test(html))
    add('warning', 'clickTag', 'De fallback-clickTag is nog de voorbeeld-URL. Vul de echte landingspagina in (werkbalk of Ontwerp → Export).')

  // Externe requests (alles behalve de clickTag-URL)
  const withoutClickTag = html.replace(/var clickTag\s*=[^;]*;/, '')
  const external = withoutClickTag.match(/(?:src|href)\s*=\s*["']?(?:https?:)?\/\/[^"'\s>]+/g)
  if (external) add('error', 'extern', `Externe bronnen gevonden: ${external.slice(0, 3).join(', ')}`)

  // Gewicht
  const initial = initialLoad(files, input.politeLoad)
  if (input.zipBytes > spec.maxZipBytes)
    add('error', 'gewicht', `ZIP is ${kb(input.zipBytes)}; maximum voor ${spec.label} is ${kb(spec.maxZipBytes)}.`)
  if (initial > spec.initialLoadBytes)
    add(
      'warning',
      'gewicht',
      `Initial load ${kb(initial)} is meer dan de IAB-richtlijn van ${kb(spec.initialLoadBytes)}.` +
        (input.politeLoad ? '' : ' Zet polite loading aan.')
    )
  if (input.politeLoad && !/img\[data-src\]/.test(html)) add('error', 'polite', 'Polite loading staat aan, maar de runtime ontbreekt.')

  // Bestanden
  if (files.length > spec.maxFiles) add('error', 'bestanden', `${files.length} bestanden; maximum is ${spec.maxFiles}.`)
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
    if (!spec.allowedExtensions.includes(ext))
      add('error', 'bestandstype', `${f.name}: .${ext} is niet toegestaan voor ${spec.label}.`)
    if (!/^[a-zA-Z0-9._-]+$/.test(f.name)) add('warning', 'bestandsnaam', `${f.name}: gebruik alleen a-z, 0-9, punt, - en _.`)
  }
  if (!files.some((f) => f.name === 'index.html')) add('error', 'index', 'index.html ontbreekt in de root van de ZIP.')

  // Animatie
  const total = comp.duration * comp.loops
  if (comp.loops > spec.maxLoops) add('error', 'loops', `${comp.loops} loops; maximum is ${spec.maxLoops}.`)
  if (total > spec.maxAnimationSeconds)
    add('error', 'duur', `Totale animatieduur ${total.toFixed(1)}s; maximum is ${spec.maxAnimationSeconds}s.`)
  else if (total > 15) add('warning', 'duur', `Totale animatieduur ${total.toFixed(1)}s; IAB-richtlijn is 15s.`)

  // Rand
  if (isLight(comp.background) &&(!comp.border || comp.border.width <= 0))
    add('warning', 'rand', 'Lichte achtergrond zonder rand: de meeste publishers eisen dan een 1px rand.')

  // Backup
  if (spec.backupImage) {
    if (input.backupBytes == null) add('warning', 'backup', 'Geen backup-afbeelding gegenereerd.')
    else if (input.backupBytes > 40 * 1024) add('warning', 'backup', `Backup-afbeelding is ${kb(input.backupBytes)} (advies: max. 40KB).`)
  }

  if (!issues.some((i) => i.level === 'error'))
    add(
      'info',
      'ok',
      `Klaar voor ${spec.label}: ${kb(input.zipBytes)} ZIP, initial load ${kb(initial)}${input.politeLoad ? ' (polite)' : ''}, ${files.length} bestanden.`
    )
  return issues
}

/** Lichte achtergrond = relatieve luminantie boven 0,85 (#rgb / #rrggbb). */
export function isLight(color: string): boolean {
  let hex = color.trim().replace('#', '')
  if (hex.length === 3) hex = hex.replace(/./g, (c) => c + c)
  if (!/^[0-9a-f]{6}$/i.test(hex)) return false
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.85
}

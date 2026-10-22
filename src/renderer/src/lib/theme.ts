// Kleuren van de editor zelf (niet van de banner): accent, tijdlijnbalken en keyframes. In te stellen via
// Instellingen → Kleuren om te testen wat werkt. Wordt per computer bewaard; de rest volgt uit deze drie.

export interface Theme {
  /** Knoppen, selectie, grepen, actieve tabbladen. */
  accent: string
  /** Lagen in de tijdlijn (geselecteerd; de andere zijn een gedempte versie). */
  layer: string
  /** Keyframes en accenten zoals de basis-ster. */
  key: string
}

export const DEFAULT_THEME: Theme = { accent: '#ff6a13', layer: '#1d6a4f', key: '#f2c14e' }

export const THEME_PRESETS: { name: string; theme: Theme }[] = [
  { name: 'Bnnr', theme: DEFAULT_THEME },
  { name: 'Mint', theme: { accent: '#74c394', layer: '#0a6f4e', key: '#ff6a13' } },
  { name: 'Blauw', theme: { accent: '#4c9bff', layer: '#24508a', key: '#f2c14e' } },
  { name: 'Paars', theme: { accent: '#7c8cff', layer: '#353a5c', key: '#f2c14e' } },
  { name: 'Roze', theme: { accent: '#ff5fa2', layer: '#6a2f55', key: '#ffd166' } },
  { name: 'Grijs', theme: { accent: '#e6e6ea', layer: '#3a3a42', key: '#f2c14e' } }
]

const KEY = 'bs-theme'
const HEX = /^#[0-9a-f]{6}$/i

/** Opgeslagen kleuren (ongeldige of ontbrekende waarden vallen terug op de standaard). */
export function loadTheme(): Theme {
  try {
    const t = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Theme>
    return {
      accent: HEX.test(t.accent ?? '') ? t.accent! : DEFAULT_THEME.accent,
      layer: HEX.test(t.layer ?? '') ? t.layer! : DEFAULT_THEME.layer,
      key: HEX.test(t.key ?? '') ? t.key! : DEFAULT_THEME.key
    }
  } catch {
    return { ...DEFAULT_THEME }
  }
}

export function saveTheme(t: Theme) {
  try {
    if (sameTheme(t, DEFAULT_THEME)) localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, JSON.stringify(t))
  } catch {
    /* niet erg: dan alleen voor deze sessie */
  }
}

export const sameTheme = (a: Theme, b: Theme) => a.accent.toLowerCase() === b.accent.toLowerCase() && a.layer.toLowerCase() === b.layer.toLowerCase() && a.key.toLowerCase() === b.key.toLowerCase()

// ---------- Kleuren afleiden ----------

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const toHex = (c: number[]) => '#' + c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
/** Meng a met b (t = aandeel van b). */
const mix = (a: string, b: string, t: number) => toHex(rgb(a).map((v, i) => v + (rgb(b)[i] - v) * t))
const luminance = (hex: string) => {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Tint draaien (graden) voor de groepsbalken, zodat groepen anders ogen dan gewone lagen. */
function hueShift(hex: string, deg: number): string {
  const [r, g, b] = rgb(hex).map((v) => v / 255)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  if (!d) return hex
  const s = d / (1 - Math.abs(2 * l - 1))
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  h = (h * 60 + deg + 360) % 360
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return toHex([(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255])
}

const PANEL = '#18181b'

/** Alle CSS-variabelen die uit het thema volgen. */
export function themeVars(t: Theme): Record<string, string> {
  const group = hueShift(t.layer, 30)
  return {
    '--accent': t.accent,
    '--accent-rgb': rgb(t.accent).join(', '),
    '--accent-hover': mix(t.accent, '#ffffff', 0.2),
    // Tekst op een accentvlak: wit of donker, wat het meeste contrast geeft
    '--accent-ink': 1.05 / (luminance(t.accent) + 0.05) > (luminance(t.accent) + 0.05) / 0.06 ? '#ffffff' : '#1a1a1d',
    '--bar': mix(t.layer, PANEL, 0.62),
    '--bar-active': t.layer,
    '--bar-group': mix(group, PANEL, 0.62),
    '--bar-group-active': group,
    '--row-active': mix(t.layer, PANEL, 0.78),
    '--key': t.key
  }
}

// Losse panelen (eigen vensters) krijgen dezelfde kleuren
const docs = new Set<Document>()
export function trackThemedDoc(doc: Document) {
  docs.add(doc)
  return () => void docs.delete(doc)
}

export function applyTheme(t: Theme) {
  const vars = themeVars(t)
  for (const doc of [document, ...docs]) for (const [k, v] of Object.entries(vars)) doc.documentElement.style.setProperty(k, v)
}

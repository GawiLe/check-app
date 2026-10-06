// Google Fonts via Fontsource (dezelfde fonts, met een vaste download-URL per gewicht).
// De catalogus wordt bij gebruik opgehaald en lokaal bewaard; offline valt de app
// terug op de laatst bewaarde catalogus of op de lijst populaire fonts hieronder.

export interface WebFont {
  id: string
  family: string
  category: string
  weights: number[]
  styles: ('normal' | 'italic')[]
}

export const CATALOG_URL = 'https://api.fontsource.org/v1/fonts?type=google'

export const fontFileUrl = (id: string, weight: number, style: 'normal' | 'italic', subset = 'latin') =>
  `https://cdn.jsdelivr.net/fontsource/fonts/${id}@latest/${subset}-${weight}-${style}.woff2`

/** Ruwe API-respons omzetten naar ons formaat (onbekende velden negeren). */
export function normalizeCatalog(raw: unknown): WebFont[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((f) => f && typeof f.id === 'string' && typeof f.family === 'string')
    .map((f): WebFont => ({
      id: f.id,
      family: f.family,
      category: typeof f.category === 'string' ? f.category : 'sans-serif',
      weights: Array.isArray(f.weights) && f.weights.length ? f.weights.map(Number).filter(Boolean) : [400],
      styles: Array.isArray(f.styles) && f.styles.includes('italic') ? ['normal', 'italic'] : ['normal']
    }))
    .sort((a, b) => a.family.localeCompare(b.family))
}

/** Web-safe systeemfonts: worden niet meegeleverd, staan op vrijwel elk apparaat. */
export const SYSTEM_FONTS = ['Arial', 'Helvetica', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Georgia', 'Times New Roman', 'Courier New']

/** Populaire Google Fonts als startlijst (offline of zolang de catalogus laadt). */
const POPULAR: [string, string, string, number[]][] = [
  ['roboto', 'Roboto', 'sans-serif', [100, 300, 400, 500, 700, 900]],
  ['open-sans', 'Open Sans', 'sans-serif', [300, 400, 500, 600, 700, 800]],
  ['montserrat', 'Montserrat', 'sans-serif', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['lato', 'Lato', 'sans-serif', [100, 300, 400, 700, 900]],
  ['poppins', 'Poppins', 'sans-serif', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['inter', 'Inter', 'sans-serif', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['oswald', 'Oswald', 'sans-serif', [200, 300, 400, 500, 600, 700]],
  ['raleway', 'Raleway', 'sans-serif', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['nunito', 'Nunito', 'sans-serif', [200, 300, 400, 500, 600, 700, 800, 900]],
  ['work-sans', 'Work Sans', 'sans-serif', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['dm-sans', 'DM Sans', 'sans-serif', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['manrope', 'Manrope', 'sans-serif', [200, 300, 400, 500, 600, 700, 800]],
  ['bebas-neue', 'Bebas Neue', 'display', [400]],
  ['anton', 'Anton', 'sans-serif', [400]],
  ['archivo-black', 'Archivo Black', 'sans-serif', [400]],
  ['playfair-display', 'Playfair Display', 'serif', [400, 500, 600, 700, 800, 900]],
  ['merriweather', 'Merriweather', 'serif', [300, 400, 700, 900]],
  ['lora', 'Lora', 'serif', [400, 500, 600, 700]],
  ['dancing-script', 'Dancing Script', 'handwriting', [400, 500, 600, 700]],
  ['caveat', 'Caveat', 'handwriting', [400, 500, 600, 700]],
  ['pacifico', 'Pacifico', 'handwriting', [400]],
  ['permanent-marker', 'Permanent Marker', 'handwriting', [400]],
  ['roboto-condensed', 'Roboto Condensed', 'sans-serif', [100, 200, 300, 400, 500, 600, 700, 800, 900]],
  ['source-sans-3', 'Source Sans 3', 'sans-serif', [200, 300, 400, 500, 600, 700, 800, 900]]
]

export const POPULAR_FONTS: WebFont[] = POPULAR.map(([id, family, category, weights]): WebFont => ({
  id,
  family,
  category,
  weights,
  styles: ['normal', 'italic']
})).sort((a, b) => a.family.localeCompare(b.family))

export const POPULAR_IDS = new Set(POPULAR.map((p) => p[0]))

export const WEIGHT_NAME: Record<number, string> = {
  100: 'Thin',
  200: 'ExtraLight',
  300: 'Light',
  400: 'Regular',
  500: 'Medium',
  600: 'SemiBold',
  700: 'Bold',
  800: 'ExtraBold',
  900: 'Black'
}

import type { ExportTarget } from './types'

export interface SizePreset {
  name: string
  width: number
  height: number
}

/** IAB-formaten. De basis is altijd 300×600 (Half Page). */
export const BASE_SIZE: SizePreset = { name: 'Half Page', width: 300, height: 600 }

export const IAB_SIZES: SizePreset[] = [
  BASE_SIZE,
  { name: 'Medium Rectangle', width: 300, height: 250 },
  { name: 'Large Rectangle', width: 336, height: 280 },
  { name: 'Leaderboard', width: 728, height: 90 },
  { name: 'Billboard', width: 970, height: 250 },
  { name: 'Super Leaderboard', width: 970, height: 90 },
  { name: 'Wide Skyscraper', width: 160, height: 600 },
  { name: 'Skyscraper', width: 120, height: 600 },
  { name: 'Mobile Leaderboard', width: 320, height: 50 },
  { name: 'Large Mobile Banner', width: 320, height: 100 },
  { name: 'Mobile Interstitial', width: 320, height: 480 },
  { name: 'Square', width: 250, height: 250 },
  { name: 'Portrait', width: 300, height: 1050 }
]

export interface TargetSpec {
  id: ExportTarget
  label: string
  /** Max. gewicht van de ZIP (bytes). */
  maxZipBytes: number
  /** Richtlijn voor initial load (bytes); overschrijding is een waarschuwing. */
  initialLoadBytes: number
  maxFiles: number
  allowedExtensions: string[]
  /** Fonts moeten inline (base64) omdat losse fontbestanden niet zijn toegestaan. */
  inlineFonts: boolean
  maxAnimationSeconds: number
  maxLoops: number
  /** Backup-afbeelding apart aanleveren. */
  backupImage: boolean
  notes: string
}

const IAB_INITIAL = 150 * 1024

export const TARGETS: Record<ExportTarget, TargetSpec> = {
  cm360: {
    id: 'cm360',
    label: 'Campaign Manager 360',
    maxZipBytes: 10 * 1024 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 100,
    allowedExtensions: ['html', 'css', 'js', 'json', 'gif', 'png', 'jpg', 'jpeg', 'svg', 'webp', 'woff', 'woff2'],
    inlineFonts: false,
    maxAnimationSeconds: 30,
    maxLoops: 3,
    backupImage: true,
    notes: 'clickTag-variabele wordt bij upload herkend; backup-afbeelding apart uploaden.'
  },
  'google-ads': {
    id: 'google-ads',
    label: 'Google Ads (GDN)',
    maxZipBytes: 150 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 40,
    allowedExtensions: ['html', 'css', 'js', 'gif', 'png', 'jpg', 'jpeg', 'svg'],
    inlineFonts: true,
    maxAnimationSeconds: 30,
    maxLoops: 3,
    backupImage: false,
    notes: 'Max. 150KB ZIP, max. 40 bestanden, geen losse fontbestanden.'
  },
  gam: {
    id: 'gam',
    label: 'Google Ad Manager',
    maxZipBytes: 1024 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 100,
    allowedExtensions: ['html', 'css', 'js', 'json', 'gif', 'png', 'jpg', 'jpeg', 'svg', 'webp', 'woff', 'woff2'],
    inlineFonts: false,
    maxAnimationSeconds: 30,
    maxLoops: 3,
    backupImage: true,
    notes: 'HTML5-creative; clickTag wordt bij upload als variabele herkend.'
  },
  adform: {
    id: 'adform',
    label: 'Adform',
    maxZipBytes: 10 * 1024 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 100,
    allowedExtensions: ['html', 'css', 'js', 'json', 'gif', 'png', 'jpg', 'jpeg', 'svg', 'webp', 'woff', 'woff2'],
    inlineFonts: false,
    maxAnimationSeconds: 30,
    maxLoops: 3,
    backupImage: true,
    notes: 'Met manifest.json en Adform.DHTML.js; klik-URLs (clickTAG) vul je in Adform in.'
  },
  generic: {
    id: 'generic',
    label: 'Generiek IAB',
    maxZipBytes: 200 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 100,
    allowedExtensions: ['html', 'css', 'js', 'json', 'gif', 'png', 'jpg', 'jpeg', 'svg', 'webp', 'woff', 'woff2'],
    inlineFonts: false,
    maxAnimationSeconds: 15,
    maxLoops: 3,
    backupImage: true,
    notes: 'IAB New Ad Portfolio: 150KB initial load, 15s animatie.'
  }
}

export const TARGET_IDS = Object.keys(TARGETS) as ExportTarget[]

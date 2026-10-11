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
  /** Mapnaam in export/<project>/. */
  folder: string
  /** Wat is dit platform, en wanneer kies je het? */
  about: string
  /** Hoe de klik werkt. */
  click: string
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
    notes: 'clickTag-variabele wordt bij upload herkend; backup-afbeelding apart uploaden.',
    folder: 'CM360',
    about: 'Google Campaign Manager 360: de adserver van de meeste bureaus en adverteerders. Kies dit als de banners via CM360 worden uitgeleverd, ook bij inkoop via DV360.',
    click: 'Variabele clickTag (CM360 vult hem bij uploaden); klikgebieden clickTag1, clickTag2 …'
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
    notes: 'Max. 150KB ZIP, max. 40 bestanden, geen losse fontbestanden.',
    folder: 'Google Ads',
    about: 'Google Ads (Display Netwerk): banners die je zelf in een Google Ads-account uploadt. Strengste eisen: klein en weinig bestanden.',
    click: 'Variabele clickTag; Google Ads gebruikt één klik-URL per advertentie.'
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
    notes: 'HTML5-creative; clickTag wordt bij upload als variabele herkend.',
    folder: 'Google Ad Manager',
    about: 'Google Ad Manager (voorheen DFP): de adserver van uitgevers. Kies dit als een website/uitgever de banners zelf in GAM plaatst.',
    click: 'Variabele clickTag; klikgebieden clickTag1 …'
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
    notes: 'Met manifest.json en Adform.DHTML.js; klik-URLs (clickTAG) vul je in Adform in.',
    folder: 'Adform',
    about: 'Adform: Europese adserver en DSP. Banners krijgen het Adform-formaat met manifest.json.',
    click: "dhtml.getVar('clickTAG') met manifest.json; klik-URL vul je in Adform in."
  },
  azerion: {
    id: 'azerion',
    label: 'Azerion',
    maxZipBytes: 300 * 1024,
    initialLoadBytes: IAB_INITIAL,
    maxFiles: 100,
    allowedExtensions: ['html', 'css', 'js', 'json', 'gif', 'png', 'jpg', 'jpeg', 'svg', 'webp'],
    inlineFonts: true,
    maxAnimationSeconds: 30,
    maxLoops: 3,
    backupImage: true,
    notes: 'Max. 300KB ZIP; fonts ingebed (Base64), geen losse fontbestanden.',
    folder: 'Azerion',
    about: 'Azerion: Europees advertentieplatform (o.a. Improve Digital) dat banners op websites en in games plaatst. Kies dit als de campagne via Azerion loopt.',
    click: 'Variabele clickTag, zoals bij CM360.'
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
    notes: 'IAB New Ad Portfolio: 150KB initial load, 15s animatie.',
    folder: 'Generiek IAB',
    about: 'Algemene IAB-standaard (New Ad Portfolio). Voor andere adservers of als je het platform nog niet weet: veilige, kleine banners.',
    click: 'Variabele clickTag (de meest gebruikte standaard).'
  }
}

export const TARGET_IDS = Object.keys(TARGETS) as ExportTarget[]

/** Worden eigen fonts als Base64 in de HTML gezet? Verplicht voor sommige platforms, anders de projectkeuze. */
export function fontsInline(target: ExportTarget, project: { embedFonts?: boolean }): boolean {
  return TARGETS[target].inlineFonts || project.embedFonts !== false
}

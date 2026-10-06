import { app, net } from 'electron'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { newId } from '@shared/factory'
import type { FontAsset } from '@shared/types'
import { CATALOG_URL, fontFileUrl, normalizeCatalog, POPULAR_FONTS, type WebFont } from '@shared/webfonts'

const cachePath = () => join(app.getPath('userData'), 'font-catalog.json')
const WEEK = 7 * 24 * 3600 * 1000

/** Google Fonts-catalogus: uit de cache (max. een week oud), anders online, anders de startlijst. */
export async function fontCatalog(): Promise<{ fonts: WebFont[]; online: boolean }> {
  let cached: WebFont[] | null = null
  try {
    cached = normalizeCatalog(JSON.parse(await readFile(cachePath(), 'utf8')))
    if (cached.length && Date.now() - (await stat(cachePath())).mtimeMs < WEEK) return { fonts: cached, online: true }
  } catch {
    /* geen cache */
  }
  try {
    const res = await net.fetch(CATALOG_URL)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const fonts = normalizeCatalog(await res.json())
    if (fonts.length) {
      await mkdir(app.getPath('userData'), { recursive: true })
      await writeFile(cachePath(), JSON.stringify(fonts))
      return { fonts, online: true }
    }
  } catch (err) {
    console.warn('Font-catalogus niet bereikbaar', err)
  }
  return { fonts: cached?.length ? cached : POPULAR_FONTS, online: false }
}

/** Download één gewicht/stijl als WOFF2 naar fonts/ in het project. */
export async function installWebFont(dir: string, font: WebFont, weight: number, style: 'normal' | 'italic'): Promise<FontAsset> {
  const name = `${font.id}-${weight}${style === 'italic' ? '-italic' : ''}.woff2`
  const rel = `fonts/${name}`
  if (!existsSync(join(dir, rel))) {
    let res = await net.fetch(fontFileUrl(font.id, weight, style))
    if (!res.ok) res = await net.fetch(fontFileUrl(font.id, weight, style, 'latin-ext'))
    if (!res.ok) throw new Error(`Kon ${font.family} ${weight} niet downloaden (HTTP ${res.status}). Ben je online?`)
    await mkdir(join(dir, 'fonts'), { recursive: true })
    await writeFile(join(dir, rel), Buffer.from(await res.arrayBuffer()))
  }
  return { id: newId('f'), family: font.family, file: rel, weight, style }
}

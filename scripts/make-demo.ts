// Maakt een demo-project (starter + font + logo + write-on) voor de rooktest.
import { cp, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describeFont, textToGlyphPaths } from '../src/main/fonts'
import { createLayer, createStarterProject } from '../src/shared/factory'
import { PROJECT_FILE } from '../src/shared/types'

const [dir, fontFile] = process.argv.slice(2)
for (const d of ['assets', 'fonts', 'export']) await mkdir(join(dir, d), { recursive: true })
await cp(fontFile, join(dir, 'fonts/brand-bold.ttf'))
await writeFile(
  join(dir, 'assets/logo.svg'),
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 40"><rect width="120" height="40" rx="6" fill="#111"/><text x="60" y="26" font-family="Arial" font-size="16" fill="#fff" text-anchor="middle">LOGO</text></svg>'
)

const p = createStarterProject('Demo campagne')
const font = await describeFont(dir, 'fonts/brand-bold.ttf')
p.fonts.push(font)
const comp = p.compositions[0]
for (const l of comp.layers) if (l.text) l.text.fontId = font.id

const logo = createLayer('image', comp)
Object.assign(logo, { name: 'logo.svg', x: 90, y: 560, width: 120, height: 30 })
logo.image!.src = 'assets/logo.svg'

const w = createLayer('writeon', comp)
const g = await textToGlyphPaths(dir, font.file, 'Nu!', 40)
Object.assign(w, { name: 'Write-on', x: 276 - g.width, y: 180, width: g.width, height: g.height })
Object.assign(w.writeon!, { content: 'Nu!', fontId: font.id, glyphs: g.glyphs, viewBox: g.viewBox, color: '#e30613' })
w.tracks.reveal = [
  { t: 1.5, v: 0, e: 'easeInOut' },
  { t: 3, v: 1, e: 'linear' }
]
comp.layers.unshift(w, logo)
await writeFile(join(dir, PROJECT_FILE), JSON.stringify(p, null, 2))
console.log('demo-project:', dir)

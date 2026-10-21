// Rooktest voor de review-fixes: undo na een verwijderd formaat, lagen als blok schikken, meerdere
// keyframes wissen = één undo-stap, export met een ontbrekende afbeelding, veilige "Toon in map".
// Gebruik: npm run build && xvfb-run node scripts/smoke-review.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { pickFolder } from './lib/export.mjs'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
const errors = []
page.on('pageerror', (e) => (errors.push(e.message), console.log('[pageerror]', e.message)))
let fails = 0
const check = async (label, fn) => {
  const ok = await fn().catch((e) => (console.log('   ', e.message.split('\n')[0]), false))
  if (!ok) fails++
  console.log(label, ok ? 'OK' : 'MISLUKT')
}
const S = (fn, a) => page.evaluate(fn, a)

await page.waitForSelector('.welcome')
await S((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. Formaat verwijderen terwijl het open staat, dan ongedaan maken / opnieuw: de editor blijft werken
const r1 = await S(() => {
  const st = window.__bsStore.getState
  // Een tweede formaat erbij (kopie van de basis met eigen id's)
  st().update((q) => {
    const b = q.compositions[0]
    q.compositions.push({ ...structuredClone(b), id: 'extra-test', name: 'Extra', layers: b.layers.map((l) => ({ ...structuredClone(l), id: `${l.id}-x` })) })
  }, undefined, true)
  const p = st().project
  const other = p.compositions.find((c) => c.id !== p.baseCompositionId)
  if (!other) return { skip: true }
  st().setComp(other.id)
  st().update((q) => void (q.compositions = q.compositions.filter((c) => c.id !== other.id)))
  const afterDelete = st().compId
  st().undo()
  st().setComp(other.id)
  st().redo()
  return { base: p.baseCompositionId, afterDelete, afterRedo: st().compId }
})
await page.waitForTimeout(300)
await check('formaat weg terwijl het open staat: terug naar de basis, ook na undo/redo', async () => !r1.skip && (r1.afterDelete === r1.base && r1.afterRedo === r1.base))
await check('editor tekent gewoon door (geen fout)', async () => (await page.locator('.app').count()) === 1 && (await page.locator('.error-boundary').count()) === 0 && !errors.length)

// 2. Twee lagen naast elkaar samen naar voren: als blok, volgorde onderling gelijk
const r2 = await S(() => {
  const st = window.__bsStore.getState
  const ids = () => st().project.compositions.find((c) => c.id === st().compId).layers.map((l) => l.id)
  const before = ids()
  st().select([before[2], before[3]])
  window.dispatchEvent(new KeyboardEvent('keydown', { key: ']', code: 'BracketRight', metaKey: true, ctrlKey: true, bubbles: true }))
  return { before, after: ids() }
})
await check('lagen als blok naar voren (⌘])', async () => {
  const [a, b, c, d] = r2.before
  return JSON.stringify(r2.after.slice(0, 4)) === JSON.stringify([a, c, d, b])
})

// 3. Meerdere keyframes tegelijk wissen is één undo-stap
const r3 = await S(() => {
  const st = window.__bsStore.getState
  const comp = st().project.compositions.find((c) => c.id === st().compId)
  const withKeys = comp.layers.filter((l) => Object.values(l.tracks).some((k) => k?.length)).slice(0, 2)
  if (withKeys.length < 2) return { skip: true }
  const keys = withKeys.map((l) => {
    const [prop, kfs] = Object.entries(l.tracks).find(([, k]) => k?.length)
    return { layerId: l.id, prop, t: kfs[0].t }
  })
  st().selectKey(keys[0])
  st().selectKey(keys[1], true)
  const pastBefore = st().past.length
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', code: 'Delete', bubbles: true }))
  return { steps: st().past.length - pastBefore }
})
await check('meerdere keyframes wissen = één undo-stap', async () => !r3.skip && r3.steps === 1)

// 4. Export met een afbeelding die niet meer bestaat: melding in de controle, export gaat door
await rm(join(dir, 'assets', 'logo.svg'), { force: true })
const out = join(shots, 'export')
await pickFolder(app, out)
const r4 = await S(async (d) => {
  const st = window.__bsStore.getState()
  const outDir = await window.bs.chooseExportDir(d)
  const res = await window.bs.exportBanners({ dir: d, project: st.project, compositionIds: [st.project.baseCompositionId], targets: ['cm360'], outDir })
  return res.map((r) => ({ zip: r.zip, errors: r.issues.filter((i) => i.level === 'error').map((i) => i.message) }))
}, dir).catch((e) => ({ error: e.message }))
await check('ontbrekende afbeelding: foutmelding bij het formaat, ZIP wel gemaakt', async () => Array.isArray(r4) && r4.length === 1 && !!r4[0].zip && r4[0].errors.some((m) => m.includes('logo.svg')))

// 5. "Toon in map" alleen voor eigen bestanden (de bestandsbeheerder zelf wordt niet echt geopend)
await app.evaluate(({ shell }) => void (shell.showItemInFolder = () => {}))
const r5 = await S(async (zip) => {
  const ok = await window.bs.revealInFolder(zip).then(() => true, () => false)
  const bad = await window.bs.revealInFolder('/etc/passwd').then(() => true, () => false)
  return { ok, bad }
}, Array.isArray(r4) ? r4[0].zip : '')
await check('"Toon in map": export wel, andere bestanden niet', async () => r5.ok && !r5.bad)

await page.screenshot({ path: join(shots, 'review.png') })
console.log(fails ? `${fails} controle(s) mislukt` : 'Review-fixes: alles in orde')
await S(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()
process.exit(fails ? 1 : 0)

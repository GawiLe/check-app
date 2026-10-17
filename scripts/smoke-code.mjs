// Rooktest: AI-code-element (laadsymbool) — maken via het AI-paneel (testantwoord via BS_AI_MOCK),
// synchroon met de tijdlijn in de preview, code aanpassen in het paneel Ontwerp, en in de export.
// Gebruik: npm run build && xvfb-run node scripts/smoke-code.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { pickFolder, zipText } from './lib/export.mjs'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata', BS_AI_MOCK: '1' } })
const page = await app.firstWindow()
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
let fails = 0
const check = async (label, fn) => {
  const ok = await fn().catch((e) => (console.log('   ', e.message.split('\n')[0]), false))
  if (!ok) fails++
  console.log(label, ok ? 'OK' : 'MISLUKT')
}
const S = (fn, a) => page.evaluate(fn, a)
const codeLayer = () => S(() => JSON.parse(JSON.stringify(window.__bsStore.getState().project.compositions[0].layers.find((l) => l.type === 'code') ?? null)))
/** Waarde uit de (zichtbare) preview. */
const inPreview = async (fn) => {
  for (let i = 0; i < 30; i++) {
    for (const f of page.frames().filter((x) => x.url().startsWith('bsproj://bs-preview/'))) {
      const v = await f.evaluate(fn).catch(() => null)
      if (v != null) return v
    }
    await page.waitForTimeout(150)
  }
  return null
}

await page.waitForSelector('.welcome')
await S((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// 1. AI-paneel: nieuw element
await page.locator('.dock-tab', { hasText: /^AI$/ }).click()
await page.locator('.ai-mode button', { hasText: 'Nieuw element' }).click()
await page.locator('.ai-mode ~ textarea').fill('Maak een laadsymbool dat draait')
await page.getByRole('button', { name: 'Maak element' }).click()
await page.waitForTimeout(600)
await check('code-element als nieuwe laag, in het midden', async () => {
  const l = await codeLayer()
  return !!l && l.name === 'Laadsymbool' && l.width === 80 && l.x === Math.round((300 - 80) / 2) && l.code.css.includes('kf-spin')
})
await check('uitleg van de AI zichtbaar', async () => (await page.locator('.hint-text', { hasText: 'rode ring' }).count()) > 0)
await check('paneel schakelt naar "Element aanpassen"', async () => (await page.locator('.ai-mode button', { hasText: 'Element aanpassen' }).count()) === 1)

// 2. Preview: de CSS-animatie volgt de tijdlijn (1 s per omwenteling → op 2,25 s: 2250 ms)
await S(() => window.__bsStore.getState().setTime(2.25))
await page.waitForTimeout(400)
await check('CSS-animatie staat op de tijdlijntijd (gepauzeerd)', async () => {
  const v = await inPreview(() => {
    const k = document.querySelector('.K')
    const a = k?.parentElement.getAnimations({ subtree: true })[0]
    return a ? JSON.stringify({ t: Math.round(a.currentTime), s: a.playState }) : null
  })
  const r = JSON.parse(v)
  return r.t === 2250 && r.s === 'paused'
})
await page.screenshot({ path: `${shots}/k1-code-element.png` })

// 3. Code aanpassen in het paneel Ontwerp
await page.locator('.dock-tab', { hasText: 'Ontwerp' }).click()
const cssField = page.locator('.code-field', { hasText: 'CSS' }).locator('textarea')
await check('code zichtbaar in het paneel Ontwerp', async () => (await cssField.inputValue()).includes('kf-spin'))
await cssField.fill('.root svg{animation:kf-spin 2s linear infinite;transform-origin:50% 50%}@keyframes kf-spin{to{transform:rotate(360deg)}}')
await page.locator('.code-field', { hasText: 'HTML' }).locator('textarea').click()
await page.waitForTimeout(500)
await check('aangepaste CSS in het project', async () => (await codeLayer()).code.css.includes('2s linear'))

// 4. Aanpassen via AI houdt positie en schaal
await S(() => window.__bsStore.getState().update((p) => Object.assign(p.compositions[0].layers.find((l) => l.type === 'code'), { x: 10, width: 160, height: 160 })))
await page.locator('.dock-tab', { hasText: /^AI$/ }).click()
await page.locator('.ai-mode ~ textarea').fill('Maak hem rood')
await page.getByRole('button', { name: 'Aanpassen', exact: true }).click()
await page.waitForTimeout(600)
await check('aanpassen: zelfde laag, positie en schaal behouden', async () => {
  const layers = await S(() => window.__bsStore.getState().project.compositions[0].layers.filter((l) => l.type === 'code').length)
  const l = await codeLayer()
  return layers === 1 && l.x === 10 && l.width === 160 && l.code.prompt === 'Maak hem rood'
})

// 5. Export: code-element zit in de banner, afgeschermd
await pickFolder(app, `${shots}/out`)
const outDir = await S((d) => window.bs.chooseExportDir(d), dir)
const comp = await S(() => window.__bsStore.getState().project.compositions[0].id)
const [res] = await S(([d, c, o]) => window.bs.exportBanners({ dir: d, project: window.__bsStore.getState().project, compositionIds: [c], targets: ['cm360'], outDir: o }), [dir, comp, outDir])
const html = await zipText(res.zip, 'index.html')
await check('export: SVG, afgeschermde keyframes en tijdlijn-koppeling', async () => /@keyframes a\d+-spin/.test(html) && html.includes('<circle class="ring"') && /"C":\[\["a\d+",0\]\]/.test(html))
await check('export: geen fouten in de validatie', async () => !res.issues.some((i) => i.level === 'error'))

console.log(fails ? `${fails} controle(s) mislukt` : 'Code-element: alles in orde')
await S(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()

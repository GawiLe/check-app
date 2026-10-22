// Rooktest: overzicht "Alle formaten" (passend in beeld, één schaal, 100%, klik = bewerken, melding als
// tekst niet past) en het assetpaneel in rasterweergave.
// Gebruik: npm run build && xvfb-run node scripts/smoke-overview.mjs <projectmap> <screenshotmap>
import { _electron as electron } from 'playwright-core'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const [dir, shots] = process.argv.slice(2)
await mkdir(shots, { recursive: true })
const app = await electron.launch({ args: ['--no-sandbox', '.'], env: { ...process.env, BS_USER_DATA: shots + '/userdata' } })
const page = await app.firstWindow()
await page.setViewportSize({ width: 1440, height: 900 })
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
let fails = 0
const check = async (label, fn) => {
  const ok = await fn().catch((e) => (console.log('   ', e.message.split('\n')[0]), false))
  if (!ok) fails++
  console.log(label, ok ? 'OK' : 'MISLUKT')
}
const S = (fn, a) => page.evaluate(fn, a)
const waitFor = async (fn, n = 30) => {
  for (let i = 0; i < n; i++) {
    if (await fn().catch(() => false)) return true
    await page.waitForTimeout(150)
  }
  return false
}

await page.waitForSelector('.welcome')
await S((d) => window.bs.openProject(d), dir)
await page.reload()
await page.locator('.welcome .list-item').first().click()
await page.waitForSelector('.app')

// Twee extra formaten (kopie van de basis); in het brede formaat een te lange kop
const ids = await S(() => {
  const st = window.__bsStore.getState
  st().update((q) => {
    const b = q.compositions[0]
    const copy = (id, w, h) => ({ ...structuredClone(b), id, name: `${w}×${h}`, width: w, height: h, layers: b.layers.map((l) => ({ ...structuredClone(l), id: `${l.id}-${id}` })) })
    const wide = copy('ov-970', 970, 250)
    const t = wide.layers.find((l) => l.type === 'text')
    t.text.content = 'Een veel te lange kop die nooit in dit kleine kader past, hoe je het ook wendt of keert, echt niet'
    t.height = 20
    q.compositions.push(wide, copy('ov-320', 320, 50))
  }, undefined, true)
  return st().project.compositions.map((c) => c.id)
})

// 1. Met \ naar het overzicht
await page.locator('.timeline').click({ position: { x: 5, y: 5 } }).catch(() => {})
await page.keyboard.press('Escape')
await page.keyboard.press('Backslash')
await check('\\ opent het overzicht met alle formaten', async () => waitFor(async () => (await page.locator('.overview .tile').count()) === ids.length))

// 2. Passend: alles in beeld, zelfde schaal
await page.waitForTimeout(400)
await check('passend: alle formaten in beeld zonder scrollen', async () =>
  page.locator('.overview-area').evaluate((el) => el.scrollHeight <= el.clientHeight + 1 && el.scrollWidth <= el.clientWidth + 1)
)
const scales = async () =>
  S(() =>
    [...document.querySelectorAll('.overview .tile')].map((t, i) => {
      const c = window.__bsStore.getState().project.compositions.filter((x) => !x.disabled)[i]
      return t.querySelector('.frame').getBoundingClientRect().width / c.width
    })
  )
await check('één schaal voor alle formaten (echte verhoudingen)', async () => {
  const s = await scales()
  return s.length === ids.length && Math.max(...s) - Math.min(...s) < 0.01 && s[0] < 1
})
await check('melding bij het formaat waar tekst niet past (alleen daar)', async () =>
  waitFor(async () => (await page.locator('.overview .tile', { hasText: '970×250' }).locator('.ov-warn').count()) === 1 && (await page.locator('.overview .ov-warn').count()) === 1)
)
await page.screenshot({ path: join(shots, 'o1-overzicht.png') })

// 3. 100%: echte grootte
await page.locator('.overview-tools button', { hasText: '100%' }).click()
await check('100%: formaten op ware grootte', async () => waitFor(async () => (await scales()).every((s) => Math.abs(s - 1) < 0.01)))
await page.locator('.overview-tools button', { hasText: 'Passend' }).click()

// 4. Klik = dat formaat bewerken
await page.locator('.overview .tile', { hasText: '320×50' }).locator('.frame').click()
await check('klik op een formaat: overzicht dicht, dat formaat open', async () =>
  waitFor(async () => (await page.locator('.overview').count()) === 0 && (await S(() => window.__bsStore.getState().compId)) === 'ov-320')
)

// 5. Knop bovenaan het canvas
await page.locator('.canvas-modes button', { hasText: 'Alle formaten' }).click()
await check('knop "Alle formaten" bovenaan het canvas', async () => waitFor(async () => (await page.locator('.overview .tile').count()) === ids.length))
await page.locator('.canvas-modes button', { hasText: 'Alle formaten' }).click()
await check('en weer terug naar één formaat', async () => waitFor(async () => (await page.locator('.overview').count()) === 0))

console.log(fails ? `${fails} controle(s) mislukt` : 'Overzicht alle formaten: alles in orde')
await S(() => window.__bsStore.getState().markSaved()).catch(() => {})
await page.waitForTimeout(200)
await app.close()
process.exit(fails ? 1 : 0)

// `npm run dmg`: Bnnr Studio als DMG, zonder Apple Developer-account. Er komen twee DMG's in dist/:
// -arm64 (Macs met Apple-chip, M1 en nieuwer) en -x64 (Macs met Intel-processor), om te delen met collega's.
// De app wordt ad-hoc ondertekend: nodig omdat macOS geen aangepast programma zonder handtekening start.
// Op een andere Mac vraagt macOS de eerste keer om bevestiging (zie README, "Delen met collega's").
// `npm run dmg -- --deze-mac` maakt alleen de DMG voor deze Mac (sneller).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

if (process.platform !== 'darwin') {
  console.error('\n✗ Een DMG maken kan alleen op een Mac.\n')
  process.exit(1)
}
const own = process.arch === 'arm64' ? 'arm64' : 'x64'
const archs = process.argv.includes('--deze-mac') ? [own] : ['arm64', 'x64']
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log(`\n▸ Bnnr Studio ${version} bouwen voor ${archs.map((a) => (a === 'arm64' ? 'Apple-chip' : 'Intel')).join(' en ')}…\n`)
run('npx', ['electron-vite', 'build'])
run('npx', [
  'electron-builder',
  '--mac',
  'dmg',
  ...archs.map((a) => `--${a}`),
  '--publish',
  'never',
  '-c.mac.target=dmg',
  '-c.mac.identity=-',
  '-c.mac.hardenedRuntime=false',
  '-c.mac.notarize=false'
])

const files = archs.map((a) => join('dist', `Bnnr-Studio-${version}-${a}.dmg`)).filter((f) => existsSync(f))
console.log('\n✓ Klaar:')
for (const f of files) console.log(`  ${f}   (${f.endsWith('arm64.dmg') ? 'Macs met Apple-chip, M1 en nieuwer' : 'Macs met Intel-processor'})`)
console.log("\n  Zelf installeren: sleep Bnnr Studio in het venster dat nu opent naar Programma's.")
console.log("  Delen: stuur collega's de DMG voor hun Mac (Apple-menu → Over deze Mac → Chip of Processor).\n")
// De DMG voor deze Mac openen om zelf te installeren, en de map tonen om te delen
const mine = files.find((f) => f.endsWith(`-${own}.dmg`))
if (mine) spawnSync('open', [mine])
if (files.length > 1) spawnSync('open', ['-R', files[0]])

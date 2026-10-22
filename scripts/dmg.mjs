// `npm run dmg`: Bnnr Studio als DMG voor déze Mac, zonder Apple Developer-account.
// De app wordt ad-hoc ondertekend: nodig omdat macOS (zeker op Apple silicon) geen aangepast programma
// zonder handtekening start. Voor een DMG die je aan anderen geeft: `npm run dist:mac` met een
// Developer ID-certificaat (zie README, "Mac-app als ondertekende DMG").
import { spawnSync } from 'node:child_process'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

if (process.platform !== 'darwin') {
  console.error('\n✗ Een DMG maken kan alleen op een Mac.\n')
  process.exit(1)
}
const arch = process.arch === 'arm64' ? 'arm64' : 'x64'
const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) process.exit(r.status ?? 1)
}

console.log(`\n▸ Bnnr Studio bouwen voor deze Mac (${arch === 'arm64' ? 'Apple silicon' : 'Intel'})…\n`)
run('npx', ['electron-vite', 'build'])
run('npx', [
  'electron-builder',
  '--mac',
  'dmg',
  `--${arch}`,
  '--publish',
  'never',
  '-c.mac.target=dmg',
  '-c.mac.identity=-',
  '-c.mac.hardenedRuntime=false',
  '-c.mac.notarize=false'
])

// De nieuwste DMG meteen openen: dan hoef je hem alleen nog naar Programma's te slepen
const dmg = readdirSync('dist')
  .filter((f) => f.endsWith(`-${arch}.dmg`))
  .map((f) => join('dist', f))
  .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
if (dmg) {
  console.log(`\n✓ Klaar: ${dmg}\n  Sleep Bnnr Studio in het venster naar Programma's.\n`)
  spawnSync('open', [dmg])
}

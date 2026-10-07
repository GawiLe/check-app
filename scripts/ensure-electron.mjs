// Controleert vóór het starten of het Electron-programma echt gedownload is.
// Op een nieuwe Mac mislukt die download tijdens `npm install` soms stil
// (dan krijg je "Electron uninstall" of "Electron failed to install correctly").
import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = join(root, 'node_modules', 'electron')

function installed() {
  const pathFile = join(pkg, 'path.txt')
  if (!existsSync(pathFile)) return false
  return existsSync(join(pkg, 'dist', readFileSync(pathFile, 'utf8').trim()))
}

if (!existsSync(pkg)) {
  console.error('\n✗ Electron ontbreekt. Voer eerst `npm install` uit.\n')
  process.exit(1)
}

if (!installed()) {
  console.log('\nElectron is nog niet (goed) gedownload — dat doe ik nu even…\n')
  const r = spawnSync(process.execPath, [join(pkg, 'install.js')], { stdio: 'inherit', cwd: pkg })
  if (r.status !== 0 || !installed()) {
    console.error(
      '\n✗ Electron downloaden is niet gelukt. Controleer je internetverbinding en probeer:\n' +
        '    rm -rf node_modules/electron\n' +
        '    npm install\n' +
        '    npm run dev\n'
    )
    process.exit(1)
  }
  console.log('\n✓ Electron gedownload.\n')
}

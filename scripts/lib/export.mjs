// Hulpjes voor de rooktests: exportmap kiezen (dialoog nagebootst) en bestanden uit een export-zip lezen.
import { mkdir, readFile } from 'node:fs/promises'
import { unzipSync, strFromU8 } from 'fflate'

/** Laat het mapkiesvenster `p` teruggeven (de map wordt aangemaakt). */
export async function pickFolder(app, p) {
  await mkdir(p, { recursive: true })
  await app.evaluate(({ dialog }, d) => void (dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [d] })), p)
}

/** Inhoud van een zip als { naam: Uint8Array }. */
export const readZip = async (zip) => unzipSync(new Uint8Array(await readFile(zip)))
export const zipNames = async (zip) => Object.keys(await readZip(zip))
export const zipText = async (zip, name) => strFromU8((await readZip(zip))[name])

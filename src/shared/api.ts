import type { UserPreset } from './library'
import type { WebFont } from './webfonts'
import type { ExportResult, ExportTarget, FontAsset, Project, Tracks, RevealMode, WriteOnProps } from './types'

export interface OpenedProject {
  dir: string
  project: Project
  /** Gezet als er niet-opgeslagen werk is hersteld (herstelkopie na een crash). */
  recovered?: boolean
}

export interface VersionInfo {
  id: string
  savedAt: number
  bytes: number
}

export interface Boilerplate {
  id: string
  name: string
  builtIn: boolean
}

export interface Settings {
  hasApiKey: boolean
  model: string
  recent: string[]
}

export interface AiLayerResult {
  layerId: string
  revealMode: RevealMode | null
  tracks: Tracks
}

export interface AiAnimationResult {
  explanation: string
  duration: number | null
  layers: AiLayerResult[]
}

export interface ExportRequest {
  dir: string
  project: Project
  compositionIds: string[]
  targets: ExportTarget[]
}

export interface VariantRequest {
  dir: string
  project: Project
  /** Meteen exporteren naar deze platforms (leeg = alleen de projectmappen maken). */
  exportTargets: ExportTarget[] | null
}

export interface VariantResult {
  name: string
  dir: string
  exports: ExportResult[]
}

/** Het API-oppervlak dat de preload aan de renderer geeft (`window.bs`). */
export interface BannerStudioApi {
  newProject(boilerplateId: string | null, name: string): Promise<OpenedProject | null>
  /** Project openen; met `background` als tabblad op de achtergrond (het actieve project blijft actief). */
  openProject(dir?: string, background?: boolean): Promise<OpenedProject | null>
  /** Een geopend project (tabblad) actief maken: preview, assets en bestandsbewaking volgen het. */
  activateProject(dir: string): Promise<void>
  /** Tabblad gesloten: project niet langer als geopend beschouwen. */
  closeProject(dir: string): Promise<void>
  saveProject(dir: string, project: Project): Promise<void>
  importImages(dir: string): Promise<string[]>
  importFonts(dir: string): Promise<FontAsset[]>
  listAssets(dir: string): Promise<string[]>
  generateWriteOn(
    dir: string,
    fontFile: string,
    text: string,
    size: number
  ): Promise<Pick<WriteOnProps, 'glyphs' | 'viewBox'> & { width: number; height: number }>
  exportBanners(req: ExportRequest): Promise<ExportResult[]>
  createVariants(req: VariantRequest): Promise<VariantResult[]>
  /** Niet-opgeslagen wijzigingen melden aan het hoofdproces (voor de vraag bij sluiten). */
  setDirty(dirty: boolean): Promise<void>
  /** Herstelkopie van niet-opgeslagen werk (elke minuut). */
  autosave(dir: string, project: Project): Promise<void>
  /** Herstelkopie weggooien (bewust niet opgeslagen). */
  clearAutosave(dir: string): Promise<void>
  /** Versiegeschiedenis (een versie bij elke keer Opslaan). */
  listVersions(dir: string): Promise<VersionInfo[]>
  readVersion(dir: string, id: string): Promise<Project>
  /** "Wijzigingen opslaan?" met Opslaan / Niet opslaan / Annuleren. */
  askSave(): Promise<'save' | 'discard' | 'cancel'>
  /** Venster sluiten nadat er is opgeslagen (of de app afsluiten als daarom gevraagd was). */
  closeWindow(): Promise<void>
  /** Preview-HTML klaarzetten; geeft de bsproj://-URL voor het preview-iframe terug. */
  setPreview(slot: number, html: string): Promise<string>
  revealInFolder(path: string): Promise<void>
  listBoilerplates(): Promise<Boilerplate[]>
  saveBoilerplate(dir: string, project: Project, name: string): Promise<Boilerplate>
  deleteBoilerplate(id: string): Promise<void>
  getSettings(): Promise<Settings>
  setApiKey(key: string): Promise<void>
  setModel(model: string): Promise<void>
  aiAnimate(project: Project, compositionId: string, layerIds: string[], prompt: string): Promise<AiAnimationResult>
  fontCatalog(): Promise<{ fonts: WebFont[]; online: boolean }>
  installWebFont(dir: string, font: WebFont, weight: number, style: 'normal' | 'italic'): Promise<FontAsset>
  listPresets(): Promise<UserPreset[]>
  nativeEdit(cmd: 'cut' | 'copy' | 'paste' | 'selectAll'): Promise<void>
  /** Bestanden (bijv. uit de Finder gesleept) in het project zetten: afbeeldingen/SVG → assets/, fonts → fonts/. */
  importPaths(dir: string, paths: string[]): Promise<{ assets: string[]; fonts: FontAsset[]; skipped: string[] }>
  /** Pad van een gesleept bestand (synchroon, in de preload). */
  pathForFile(file: File): string
  savePresets(list: UserPreset[]): Promise<void>
  onFilesChanged(cb: () => void): () => void
  onMenu(cb: (action: string) => void): () => void
}

declare global {
  interface Window {
    bs: BannerStudioApi
  }
}

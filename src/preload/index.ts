import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { BannerStudioApi } from '@shared/api'

const call =
  (name: string) =>
  (...args: unknown[]) =>
    ipcRenderer.invoke(`bs:${name}`, ...args)

const subscribe = (channel: string) => (cb: (...a: never[]) => void) => {
  const listener = (_e: unknown, ...a: unknown[]) => (cb as (...x: unknown[]) => void)(...a)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: BannerStudioApi = {
  newProject: call('newProject'),
  openProject: call('openProject'),
  saveProject: call('saveProject'),
  importImages: call('importImages'),
  importFonts: call('importFonts'),
  listAssets: call('listAssets'),
  generateWriteOn: call('generateWriteOn'),
  exportBanners: call('exportBanners'),
  createVariants: call('createVariants'),
  revealInFolder: call('revealInFolder'),
  listBoilerplates: call('listBoilerplates'),
  saveBoilerplate: call('saveBoilerplate'),
  deleteBoilerplate: call('deleteBoilerplate'),
  getSettings: call('getSettings'),
  setApiKey: call('setApiKey'),
  setModel: call('setModel'),
  aiAnimate: call('aiAnimate'),
  fontCatalog: call('fontCatalog'),
  installWebFont: call('installWebFont'),
  listPresets: call('listPresets'),
  nativeEdit: call('nativeEdit'),
  importPaths: call('importPaths'),
  pathForFile: (file: File) => webUtils.getPathForFile(file),
  savePresets: call('savePresets'),
  onFilesChanged: subscribe('bs:filesChanged') as BannerStudioApi['onFilesChanged'],
  onMenu: subscribe('bs:menu') as BannerStudioApi['onMenu']
} as BannerStudioApi

contextBridge.exposeInMainWorld('bs', api)

import { findDeep } from '@shared/tree'
import { currentComp, useStore, type MenuItem, type SelectedKey } from '../store'
import {
  addLayer,
  clearInOut,
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  groupSelection,
  keyAssist,
  moveLayer,
  moveToEdge,
  openComp,
  pasteClipboard,
  removeAnimation,
  sequenceSelection,
  setAnchor,
  setInOut,
  toggleExit,
  ungroupSelection,
  uploadAndReplace
} from './actions'
import { updateLayer } from '../store'

const isMac = navigator.platform.toLowerCase().includes('mac')
const cmd = (k: string) => (isMac ? `⌘${k}` : `Ctrl+${k}`)
const S = () => useStore.getState()
const sep: MenuItem = { separator: true }

/** Menu voor één of meer lagen (canvas of tijdlijn). Selecteert de laag als die nog niet geselecteerd was. */
export function openLayerMenu(e: React.MouseEvent, layerId: string) {
  e.preventDefault()
  e.stopPropagation()
  if (!S().selection.includes(layerId)) S().select([layerId])
  const sel = S().selection
  const comp = currentComp(S())!
  const f = findDeep(comp.layers, layerId)
  const l = f?.layer
  const single = sel.length === 1 && l
  const items: MenuItem[] = [
    { label: sel.length > 1 ? `Voeg ${sel.length} lagen toe aan nieuwe compositie` : 'Voeg toe aan nieuwe compositie', shortcut: cmd('G'), onClick: groupSelection },
    ...(single && l.type === 'group'
      ? ([
          { label: 'Compositie openen', onClick: () => openComp(l.id) },
          { label: 'Compositie opheffen (lagen terugzetten)', shortcut: isMac ? '⇧⌘G' : 'Shift+Ctrl+G', onClick: ungroupSelection }
        ] as MenuItem[])
      : []),
    ...(single ? ([{ label: 'Naam wijzigen', shortcut: 'Enter', onClick: () => S().setRenaming(l.id) }] as MenuItem[]) : []),
    ...(single && l.image
      ? ([
          { label: 'Afbeelding vervangen…', shortcut: isMac ? '⌥⌘/' : 'Ctrl+Alt+/', onClick: () => S().openReplace(l.id) },
          { label: 'Vervangen door bestand uit map…', onClick: () => void uploadAndReplace(l.id) }
        ] as MenuItem[])
      : []),
    sep,
    { label: 'Knippen', shortcut: cmd('X'), onClick: cutSelection },
    { label: 'Kopiëren', shortcut: cmd('C'), onClick: copySelection },
    { label: 'Plakken', shortcut: cmd('V'), onClick: pasteClipboard, disabled: !S().clipboard.length },
    { label: 'Dupliceren', shortcut: cmd('D'), onClick: duplicateSelection },
    sep,
    { label: 'Naar voren', shortcut: cmd(']'), onClick: () => sel.forEach((id) => moveLayer(id, -1)) },
    { label: 'Naar achteren', shortcut: cmd('['), onClick: () => sel.forEach((id) => moveLayer(id, 1)) },
    { label: 'Helemaal naar voren', shortcut: isMac ? '⇧⌘]' : 'Shift+Ctrl+]', onClick: () => [...sel].reverse().forEach((id) => moveToEdge(id, 'front')) },
    { label: 'Helemaal naar achteren', shortcut: isMac ? '⇧⌘[' : 'Shift+Ctrl+[', onClick: () => sel.forEach((id) => moveToEdge(id, 'back')) },
    sep,
    ...(sel.length > 1 ? ([{ label: 'Achter elkaar zetten', onClick: () => sequenceSelection() }] as MenuItem[]) : []),
    { label: 'In-punt op playhead', shortcut: '[', onClick: () => setInOut('in') },
    { label: 'Uit-punt op playhead', shortcut: ']', onClick: () => setInOut('out') },
    ...(l && (l.start || l.end != null) ? ([{ label: 'Altijd zichtbaar (in/uit wissen)', onClick: clearInOut }] as MenuItem[]) : []),
    sep,
    ...(single
      ? ([
          { label: l.exit ? 'Eigen klikgebied uitzetten' : 'Eigen klikgebied (clickTag) maken', onClick: () => toggleExit(l.id) },
          { label: 'Anchor point naar midden', onClick: () => setAnchor(l.id, 0.5, 0.5) },
          { label: l.visible ? 'Verbergen' : 'Tonen', onClick: () => updateLayer(l.id, (x) => void (x.visible = !x.visible)) },
          { label: l.locked ? 'Ontgrendelen' : 'Vergrendelen', onClick: () => updateLayer(l.id, (x) => void (x.locked = !x.locked)) }
        ] as MenuItem[])
      : []),
    { label: 'Animatie verwijderen', onClick: removeAnimation },
    { label: 'Verwijderen', shortcut: '⌫', onClick: deleteSelection, danger: true }
  ]
  S().openMenu(e.clientX, e.clientY, items)
}

/** Menu op een keyframe: keyframe-assistent. */
export function openKeyMenu(e: React.MouseEvent, key: SelectedKey) {
  e.preventDefault()
  e.stopPropagation()
  const sel = S().selectedKeys
  if (!sel.some((k) => k.layerId === key.layerId && k.prop === key.prop && Math.abs(k.t - key.t) < 1e-4)) S().selectKey(key)
  const n = S().selectedKeys.length
  S().openMenu(e.clientX, e.clientY, [
    { label: `Easy Ease${n > 1 ? ` (${n} keyframes)` : ''}`, shortcut: 'F9', onClick: () => keyAssist('easy') },
    { label: 'Easy Ease In (rustig aankomen)', shortcut: '⇧F9', onClick: () => keyAssist('in') },
    { label: 'Easy Ease Out (rustig vertrekken)', shortcut: isMac ? '⌘⇧F9' : 'Ctrl+Shift+F9', onClick: () => keyAssist('out') },
    { label: 'Lineair', onClick: () => keyAssist('linear') },
    sep,
    { label: 'Keyframe verwijderen', shortcut: '⌫', onClick: deleteSelection, danger: true }
  ])
}

/** Menu op een lege plek (canvas of tijdlijn). */
export function openEmptyMenu(e: React.MouseEvent) {
  e.preventDefault()
  S().openMenu(e.clientX, e.clientY, [
    { label: 'Plakken', shortcut: cmd('V'), onClick: pasteClipboard, disabled: !S().clipboard.length },
    sep,
    { label: 'Nieuwe tekst', onClick: () => addLayer('text') },
    { label: 'Nieuwe rechthoek', onClick: () => addLayer('shape') },
    { label: 'Nieuwe ellips', onClick: () => addLayer('shape', (l) => void ((l.shape!.kind = 'ellipse'), (l.name = 'Ellips'), (l.height = l.width))) },
    { label: 'Pen tool', shortcut: 'G', onClick: () => S().setTool('pen') }
  ])
}

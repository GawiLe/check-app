// Overzicht van alle sneltoetsen (Help → Sneltoetsen, of ?). De afhandeling staat in App.tsx;
// letters en haakjes worden op de fysieke toets herkend (e.code), zodat ze met elk toetsenbord
// en ook met Option/Alt werken (Option+[ geeft op de Mac anders het teken “).

const isMac = typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
export const K = {
  cmd: isMac ? '⌘' : 'Ctrl+',
  alt: isMac ? '⌥' : 'Alt+',
  shift: isMac ? '⇧' : 'Shift+'
}

export const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Tijdlijn',
    items: [
      ['Spatie', 'Afspelen / pauze'],
      ['Home / End', 'Naar begin / eindframe'],
      ['PageUp / PageDown', `1 frame terug / vooruit (met ${K.shift.replace('+', '')}: 10)`],
      ['J / K', 'Naar vorig / volgend keyframe (van de selectie)'],
      ['I / O', 'Naar in- / uitpunt van de geselecteerde laag'],
      ['[ / ]', 'In- / uitpunt van de laag op de playhead (inkorten)'],
      [`${K.shift}[ / ${K.shift}]`, 'Laag verschuiven zodat hij op de playhead begint / eindigt'],
      ['U', 'Eigenschappen van de selectie uit-/inklappen'],
      ['F9', 'Easy Ease op geselecteerde keyframes'],
      [`${K.shift}F9 / ${K.cmd}${K.shift}F9`, 'Easy Ease In / Out']
    ]
  },
  {
    title: 'Keyframes',
    items: [
      [`${K.alt}${K.shift}P`, 'Keyframe positie op de playhead'],
      [`${K.alt}${K.shift}S`, 'Keyframe schaal'],
      [`${K.alt}${K.shift}R`, 'Keyframe rotatie'],
      [`${K.alt}${K.shift}T`, 'Keyframe dekking']
    ]
  },
  {
    title: 'Lagen',
    items: [
      [`${K.cmd}D`, 'Dupliceren'],
      [`${K.cmd}C / ${K.cmd}X / ${K.cmd}V`, 'Kopiëren / knippen / plakken'],
      [`${K.cmd}G / ${K.cmd}${K.shift}G`, 'Nieuwe compositie / opheffen'],
      [`${K.cmd}] / ${K.cmd}[`, 'Naar voren / naar achteren'],
      [`${K.cmd}${K.shift}] / ${K.cmd}${K.shift}[`, 'Helemaal naar voren / achteren'],
      [`${K.alt}${K.cmd}/`, 'Afbeelding vervangen'],
      ['Enter', 'Naam wijzigen'],
      ['Pijltjes', `1 px verplaatsen (met ${K.shift.replace('+', '')}: 10 px)`],
      ['Delete / ⌫', 'Verwijderen'],
      [`${K.cmd}A / ${K.cmd}${K.shift}A`, 'Alles selecteren / niets selecteren'],
      ['Esc', 'Selectie opheffen']
    ]
  },
  {
    title: 'Uitlijnen (op selectie; één laag op de banner)',
    items: [
      [`${K.alt}A / ${K.alt}H / ${K.alt}D`, 'Links / horizontaal midden / rechts'],
      [`${K.alt}W / ${K.alt}V / ${K.alt}S`, 'Boven / verticaal midden / onder'],
      [`${K.alt}${K.shift}H / ${K.alt}${K.shift}V`, 'Horizontaal / verticaal verdelen']
    ]
  },
  {
    title: 'Gereedschap',
    items: [
      ['V', 'Selecteren'],
      ['T', 'Tekst'],
      ['R / E', 'Rechthoek / ellips'],
      ['G', 'Pen tool']
    ]
  },
  {
    title: 'Project en werkruimte',
    items: [
      [`${K.cmd}S`, 'Opslaan'],
      [`${K.cmd}N / ${K.cmd}O`, 'Nieuw / openen (in een nieuw tabblad)'],
      [`${K.cmd}W`, 'Tabblad sluiten'],
      ['Ctrl+Tab / Ctrl+Shift+Tab', 'Volgend / vorig projecttabblad'],
      [`${K.cmd}E`, 'Exporteren'],
      [`${K.cmd}Z / ${K.cmd}${K.shift}Z`, 'Ongedaan maken / opnieuw'],
      ['`', 'Paneel onder de muis maximaliseren'],
      [`? / ${K.cmd}/`, 'Dit overzicht']
    ]
  }
]

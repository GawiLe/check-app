import { useState } from 'react'
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalSpaceBetween,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalSpaceBetween
} from 'lucide-react'
import type { AlignMode } from '@shared/align'
import { alignSelection, distributeSelection } from '../lib/actions'

const KEY = 'bs-align-to'
const load = (): 'selection' | 'canvas' => {
  try {
    return localStorage.getItem(KEY) === 'canvas' ? 'canvas' : 'selection'
  } catch {
    return 'selection'
  }
}

const ALIGN: [AlignMode, typeof AlignStartVertical, string][] = [
  ['left', AlignStartVertical, 'Links uitlijnen'],
  ['hcenter', AlignCenterVertical, 'Horizontaal centreren'],
  ['right', AlignEndVertical, 'Rechts uitlijnen'],
  ['top', AlignStartHorizontal, 'Boven uitlijnen'],
  ['vcenter', AlignCenterHorizontal, 'Verticaal centreren'],
  ['bottom', AlignEndHorizontal, 'Onder uitlijnen']
]

/** Uitlijnen en verdelen. Eén laag wordt altijd op de banner uitgelijnd. */
export function AlignBar({ count }: { count: number }) {
  const [to, setTo] = useState(load)
  const target = count === 1 ? 'canvas' : to
  const pick = (v: 'selection' | 'canvas') => {
    setTo(v)
    try {
      localStorage.setItem(KEY, v)
    } catch {
      /* alleen deze sessie */
    }
  }
  const canDistribute = target === 'canvas' || count >= 3
  return (
    <div className="align-bar">
      <div className="align-buttons">
        {ALIGN.map(([m, Icon, label]) => (
          <button key={m} className="icon sm" title={`${label} (op ${target === 'canvas' ? 'de banner' : 'de selectie'})`} onClick={() => alignSelection(m, target)}>
            <Icon size={15} />
          </button>
        ))}
        <span className="vsep" />
        <button
          className="icon sm"
          disabled={!canDistribute}
          title={canDistribute ? 'Horizontaal verdelen (gelijke tussenruimte)' : 'Verdelen: selecteer minimaal 3 lagen, of kies "Banner"'}
          onClick={() => distributeSelection('h', target)}
        >
          <AlignHorizontalSpaceBetween size={15} />
        </button>
        <button
          className="icon sm"
          disabled={!canDistribute}
          title={canDistribute ? 'Verticaal verdelen (gelijke tussenruimte)' : 'Verdelen: selecteer minimaal 3 lagen, of kies "Banner"'}
          onClick={() => distributeSelection('v', target)}
        >
          <AlignVerticalSpaceBetween size={15} />
        </button>
      </div>
      <div className="seg align-to">
        <button className={target === 'selection' ? 'on' : ''} disabled={count === 1} onClick={() => pick('selection')} title="Lagen op elkaar uitlijnen">
          Selectie
        </button>
        <button className={target === 'canvas' ? 'on' : ''} onClick={() => pick('canvas')} title="Op de banner uitlijnen">
          Banner
        </button>
      </div>
    </div>
  )
}

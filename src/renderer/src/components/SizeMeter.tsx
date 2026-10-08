import { useEffect, useState } from 'react'
import { TARGETS } from '@shared/specs'
import type { ExportTarget } from '@shared/types'
import { useStore } from '../store'

const kb = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1).replace(/\.0$/, '')} MB` : `${Math.round(b / 1024)} KB`)

/**
 * Live KB-teller: schat (rustig, na elke wijziging) hoe groot de export van het huidige formaat wordt,
 * voor het strengste platform dat aanstaat. Groen = ruim binnen de grens, oranje = bijna, rood = te groot.
 */
export function SizeMeter() {
  const project = useStore((s) => s.project)
  const dir = useStore((s) => s.dir)
  const compId = useStore((s) => s.compId)
  const [size, setSize] = useState<{ zipBytes: number; initialLoadBytes: number; key: string } | null>(null)

  const targets: ExportTarget[] = project?.targets.length ? project.targets : ['cm360']
  // Strengste grens: de kleinste van (max. ZIP, initial load) over de gekozen platforms
  const target = targets.reduce((a, b) => (Math.min(TARGETS[b].maxZipBytes, TARGETS[b].initialLoadBytes) < Math.min(TARGETS[a].maxZipBytes, TARGETS[a].initialLoadBytes) ? b : a))
  const key = `${dir}|${compId}|${target}`

  useEffect(() => {
    if (!project || !dir || !compId || !project.compositions.some((c) => c.id === compId)) return
    let stale = false
    const timer = setTimeout(() => {
      window.bs
        .estimateSize(dir, project, compId, target)
        .then((r) => !stale && setSize({ ...r, key }))
        .catch(() => {})
    }, 900)
    return () => {
      stale = true
      clearTimeout(timer)
    }
  }, [project, dir, compId, target, key])

  if (!size || size.key !== key) return null
  const spec = TARGETS[target]
  const zipRatio = size.zipBytes / spec.maxZipBytes
  const initRatio = size.initialLoadBytes / spec.initialLoadBytes
  const ratio = Math.max(zipRatio, initRatio)
  const limit = zipRatio >= initRatio ? spec.maxZipBytes : spec.initialLoadBytes
  const shown = zipRatio >= initRatio ? size.zipBytes : size.initialLoadBytes
  const level = ratio > 1 ? 'bad' : ratio > 0.85 ? 'warn' : 'ok'
  return (
    <div
      className={`size-meter ${level}`}
      title={
        `Geschatte grootte bij export (${spec.label}):\n` +
        `ZIP ≈ ${kb(size.zipBytes)} (max. ${kb(spec.maxZipBytes)})\n` +
        `Initial load ≈ ${kb(size.initialLoadBytes)} (richtlijn ${kb(spec.initialLoadBytes)})` +
        (project?.optimizeImages ? '\nAfbeeldingen worden geoptimaliseerd.' : '\nTip: zet bij Export "Afbeeldingen optimaliseren" aan.')
      }
    >
      <span className="dot" />≈ {kb(shown)} <span className="faint">/ {kb(limit)}</span>
    </div>
  )
}

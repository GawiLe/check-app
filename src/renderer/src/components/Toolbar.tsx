import { addLayer, openProject, regenerateWriteOn, save } from '../lib/actions'
import { useStore } from '../store'

export function Toolbar() {
  const project = useStore((s) => s.project)!
  const dirty = useStore((s) => s.dirty)
  const s = useStore.getState

  return (
    <div className="toolbar">
      <span className="title">
        {project.name}
        {dirty ? ' •' : ''}
      </span>
      <button onClick={() => s().setDialog('new')}>Nieuw</button>
      <button onClick={() => openProject()}>Open</button>
      <button onClick={save} disabled={!dirty}>
        Opslaan
      </button>
      <div className="sep" />
      <span className="muted">Laag:</span>
      <button onClick={() => addLayer('text')}>T Tekst</button>
      <button onClick={() => addLayer('shape')}>▭ Vorm</button>
      <button
        onClick={() => {
          const l = addLayer('writeon', (x) => {
            x.writeon!.fontId = useStore.getState().project?.fonts[0]?.id ?? null
          })
          if (l) void regenerateWriteOn(l.id)
        }}
      >
        ✎ Write-on
      </button>
      <button onClick={() => s().setDialog('saveBoilerplate')}>Opslaan als boilerplate</button>
      <div className="spacer" />
      <button onClick={() => s().setDialog('settings')}>Instellingen</button>
      <button className="primary" onClick={() => s().setDialog('export')}>
        Exporteren
      </button>
    </div>
  )
}

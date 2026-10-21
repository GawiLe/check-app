import { Component, type ReactNode } from 'react'

/**
 * Vangnet: gaat er bij het tekenen iets mis, dan blijft de app bruikbaar. Je werk staat nog in het
 * geheugen (en in de herstelkopie); "Opnieuw proberen" tekent het onderdeel opnieuw.
 */
export class ErrorBoundary extends Component<{ children: ReactNode; label?: string }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    console.error(`Fout in ${this.props.label ?? 'de app'}:`, error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="error-boundary">
        <strong>Er ging iets mis{this.props.label ? ` in ${this.props.label}` : ''}.</strong>
        <div className="faint">{this.state.error.message}</div>
        <div className="actions">
          <button onClick={() => this.setState({ error: null })}>Opnieuw proberen</button>
        </div>
        <div className="faint">Je werk is niet weg: sla op met Cmd/Ctrl+S, of maak de laatste stap ongedaan.</div>
      </div>
    )
  }
}

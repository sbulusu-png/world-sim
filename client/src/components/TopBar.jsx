import './TopBar.css'

function TopBar({ worldState, simRunning, onStart, onPause, onReset, loading }) {
  const time = worldState?.config?.time
  const nations = worldState?.nations ?? []

  const year = time?.year ?? 2026
  const turn = worldState?.config?.turn ?? 0

  // Gold: derived from total resources
  const totalResources = nations.reduce((sum, n) => sum + (n.resources || 0), 0)
  const gold = nations.length > 0 ? (totalResources / 580 * 1.2).toFixed(1) : '0.0'

  // Stability: peace ratio + trust average
  const trustValues = nations.flatMap(n => Object.values(n.trust || {}))
  const avgTrust = trustValues.length > 0
    ? trustValues.reduce((a, b) => a + b, 0) / trustValues.length
    : 0
  const peaceCount = nations.filter(n => n.status === 'peace').length
  const stability = nations.length > 0
    ? Math.round((peaceCount / nations.length) * 70 + ((avgTrust + 100) / 200) * 30)
    : 0

  return (
    <header className="topbar">
      <div className="topbar-left">
        <h1 className="topbar-brand">EUROSIM</h1>
      </div>

      <div className="topbar-center">
        <div className="topbar-stat">
          <span className="stat-label">YEAR:</span>
          <span className="stat-value">{year}</span>
        </div>
        <div className="topbar-stat">
          <span className="stat-label">GOLD:</span>
          <span className="stat-value stat-value--gold">{gold}M</span>
        </div>
        <div className="topbar-stat">
          <span className="stat-label">STABILITY:</span>
          <span className="stat-value">{stability}%</span>
        </div>
        <div className="topbar-stat">
          <span className="stat-label">TURN:</span>
          <span className="stat-value">{turn}</span>
        </div>
      </div>

      <div className="topbar-right">
        <button
          className={`topbar-btn ${simRunning ? 'topbar-btn--active' : ''}`}
          onClick={simRunning ? onPause : onStart}
          title={simRunning ? 'Pause Simulation' : 'Start Simulation'}
        >
          {simRunning ? '⏸' : '▶'}
        </button>
        <button
          className="topbar-btn"
          onClick={onReset}
          disabled={loading}
          title="Reset Simulation"
        >
          ↺
        </button>
        <button className="topbar-btn" title="Home">⌂</button>
        <button className="topbar-btn" title="Menu">☰</button>
      </div>
    </header>
  )
}

export default TopBar

import './NationPanel.css'

const PERSONALITY_COLORS = {
  diplomatic:    '#34d399',
  opportunistic: '#fbbf24',
  aggressive:    '#f87171',
  defensive:     '#818cf8',
}

const EVENT_TYPE_COLORS = {
  attack:   '#f87171',
  sanction: '#fb923c',
  ally:     '#60a5fa',
  trade:    '#34d399',
  support:  '#a78bfa',
  betray:   '#fb923c',
  neutral:  '#6b7280',
}

const STATUS_COLORS = {
  peace:   '#34d399',
  tension: '#fbbf24',
  war:     '#f87171',
}

function TrustBar({ label, score }) {
  const safeScore = typeof score === 'number' && !isNaN(score) ? score : 0
  const pct   = Math.max(0, Math.min(100, ((safeScore + 100) / 200) * 100))
  const color = safeScore >= 30 ? '#34d399' : safeScore >= 0 ? '#fbbf24' : '#f87171'
  return (
    <div className="trust-row">
      <span className="trust-label">{label}</span>
      <div className="trust-bar-bg">
        <div className="trust-bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="trust-score" style={{ color }}>
        {safeScore > 0 ? '+' : ''}{safeScore}
      </span>
    </div>
  )
}

/**
 * SidePanel — shows live world state for the selected nation.
 * Falls back to empty state when nothing is selected.
 */
function SidePanel({ selectedNation, worldState, turnSummary }) {
  if (!selectedNation) {
    return (
      <div className="nation-panel">
        <p className="no-data" style={{ marginTop: '2rem', textAlign: 'center' }}>
          Click a nation to inspect it
        </p>
      </div>
    )
  }

  // Use live data if available; otherwise show loading placeholder
  const nation = worldState?.nationMap?.[selectedNation]

  if (!nation) {
    return (
      <div className="nation-panel">
        <p className="no-data" style={{ marginTop: '2rem', textAlign: 'center' }}>
          Loading nation data…
        </p>
      </div>
    )
  }

  const personalityColor  = PERSONALITY_COLORS[nation.personality] ?? '#9ca3af'
  const statusColor       = STATUS_COLORS[nation.status] ?? '#6b7280'
  const eventLog          = worldState?.config?.eventLog ?? []
  const relevantEvents    = eventLog
    .filter(e => e.source === selectedNation || e.target === selectedNation)
    .slice(-10)
    .reverse()

  return (
    <div className="nation-panel">
      {/* Header */}
      <div className="panel-header">
        <h2 className="panel-nation-name">{nation.name}</h2>
        <span
          className="personality-badge"
          style={{ color: personalityColor, borderColor: personalityColor }}
        >
          {nation.personality}
        </span>
      </div>

      {/* Status + Resources */}
      <section className="panel-section">
        <h3 className="section-title">Status</h3>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ color: statusColor, fontWeight: 600, fontSize: '0.85rem', textTransform: 'capitalize' }}>
            ● {nation.status}
          </span>
          <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>
            Resources: <strong style={{ color: '#9ca3af' }}>{nation.resources}</strong>
          </span>
        </div>
      </section>

      {/* Alliances */}
      <section className="panel-section">
        <h3 className="section-title">Alliances</h3>
        {nation.alliances.length > 0 ? (
          <div className="alliance-list">
            {nation.alliances.map(id => (
              <span key={id} className="alliance-badge">
                {worldState.nationMap[id]?.name ?? id}
              </span>
            ))}
          </div>
        ) : (
          <p className="no-data">No active alliances</p>
        )}
      </section>

      {/* Trust Scores */}
      <section className="panel-section">
        <h3 className="section-title">Trust Scores</h3>
        <div className="trust-list">
          {Object.entries(nation.trust)
            .sort((a, b) => b[1] - a[1])
            .map(([id, score]) => (
              <TrustBar
                key={id}
                label={worldState.nationMap[id]?.name ?? id}
                score={score}
              />
            ))}
        </div>
      </section>

      {/* Memory Log */}
      {nation.memory && nation.memory.length > 0 && (
        <section className="panel-section">
          <h3 className="section-title">Memory Log</h3>
          <ul className="event-list">
            {nation.memory.slice(-10).reverse().map((entry, i) => (
              <li key={i} className="event-item">
                <span className="event-time">T{entry.turn ?? i}</span>
                <span className="event-dot" style={{ background: '#818cf8' }} />
                <span className="event-text">
                  {typeof entry === 'string'
                    ? entry
                    : (entry.summary ?? `${entry.action ?? '?'} → ${entry.target ?? '?'}`)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* AI Reactions (Phase 7) */}
      {turnSummary && turnSummary.reactions && turnSummary.reactions.length > 0 && (
        <section className="panel-section">
          <h3 className="section-title">AI Reactions (Turn {turnSummary.turn})</h3>
          <ul className="event-list">
            {turnSummary.reactions.map((r, i) => {
              const color = EVENT_TYPE_COLORS[r.decision] ?? '#9ca3af'
              return (
                <li key={i} className="event-item" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span className="event-dot" style={{ background: color }} />
                    <strong style={{ color }}>{r.nationName}</strong>
                    <span style={{ color: '#9ca3af' }}>→</span>
                    <span style={{ color }}>{r.decision}</span>
                    {r.target && (
                      <span style={{ color: '#6b7280' }}>
                        {worldState?.nationMap?.[r.target]?.name ?? r.target}
                      </span>
                    )}
                  </div>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af', paddingLeft: '1.25rem' }}>
                    {r.reasoning}
                  </p>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* Recent Events involving this nation */}
      <section className="panel-section">
        <h3 className="section-title">Recent Events</h3>
        {relevantEvents.length > 0 ? (
          <ul className="event-list">
            {relevantEvents.map((evt, i) => {
              const isSource  = evt.source === selectedNation
              const otherId   = isSource ? evt.target : evt.source
              const otherName = worldState.nationMap[otherId]?.name ?? otherId ?? '—'
              const color     = EVENT_TYPE_COLORS[evt.type] ?? '#9ca3af'
              return (
                <li key={i} className="event-item">
                  <span className="event-time">T{evt.turn ?? i}</span>
                  <span className="event-dot" style={{ background: color }} />
                  <span className="event-text">
                    <strong style={{ color }}>{evt.type}</strong>
                    {otherId && (
                      <span className="event-other"> {isSource ? '→' : '←'} {otherName}</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        ) : (
          <p className="no-data">No events yet this session</p>
        )}
      </section>
    </div>
  )
}

export default SidePanel

import { NATION_META } from '../data/worldData'
import './NationPanel.css'

const PERSONALITY_COLORS = {
  diplomatic:    '#00ff88',
  opportunistic: '#ffc312',
  aggressive:    '#ff4757',
  defensive:     '#0abde3',
}

const EVENT_TYPE_COLORS = {
  attack:   '#ff4757',
  sanction: '#ff8c42',
  ally:     '#4488ff',
  trade:    '#00ff88',
  support:  '#a55eea',
  betray:   '#ff8c42',
  neutral:  '#6b7b8d',
}

const STATUS_COLORS = {
  peace:   '#00ff88',
  tension: '#ffc312',
  war:     '#ff4757',
}

function TrustBar({ label, score }) {
  const safeScore = typeof score === 'number' && !isNaN(score) ? score : 0
  const pct   = Math.max(0, Math.min(100, ((safeScore + 100) / 200) * 100))
  const color = safeScore >= 30 ? '#00ff88' : safeScore >= 0 ? '#ffc312' : '#ff4757'
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

function SidePanel({ selectedNation, targetNation, worldState, turnSummary, onAction, loading }) {
  if (!selectedNation) {
    return (
      <aside className="dossier">
        <div className="dossier-top-header">
          <span className="dossier-label">REGION_DOSSIER</span>
        </div>
        <p className="dossier-empty">SELECT A REGION TO VIEW INTELLIGENCE</p>
      </aside>
    )
  }

  const nation = worldState?.nationMap?.[selectedNation]
  if (!nation) {
    return (
      <aside className="dossier">
        <div className="dossier-top-header">
          <span className="dossier-label">REGION_DOSSIER</span>
        </div>
        <p className="dossier-empty">LOADING INTEL...</p>
      </aside>
    )
  }

  const meta = NATION_META[selectedNation] || {}
  const personalityColor = PERSONALITY_COLORS[nation.personality] ?? '#6b7b8d'
  const statusColor = STATUS_COLORS[nation.status] ?? '#6b7b8d'
  const eventLog = worldState?.config?.eventLog ?? []
  const relevantEvents = eventLog
    .filter(e => e.source === selectedNation || e.target === selectedNation)
    .slice(-6)
    .reverse()

  const canExecute = selectedNation && targetNation && !loading

  const handleDiplomacy = async () => {
    if (!canExecute) return
    await onAction({ type: 'ally', source: selectedNation, target: targetNation })
  }

  return (
    <aside className="dossier">
      {/* Header */}
      <div className="dossier-top-header">
        <span className="dossier-label">REGION_DOSSIER</span>
        <span className="dossier-flag">▣</span>
      </div>

      <div className="dossier-scroll">
        {/* Country Name */}
        <div className="dossier-country">
          <h2 className="dossier-country-name">{nation.name.toUpperCase()}</h2>
          <span className="dossier-personality" style={{ color: personalityColor, borderColor: personalityColor }}>
            {nation.personality}
          </span>
          {nation.experience && (nation.experience.hostilityReceived > 0 || nation.experience.cooperationReceived > 0) && (
            <div className="dossier-experience">
              {nation.experience.hostilityReceived > 0 && (
                <span className="exp-hostile">⚔ {nation.experience.hostilityReceived}</span>
              )}
              {nation.experience.cooperationReceived > 0 && (
                <span className="exp-coop">♦ {nation.experience.cooperationReceived}</span>
              )}
            </div>
          )}
        </div>

        {/* Leader Identity */}
        <div className="dossier-section">
          <div className="dossier-field-label">■ LEADER_IDENTITY</div>
          <div className="dossier-field-value">{meta.leader || 'CLASSIFIED'}</div>
        </div>

        {/* GDP + Population */}
        <div className="dossier-stats-row">
          <div className="dossier-stat-box">
            <span className="dossier-stat-label">GDP_INDEX</span>
            <span className="dossier-stat-value">{meta.gdp || '—'}</span>
          </div>
          <div className="dossier-stat-box">
            <span className="dossier-stat-label">HUMAN_COUNT</span>
            <span className="dossier-stat-value">{meta.population || '—'}</span>
          </div>
        </div>

        {/* Threat Analysis */}
        <div className="dossier-section">
          <div className="dossier-field-label">THREAT_ANALYSIS</div>
          <div className="dossier-threat">
            <span className="threat-icon" style={{ color: statusColor }}>
              {nation.status === 'war' ? '⚠' : nation.status === 'tension' ? '◈' : '⊘'}
            </span>
            <span className="threat-text" style={{ color: statusColor }}>
              ACTIVE_CONFLICTS: {nation.status === 'war' ? 'ENGAGED' : nation.status === 'tension' ? 'ELEVATED' : 'NONE'}
            </span>
          </div>
          {/* Resource bar */}
          <div className="dossier-resource">
            <div className="resource-header">
              <span>RESOURCES</span>
              <span style={{ color: nation.resources < 30 ? 'var(--red)' : nation.resources < 60 ? 'var(--yellow)' : 'var(--accent)' }}>
                {nation.resources}/120
              </span>
            </div>
            <div className="resource-bar-bg">
              <div className="resource-bar-fill" style={{
                width: `${Math.min(100, (nation.resources / 120) * 100)}%`,
                background: nation.resources < 30 ? 'var(--red)' : nation.resources < 60 ? 'var(--yellow)' : 'var(--accent)',
              }} />
            </div>
          </div>
        </div>

        {/* Strategic Intent */}
        {nation.intent && (
          <div className="dossier-section">
            <div className="dossier-field-label">STRATEGIC_INTENT</div>
            <div className="dossier-intent">
              <span className="intent-type" style={{ color: EVENT_TYPE_COLORS[nation.intent.type] ?? '#6b7b8d' }}>
                {nation.intent.type.toUpperCase()}
              </span>
              {nation.intent.target && (
                <>
                  <span className="intent-arrow">→</span>
                  <span className="intent-target">
                    {worldState?.nationMap?.[nation.intent.target]?.name ?? nation.intent.target}
                  </span>
                </>
              )}
              <span className="intent-ttl">{nation.intent.expiresIn}T</span>
            </div>
          </div>
        )}

        {/* Alliance Network */}
        <div className="dossier-section">
          <div className="dossier-field-label">ALLIANCE_NETWORK</div>
          {nation.alliances.length > 0 ? (
            <div className="alliance-list">
              {nation.alliances.map(a => {
                const allyId = typeof a === 'string' ? a : a.id
                const strength = typeof a === 'string' ? 1 : (a.strength || 1)
                return (
                  <span key={allyId} className="alliance-badge" title={`Strength ${strength}/3`}>
                    {worldState.nationMap[allyId]?.name ?? allyId}
                    {strength > 1 && <span className="alliance-stars">{'★'.repeat(strength)}</span>}
                  </span>
                )
              })}
            </div>
          ) : (
            <p className="dossier-no-data">NO ACTIVE PACTS</p>
          )}
        </div>

        {/* Trust Matrix */}
        <div className="dossier-section">
          <div className="dossier-field-label">TRUST_MATRIX</div>
          <div className="trust-list">
            {Object.entries(nation.trust)
              .sort((a, b) => b[1] - a[1])
              .map(([id, score]) => (
                <TrustBar key={id} label={worldState.nationMap[id]?.name ?? id} score={score} />
              ))}
          </div>
        </div>

        {/* Memory Patterns */}
        {nation.patterns && Object.keys(nation.patterns).length > 0 && (
          <div className="dossier-section">
            <div className="dossier-field-label">MEMORY_PATTERNS</div>
            <div className="patterns-list">
              {Object.entries(nation.patterns)
                .sort((a, b) => (b[1].hostile + b[1].friendly) - (a[1].hostile + a[1].friendly))
                .map(([otherId, p]) => {
                  const name = worldState.nationMap[otherId]?.name ?? otherId
                  const isHostile = p.hostile > p.friendly
                  const isFriendly = p.friendly > p.hostile
                  return (
                    <div key={otherId} className="pattern-entry">
                      <span className="pattern-icon" style={{ color: isHostile ? '#ff4757' : isFriendly ? '#00ff88' : '#ffc312' }}>
                        {isHostile ? '⚔' : isFriendly ? '♦' : '◆'}
                      </span>
                      <span className="pattern-name">{name}</span>
                      {p.hostile > 0 && <span className="pattern-hostile">{p.hostile}× hostile</span>}
                      {p.friendly > 0 && <span className="pattern-friendly">{p.friendly}× friendly</span>}
                    </div>
                  )
                })}
            </div>
          </div>
        )}

        {/* System Log */}
        <div className="dossier-section dossier-section--log">
          <div className="dossier-field-label">SYSTEM_LOG_v13.04</div>
          <div className="system-log">
            {relevantEvents.length > 0 ? (
              relevantEvents.map((evt, i) => {
                const isSource = evt.source === selectedNation
                const otherId = isSource ? evt.target : evt.source
                const otherName = worldState.nationMap[otherId]?.name ?? otherId ?? '—'
                return (
                  <div key={i} className="log-entry">
                    <span className="log-prefix">&gt;</span>
                    <span className="log-text">
                      {evt.type?.toUpperCase()} {isSource ? '→' : '←'} {otherName}
                    </span>
                  </div>
                )
              })
            ) : (
              <>
                <div className="log-entry">
                  <span className="log-prefix">&gt;</span>
                  <span className="log-text">ANALYZING TERRITORIAL STABILITY...</span>
                </div>
                <div className="log-entry">
                  <span className="log-prefix">&gt;</span>
                  <span className="log-text">TRADE ROUTES OPERATIONAL...</span>
                </div>
                <div className="log-entry">
                  <span className="log-prefix">&gt;</span>
                  <span className="log-text">DIPLOMATIC CHANNELS: OPEN</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* AI Strategic Analysis — selected nation only */}
        {(() => {
          console.log('[DEBUG SidePanel] selectedNation:', selectedNation, '| turnSummary:', turnSummary ? `T${turnSummary.turn} with ${turnSummary.reactions?.length} reactions` : 'NULL')
          const reaction = turnSummary?.reactions?.find(r => r.nation === selectedNation)
          console.log('[DEBUG SidePanel] matched reaction:', reaction ? `${reaction.nation}|${reaction.source}|${reaction.decision}` : 'NO MATCH', '| reaction IDs:', turnSummary?.reactions?.map(r => r.nation))
          return (
            <div className="dossier-section">
              <div className="dossier-field-label">AI_STRATEGIC_ANALYSIS{turnSummary ? ` (T${turnSummary.turn})` : ''}</div>
              {reaction ? (
                <div className="ai-analysis">
                  <div className="ai-analysis-header">
                    <span className={`ai-source-badge ${reaction.source === 'ai' ? 'ai-source--ai' : reaction.source === 'self' ? 'ai-source--self' : 'ai-source--rule'}`}>
                      {reaction.source === 'ai' ? 'AI' : reaction.source === 'self' ? 'SELF' : 'RULE'}
                    </span>
                    <span className="ai-decision">
                      {reaction.decision?.toUpperCase()}{reaction.target ? ` → ${worldState?.nationMap?.[reaction.target]?.name ?? reaction.target}` : ''}
                    </span>
                  </div>
                  <p className="ai-reasoning">{reaction.reasoning}</p>
                </div>
              ) : (
                <p className="dossier-no-data">Awaiting strategic decision...</p>
              )}
            </div>
          )
        })()}

        {/* Memory Log */}
        {nation.memory && nation.memory.length > 0 && (
          <div className="dossier-section">
            <div className="dossier-field-label">MEMORY_LOG</div>
            <div className="system-log">
              {nation.memory.slice(-8).reverse().map((entry, i) => (
                <div key={i} className="log-entry">
                  <span className="log-prefix">T{entry.turn ?? i}</span>
                  <span className="log-text">
                    {typeof entry === 'string'
                      ? entry
                      : (entry.summary ?? `${entry.action ?? '?'} → ${entry.target ?? '?'}`)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CTA Button */}
      <button
        className="dossier-cta"
        disabled={!canExecute}
        onClick={handleDiplomacy}
      >
        INITIATE_DIPLOMACY
      </button>
    </aside>
  )
}

export default SidePanel

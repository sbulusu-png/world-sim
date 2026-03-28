import { useState } from 'react'
import './DebugConsole.css'

function DebugConsole({ debugStats, turnSummary }) {
  const [collapsed, setCollapsed] = useState(true)

  if (!debugStats) return null

  const aiCalls = debugStats.totalApiCalls ?? 0
  const aiSuccesses = debugStats.totalApiSuccesses ?? 0
  const aiFailures = debugStats.totalApiFailures ?? 0
  const aiDecisions = debugStats.aiDecisionCount ?? 0
  const fallbackDecisions = debugStats.fallbackDecisionCount ?? 0
  const autoAI = debugStats.aiAutoDecisionCount ?? 0
  const autoFallback = debugStats.aiAutoFallbackCount ?? 0
  const lastError = debugStats.lastApiError ?? null
  const lastCall = debugStats.lastApiCallTime ?? null
  const hasApiKey = debugStats.hasApiKey ?? false

  const totalDecisions = aiDecisions + fallbackDecisions + autoAI + autoFallback
  const aiRate = totalDecisions > 0 ? Math.round(((aiDecisions + autoAI) / totalDecisions) * 100) : 0
  const isAIWorking = aiCalls > 0 && aiSuccesses > 0

  const reactionSources = turnSummary?.reactions?.reduce((acc, r) => {
    acc[r.source] = (acc[r.source] || 0) + 1
    return acc
  }, {}) ?? {}

  return (
    <div className={`debug-console ${collapsed ? 'debug-console--collapsed' : ''}`}>
      <button className="debug-toggle" onClick={() => setCollapsed(c => !c)}>
        <span className={`debug-status-dot ${isAIWorking ? 'debug-dot--ok' : 'debug-dot--warn'}`} />
        {collapsed ? 'DEBUG' : 'HIDE'}
      </button>

      {!collapsed && (
        <div className="debug-body">
          <div className="debug-section">
            <div className="debug-label">API_STATUS</div>
            <div className="debug-row">
              <span>Key:</span>
              <span className={hasApiKey ? 'debug-ok' : 'debug-err'}>{hasApiKey ? 'LOADED' : 'MISSING'}</span>
            </div>
            <div className="debug-row">
              <span>Calls:</span>
              <span>{aiCalls} ({aiSuccesses}✓ {aiFailures}✗)</span>
            </div>
            {lastCall && (
              <div className="debug-row">
                <span>Last:</span>
                <span>{new Date(lastCall).toLocaleTimeString()}</span>
              </div>
            )}
            {lastError && (
              <div className="debug-row debug-err">
                <span>Err:</span>
                <span>{lastError}</span>
              </div>
            )}
          </div>

          <div className="debug-section">
            <div className="debug-label">DECISION_STATS</div>
            <div className="debug-row">
              <span>AI Rate:</span>
              <span className={aiRate > 50 ? 'debug-ok' : 'debug-warn'}>{aiRate}%</span>
            </div>
            <div className="debug-row">
              <span>React AI/FB:</span>
              <span>{aiDecisions} / {fallbackDecisions}</span>
            </div>
            <div className="debug-row">
              <span>Auto AI/FB:</span>
              <span>{autoAI} / {autoFallback}</span>
            </div>
          </div>

          {turnSummary && (
            <div className="debug-section">
              <div className="debug-label">LAST_TURN (T{turnSummary.turn})</div>
              <div className="debug-row">
                <span>Reactions:</span>
                <span>{turnSummary.reactions?.length ?? 0}</span>
              </div>
              {Object.entries(reactionSources).map(([src, cnt]) => (
                <div key={src} className="debug-row">
                  <span>{src}:</span>
                  <span>{cnt}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DebugConsole

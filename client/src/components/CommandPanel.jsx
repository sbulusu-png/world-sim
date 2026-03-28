import { useState } from 'react'
import './CommandPanel.css'

const NAV_ITEMS = [
  { id: 'diplomacy',  label: 'DIPLOMACY',  icon: '◆' },
  { id: 'economy',    label: 'ECONOMY',    icon: '◈' },
  { id: 'military',   label: 'MILITARY',   icon: '△' },
  { id: 'technology', label: 'TECHNOLOGY', icon: '◎' },
  { id: 'events',     label: 'EVENTS',     icon: '☰' },
]

const TACTICAL_OPS = [
  { id: 'attack',   label: 'ATTACK',   icon: '⊕' },
  { id: 'ally',     label: 'ALLY',     icon: '⊞' },
  { id: 'sanction', label: 'SANCTION', icon: '⊘' },
  { id: 'trade',    label: 'TRADE',    icon: '⊛' },
  { id: 'support',  label: 'SUPPORT',  icon: '⊜' },
  { id: 'betray',   label: 'BETRAY',   icon: '⊗' },
]

function CommandPanel({ selectedNation, targetNation, onTargetChange, worldState, onAction, loading }) {
  const [activeNav, setActiveNav] = useState('diplomacy')
  const [pendingAction, setPendingAction] = useState(null)

  const nations = worldState?.nations ?? []
  const otherNations = nations.filter(n => n.id !== selectedNation)

  async function handleAction(actionId) {
    if (!selectedNation || !targetNation) return
    setPendingAction(actionId)
    try {
      await onAction({ type: actionId, source: selectedNation, target: targetNation })
    } finally {
      setPendingAction(null)
    }
  }

  const disabled = loading || !selectedNation || !targetNation

  return (
    <nav className="command-panel">
      <div className="cmd-header">
        <span className="cmd-header-label">COMMAND_VOICE</span>
        <span className="cmd-header-status">SECTOR_01_ACTIVE</span>
      </div>

      <div className="cmd-nav">
        {NAV_ITEMS.map(item => (
          <button
            key={item.id}
            className={`cmd-nav-item ${activeNav === item.id ? 'cmd-nav-item--active' : ''}`}
            onClick={() => setActiveNav(item.id)}
          >
            <span className="cmd-nav-icon">{item.icon}</span>
            <span className="cmd-nav-label">{item.label}</span>
          </button>
        ))}
      </div>

      <div className="cmd-divider">
        <span className="cmd-divider-label">TACTICAL_OPS</span>
      </div>

      {/* Target selector */}
      {selectedNation && (
        <div className="cmd-target-select">
          <select
            className="cmd-select"
            value={targetNation || ''}
            onChange={e => onTargetChange(e.target.value || null)}
            disabled={!selectedNation || loading}
          >
            <option value="">— TARGET —</option>
            {otherNations.map(n => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
        </div>
      )}

      <div className="cmd-tactical">
        {TACTICAL_OPS.map(op => (
          <button
            key={op.id}
            className={`cmd-tac-btn ${pendingAction === op.id ? 'cmd-tac-btn--pending' : ''}`}
            disabled={disabled || pendingAction !== null}
            onClick={() => handleAction(op.id)}
          >
            <span className="cmd-tac-icon">{op.icon}</span>
            <span className="cmd-tac-label">{op.label}</span>
          </button>
        ))}
      </div>

      <div className="cmd-footer">
        <button className="cmd-settings-btn">
          <span className="cmd-nav-icon">⚙</span>
          <span className="cmd-nav-label">SETTINGS</span>
        </button>
      </div>
    </nav>
  )
}

export default CommandPanel

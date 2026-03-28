import { useState, useCallback } from 'react'
import NationRegion from './NationRegion'
import EventArrows from './EventArrows'
import { NATIONS, DUMMY_EVENTS, NATION_CENTERS } from '../data/worldData'
import './MapView.css'

function getRelationship(perspectiveId, nationId, worldState, targetId) {
  if (nationId === targetId && targetId !== perspectiveId) return 'target'
  if (!perspectiveId || perspectiveId === nationId) return 'self'
  const map = worldState?.nationMap
  const perspective = map?.[perspectiveId]
  if (!perspective) return 'neutral'
  if (perspective.alliances.some(a => (typeof a === 'string' ? a : a.id) === nationId)) return 'allied'
  const trust = perspective.trust[nationId] ?? 0
  if (trust <= -15) return 'hostile'
  return 'neutral'
}

function MapView({ selectedNation, targetNation, onNationClick, worldState }) {
  const [zoom, setZoom] = useState(1)
  const [mouseCoords, setMouseCoords] = useState({ lat: '52.5200', lng: '13.4050' })

  const liveLog = worldState?.config?.eventLog
  const arrowEvents = liveLog && liveLog.length > 0
    ? liveLog.slice(-5).map((e, i) => ({
        id: e.turn ?? i,
        type: e.type,
        attacker: e.source,
        target: e.target,
        label: e.description?.substring(0, 30) ?? e.type,
        time: `T${e.turn ?? i}`,
      })).filter(e => e.attacker && e.target && NATION_CENTERS[e.attacker] && NATION_CENTERS[e.target])
    : DUMMY_EVENTS

  const handleMouseMove = useCallback((e) => {
    const svg = e.currentTarget
    const rect = svg.getBoundingClientRect()
    const x = ((e.clientX - rect.left) / rect.width) * 800
    const y = ((e.clientY - rect.top) / rect.height) * 550
    const lat = (72 - (y / 550) * 37).toFixed(4)
    const lng = (-10 + (x / 800) * 55).toFixed(4)
    setMouseCoords({ lat, lng })
  }, [])

  const baseW = 800, baseH = 550
  const w = baseW / zoom, h = baseH / zoom
  const vbX = (baseW - w) / 2, vbY = (baseH - h) / 2

  const selectedCenter = selectedNation ? NATION_CENTERS[selectedNation] : null
  const targetCenter = targetNation && targetNation !== selectedNation ? NATION_CENTERS[targetNation] : null

  return (
    <div className="map-view">
      <svg
        viewBox={`${vbX} ${vbY} ${w} ${h}`}
        xmlns="http://www.w3.org/2000/svg"
        className="europe-svg"
        onMouseMove={handleMouseMove}
      >
        <rect x={vbX} y={vbY} width={w} height={h} fill="#080c12" />

        {/* Grid lines */}
        <g stroke="#0e1a28" strokeWidth="0.5" opacity="0.4">
          {[100, 200, 300, 400, 500, 600, 700].map(x => (
            <line key={`v${x}`} x1={x} y1="0" x2={x} y2="550" />
          ))}
          {[100, 200, 300, 400, 500].map(y => (
            <line key={`h${y}`} x1="0" y1={y} x2="800" y2={y} />
          ))}
        </g>

        {NATIONS.map(nation => (
          <NationRegion
            key={nation.id}
            nation={nation}
            isSelected={selectedNation === nation.id}
            isTarget={targetNation === nation.id}
            relationship={getRelationship(selectedNation, nation.id, worldState, targetNation)}
            onClick={onNationClick}
          />
        ))}

        <EventArrows events={arrowEvents} />

        {/* "Home Region" label */}
        {selectedCenter && (
          <g transform={`translate(${selectedCenter.x - 50}, ${selectedCenter.y + 25})`}>
            <rect width="100" height="20" fill="rgba(8,12,18,0.7)" stroke="#f59e0b" strokeWidth="1" rx="1" />
            <text x="50" y="14" textAnchor="middle" fill="#f59e0b" fontSize="9"
              fontFamily="'Share Tech Mono', monospace" letterSpacing="0.06em">
              Home Region
            </text>
          </g>
        )}

        {/* "Target" label */}
        {targetCenter && (
          <g transform={`translate(${targetCenter.x - 30}, ${targetCenter.y - 45})`}>
            <rect width="60" height="18" fill="rgba(8,12,18,0.7)" stroke="#00ff88" strokeWidth="1" rx="1" />
            <text x="30" y="13" textAnchor="middle" fill="#00ff88" fontSize="9"
              fontFamily="'Share Tech Mono', monospace" letterSpacing="0.06em">
              Target
            </text>
          </g>
        )}
      </svg>

      {/* HUD Overlay */}
      <div className="map-hud">
        <div className="map-zoom">
          <button className="zoom-btn" onClick={() => setZoom(z => Math.min(3, z + 0.25))}>+</button>
          <button className="zoom-btn" onClick={() => setZoom(z => Math.max(0.5, z - 0.25))}>−</button>
        </div>
        <div className="map-coords">
          <div className="coord-line">
            <span className="coord-icon">◎</span>
            <span className="coord-label">LAT:</span>
            <span className="coord-value">{mouseCoords.lat}° {Number(mouseCoords.lat) >= 0 ? 'N' : 'S'}</span>
          </div>
          <div className="coord-line">
            <span className="coord-icon" style={{ visibility: 'hidden' }}>◎</span>
            <span className="coord-label">LNG:</span>
            <span className="coord-value">{mouseCoords.lng}° {Number(mouseCoords.lng) >= 0 ? 'E' : 'W'}</span>
          </div>
          <div className="coord-line">
            <span className="coord-status-icon">■</span>
            <span className="coord-status">SYSTEM_LINK: ESTABLISHED</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default MapView

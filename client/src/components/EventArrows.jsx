import { NATION_CENTERS } from '../data/worldData'
import './EventArrows.css'

const EVENT_STYLES = {
  attack:   { color: '#ef4444', strokeWidth: 2.5, dash: undefined },
  sanction: { color: '#f97316', strokeWidth: 1.5, dash: '5 3' },
  alliance: { color: '#60a5fa', strokeWidth: 1.5, dash: undefined },
  ally:     { color: '#60a5fa', strokeWidth: 1.5, dash: undefined },
  trade:    { color: '#34d399', strokeWidth: 1.5, dash: '3 2' },
  betray:   { color: '#a855f7', strokeWidth: 2.5, dash: undefined },
  support:  { color: '#38bdf8', strokeWidth: 1.5, dash: '6 2' },
  neutral:  { color: '#6b7280', strokeWidth: 1,   dash: '2 4' },
}

const ALL_TYPES = Object.keys(EVENT_STYLES)

function shortenLine(x1, y1, x2, y2, amount = 24) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 2) return { x1, y1, x2, y2 }
  const ux = dx / len
  const uy = dy / len
  return {
    x1: x1 + ux * amount,
    y1: y1 + uy * amount,
    x2: x2 - ux * amount,
    y2: y2 - uy * amount,
  }
}

/**
 * Renders SVG event arrows inside the map SVG.
 * Must be a child of an <svg> element.
 */
function EventArrows({ events }) {
  return (
    <g className="event-arrows">
      <defs>
        {ALL_TYPES.map(type => (
          <marker
            key={type}
            id={`arrowhead-${type}`}
            markerWidth="8"
            markerHeight="8"
            refX="6"
            refY="3"
            orient="auto"
          >
            <path d="M0,0 L0,6 L8,3 z" fill={EVENT_STYLES[type].color} />
          </marker>
        ))}
      </defs>

      {events.map((evt, idx) => {
        const from = NATION_CENTERS[evt.attacker]
        const to   = NATION_CENTERS[evt.target]
        if (!from || !to) return null

        const resolvedType = EVENT_STYLES[evt.type] ? evt.type : 'alliance'
        const style  = EVENT_STYLES[resolvedType]
        const coords = shortenLine(from.x, from.y, to.x, to.y, 24)
        const midX   = (coords.x1 + coords.x2) / 2
        const midY   = (coords.y1 + coords.y2) / 2 - 12

        return (
          <g key={evt.id}>
            {/* Arrow line + label — fade in, then fade out before expiry */}
            <g className={`arrow-fade-in${evt.fading ? ' arrow-fading' : ''}`}
               style={{ animationDelay: evt.fading ? '0s' : `${idx * 0.35}s` }}>
              <line
                x1={coords.x1} y1={coords.y1}
                x2={coords.x2} y2={coords.y2}
                stroke={style.color}
                strokeWidth={style.strokeWidth}
                strokeDasharray={style.dash}
                markerEnd={`url(#arrowhead-${resolvedType})`}
              />
              <text
                x={midX} y={midY}
                textAnchor="middle"
                fontSize="10"
                fill={style.color}
                fontFamily="sans-serif"
                pointerEvents="none"
                opacity="0.9"
              >
                {evt.label}
              </text>
            </g>

            {/* Pulsing ring at target — delayed to match arrow arrival */}
            <circle
              cx={to.x} cy={to.y} r="18"
              fill="none"
              stroke={style.color}
              strokeWidth="1.5"
              className="target-pulse"
              style={{ animationDelay: `${idx * 0.35 + 0.5}s` }}
            />
          </g>
        )
      })}
    </g>
  )
}

export default EventArrows

const RELATIONSHIP_COLORS = {
  self:    { fill: '#2d1f00', stroke: '#f59e0b', width: 2.5 },
  target:  { fill: '#002e1c', stroke: '#00ff88', width: 2.5 },
  allied:  { fill: '#0d1f3d', stroke: '#2563eb', width: 1.5 },
  hostile: { fill: '#2d0d0d', stroke: '#991b1b', width: 1.5 },
  neutral: { fill: '#111d2b', stroke: '#1b3a5a', width: 1 },
}

function NationRegion({ nation, isSelected, isTarget, relationship = 'neutral', onClick }) {
  const colors = isSelected
    ? RELATIONSHIP_COLORS.self
    : isTarget
    ? RELATIONSHIP_COLORS.target
    : RELATIONSHIP_COLORS[relationship] ?? RELATIONSHIP_COLORS.neutral

  return (
    <g
      className={`nation-region ${isSelected ? 'selected' : isTarget ? 'target' : relationship}`}
      onClick={() => onClick(nation.id)}
      style={{ cursor: 'pointer' }}
    >
      <polygon
        points={nation.points}
        fill={colors.fill}
        stroke={colors.stroke}
        strokeWidth={colors.width}
        strokeLinejoin="round"
      />
      <text
        x={nation.labelX}
        y={nation.labelY}
        textAnchor="middle"
        fill={isSelected ? '#f59e0b' : isTarget ? '#00ff88' : '#5a6a7a'}
        fontSize="11"
        fontWeight="500"
        fontFamily="'Share Tech Mono', 'Courier New', monospace"
        letterSpacing="0.08em"
        pointerEvents="none"
      >
        {nation.label.toUpperCase()}
      </text>
    </g>
  )
}

export default NationRegion

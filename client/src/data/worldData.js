// Shared world data — mirrors server/data/initial-world.json
// Imported by MapView, EventArrows, and NationPanel.

// Nation intelligence metadata (leaders, GDP, population)
export const NATION_META = {
  france:  { leader: 'EMMANUEL MACRON',          gdp: '$2.9T', population: '67.8M' },
  germany: { leader: 'FRANK-WALTER STEINMEIER',  gdp: '$3.8T', population: '83.2M' },
  uk:      { leader: 'CHARLES III',              gdp: '$3.1T', population: '67.7M' },
  russia:  { leader: 'VLADIMIR PUTIN',           gdp: '$1.9T', population: '144.2M' },
  poland:  { leader: 'ANDRZEJ DUDA',             gdp: '$0.7T', population: '37.8M' },
  italy:   { leader: 'SERGIO MATTARELLA',        gdp: '$2.0T', population: '59.0M' },
}

export const NATIONS = [
  {
    id: 'uk',
    label: 'UK',
    labelX: 162,
    labelY: 138,
    points: '128,92 168,76 198,88 202,138 186,172 158,182 128,168 118,138',
  },
  {
    id: 'france',
    label: 'France',
    labelX: 215,
    labelY: 268,
    points: '155,202 218,188 272,206 288,252 268,318 228,348 182,342 152,296 146,248',
  },
  {
    id: 'germany',
    label: 'Germany',
    labelX: 325,
    labelY: 222,
    points: '278,152 342,145 368,168 374,228 356,275 306,282 274,252 266,192',
  },
  {
    id: 'poland',
    label: 'Poland',
    labelX: 422,
    labelY: 228,
    points: '378,162 442,155 464,176 468,238 456,288 402,294 372,262 370,198',
  },
  {
    id: 'italy',
    label: 'Italy',
    labelX: 312,
    labelY: 418,
    points: '278,332 322,322 352,348 356,402 340,452 315,492 288,472 272,428 274,368',
  },
  {
    id: 'russia',
    label: 'Russia',
    labelX: 635,
    labelY: 238,
    points: '472,102 685,92 802,142 802,392 645,412 492,388 462,292 458,188',
  },
]

// Centroid lookup for arrow endpoints — reuses label positions
export const NATION_CENTERS = Object.fromEntries(
  NATIONS.map(n => [n.id, { x: n.labelX, y: n.labelY }])
)

export const DUMMY_WORLD = {
  france:  { label: 'France',  personality: 'diplomatic',    alliances: [{id: 'germany', strength: 2}, {id: 'italy', strength: 2}], trust: { germany: 60, uk: 40, russia: -10, poland: 30, italy: 50 } },
  germany: { label: 'Germany', personality: 'diplomatic',    alliances: [{id: 'france', strength: 2}, {id: 'poland', strength: 2}], trust: { france: 60, uk: 50, russia: -5,  poland: 45, italy: 35 } },
  uk:      { label: 'UK',      personality: 'opportunistic', alliances: [],                  trust: { france: 40, germany: 50, russia: -20, poland: 25, italy: 20 } },
  russia:  { label: 'Russia',  personality: 'aggressive',    alliances: [],                  trust: { france: -10, germany: -5, uk: -20, poland: -30, italy: 0 } },
  poland:  { label: 'Poland',  personality: 'defensive',     alliances: [{id: 'germany', strength: 2}],         trust: { france: 30, germany: 45, uk: 25, russia: -30, italy: 15 } },
  italy:   { label: 'Italy',   personality: 'opportunistic', alliances: [{id: 'france', strength: 2}],          trust: { france: 50, germany: 35, uk: 20, russia: 0,   poland: 15 } },
}

export const DUMMY_EVENTS = [
  { id: 1, type: 'attack',   attacker: 'russia',  target: 'poland',  label: 'Military incursion',  time: '14:02' },
  { id: 2, type: 'sanction', attacker: 'uk',       target: 'russia',  label: 'Economic sanctions',  time: '14:15' },
  { id: 3, type: 'alliance', attacker: 'france',   target: 'germany', label: 'Alliance reaffirmed', time: '14:28' },
]

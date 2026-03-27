const PERSONALITIES = {
  AGGRESSIVE: "aggressive",
  DIPLOMATIC: "diplomatic",
  DEFENSIVE: "defensive",
  OPPORTUNISTIC: "opportunistic",
  ISOLATIONIST: "isolationist",
};

function createNation({
  id,
  name,
  personality,
  alliances = [],
  trust = {},
  memory = [],
  resources = 100,
  status = "peace",
}) {
  return {
    id,
    name,
    personality,
    alliances: alliances.map((a) => ({ ...a })),
    trust: { ...trust },
    memory: [...memory],
    resources,
    status, // "peace" | "tension" | "war"
  };
}

function cloneNation(nation) {
  return {
    ...nation,
    alliances: nation.alliances.map((a) => ({ ...a })),
    trust: { ...nation.trust },
    memory: nation.memory.map((m) => ({ ...m })),
  };
}

module.exports = { createNation, cloneNation, PERSONALITIES };

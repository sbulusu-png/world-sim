const { ACTION_TRUST_DELTAS, ACTIONS } = require("../data/actions");
const { PERSONALITIES } = require("../models/nation");
const { isAlliedWith, getAllianceStrength } = require("./alliances");

// Personality multipliers for how strongly each nation reacts to each action type
const PERSONALITY_BIAS = {
  [PERSONALITIES.AGGRESSIVE]: {
    [ACTIONS.ATTACK]: 1.3,
    [ACTIONS.BETRAY]: 1.3,
    [ACTIONS.ALLY]: 0.8,
    [ACTIONS.SUPPORT]: 0.8,
    [ACTIONS.TRADE]: 0.9,
    [ACTIONS.SANCTION]: 1.1,
    [ACTIONS.NEUTRAL]: 1.0,
  },
  [PERSONALITIES.DIPLOMATIC]: {
    [ACTIONS.ATTACK]: 0.8,
    [ACTIONS.BETRAY]: 0.7,
    [ACTIONS.ALLY]: 1.3,
    [ACTIONS.SUPPORT]: 1.3,
    [ACTIONS.TRADE]: 1.2,
    [ACTIONS.SANCTION]: 0.9,
    [ACTIONS.NEUTRAL]: 1.0,
  },
  [PERSONALITIES.DEFENSIVE]: {
    [ACTIONS.ATTACK]: 1.5,
    [ACTIONS.BETRAY]: 1.5,
    [ACTIONS.ALLY]: 1.1,
    [ACTIONS.SUPPORT]: 1.2,
    [ACTIONS.TRADE]: 1.0,
    [ACTIONS.SANCTION]: 1.2,
    [ACTIONS.NEUTRAL]: 1.0,
  },
  [PERSONALITIES.OPPORTUNISTIC]: {
    [ACTIONS.ATTACK]: 1.1,
    [ACTIONS.BETRAY]: 1.2,
    [ACTIONS.ALLY]: 1.1,
    [ACTIONS.SUPPORT]: 1.1,
    [ACTIONS.TRADE]: 1.3,
    [ACTIONS.SANCTION]: 1.0,
    [ACTIONS.NEUTRAL]: 1.0,
  },
  [PERSONALITIES.ISOLATIONIST]: {
    [ACTIONS.ATTACK]: 0.7,
    [ACTIONS.BETRAY]: 0.8,
    [ACTIONS.ALLY]: 0.7,
    [ACTIONS.SUPPORT]: 0.7,
    [ACTIONS.TRADE]: 0.8,
    [ACTIONS.SANCTION]: 0.8,
    [ACTIONS.NEUTRAL]: 1.0,
  },
};

function clampTrust(val) {
  return Math.max(-100, Math.min(100, Math.round(val)));
}

function getPersonalityBias(personality, action) {
  const biasMap = PERSONALITY_BIAS[personality];
  if (!biasMap) return 1.0;
  return biasMap[action] != null ? biasMap[action] : 1.0;
}

/**
 * Update trust across the world after a source performs an action on a target.
 * Mutates the world.nations trust objects in-place.
 * Returns a changes summary: { [nationId]: { [otherId]: delta } }
 */
function updateTrust(world, sourceId, targetId, action) {
  const source = world.nations.find((n) => n.id === sourceId);
  const target = world.nations.find((n) => n.id === targetId);
  if (!source || !target) return {};

  const baseDelta = ACTION_TRUST_DELTAS[action] || 0;
  const changes = {};

  // --- Primary effect: target updates trust of source (personality-biased) ---
  const targetBias = getPersonalityBias(target.personality, action);
  const targetDelta = Math.round(baseDelta * targetBias);
  target.trust[sourceId] = clampTrust((target.trust[sourceId] || 0) + targetDelta);
  changes[targetId] = { [sourceId]: targetDelta };

  // --- Secondary effect: source updates trust of target (half strength) ---
  const sourceDelta = Math.round(baseDelta * 0.5);
  source.trust[targetId] = clampTrust((source.trust[targetId] || 0) + sourceDelta);
  changes[sourceId] = { [targetId]: sourceDelta };

  // --- Observer effect: third-party nations adjust trust of source ---
  // Alliance strength scales the observer reaction: strength * 15% (1=15%, 2=30%, 3=45%)
  for (const nation of world.nations) {
    if (nation.id === sourceId || nation.id === targetId) continue;

    let observerDelta = 0;
    if (isAlliedWith(nation, targetId)) {
      const strength = getAllianceStrength(nation, targetId);
      const scaleFactor = strength * 0.15;
      observerDelta = Math.round(baseDelta * targetBias * scaleFactor);
    }

    if (observerDelta !== 0) {
      nation.trust[sourceId] = clampTrust((nation.trust[sourceId] || 0) + observerDelta);
      if (!changes[nation.id]) changes[nation.id] = {};
      changes[nation.id][sourceId] = observerDelta;
    }
  }

  return changes;
}

module.exports = { updateTrust, clampTrust, getPersonalityBias };

const { ACTIONS } = require("../data/actions");

/**
 * Pure rule-based fallback decision when AI is unavailable.
 * Uses trust scores, alliances, and personality to decide.
 *
 * @param {object} nation - The nation making the decision
 * @param {object} event - The event to respond to
 * @param {string[]} allNationIds - All valid nation IDs
 * @returns {{ decision: string, target: string|null, reasoning: string }}
 */
function fallbackDecision(nation, event, allNationIds) {
  const sourceId = event.source;
  const targetId = event.target;
  const actionType = event.type;

  const trustOfSource = nation.trust[sourceId] || 0;
  const isAlliedWithSource = nation.alliances.includes(sourceId);
  const isAlliedWithTarget = targetId ? nation.alliances.includes(targetId) : false;

  // If this nation IS the target, respond based on action type
  if (targetId === nation.id) {
    if (actionType === ACTIONS.ATTACK || actionType === ACTIONS.BETRAY) {
      return {
        decision: ACTIONS.ATTACK,
        target: sourceId,
        reasoning: `${nation.name} retaliates against ${sourceId}'s aggression.`,
      };
    }
    if (actionType === ACTIONS.ALLY || actionType === ACTIONS.SUPPORT) {
      return {
        decision: ACTIONS.SUPPORT,
        target: sourceId,
        reasoning: `${nation.name} reciprocates ${sourceId}'s friendly gesture.`,
      };
    }
    if (actionType === ACTIONS.TRADE) {
      return {
        decision: ACTIONS.TRADE,
        target: sourceId,
        reasoning: `${nation.name} accepts the trade offer from ${sourceId}.`,
      };
    }
    if (actionType === ACTIONS.SANCTION) {
      return {
        decision: ACTIONS.SANCTION,
        target: sourceId,
        reasoning: `${nation.name} responds to ${sourceId}'s sanctions with counter-sanctions.`,
      };
    }
  }

  // If an ally is being attacked, come to their defense
  if (isAlliedWithTarget && (actionType === ACTIONS.ATTACK || actionType === ACTIONS.BETRAY)) {
    return {
      decision: ACTIONS.SANCTION,
      target: sourceId,
      reasoning: `${nation.name} sanctions ${sourceId} in defense of ally ${targetId}.`,
    };
  }

  // If an ally is the aggressor, stay neutral (don't oppose ally)
  if (isAlliedWithSource && (actionType === ACTIONS.ATTACK || actionType === ACTIONS.BETRAY)) {
    return {
      decision: ACTIONS.NEUTRAL,
      target: null,
      reasoning: `${nation.name} remains neutral — ${sourceId} is an ally, but their aggression is concerning.`,
    };
  }

  // Personality-driven defaults
  switch (nation.personality) {
    case "aggressive":
      if (trustOfSource < -20) {
        return {
          decision: ACTIONS.SANCTION,
          target: sourceId,
          reasoning: `${nation.name} sees an opportunity to pressure the distrusted ${sourceId}.`,
        };
      }
      break;

    case "diplomatic":
      if (targetId && !isAlliedWithTarget) {
        return {
          decision: ACTIONS.SUPPORT,
          target: targetId,
          reasoning: `${nation.name} reaches out diplomatically to ${targetId} during this crisis.`,
        };
      }
      break;

    case "defensive":
      return {
        decision: ACTIONS.NEUTRAL,
        target: null,
        reasoning: `${nation.name} watches carefully but takes no action at this time.`,
      };

    case "opportunistic":
      // Opportunists look for weak targets
      const lowestTrust = Object.entries(nation.trust)
        .filter(([id]) => id !== nation.id)
        .sort((a, b) => a[1] - b[1])[0];
      if (lowestTrust && lowestTrust[1] < -30) {
        return {
          decision: ACTIONS.SANCTION,
          target: lowestTrust[0],
          reasoning: `${nation.name} exploits the chaos to sanction rival ${lowestTrust[0]}.`,
        };
      }
      break;

    case "isolationist":
      return {
        decision: ACTIONS.NEUTRAL,
        target: null,
        reasoning: `${nation.name} stays out of foreign entanglements.`,
      };
  }

  // Default: stay neutral
  return {
    decision: ACTIONS.NEUTRAL,
    target: null,
    reasoning: `${nation.name} observes the situation and takes no action.`,
  };
}

module.exports = { fallbackDecision };

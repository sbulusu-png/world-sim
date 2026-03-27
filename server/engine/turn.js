const { runAgentReactions } = require("./agent-loop");

/**
 * Process a full turn: run all AI agent reactions after the user's action.
 * Mutates the world state in-place.
 *
 * @param {object} event - The user-triggered event
 * @param {object} world - The mutable world state
 * @returns {Promise<{ reactions: object[], turnSummary: object }>}
 */
async function processTurn(event, world) {
  // Run all agent reactions
  const reactions = await runAgentReactions(event, world);

  // Update world phase based on current nation statuses
  const statuses = world.nations.map((n) => n.status);
  if (statuses.includes("war")) {
    world.config.phase = "war";
  } else if (statuses.includes("tension")) {
    world.config.phase = "tension";
  } else {
    world.config.phase = "peace";
  }

  // Build turn summary
  const turnSummary = {
    turn: event.turn,
    trigger: {
      source: event.source,
      type: event.type,
      target: event.target,
      description: event.description,
    },
    reactions: reactions.map((r) => ({
      nation: r.nation,
      nationName: r.nationName,
      decision: r.decision,
      target: r.target,
      reasoning: r.reasoning,
      source: r.source || "fallback",
    })),
    phase: world.config.phase,
  };

  return { reactions, turnSummary };
}

module.exports = { processTurn };

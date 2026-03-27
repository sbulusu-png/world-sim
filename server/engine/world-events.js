const { appendMemory } = require("./memory");

// Trust modifiers by event category
const CATEGORY_MODIFIERS = {
  military:   { relevant: 5, nonRelevant: -3 },
  economic:   { relevant: 3, nonRelevant: 0 },
  diplomatic: { relevant: 8, nonRelevant: 0 },
  crisis:     { relevant: -5, nonRelevant: 0 },
};

function clampTrust(val) {
  return Math.max(-100, Math.min(100, Math.round(val)));
}

/**
 * Apply mechanical trust effects from a world event.
 *
 * @param {object} world - The full world state
 * @param {object} event - { summary, category, relevantNations }
 * @returns {{ changes: object }} - { nationId: { otherId: delta } }
 */
function applyWorldEventEffects(world, event) {
  if (!event || !event.category || !event.relevantNations) {
    return { changes: {} };
  }

  const mods = CATEGORY_MODIFIERS[event.category];
  if (!mods) return { changes: {} };

  const relevantSet = new Set(event.relevantNations);
  const changes = {};

  for (const nation of world.nations) {
    const isRelevant = relevantSet.has(nation.id);

    for (const other of world.nations) {
      if (nation.id === other.id) continue;

      const otherRelevant = relevantSet.has(other.id);
      let delta = 0;

      if (event.category === "crisis") {
        // Crisis: relevant nations lose trust with ALL others
        if (isRelevant) {
          delta = mods.relevant;
        }
      } else if (isRelevant && otherRelevant) {
        // Both relevant: mutual trust boost
        delta = mods.relevant;
      } else if (event.category === "military" && isRelevant !== otherRelevant) {
        // Military: friction between relevant and non-relevant
        delta = mods.nonRelevant;
      }

      if (delta !== 0) {
        nation.trust[other.id] = clampTrust((nation.trust[other.id] || 0) + delta);
        if (!changes[nation.id]) changes[nation.id] = {};
        changes[nation.id][other.id] = delta;
      }
    }

    // Push memory entry to affected nations
    if (isRelevant) {
      appendMemory(nation, {
        turn: world.config.turn,
        summary: `World event: ${event.summary} — affected trust.`,
        source: "world-event",
        target: null,
        action: event.category,
      });
    }
  }

  return { changes };
}

module.exports = { applyWorldEventEffects };

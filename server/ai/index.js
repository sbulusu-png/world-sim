const { callFeatherless } = require("./featherless");
const { buildPrompt, SYSTEM_PROMPT } = require("./prompt-builder");
const { parseDecision } = require("./decision-parser");
const { fallbackDecision } = require("./fallback");

/**
 * Get a decision for a nation in response to an event.
 * Tries AI first, falls back to rule-based logic on failure.
 *
 * @param {object} nation - The nation making the decision
 * @param {object} event - The event to respond to
 * @param {string[]} allNationIds - All valid nation IDs
 * @param {string|null} worldEvent - Optional real-world context string
 * @returns {Promise<{ decision: string, target: string|null, reasoning: string, source: "ai"|"fallback" }>}
 */
async function getNationDecision(nation, event, allNationIds, worldEvent) {
  // Don't ask a nation to decide about its own action
  if (nation.id === event.source) {
    return {
      decision: "neutral",
      target: null,
      reasoning: `${nation.name} initiated this action.`,
      source: "skip",
    };
  }

  const validTargets = allNationIds.filter((id) => id !== nation.id);

  // Attempt AI decision
  try {
    const userPrompt = buildPrompt(nation, event, worldEvent);
    const rawResponse = await callFeatherless(SYSTEM_PROMPT, userPrompt);

    if (rawResponse) {
      const parsed = parseDecision(rawResponse, validTargets);
      if (parsed) {
        return { ...parsed, source: "ai" };
      }
      console.error(`[AI] Failed to parse response for ${nation.id} — using fallback`);
    }
  } catch (err) {
    console.error(`[AI] Error for ${nation.id}: ${err.message} — using fallback`);
  }

  // Fallback to rule-based decision
  const fb = fallbackDecision(nation, event, allNationIds);
  return { ...fb, source: "fallback" };
}

module.exports = { getNationDecision };

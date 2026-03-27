const { VALID_ACTIONS } = require("../data/actions");

const SYSTEM_PROMPT = `You are an AI advisor for a geopolitical simulation. You represent a specific European nation and must decide how to respond to events based on your nation's personality, alliances, trust scores, and memory.

You MUST respond in EXACTLY this JSON format, nothing else:
{"decision": "<action>", "target": "<nation_id>", "reasoning": "<1-2 sentence explanation>"}

Valid decisions: ${VALID_ACTIONS.join(", ")}

Rules:
- Consider your personality type when deciding
- Trust scores range from -100 (enemy) to 100 (closest ally)
- Positive trust nations deserve support; negative trust nations are threats
- Alliances should be honored unless betrayal is strategically critical
- Keep reasoning brief and in-character for your nation`;

/**
 * Build the user prompt with full nation context for the AI.
 *
 * @param {object} nation - The nation object making the decision
 * @param {object} event - The current event to respond to
 * @param {string|null} worldEvent - Optional real-world event context string
 * @returns {string} The formatted user prompt
 */
function buildPrompt(nation, event, worldEvent) {
  const lines = [];

  lines.push(`You are ${nation.name} (${nation.personality} personality).`);
  lines.push("");

  // Trust scores
  lines.push("Current trust scores:");
  for (const [otherId, score] of Object.entries(nation.trust)) {
    lines.push(`  ${otherId}: ${score}`);
  }
  lines.push("");

  // Alliances
  if (nation.alliances.length > 0) {
    lines.push(`Your alliances: ${nation.alliances.join(", ")}`);
  } else {
    lines.push("You have no current alliances.");
  }
  lines.push("");

  // Recent memory
  if (nation.memory.length > 0) {
    lines.push("Recent events you remember:");
    for (const mem of nation.memory.slice(-5)) {
      lines.push(`  Turn ${mem.turn}: ${mem.summary}`);
    }
    lines.push("");
  }

  // World event context
  if (worldEvent) {
    lines.push(`Real-world context: ${worldEvent}`);
    lines.push("");
  }

  // Current event to respond to
  lines.push(`EVENT: ${event.description}`);
  lines.push(`Source: ${event.source}, Target: ${event.target || "none"}, Type: ${event.type}`);
  lines.push("");
  lines.push("How does your nation respond? Reply with JSON only.");

  return lines.join("\n");
}

module.exports = { buildPrompt, SYSTEM_PROMPT };

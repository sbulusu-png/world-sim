const { VALID_ACTIONS } = require("../data/actions");
const { recallPatterns } = require("../engine/memory");
const { getAlliedIds } = require("../engine/alliances");

const SYSTEM_PROMPT = `You are an AI advisor for a geopolitical simulation. You represent a specific European nation and must decide how to respond to events based on your nation's personality, alliances, trust scores, and memory.

You MUST respond in EXACTLY this JSON format, nothing else:
{"decision": "<action>", "target": "<nation_id>", "reasoning": "<1-2 sentence explanation>"}

Valid decisions: ${VALID_ACTIONS.join(", ")}

Rules:
- Consider your personality type when deciding
- Trust scores range from -100 (enemy) to 100 (closest ally)
- Positive trust nations deserve support; negative trust nations are threats
- Alliances should be honored unless betrayal is strategically critical
- Memory patterns matter: repeated hostility should escalate your response
- Keep reasoning brief and in-character for your nation`;

// Personality descriptions for prompt context
const PERSONALITY_DESCRIPTIONS = {
  aggressive: "military dominance, swift retaliation, and projecting strength. You prefer forceful action and view weakness as an invitation for exploitation.",
  diplomatic: "alliances, negotiation, and stability. You prefer peaceful resolution, building coalitions, and soft power over brute force.",
  defensive: "protecting your borders and people above all. You avoid foreign entanglements unless directly threatened, and you defend allies loyally.",
  opportunistic: "strategic advantage and profit. You exploit chaos, trade with the strong, and pressure the weak. Every crisis is an opportunity.",
  isolationist: "non-intervention and self-sufficiency. You avoid foreign conflicts unless they pose an existential threat to your sovereignty.",
};

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

  // Identity and personality interpretation
  const personalityDesc = PERSONALITY_DESCRIPTIONS[nation.personality] || "balanced decision-making.";
  lines.push(`You are ${nation.name} (${nation.personality} personality).`);
  lines.push(`As a ${nation.personality} nation, you value ${personalityDesc}`);
  lines.push("");

  // Trust scores
  lines.push("Current trust scores:");
  for (const [otherId, score] of Object.entries(nation.trust)) {
    lines.push(`  ${otherId}: ${score}`);
  }
  lines.push("");

  // Alliances
  const allyIds = getAlliedIds(nation);
  if (allyIds.length > 0) {
    lines.push(`Your alliances: ${allyIds.join(", ")}`);
  } else {
    lines.push("You have no current alliances.");
  }
  lines.push("");

  // Memory pattern analysis — give the AI behavioral insights
  if (event.source) {
    const sourcePatterns = recallPatterns(nation, event.source);
    if (sourcePatterns.totalInteractions > 0) {
      lines.push(`Pattern analysis for ${event.source}:`);
      lines.push(`  ${event.source} has been hostile toward you ${sourcePatterns.hostileCount} time(s) and friendly ${sourcePatterns.friendlyCount} time(s). Dominant pattern: ${sourcePatterns.dominantPattern}.`);
      lines.push("");
    }
  }
  if (event.target && event.target !== nation.id && event.target !== event.source) {
    const targetPatterns = recallPatterns(nation, event.target);
    if (targetPatterns.totalInteractions > 0) {
      lines.push(`Pattern analysis for ${event.target}:`);
      lines.push(`  ${event.target} has been hostile toward you ${targetPatterns.hostileCount} time(s) and friendly ${targetPatterns.friendlyCount} time(s). Dominant pattern: ${targetPatterns.dominantPattern}.`);
      lines.push("");
    }
  }

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
    const eventText = typeof worldEvent === "string" ? worldEvent : worldEvent.summary || JSON.stringify(worldEvent);
    lines.push(`Real-world context: ${eventText}`);
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

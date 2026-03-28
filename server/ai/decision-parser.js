const { VALID_ACTIONS } = require("../data/actions");

/**
 * Log when AI makes a creative/unexpected decision so operators can audit.
 * This does NOT reject the decision — AI is allowed to be creative.
 */
function logCreativeDecision(nation, decision, target) {
  if (!nation || !nation.personality) return;

  const trustToTarget = target ? (nation.trust?.[target] ?? 0) : 0;

  // Isolationist attacking someone they don't distrust
  if (nation.personality === "isolationist" && decision === "attack" && trustToTarget >= 0) {
    console.warn(`[AI-Sanity] ${nation.id} (isolationist, trust ${trustToTarget}) chose ATTACK on ${target} — creative but unexpected`);
  }
  // Diplomatic nation choosing betrayal
  if (nation.personality === "diplomatic" && decision === "betray") {
    console.warn(`[AI-Sanity] ${nation.id} (diplomatic) chose BETRAY on ${target} — unusual for personality`);
  }
  // Aggressive nation choosing to ally with a distrusted nation
  if (nation.personality === "aggressive" && decision === "ally" && trustToTarget < -10) {
    console.warn(`[AI-Sanity] ${nation.id} (aggressive, trust ${trustToTarget}) chose ALLY with ${target} — surprising`);
  }
}

/**
 * Parse the AI response text into a structured decision object.
 * Handles JSON extraction from potentially noisy AI output.
 *
 * @param {string} rawText - Raw text from AI response
 * @param {string[]} validTargets - List of valid nation IDs
 * @returns {{ decision: string, target: string|null, reasoning: string } | null}
 */
function parseDecision(rawText, validTargets) {
  if (!rawText || typeof rawText !== "string") {
    console.warn(`🔍 [Parser] REJECTED: rawText is ${rawText === null ? 'null' : typeof rawText}`);
    return null;
  }

  try {
    // Try to extract JSON from the response (AI may wrap it in markdown or extra text)
    const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) {
      console.warn(`🔍 [Parser] REJECTED: No JSON found in: ${rawText.substring(0, 150)}`);
      return null;
    }

    console.log(`🔍 [Parser] Extracted JSON: ${jsonMatch[0].substring(0, 200)}`);
    const parsed = JSON.parse(jsonMatch[0]);

    // Validate decision field
    const decision = (parsed.decision || "").toLowerCase().trim();
    if (!VALID_ACTIONS.includes(decision)) {
      console.warn(`🔍 [Parser] REJECTED: invalid decision "${parsed.decision}" — valid: ${VALID_ACTIONS.join(',')}`);
      return null;
    }

    // Validate target field (optional for some actions)
    let target = (parsed.target || "").toLowerCase().trim() || null;
    if (target && !validTargets.includes(target)) {
      console.warn(`🔍 [Parser] Target "${target}" not in validTargets [${validTargets.join(',')}] — clearing target`);
      target = null; // Invalid target — clear it, don't fail entirely
    }

    // Extract reasoning (sanitize to prevent injection in logs)
    const reasoning = typeof parsed.reasoning === "string"
      ? parsed.reasoning.slice(0, 500)
      : "No reasoning provided.";

    console.log(`🔍 [Parser] SUCCESS: decision=${decision} target=${target} reasoning=${reasoning.substring(0, 80)}`);
    return { decision, target, reasoning };
  } catch (e) {
    console.warn(`🔍 [Parser] JSON PARSE ERROR: ${e.message} | raw: ${rawText.substring(0, 150)}`);
    return null;
  }
}

module.exports = { parseDecision, logCreativeDecision };

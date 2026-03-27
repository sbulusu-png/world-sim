const { VALID_ACTIONS } = require("../data/actions");

/**
 * Parse the AI response text into a structured decision object.
 * Handles JSON extraction from potentially noisy AI output.
 *
 * @param {string} rawText - Raw text from AI response
 * @param {string[]} validTargets - List of valid nation IDs
 * @returns {{ decision: string, target: string|null, reasoning: string } | null}
 */
function parseDecision(rawText, validTargets) {
  if (!rawText || typeof rawText !== "string") return null;

  try {
    // Try to extract JSON from the response (AI may wrap it in markdown or extra text)
    const jsonMatch = rawText.match(/\{[\s\S]*?\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate decision field
    const decision = (parsed.decision || "").toLowerCase().trim();
    if (!VALID_ACTIONS.includes(decision)) return null;

    // Validate target field (optional for some actions)
    let target = (parsed.target || "").toLowerCase().trim() || null;
    if (target && !validTargets.includes(target)) {
      target = null; // Invalid target — clear it, don't fail entirely
    }

    // Extract reasoning (sanitize to prevent injection in logs)
    const reasoning = typeof parsed.reasoning === "string"
      ? parsed.reasoning.slice(0, 500)
      : "No reasoning provided.";

    return { decision, target, reasoning };
  } catch {
    return null;
  }
}

module.exports = { parseDecision };

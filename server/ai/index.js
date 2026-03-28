const { callFeatherless, getApiStats } = require("./featherless");
const { buildPrompt, buildAutonomousPrompt, SYSTEM_PROMPT } = require("./prompt-builder");
const { parseDecision, logCreativeDecision } = require("./decision-parser");
const { fallbackDecision } = require("./fallback");

// --- DEBUG COUNTERS ---
let aiDecisionCount = 0;
let fallbackDecisionCount = 0;
let skipDecisionCount = 0;
let aiAutoDecisionCount = 0;
let aiAutoFallbackCount = 0;

function getDecisionStats() {
  return {
    aiDecisionCount,
    fallbackDecisionCount,
    skipDecisionCount,
    aiAutoDecisionCount,
    aiAutoFallbackCount,
    ...getApiStats(),
  };
}

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
    skipDecisionCount++;
    console.log(`⏭️  [AI-Decision] SKIP self-decision for ${nation.id} (is event source)`);
    return {
      decision: "neutral",
      target: null,
      reasoning: `${nation.name} initiated this action.`,
      source: "skip",
    };
  }

  const validTargets = allNationIds.filter((id) => id !== nation.id);
  console.log(`\n🧠 [AI-Decision] === ${nation.id} REACTION START === event=${event.type} by ${event.source} targeting ${event.target || 'none'}`);

  // Attempt AI decision
  try {
    const userPrompt = buildPrompt(nation, event, worldEvent);
    console.log(`🧠 [AI-Decision] Calling Featherless API for ${nation.id}...`);
    const rawResponse = await callFeatherless(SYSTEM_PROMPT, userPrompt);

    if (rawResponse) {
      console.log(`🧠 [AI-Decision] Got raw response for ${nation.id}: ${rawResponse.substring(0, 150)}`);
      const parsed = parseDecision(rawResponse, validTargets);
      if (parsed) {
        aiDecisionCount++;
        logCreativeDecision(nation, parsed.decision, parsed.target);
        console.log(`✅ [AI-Decision] FINAL for ${nation.id}: decision=${parsed.decision} target=${parsed.target} source=AI | ai_total=${aiDecisionCount} fb_total=${fallbackDecisionCount}`);
        return { ...parsed, source: "ai" };
      }
      console.error(`⚠️  [AI-Decision] PARSE FAILED for ${nation.id} — raw was: ${rawResponse.substring(0, 200)}`);
    } else {
      console.warn(`⚠️  [AI-Decision] NULL RESPONSE for ${nation.id} — API returned nothing`);
    }
  } catch (err) {
    console.error(`❌ [AI-Decision] ERROR for ${nation.id}: ${err.message}`);
  }

  // Fallback to rule-based decision
  fallbackDecisionCount++;
  const fb = fallbackDecision(nation, event, allNationIds);
  console.warn(`⚠️  [AI-Decision] FALLBACK USED for ${nation.id}: decision=${fb.decision} target=${fb.target} | reason=AI_unavailable | fb_total=${fallbackDecisionCount}`);
  console.log(`✅ [AI-Decision] FINAL for ${nation.id}: decision=${fb.decision} target=${fb.target} source=FALLBACK`);
  return { ...fb, source: "fallback" };
}

/**
 * Get an autonomous (proactive) decision for a nation — no triggering event.
 * AI decides what action to take based on the current geopolitical situation.
 * Falls back to null (no action) on failure — caller handles fallback.
 *
 * @param {object} nation - The nation making the decision
 * @param {string[]} allNationIds - All valid nation IDs
 * @param {object} world - The world state (for context)
 * @returns {Promise<{ type: string, target: string, reason: string, source: "ai" }|null>}
 */
async function getAutonomousDecision(nation, allNationIds, world) {
  const validTargets = allNationIds.filter((id) => id !== nation.id);
  console.log(`\n🌍 [AI-Auto] === ${nation.id} AUTONOMOUS DECISION START === personality=${nation.personality} resources=${nation.resources}`);

  try {
    const worldEvent = world.config.worldEvent || null;
    const userPrompt = buildAutonomousPrompt(nation, world, worldEvent);
    console.log(`🌍 [AI-Auto] Calling Featherless API for ${nation.id}...`);
    const rawResponse = await callFeatherless(SYSTEM_PROMPT, userPrompt);

    if (rawResponse) {
      console.log(`🌍 [AI-Auto] Got raw response for ${nation.id}: ${rawResponse.substring(0, 150)}`);
      const parsed = parseDecision(rawResponse, validTargets);
      if (parsed && parsed.decision && parsed.decision !== "neutral") {
        aiAutoDecisionCount++;
        logCreativeDecision(nation, parsed.decision, parsed.target);
        console.log(`✅ [AI-Auto] FINAL for ${nation.id}: type=${parsed.decision} target=${parsed.target} source=AI | ai_auto_total=${aiAutoDecisionCount}`);
        return {
          type: parsed.decision,
          target: parsed.target,
          reason: `[AI] ${parsed.reasoning || `${nation.name} acts strategically.`}`,
          source: "ai",
        };
      }
      console.warn(`⚠️  [AI-Auto] ${nation.id}: parsed but neutral/invalid — decision=${parsed?.decision || 'null'}`);
    } else {
      console.warn(`⚠️  [AI-Auto] ${nation.id}: NULL response from API`);
    }
  } catch (err) {
    console.error(`❌ [AI-Auto] ERROR for ${nation.id}: ${err.message}`);
  }

  aiAutoFallbackCount++;
  console.warn(`⚠️  [AI-Auto] ${nation.id}: Returning null (caller uses rule-based fallback) | auto_fb_total=${aiAutoFallbackCount}`);
  return null; // Caller falls back to rule-based pickAutonomousAction
}

module.exports = { getNationDecision, getAutonomousDecision, getDecisionStats };

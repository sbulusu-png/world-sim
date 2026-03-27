const { fallbackDecision } = require("../ai/fallback");
const { callFeatherless } = require("../ai/featherless");
const { buildPrompt, SYSTEM_PROMPT } = require("../ai/prompt-builder");
const { parseDecision } = require("../ai/decision-parser");
const { updateTrust } = require("./trust");
const { applyAllianceChanges } = require("./alliances");
const { appendMemory, buildMemoryEntry } = require("./memory");
const { createEvent } = require("../models/event");
const { ACTIONS } = require("../data/actions");

// Max nations that get an AI reasoning call (to keep latency low)
const MAX_AI_CALLS = 2;

/**
 * Run agent reactions: every nation except the event source evaluates and responds.
 * Uses rule-based logic for decisions; optionally calls Featherless for reasoning text.
 *
 * @param {object} event - The triggering event { type, source, target, description, turn }
 * @param {object} world - The mutable world state
 * @returns {Promise<object[]>} Array of reaction objects
 */
async function runAgentReactions(event, world) {
  const reactions = [];
  const allIds = world.nations.map((n) => n.id);
  let aiCallCount = 0;

  for (const nation of world.nations) {
    // Skip the nation that triggered the event
    if (nation.id === event.source) continue;

    try {
      // --- Step 1: Rule-based decision ---
      const ruleDecision = fallbackDecision(nation, event, allIds);

      // --- Step 2: Optional AI reasoning (only for non-neutral, up to MAX_AI_CALLS) ---
      let reasoning = ruleDecision.reasoning;
      if (ruleDecision.decision !== ACTIONS.NEUTRAL && aiCallCount < MAX_AI_CALLS) {
        try {
          const prompt = buildPrompt(nation, event, world.config.worldEvent || null);
          const aiRaw = await callFeatherless(SYSTEM_PROMPT, prompt);
          if (aiRaw) {
            const parsed = parseDecision(aiRaw, allIds);
            if (parsed && parsed.reasoning) {
              // Use AI reasoning text but keep the rule-based decision
              reasoning = parsed.reasoning;
            }
          }
          aiCallCount++;
        } catch (err) {
          console.error(`[AgentLoop] AI call failed for ${nation.id}:`, err.message);
          // Keep rule-based reasoning — no problem
        }
      }

      const reaction = {
        nation: nation.id,
        nationName: nation.name,
        decision: ruleDecision.decision,
        target: ruleDecision.target,
        reasoning,
        turn: event.turn,
      };

      // --- Step 3: Apply effects ---
      applyReactionEffects(world, nation, reaction, event.turn);

      reactions.push(reaction);
    } catch (err) {
      console.error(`[AgentLoop] Reaction failed for ${nation.id}:`, err.message);
      // Skip this nation's reaction — don't crash the whole loop
    }
  }

  return reactions;
}

/**
 * Apply the trust, alliance, and memory effects of a single nation's reaction.
 */
function applyReactionEffects(world, nation, reaction, turn) {
  const { decision, target } = reaction;

  // Trust updates — only when reacting toward a specific target
  if (target) {
    updateTrust(world, nation.id, target, decision);

    // Alliance changes for explicit ally/betray/attack reactions
    applyAllianceChanges(world, nation.id, target, decision);
  }

  // Memory — the reacting nation remembers its own decision
  const summary = target
    ? `${nation.name} chose to ${decision} toward ${target}`
    : `${nation.name} chose to remain ${decision}`;

  const memEntry = buildMemoryEntry(turn, nation.id, target, decision, summary);
  appendMemory(nation, memEntry);

  // Create an event log entry for this reaction
  const reactionEvent = createEvent({
    type: decision,
    source: nation.id,
    target: target || null,
    description: `[Reaction] ${summary} — ${reaction.reasoning}`,
    turn,
  });
  world.config.eventLog.push(reactionEvent);
}

module.exports = { runAgentReactions };

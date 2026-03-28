const { getNationDecision } = require("../ai/index");
const { updateTrust } = require("./trust");
const { applyAllianceChanges } = require("./alliances");
const { appendMemory, buildMemoryEntry } = require("./memory");
const { createEvent } = require("../models/event");
const { ACTIONS } = require("../data/actions");

// Per-nation timeout guard: if AI takes longer than this, force fallback
const PER_NATION_TIMEOUT_MS = 15000;

/**
 * Run agent reactions: every nation except the event source evaluates and responds.
 * AI is the primary decision maker; fallback kicks in on AI failure.
 *
 * @param {object} event - The triggering event { type, source, target, description, turn }
 * @param {object} world - The mutable world state
 * @returns {Promise<object[]>} Array of reaction objects
 */
async function runAgentReactions(event, world) {
  const reactions = [];
  const allIds = world.nations.map((n) => n.id);

  console.log(`\n⚡ [AgentLoop] ========================================`);
  console.log(`⚡ [AgentLoop] RUNNING AGENT REACTIONS — AI FOR EVERY NATION`);
  console.log(`⚡ [AgentLoop] event=${event.type} | source=${event.source} | target=${event.target || 'none'} | turn=${event.turn}`);
  console.log(`⚡ [AgentLoop] nations=[${allIds.join(', ')}] | AI_LIMIT=NONE`);
  console.log(`⚡ [AgentLoop] ========================================`);

  // Add self-reasoning for the source nation (so UI always has an entry)
  const sourceNation = world.nations.find((n) => n.id === event.source);
  if (sourceNation) {
    console.log(`👤 [AgentLoop] SELF-REASONING for source nation: ${sourceNation.id}`);
    reactions.push({
      nation: sourceNation.id,
      nationName: sourceNation.name,
      decision: event.type,
      target: event.target,
      reasoning: `${sourceNation.name} initiated ${event.type} against ${event.target || 'no specific target'} based on its ${sourceNation.personality} disposition and current strategic conditions.`,
      source: "self",
      turn: event.turn,
    });
  }

  for (const nation of world.nations) {
    // Skip the nation that triggered the event
    if (nation.id === event.source) continue;

    console.log(`\n🧠 CALLING AI FOR: ${nation.id} (${nation.personality})`);

    try {
      // --- Step 1: AI decision — ALWAYS called, no limits ---
      const worldEvent = world.config.worldEvent || null;

      const result = await Promise.race([
        getNationDecision(nation, event, allIds, worldEvent),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AI decision timeout")), PER_NATION_TIMEOUT_MS)
        ),
      ]).catch((err) => {
        console.error(`❌ AI FAILED for ${nation.id}: ${err.message} — USING FALLBACK`);
        const { fallbackDecision } = require("../ai/fallback");
        return { ...fallbackDecision(nation, event, allIds), source: "fallback" };
      });

      const reaction = {
        nation: nation.id,
        nationName: nation.name,
        decision: result.decision,
        target: result.target,
        reasoning: result.reasoning,
        source: result.source || "fallback",
        turn: event.turn,
      };

      console.log(`✅ FINAL DECISION ${nation.id} → decision=${reaction.decision} target=${reaction.target} source=${reaction.source}`);

      // --- Step 2: Apply effects ---
      applyReactionEffects(world, nation, reaction, event.turn);

      reactions.push(reaction);
    } catch (err) {
      console.error(`❌ [AgentLoop] Reaction FAILED for ${nation.id}:`, err.message);
      // Skip this nation's reaction — don't crash the whole loop
    }
  }

  // Summary
  const aiCount = reactions.filter(r => r.source === 'ai').length;
  const fbCount = reactions.filter(r => r.source === 'fallback').length;
  const selfCount = reactions.filter(r => r.source === 'self').length;
  console.log(`\n⚡ [AgentLoop] ========== REACTION SUMMARY ==========`);
  console.log(`⚡ [AgentLoop] total=${reactions.length} | AI=${aiCount} | FALLBACK=${fbCount} | SELF=${selfCount}`);
  reactions.forEach(r => {
    console.log(`  ${r.source === 'ai' ? '🤖' : r.source === 'self' ? '👤' : '📋'} ${r.nation}: ${r.decision} → ${r.target || 'none'} [${r.source}]`);
  });
  console.log(`⚡ [AgentLoop] ====================================\n`);

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

    // Experience tracking — target nation registers being acted upon
    const targetNation = world.nations.find((n) => n.id === target);
    if (targetNation && targetNation.experience) {
      const hostileActions = ["attack", "sanction", "betray"];
      const cooperativeActions = ["ally", "trade", "support"];
      if (hostileActions.includes(decision)) {
        targetNation.experience.hostilityReceived++;
      } else if (cooperativeActions.includes(decision)) {
        targetNation.experience.cooperationReceived++;
      }
    }
  }

  // Memory — the reacting nation remembers its own decision
  const summary = target
    ? `${nation.name} chose to ${decision} toward ${target}`
    : `${nation.name} chose to remain ${decision}`;

  const memEntry = buildMemoryEntry(turn, nation.id, target, decision, summary);
  appendMemory(nation, memEntry);

  // Create an event log entry for this reaction
  const sourceTag = reaction.source === "ai" ? "[AI]" : "[Rule]";
  const reactionEvent = createEvent({
    type: decision,
    source: nation.id,
    target: target || null,
    description: `${sourceTag} ${summary} — ${reaction.reasoning}`,
    turn,
  });
  world.config.eventLog.push(reactionEvent);
}

module.exports = { runAgentReactions };

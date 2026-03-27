const { isAlliedWith } = require("./alliances");

const MAX_MEMORY = 20;

const HOSTILE_ACTIONS = ["attack", "betray", "sanction"];
const FRIENDLY_ACTIONS = ["ally", "support", "trade"];

/**
 * Append a memory entry to a nation's memory log.
 * Memory is capped at MAX_MEMORY (oldest entries dropped).
 */
function appendMemory(nation, entry) {
  nation.memory.push(entry);
  if (nation.memory.length > MAX_MEMORY) {
    nation.memory = nation.memory.slice(nation.memory.length - MAX_MEMORY);
  }
}

/**
 * Build a human-readable memory entry from an event.
 */
function buildMemoryEntry(turn, sourceId, targetId, action, description) {
  return {
    turn,
    summary: description || `${sourceId} performed ${action} on ${targetId}`,
    source: sourceId,
    target: targetId,
    action,
  };
}

/**
 * Distribute a memory entry to all relevant nations:
 * - source and target always get it
 * - third-party allies of source or target also receive it
 */
function distributeMemory(world, turn, sourceId, targetId, action, description) {
  const entry = buildMemoryEntry(turn, sourceId, targetId, action, description);

  for (const nation of world.nations) {
    const isDirectlyInvolved = nation.id === sourceId || nation.id === targetId;
    const isAlliedWithInvolved =
      isAlliedWith(nation, sourceId) || isAlliedWith(nation, targetId);

    if (isDirectlyInvolved || isAlliedWithInvolved) {
      appendMemory(nation, entry);
    }
  }
}

/**
 * Analyze a nation's memory for behavioral patterns from a specific other nation.
 *
 * @param {object} nation - The nation whose memory to scan
 * @param {string} targetId - The other nation to look for
 * @returns {{ hostileCount: number, friendlyCount: number, totalInteractions: number, dominantPattern: string }}
 */
function recallPatterns(nation, targetId) {
  if (!nation.memory || !targetId) {
    return { hostileCount: 0, friendlyCount: 0, totalInteractions: 0, dominantPattern: "none" };
  }

  let hostileCount = 0;
  let friendlyCount = 0;

  for (const entry of nation.memory) {
    // Only count entries where targetId was the actor (source) affecting this nation
    if (entry.source !== targetId) continue;

    const action = (entry.action || "").toLowerCase();
    if (HOSTILE_ACTIONS.includes(action)) hostileCount++;
    else if (FRIENDLY_ACTIONS.includes(action)) friendlyCount++;
  }

  const totalInteractions = hostileCount + friendlyCount;
  let dominantPattern = "none";
  if (totalInteractions > 0) {
    if (hostileCount > friendlyCount) dominantPattern = "hostile";
    else if (friendlyCount > hostileCount) dominantPattern = "friendly";
    else dominantPattern = "mixed";
  }

  return { hostileCount, friendlyCount, totalInteractions, dominantPattern };
}

module.exports = { appendMemory, buildMemoryEntry, distributeMemory, recallPatterns };

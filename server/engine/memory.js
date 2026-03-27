const MAX_MEMORY = 10;

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
      nation.alliances.includes(sourceId) || nation.alliances.includes(targetId);

    if (isDirectlyInvolved || isAlliedWithInvolved) {
      appendMemory(nation, entry);
    }
  }
}

module.exports = { appendMemory, buildMemoryEntry, distributeMemory };

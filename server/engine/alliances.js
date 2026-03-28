const { ACTIONS } = require("../data/actions");

// --- Helpers for the new { id, strength } alliance format ---

/**
 * Check if a nation has an alliance with another nation.
 * Works directly on the nation object (no world lookup needed).
 */
function isAlliedWith(nation, otherId) {
  return nation.alliances.some((a) => a.id === otherId);
}

/**
 * Get the strength of a nation's alliance with another nation.
 * Returns 0 if not allied.
 */
function getAllianceStrength(nation, otherId) {
  const alliance = nation.alliances.find((a) => a.id === otherId);
  return alliance ? alliance.strength : 0;
}

/**
 * Get just the IDs of all allied nations (for compatibility helpers).
 */
function getAlliedIds(nation) {
  return nation.alliances.map((a) => a.id);
}

/**
 * Form an alliance between two nations (mutual) with strength 1.
 * No-op if already allied.
 */
function formAlliance(world, nationAId, nationBId) {
  const a = world.nations.find((n) => n.id === nationAId);
  const b = world.nations.find((n) => n.id === nationBId);
  if (!a || !b) return false;

  if (!isAlliedWith(a, nationBId)) a.alliances.push({ id: nationBId, strength: 1 });
  if (!isAlliedWith(b, nationAId)) b.alliances.push({ id: nationAId, strength: 1 });
  return true;
}

/**
 * Break the alliance between two nations (mutual).
 * If strength >= 2, returns the strength for extra trust penalty application.
 * No-op if not allied.
 */
function breakAlliance(world, nationAId, nationBId) {
  const a = world.nations.find((n) => n.id === nationAId);
  const b = world.nations.find((n) => n.id === nationBId);
  if (!a || !b) return { broken: false, strength: 0 };

  const allianceA = a.alliances.find((al) => al.id === nationBId);
  const strength = allianceA ? allianceA.strength : 0;

  a.alliances = a.alliances.filter((al) => al.id !== nationBId);
  b.alliances = b.alliances.filter((al) => al.id !== nationAId);

  // Extra trust penalty for breaking deep alliances
  if (strength >= 2) {
    const penalty = -10 * strength;
    a.trust[nationBId] = Math.max(-100, (a.trust[nationBId] || 0) + penalty);
    b.trust[nationAId] = Math.max(-100, (b.trust[nationAId] || 0) + penalty);
  }

  return { broken: strength > 0, strength };
}

/**
 * Check if two nations are allied.
 */
function areAllied(world, nationAId, nationBId) {
  const a = world.nations.find((n) => n.id === nationAId);
  return a ? isAlliedWith(a, nationBId) : false;
}

/**
 * Get all ally IDs for a nation.
 */
function getAllies(world, nationId) {
  const nation = world.nations.find((n) => n.id === nationId);
  return nation ? getAlliedIds(nation) : [];
}

/**
 * Strengthen all existing alliances by 1 (capped at 3).
 * Called once per simulation cycle.
 */
function strengthenAlliances(world) {
  for (const nation of world.nations) {
    for (const alliance of nation.alliances) {
      if (alliance.strength < 3) {
        alliance.strength += 1;
      }
    }
  }
}

/**
 * Apply alliance changes based on action type:
 * - ALLY → form alliance between source and target
 * - ATTACK / BETRAY → break alliance if one exists
 */
function applyAllianceChanges(world, sourceId, targetId, action) {
  if (action === ACTIONS.ALLY) {
    formAlliance(world, sourceId, targetId);
  } else if (action === ACTIONS.ATTACK || action === ACTIONS.BETRAY || action === ACTIONS.SANCTION) {
    const { broken, strength } = breakAlliance(world, sourceId, targetId);
    if (broken) {
      // Log alliance break to memory for both nations
      const src = world.nations.find(n => n.id === sourceId);
      const tgt = world.nations.find(n => n.id === targetId);
      const srcName = src?.name || sourceId;
      const tgtName = tgt?.name || targetId;
      const entry = {
        turn: world.config?.turn ?? 0,
        summary: `${srcName} broke alliance with ${tgtName} via ${action}`,
        action: 'alliance_broken',
        target: targetId,
      };
      if (src && Array.isArray(src.memory)) src.memory.push(entry);
      if (tgt && Array.isArray(tgt.memory)) {
        tgt.memory.push({ ...entry, summary: `${tgtName} lost alliance with ${srcName} (${action})`, target: sourceId });
      }
      console.log(`[Alliance] Broken: ${sourceId} ↔ ${targetId} via ${action} (was strength ${strength})`);
    }
  }
}

module.exports = {
  formAlliance,
  breakAlliance,
  areAllied,
  getAllies,
  applyAllianceChanges,
  strengthenAlliances,
  isAlliedWith,
  getAllianceStrength,
  getAlliedIds,
};

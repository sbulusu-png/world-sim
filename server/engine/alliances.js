const { ACTIONS } = require("../data/actions");

/**
 * Form an alliance between two nations (mutual).
 * No-op if already allied.
 */
function formAlliance(world, nationAId, nationBId) {
  const a = world.nations.find((n) => n.id === nationAId);
  const b = world.nations.find((n) => n.id === nationBId);
  if (!a || !b) return false;

  if (!a.alliances.includes(nationBId)) a.alliances.push(nationBId);
  if (!b.alliances.includes(nationAId)) b.alliances.push(nationAId);
  return true;
}

/**
 * Break the alliance between two nations (mutual).
 * No-op if not allied.
 */
function breakAlliance(world, nationAId, nationBId) {
  const a = world.nations.find((n) => n.id === nationAId);
  const b = world.nations.find((n) => n.id === nationBId);
  if (!a || !b) return false;

  a.alliances = a.alliances.filter((id) => id !== nationBId);
  b.alliances = b.alliances.filter((id) => id !== nationAId);
  return true;
}

/**
 * Check if two nations are allied.
 */
function areAllied(world, nationAId, nationBId) {
  const a = world.nations.find((n) => n.id === nationAId);
  return a ? a.alliances.includes(nationBId) : false;
}

/**
 * Get all ally IDs for a nation.
 */
function getAllies(world, nationId) {
  const nation = world.nations.find((n) => n.id === nationId);
  return nation ? [...nation.alliances] : [];
}

/**
 * Apply alliance changes based on action type:
 * - ALLY → form alliance between source and target
 * - ATTACK / BETRAY → break alliance if one exists
 */
function applyAllianceChanges(world, sourceId, targetId, action) {
  if (action === ACTIONS.ALLY) {
    formAlliance(world, sourceId, targetId);
  } else if (action === ACTIONS.ATTACK || action === ACTIONS.BETRAY) {
    breakAlliance(world, sourceId, targetId);
  }
}

module.exports = { formAlliance, breakAlliance, areAllied, getAllies, applyAllianceChanges };

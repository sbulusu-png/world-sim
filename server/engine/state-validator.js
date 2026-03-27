const { VALID_ACTIONS } = require("../data/actions");

const MAX_MEMORY = 10;
const TRUST_MIN = -100;
const TRUST_MAX = 100;
const MAX_EVENT_LOG = 200;

/**
 * Validate and repair the world state after every mutation.
 * Fixes any values that have drifted out of bounds.
 * Returns an array of issues found (empty = clean).
 */
function validateWorldState(world) {
  const issues = [];

  if (!world || !world.nations || !Array.isArray(world.nations)) {
    issues.push("CRITICAL: world.nations missing or not an array");
    return issues;
  }

  const validIds = world.nations.map((n) => n.id);

  for (const nation of world.nations) {
    // --- Trust: clamp to [-100, 100], remove invalid keys ---
    if (nation.trust && typeof nation.trust === "object") {
      for (const [otherId, score] of Object.entries(nation.trust)) {
        // Remove self-trust
        if (otherId === nation.id) {
          delete nation.trust[otherId];
          issues.push(`${nation.id}: removed self-trust entry`);
          continue;
        }
        // Remove invalid nation references
        if (!validIds.includes(otherId)) {
          delete nation.trust[otherId];
          issues.push(`${nation.id}: removed trust for unknown nation '${otherId}'`);
          continue;
        }
        // Clamp values
        if (typeof score !== "number" || isNaN(score)) {
          nation.trust[otherId] = 0;
          issues.push(`${nation.id}: reset NaN trust for ${otherId} to 0`);
        } else if (score < TRUST_MIN) {
          nation.trust[otherId] = TRUST_MIN;
          issues.push(`${nation.id}: clamped trust for ${otherId} from ${score} to ${TRUST_MIN}`);
        } else if (score > TRUST_MAX) {
          nation.trust[otherId] = TRUST_MAX;
          issues.push(`${nation.id}: clamped trust for ${otherId} from ${score} to ${TRUST_MAX}`);
        }
      }
    } else {
      nation.trust = {};
      issues.push(`${nation.id}: missing trust object — initialized empty`);
    }

    // --- Alliances: remove invalid IDs, self-references, and duplicates ---
    if (Array.isArray(nation.alliances)) {
      const before = nation.alliances.length;
      const seen = new Set();
      nation.alliances = nation.alliances.filter((id) => {
        if (id === nation.id) {
          issues.push(`${nation.id}: removed self-alliance`);
          return false;
        }
        if (!validIds.includes(id)) {
          issues.push(`${nation.id}: removed alliance with unknown '${id}'`);
          return false;
        }
        if (seen.has(id)) {
          issues.push(`${nation.id}: removed duplicate alliance '${id}'`);
          return false;
        }
        seen.add(id);
        return true;
      });
    } else {
      nation.alliances = [];
      issues.push(`${nation.id}: missing alliances array — initialized empty`);
    }

    // --- Memory: cap at MAX_MEMORY, oldest first ---
    if (Array.isArray(nation.memory)) {
      if (nation.memory.length > MAX_MEMORY) {
        const removed = nation.memory.length - MAX_MEMORY;
        nation.memory = nation.memory.slice(-MAX_MEMORY);
        issues.push(`${nation.id}: trimmed memory from ${removed + MAX_MEMORY} to ${MAX_MEMORY}`);
      }
    } else {
      nation.memory = [];
      issues.push(`${nation.id}: missing memory array — initialized empty`);
    }

    // --- Status: ensure valid ---
    const validStatuses = ["peace", "tension", "war"];
    if (!validStatuses.includes(nation.status)) {
      issues.push(`${nation.id}: invalid status '${nation.status}' — reset to 'peace'`);
      nation.status = "peace";
    }

    // --- Resources: ensure non-negative number ---
    if (typeof nation.resources !== "number" || isNaN(nation.resources)) {
      nation.resources = 100;
      issues.push(`${nation.id}: invalid resources — reset to 100`);
    } else if (nation.resources < 0) {
      nation.resources = 0;
      issues.push(`${nation.id}: negative resources — clamped to 0`);
    }
  }

  // --- Event log: cap to prevent unbounded growth ---
  if (Array.isArray(world.config?.eventLog)) {
    if (world.config.eventLog.length > MAX_EVENT_LOG) {
      const removed = world.config.eventLog.length - MAX_EVENT_LOG;
      world.config.eventLog = world.config.eventLog.slice(-MAX_EVENT_LOG);
      issues.push(`eventLog: trimmed ${removed} old entries (cap: ${MAX_EVENT_LOG})`);
    }
  }

  // --- Config: ensure turn is non-negative number ---
  if (world.config) {
    if (typeof world.config.turn !== "number" || isNaN(world.config.turn) || world.config.turn < 0) {
      world.config.turn = 0;
      issues.push("config.turn: reset to 0 (was invalid)");
    }
  }

  if (issues.length > 0) {
    console.warn(`[Validator] Fixed ${issues.length} issue(s):`, issues.join("; "));
  }

  return issues;
}

module.exports = { validateWorldState, MAX_MEMORY, MAX_EVENT_LOG };

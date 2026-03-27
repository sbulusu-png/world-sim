const { getWorld, getAllNationIds } = require("./world");
const { updateTrust } = require("./trust");
const { applyAllianceChanges } = require("./alliances");
const { appendMemory, buildMemoryEntry, distributeMemory } = require("./memory");
const { createEvent } = require("../models/event");
const { ACTIONS } = require("../data/actions");
const { processTurn } = require("./turn");

// --- Configuration ---
const CYCLE_INTERVAL_MS = 7000; // 1 cycle = 7 seconds
const ACTION_PROBABILITY = 0.35; // 35% chance a nation acts per cycle
const MAX_ACTIONS_PER_CYCLE = 2; // Cap autonomous events per cycle
const MAX_AI_CALLS_PER_CYCLE = 1; // Limit Featherless calls for performance

// --- Simulation state ---
let intervalId = null;
let running = false;
let processing = false; // guard against overlapping cycles

// --- Time system ---
function initTime() {
  return { day: 1, month: 1, year: 2026 };
}

function advanceDay(time) {
  const daysInMonth = [0, 31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  time.day += 1;
  if (time.day > daysInMonth[time.month]) {
    time.day = 1;
    time.month += 1;
    if (time.month > 12) {
      time.month = 1;
      time.year += 1;
    }
  }
}

function formatDate(time) {
  const months = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
                  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${time.day} ${months[time.month]} ${time.year}`;
}

// --- Autonomous decision logic ---

/**
 * Pick an autonomous action for a nation based on its trust scores,
 * alliances, and personality. Returns null if no action taken.
 */
function pickAutonomousAction(nation, allIds) {
  // Personality-weighted action probability
  const personalityBias = {
    aggressive: 0.50,
    opportunistic: 0.45,
    diplomatic: 0.40,
    defensive: 0.25,
    isolationist: 0.15,
  };
  const prob = personalityBias[nation.personality] ?? ACTION_PROBABILITY;
  if (Math.random() > prob) return null;

  // Gather trust data
  const trustEntries = Object.entries(nation.trust)
    .filter(([id]) => id !== nation.id && allIds.includes(id));

  if (trustEntries.length === 0) return null;

  const lowestTrust = trustEntries.reduce((a, b) => (a[1] < b[1] ? a : b));
  const highestTrust = trustEntries.reduce((a, b) => (a[1] > b[1] ? a : b));

  // Decision matrix based on personality + trust
  switch (nation.personality) {
    case "aggressive":
      if (lowestTrust[1] < -30) {
        return { type: ACTIONS.ATTACK, target: lowestTrust[0],
          reason: `${nation.name} launches an attack on distrusted ${lowestTrust[0]}.` };
      }
      if (lowestTrust[1] < -10) {
        return { type: ACTIONS.SANCTION, target: lowestTrust[0],
          reason: `${nation.name} imposes sanctions on ${lowestTrust[0]}.` };
      }
      break;

    case "diplomatic":
      if (highestTrust[1] > 20 && !nation.alliances.includes(highestTrust[0])) {
        return { type: ACTIONS.ALLY, target: highestTrust[0],
          reason: `${nation.name} proposes an alliance with ${highestTrust[0]}.` };
      }
      if (highestTrust[1] > 0) {
        return { type: ACTIONS.TRADE, target: highestTrust[0],
          reason: `${nation.name} initiates trade with ${highestTrust[0]}.` };
      }
      break;

    case "defensive":
      // Defensive nations only act when threatened
      if (lowestTrust[1] < -40 && nation.status === "war") {
        return { type: ACTIONS.SANCTION, target: lowestTrust[0],
          reason: `${nation.name} retaliates with sanctions during wartime.` };
      }
      if (highestTrust[1] > 10 && !nation.alliances.includes(highestTrust[0])) {
        return { type: ACTIONS.SUPPORT, target: highestTrust[0],
          reason: `${nation.name} seeks a supportive relationship with ${highestTrust[0]}.` };
      }
      break;

    case "opportunistic":
      if (lowestTrust[1] < -20) {
        return { type: ACTIONS.SANCTION, target: lowestTrust[0],
          reason: `${nation.name} exploits weakness in ${lowestTrust[0]}.` };
      }
      if (highestTrust[1] > 15) {
        return { type: ACTIONS.TRADE, target: highestTrust[0],
          reason: `${nation.name} pursues profitable trade with ${highestTrust[0]}.` };
      }
      break;

    case "isolationist":
      // Rarely acts — only if severely threatened
      if (lowestTrust[1] < -50) {
        return { type: ACTIONS.SANCTION, target: lowestTrust[0],
          reason: `${nation.name} breaks isolation to sanction existential threat ${lowestTrust[0]}.` };
      }
      break;
  }

  return null; // No action this cycle
}

// --- Core simulation cycle ---

async function runCycle() {
  if (processing) return; // Skip if previous cycle still running
  processing = true;

  try {
    const world = getWorld();
    if (!world.config.time) world.config.time = initTime();

    // Advance the clock
    advanceDay(world.config.time);

    const allIds = getAllNationIds();
    const shuffled = [...world.nations].sort(() => Math.random() - 0.5);
    let actionsThisCycle = 0;

    for (const nation of shuffled) {
      if (actionsThisCycle >= MAX_ACTIONS_PER_CYCLE) break;

      const action = pickAutonomousAction(nation, allIds);
      if (!action) continue;

      // Apply the autonomous action through the same pipeline as user events
      const turn = world.config.turn;
      const event = createEvent({
        type: action.type,
        source: nation.id,
        target: action.target,
        description: `[Auto] ${action.reason}`,
        turn,
      });

      // Trust updates
      if (action.target) {
        updateTrust(world, nation.id, action.target, action.type);
      }

      // Alliance changes
      if (action.target) {
        applyAllianceChanges(world, nation.id, action.target, action.type);
      }

      // Status updates
      if (action.type === ACTIONS.ATTACK && action.target) {
        const src = world.nations.find((n) => n.id === nation.id);
        const tgt = world.nations.find((n) => n.id === action.target);
        if (src) src.status = "war";
        if (tgt) tgt.status = "war";
      } else if (action.type === ACTIONS.SANCTION && action.target) {
        const tgt = world.nations.find((n) => n.id === action.target);
        if (tgt && tgt.status === "peace") tgt.status = "tension";
      }

      // Memory distribution
      if (action.target) {
        distributeMemory(world, turn, nation.id, action.target, action.type, action.reason);
      }

      // Log the event
      world.config.eventLog.push(event);
      world.config.currentEvent = event;

      // Run Phase 7 agent reactions (limited AI calls for performance)
      try {
        await processTurn(event, world);
      } catch (err) {
        console.error("[SimLoop] Reaction loop failed:", err.message);
      }

      world.config.turn += 1;
      actionsThisCycle++;
    }

    // Update world phase
    const statuses = world.nations.map((n) => n.status);
    if (statuses.includes("war")) world.config.phase = "war";
    else if (statuses.includes("tension")) world.config.phase = "tension";
    else world.config.phase = "peace";

  } catch (err) {
    console.error("[SimLoop] Cycle error:", err.message);
  } finally {
    processing = false;
  }
}

// --- Public API ---

function startSimulation() {
  if (running) return { running: true, message: "Already running" };
  const world = getWorld();
  if (!world.config.time) world.config.time = initTime();
  running = true;
  intervalId = setInterval(runCycle, CYCLE_INTERVAL_MS);
  console.log("[SimLoop] Simulation started — cycle every", CYCLE_INTERVAL_MS / 1000, "s");
  return { running: true, message: "Simulation started" };
}

function pauseSimulation() {
  if (!running) return { running: false, message: "Already paused" };
  clearInterval(intervalId);
  intervalId = null;
  running = false;
  console.log("[SimLoop] Simulation paused");
  return { running: false, message: "Simulation paused" };
}

function isSimulationRunning() {
  return running;
}

function resetSimulationTime() {
  pauseSimulation();
  const world = getWorld();
  world.config.time = initTime();
}

module.exports = { startSimulation, pauseSimulation, isSimulationRunning, resetSimulationTime, initTime };

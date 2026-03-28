const { getWorld, getAllNationIds } = require("./world");
const { updateTrust } = require("./trust");
const { applyAllianceChanges, isAlliedWith, strengthenAlliances } = require("./alliances");
const { appendMemory, buildMemoryEntry, distributeMemory } = require("./memory");
const { createEvent } = require("../models/event");
const { ACTIONS, ACTION_RESOURCE_COST } = require("../data/actions");
const { processTurn } = require("./turn");
const { validateWorldState } = require("./state-validator");
const { applyWorldEventEffects } = require("./world-events");
const { getRandomFallbackEvent } = require("../data/event-transformer");
const { getAutonomousDecision, getDecisionStats } = require("../ai/index");

// --- Configuration ---
const CYCLE_INTERVAL_MS = 7000; // 1 cycle = 7 seconds
const ACTION_PROBABILITY = 0.35; // 35% chance a nation acts per cycle
const MAX_ACTIONS_PER_CYCLE = 2; // Cap autonomous events per cycle
const MAX_AI_CALLS_PER_CYCLE = 2; // AI calls for autonomous actions per cycle

// --- Simulation state ---
let intervalId = null;
let running = false;
let processing = false; // guard against overlapping cycles

// --- Duplicate event prevention: track last action per nation ---
const lastNationAction = {}; // { nationId: { type, target, cycle } }
let cycleCount = 0;

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
function pickAutonomousAction(nation, allIds, world) {
  // Personality-weighted action probability
  const personalityBias = {
    aggressive: 0.50,
    opportunistic: 0.45,
    diplomatic: 0.40,
    defensive: 0.25,
    isolationist: 0.15,
  };
  let prob = personalityBias[nation.personality] ?? ACTION_PROBABILITY;

  // Escalation awareness: war escalates aggression, peace encourages diplomacy
  const phase = world.config?.phase;
  if (phase === "war") {
    if (nation.personality === "aggressive") prob += 0.20;
    else if (nation.personality === "opportunistic") prob += 0.10;
  } else if (phase === "peace") {
    if (nation.personality === "diplomatic") prob += 0.20;
    else if (nation.personality === "defensive") prob += 0.10;
  }
  prob = Math.min(prob, 0.85);

  if (Math.random() > prob) return null;

  // Gather trust data
  const trustEntries = Object.entries(nation.trust)
    .filter(([id]) => id !== nation.id && allIds.includes(id));

  if (trustEntries.length === 0) return null;

  const lowestTrust = trustEntries.reduce((a, b) => (a[1] < b[1] ? a : b));
  const highestTrust = trustEntries.reduce((a, b) => (a[1] > b[1] ? a : b));

  let action = null;

  // Decision matrix based on personality + trust
  switch (nation.personality) {
    case "aggressive":
      if (lowestTrust[1] < -30) {
        action = { type: ACTIONS.ATTACK, target: lowestTrust[0],
          reason: `${nation.name} launches an attack on distrusted ${lowestTrust[0]}.` };
      } else if (lowestTrust[1] < -10) {
        action = { type: ACTIONS.SANCTION, target: lowestTrust[0],
          reason: `${nation.name} imposes sanctions on ${lowestTrust[0]}.` };
      }
      break;

    case "diplomatic":
      if (highestTrust[1] > 20 && !isAlliedWith(nation, highestTrust[0])) {
        action = { type: ACTIONS.ALLY, target: highestTrust[0],
          reason: `${nation.name} proposes an alliance with ${highestTrust[0]}.` };
      } else if (highestTrust[1] > 0) {
        action = { type: ACTIONS.TRADE, target: highestTrust[0],
          reason: `${nation.name} initiates trade with ${highestTrust[0]}.` };
      }
      break;

    case "defensive":
      if (lowestTrust[1] < -40 && nation.status === "war") {
        action = { type: ACTIONS.SANCTION, target: lowestTrust[0],
          reason: `${nation.name} retaliates with sanctions during wartime.` };
      } else if (highestTrust[1] > 10 && !isAlliedWith(nation, highestTrust[0])) {
        action = { type: ACTIONS.SUPPORT, target: highestTrust[0],
          reason: `${nation.name} seeks a supportive relationship with ${highestTrust[0]}.` };
      }
      break;

    case "opportunistic":
      if (lowestTrust[1] < -20) {
        action = { type: ACTIONS.SANCTION, target: lowestTrust[0],
          reason: `${nation.name} exploits weakness in ${lowestTrust[0]}.` };
      } else if (highestTrust[1] > 15) {
        action = { type: ACTIONS.TRADE, target: highestTrust[0],
          reason: `${nation.name} pursues profitable trade with ${highestTrust[0]}.` };
      }
      break;

    case "isolationist":
      if (lowestTrust[1] < -50) {
        action = { type: ACTIONS.SANCTION, target: lowestTrust[0],
          reason: `${nation.name} breaks isolation to sanction existential threat ${lowestTrust[0]}.` };
      }
      break;
  }

  // 15% wildcard: out-of-character action for unpredictability
  if (Math.random() < 0.15) {
    const wildcardMap = {
      aggressive:    { type: ACTIONS.TRADE, target: highestTrust[0], label: "unexpectedly trades with" },
      diplomatic:    { type: ACTIONS.SANCTION, target: lowestTrust[0], label: "surprisingly sanctions" },
      defensive:     { type: ACTIONS.ATTACK, target: lowestTrust[0], label: "launches a surprise attack on" },
      opportunistic: { type: ACTIONS.SUPPORT, target: highestTrust[0], label: "surprisingly supports" },
      isolationist:  { type: ACTIONS.ALLY, target: highestTrust[0], label: "breaks isolation to ally with" },
    };
    const wc = wildcardMap[nation.personality];
    if (wc) {
      action = { type: wc.type, target: wc.target,
        reason: `[Wildcard] ${nation.name} ${wc.label} ${wc.target}.` };
    }
  }

  // Resource gates: economic constraints override decisions
  if (action) {
    if (nation.resources < 15) {
      // Economic desperation: can only trade
      action = { type: ACTIONS.TRADE, target: highestTrust[0],
        reason: `${nation.name} is forced into trade by economic desperation (resources: ${nation.resources}).` };
    } else if (nation.resources < 30 && (action.type === ACTIONS.ATTACK || action.type === ACTIONS.BETRAY)) {
      return null; // Can't afford war
    }
  }

  if (!action) return null;

  return action;
}

// --- Fix 2: Intent system ---

/**
 * Generate a short-term strategic intent from an action.
 * Only 1 intent per nation, expires after 3 turns.
 */
function generateIntent(nation, actionType, target) {
  if (!target) return;

  // Map action types to intent categories
  const friendlyActions = [ACTIONS.ALLY, ACTIONS.SUPPORT, ACTIONS.TRADE];
  const hostileActions = [ACTIONS.ATTACK, ACTIONS.BETRAY, ACTIONS.SANCTION];

  let intentType = "neutral";
  if (friendlyActions.includes(actionType)) intentType = "ally";
  else if (hostileActions.includes(actionType)) intentType = "attack";

  if (intentType === "neutral") return;

  nation.intent = { type: intentType, target, expiresIn: 3 };
  console.log(`[Intent] ${nation.id} → intent: ${intentType} with ${target} (3 turns)`);
}

/**
 * Decrement intent expiry. Remove when expired.
 */
function decayIntent(nation) {
  if (!nation.intent || !nation.intent.expiresIn) return;
  nation.intent.expiresIn -= 1;
  if (nation.intent.expiresIn <= 0) {
    console.log(`[Intent] ${nation.id} intent expired (was: ${nation.intent.type} → ${nation.intent.target})`);
    nation.intent = null;
  }
}

// --- Fix 3: Adaptive personality shift ---

const PERSONALITY_SHIFT_INTERVAL = 8; // Evaluate every 8 turns
const SHIFT_THRESHOLD = 5; // Need 5+ hostile or cooperative events to trigger shift

// Drift maps: what personality shifts under pressure
const HOSTILITY_DRIFT = {
  diplomatic: "defensive",
  defensive: "aggressive",
};
const COOPERATION_DRIFT = {
  aggressive: "opportunistic",
  opportunistic: "diplomatic",
};

/**
 * Update nation's experience counters based on an action received.
 */
function updateExperience(nation, actionType) {
  if (!nation.experience) {
    nation.experience = { hostilityReceived: 0, cooperationReceived: 0 };
  }

  const hostileActions = ["attack", "betray", "sanction"];
  const friendlyActions = ["ally", "support", "trade"];

  if (hostileActions.includes(actionType)) {
    nation.experience.hostilityReceived += 1;
  } else if (friendlyActions.includes(actionType)) {
    nation.experience.cooperationReceived += 1;
  }
}

/**
 * Evaluate personality drift based on accumulated experience.
 * Only runs every PERSONALITY_SHIFT_INTERVAL turns. Resets counters after evaluation.
 */
function evaluatePersonalityShift(world, turn) {
  if (turn % PERSONALITY_SHIFT_INTERVAL !== 0 || turn === 0) return;

  for (const nation of world.nations) {
    if (!nation.experience) continue;

    const { hostilityReceived, cooperationReceived } = nation.experience;

    if (hostilityReceived >= SHIFT_THRESHOLD && HOSTILITY_DRIFT[nation.personality]) {
      const oldPersonality = nation.personality;
      nation.personality = HOSTILITY_DRIFT[oldPersonality];
      console.log(`[PersonalityShift] ${nation.id}: ${oldPersonality} → ${nation.personality} (received ${hostilityReceived} hostile acts)`);
    } else if (cooperationReceived >= SHIFT_THRESHOLD && COOPERATION_DRIFT[nation.personality]) {
      const oldPersonality = nation.personality;
      nation.personality = COOPERATION_DRIFT[oldPersonality];
      console.log(`[PersonalityShift] ${nation.id}: ${oldPersonality} → ${nation.personality} (received ${cooperationReceived} cooperative acts)`);
    }

    // Reset counters after evaluation
    nation.experience = { hostilityReceived: 0, cooperationReceived: 0 };
  }
}

// --- Core simulation cycle ---

async function runCycle() {
  if (processing) return; // Skip if previous cycle still running
  processing = true;
  cycleCount++;

  try {
    const world = getWorld();
    if (!world.config.time) world.config.time = initTime();

    console.log(`\n🔁 [SimLoop] ════════════════════════════════════════`);
    console.log(`🔁 [SimLoop] SIMULATION TICK #${cycleCount}`);
    console.log(`🔁 [SimLoop] turn=${world.config.turn} | phase=${world.config.phase} | time=${formatDate(world.config.time)}`);
    console.log(`🔁 [SimLoop] worldEvent=${world.config.worldEvent?.summary || 'none'}`);
    console.log(`🔁 [SimLoop] ════════════════════════════════════════`);

    // Advance the clock
    advanceDay(world.config.time);

    // --- World event rotation and application ---
    // Rotate world event every 5 cycles
    if (cycleCount % 5 === 0 || !world.config.worldEvent) {
      world.config.worldEvent = getRandomFallbackEvent();
      world.config.worldEventAppliedCycle = null;
      console.log(`[SimLoop] World event rotated: ${world.config.worldEvent.summary}`);
    }
    // Apply world event effects every 3 cycles (if not already applied this rotation)
    if (cycleCount % 3 === 0 && world.config.worldEvent && world.config.worldEventAppliedCycle !== cycleCount) {
      try {
        const { changes } = applyWorldEventEffects(world, world.config.worldEvent);
        world.config.worldEventAppliedCycle = cycleCount;
        const changeCount = Object.keys(changes).length;
        if (changeCount > 0) {
          console.log(`[SimLoop] World event effects applied to ${changeCount} nations`);
        }
      } catch (err) {
        console.error("[SimLoop] World event effects failed (non-fatal):", err.message);
        // Non-fatal — cycle continues without world event effects
      }
    }

    // Strengthen existing alliances once per cycle (Phase 4)
    strengthenAlliances(world);

    // Passive income: +2 resources per cycle, capped at 120
    for (const n of world.nations) {
      n.resources = Math.min(120, (n.resources || 100) + 2);
    }

    const allIds = getAllNationIds();
    const shuffled = [...world.nations].sort(() => Math.random() - 0.5);
    let actionsThisCycle = 0;
    let aiAutoCallsThisCycle = 0;
    let aiSuccessThisCycle = 0;
    let fallbackThisCycle = 0;

    for (const nation of shuffled) {
      if (actionsThisCycle >= MAX_ACTIONS_PER_CYCLE) break;

      // --- AI-driven autonomous action (Fix 1) ---
      // Try AI first for up to MAX_AI_CALLS_PER_CYCLE nations, then fallback
      let action = null;
      if (aiAutoCallsThisCycle < MAX_AI_CALLS_PER_CYCLE) {
        // Check personality probability gate before spending an AI call
        const personalityBias = {
          aggressive: 0.50, opportunistic: 0.45, diplomatic: 0.40,
          defensive: 0.25, isolationist: 0.15,
        };
        let prob = personalityBias[nation.personality] ?? ACTION_PROBABILITY;
        const phase = world.config?.phase;
        if (phase === "war") {
          if (nation.personality === "aggressive") prob += 0.20;
          else if (nation.personality === "opportunistic") prob += 0.10;
        } else if (phase === "peace") {
          if (nation.personality === "diplomatic") prob += 0.20;
          else if (nation.personality === "defensive") prob += 0.10;
        }
        if (Math.random() <= Math.min(prob, 0.85)) {
          try {
            console.log(`🌍 [SimLoop] AI autonomous attempt for ${nation.id} (prob=${prob.toFixed(2)})`);
            const aiAction = await Promise.race([
              getAutonomousDecision(nation, allIds, world),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("AI auto timeout")), 12000)
              ),
            ]).catch(() => null);
            aiAutoCallsThisCycle++;

            if (aiAction && aiAction.type && aiAction.target) {
              console.log(`🌍 [SimLoop] AI autonomous SUCCESS for ${nation.id}: ${aiAction.type} → ${aiAction.target} [source=${aiAction.source || 'ai'}]`);
              aiSuccessThisCycle++;
              // Validate AI action against resource gates
              if (nation.resources < 15) {
                // Override: forced trade
                action = { type: ACTIONS.TRADE, target: aiAction.target,
                  reason: `[AI] ${nation.name} is forced into trade by economic desperation.`, source: "ai" };
              } else if (nation.resources < 30 && (aiAction.type === ACTIONS.ATTACK || aiAction.type === ACTIONS.BETRAY)) {
                action = null; // Can't afford war, skip
              } else {
                action = aiAction;
              }
            }
          } catch (err) {
            console.error(`[SimLoop] AI autonomous failed for ${nation.id}:`, err.message);
          }
        }
      }

      // Fallback to rule-based if AI didn't produce an action
      if (!action) {
        action = pickAutonomousAction(nation, allIds, world);
        if (action) {
          fallbackThisCycle++;
          console.log(`📋 [SimLoop] FALLBACK autonomous for ${nation.id}: ${action.type} → ${action.target}`);
        }
      }

      if (!action) continue;

      // --- Duplicate event prevention ---
      const last = lastNationAction[nation.id];
      if (last && last.type === action.type && last.target === action.target && cycleCount - last.cycle <= 2) {
        continue;
      }
      lastNationAction[nation.id] = { type: action.type, target: action.target, cycle: cycleCount };

      // --- Intent generation (Fix 2): 35% chance AI decisions create intent ---
      if (action.source === "ai" && Math.random() < 0.35) {
        generateIntent(nation, action.type, action.target);
      }

      // --- Decay intents each action (Fix 2) ---
      decayIntent(nation);

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
        // Fix 3: Track experience on the target nation
        const targetNation = world.nations.find((n) => n.id === action.target);
        if (targetNation) {
          updateExperience(targetNation, action.type);
        }
      }

      // Apply resource cost (Phase 5)
      nation.resources += ACTION_RESOURCE_COST[action.type] || 0;
      nation.resources = Math.max(0, nation.resources);
      if (action.type === ACTIONS.TRADE && action.target) {
        const tgtNation = world.nations.find((n) => n.id === action.target);
        if (tgtNation) {
          tgtNation.resources = Math.min(120, tgtNation.resources + 5);
        }
      }

      // Log the event
      world.config.eventLog.push(event);
      world.config.currentEvent = event;

      // Run Phase 7 agent reactions (limited AI calls for performance)
      try {
        const turnResult = await processTurn(event, world);
        // Store latest turnSummary so /api/state can return it
        if (turnResult.turnSummary) {
          world.config.lastTurnSummary = turnResult.turnSummary;
        }
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

    // --- Fix 3: Evaluate personality shifts periodically ---
    evaluatePersonalityShift(world, world.config.turn);

    // --- Phase 9: Validate state after every cycle ---
    validateWorldState(world);

    // Cycle summary
    console.log(`\n🔁 [SimLoop] ══════ CYCLE #${cycleCount} SUMMARY ══════`);
    console.log(`🔁 [SimLoop] actions=${actionsThisCycle} | ai_auto_attempts=${aiAutoCallsThisCycle} | ai_successes=${aiSuccessThisCycle} | fallbacks=${fallbackThisCycle}`);
    console.log(`🔁 [SimLoop] turn_after=${world.config.turn} | phase=${world.config.phase} | hasLastTurnSummary=${!!world.config.lastTurnSummary}`);
    if (world.config.lastTurnSummary) {
      const rcts = world.config.lastTurnSummary.reactions || [];
      const aiR = rcts.filter(r => r.source === 'ai').length;
      const fbR = rcts.filter(r => r.source === 'fallback').length;
      console.log(`🔁 [SimLoop] lastTurnSummary: ${rcts.length} reactions (AI=${aiR}, FALLBACK=${fbR})`);
    }
    console.log(`🔁 [SimLoop] ════════════════════════════════\n`);

    // HARD ASSERTION: If 3+ cycles have passed and AI has never succeeded, something is wrong
    if (cycleCount >= 3) {
      const stats = getDecisionStats();
      if (stats.totalApiCalls === 0) {
        console.error(`🚨🚨🚨 [ASSERTION FAILED] After ${cycleCount} cycles, totalApiCalls === 0. AI IS NOT BEING CALLED AT ALL!`);
        console.error(`🚨 Check: FEATHERLESS_API_KEY=${stats.hasApiKey ? 'present' : 'MISSING'}`);
      } else if (stats.totalApiSuccesses === 0) {
        console.error(`🚨🚨🚨 [ASSERTION FAILED] After ${cycleCount} cycles, ${stats.totalApiCalls} API calls but 0 successes. AI is failing every time!`);
        console.error(`🚨 Last error: ${stats.lastApiError || 'unknown'}`);
      }
    }

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
  // Clear cooldown tracking
  for (const key of Object.keys(lastNationAction)) delete lastNationAction[key];
  cycleCount = 0;
  const world = getWorld();
  world.config.time = initTime();
  // Clear intent and experience for all nations on reset
  for (const nation of world.nations) {
    nation.intent = null;
    nation.experience = { hostilityReceived: 0, cooperationReceived: 0 };
  }
}

module.exports = { startSimulation, pauseSimulation, isSimulationRunning, resetSimulationTime, initTime };

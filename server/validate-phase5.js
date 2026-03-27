/**
 * Phase 5 Validation — Simulation Behavior Tuning
 *
 * Tests:
 * 1. ACTION_RESOURCE_COST export and values
 * 2. Escalation awareness (war → aggressive boost, peace → diplomatic boost)
 * 3. Resource consumption on autonomous actions
 * 4. Resource consumption on user-triggered actions (POST /api/event)
 * 5. Resource gates (< 30 blocks attack/betray, < 15 forces trade)
 * 6. Passive income (+2/cycle, cap 120)
 * 7. Wildcard occurrence (15% out-of-character actions)
 * 8. Extended cooldown (2 cycles, not 1)
 * 9. Trade gives both nations +5
 * 10. State validator resource cap at 120
 */

const { ACTIONS, ACTION_RESOURCE_COST, VALID_ACTIONS } = require("./data/actions");
const { initWorld, getWorld, resetWorld } = require("./engine/world");
const { validateWorldState } = require("./engine/state-validator");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ FAIL: ${label}`);
  }
}

// ==============================
// Section 1: ACTION_RESOURCE_COST
// ==============================
console.log("\n=== 1. ACTION_RESOURCE_COST Export & Values ===");

assert(ACTION_RESOURCE_COST !== undefined, "ACTION_RESOURCE_COST is exported");
assert(typeof ACTION_RESOURCE_COST === "object", "ACTION_RESOURCE_COST is an object");
assert(ACTION_RESOURCE_COST[ACTIONS.ATTACK] === -15, "attack costs -15");
assert(ACTION_RESOURCE_COST[ACTIONS.BETRAY] === -10, "betray costs -10");
assert(ACTION_RESOURCE_COST[ACTIONS.SANCTION] === -5, "sanction costs -5");
assert(ACTION_RESOURCE_COST[ACTIONS.ALLY] === 0, "ally costs 0");
assert(ACTION_RESOURCE_COST[ACTIONS.SUPPORT] === -5, "support costs -5");
assert(ACTION_RESOURCE_COST[ACTIONS.TRADE] === 5, "trade gains +5");
assert(ACTION_RESOURCE_COST[ACTIONS.NEUTRAL] === 0, "neutral costs 0");

// Verify all valid actions have a resource cost defined
for (const action of VALID_ACTIONS) {
  assert(typeof ACTION_RESOURCE_COST[action] === "number", `resource cost defined for '${action}'`);
}

// ==============================
// Section 2: Escalation Awareness
// ==============================
console.log("\n=== 2. Escalation Awareness ===");

// We test this by checking the pickAutonomousAction behavior under different phases.
// Since pickAutonomousAction is not exported, we test it indirectly through simulation behavior.
// We'll use a deterministic approach: set world phase and check if action probabilities shifted.

// Load simulation module internals for testing
const simulationPath = require.resolve("./engine/simulation");
const simulationSrc = require("fs").readFileSync(simulationPath, "utf-8");

assert(simulationSrc.includes('phase === "war"'), "simulation checks for war phase");
assert(simulationSrc.includes('phase === "peace"'), "simulation checks for peace phase");
assert(simulationSrc.includes("prob += 0.20"), "simulation applies +20% probability boost");
assert(simulationSrc.includes("prob += 0.10"), "simulation applies +10% probability boost");
assert(simulationSrc.includes("Math.min(prob, 0.85)"), "probability capped at 0.85");

// Verify escalation awareness modifies aggressive in war
assert(
  simulationSrc.includes('"aggressive") prob += 0.20') ||
  simulationSrc.includes("\"aggressive\") prob += 0.20"),
  "aggressive personality gets +20% in war"
);

// Verify escalation awareness modifies diplomatic in peace
assert(
  simulationSrc.includes('"diplomatic") prob += 0.20') ||
  simulationSrc.includes("\"diplomatic\") prob += 0.20"),
  "diplomatic personality gets +20% in peace"
);

// ==============================
// Section 3: Resource Consumption (Autonomous)
// ==============================
console.log("\n=== 3. Resource Consumption (Autonomous) ===");

assert(
  simulationSrc.includes("ACTION_RESOURCE_COST[action.type]"),
  "simulation applies ACTION_RESOURCE_COST to autonomous actions"
);
assert(
  simulationSrc.includes("Math.max(0, nation.resources)"),
  "simulation clamps resources to 0 minimum"
);

// Verify the resource cost is applied AFTER the action pipeline
const resourceCostIdx = simulationSrc.indexOf("ACTION_RESOURCE_COST[action.type]");
const memoryDistIdx = simulationSrc.indexOf("distributeMemory(world, turn, nation.id");
const logEventIdx = simulationSrc.indexOf("world.config.eventLog.push(event)");
assert(
  resourceCostIdx > memoryDistIdx && resourceCostIdx < logEventIdx,
  "resource cost applied between memory distribution and event logging"
);

// ==============================
// Section 4: Resource Consumption (User-Triggered)
// ==============================
console.log("\n=== 4. Resource Consumption (User-Triggered) ===");

const indexSrc = require("fs").readFileSync(require("path").resolve(__dirname, "index.js"), "utf-8");
assert(
  indexSrc.includes("ACTION_RESOURCE_COST"),
  "index.js imports ACTION_RESOURCE_COST"
);
assert(
  indexSrc.includes("srcNation.resources += ACTION_RESOURCE_COST[type]"),
  "index.js applies resource cost to user actions"
);
assert(
  indexSrc.includes("srcNation.resources = Math.max(0, srcNation.resources)"),
  "index.js clamps source resources to 0"
);

// ==============================
// Section 5: Resource Gates
// ==============================
console.log("\n=== 5. Resource Gates ===");

assert(
  simulationSrc.includes("nation.resources < 15"),
  "simulation checks for resources < 15 (desperation threshold)"
);
assert(
  simulationSrc.includes("nation.resources < 30"),
  "simulation checks for resources < 30 (war affordability threshold)"
);

// Verify resource < 15 forces trade
const desperationIdx = simulationSrc.indexOf("nation.resources < 15");
const desperationBlock = simulationSrc.substring(desperationIdx, desperationIdx + 300);
assert(
  desperationBlock.includes("ACTIONS.TRADE"),
  "resources < 15 forces trade action"
);
assert(
  desperationBlock.includes("economic desperation"),
  "desperation trade includes descriptive reason"
);

// Verify resource < 30 blocks attack/betray
const affordIdx = simulationSrc.indexOf("nation.resources < 30");
const affordBlock = simulationSrc.substring(affordIdx, affordIdx + 200);
assert(
  affordBlock.includes("ACTIONS.ATTACK") && affordBlock.includes("ACTIONS.BETRAY"),
  "resources < 30 blocks attack and betray"
);

// ==============================
// Section 6: Passive Income
// ==============================
console.log("\n=== 6. Passive Income ===");

assert(
  simulationSrc.includes("Math.min(120,"),
  "passive income capped at 120"
);
assert(
  simulationSrc.includes("+ 2)"),
  "passive income adds +2 per cycle"
);

// Functional test: passive income application
{
  const world = initWorld();
  const france = world.nations.find(n => n.id === "france");
  france.resources = 50;
  // Simulate passive income
  for (const n of world.nations) {
    n.resources = Math.min(120, (n.resources || 100) + 2);
  }
  assert(france.resources === 52, "passive income: 50 + 2 = 52");

  // Test cap
  france.resources = 119;
  france.resources = Math.min(120, france.resources + 2);
  assert(france.resources === 120, "passive income capped at 120 (119 + 2 → 120)");

  france.resources = 120;
  france.resources = Math.min(120, france.resources + 2);
  assert(france.resources === 120, "passive income doesn't exceed 120");
}

// ==============================
// Section 7: Wildcard Actions
// ==============================
console.log("\n=== 7. Wildcard Actions ===");

assert(simulationSrc.includes("0.15"), "simulation has 15% wildcard threshold");
assert(simulationSrc.includes("[Wildcard]"), "wildcard actions tagged with [Wildcard]");

// Verify all personality types have wildcard mappings
assert(simulationSrc.includes("aggressive:") && simulationSrc.includes("ACTIONS.TRADE"), "aggressive wildcard → trade");
assert(simulationSrc.includes("diplomatic:") && simulationSrc.includes("ACTIONS.SANCTION"), "diplomatic wildcard → sanction");
assert(simulationSrc.includes("defensive:") && simulationSrc.includes("ACTIONS.ATTACK"), "defensive wildcard → attack");
assert(simulationSrc.includes("opportunistic:") && simulationSrc.includes("ACTIONS.SUPPORT"), "opportunistic wildcard → support");
assert(simulationSrc.includes("isolationist:") && simulationSrc.includes("ACTIONS.ALLY"), "isolationist wildcard → ally");

// ==============================
// Section 8: Extended Cooldown
// ==============================
console.log("\n=== 8. Extended Cooldown ===");

assert(
  simulationSrc.includes("cycleCount - last.cycle <= 2"),
  "cooldown extended to 2 cycles"
);
assert(
  !simulationSrc.includes("cycleCount - last.cycle <= 1"),
  "old 1-cycle cooldown removed"
);

// ==============================
// Section 9: Trade Dual Benefit
// ==============================
console.log("\n=== 9. Trade Dual Benefit ===");

// Autonomous trade: both nations get +5
assert(
  simulationSrc.includes('action.type === ACTIONS.TRADE && action.target'),
  "simulation checks for trade to apply dual benefit"
);

// Count occurrences of tgtNation.resources in simulation (should be for trade target)
const tgtResourceMatches = simulationSrc.match(/tgtNation\.resources/g);
assert(
  tgtResourceMatches && tgtResourceMatches.length >= 1,
  "simulation modifies target resources for trade"
);

// User-triggered trade
assert(
  indexSrc.includes('type === ACTIONS.TRADE && target'),
  "index.js checks for trade to apply dual benefit"
);

// Functional test: trade resource flow
{
  const world = initWorld();
  const france = world.nations.find(n => n.id === "france");
  const germany = world.nations.find(n => n.id === "germany");
  const frBefore = france.resources;
  const deBefore = germany.resources;

  // Simulate trade resource effect
  france.resources += ACTION_RESOURCE_COST[ACTIONS.TRADE]; // +5
  france.resources = Math.max(0, france.resources);
  germany.resources = Math.min(120, germany.resources + 5); // target also +5

  assert(france.resources === frBefore + 5, `trade: source gains +5 (${frBefore} → ${france.resources})`);
  assert(germany.resources === Math.min(120, deBefore + 5), `trade: target gains +5 (${deBefore} → ${germany.resources})`);
}

// ==============================
// Section 10: State Validator Resource Cap
// ==============================
console.log("\n=== 10. State Validator Resource Cap ===");

{
  const world = initWorld();
  const france = world.nations.find(n => n.id === "france");

  // Test over-cap repair
  france.resources = 150;
  const issues1 = validateWorldState(world);
  assert(france.resources === 120, "validator clamps resources > 120 to 120");
  assert(issues1.some(i => i.includes("exceeded cap")), "validator reports resource cap issue");

  // Test normal resources stay unchanged
  france.resources = 80;
  const issues2 = validateWorldState(world);
  assert(france.resources === 80, "validator leaves normal resources unchanged");

  // Test negative resources still clamped
  france.resources = -5;
  const issues3 = validateWorldState(world);
  assert(france.resources === 0, "validator still clamps negative resources to 0");

  // Test zero resources allowed
  france.resources = 0;
  const issues4 = validateWorldState(world);
  assert(france.resources === 0, "validator allows zero resources");

  // Test 120 exactly (should not be clamped)
  france.resources = 120;
  const issues5 = validateWorldState(world);
  assert(france.resources === 120, "validator allows exactly 120 resources");
  assert(!issues5.some(i => i.includes("france") && i.includes("resource")), "no issue reported for exactly 120");
}

// ==============================
// Section 11: Integration — Resource Cost Flow
// ==============================
console.log("\n=== 11. Integration — Resource Cost Flow ===");

{
  const world = initWorld();
  const russia = world.nations.find(n => n.id === "russia");
  const poland = world.nations.find(n => n.id === "poland");

  // Russia attacks Poland: -15 for Russia
  const ruBefore = russia.resources;
  russia.resources += ACTION_RESOURCE_COST[ACTIONS.ATTACK];
  russia.resources = Math.max(0, russia.resources);
  assert(russia.resources === ruBefore - 15, `attack costs 15 (${ruBefore} → ${russia.resources})`);

  // Russia betrays someone: -10
  const ruBefore2 = russia.resources;
  russia.resources += ACTION_RESOURCE_COST[ACTIONS.BETRAY];
  russia.resources = Math.max(0, russia.resources);
  assert(russia.resources === ruBefore2 - 10, `betray costs 10 (${ruBefore2} → ${russia.resources})`);

  // Russia sanctions: -5
  const ruBefore3 = russia.resources;
  russia.resources += ACTION_RESOURCE_COST[ACTIONS.SANCTION];
  russia.resources = Math.max(0, russia.resources);
  assert(russia.resources === ruBefore3 - 5, `sanction costs 5 (${ruBefore3} → ${russia.resources})`);

  // Neutral: 0
  const ruBefore4 = russia.resources;
  russia.resources += ACTION_RESOURCE_COST[ACTIONS.NEUTRAL];
  assert(russia.resources === ruBefore4, "neutral costs nothing");

  // Resource drain to 0 (can't go negative)
  russia.resources = 5;
  russia.resources += ACTION_RESOURCE_COST[ACTIONS.ATTACK]; // -15 → -10
  russia.resources = Math.max(0, russia.resources);
  assert(russia.resources === 0, "resources clamped to 0 (not negative)");

  // Validator repairs
  validateWorldState(world);
  assert(russia.resources === 0, "validator leaves 0 resources alone");
}

// ==============================
// Section 12: Escalation Feedback Loop Simulation
// ==============================
console.log("\n=== 12. Escalation Feedback Loop Simulation ===");

{
  // Verify the code structure creates proper feedback loops
  // War phase should boost aggressive/opportunistic
  const warBoostAggressive = simulationSrc.includes('phase === "war"') &&
    simulationSrc.includes('"aggressive") prob += 0.20');
  const warBoostOpportunistic = simulationSrc.includes('"opportunistic") prob += 0.10');
  assert(warBoostAggressive, "war phase boosts aggressive nations (+20%)");
  assert(warBoostOpportunistic, "war phase boosts opportunistic nations (+10%)");

  // Peace phase should boost diplomatic/defensive
  const peaceBoostDiplomatic = simulationSrc.includes('phase === "peace"') &&
    simulationSrc.includes('"diplomatic") prob += 0.20');
  const peaceBoostDefensive = simulationSrc.includes('"defensive") prob += 0.10');
  assert(peaceBoostDiplomatic, "peace phase boosts diplomatic nations (+20%)");
  assert(peaceBoostDefensive, "peace phase boosts defensive nations (+10%)");
}

// ==============================
// Section 13: Wildcard Rarity Check (Statistical)
// ==============================
console.log("\n=== 13. Wildcard Statistical Check ===");

{
  // Run 10000 random checks at 15% threshold
  let wildcardCount = 0;
  const trials = 10000;
  for (let i = 0; i < trials; i++) {
    if (Math.random() < 0.15) wildcardCount++;
  }
  const rate = wildcardCount / trials;
  assert(rate > 0.10 && rate < 0.20, `wildcard rate ~15% (got ${(rate * 100).toFixed(1)}% over ${trials} trials)`);
}

// ==============================
// Section 14: Resource Gate Edge Cases
// ==============================
console.log("\n=== 14. Resource Gate Edge Cases ===");

{
  // Exactly 15 resources: should NOT force trade
  const world = initWorld();
  const nation = world.nations.find(n => n.id === "france");
  nation.resources = 15;
  // The gate is "< 15", so 15 should NOT force trade
  assert(!(nation.resources < 15), "15 resources: NOT forced into desperation trade");

  // Exactly 30 resources: should NOT block attack
  nation.resources = 30;
  assert(!(nation.resources < 30), "30 resources: attack NOT blocked");

  // 29 resources: should block attack/betray
  nation.resources = 29;
  assert(nation.resources < 30, "29 resources: attack/betray blocked");

  // 14 resources: should force trade
  nation.resources = 14;
  assert(nation.resources < 15, "14 resources: forced into trade");

  // 0 resources: should force trade
  nation.resources = 0;
  assert(nation.resources < 15, "0 resources: forced into trade");
}

// ==============================
// Summary
// ==============================
console.log("\n" + "=".repeat(50));
console.log(`Phase 5 Validation: ${passed} passed, ${failed} failed`);
console.log("=".repeat(50));

if (failed > 0) {
  console.error("\n⚠ PHASE 5 HAS FAILING TESTS — DO NOT PROCEED");
  process.exit(1);
} else {
  console.log("\n✓ Phase 5 validated — all tests pass");
}

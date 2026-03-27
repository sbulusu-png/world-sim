/**
 * Phase 3 Validation — External Signal Activation
 *
 * Tests:
 * 1. applyWorldEventEffects exists and applies trust modifiers
 * 2. Military event: relevant nations get +5 mutual, non-relevant get -3 with relevant
 * 3. Economic event: relevant nations get +3 mutual, no non-relevant penalty
 * 4. Diplomatic event: relevant nations get +8 mutual
 * 5. Crisis event: relevant nations get -5 with ALL others
 * 6. Memory entries are pushed to affected nations
 * 7. Fallback event pool has 20+ events
 * 8. Every nation appears in at least 3 events
 * 9. simulation.js imports world-events and event-transformer
 * 10. index.js imports applyWorldEventEffects
 */

let issues = 0;
function assert(label, condition) {
  if (!condition) {
    console.log(`  FAIL: ${label}`);
    issues++;
  } else {
    console.log(`  PASS: ${label}`);
  }
}

// --- Helper: create a minimal world for testing ---
function makeTestWorld() {
  return {
    config: { turn: 5 },
    nations: [
      { id: "france",  trust: { germany: 10, uk: 5, russia: -10, poland: 0, italy: 5 }, memory: [], alliances: [] },
      { id: "germany", trust: { france: 10, uk: 5, russia: -5, poland: 5, italy: 0 }, memory: [], alliances: [] },
      { id: "uk",      trust: { france: 5, germany: 5, russia: -15, poland: 5, italy: 0 }, memory: [], alliances: [] },
      { id: "russia",  trust: { france: -10, germany: -5, uk: -15, poland: -20, italy: 0 }, memory: [], alliances: [] },
      { id: "poland",  trust: { france: 0, germany: 5, uk: 5, russia: -20, italy: 0 }, memory: [], alliances: [] },
      { id: "italy",   trust: { france: 5, germany: 0, uk: 0, russia: 0, poland: 0 }, memory: [], alliances: [] },
    ],
  };
}

function cloneWorld(w) {
  return JSON.parse(JSON.stringify(w));
}

// === TEST 1: Module loads ===
console.log("\n=== TEST 1: applyWorldEventEffects loads ===");
const { applyWorldEventEffects } = require("./engine/world-events");
assert("applyWorldEventEffects is a function", typeof applyWorldEventEffects === "function");

// === TEST 2: Military event ===
console.log("\n=== TEST 2: Military event trust modifiers ===");
{
  const world = makeTestWorld();
  const before = cloneWorld(world);
  const event = { summary: "NATO drill", category: "military", relevantNations: ["france", "germany"] };
  const { changes } = applyWorldEventEffects(world, event);

  // france→germany should be +5
  const franceDelta = world.nations[0].trust.germany - before.nations[0].trust.germany;
  assert(`france→germany delta = +5 (got ${franceDelta})`, franceDelta === 5);

  // germany→france should be +5
  const germanyDelta = world.nations[1].trust.france - before.nations[1].trust.france;
  assert(`germany→france delta = +5 (got ${germanyDelta})`, germanyDelta === 5);

  // russia (non-relevant) → france (relevant) should be -3
  const russiaDelta = world.nations[3].trust.france - before.nations[3].trust.france;
  assert(`russia→france delta = -3 (got ${russiaDelta})`, russiaDelta === -3);

  // france (relevant) → russia (non-relevant) should be -3
  const franceToRussia = world.nations[0].trust.russia - before.nations[0].trust.russia;
  assert(`france→russia delta = -3 (got ${franceToRussia})`, franceToRussia === -3);

  // uk (non-relevant) → uk (non-relevant) should be 0
  const ukToItaly = world.nations[2].trust.italy - before.nations[2].trust.italy;
  assert(`uk→italy delta = 0 (got ${ukToItaly})`, ukToItaly === 0);

  assert("changes object has entries", Object.keys(changes).length > 0);
}

// === TEST 3: Economic event ===
console.log("\n=== TEST 3: Economic event trust modifiers ===");
{
  const world = makeTestWorld();
  const before = cloneWorld(world);
  const event = { summary: "Trade deal", category: "economic", relevantNations: ["uk", "poland"] };
  const { changes } = applyWorldEventEffects(world, event);

  const ukToPol = world.nations[2].trust.poland - before.nations[2].trust.poland;
  assert(`uk→poland delta = +3 (got ${ukToPol})`, ukToPol === 3);

  const polToUk = world.nations[4].trust.uk - before.nations[4].trust.uk;
  assert(`poland→uk delta = +3 (got ${polToUk})`, polToUk === 3);

  // Non-relevant should not be affected
  const franceToPol = world.nations[0].trust.poland - before.nations[0].trust.poland;
  assert(`france→poland delta = 0 (got ${franceToPol})`, franceToPol === 0);
}

// === TEST 4: Diplomatic event ===
console.log("\n=== TEST 4: Diplomatic event trust modifiers ===");
{
  const world = makeTestWorld();
  const before = cloneWorld(world);
  const event = { summary: "Peace summit", category: "diplomatic", relevantNations: ["russia", "italy"] };
  const { changes } = applyWorldEventEffects(world, event);

  const russiaToItaly = world.nations[3].trust.italy - before.nations[3].trust.italy;
  assert(`russia→italy delta = +8 (got ${russiaToItaly})`, russiaToItaly === 8);

  const italyToRussia = world.nations[5].trust.russia - before.nations[5].trust.russia;
  assert(`italy→russia delta = +8 (got ${italyToRussia})`, italyToRussia === 8);

  // Non-relevant unaffected
  const franceToGermany = world.nations[0].trust.germany - before.nations[0].trust.germany;
  assert(`france→germany delta = 0 (got ${franceToGermany})`, franceToGermany === 0);
}

// === TEST 5: Crisis event ===
console.log("\n=== TEST 5: Crisis event trust modifiers ===");
{
  const world = makeTestWorld();
  const before = cloneWorld(world);
  const event = { summary: "Border crisis", category: "crisis", relevantNations: ["russia", "poland"] };
  const { changes } = applyWorldEventEffects(world, event);

  // russia→france should be -5 (relevant loses trust with ALL)
  const russiaToFrance = world.nations[3].trust.france - before.nations[3].trust.france;
  assert(`russia→france delta = -5 (got ${russiaToFrance})`, russiaToFrance === -5);

  // poland→germany should be -5
  const polandToGermany = world.nations[4].trust.germany - before.nations[4].trust.germany;
  assert(`poland→germany delta = -5 (got ${polandToGermany})`, polandToGermany === -5);

  // france (non-relevant) → uk (non-relevant) should be 0
  const franceToUk = world.nations[0].trust.uk - before.nations[0].trust.uk;
  assert(`france→uk delta = 0 (got ${franceToUk})`, franceToUk === 0);
}

// === TEST 6: Memory entries pushed ===
console.log("\n=== TEST 6: Memory entries on affected nations ===");
{
  const world = makeTestWorld();
  const event = { summary: "NATO summit 2026", category: "diplomatic", relevantNations: ["france", "uk"] };
  applyWorldEventEffects(world, event);

  const franceMemory = world.nations[0].memory;
  const ukMemory = world.nations[2].memory;
  const russiaMemory = world.nations[3].memory;

  assert("france has memory entry", franceMemory.length === 1 && franceMemory[0].summary.includes("NATO summit 2026"));
  assert("uk has memory entry", ukMemory.length === 1 && ukMemory[0].summary.includes("NATO summit 2026"));
  assert("russia has no memory entry", russiaMemory.length === 0);
  assert("memory source is world-event", franceMemory[0].source === "world-event");
}

// === TEST 7: Fallback event pool has 20+ events ===
console.log("\n=== TEST 7: Fallback event pool size ===");
{
  const events = require("./data/fallback-events.json");
  assert(`event pool has ${events.length} events (need 20+)`, events.length >= 20);
}

// === TEST 8: Every nation appears in at least 3 events ===
console.log("\n=== TEST 8: Nation coverage in event pool ===");
{
  const events = require("./data/fallback-events.json");
  const nationIds = ["france", "germany", "uk", "russia", "poland", "italy"];
  for (const nid of nationIds) {
    const count = events.filter(e => e.relevantNations.includes(nid)).length;
    assert(`${nid} appears in ${count} events (need 3+)`, count >= 3);
  }
}

// === TEST 9: simulation.js imports world-events ===
console.log("\n=== TEST 9: simulation.js imports ===");
{
  const fs = require("fs");
  const simCode = fs.readFileSync(__dirname + "/engine/simulation.js", "utf-8");
  assert("imports applyWorldEventEffects", simCode.includes("applyWorldEventEffects"));
  assert("imports getRandomFallbackEvent", simCode.includes("getRandomFallbackEvent"));
  assert("calls applyWorldEventEffects in runCycle", simCode.includes("applyWorldEventEffects(world"));
}

// === TEST 10: index.js imports applyWorldEventEffects ===
console.log("\n=== TEST 10: index.js world event integration ===");
{
  const fs = require("fs");
  const indexCode = fs.readFileSync(__dirname + "/index.js", "utf-8");
  assert("imports applyWorldEventEffects", indexCode.includes("applyWorldEventEffects"));
  assert("applies world event in POST handler", indexCode.includes("worldEventChanges"));
}

// === EDGE: null/missing event ===
console.log("\n=== EDGE: null/missing event ===");
{
  const world = makeTestWorld();
  const r1 = applyWorldEventEffects(world, null);
  assert("null event returns empty changes", Object.keys(r1.changes).length === 0);

  const r2 = applyWorldEventEffects(world, { summary: "test", category: "unknown" });
  assert("unknown category returns empty changes", Object.keys(r2.changes).length === 0);
}

// === SUMMARY ===
console.log("\n========================================");
if (issues === 0) {
  console.log("PHASE 3 VALIDATION PASSED — 0 issues");
} else {
  console.log(`PHASE 3 VALIDATION FAILED — ${issues} issue(s)`);
}
console.log("========================================\n");

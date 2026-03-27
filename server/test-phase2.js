const { initWorld, getWorld, getNation } = require("./engine/world");
const { updateTrust, clampTrust, getPersonalityBias } = require("./engine/trust");
const { formAlliance, breakAlliance, areAllied, getAllies, applyAllianceChanges } = require("./engine/alliances");
const { appendMemory, buildMemoryEntry, distributeMemory } = require("./engine/memory");
const { ACTIONS } = require("./data/actions");
const { PERSONALITIES } = require("./models/nation");

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✓ ${label}`);
    passed++;
  } else {
    console.error(`  ✗ FAIL: ${label}`);
    failed++;
  }
}

// ─── clampTrust ───────────────────────────────────────────
console.log("\n=== clampTrust ===");
assert(clampTrust(150) === 100, "clamps max to 100");
assert(clampTrust(-200) === -100, "clamps min to -100");
assert(clampTrust(50) === 50, "passes through valid value");
assert(clampTrust(50.7) === 51, "rounds to nearest integer");

// ─── getPersonalityBias ───────────────────────────────────
console.log("\n=== getPersonalityBias ===");
assert(getPersonalityBias(PERSONALITIES.AGGRESSIVE, ACTIONS.ATTACK) === 1.3, "aggressive attack bias = 1.3");
assert(getPersonalityBias(PERSONALITIES.DIPLOMATIC, ACTIONS.ALLY) === 1.3, "diplomatic ally bias = 1.3");
assert(getPersonalityBias(PERSONALITIES.DEFENSIVE, ACTIONS.ATTACK) === 1.5, "defensive attack bias = 1.5");
assert(getPersonalityBias(PERSONALITIES.ISOLATIONIST, ACTIONS.TRADE) === 0.8, "isolationist trade bias = 0.8");
assert(getPersonalityBias("unknown", ACTIONS.ATTACK) === 1.0, "unknown personality returns 1.0");

// ─── Trust updates ────────────────────────────────────────
console.log("\n=== Trust: ATTACK (russia → poland) ===");
let world = initWorld();
const polandBefore = getNation("poland").trust["russia"];
const russiaBefore = getNation("russia").trust["poland"];
const trustChanges = updateTrust(world, "russia", "poland", ACTIONS.ATTACK);
const polandAfter = getNation("poland").trust["russia"];
const russiaAfter = getNation("russia").trust["poland"];

// poland is defensive → bias 1.5, base delta -30 → -45
assert(polandAfter === polandBefore + Math.round(-30 * 1.5), `Poland trust of Russia dropped by ${Math.round(-30*1.5)} (defensive bias)`);
assert(russiaAfter === russiaBefore + Math.round(-30 * 0.5), "Russia trust of Poland dropped by half delta (source secondary)");
assert(trustChanges["poland"] !== undefined, "trust changes includes poland");
assert(trustChanges["russia"] !== undefined, "trust changes includes russia");

// Germany is allied with poland — should be affected by observer effect
const germanTrustOfRussia_before = -5; // initial value
const germany = getNation("germany");
assert(
  germany.trust["russia"] < germanTrustOfRussia_before,
  `Germany (ally of Poland) trust of Russia decreased (was ${germanTrustOfRussia_before}, now ${germany.trust["russia"]})`
);

console.log("\n=== Trust: ALLY (france → uk) ===");
world = initWorld();
const ukTrustFranceBefore = getNation("uk").trust["france"];
updateTrust(world, "france", "uk", ACTIONS.ALLY);
const ukTrustFranceAfter = getNation("uk").trust["france"];
// UK is opportunistic → bias 1.1, base +25 → +27
assert(ukTrustFranceAfter > ukTrustFranceBefore, `UK trust of France increased after ALLY (${ukTrustFranceBefore} → ${ukTrustFranceAfter})`);

// ─── Alliance manager ─────────────────────────────────────
console.log("\n=== Alliance manager ===");
world = initWorld();
assert(areAllied(world, "france", "germany"), "france & germany start allied");
assert(!areAllied(world, "france", "russia"), "france & russia start not allied");

formAlliance(world, "france", "russia");
assert(areAllied(world, "france", "russia"), "formAlliance: france & russia now allied");
assert(areAllied(world, "russia", "france"), "formAlliance: mutual — russia also shows france");

breakAlliance(world, "france", "russia");
assert(!areAllied(world, "france", "russia"), "breakAlliance: france & russia no longer allied");
assert(!areAllied(world, "russia", "france"), "breakAlliance: mutual removal confirmed");

const alliesOfGermany = getAllies(world, "germany");
assert(alliesOfGermany.includes("france"), "getAllies: germany includes france");
assert(alliesOfGermany.includes("poland"), "getAllies: germany includes poland");

console.log("\n=== applyAllianceChanges ===");
world = initWorld();
applyAllianceChanges(world, "france", "uk", ACTIONS.ALLY);
assert(areAllied(world, "france", "uk"), "ALLY action forms alliance");

applyAllianceChanges(world, "france", "germany", ACTIONS.ATTACK);
assert(!areAllied(world, "france", "germany"), "ATTACK on ally breaks alliance");

// ─── Memory manager ───────────────────────────────────────
console.log("\n=== Memory manager ===");
world = initWorld();
const entry = buildMemoryEntry(1, "russia", "poland", ACTIONS.ATTACK, "Russia attacks Poland");
assert(entry.turn === 1, "memory entry has correct turn");
assert(entry.action === ACTIONS.ATTACK, "memory entry has correct action");
assert(entry.summary === "Russia attacks Poland", "memory entry uses provided description");

const poland2 = world.nations.find((n) => n.id === "poland");
appendMemory(poland2, entry);
assert(poland2.memory.length === 1, "memory appended");

// Test cap at 10
for (let i = 0; i < 12; i++) appendMemory(poland2, { turn: i, summary: `event ${i}` });
assert(poland2.memory.length === 10, "memory capped at 10 entries");

console.log("\n=== distributeMemory ===");
world = initWorld();
distributeMemory(world, 0, "russia", "poland", ACTIONS.ATTACK, "Russia attacks Poland");
const polMemory = world.nations.find((n) => n.id === "poland").memory;
const rusMemory = world.nations.find((n) => n.id === "russia").memory;
const gerMemory = world.nations.find((n) => n.id === "germany").memory; // germany is allied with poland
const fraMemory = world.nations.find((n) => n.id === "france").memory;  // france allied with germany→also allied with poland
assert(polMemory.length === 1, "poland received memory (target)");
assert(rusMemory.length === 1, "russia received memory (source)");
assert(gerMemory.length === 1, "germany received memory (ally of target)");

// ─── Summary ──────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`Phase 2 results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("Phase 2 — All tests passed!");
} else {
  console.error("Phase 2 — Some tests FAILED.");
  process.exit(1);
}

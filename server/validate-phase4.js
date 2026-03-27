const { initWorld, getWorld, getNation, getAllNationIds } = require("./engine/world");
const {
  formAlliance,
  breakAlliance,
  areAllied,
  getAllies,
  strengthenAlliances,
  isAlliedWith,
  getAllianceStrength,
  getAlliedIds,
} = require("./engine/alliances");
const { updateTrust } = require("./engine/trust");
const { distributeMemory } = require("./engine/memory");
const { validateWorldState } = require("./engine/state-validator");
const { fallbackDecision } = require("./ai/fallback");
const { buildPrompt } = require("./ai/prompt-builder");
const { ACTIONS } = require("./data/actions");

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

// ─── Alliance Data Structure ──────────────────────────────
console.log("\n=== Alliance Data Structure ===");
const world = initWorld();
const france = getNation("france");
const germany = getNation("germany");
const uk = getNation("uk");
const russia = getNation("russia");

// Check new format: alliances should be arrays of {id, strength} objects
assert(Array.isArray(france.alliances), "france.alliances is array");
assert(france.alliances.length > 0, "france has alliances");
assert(typeof france.alliances[0] === "object", "alliance entry is an object");
assert(typeof france.alliances[0].id === "string", "alliance entry has id string");
assert(typeof france.alliances[0].strength === "number", "alliance entry has strength number");

// Initial strength should be 2 for pre-existing alliances
assert(france.alliances[0].strength === 2, "pre-existing alliances start at strength 2");

// UK and Russia should have empty alliances
assert(uk.alliances.length === 0, "UK has no alliances initially");
assert(russia.alliances.length === 0, "Russia has no alliances initially");

// ─── Helper Functions ─────────────────────────────────────
console.log("\n=== Helper Functions ===");

assert(isAlliedWith(france, "germany") === true, "isAlliedWith: france allied with germany");
assert(isAlliedWith(france, "russia") === false, "isAlliedWith: france not allied with russia");
assert(getAllianceStrength(france, "germany") === 2, "getAllianceStrength: france-germany = 2");
assert(getAllianceStrength(france, "russia") === 0, "getAllianceStrength: france-russia = 0");

const franceAllyIds = getAlliedIds(france);
assert(Array.isArray(franceAllyIds), "getAlliedIds returns array");
assert(franceAllyIds.includes("germany"), "getAlliedIds includes germany");
assert(franceAllyIds.includes("italy"), "getAlliedIds includes italy");
assert(!franceAllyIds.includes("russia"), "getAlliedIds excludes russia");

assert(areAllied(world, "france", "germany") === true, "areAllied world-level: france-germany");
assert(areAllied(world, "france", "russia") === false, "areAllied world-level: france-russia");

const germanyAllies = getAllies(world, "germany");
assert(germanyAllies.includes("france"), "getAllies: germany has france");
assert(germanyAllies.includes("poland"), "getAllies: germany has poland");

// ─── Form Alliance ────────────────────────────────────────
console.log("\n=== Form Alliance ===");

assert(!isAlliedWith(france, "russia"), "france not allied with russia before forming");
formAlliance(world, "france", "russia");
assert(isAlliedWith(france, "russia"), "france allied with russia after forming");
assert(isAlliedWith(russia, "france"), "russia allied with france after forming (mutual)");
assert(getAllianceStrength(france, "russia") === 1, "new alliance starts at strength 1");
assert(getAllianceStrength(russia, "france") === 1, "new alliance strength 1 (mutual)");

// No-op on duplicate
formAlliance(world, "france", "russia");
const russiaAllyCount = france.alliances.filter(a => a.id === "russia").length;
assert(russiaAllyCount === 1, "duplicate formAlliance does not add second entry");

// ─── Strengthen Alliances ─────────────────────────────────
console.log("\n=== Strengthen Alliances ===");

const initialFranceRussia = getAllianceStrength(france, "russia");
assert(initialFranceRussia === 1, "france-russia strength starts at 1");

strengthenAlliances(world);
assert(getAllianceStrength(france, "russia") === 2, "france-russia strength goes to 2 after 1 cycle");
assert(getAllianceStrength(france, "germany") === 3, "france-germany strength goes to 3 after 1 cycle (was 2)");

strengthenAlliances(world);
assert(getAllianceStrength(france, "russia") === 3, "france-russia strength goes to 3 after 2 cycles");
assert(getAllianceStrength(france, "germany") === 3, "france-germany strength capped at 3");

strengthenAlliances(world);
assert(getAllianceStrength(france, "russia") === 3, "strength capped at 3 even after 3 cycles");

// ─── Break Alliance (with deep bond penalty) ──────────────
console.log("\n=== Break Alliance (Deep Bond Penalty) ===");

// Record trust before break
const franceTrustGermany_before = france.trust["germany"];
const germanyTrustFrance_before = germany.trust["france"];

// france-germany is strength 3 — breaking should apply -30 penalty (3*10)
const breakResult = breakAlliance(world, "france", "germany");
assert(breakResult.broken === true, "breakAlliance returns broken: true");
assert(breakResult.strength === 3, "breakAlliance returns the strength that was broken");
assert(!isAlliedWith(france, "germany"), "france no longer allied with germany");
assert(!isAlliedWith(germany, "france"), "germany no longer allied with france");

const franceTrustGermany_after = france.trust["germany"];
const germanyTrustFrance_after = germany.trust["france"];
const penaltyApplied = franceTrustGermany_before - franceTrustGermany_after;
assert(penaltyApplied === 30, `deep break penalty: france lost 30 trust (got ${penaltyApplied})`);
const penaltyMutual = germanyTrustFrance_before - germanyTrustFrance_after;
assert(penaltyMutual === 30, `deep break penalty mutual: germany lost 30 trust (got ${penaltyMutual})`);

// Break a strength-1 alliance — should NOT apply extra penalty
const ukTrustRussia_before = uk.trust["russia"] || 0;
formAlliance(world, "uk", "russia"); // strength 1
const breakWeak = breakAlliance(world, "uk", "russia");
assert(breakWeak.broken === true, "weak alliance breaks successfully");
assert(breakWeak.strength === 1, "weak alliance reports strength 1");
const ukTrustRussia_after = uk.trust["russia"] || 0;
assert(ukTrustRussia_after === ukTrustRussia_before, "no extra penalty for strength 1 break");

// ─── State Validator ──────────────────────────────────────
console.log("\n=== State Validator ===");

// Re-init for clean state
const world2 = initWorld();
validateWorldState(world2);
const france2 = world2.nations.find(n => n.id === "france");

// Alliances should survive validation
assert(france2.alliances.length > 0, "alliances survive validation");
assert(typeof france2.alliances[0] === "object", "alliances remain objects after validation");
assert(typeof france2.alliances[0].id === "string", "alliance id is string after validation");
assert(france2.alliances[0].strength >= 1 && france2.alliances[0].strength <= 3, "alliance strength in valid range");

// Test legacy migration: inject old format
const poland2 = world2.nations.find(n => n.id === "poland");
poland2.alliances = ["germany", "france"]; // old string format
validateWorldState(world2);
assert(typeof poland2.alliances[0] === "object", "validator migrates legacy string alliances to objects");
assert(poland2.alliances[0].id === "germany", "migrated alliance has correct id");
assert(poland2.alliances[0].strength === 1, "migrated alliance gets strength 1");

// ─── Prompt Builder (Alliance Display) ────────────────────
console.log("\n=== Prompt Builder (Alliance Display) ===");

const world3 = initWorld();
const france3 = world3.nations.find(n => n.id === "france");
const testEvent = {
  type: ACTIONS.ATTACK,
  source: "russia",
  target: "poland",
  description: "Russia attacks Poland",
};

const prompt = buildPrompt(france3, testEvent, null);
// Should display allied nation IDs (not [object Object])
assert(!prompt.includes("[object Object]"), "prompt does not contain [object Object]");
assert(prompt.includes("germany"), "prompt includes ally germany");
assert(prompt.includes("italy"), "prompt includes ally italy");

// ─── Fallback Decision (Alliance-Aware) ───────────────────
console.log("\n=== Fallback Decision (Alliance-Aware) ===");

const world4 = initWorld();
const allIds = getAllNationIds();

// Germany should defend ally Poland when Russia attacks
const germanyNation = world4.nations.find(n => n.id === "germany");
const attackEvent = {
  type: ACTIONS.ATTACK,
  source: "russia",
  target: "poland",
  description: "Russia attacks Poland",
};
const defenseDecision = fallbackDecision(germanyNation, attackEvent, allIds);
assert(defenseDecision.decision === ACTIONS.SANCTION, "germany sanctions russia in defense of ally poland");
assert(defenseDecision.target === "russia", "germany targets russia");

// France should stay neutral if ally Germany is the aggressor
const franceNation = world4.nations.find(n => n.id === "france");
const allyAggressorEvent = {
  type: ACTIONS.ATTACK,
  source: "germany",
  target: "russia",
  description: "Germany attacks Russia",
};
const neutralDecision = fallbackDecision(franceNation, allyAggressorEvent, allIds);
assert(neutralDecision.decision === ACTIONS.NEUTRAL, "france stays neutral when ally germany attacks");

// ─── Memory Distribution (Alliance-Aware) ─────────────────
console.log("\n=== Memory Distribution (Alliance-Aware) ===");

const world5 = initWorld();
// Clear all memories first
world5.nations.forEach(n => { n.memory = []; });

distributeMemory(world5, 1, "russia", "poland", "attack", "Russia attacks Poland");

const polandMem = world5.nations.find(n => n.id === "poland");
const germanySideMem = world5.nations.find(n => n.id === "germany");
const ukSideMem = world5.nations.find(n => n.id === "uk");

assert(polandMem.memory.length > 0, "poland (target) received memory");
assert(germanySideMem.memory.length > 0, "germany (ally of poland) received memory");
assert(ukSideMem.memory.length === 0, "uk (not allied) did NOT receive memory");

// ─── Trust Observer Effect (Strength Scaling) ──────────────
console.log("\n=== Trust Observer Effect (Strength Scaling) ===");

const world6 = initWorld();
// Record initial trust values
const italyNation = world6.nations.find(n => n.id === "italy");
const italyTrustOfGermany_before = italyNation.trust["germany"] || 0;

// France-Italy alliance is strength 2, so observer mirror = 2*0.15 = 30%
// Apply a trust-changing action: germany attacks france
updateTrust(world6, "germany", "france", ACTIONS.ATTACK);

const italyPost = world6.nations.find(n => n.id === "italy");

// Italy is allied with France, so Italy should have an observer effect against germany
const italyTrustOfGermany_after = italyPost.trust["germany"] || 0;
const observerDelta = italyTrustOfGermany_after - italyTrustOfGermany_before;
assert(observerDelta !== 0, `observer effect occurred: Italy's trust of Germany changed by ${observerDelta}`);

// ─── Summary ──────────────────────────────────────────────
console.log(`\n${"=".repeat(50)}`);
console.log(`Phase 4 (Alliance Intelligence) Validation: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("SOME TESTS FAILED");
  process.exit(1);
} else {
  console.log("ALL TESTS PASSED ✓");
}

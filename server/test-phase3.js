const { initWorld, getNation, getAllNationIds } = require("./engine/world");
const { buildPrompt, SYSTEM_PROMPT } = require("./ai/prompt-builder");
const { parseDecision } = require("./ai/decision-parser");
const { fallbackDecision } = require("./ai/fallback");
const { ACTIONS, VALID_ACTIONS } = require("./data/actions");

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

// ─── Prompt Builder ───────────────────────────────────────
console.log("\n=== Prompt Builder ===");
const world = initWorld();
const france = getNation("france");
const testEvent = {
  type: ACTIONS.ATTACK,
  source: "russia",
  target: "poland",
  description: "Russia attacks Poland",
};

const prompt = buildPrompt(france, testEvent, null);
assert(prompt.includes("France"), "prompt includes nation name");
assert(prompt.includes("diplomatic"), "prompt includes personality");
assert(prompt.includes("germany: 60"), "prompt includes trust scores");
assert(prompt.includes("germany, italy"), "prompt includes alliances");
assert(prompt.includes("Russia attacks Poland"), "prompt includes event description");
assert(!prompt.includes("Real-world context"), "no world event when null");

const promptWithWorld = buildPrompt(france, testEvent, "NATO summit tensions rise");
assert(promptWithWorld.includes("NATO summit tensions rise"), "world event context injected");

assert(typeof SYSTEM_PROMPT === "string", "SYSTEM_PROMPT is a string");
assert(SYSTEM_PROMPT.includes("JSON"), "system prompt asks for JSON format");
assert(VALID_ACTIONS.every((a) => SYSTEM_PROMPT.includes(a)), "system prompt lists all valid actions");

// ─── Decision Parser ──────────────────────────────────────
console.log("\n=== Decision Parser ===");
const validTargets = ["france", "germany", "uk", "russia", "poland", "italy"];

// Clean JSON
const r1 = parseDecision('{"decision": "support", "target": "poland", "reasoning": "We stand with Poland."}', validTargets);
assert(r1 !== null, "parses clean JSON");
assert(r1.decision === "support", "correct decision");
assert(r1.target === "poland", "correct target");
assert(r1.reasoning === "We stand with Poland.", "correct reasoning");

// JSON wrapped in markdown
const r2 = parseDecision('Here is my response:\n```json\n{"decision": "attack", "target": "russia", "reasoning": "Retaliate!"}\n```', validTargets);
assert(r2 !== null, "parses JSON from markdown block");
assert(r2.decision === "attack", "extracts decision from messy text");

// Invalid decision
const r3 = parseDecision('{"decision": "invade", "target": "russia", "reasoning": "test"}', validTargets);
assert(r3 === null, "rejects invalid decision type");

// Invalid target → clears target, doesn't fail
const r4 = parseDecision('{"decision": "support", "target": "atlantis", "reasoning": "test"}', validTargets);
assert(r4 !== null, "doesn't fail on invalid target");
assert(r4.target === null, "clears invalid target");
assert(r4.decision === "support", "preserves valid decision");

// Null / empty input
assert(parseDecision(null, validTargets) === null, "returns null for null input");
assert(parseDecision("", validTargets) === null, "returns null for empty string");
assert(parseDecision("no json here", validTargets) === null, "returns null for non-JSON text");

// Long reasoning truncated
const longReasoning = "a".repeat(1000);
const r5 = parseDecision(`{"decision": "neutral", "target": null, "reasoning": "${longReasoning}"}`, validTargets);
assert(r5.reasoning.length <= 500, "reasoning truncated to 500 chars");

// ─── Fallback Logic ───────────────────────────────────────
console.log("\n=== Fallback: Direct target (attack on self) ===");
initWorld();
const poland = getNation("poland");
const attackOnPoland = { type: ACTIONS.ATTACK, source: "russia", target: "poland", description: "Russia attacks Poland" };
const fb1 = fallbackDecision(poland, attackOnPoland, getAllNationIds());
assert(fb1.decision === ACTIONS.ATTACK, "poland retaliates when attacked");
assert(fb1.target === "russia", "targets the attacker");

console.log("\n=== Fallback: Ally defense ===");
initWorld();
const germany = getNation("germany");
// Germany is allied with Poland; Poland is attacked by Russia
const fb2 = fallbackDecision(germany, attackOnPoland, getAllNationIds());
assert(fb2.decision === ACTIONS.SANCTION, "germany sanctions attacker of ally");
assert(fb2.target === "russia", "targets attacker of ally");

console.log("\n=== Fallback: Ally as aggressor ===");
initWorld();
const france2 = getNation("france");
// France is allied with Germany; Germany attacks someone
const germanAttacks = { type: ACTIONS.ATTACK, source: "germany", target: "uk", description: "Germany attacks UK" };
const fb3 = fallbackDecision(france2, germanAttacks, getAllNationIds());
assert(fb3.decision === ACTIONS.NEUTRAL, "stays neutral when ally is aggressor");

console.log("\n=== Fallback: Diplomatic personality ===");
initWorld();
const france3 = getNation("france"); // diplomatic
const someEvent = { type: ACTIONS.SANCTION, source: "russia", target: "uk", description: "Russia sanctions UK" };
const fb4 = fallbackDecision(france3, someEvent, getAllNationIds());
assert(fb4.decision === ACTIONS.SUPPORT, "diplomatic nation supports target");
assert(fb4.target === "uk", "targets the victim");

console.log("\n=== Fallback: Defensive personality default ===");
initWorld();
const poland2 = getNation("poland"); // defensive
const distantEvent = { type: ACTIONS.TRADE, source: "france", target: "italy", description: "France trades with Italy" };
const fb5 = fallbackDecision(poland2, distantEvent, getAllNationIds());
assert(fb5.decision === ACTIONS.NEUTRAL, "defensive nation stays neutral on distant events");

console.log("\n=== Fallback: Trade reciprocation ===");
initWorld();
const uk = getNation("uk");
const tradeOffer = { type: ACTIONS.TRADE, source: "germany", target: "uk", description: "Germany offers trade to UK" };
const fb6 = fallbackDecision(uk, tradeOffer, getAllNationIds());
assert(fb6.decision === ACTIONS.TRADE, "UK reciprocates trade offer");
assert(fb6.target === "germany", "targets the offerer");

console.log("\n=== Fallback: Ally offer reciprocation ===");
initWorld();
const russia = getNation("russia");
const allyOffer = { type: ACTIONS.ALLY, source: "italy", target: "russia", description: "Italy offers alliance to Russia" };
const fb7 = fallbackDecision(russia, allyOffer, getAllNationIds());
assert(fb7.decision === ACTIONS.SUPPORT, "reciprocates friendly alliance offer");

// ─── Security checks ─────────────────────────────────────
console.log("\n=== Security Checks ===");
const fs = require("fs");
const path = require("path");

const aiDir = path.join(__dirname, "ai");
const aiFiles = fs.readdirSync(aiDir).filter((f) => f.endsWith(".js"));
let keyLeakFound = false;

for (const file of aiFiles) {
  const content = fs.readFileSync(path.join(aiDir, file), "utf-8");
  // Check no literal API key values (common patterns)
  if (/["']sk-[a-zA-Z0-9]+["']/.test(content) || /["']Bearer sk-/.test(content)) {
    console.error(`  ✗ SECURITY: Hardcoded API key found in ai/${file}`);
    keyLeakFound = true;
  }
  // Check no console.log of the actual key variable value
  if (/console\.(log|info)\(.*apiKey/.test(content)) {
    console.error(`  ✗ SECURITY: API key logged to console in ai/${file}`);
    keyLeakFound = true;
  }
}
assert(!keyLeakFound, "no hardcoded API keys or key logging in AI files");

// Verify .env is in .gitignore
const gitignore = fs.readFileSync(path.join(__dirname, "../.gitignore"), "utf-8");
assert(gitignore.includes(".env"), ".env is in .gitignore");

// Verify .env.example exists and has no real keys
const envExample = fs.readFileSync(path.join(__dirname, "../.env.example"), "utf-8");
assert(envExample.includes("FEATHERLESS_API_KEY"), ".env.example mentions FEATHERLESS_API_KEY");
assert(envExample.includes("your_featherless_api_key_here"), ".env.example uses placeholder, not real key");

// ─── Summary ──────────────────────────────────────────────
console.log(`\n${"─".repeat(40)}`);
console.log(`Phase 3 results: ${passed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("Phase 3 — All tests passed!");
} else {
  console.error("Phase 3 — Some tests FAILED.");
  process.exit(1);
}

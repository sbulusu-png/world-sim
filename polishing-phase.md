# Polishing Phase — Execution Plan

> Convert a functional prototype into a near-perfect hackathon system.
> Every phase is surgical, testable, and preserves system stability.

---

## Phase 1 — AI Decision Refactor

**Goal:**
Make the AI the primary decision-maker. Fallback becomes the backup, not the engine. Currently `agent-loop.js` calls `fallbackDecision()` first and only asks the AI for reasoning text. Flip this: ask the AI for a full `{decision, target, reasoning}` JSON, parse it, and only fall back to rules on parse failure or API unavailability.

**Why this matters:**
- **Intelligence:** Decisions become context-aware (personality + trust + memory + world events considered holistically by an LLM, not by a static switch-case).
- **Realism:** Nations will occasionally do surprising things — diplomats might sanction under extreme pressure, isolationists might reach out. Rule-based logic can never produce this.
- **Judge perception:** "AI-driven" becomes a true claim, not marketing. Judges who ask "how does the AI make decisions?" get a real answer.

**Tasks:**

1. In `server/engine/agent-loop.js`, restructure `runAgentReactions()`:
   - For each nation, call `getNationDecision()` from `server/ai/index.js` (already exists but is unused by the agent loop).
   - Pass `worldEvent` context from `world.config.worldEvent`.
   - `getNationDecision()` already tries AI first and falls back — wire it in.
   - Remove the current pattern where `fallbackDecision()` runs first and AI only swaps reasoning.

2. Raise `MAX_AI_CALLS` from `2` to `5` (or remove the cap entirely if latency is acceptable). The current cap means 4 out of 6 nations always use pure fallback — defeating the purpose.

3. In `server/ai/prompt-builder.js`, enhance `buildPrompt()`:
   - Add a line that interprets personality: `"As a ${personality} nation, you value ${personalityDescription}."` with a map like `{ aggressive: "military dominance and swift retaliation", diplomatic: "alliances, negotiation, and soft power", ... }`.
   - Add a line counting hostile actions in memory: `"In your recent memory, ${sourceId} has acted against you ${count} times."` — this gives the LLM pattern-awareness that raw memory summaries don't provide.

4. In `server/ai/decision-parser.js`, add a validation step: if the AI returns the exact same action as fallback would, accept it. If it returns something *different*, accept it only if it's a valid action against a valid target. This prevents nonsense while allowing surprise.

5. Add a `source` field to every reaction object (`"ai"` or `"fallback"`) so the UI and logs can show which decisions came from AI. `getNationDecision()` already returns this field.

**Files to modify:**
- `server/engine/agent-loop.js` — rewire to use `getNationDecision()`
- `server/ai/prompt-builder.js` — add personality interpretation + memory pattern hints
- `server/ai/index.js` — no changes needed (already correct architecture)
- `server/ai/decision-parser.js` — minor: already solid, optionally add validation vs. fallback

**Expected Outcome:**
When Featherless API key is set, nations make LLM-driven decisions with personality-aware reasoning. When the API is down, the existing fallback kicks in seamlessly. Reaction logs show `[AI]` or `[Fallback]` tags.

**Validation Test:**
1. Set `FEATHERLESS_API_KEY` in `.env`.
2. `POST /api/event` with `{ type: "attack", source: "russia", target: "poland" }`.
3. Check response `turnSummary.reactions` — at least 3+ reactions should have `source: "ai"`.
4. Verify AI-sourced decisions differ from what fallback would produce in at least one case.
5. Unset the API key, repeat — all reactions should have `source: "fallback"` and the system still works.

---

## Phase 2 — Memory Intelligence Upgrade

**Goal:**
Transform the memory system from a dumb FIFO log into a simple recall engine that detects behavioral patterns. Nations should "notice" repeated actions and adjust.

**Why this matters:**
- **Intelligence:** "France has betrayed us 3 times" is fundamentally different from "France did a thing once." Pattern detection is the minimum bar for "persistent NPC intelligence."
- **Realism:** Repeated aggression should escalate distrust faster than a single incident. Repeated cooperation should build deeper bonds.
- **Judge perception:** Memory that visibly influences behavior is the #1 differentiator from scripted NPCs.

**Tasks:**

1. In `server/engine/memory.js`, add a `recallPatterns(nation, targetId)` function:
   ```
   - Count actions by type from targetId in nation's memory
   - Return { hostileCount, friendlyCount, totalInteractions, dominantPattern }
   - hostileCount = count of attack/betray/sanction from targetId
   - friendlyCount = count of ally/support/trade from targetId
   - dominantPattern = "hostile" | "friendly" | "mixed" | "none"
   ```

2. In `server/ai/prompt-builder.js`, use `recallPatterns()` to inject memory-derived context into prompts:
   - Before the "Recent events" section, add: `"Pattern analysis: ${targetId} has been hostile toward you ${hostileCount} times and friendly ${friendlyCount} times. Dominant pattern: ${dominantPattern}."`
   - Do this for the event source and target specifically.

3. In `server/ai/fallback.js`, use `recallPatterns()` to modify fallback behavior:
   - If `recallPatterns(nation, sourceId).hostileCount >= 3`, escalate response (sanction → attack, neutral → sanction).
   - If `recallPatterns(nation, sourceId).friendlyCount >= 3`, de-escalate (attack → sanction, sanction → neutral).
   - This makes fallback decisions memory-aware even without AI.

4. Increase `MAX_MEMORY` from `10` to `20`. Ten entries is 10 turns of history — too short for patterns to form. Twenty is enough without being expensive.

**Files to modify:**
- `server/engine/memory.js` — add `recallPatterns()` function
- `server/ai/prompt-builder.js` — inject pattern analysis into prompts
- `server/ai/fallback.js` — use patterns to escalate/de-escalate decisions

**Expected Outcome:**
After Russia attacks Poland 3+ times, Poland's responses escalate automatically. After France trades with Germany 3+ times, France becomes more supportive. The AI prompt includes pattern analysis, improving LLM decision quality.

**Validation Test:**
1. Trigger `russia → attack → poland` three times in a row.
2. On the 3rd attack, check Poland's reaction — it should be more aggressive than the 1st (e.g., attack instead of sanction).
3. Trigger `france → trade → germany` three times.
4. Check France's memory via `/api/state` — pattern should show `friendlyCount: 3`.
5. Check AI prompt includes "Pattern analysis" text (add a `console.log` temporarily to verify).

---

## Phase 3 — External Signal Activation

**Goal:**
Make world events mechanically impactful. Currently, Bright Data / fallback events are just text strings injected into AI prompts with zero effect on game state. Add a `applyWorldEventEffects()` function that modifies trust scores when a world event fires.

**Why this matters:**
- **Intelligence:** External events become part of the decision fabric, not flavor text.
- **Realism:** "NATO increases defense spending" should mechanically strengthen NATO-aligned trust. Without this, the "Dynamic World Driven by External Signals" pillar scores 0.
- **Judge perception:** This is the difference between a real external signal system and a UI decoration. Judges will test this.

**Tasks:**

1. Create `server/engine/world-events.js` with a single function `applyWorldEventEffects(world, event)`:
   - Takes a transformed event object `{ summary, category, relevantNations }`.
   - Applies trust modifiers based on category:
     - `military`: relevantNations get +5 mutual trust; non-relevant nations with relevantNations get -3.
     - `economic`: relevantNations get +3 mutual trust.
     - `diplomatic`: relevantNations get +8 mutual trust.
     - `crisis`: relevantNations get -5 mutual trust with all others.
   - Logs the effect: push a memory entry to all affected nations: `"World event: ${summary} — affected trust."`
   - Returns a `{ changes }` object describing what shifted.

2. In `server/engine/simulation.js`, call `applyWorldEventEffects()` once per cycle (or every 3 cycles to avoid spam):
   - Fetch the current `world.config.worldEvent`.
   - If it exists and hasn't been applied this cycle, apply it.
   - Rotate the world event every 5 cycles by calling `getRandomFallbackEvent()` for a new one.

3. In `server/data/fallback-events.json`, expand the pool from 10 to at least 20 events. Add events that create tension (arms races, border disputes) and events that ease it (peace summits, trade deals). Ensure every nation appears in at least 3 events.

4. In `server/index.js`, in the `POST /api/event` handler, after trust updates, check if there's an active world event and apply its modifiers. This ensures world events affect both autonomous and user-triggered turns.

**Files to modify:**
- `server/engine/world-events.js` — new file, single function
- `server/engine/simulation.js` — call `applyWorldEventEffects()` in cycle
- `server/data/fallback-events.json` — expand event pool
- `server/index.js` — apply world event effects on user actions

**Expected Outcome:**
When "NATO increases defense spending" fires, France/Germany/Poland/UK trust each other slightly more. Russia's trust with them drops slightly. This cascades into different autonomous decisions next cycle. World events have visible, traceable mechanical impact instead of being prompt decorations.

**Validation Test:**
1. Start simulation.
2. After a cycle, check `/api/state` — trust scores should show small shifts attributable to the world event.
3. Check memory logs — nations should have entries like "World event: NATO increases defense spending — affected trust."
4. After 5 cycles, verify the world event rotates (different event appears).
5. Trigger a user action and verify world event modifiers stack on top of action-based trust changes.

---

## Phase 4 — Alliance Intelligence Upgrade

**Goal:**
Add minimal depth to the binary alliance system without a rewrite. Alliances gain a `strength` value (1-3) that increases over time and affects trust recovery after betrayal.

**Why this matters:**
- **Intelligence:** A 20-turn alliance is more meaningful than a 1-turn alliance. Breaking a long alliance should be devastating.
- **Realism:** Alliances aren't switches — they're relationships with depth.
- **Judge perception:** "Our alliances have strength levels that grow over time" is a compelling one-liner in a demo.

**Tasks:**

1. Change the alliance data structure from `alliances: ["germany", "france"]` to `alliances: [{ id: "germany", strength: 1 }, { id: "france", strength: 2 }]`.

2. In `server/engine/alliances.js`:
   - `formAlliance()` — create alliance with `strength: 1`.
   - `breakAlliance()` — when breaking an alliance with `strength >= 2`, apply an extra trust penalty (-10 per strength level) to simulate betrayal of a deep bond.
   - Add `strengthenAlliances(world)` — called once per simulation cycle. For each existing alliance, increment strength by 1 (capped at 3). This means alliances deepen over time.
   - Update `areAllied()` and `getAllies()` to work with the new structure.

3. In `server/engine/trust.js`, make observer effect scale with alliance strength:
   - Current: allies mirror 30% of target's trust reaction.
   - New: allies mirror `(strength * 15)%` — strength 1 = 15%, strength 2 = 30%, strength 3 = 45%.

4. Update `server/engine/state-validator.js` to validate the new alliance structure.

5. Update `server/data/initial-world.json` — convert initial alliances to the new format with `strength: 2` for starting alliances (they're pre-existing, established relationships).

6. In `client/src/components/SidePanel.jsx`, show alliance strength as visual indicator (e.g., 1-3 stars or "Weak/Strong/Deep" label next to each alliance badge).

**Files to modify:**
- `server/engine/alliances.js` — new structure + strengthen function
- `server/engine/trust.js` — scale observer effect by strength
- `server/engine/state-validator.js` — validate new format
- `server/engine/simulation.js` — call `strengthenAlliances()` once per cycle
- `server/data/initial-world.json` — convert alliance format
- `client/src/components/SidePanel.jsx` — display strength

**Expected Outcome:**
Alliances show strength levels in the UI. Breaking a deep alliance causes noticeably more trust damage. Long-running alliances produce stronger observer effects. The system rewards patience in alliance-building.

**Validation Test:**
1. Start simulation. After 3 cycles, check `/api/state` — existing alliances should have `strength: 3` (started at 2, incremented once per cycle, capped at 3).
2. Trigger `france → betray → germany` (who have a strength 3 alliance). Verify the trust penalty is significantly higher than breaking a strength 1 alliance.
3. Verify the UI shows strength indicators next to alliance badges.
4. Form a new alliance via `france → ally → russia`. Verify it starts at strength 1.

---

## Phase 5 — Simulation Behavior Tuning

**Goal:**
Make autonomous actions feel less random and more like strategic nation behavior. Reduce action spam, add escalation awareness, and introduce resource consumption.

**Why this matters:**
- **Intelligence:** Nations that blindly attack every cycle don't feel intelligent. Pacing matters.
- **Realism:** Real nations calculate costs. Resource constraints create interesting tradeoffs.
- **Judge perception:** A simulation that produces meaningful events every 7 seconds is better than one that spams random sanctions.

**Tasks:**

1. In `server/engine/simulation.js`, add escalation awareness to `pickAutonomousAction()`:
   - If `world.config.phase === "war"`, increase aggressive action probability by 20%.
   - If `world.config.phase === "peace"`, increase diplomatic action probability by 20%.
   - This creates feedback loops: wars escalate, peace stabilizes.

2. Add resource consumption/gain to actions in `server/data/actions.js`:
   ```
   ACTION_RESOURCE_COST = {
     attack: -15, betray: -10, sanction: -5,
     ally: 0, support: -5, trade: +5, neutral: 0
   }
   ```

3. In `server/engine/simulation.js` and `server/index.js`, apply resource costs after every action:
   - `source.resources += ACTION_RESOURCE_COST[type]`
   - For trade, both nations get +5.
   - In `pickAutonomousAction()`: if `nation.resources < 30`, skip attack/betray (can't afford war).
   - If `nation.resources < 15`, force trade actions only (economic desperation).

4. Add resource recovery: in the simulation cycle, every nation gains +2 resources per cycle (passive income). Capped at 120.

5. Add a 15% "wildcard" chance in `pickAutonomousAction()`: an out-of-character action. Aggressive nation trades, diplomatic nation sanctions. This directly addresses "system should not behave the same twice."

6. Extend the cooldown in `lastNationAction` from 1 cycle to 2 cycles for the same action+target pair. Prevents "Russia sanctions Poland every single cycle" spam.

**Files to modify:**
- `server/data/actions.js` — add `ACTION_RESOURCE_COST` map
- `server/engine/simulation.js` — escalation awareness, resource checks, wildcard, extended cooldown, passive income
- `server/index.js` — apply resource cost on user-triggered actions

**Expected Outcome:**
Nations at war spend resources fast, pushing them toward trade/negotiation. Peacetime nations build up resources, creating targets for opportunists. Occasional wildcards prevent predictability. Action log looks strategic, not spammy.

**Validation Test:**
1. Start simulation.
2. After 10 cycles, check `/api/state` — nations that attacked should have lower resources than nations that traded.
3. Verify a nation with resources < 30 does NOT attack autonomously.
4. Over 20 cycles, verify at least 1-2 "wildcard" actions occurred (check event log for out-of-character moves).
5. Verify the same nation doesn't repeat an identical action on the same target in consecutive cycles.

---

## Phase 6 — UI Insight Upgrade

**Goal:**
Make the UI display the intelligence happening under the hood. Currently, AI reasoning exists in the API response but is partially wired. Memory, patterns, world events, and decision sources should all be visible.

**Why this matters:**
- **Intelligence:** If it's not visible, it doesn't exist for judges.
- **Realism:** Seeing "France recalls 3 hostile actions by Russia" on screen is dramatically more impressive than a hidden number.
- **Judge perception:** This is the demo layer. Every improvement from Phases 1-5 becomes invisible if the UI doesn't surface it.

**Tasks:**

1. In `client/src/components/SidePanel.jsx`, enhance the AI Reactions section:
   - Show a badge `[AI]` or `[Rule]` next to each reaction based on the `source` field (added in Phase 1).
   - Color-code: AI decisions in blue, fallback in gray.
   - This is the most visible proof that AI is making real decisions.

2. Add a "World Event" banner to `client/src/App.jsx`:
   - Display the current world event summary at the top of the page (or below the header).
   - Update it on each state refresh.
   - Style: subtle banner with category icon (sword for military, handshake for diplomatic, chart for economic, warning for crisis).

3. In `client/src/components/SidePanel.jsx`, add a "Nation Intelligence" micro-section:
   - Show resource count with a progress bar (0-120).
   - Show alliance count with strength indicators (from Phase 4).
   - Show memory pattern summary: "Hostile history with: Russia (3x), UK (1x)".
   - This requires the server to include pattern data in the state response.

4. In `server/index.js` or `server/engine/world.js`, enrich the state response with computed data:
   - For each nation, add a `patterns` field: `{ [nationId]: { hostile: N, friendly: N } }` computed from memory using `recallPatterns()`.
   - This is read-only computed data — doesn't change the core model.

5. Improve event arrows in `client/src/components/EventArrows.jsx`:
   - Color arrows by action type (red for attack, green for trade, blue for ally, orange for sanction).
   - Add a brief label on the arrow (the action type).

**Files to modify:**
- `client/src/components/SidePanel.jsx` — AI source badge, nation intelligence section
- `client/src/App.jsx` — world event banner
- `client/src/components/EventArrows.jsx` — colored/labeled arrows
- `server/index.js` or `server/engine/world.js` — add computed `patterns` to state response

**Expected Outcome:**
The UI becomes a window into the simulation's intelligence. Judges see: AI vs. fallback decision badges, world events with mechanical impact, memory patterns per nation, resource bars, and color-coded action arrows. Every Phase 1-5 improvement is now visible.

**Validation Test:**
1. Start simulation with `FEATHERLESS_API_KEY` set.
2. After a few cycles, click a nation — verify: `[AI]` badges on reactions, resource bar, memory patterns, alliance strength.
3. Verify the world event banner displays and changes over time.
4. Verify event arrows on the map are color-coded by action type.
5. Trigger a user action and verify the reaction panel updates with reasoning text displayed.

---

## Phase 7 — Stability Reinforcement

**Goal:**
Final sweep to ensure nothing breaks. Tighten validation, add defensive guards for new features, and verify the system degrades gracefully when AI is unavailable.

**Why this matters:**
- **Intelligence:** None. This is infrastructure.
- **Realism:** None directly. But a crash during demo kills everything.
- **Judge perception:** A stable demo that runs for 5 minutes without errors is better than a brilliant demo that crashes at minute 2.

**Tasks:**

1. In `server/engine/state-validator.js`, add validation for new fields:
   - `nation.resources` must be a number, clamped to [0, 120].
   - `nation.alliances` entries must be objects with `id` (string) and `strength` (1-3) if Phase 4 is applied, or strings if not.
   - Add a `patterns` field cleanup (strip it if corrupt).

2. In `server/engine/simulation.js`, add a try/catch around `applyWorldEventEffects()` (Phase 3) so a bad event never crashes the cycle.

3. In `server/engine/agent-loop.js`, add a timeout guard around the full AI decision path. If `getNationDecision()` takes longer than 10 seconds for a single nation, force fallback. This prevents a slow AI API from blocking the entire cycle.

4. In `server/ai/decision-parser.js`, add a sanity check: if AI returns `attack` but the nation is `isolationist` with trust > 0 toward the target, log a warning but accept it (AI is allowed to be creative, but log it for debugging).

5. Run full integration test:
   - Start server.
   - Start simulation.
   - Let it run for 30+ cycles (3.5 minutes).
   - Verify no crashes, no NaN trust scores, no undefined nations, no memory overflow.
   - Verify state is consistent after every cycle.

6. Test graceful degradation:
   - Unset `FEATHERLESS_API_KEY`.
   - Repeat the 30-cycle test.
   - Verify all decisions fall back cleanly and the simulation still produces interesting behavior.

**Files to modify:**
- `server/engine/state-validator.js` — expanded validation rules
- `server/engine/simulation.js` — defensive try/catch for world events
- `server/engine/agent-loop.js` — timeout guard on AI calls
- `server/ai/decision-parser.js` — sanity logging

**Expected Outcome:**
The system survives 30+ minutes of continuous simulation without errors, whether AI is available or not. Every mutation is validated. No edge case crashes the demo.

**Validation Test:**
1. Start simulation, let it run for 5 minutes unattended.
2. Check server console — zero unhandled errors.
3. Call `/api/state` — all nation data is valid (trust in range, alliances well-formed, memory within cap, resources in bounds).
4. Reset the world, start again — clean slate, no state leaks from previous session.
5. Repeat with API key unset — same stability, just `[Fallback]` tags on all decisions.

---

## Execution Order

| Order | Phase | Estimated Risk | Dependencies |
|-------|-------|---------------|-------------|
| 1st | Phase 1 — AI Decision Refactor | Low (existing `getNationDecision` is already built) | None |
| 2nd | Phase 2 — Memory Intelligence | Low (additive, no breaking changes) | None |
| 3rd | Phase 3 — External Signal Activation | Low (new file, minimal integration) | None |
| 4th | Phase 5 — Simulation Behavior Tuning | Low (parameter tweaks + resource field) | Phase 1 helps quality |
| 5th | Phase 4 — Alliance Intelligence | Medium (data structure change touches multiple files) | None, but do after core is stable |
| 6th | Phase 6 — UI Insight Upgrade | Low (read-only presentation changes) | Phases 1-5 (displays their output) |
| 7th | Phase 7 — Stability Reinforcement | Zero (validation + testing only) | All phases complete |

> **Note:** Phases 1, 2, and 3 are independent and can be developed in parallel by different people. Phase 6 should be done last before Phase 7 because it surfaces all improvements visually.

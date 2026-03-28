require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const { initWorld, getWorld, resetWorld, getAllNationIds } = require("./engine/world");
const { updateTrust } = require("./engine/trust");
const { applyAllianceChanges } = require("./engine/alliances");
const { distributeMemory, recallPatterns } = require("./engine/memory");
const { createEvent } = require("./models/event");
const { VALID_ACTIONS, ACTIONS, ACTION_RESOURCE_COST } = require("./data/actions");
const { fetchBrightDataEvent, clearBrightDataCache, getBrightDataStats } = require("./data/bright-data");
const { transformEvent, getRandomFallbackEvent, buildWorldEventContext } = require("./data/event-transformer");
const { processTurn } = require("./engine/turn");
const { startSimulation, pauseSimulation, isSimulationRunning, resetSimulationTime, initTime } = require("./engine/simulation");
const { validateWorldState } = require("./engine/state-validator");
const { applyWorldEventEffects } = require("./engine/world-events");
const { errorHandler } = require("./middleware/error-handler");
const { getDecisionStats } = require("./ai/index");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize world on server start
initWorld();
// Seed the time system
getWorld().config.time = initTime();

// GET /api/state — Return current world state with computed patterns
app.get("/api/state", (req, res) => {
  const world = getWorld();
  const allIds = getAllNationIds();
  // Enrich each nation with computed patterns from memory (read-only)
  const enriched = {
    ...world,
    nations: world.nations.map((n) => {
      const patterns = {};
      for (const otherId of allIds) {
        if (otherId === n.id) continue;
        const p = recallPatterns(n, otherId);
        if (p.totalInteractions > 0) {
          patterns[otherId] = { hostile: p.hostileCount, friendly: p.friendlyCount };
        }
      }
      return { ...n, patterns };
    }),
    lastTurnSummary: world.config.lastTurnSummary || null,
    debug: { ...getDecisionStats(), ...getBrightDataStats() },
  };
  res.json(enriched);
});

// POST /api/reset — Reset to initial state
app.post("/api/reset", (req, res) => {
  resetSimulationTime();
  clearBrightDataCache();
  const world = resetWorld();
  world.config.time = initTime();
  res.json({ message: "World reset to initial state", world });
});

// POST /api/simulation/start — Start the autonomous simulation loop
app.post("/api/simulation/start", (req, res) => {
  const result = startSimulation();
  res.json(result);
});

// POST /api/simulation/pause — Pause the autonomous simulation loop
app.post("/api/simulation/pause", (req, res) => {
  const result = pauseSimulation();
  res.json(result);
});

// GET /api/simulation/status — Check if simulation is running
app.get("/api/simulation/status", (req, res) => {
  res.json({ running: isSimulationRunning() });
});

// POST /api/event — Trigger an event (async for AI agent reactions)
app.post("/api/event", async (req, res) => {
  const { type, source, target, description } = req.body || {};

  // Validate required fields
  if (!type || !source) {
    return res.status(400).json({ error: "Missing required fields: type, source" });
  }
  if (!VALID_ACTIONS.includes(type)) {
    return res.status(400).json({ error: `Invalid action type: ${type}. Valid: ${VALID_ACTIONS.join(", ")}` });
  }

  const world = getWorld();
  const allIds = getAllNationIds();

  if (!allIds.includes(source)) {
    return res.status(400).json({ error: `Unknown source nation: ${source}` });
  }
  if (target && !allIds.includes(target)) {
    return res.status(400).json({ error: `Unknown target nation: ${target}` });
  }
  if (target && source === target) {
    return res.status(400).json({ error: "Source and target cannot be the same nation" });
  }

  const turn = world.config.turn;
  const eventDescription = description || `${source} performs ${type}${target ? " on " + target : ""}`;

  // Create event record
  const event = createEvent({ type, source, target: target || null, description: eventDescription, turn });

  // Apply trust updates (only if there's a target)
  let trustChanges = {};
  if (target) {
    trustChanges = updateTrust(world, source, target, type);
  }

  // Apply alliance changes
  if (target) {
    applyAllianceChanges(world, source, target, type);
  }

  // Update nation statuses
  if (type === ACTIONS.ATTACK && target) {
    const sourceNation = world.nations.find((n) => n.id === source);
    const targetNation = world.nations.find((n) => n.id === target);
    if (sourceNation) sourceNation.status = "war";
    if (targetNation) targetNation.status = "war";
  } else if (type === ACTIONS.SANCTION && target) {
    const targetNation = world.nations.find((n) => n.id === target);
    if (targetNation && targetNation.status === "peace") targetNation.status = "tension";
  }

  // Distribute memory to involved + allied nations
  if (target) {
    distributeMemory(world, turn, source, target, type, eventDescription);
  }

  // Apply resource cost (Phase 5)
  const srcNation = world.nations.find((n) => n.id === source);
  if (srcNation) {
    srcNation.resources += ACTION_RESOURCE_COST[type] || 0;
    srcNation.resources = Math.max(0, srcNation.resources);
  }
  if (type === ACTIONS.TRADE && target) {
    const tgtNation = world.nations.find((n) => n.id === target);
    if (tgtNation) {
      tgtNation.resources = Math.min(120, tgtNation.resources + 5);
    }
  }

  // Apply world event trust modifiers (if an active world event exists)
  let worldEventChanges = {};
  if (world.config.worldEvent) {
    const result = applyWorldEventEffects(world, world.config.worldEvent);
    worldEventChanges = result.changes;
  }

  // Log the triggering event
  world.config.eventLog.push(event);
  world.config.currentEvent = event;

  // --- Phase 7: Run AI agent reactions ---
  let turnSummary = null;
  try {
    const result = await processTurn(event, world);
    turnSummary = result.turnSummary;
  } catch (err) {
    console.error("[Turn] Agent reaction loop failed:", err.message);
    // Non-fatal — user action already applied, just no AI reactions
  }

  // Advance turn AFTER reactions have been applied
  world.config.turn += 1;

  // --- Phase 9: Validate state after every mutation ---
  validateWorldState(world);

  // Store in world.config so /api/state can also return it
  if (turnSummary) {
    world.config.lastTurnSummary = turnSummary;
  }

  res.json({
    event,
    trustChanges,
    worldEventChanges,
    turnSummary,
    world,
  });
});

// GET /api/world-event — Fetch and transform a real-world event (Bright Data → fallback)
app.get("/api/world-event", async (req, res) => {
  const world = getWorld();

  // If we already have a world event cached in state, return it
  if (world.config.worldEvent) {
    return res.json({ worldEvent: world.config.worldEvent, source: "cached" });
  }

  try {
    // Try Bright Data first
    const rawText = await fetchBrightDataEvent();
    if (rawText) {
      const transformed = transformEvent(rawText);
      if (transformed) {
        world.config.worldEvent = transformed;
        return res.json({ worldEvent: transformed, source: "brightdata" });
      }
    }
  } catch (err) {
    console.error("[WorldEvent] Bright Data fetch error:", err.message);
  }

  // Fallback to hardcoded event pool
  const fallback = getRandomFallbackEvent();
  world.config.worldEvent = fallback;
  res.json({ worldEvent: fallback, source: "fallback" });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", turn: getWorld().config.turn });
});

// --- Phase 9: Global error handler (must be last middleware) ---
app.use(errorHandler);

// Catch unhandled promise rejections to prevent silent crashes
process.on("unhandledRejection", (err) => {
  console.error("[Process] Unhandled rejection:", err?.message || err);
});

app.listen(PORT, () => {
  console.log(`World Sim server running on http://localhost:${PORT}`);
});

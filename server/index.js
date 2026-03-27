require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const express = require("express");
const cors = require("cors");
const { initWorld, getWorld, resetWorld, getAllNationIds } = require("./engine/world");
const { updateTrust } = require("./engine/trust");
const { applyAllianceChanges } = require("./engine/alliances");
const { distributeMemory } = require("./engine/memory");
const { createEvent } = require("./models/event");
const { VALID_ACTIONS, ACTIONS } = require("./data/actions");

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize world on server start
initWorld();

// GET /api/state — Return current world state
app.get("/api/state", (req, res) => {
  res.json(getWorld());
});

// POST /api/reset — Reset to initial state
app.post("/api/reset", (req, res) => {
  const world = resetWorld();
  res.json({ message: "World reset to initial state", world });
});

// POST /api/event — Trigger an event
app.post("/api/event", (req, res) => {
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

  // Advance turn and update event log
  world.config.turn += 1;
  world.config.eventLog.push(event);
  world.config.currentEvent = event;

  res.json({
    event,
    trustChanges,
    world,
  });
});

// Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", turn: getWorld().config.turn });
});

app.listen(PORT, () => {
  console.log(`World Sim server running on http://localhost:${PORT}`);
});

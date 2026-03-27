# AI-Driven Multi-Agent Geopolitical Simulation — Plan

## Architecture Summary

### Data Layer (In-Memory JSON)
- **Nation Model**: `{ name, personality, alliances[], trust{}, memory[] }`
- No database — all state lives in-memory as JSON objects
- State mutated by the core engine after each turn

### Backend (Python or Node)
- Core engine: event handling → rule-based bias (trust + alliances) → AI decision layer
- Endpoints: init world, trigger event, get state
- Bright Data: single fetch for one real-world event, injected into AI prompts

### AI Layer (Featherless API)
- Used **only** for: decision-making (support / neutral / betray) + explanation text
- Rule-based logic handles trust/alliance math — AI adds reasoning flavor
- World context + nation memory + trust scores passed as prompt context

### Frontend (React + SVG)
- Static SVG map of Europe with clickable nation regions
- Color-coded nations (alliance groups, war status)
- Arrows for attack/war events
- Side panel: decision log + AI reasoning output

---

## Game Flow

```
User selects nation
    → Load initial world state
    → Bright Data injects 1 real-world event
    → User triggers action (attack, ally, sanction, etc.)
    → Backend builds context (trust, alliances, memory, world event)
    → Each AI agent decides (rule-based bias + Featherless reasoning)
    → State updates: trust scores, alliances, memory logs
    → UI refreshes: map colors, arrows, decision panel
    → Next turn
```

---

## Development Phases — Detailed Breakdown

---

### Phase 1 — Data Models & Initial World State
**Goal**: Define the core data structures and seed the simulation with an initial set of European nations.

**Deliverables**:
- Nation schema: `{ id, name, personality, alliances[], trust{}, memory[], resources, status }`
- Event schema: `{ id, type, source, target, description, turn }`
- Action types enum: `attack, ally, sanction, trade, betray, support, neutral`
- Initial world state JSON with 6 European nations (France, Germany, UK, Russia, Poland, Italy)
- Each nation seeded with: personality traits, starting alliances, initial trust scores
- World config: `{ turn: 0, phase: "peace", eventLog: [], currentEvent: null }`

**Files**:
- `server/models/nation.js` — Nation class/schema
- `server/models/event.js` — Event class/schema
- `server/data/initial-world.json` — Seed data
- `server/data/actions.js` — Action type constants

---

### Phase 2 — Backend Engine (Core Logic)
**Goal**: Build the core game engine that processes events, updates trust, and manages memory.

**Deliverables**:
- Express.js HTTP server with CORS
- World state manager: load, mutate, reset
- Trust engine: `updateTrust(source, target, action)` — rule-based delta calculations
- Alliance manager: form, break, check alliances
- Memory manager: append events to nation memory (capped to last 10)
- Personality bias function: modifies trust deltas based on nation personality

**Files**:
- `server/index.js` — Express server entry point
- `server/engine/world.js` — World state manager
- `server/engine/trust.js` — Trust calculation logic
- `server/engine/alliances.js` — Alliance operations
- `server/engine/memory.js` — Nation memory manager

**Endpoints**:
- `GET /api/state` — Return current world state
- `POST /api/reset` — Reset to initial state
- `POST /api/event` — Trigger an event manually

---

### Phase 3 — Featherless AI Integration
**Goal**: Connect to Featherless API so each nation agent can make decisions with AI-generated reasoning.

**Deliverables**:
- Featherless API client wrapper (single function, retry logic)
- Prompt builder: constructs context from nation memory + trust + alliances + current event
- Decision parser: extracts `{ action, target, reasoning }` from AI response
- Rule-based bias applied BEFORE AI call (trust thresholds gate decisions)
- AI adds flavor text / explanation, does NOT override rule-based logic
- Fallback: if AI fails, use pure rule-based decision

**Files**:
- `server/ai/featherless.js` — API client
- `server/ai/prompt-builder.js` — Prompt construction
- `server/ai/decision-parser.js` — Response parsing
- `server/ai/fallback.js` — Rule-based fallback logic

**API Contract**:
- Input: nation context object + event description
- Output: `{ decision: "support|neutral|betray", reasoning: "string" }`

---

### Phase 4 — Bright Data Integration
**Goal**: Fetch one real-world event from Bright Data and inject it as simulation context.

**Deliverables**:
- Bright Data API client (single fetch, cached per session)
- Event transformer: converts raw news data → simulation-compatible event string
- Context injector: adds real-world event to AI prompt context
- Fallback: hardcoded event pool if Bright Data is unavailable

**Files**:
- `server/data/bright-data.js` — Bright Data API client
- `server/data/event-transformer.js` — Raw → simulation event converter
- `server/data/fallback-events.json` — Hardcoded backup events

**Flow**:
```
Game init → Bright Data fetch → Transform to event string → Store in world state → Inject into AI prompts
```

---

### Phase 5 — Map UI (React + SVG)
**Goal**: Build a static SVG map of Europe with clickable nation regions and visual state indicators.

**Deliverables**:
- React app scaffolded with Vite
- SVG map component with 6 European nation regions (simplified paths)
- Click handler: select a nation → highlight + show details
- Color coding: alliance groups (NATO blue, neutral gray, hostile red)
- Status indicators: peace (green border), tension (yellow), war (red)
- Tooltip on hover: nation name + trust summary

**Files**:
- `client/src/App.jsx` — Root app component
- `client/src/components/MapView.jsx` — SVG map renderer
- `client/src/components/NationRegion.jsx` — Individual nation SVG region
- `client/src/assets/europe-map.svg` — Base SVG paths
- `client/src/styles/map.css` — Map styling

---

### Phase 6 — Connect Frontend + Backend
**Goal**: Wire the React frontend to the Express backend via REST API.

**Deliverables**:
- API service layer in frontend (fetch wrapper)
- State sync: load world state on mount, refresh after each action
- Nation selection → populate side panel with trust scores, alliances, memory
- Action buttons wired to backend `POST /api/event`
- Loading states and error display

**Files**:
- `client/src/services/api.js` — API client
- `client/src/components/SidePanel.jsx` — Nation details + decision log
- `client/src/components/ActionBar.jsx` — User action buttons
- `client/src/hooks/useWorldState.js` — State management hook

**Endpoints Used**:
- `GET /api/state` — On mount + after actions
- `POST /api/event` — When user triggers action
- `POST /api/reset` — Reset button

---

### Phase 7 — Game Loop & Turn System
**Goal**: Implement the sequential turn system where all AI agents respond to each event.

**Deliverables**:
- Turn manager: increment turn, track phase (peace/tension/war)
- Sequential agent loop: for each non-player nation, run AI decision
- Decision queue: collect all AI decisions, apply in order
- State mutation: after all decisions, update trust/alliances/memory
- Turn summary: compile all decisions into a turn report
- Auto-advance option: timer-based or manual "Next Turn" button

**Files**:
- `server/engine/turn.js` — Turn manager
- `server/engine/agent-loop.js` — Sequential AI agent execution
- `client/src/components/TurnControls.jsx` — Next turn / auto-advance UI

**Turn Flow**:
```
User action → Server processes → AI agents decide sequentially → State updates → Turn summary → UI refresh
```

---

### Phase 8 — Interaction Layer (Full Round-Trip)
**Goal**: Complete the user interaction flow — pick nation, take actions, see AI responses.

**Deliverables**:
- Nation selection screen (pick your nation at game start)
- Full action menu: attack, ally, sanction, trade, support
- Target selection: click nation on map as action target
- AI response display: each nation's decision + reasoning in side panel
- Decision log: scrollable history of all turns with expandable details
- Map updates: arrows for attacks, color shifts for alliance changes

**Files**:
- `client/src/components/NationPicker.jsx` — Starting nation selection
- `client/src/components/DecisionLog.jsx` — Turn history log
- `client/src/components/ActionModal.jsx` — Action + target selection
- `server/engine/action-handler.js` — Process user actions

---

### Phase 9 — Stabilize & Edge Cases
**Goal**: Harden the application against failures and edge cases.

**Deliverables**:
- API error handling: timeout, rate limit, malformed response
- AI fallback: if Featherless fails, use rule-based decisions silently
- Bright Data fallback: use hardcoded events if fetch fails
- Input validation: sanitize user actions, prevent invalid state transitions
- State consistency: verify trust scores stay in [-100, 100] range
- Memory cap: trim nation memory to last 10 entries
- Graceful degradation: app works without AI (rule-based only mode)

**Files**:
- `server/middleware/error-handler.js` — Express error middleware
- `server/middleware/validate.js` — Request validation
- `server/engine/state-validator.js` — Post-mutation state checks

---

### Phase 10 — Demo Prep & Polish
**Goal**: Prepare a clean demo flow and polish the user experience.

**Deliverables**:
- Happy path script: France allies Germany → Russia attacks Poland → chain reactions
- Loading animations for AI thinking
- Smooth map transitions (CSS transitions on color changes)
- Decision panel formatting: clear, readable AI reasoning
- Reset button with confirmation
- README with setup instructions and demo walkthrough
- Environment variable setup for API keys (`.env.example`)

**Files**:
- `README.md` — Setup + demo guide
- `.env.example` — Required environment variables
- `client/src/styles/animations.css` — UI polish
- `demo-script.md` — Step-by-step demo walkthrough

---

## Strict Constraints

### DO NOT
- Build a full game engine
- Simulate real borders dynamically
- Use any database
- Introduce complex frameworks
- Overcomplicate the UI
- Rely fully on AI without rule-based logic

### ALWAYS
- Keep things minimal
- Prioritize working features
- Ensure stability
- Keep code readable

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | React, SVG map |
| Backend | Python or Node (simple HTTP server) |
| AI | Featherless API |
| Data injection | Bright Data (1 real-world event) |
| Storage | In-memory JSON (no DB) |

---

## Status

- [x] Architecture confirmed
- [x] Phases confirmed
- [x] Constraints confirmed
- [x] Phase 1 — Data Models & Initial World State
- [x] Phase 2 — Backend Engine (Core Logic)
- [x] Phase 3 — Featherless AI Integration
- [x] Phase 4 — Bright Data Integration
- [x] Phase 5 — Map UI (React + SVG)
- [x] Phase 6 — Connect Frontend + Backend
- [x] Phase 7 — Game Loop & Turn System
- [x] Phase 8 — Interaction Layer (Full Round-Trip)
- [ ] Phase 9 — Stabilize & Edge Cases
- [ ] Phase 10 — Demo Prep & Polish

// ===== PHASE 1 DEEP VALIDATION =====
const { initWorld, getWorld, getAllNationIds, getNation } = require('./engine/world');
const { runAgentReactions } = require('./engine/agent-loop');
const { getNationDecision } = require('./ai/index');
const { fallbackDecision } = require('./ai/fallback');
const { buildPrompt, SYSTEM_PROMPT } = require('./ai/prompt-builder');
const { recallPatterns, appendMemory, buildMemoryEntry } = require('./engine/memory');
const { createEvent } = require('./models/event');
const { processTurn } = require('./engine/turn');
const fs = require('fs');

(async () => {
  let issues = [];

  // ---- TEST 1: Module loading ----
  console.log('=== TEST 1: Module Loading ===');
  try {
    initWorld();
    const world = getWorld();
    const ids = getAllNationIds();
    console.log('  Nations:', ids.length, '- PASS');
  } catch(e) {
    issues.push('Module loading failed: ' + e.message);
    console.log('  FAIL:', e.message);
  }

  // ---- TEST 2: getNationDecision returns source field (no API key = fallback) ----
  console.log('\n=== TEST 2: getNationDecision source field ===');
  const world = getWorld();
  const event = createEvent({ type: 'attack', source: 'russia', target: 'poland', description: 'Russia attacks Poland', turn: 0 });
  const france = getNation('france');
  const allIds = getAllNationIds();
  const result = await getNationDecision(france, event, allIds, null);
  if (!result.source) {
    issues.push('getNationDecision missing source field');
    console.log('  FAIL: No source field');
  } else {
    console.log('  PASS: source =', result.source, '| decision =', result.decision);
  }

  // ---- TEST 3: fallbackDecision structure ----
  console.log('\n=== TEST 3: fallbackDecision structure ===');
  const fbResult = fallbackDecision(france, event, allIds);
  if (!fbResult.decision || fbResult.reasoning === undefined) {
    issues.push('fallbackDecision missing fields');
    console.log('  FAIL');
  } else {
    console.log('  PASS: decision =', fbResult.decision, '| target =', fbResult.target);
  }
  if (fbResult.source) {
    issues.push('fallbackDecision should NOT have source field (caller adds it)');
    console.log('  WARNING: source field leaking from fallback');
  }

  // ---- TEST 4: runAgentReactions source tracking ----
  console.log('\n=== TEST 4: runAgentReactions source tracking ===');
  world.config.eventLog = world.config.eventLog || [];
  const reactions = await runAgentReactions(event, world);
  console.log('  Total reactions:', reactions.length);
  const missingSource = reactions.filter(r => !r.source);
  if (missingSource.length > 0) {
    issues.push('Reactions without source: ' + missingSource.map(r=>r.nation).join(', '));
    console.log('  FAIL: Missing source on', missingSource.length);
  } else {
    console.log('  PASS: All', reactions.length, 'reactions have source field');
  }
  reactions.forEach(r => {
    console.log('    ', r.nation, '->', r.decision, r.target || '(none)', '| source:', r.source);
  });

  // ---- TEST 5: Event log [AI]/[Rule] tags ----
  console.log('\n=== TEST 5: Event log [AI]/[Rule] tags ===');
  const taggedEvents = world.config.eventLog.filter(e => e.description && (e.description.includes('[AI]') || e.description.includes('[Rule]')));
  if (taggedEvents.length === 0 && reactions.length > 0) {
    issues.push('No [AI]/[Rule] tags in event log despite reactions');
    console.log('  FAIL');
  } else {
    console.log('  PASS:', taggedEvents.length, 'tagged events');
    taggedEvents.slice(0, 3).forEach(e => console.log('    ', e.description.substring(0, 80)));
  }

  // ---- TEST 6: recallPatterns correctness ----
  console.log('\n=== TEST 6: recallPatterns correctness ===');
  const testNation = { id: 'test', memory: [
    { turn: 1, source: 'x', target: 'test', action: 'attack', summary: '' },
    { turn: 2, source: 'x', target: 'test', action: 'attack', summary: '' },
    { turn: 3, source: 'x', target: 'test', action: 'trade', summary: '' },
    { turn: 4, source: 'y', target: 'test', action: 'attack', summary: '' },
  ]};
  const p = recallPatterns(testNation, 'x');
  if (p.hostileCount !== 2 || p.friendlyCount !== 1 || p.totalInteractions !== 3 || p.dominantPattern !== 'hostile') {
    issues.push('recallPatterns wrong: ' + JSON.stringify(p));
    console.log('  FAIL:', JSON.stringify(p));
  } else {
    console.log('  PASS:', JSON.stringify(p));
  }
  // Edge cases
  const pEmpty = recallPatterns({ id: 'z', memory: [] }, 'x');
  console.log('  Edge (empty mem):', pEmpty.dominantPattern === 'none' ? 'PASS' : 'FAIL');
  const pNull = recallPatterns(testNation, null);
  console.log('  Edge (null target):', pNull.totalInteractions === 0 ? 'PASS' : 'FAIL');

  // ---- TEST 7: buildPrompt enhancements ----
  console.log('\n=== TEST 7: buildPrompt enhancements ===');
  const memFrance = getNation('france');
  appendMemory(memFrance, buildMemoryEntry(0, 'russia', 'france', 'attack', 'Russia attacked France'));
  appendMemory(memFrance, buildMemoryEntry(1, 'russia', 'france', 'sanction', 'Russia sanctioned France'));
  const prompt = buildPrompt(memFrance, event, 'NATO increases defense spending');
  const hasPersonality = prompt.includes('diplomatic') && prompt.includes('you value');
  const hasPattern = prompt.includes('Pattern analysis');
  const hasWorldEvent = prompt.includes('NATO increases defense spending');
  console.log('  Personality desc:', hasPersonality ? 'PASS' : 'FAIL');
  console.log('  Pattern analysis:', hasPattern ? 'PASS' : 'FAIL');
  console.log('  World event:', hasWorldEvent ? 'PASS' : 'FAIL');
  if (!hasPersonality) issues.push('buildPrompt missing personality description');
  if (!hasPattern) issues.push('buildPrompt missing pattern analysis');
  if (!hasWorldEvent) issues.push('buildPrompt missing world event');

  // ---- TEST 8: MAX_AI_CALLS >= 5 ----
  console.log('\n=== TEST 8: MAX_AI_CALLS check ===');
  const agentLoopSrc = fs.readFileSync('./engine/agent-loop.js', 'utf8');
  const maxMatch = agentLoopSrc.match(/MAX_AI_CALLS\s*=\s*(\d+)/);
  if (!maxMatch || parseInt(maxMatch[1]) < 5) {
    issues.push('MAX_AI_CALLS < 5: ' + (maxMatch ? maxMatch[1] : 'not found'));
    console.log('  FAIL');
  } else {
    console.log('  PASS: MAX_AI_CALLS =', maxMatch[1]);
  }

  // ---- TEST 9: processTurn turnSummary structure (CRITICAL: does it include source?) ----
  console.log('\n=== TEST 9: processTurn turnSummary.reactions ===');
  const world2 = getWorld();
  world2.config.eventLog = [];
  const event2 = createEvent({ type: 'trade', source: 'france', target: 'germany', description: 'France trades with Germany', turn: 100 });
  const turnResult = await processTurn(event2, world2);
  const ts = turnResult.turnSummary;
  console.log('  reactions count:', ts.reactions.length);
  const hasSrc = ts.reactions.length > 0 && ts.reactions[0].source;
  if (!hasSrc) {
    issues.push('CRITICAL: turnSummary.reactions missing source field — UI cannot display AI/fallback badge');
    console.log('  FAIL: source field NOT in turnSummary.reactions');
    console.log('  Fields present:', Object.keys(ts.reactions[0] || {}));
  } else {
    console.log('  PASS: source field present');
  }

  // ---- SUMMARY ----
  console.log('\n========================================');
  if (issues.length === 0) {
    console.log('ALL VALIDATION PASSED — 0 issues');
  } else {
    console.log('ISSUES FOUND:', issues.length);
    issues.forEach((iss, i) => console.log('  ' + (i+1) + '.', iss));
  }
  console.log('========================================');
  process.exit(issues.length > 0 ? 1 : 0);
})();

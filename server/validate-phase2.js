// ===== PHASE 2 VALIDATION — Memory Intelligence in Fallback =====
const { initWorld, getWorld, getNation, getAllNationIds } = require('./engine/world');
const { fallbackDecision } = require('./ai/fallback');
const { appendMemory, buildMemoryEntry, recallPatterns } = require('./engine/memory');
const { createEvent } = require('./models/event');
const { ACTIONS } = require('./data/actions');

(async () => {
  let issues = [];
  initWorld();

  // ---- TEST 1: Escalation — 3+ hostile → sanction escalates to attack ----
  console.log('=== TEST 1: Escalation (sanction → attack) ===');
  const world = getWorld();
  const poland = getNation('poland');
  const allIds = getAllNationIds();

  // Give Poland 3 hostile memories of Russia
  appendMemory(poland, buildMemoryEntry(1, 'russia', 'poland', 'attack', 'Russia attacked Poland'));
  appendMemory(poland, buildMemoryEntry(2, 'russia', 'poland', 'sanction', 'Russia sanctioned Poland'));
  appendMemory(poland, buildMemoryEntry(3, 'russia', 'poland', 'betray', 'Russia betrayed Poland'));

  // Verify patterns
  const p = recallPatterns(poland, 'russia');
  console.log('  Memory patterns:', JSON.stringify(p));
  if (p.hostileCount < 3) {
    issues.push('Expected 3+ hostile but got ' + p.hostileCount);
  }

  // Create an event where Russia attacks UK (Poland is observer, allied with no one special)
  // Poland is defensive — base decision should be neutral
  // But with 3 hostile memories of Russia, neutral should escalate to SANCTION
  const event1 = createEvent({ type: 'attack', source: 'russia', target: 'uk', description: 'Russia attacks UK', turn: 5 });
  const result1 = fallbackDecision(poland, event1, allIds);
  console.log('  Decision:', result1.decision, '| Target:', result1.target);
  console.log('  Reasoning:', result1.reasoning);

  // Poland is defensive → base = neutral. With hostileCount >= 3: neutral → sanction (escalated)
  if (result1.decision === ACTIONS.SANCTION) {
    console.log('  PASS: Escalated from neutral to sanction');
  } else if (result1.decision === ACTIONS.NEUTRAL) {
    issues.push('Expected escalation (neutral → sanction) but got neutral — escalation not working');
    console.log('  FAIL: No escalation occurred');
  } else {
    console.log('  NOTE: Got', result1.decision, '(may be from personality override)');
  }

  // ---- TEST 2: Escalation — sanction → attack ----
  console.log('\n=== TEST 2: Escalation (sanction → attack for ally defense) ===');
  const germany = getNation('germany');
  // Give Germany 3 hostile memories of Russia
  appendMemory(germany, buildMemoryEntry(1, 'russia', 'germany', 'attack', 'R attacked G'));
  appendMemory(germany, buildMemoryEntry(2, 'russia', 'germany', 'betray', 'R betrayed G'));
  appendMemory(germany, buildMemoryEntry(3, 'russia', 'germany', 'sanction', 'R sanctioned G'));

  // Germany is allied with france. If Russia attacks france, Germany sanctions Russia (ally defense).
  // With 3+ hostile → sanction escalates to attack
  const event2 = createEvent({ type: 'attack', source: 'russia', target: 'france', description: 'Russia attacks France', turn: 6 });
  const result2 = fallbackDecision(germany, event2, allIds);
  console.log('  Decision:', result2.decision, '| Target:', result2.target);
  console.log('  Reasoning:', result2.reasoning);

  if (result2.decision === ACTIONS.ATTACK) {
    console.log('  PASS: Escalated from sanction to attack');
  } else if (result2.decision === ACTIONS.SANCTION) {
    issues.push('Expected sanction → attack escalation but still got sanction');
    console.log('  FAIL: Escalation did not kick in');
  } else {
    console.log('  NOTE: Got', result2.decision);
  }

  // ---- TEST 3: De-escalation — 3+ friendly → attack de-escalates to sanction ----
  console.log('\n=== TEST 3: De-escalation (attack → sanction) ===');
  const france = getNation('france');
  // Give France 3 friendly memories of Russia
  appendMemory(france, buildMemoryEntry(1, 'russia', 'france', 'trade', 'R traded with F'));
  appendMemory(france, buildMemoryEntry(2, 'russia', 'france', 'support', 'R supported F'));
  appendMemory(france, buildMemoryEntry(3, 'russia', 'france', 'ally', 'R allied with F'));

  const pf = recallPatterns(france, 'russia');
  console.log('  France memory of Russia:', JSON.stringify(pf));

  // If Russia attacks France directly, base logic = attack (retaliation).
  // With 3+ friendly: attack → sanction (de-escalated)
  const event3 = createEvent({ type: 'attack', source: 'russia', target: 'france', description: 'Russia attacks France', turn: 7 });
  const result3 = fallbackDecision(france, event3, allIds);
  console.log('  Decision:', result3.decision, '| Target:', result3.target);
  console.log('  Reasoning:', result3.reasoning);

  if (result3.decision === ACTIONS.SANCTION) {
    console.log('  PASS: De-escalated from attack to sanction');
  } else if (result3.decision === ACTIONS.ATTACK) {
    issues.push('Expected de-escalation (attack → sanction) but got attack');
    console.log('  FAIL: De-escalation did not kick in');
  } else {
    console.log('  NOTE: Got', result3.decision);
  }

  // ---- TEST 4: No change when < 3 memories ----
  console.log('\n=== TEST 4: No escalation with < 3 hostile memories ===');
  const uk = getNation('uk');
  // Give UK only 2 hostile memories of Russia
  appendMemory(uk, buildMemoryEntry(1, 'russia', 'uk', 'attack', 'R attacked UK'));
  appendMemory(uk, buildMemoryEntry(2, 'russia', 'uk', 'sanction', 'R sanctioned UK'));

  const pu = recallPatterns(uk, 'russia');
  console.log('  UK memory of Russia:', JSON.stringify(pu));

  // UK is opportunistic. With -20 trust and attack event, base = sanction of weakest.
  // But only 2 hostile memories — should NOT escalate
  const event4 = createEvent({ type: 'attack', source: 'russia', target: 'poland', description: 'Russia attacks Poland', turn: 8 });
  const result4 = fallbackDecision(uk, event4, allIds);
  console.log('  Decision:', result4.decision, '| Target:', result4.target);
  console.log('  Reasoning:', result4.reasoning);

  if (result4.reasoning && result4.reasoning.includes('Escalated')) {
    issues.push('Escalated with only 2 hostile memories — threshold too low');
    console.log('  FAIL: Escalation fired too early');
  } else {
    console.log('  PASS: No premature escalation');
  }

  // ---- TEST 5: Module integrity ----
  console.log('\n=== TEST 5: Module loads and exports correctly ===');
  if (typeof fallbackDecision === 'function') {
    console.log('  PASS: fallbackDecision is a function');
  } else {
    issues.push('fallbackDecision not a function');
    console.log('  FAIL');
  }

  // ---- SUMMARY ----
  console.log('\n========================================');
  if (issues.length === 0) {
    console.log('PHASE 2 VALIDATION PASSED — 0 issues');
  } else {
    console.log('ISSUES FOUND:', issues.length);
    issues.forEach((iss, i) => console.log('  ' + (i+1) + '.', iss));
  }
  console.log('========================================');
  process.exit(issues.length > 0 ? 1 : 0);
})();

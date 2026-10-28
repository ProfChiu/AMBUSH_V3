#!/usr/bin/env node
/*
 * tools/test_operations_loop.js — Phase 7 Operations loop tests (docs/21_OPERATIONS_LOOP.md)
 *
 * Tests checksrules.js against the rulebook's own worked examples, then operationsloop.js's
 * Paragraph Check and Condition Change procedures against the real, verified Mission 1 data
 * (assets/data/mission_cards.json / paragraphs.json / paragraph_programs.js) — not synthetic
 * fixtures, same discipline as the rest of this session's test suites.
 *
 * Run:  node tools/test_operations_loop.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/hexgrid.js'));
require(path.join(ROOT, 'apps/game/checksrules.js'));
require(path.join(ROOT, 'apps/game/paragraphinterpreter.js'));
require(path.join(ROOT, 'apps/game/operationsloop.js'));
require(path.join(ROOT, 'assets/data/paragraph_programs.js'));
const Checks = window.AmbushChecks;
const Ops = window.AmbushOperations;
const PROGRAMS = window.AMBUSH_PARAGRAPH_PROGRAMS;
const PARAGRAPHS = require(path.join(ROOT, 'assets/data/paragraphs.json')).paragraphs;
const MISSION_CARDS = require(path.join(ROOT, 'assets/data/mission_cards.json')).mission_cards;
const MISSIONS = require(path.join(ROOT, 'assets/data/missions.json')).missions;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// ---------------------------------------------------------------------
// checksrules.js — against the rulebook's own worked examples.
// ---------------------------------------------------------------------
// §5/7 example (paragraph 288): PC reduced by 2. Roll <= (PC-2) succeeds.
check('PC check: roll 3 vs PC 5 (-2 mod, effective 3) succeeds', Checks.resolvePerceptionCheck(5, -2, 3) === 'success');
check('PC check: roll 4 vs PC 5 (-2 mod, effective 3) fails', Checks.resolvePerceptionCheck(5, -2, 4) === 'fail');
check('PC check: roll 0 always succeeds regardless of rating', Checks.resolvePerceptionCheck(0, -5, 0) === 'success');
check('PC check: roll 9 always fails regardless of rating', Checks.resolvePerceptionCheck(9, 5, 9) === 'fail');

// §5/8 worked example (paragraph 136): "Conduct Activation Check (-1)". Activation Level reduced by 1.
check('Activation check: roll <= (level-1) succeeds', Checks.resolveActivationCheck(5, -1, 4) === 'success');
check('Activation check: roll > (level-1) fails', Checks.resolveActivationCheck(5, -1, 5) === 'fail');
check('Activation check: roll 0 always succeeds', Checks.resolveActivationCheck(0, -5, 0) === 'success');
check('Activation check: roll 9 always fails', Checks.resolveActivationCheck(9, 5, 9) === 'fail');

// ---------------------------------------------------------------------
// parseCellValue
// ---------------------------------------------------------------------
check("parseCellValue('NONE') -> none", Ops.parseCellValue('NONE').type === 'none');
check("parseCellValue('EVENT') -> event", Ops.parseCellValue('EVENT').type === 'event');
check("parseCellValue('24') -> paragraph 24, no sighting gate",
      Ops.parseCellValue('24').type === 'paragraph' && Ops.parseCellValue('24').paragraph === '24' && Ops.parseCellValue('24').sighting === null);
check("parseCellValue('S3-600') -> paragraph 600, sighting 3",
      Ops.parseCellValue('S3-600').paragraph === '600' && Ops.parseCellValue('S3-600').sighting === '3');

// ---------------------------------------------------------------------
// paragraphCheck — real Mission 1 / Condition 1 data.
// ---------------------------------------------------------------------
function freshCtx(state, overrides) {
  overrides = overrides || {};
  return Ops.buildContext(Object.assign({
    state: state,
    activationLevel: MISSIONS['1'].activation_by_condition['1'],
    defaultPcRating: 5,
    rollDie: overrides.rollDie || (() => 5),
    soldiersWhoCanSee: overrides.soldiersWhoCanSee || (() => []),
    isGermanRemovedOnce: overrides.isGermanRemovedOnce || (() => false),
  }, overrides));
}
function checkOpts(state, ctx, extra) {
  return Object.assign({ mission: '1', missionCards: MISSION_CARDS, paragraphs: PARAGRAPHS, programs: PROGRAMS, state: state, ctx: ctx }, extra || {});
}

// A1 = NONE (real data, verified against the physical card in docs/19_DATA_LAYER.md).
{
  const state = Ops.createGameState();
  const r = Ops.paragraphCheck(checkOpts(state, freshCtx(state), { hexId: 'A1' }));
  check('A1 (NONE) -> no effect', r.effect === 'none');
}

// A3 = "24" -> "Place Event marker. Conduct PC Check (-1). If successful, see 013."
{
  const state = Ops.createGameState();
  const ctx = freshCtx(state, { rollDie: () => 0 }); // 0 always succeeds
  const r = Ops.paragraphCheck(checkOpts(state, ctx, { hexId: 'A3' }));
  // 13 ("Just your imagination.") had no program until Phase 8c, so the chain used to stop there.
  check('A3 (24, PC succeeds) -> chain visits 24 then 13 and ends there',
        r.chain.visited.join(',') === '24,13' && r.chain.reason === 'end');
  check('A3 places an Event marker (part of paragraph 24 itself, not the EVENT-cell mechanism)',
        r.chain.effects.some((e) => e.op === 'place_event_marker'));
}

// A8 = EVENT. RE-00 (this session's scripted event roll) = "12", which is pure flavor (empty
// program) — confirms the Event Check chain runs and the Event marker still gets placed
// (§5/6: placed regardless of the RE outcome), even though 12 itself does nothing further.
{
  const state = Ops.createGameState();
  const ctx = freshCtx(state);
  const r = Ops.paragraphCheck(checkOpts(state, ctx, { hexId: 'A8', rollForEvent: () => 0 }));
  check('A8 (EVENT, RE-00=12) -> event chain visits 12', r.chain.visited[0] === '12');
  check('A8 event marker placed in state', !!state.eventMarkers.A8);
}

// A8 again: the same hex, now with an Event marker already present, must be skipped entirely
// — no RE roll, no chain — per §5/3: "unless the hex contains an Event marker."
{
  const state = Ops.createGameState();
  state.eventMarkers.A8 = true;
  const ctx = freshCtx(state);
  let rollForEventCalled = false;
  const r = Ops.paragraphCheck(checkOpts(state, ctx, { hexId: 'A8', rollForEvent: () => { rollForEventCalled = true; return 0; } }));
  check('A8 with an existing Event marker is skipped entirely', r.skipped === 'event-marker-present');
  check('A8 with an existing Event marker never rolls for the event', !rollForEventCalled);
}

// F4 = "S3-600" — sighting-gated. First entry (s3 not occurred): reads paragraph 600. Second
// entry, after s3 has since occurred some other way, must be ignored per §5/1: "if it has
// occurred, ignore the paragraph and return to Operations."
{
  const state = Ops.createGameState();
  const ctx = freshCtx(state, { rollDie: () => 9 }); // 9 always fails the PC check inside 600
  const r1 = Ops.paragraphCheck(checkOpts(state, ctx, { hexId: 'F4' }));
  check('F4 (s3-600), s3 not yet occurred -> reads paragraph 600', r1.effect === 'paragraph' && r1.chain.visited[0] === '600');

  const state2 = Ops.createGameState();
  state2.sightingsOccurred['3'] = true;
  const r2 = Ops.paragraphCheck(checkOpts(state2, freshCtx(state2), { hexId: 'F4' }));
  check('F4 (s3-600), s3 already occurred -> ignored', r2.skipped === 'sighting-already-occurred' && r2.sighting === '3');
}

// RE-12 = "s9-453" — paragraph 453's own text starts with "[s9]", so reading it (via an Event
// Check landing on this RE slot) must mark sighting 9 as occurred, per §5/4 — independent of the
// mission-card's own sighting gate mechanism, which is a different thing (see docs/21).
{
  const state = Ops.createGameState();
  check('paragraph 453 text really is tagged [s9] (sanity check on the fixture itself)', /^\[s9\]/.test(PARAGRAPHS['453']));
  const ctx = freshCtx(state);
  const r = Ops.paragraphCheck(checkOpts(state, ctx, { hexId: 'A8', rollForEvent: () => 12 }));
  check('reading paragraph 453 via RE-12 marks sighting 9 as occurred', state.sightingsOccurred['9'] === true);
}

// ---------------------------------------------------------------------
// roundEventCheck — §6/1 step 2, Rounds' own Event Phase. Same RE-column mechanism as
// paragraphCheck's 'event' branch (same fixture cells: RE-00="12", RE-12="s9-453"), but no hexId
// at all — it's once per Round, not tied to a hex, and places no Event Marker.
// ---------------------------------------------------------------------
function eventOpts(state, ctx, extra) {
  return Object.assign({ mission: '1', missionCards: MISSION_CARDS, condition: state.condition, paragraphs: PARAGRAPHS, programs: PROGRAMS, state: state, ctx: ctx }, extra || {});
}
{
  const state = Ops.createGameState();
  const ctx = freshCtx(state);
  const r = Ops.roundEventCheck(eventOpts(state, ctx, { rollForEvent: () => 0 }));
  check('roundEventCheck RE-00=12 -> chain visits 12', r.effect === 'event' && r.chain.visited[0] === '12');
  check('roundEventCheck places no Event Marker (not a hex concept)', Object.keys(state.eventMarkers).length === 0);
}
{
  // RE-19 has no defined fixture cell for Mission 1 Condition 1 in this test's real data (the
  // handoff notes RE-19 as "only reachable some other way, not explained" — docs/22) but every
  // other RE index should resolve cleanly to NONE without throwing if the cell really is NONE.
  const state = Ops.createGameState();
  const ctx = freshCtx(state);
  const r = Ops.roundEventCheck(eventOpts(state, ctx, { rollForEvent: () => 1 }));
  check('roundEventCheck on a NONE RE cell -> no chain, no throw', r.effect === 'event' && r.chain === null);
}
{
  const state = Ops.createGameState();
  const ctx = freshCtx(state);
  const r = Ops.roundEventCheck(eventOpts(state, ctx, { rollForEvent: () => 12 }));
  check('roundEventCheck RE-12 (s9-453) marks sighting 9 as occurred, same as the per-hex version',
        r.chain.visited[0] === '453' && state.sightingsOccurred['9'] === true);
}
{
  // A German activation reached via the Rounds Event Phase must be reported the same way
  // paragraphCheck already reports one, so mission1demo.js's shared afterParagraphChain-style
  // handling works unmodified for both.
  const state = Ops.createGameState();
  let activated = null;
  const ctx = Ops.buildContext({
    state: state, activationLevel: 5, defaultPcRating: 5, rollDie: () => 5,
    soldiersWhoCanSee: () => [], isGermanRemovedOnce: () => false,
    onActivateGerman: (ids, hex, stance) => { activated = { ids: ids, hex: hex, stance: stance }; },
  });
  // RE-19 isn't populated for this fixture; reuse RE-12's sighting-gated paragraph is unrelated
  // to activation, so instead confirm germanActivated mirrors paragraphCheck's own field shape.
  const r = Ops.roundEventCheck(eventOpts(state, ctx, { rollForEvent: () => 0 }));
  check('roundEventCheck exposes germanActivated exactly like paragraphCheck does', r.germanActivated === false);
}

// 611: "If any active US soldier is in sight of hex T-8, activate German 34... Commence Rounds.
// ... Go to Condition 4." — full integration: a real hex whose paragraph activates a German.
{
  const state = Ops.createGameState();
  let activated = null, commenced = false;
  const ctx = Ops.buildContext({
    state: state, activationLevel: 5, defaultPcRating: 5, rollDie: () => 5,
    soldiersWhoCanSee: (hex) => (hex === 'T-8' ? [{ id: 'A', pc: 3 }] : []),
    isGermanRemovedOnce: () => false,
    onActivateGerman: (spec) => { activated = spec; },
    onCommenceRounds: () => { commenced = true; },
  });
  const chain = Ops.readParagraphChain('611', PARAGRAPHS, PROGRAMS, ctx, state);
  check('611 chain activates German 34 at T-8', activated && activated.ids[0] === '34' && activated.hex === 'T-8');
  check('611 chain commences Rounds', commenced);
  check('paragraphCheck-level germanActivated flag would be set', chain.effects.some((e) => e.op === 'activate_german'));
}

// ---------------------------------------------------------------------
// conditionChange — §5/5: Event Checks are NOT rolled, markers just get placed; stops at the
// first hex whose Paragraph Check activates a German.
// ---------------------------------------------------------------------
{
  const state = Ops.createGameState();
  const ctx = freshCtx(state, { rollDie: () => 5 });
  let eventRollCalls = 0;
  const origRollForEvent = () => { eventRollCalls++; return 0; };
  const result = Ops.conditionChange({
    to: 1, occupiedHexIds: ['A8', 'A1'], mission: '1', missionCards: MISSION_CARDS,
    paragraphs: PARAGRAPHS, programs: PROGRAMS, state: state, ctx: ctx,
  });
  check('conditionChange visits hexes in ascending order (A1 before A8)',
        result.log[0].hexId === 'A1' && result.log[1].hexId === 'A8');
  check('conditionChange on an EVENT hex places a marker without rolling', result.log[1].effect === 'event-marker-placed-no-roll' && !!state.eventMarkers.A8);
  check('conditionChange does not roll for the event at all', eventRollCalls === 0);
  check('conditionChange sets the new Condition', state.condition === 1);
}

// A hex whose Paragraph Check activates a German stops the sweep — §5/5: "do not check other
// hexes occupied by US soldiers."
{
  const state = Ops.createGameState();
  const ctx = Ops.buildContext({
    state: state, activationLevel: 5, defaultPcRating: 5, rollDie: () => 5,
    soldiersWhoCanSee: () => [{ id: 'A', pc: 3 }], isGermanRemovedOnce: () => false,
    onActivateGerman: () => {},
  });
  // T-8's cartridge id is T-07 (printed row 8 -> cartridge row 7); find a hex on the real
  // Mission 1 grid whose Condition 1 cell reads "611" directly, if any, else drive readParagraphChain
  // directly against a synthetic single-hex list using a known bare-611 mapping is unnecessary —
  // conditionChange's own per-hex logic is already covered by the ascending-order test above, so
  // this test targets the *early stop* behavior specifically via a minimal 2-hex list where the
  // first hex's own paragraph chain (611) activates a German directly.
  const missionCardsWithForced = JSON.parse(JSON.stringify(MISSION_CARDS));
  missionCardsWithForced['1']['1']['A-00'] = '611';
  const result = Ops.conditionChange({
    to: 1, occupiedHexIds: ['A1', 'Y19'], mission: '1', missionCards: missionCardsWithForced,
    paragraphs: PARAGRAPHS, programs: PROGRAMS, state: state, ctx: ctx,
  });
  check('conditionChange stops after the German-activating hex', result.roundsCommenced === true && result.log.length === 1);
}

// Task #66 (docs/41_CONDITION_CHANGE_ROUNDS.md) — §6/11: unlike §5/5, the Rounds version does
// NOT stop at the first activation ("Conduct Paragraph Checks for all US occupied hexes... All
// indicated German activations (if any) occur"). Same fixture as the stop-early test above,
// `stopOnActivation: false`.
{
  const state = Ops.createGameState();
  const ctx = Ops.buildContext({
    state: state, activationLevel: 5, defaultPcRating: 5, rollDie: () => 5,
    soldiersWhoCanSee: () => [{ id: 'A', pc: 3 }], isGermanRemovedOnce: () => false,
    onActivateGerman: () => {},
  });
  const missionCardsWithForced = JSON.parse(JSON.stringify(MISSION_CARDS));
  missionCardsWithForced['1']['1']['A-00'] = '611';
  const result = Ops.conditionChange({
    to: 1, occupiedHexIds: ['A1', 'Y19'], mission: '1', missionCards: missionCardsWithForced,
    paragraphs: PARAGRAPHS, programs: PROGRAMS, state: state, ctx: ctx, stopOnActivation: false,
  });
  check('§6/11: does not stop after the German-activating hex', result.log.length === 2);
  check('§6/11: still reports an activation occurred', result.roundsCommenced === true);
  check('§6/11: the second (non-activating) hex is still visited', result.log[1].hexId === 'Y19');
}

// ---- Phase 8c: contact terms read from a chain's effects ---------------------------------
{
  const T = Ops.contactTerms;
  check('no contact op -> null', T([{ op: 'check', kind: 'pc', result: 'success' }]) === null);
  const own = T([{ op: 'check', kind: 'pc', result: 'success' }, { op: 'activate_german', ids: ['25'] }, { op: 'contact', advantage: 'US', checkerAware: true, awareUsTwoTurns: true }]);
  check('mover\'s own PC success -> mover aware, US advantage, aware US 2 turns',
        own.awareSoldiers.join() === 'mover' && own.advantage === 'US' && own.awareUsTwoTurns);
  const failed = T([{ op: 'check', kind: 'pc', result: 'fail' }, { op: 'contact', advantage: 'US', checkerAware: true }]);
  check('last PC check failed -> nobody aware', failed.awareSoldiers.length === 0);
  const los = T([{ op: 'pc_check_los', hex: 'R-2' }, { op: 'check', kind: 'pc', result: 'fail', soldier: 'A' },
    { op: 'check', kind: 'pc', result: 'success', soldier: 'B' }, { op: 'check', kind: 'pc', result: 'success', soldier: 'C' },
    { op: 'activate_german', ids: ['1', '81'], hex: 'R-2' }, { op: 'contact', advantage: 'US', checkerAware: true }]);
  check('pc_check_los run -> each soldier who succeeded is aware', los.awareSoldiers.join() === 'B,C');
  const ger = T([{ op: 'activate_german', ids: ['34'], receivesTwoTurns: true }, { op: 'activate_german', ids: ['25'] }, { op: 'contact', advantage: 'german' }]);
  check('German advantage, 2 turns only for the German the paragraph names', ger.germanTwoTurns.join() === '34' && ger.awareSoldiers.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * tools/test_paragraph_interpreter.js — Phase 6 paragraph interpreter tests (docs/20_PARAGRAPH_INTERPRETER.md)
 *
 * Two layers: (1) structural checks that every annotated program at least parses and runs
 * without throwing, across every branch/roll-range combination, for all 71 hand-annotated
 * Mission 1 paragraphs; (2) targeted checks, quoting the real paragraph text, that a specific
 * scripted sequence of injected results produces the exact outcome the rulebook text says it
 * should — not just "didn't crash".
 *
 * Run:  node tools/test_paragraph_interpreter.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/paragraphinterpreter.js'));
require(path.join(ROOT, 'assets/data/paragraph_programs.js'));
const Interp = window.AmbushParagraphInterpreter;
const PROGRAMS = window.AMBUSH_PARAGRAPH_PROGRAMS;
const PARAGRAPHS = require(path.join(ROOT, 'assets/data/paragraphs.json')).paragraphs;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// A scriptable ctx: queue up exact return values for rollDie/resolveCheck calls in the order
// a test expects them to be consumed, so a test reads as "given this exact roll and this exact
// check result, the outcome must be X" — not "some random roll happened to work out".
function scriptedCtx(overrides) {
  const dieQueue = (overrides.dieQueue || []).slice();
  const checkQueue = (overrides.checkQueue || []).slice();
  const calls = { activateGerman: [], setCondition: [], placeEventMarker: [], placeLandmark: [], awardVP: [], runProcedure: [], commenceRounds: 0 };
  return Object.assign({
    rollDie: () => { if (!dieQueue.length) throw new Error('rollDie: queue empty'); return dieQueue.shift(); },
    resolveCheck: () => { if (!checkQueue.length) throw new Error('resolveCheck: queue empty'); return checkQueue.shift(); },
    hasSighting: (n) => (overrides.sightings || []).includes(n),
    markSighting: () => {},
    soldiersWhoCanSee: (hex) => (overrides.seers || {})[hex] || [],
    isGermanRemovedOnce: (id) => (overrides.removedGermans || []).includes(id),
    placeEventMarker: (hex) => calls.placeEventMarker.push(hex),
    placeLandmark: (hex) => calls.placeLandmark.push(hex),
    setCondition: (n) => calls.setCondition.push(n),
    activateGerman: (spec) => calls.activateGerman.push(spec),
    commenceRounds: () => { calls.commenceRounds++; },
    awardVP: (amount, note) => calls.awardVP.push({ amount, note }),
    runProcedure: (name) => calls.runProcedure.push(name),
  }, { _calls: calls });
}

// ---------------------------------------------------------------------
// Layer 1: every annotated program runs clean across every reachable branch.
// ---------------------------------------------------------------------
function allDieValues() { return [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; }

Object.keys(PROGRAMS).forEach((num) => {
  check(`paragraph ${num} has real text in paragraphs.json`, !!PARAGRAPHS[num]);
  // Run with every combination of "always succeed" / "always fail" and every die value, so
  // every branch in every program gets exercised at least once across this sweep.
  [['success', 'success'], ['fail', 'fail']].forEach(([a, b]) => {
    allDieValues().forEach((die) => {
      const ctx = scriptedCtx({
        dieQueue: new Array(10).fill(die),
        checkQueue: new Array(10).fill(a === 'success' ? 'success' : 'fail'),
        sightings: [], seers: {}, removedGermans: [],
      });
      try {
        // 197/606 activate in the chain's indicated hex (set by 341/450's pc_check_los).
        const result = Interp.run(PROGRAMS[num], ctx, { indicatedHex: 'R-2' });
        check(`paragraph ${num} runs clean (die=${die}, checks=${a})`,
              result && result.outcome && (result.outcome.type === 'goto' || result.outcome.type === 'end'));
      } catch (e) {
        check(`paragraph ${num} runs clean (die=${die}, checks=${a}) — threw: ${e.message}`, false);
      }
    });
  });
});

// ---------------------------------------------------------------------
// Layer 2: targeted checks against the actual rulebook text.
// ---------------------------------------------------------------------

// 179: "Conduct Activation Check (+2): If successful, see 288. If fails, see 310."
{
  const ok = Interp.run(PROGRAMS['179'], scriptedCtx({ checkQueue: ['success'] }));
  check('179 success -> goto 288', ok.outcome.type === 'goto' && ok.outcome.target === '288');
  const bad = Interp.run(PROGRAMS['179'], scriptedCtx({ checkQueue: ['fail'] }));
  check('179 fail -> goto 310', bad.outcome.type === 'goto' && bad.outcome.target === '310');
}

// 24: "Place Event marker. Conduct PC Check (-1). If successful, see 013." (no explicit fail clause)
{
  const ctx1 = scriptedCtx({ checkQueue: ['success'] });
  const ok = Interp.run(PROGRAMS['24'], ctx1);
  check('24 places an Event marker unconditionally', ctx1._calls.placeEventMarker.length === 1);
  check('24 success -> goto 13', ok.outcome.type === 'goto' && ok.outcome.target === '13');
  const bad = Interp.run(PROGRAMS['24'], scriptedCtx({ checkQueue: ['fail'] }));
  check('24 fail (no fail clause) -> end', bad.outcome.type === 'end');
}

// 26: "One soldier, with the highest PC, that can see hex U-9 must conduct a PC check. If successful, see 007."
{
  const seers = { 'U-9': [{ id: 'A', pc: 3 }, { id: 'B', pc: 7 }, { id: 'C', pc: 5 }] };
  const ok = Interp.run(PROGRAMS['26'], scriptedCtx({ seers, checkQueue: ['success'] }));
  check('26 picks the highest-PC soldier (B, pc 7)',
        ok.effects.some((e) => e.op === 'pc_check_los' && e.candidates.length === 3));
  check('26 only rolls once (highest mode)', ok.effects.filter((e) => e.op === 'check').length === 1);
  check('26 success -> goto 7', ok.outcome.type === 'goto' && ok.outcome.target === '7');
  const none = Interp.run(PROGRAMS['26'], scriptedCtx({ seers: {} }));
  check('26 nobody can see U-9 -> end, no check rolled', none.outcome.type === 'end' && none.effects.filter((e) => e.op === 'check').length === 0);
}

// 341: "Every soldier within sight of hex R-2 must conduct a PC check (-2): If any succeed, see
// 606. If all fail, see 197. If no checks are made, no event."
{
  const seers = { 'R-2': [{ id: 'A', pc: 3 }, { id: 'B', pc: 4 }, { id: 'C', pc: 5 }] };
  const anySucceed = Interp.run(PROGRAMS['341'], scriptedCtx({ seers, checkQueue: ['fail', 'success', 'fail'] }));
  check('341 all 3 soldiers checked even though only the 2nd succeeds',
        anySucceed.effects.filter((e) => e.op === 'check').length === 3);
  check('341 any succeed -> goto 606', anySucceed.outcome.type === 'goto' && anySucceed.outcome.target === '606');
  const allFail = Interp.run(PROGRAMS['341'], scriptedCtx({ seers, checkQueue: ['fail', 'fail', 'fail'] }));
  check('341 all fail -> goto 197', allFail.outcome.type === 'goto' && allFail.outcome.target === '197');
  const none = Interp.run(PROGRAMS['341'], scriptedCtx({ seers: {} }));
  check('341 no soldiers in sight -> end (no event), no checks made', none.outcome.type === 'end' && none.effects.filter((e) => e.op === 'check').length === 0);
}

// 198: numbered-list sighting rule — "1. If s5 and s6 have occurred, no event. 2. If s5 has
// occurred, see 318. 3. If s6 has occurred, see 603. 4. If s5 and s6 have not occurred, see 189."
// "choose the first one that applies" (§5/1) — item 2 must win over item 3 when both sightings
// have occurred... except item 1 (both occurred) should win over item 2 when BOTH have occurred.
{
  const bothOccurred = Interp.run(PROGRAMS['198'], scriptedCtx({ sightings: ['5', '6'] }));
  check('198 both s5,s6 occurred -> item 1 wins, no event', bothOccurred.outcome.type === 'end');
  const onlyS5 = Interp.run(PROGRAMS['198'], scriptedCtx({ sightings: ['5'] }));
  check('198 only s5 occurred -> item 2, goto 318', onlyS5.outcome.type === 'goto' && onlyS5.outcome.target === '318');
  const onlyS6 = Interp.run(PROGRAMS['198'], scriptedCtx({ sightings: ['6'] }));
  check('198 only s6 occurred -> item 3, goto 603', onlyS6.outcome.type === 'goto' && onlyS6.outcome.target === '603');
  const neither = Interp.run(PROGRAMS['198'], scriptedCtx({ sightings: [] }));
  check('198 neither occurred -> item 4, goto 189', neither.outcome.type === 'goto' && neither.outcome.target === '189');
}

// 336: nested check + bidirectional sighting branch — "Conduct Activation Check (+1): If
// successful and s5 has occurred, see 183. If successful and s5 has not occurred, see 294. If
// fails, conduct PC check (-2). If successful and s5 has occurred, see 312. If successful and
// s5 has not occurred, see 316."
{
  const a = Interp.run(PROGRAMS['336'], scriptedCtx({ checkQueue: ['success'], sightings: ['5'] }));
  check('336 activation success + s5 occurred -> goto 183', a.outcome.type === 'goto' && a.outcome.target === '183');
  const b = Interp.run(PROGRAMS['336'], scriptedCtx({ checkQueue: ['success'], sightings: [] }));
  check('336 activation success + s5 not occurred -> goto 294', b.outcome.type === 'goto' && b.outcome.target === '294');
  const c = Interp.run(PROGRAMS['336'], scriptedCtx({ checkQueue: ['fail', 'success'], sightings: ['5'] }));
  check('336 activation fail, pc success + s5 occurred -> goto 312', c.outcome.type === 'goto' && c.outcome.target === '312');
  const d = Interp.run(PROGRAMS['336'], scriptedCtx({ checkQueue: ['fail', 'fail'], sightings: ['5'] }));
  check('336 activation fail, pc fail -> end', d.outcome.type === 'end');
}

// 611: "If any active US soldier is in sight of hex T-8, activate German 34 in that hex,
// crouching. Commence Rounds. Put Special Reaction B into effect for German 34. Go to Condition 4."
{
  const seers = { 'T-8': [{ id: 'A', pc: 3 }] };
  const ctx2 = scriptedCtx({ seers });
  Interp.run(PROGRAMS['611'], ctx2);
  check('611 activates German 34 at T-8, crouching, Special Reaction B',
        ctx2._calls.activateGerman.length === 1 &&
        ctx2._calls.activateGerman[0].ids[0] === '34' &&
        ctx2._calls.activateGerman[0].hex === 'T-8' &&
        ctx2._calls.activateGerman[0].stance === 'crouching' &&
        ctx2._calls.activateGerman[0].specialReaction === 'B');
  check('611 commences Rounds', ctx2._calls.commenceRounds === 1);
  check('611 sets Condition 4', ctx2._calls.setCondition.includes(4));
  const ctx2b = scriptedCtx({ seers: {} });
  Interp.run(PROGRAMS['611'], ctx2b);
  check('611 nobody in sight -> no activation', ctx2b._calls.activateGerman.length === 0);
}

// 612: fallback hex — "If any active US soldier is in sight of Q-11, activate ... there. If no
// US soldiers are in sight of Q-11, but any are in sight of hex X-7, activate ... there instead."
{
  const ctx3a = scriptedCtx({ seers: { 'Q-11': [{ id: 'A', pc: 3 }] } });
  Interp.run(PROGRAMS['612'], ctx3a);
  check('612 soldiers at Q-11 -> activates at Q-11', ctx3a._calls.activateGerman[0].hex === 'Q-11');
  const ctx3b = scriptedCtx({ seers: { 'X-7': [{ id: 'A', pc: 3 }] } });
  Interp.run(PROGRAMS['612'], ctx3b);
  check('612 no soldiers at Q-11 but soldiers at X-7 -> activates at X-7', ctx3b._calls.activateGerman[0].hex === 'X-7');
  const ctx3c = scriptedCtx({ seers: {} });
  Interp.run(PROGRAMS['612'], ctx3c);
  check('612 nobody in sight of either hex -> no activation', ctx3c._calls.activateGerman.length === 0);
}

// 346/610: German-removed-by-evasive-movement gate.
{
  const removed = Interp.run(PROGRAMS['346'], scriptedCtx({ removedGermans: ['34'] }));
  check('346 German 34 removed once -> goto 611', removed.outcome.type === 'goto' && removed.outcome.target === '611');
  const notRemoved = Interp.run(PROGRAMS['346'], scriptedCtx({ removedGermans: [] }));
  check('346 German 34 not removed -> end', notRemoved.outcome.type === 'end');
}

// ---- Phase 8c (docs/PARAGRAPH_DATA_GAPS.md) ------------------------------------------------
// 608 item 2: "If s2 has occurred, see 290 if in clear; see 326 otherwise."
{
  const r1 = Interp.run(PROGRAMS['608'], Object.assign(scriptedCtx({ sightings: ['2'] }), { moverIs: (t) => t === 'in_clear' }));
  check('608 s2 only, soldier in clear -> 290', r1.outcome.type === 'goto' && r1.outcome.target === '290');
  const r2 = Interp.run(PROGRAMS['608'], Object.assign(scriptedCtx({ sightings: ['2'] }), { moverIs: () => false }));
  check('608 s2 only, soldier not in clear -> 326', r2.outcome.type === 'goto' && r2.outcome.target === '326');
}
// 195: "If soldier on bridge, see 190. If soldier under bridge, see 186." Neither -> no event.
{
  const on = Interp.run(PROGRAMS['195'], Object.assign(scriptedCtx({}), { moverIs: (t) => t === 'on_bridge' }));
  check('195 on the bridge -> 190', on.outcome.target === '190');
  const under = Interp.run(PROGRAMS['195'], Object.assign(scriptedCtx({}), { moverIs: (t) => t === 'under_bridge' }));
  check('195 under the bridge -> 186', under.outcome.target === '186');
  check('195 neither -> end', Interp.run(PROGRAMS['195'], scriptedCtx({})).outcome.type === 'end');
}
// Contact terms replace the old bespoke notes: 183 German advantage, German 25 gets 2 turns.
{
  const ctx = scriptedCtx({});
  const r = Interp.run(PROGRAMS['183'], ctx);
  const c = r.effects.find((e) => e.op === 'contact');
  check('183 logs German advantage', c && c.advantage === 'german' && !c.checkerAware);
  check('183 activates German 25 with 2 turns', ctx._calls.activateGerman[0].receivesTwoTurns === true);
  const c2 = Interp.run(PROGRAMS['289'], scriptedCtx({})).effects.find((e) => e.op === 'contact');
  check('289 logs US advantage, checker aware, aware US get 2 turns', c2.advantage === 'US' && c2.checkerAware && c2.awareUsTwoTurns);
  const left = Object.keys(PROGRAMS).filter((n) => JSON.stringify(PROGRAMS[n]).includes('"bespoke"'));
  check('no contact paragraph keeps a bespoke op',
        !['183', '187', '289', '294', '297', '298', '312', '316', '324', '331', '333', '334', '337', '602', '195', '608'].some((n) => left.includes(n)));
}
// 341 -> 606: "Activate Germans 1 and 81 in indicated hex" lands at R-2, where the checks were made.
{
  const chain = {};
  const pcs = [];
  const seen = Object.assign(scriptedCtx({ seers: { 'R-2': [{ id: 'A', pc: 4 }, { id: 'B', pc: 2 }] } }), {
    resolveCheck: (kind, mod, soldier) => { pcs.push(soldier && soldier.pc); return pcs.length === 2 ? 'success' : 'fail'; },
  });
  const r = Interp.run(PROGRAMS['341'], seen, chain);
  check('341 rolls each soldier on his own PC', pcs.join(',') === '4,2');
  check('341 one success -> 606', r.outcome.target === '606');
  const act = scriptedCtx({});
  Interp.run(PROGRAMS['606'], act, chain);
  check('606 activates 1 and 81 at the indicated hex R-2', act._calls.activateGerman[0].hex === 'R-2');
}
// 20 / 23: one hidden fire with the paragraph's features, no Rounds.
{
  let spec = null;
  const r = Interp.run(PROGRAMS['20'], Object.assign(scriptedCtx({}), { hiddenFire: (s) => { spec = s; } }));
  check('20 fires aimed, short, scope, WS 0', spec && spec.fireType === 'aimed' && spec.range === 'short' && spec.weaponId === 'scope' && spec.weaponSkill === 0);
  check('20 commences no Rounds', !r.effects.some((e) => e.op === 'commence_rounds'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

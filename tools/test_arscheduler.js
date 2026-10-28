#!/usr/bin/env node
/*
 * tools/test_arscheduler.js — Phase 8 Action Round scheduler tests (docs/23_ACTION_ROUND_SCHEDULER.md)
 *
 * Run:  node tools/test_arscheduler.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/hexgrid.js'));
require(path.join(ROOT, 'apps/game/arrules.js'));
require(path.join(ROOT, 'apps/game/arscheduler.js'));
require(path.join(ROOT, 'assets/data/ar_track.js'));
const Sched = window.AmbushARScheduler;
const AR_TRACK = window.AMBUSH_AR_TRACK;
const ROSTER = require(path.join(ROOT, 'assets/data/german_roster.json')).soldiers;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}
function throws(fn) {
  try { fn(); return false; } catch (e) { return true; }
}

// Builds a minimal track by hand for tests that need precise slot control (giving turns,
// tie-breaks) — placeMarkers is exercised separately below, on its own.
function bareTrack(advantageSide) {
  return {
    round: 1, advantageSide: advantageSide, cursorIndex: 0,
    slots: { '2adv': [], '2disadv': [], '1adv': [], '1disadv': [], panic: [], complete: [], unaware: [] },
    soldiers: {},
  };
}
function put(track, entry, slot) {
  track.soldiers[entry.id] = Object.assign({ wasTwoTurn: false, actionsDone: 0, wounded: false, isCommander: false, letter: null }, entry, { slot: slot });
  track.slots[slot].push(entry.id);
}

// ---------------------------------------------------------------------
// placeMarkers — real AR_TRACK data, including red and wounded-cap cases.
// ---------------------------------------------------------------------
{
  // AR_TRACK[3]: twoTurn:[1,2,7,9], twoTurnRed:[7,9], oneTurn:[0,3,4,5,6,8], oneTurnRed:[6], panic:[]
  const rolls = { A: 1, B: 7 }; // A: plain 2-Turn. B: red 2-Turn.
  const roster = [
    { id: 'A', side: 'US', IN: 3, isActive: true, hexId: 'A1' },
    { id: 'B', side: 'US', IN: 3, isActive: true, hexId: 'Z1' }, // far from A1 — not in command
  ];
  const track = Sched.placeMarkers({
    round: 1, advantageSide: 'US', arTrack: AR_TRACK, roster: roster,
    rollDie: (e) => rolls[e.id],
  });
  check('placeMarkers: IN3 roll1 (plain 2-Turn), advantage side -> 2adv, 2 turns',
        track.soldiers.A.slot === '2adv' && track.soldiers.A.wasTwoTurn);
  check('placeMarkers: IN3 roll7 (red 2-Turn), out of command -> panics (matches AR_DRILL ar2)',
        track.soldiers.B.slot === 'panic');
}
{
  // Same red-2-Turn roll, but in command this time (matches AR_DRILL ar1) — co-located US
  // soldiers' own IN sums to >=5 (3+3=6).
  const roster = [
    { id: 'A', side: 'US', IN: 3, isActive: true, hexId: 'A1' },
    { id: 'B', side: 'US', IN: 3, isActive: true, hexId: 'A1' },
  ];
  const track = Sched.placeMarkers({ round: 1, advantageSide: 'US', arTrack: AR_TRACK, roster: roster, rollDie: () => 7 });
  check('placeMarkers: red 2-Turn, in command -> still 2 turns (matches AR_DRILL ar1)', track.soldiers.A.slot === '2adv' && track.soldiers.A.wasTwoTurn);
}
{
  // Wounded soldier capped to 1 turn even on a plain (non-red) 2-Turn roll (§6/1 exception).
  const roster = [{ id: 'A', side: 'US', IN: 3, wounded: true, isActive: true, hexId: 'A1' }];
  const track = Sched.placeMarkers({ round: 1, advantageSide: 'US', arTrack: AR_TRACK, roster: roster, rollDie: () => 1 });
  check('placeMarkers: wounded on a 2-Turn roll -> capped to 1adv, not 2adv', track.soldiers.A.slot === '1adv' && !track.soldiers.A.wasTwoTurn);
}
{
  // Red has no effect on German markers (§6/3) — same red-2-Turn roll (7), German side, no
  // command computed at all, always resolves to the plain 2-Turn outcome.
  const roster = [{ id: 'G', side: 'german', IN: 3, isActive: true, hexId: 'M1', letter: 'V' }];
  const track = Sched.placeMarkers({ round: 1, advantageSide: 'german', arTrack: AR_TRACK, roster: roster, rollDie: () => 7 });
  check('placeMarkers: red roll has no effect on a German soldier -> still 2 turns, no panic', track.soldiers.G.slot === '2adv' && track.soldiers.G.wasTwoTurn);
}
{
  // Disadvantage-side placement: German side while US has the advantage -> lands in the
  // disadvantage half.
  const roster = [{ id: 'G', side: 'german', IN: 5, isActive: true, hexId: 'M1', letter: 'V' }]; // IN5 oneTurn includes 2
  const track = Sched.placeMarkers({ round: 1, advantageSide: 'US', arTrack: AR_TRACK, roster: roster, rollDie: () => 2 });
  check('placeMarkers: German on the disadvantage side -> 1disadv, not 1adv', track.soldiers.G.slot === '1disadv');
}
{
  // Panic space roll (IN 1, roll 1) lands directly in panic regardless of side/command.
  const roster = [{ id: 'A', side: 'US', IN: 1, isActive: true, hexId: 'A1' }];
  const track = Sched.placeMarkers({ round: 1, advantageSide: 'US', arTrack: AR_TRACK, roster: roster, rollDie: () => 1 });
  check('placeMarkers: IN1 roll1 lands in Panic outright', track.soldiers.A.slot === 'panic');
}
{
  // Inactive roster entries are skipped entirely — not in the track at all.
  const roster = [
    { id: 'A', side: 'US', IN: 3, isActive: true, hexId: 'A1' },
    { id: 'X', side: 'US', IN: 3, isActive: false, hexId: 'A1' },
  ];
  const track = Sched.placeMarkers({ round: 1, advantageSide: 'US', arTrack: AR_TRACK, roster: roster, rollDie: () => 1 });
  check('placeMarkers: inactive soldier is not placed on the track at all', track.soldiers.X === undefined);
}

// ---------------------------------------------------------------------
// letterFromGermanCardId
// ---------------------------------------------------------------------
check("letterFromGermanCardId('GE 33/V') -> 'V'", Sched.letterFromGermanCardId(ROSTER['GE 33/V']['Card ID']) === 'V');
check("letterFromGermanCardId('GE 19') -> null (table-less group card, no AR marker)", Sched.letterFromGermanCardId(ROSTER['GE 19']['Card ID']) === null);

// ---------------------------------------------------------------------
// The 2-Turn demotion-and-reacts-later mechanic, end to end.
// ---------------------------------------------------------------------
{
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 3, wasTwoTurn: true, hexId: 'A1' }, '2adv');
  put(track, { id: 'B', side: 'US', IN: 5, hexId: 'A1' }, '1adv'); // native 1-Turn, already present

  const step1 = Sched.nextActor(track);
  check('demotion: A (only 2adv occupant) acts first', !step1.done && step1.soldierId === 'A' && step1.slot === '2adv');
  const r1 = Sched.completeAction(track, 'A');
  check('demotion: A\'s first action demotes him into 1adv (matching advantage half)', r1.movedTo === '1adv');
  check('demotion: 2adv is now empty', track.slots['2adv'].length === 0);

  const step2 = Sched.nextActor(track);
  check('demotion: B (already in 1adv before A arrived) acts before A', !step2.done && step2.soldierId === 'B' && step2.slot === '1adv');
  const r2 = Sched.completeAction(track, 'B');
  check('demotion: B (native 1-Turn) completes to "complete" on his only action', r2.movedTo === 'complete');

  const step3 = Sched.nextActor(track);
  check('demotion: A is offered again, later in the SAME pass, in 1adv', !step3.done && step3.soldierId === 'A' && step3.slot === '1adv');
  const r3 = Sched.completeAction(track, 'A');
  check('demotion: A\'s SECOND action completes him (no further demotion)', r3.movedTo === 'complete');

  check('demotion: Round is now complete', Sched.isRoundComplete(track));
  check('demotion: nextActor is done and stays done (idempotent)', Sched.nextActor(track).done && Sched.nextActor(track).done);
}

// ---------------------------------------------------------------------
// US tie-break: arbitrary by default, overridable via opts.chooseUS.
// ---------------------------------------------------------------------
{
  const track = bareTrack('US');
  put(track, { id: 'C', side: 'US', IN: 5, hexId: 'A1' }, '1adv');
  put(track, { id: 'D', side: 'US', IN: 5, hexId: 'A1' }, '1adv');
  check('US tie-break: default is insertion order (C first)', Sched.nextActor(track).soldierId === 'C');
  check('US tie-break: opts.chooseUS overrides the default',
        Sched.nextActor(track, { chooseUS: (ids) => ids[1] }).soldierId === 'D');
}

// ---------------------------------------------------------------------
// German tie-break: alphabetical by AR-marker letter, not overridable, engine-enforced.
// ---------------------------------------------------------------------
{
  const track = bareTrack('german');
  // Inserted deliberately out of alphabetical order to prove sorting isn't a coincidence of
  // insertion order.
  put(track, { id: 'g-V', side: 'german', IN: 3, letter: 'V', hexId: 'M1' }, '1adv');
  put(track, { id: 'g-P', side: 'german', IN: 3, letter: 'P', hexId: 'M1' }, '1adv');
  put(track, { id: 'g-X', side: 'german', IN: 3, letter: 'X', hexId: 'M1' }, '1adv');

  check('German tie-break: P (alphabetically first) acts regardless of insertion order', Sched.nextActor(track).soldierId === 'g-P');
  check('German tie-break: occupantsOf reports the same letter-sorted order',
        JSON.stringify(Sched.occupantsOf(track, '1adv')) === JSON.stringify(['g-P', 'g-V', 'g-X']));
  check('German tie-break: completeAction throws if called out of alphabetical order', throws(() => Sched.completeAction(track, 'g-V')));
  Sched.completeAction(track, 'g-P'); // correct order — should not throw
  check('German tie-break: X still cannot act before V once P is done', throws(() => Sched.completeAction(track, 'g-X')));
}

// ---------------------------------------------------------------------
// Giving turns (§6/3, §6/7)
// ---------------------------------------------------------------------
{
  // Complete -> 1-Turn promotion.
  const track = bareTrack('US');
  put(track, { id: 'Cmdr', side: 'US', IN: 4, isCommander: true, hexId: 'A1' }, '1adv');
  put(track, { id: 'Recruit', side: 'US', IN: 2, hexId: 'A1' }, 'complete');

  const check1 = Sched.canGiveTurn(track, 'Cmdr', 'Recruit');
  check('giveTurn: Complete -> 1-Turn is eligible', check1.ok && check1.targetSlot === '1adv');
  const result = Sched.giveTurn(track, 'Cmdr', 'Recruit');
  check('giveTurn: recipient promoted into 1adv', result.ok && track.soldiers.Recruit.slot === '1adv');
  check('giveTurn: giver (native 1-Turn) moved to complete, as if he had acted', result.giver.movedTo === 'complete');
  check('giveTurn: recipient no longer in the complete bucket', track.slots.complete.indexOf('Recruit') === -1);
}
{
  // 1-Turn -> 2-Turn promotion, from a giver acting during the 2-Turn-advantage slot (the only
  // point at which promoting into 2adv doesn't hit "slot-already-passed").
  const track = bareTrack('US');
  put(track, { id: 'Cmdr', side: 'US', IN: 3, wasTwoTurn: true, isCommander: true, hexId: 'A1' }, '2adv');
  put(track, { id: 'Fr', side: 'US', IN: 5, hexId: 'A1' }, '1adv');

  const result = Sched.giveTurn(track, 'Cmdr', 'Fr');
  check('giveTurn: 1-Turn -> 2-Turn promotion succeeds while giver still in 2adv', result.ok && track.soldiers.Fr.slot === '2adv');
  check('giveTurn: giver (was 2-Turn, first action) demotes to 1adv rather than completing', result.giver.movedTo === '1adv');
}
{
  // Ineligibility cases, none of which mutate state.
  const track = bareTrack('US');
  put(track, { id: 'NotCmdr', side: 'US', IN: 3, isCommander: false, hexId: 'A1' }, '1adv');
  put(track, { id: 'Enemy', side: 'german', IN: 3, letter: 'V', hexId: 'A1' }, '1adv');
  put(track, { id: 'Cmdr', side: 'US', IN: 4, isCommander: true, hexId: 'A1' }, '2adv');
  put(track, { id: 'FarAway', side: 'US', IN: 2, hexId: 'Y19' }, '1adv');
  put(track, { id: 'Wounded', side: 'US', IN: 2, wounded: true, hexId: 'A1' }, '1adv');

  check('giveTurn: giver must be a commander', Sched.canGiveTurn(track, 'NotCmdr', 'Wounded').ok === false && Sched.canGiveTurn(track, 'NotCmdr', 'Wounded').reason === 'giver-not-commander');
  check('giveTurn: recipient on the enemy side is not friendly', Sched.canGiveTurn(track, 'Cmdr', 'Enemy').reason === 'recipient-not-friendly');
  check('giveTurn: recipient out of Command Radius', Sched.canGiveTurn(track, 'Cmdr', 'FarAway').reason === 'recipient-out-of-radius');
  check('giveTurn: wounded recipient is never eligible', Sched.canGiveTurn(track, 'Cmdr', 'Wounded').reason === 'recipient-not-eligible');

  const before = JSON.stringify(track);
  const r = Sched.giveTurn(track, 'Cmdr', 'Wounded');
  check('giveTurn: an ineligible attempt makes no state change at all', JSON.stringify(track) === before && r.ok === false);
}
{
  // The already-passed edge case: commander acting from 1adv (2adv/2disadv both already
  // exhausted) cannot promote a friendly up into 2adv — that window has closed this Round.
  const track = bareTrack('US');
  track.cursorIndex = 2; // simulate 2adv/2disadv already walked through and emptied
  put(track, { id: 'Cmdr', side: 'US', IN: 4, isCommander: true, hexId: 'A1' }, '1adv');
  put(track, { id: 'Fr', side: 'US', IN: 5, hexId: 'A1' }, '1adv');

  const before = JSON.stringify(track);
  const check1 = Sched.canGiveTurn(track, 'Cmdr', 'Fr');
  check('giveTurn: promoting into an already-passed 2-Turn slot is rejected', !check1.ok && check1.reason === 'slot-already-passed');
  const result = Sched.giveTurn(track, 'Cmdr', 'Fr');
  check('giveTurn: the rejected attempt is a true no-op — no state change at all', JSON.stringify(track) === before && result.ok === false);
}

// ---------------------------------------------------------------------
// applyWoundedStatus / removeFromRound (§13/2-13/4) — added for Phase 9's fire combat
// (docs/25_MECHANIC_TEST.md), since Phase 8 never modeled combat damage touching the track.
// ---------------------------------------------------------------------
{
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 3, hexId: 'A1' }, '2adv');
  const r = Sched.applyWoundedStatus(track, 'A');
  check('applyWoundedStatus: moves the soldier out of 2adv into Complete', r.movedTo === 'complete' && track.slots['2adv'].length === 0 && track.slots.complete.indexOf('A') !== -1);
  check('applyWoundedStatus: marks the soldier wounded on the track', track.soldiers.A.wounded === true);
}
{
  // A wound landing on a soldier already in Panic still moves him to Complete (§13/2 is
  // unconditional on prior slot, and a wound is more specific than a Panic placement).
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 0, hexId: 'A1' }, 'panic');
  const r = Sched.applyWoundedStatus(track, 'A');
  check('applyWoundedStatus: moves a panicked soldier to Complete too', r.movedTo === 'complete' && track.slots.panic.length === 0);
}
{
  // Already-Complete (already acted this Round): wounded flag still records, no duplicate entry.
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 3, hexId: 'A1' }, 'complete');
  const r = Sched.applyWoundedStatus(track, 'A');
  check('applyWoundedStatus: no-ops the slot move when already Complete', r.movedTo === 'complete' && track.slots.complete.length === 1);
}
{
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 3, hexId: 'A1' }, '1adv');
  const r = Sched.applyPanicStatus(track, 'A');
  check('applyPanicStatus: moves the soldier out of 1adv into Panic', r.movedTo === 'panic' && track.slots['1adv'].length === 0 && track.slots.panic.indexOf('A') !== -1);
  check('applyPanicStatus: does not set the wounded flag', track.soldiers.A.wounded === false);
}
{
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 3, hexId: 'A1' }, 'complete');
  const r = Sched.applyPanicStatus(track, 'A');
  check('applyPanicStatus: no-ops when already Complete (no turns left to lose)', r.movedTo === 'complete' && track.slots.complete.length === 1);
}
{
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 3, hexId: 'A1' }, '1adv');
  const r = Sched.removeFromRound(track, 'A');
  check('removeFromRound: moves the soldier into a new Inactive bucket', r.movedTo === 'inactive' && track.slots.inactive.indexOf('A') !== -1 && track.slots['1adv'].length === 0);
  const r2 = Sched.removeFromRound(track, 'A');
  check('removeFromRound: idempotent if already inactive (no duplicate entry)', track.slots.inactive.length === 1 && r2.movedTo === 'inactive');
}
{
  const track = bareTrack('US');
  check('applyWoundedStatus throws for an unknown soldier', throws(() => Sched.applyWoundedStatus(track, 'Ghost')));
  check('removeFromRound throws for an unknown soldier', throws(() => Sched.removeFromRound(track, 'Ghost')));
}

// ---------------------------------------------------------------------
// §6/5 US Awareness — placeMarkers' `placement` bypass and applyBecomesAware
// ---------------------------------------------------------------------
{
  // A roster entry with `placement` set never calls rollDie and lands exactly in that slot,
  // regardless of what a roll would have produced.
  const roster = [
    { id: 'A', side: 'US', IN: 3, isActive: true, hexId: 'A1', placement: 'unaware' },
    { id: 'B', side: 'US', IN: 3, isActive: true, hexId: 'A1', placement: 'complete' },
    { id: 'C', side: 'US', IN: 1, isActive: true, hexId: 'A1' }, // normal roll-based placement
  ];
  let rollDieCalls = 0;
  const track = Sched.placeMarkers({
    round: 1, advantageSide: 'US', arTrack: AR_TRACK, roster: roster,
    rollDie: (e) => { rollDieCalls++; return 1; },
  });
  check('placeMarkers: an unaware entry lands in the unaware slot', track.soldiers.A.slot === 'unaware' && track.slots.unaware.indexOf('A') !== -1);
  check('placeMarkers: a just-became-aware entry lands straight in Complete, not a real turn slot',
    track.soldiers.B.slot === 'complete' && track.slots.complete.indexOf('B') !== -1);
  check('placeMarkers: rollDie is never called for a `placement` entry', rollDieCalls === 1); // only C rolled
  check('placeMarkers: a normal entry still rolls normally', track.soldiers.C.slot !== 'unaware' && track.soldiers.C.slot !== undefined);

  check('the unaware slot is not in SLOT_ORDER — nextActor/isRoundComplete never offer it a turn',
    Sched.SLOT_ORDER.indexOf('unaware') === -1);
  // With every other soldier already Complete, the Round should read as complete even though
  // an unaware soldier's marker still sits on the track — he simply never gets a turn.
  check('isRoundComplete ignores unaware soldiers entirely', Sched.isRoundComplete(track) === true);
}
{
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 2, hexId: 'A1' }, 'unaware');
  const r = Sched.applyBecomesAware(track, 'A');
  check('applyBecomesAware: moves the soldier out of unaware into Complete (not a fresh turn)',
    r.movedTo === 'complete' && track.slots.unaware.length === 0 && track.slots.complete.indexOf('A') !== -1);
}
{
  // §6/5: "unless he is killed or incapacitated" — already-inactive stays inactive, doesn't
  // resurrect into Complete.
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 2, hexId: 'A1' }, 'unaware');
  track.slots.inactive = ['A'];
  track.soldiers.A.slot = 'inactive';
  const r = Sched.applyBecomesAware(track, 'A');
  check('applyBecomesAware: no-ops an already-inactive (killed/incapacitated) soldier', r.movedTo === 'inactive');
}
{
  const track = bareTrack('US');
  check('applyBecomesAware throws for an unknown soldier', throws(() => Sched.applyBecomesAware(track, 'Ghost')));
}

// ---------------------------------------------------------------------
// insertMidRoundGerman (§6/6 German Activation During Rounds, task 71)
// ---------------------------------------------------------------------
{
  // Plain roll-based insertion, cursor still genuinely sitting on 2adv (a soldier is currently
  // there, mid-action — the realistic mid-Round case: the triggering mover hasn't completed his
  // own action yet, so the cursor hasn't advanced past his slot) -> joins the round for real.
  const track = bareTrack('german');
  put(track, { id: 'A', side: 'german', IN: 3, letter: 'A', hexId: 'A1' }, '2adv'); // cursor sits at index 0
  // AR_TRACK[3]: IN3 roll1 -> plain 2-Turn.
  const r = Sched.insertMidRoundGerman(track, { id: 'G', IN: 3, hexId: 'M1', letter: 'V' }, { rollDie: () => 1, arTrack: AR_TRACK });
  check('insertMidRoundGerman: plain 2-Turn roll, cursor still at 2adv -> inserted into 2adv',
    r.inserted && r.slot === '2adv' && track.soldiers.G.slot === '2adv' && track.slots['2adv'].indexOf('G') !== -1);
  check('insertMidRoundGerman: uses the track\'s OWN advantageSide (german here), not a fresh roll for it',
    track.soldiers.G.wasTwoTurn === true);
}
{
  // Slot already passed by the cursor -> parked in Complete, not inserted.
  const track = bareTrack('US');
  track.cursorIndex = 3; // simulate everything through 1adv already walked; only 1disadv remains
  put(track, { id: 'A', side: 'US', IN: 3, hexId: 'A1' }, '1disadv');
  // AR_TRACK[3]: IN3 roll1 -> plain 2-Turn -> targetSlot '2disadv' (german is disadvantage side here), already passed.
  const r = Sched.insertMidRoundGerman(track, { id: 'G', IN: 3, hexId: 'M1', letter: 'V' }, { rollDie: () => 1, arTrack: AR_TRACK });
  check('insertMidRoundGerman: rolled slot already passed by cursor -> not inserted, parked in Complete',
    !r.inserted && r.slot === 'complete' && track.soldiers.G.slot === 'complete' && track.slots.complete.indexOf('G') !== -1);
  check('insertMidRoundGerman: a not-inserted soldier is not flagged wasTwoTurn (no extra demotion turn)',
    track.soldiers.G.wasTwoTurn === false);
}
{
  // Panic roll -> always inserted directly into Panic, regardless of cursor position.
  const track = bareTrack('US');
  track.cursorIndex = 3;
  put(track, { id: 'A', side: 'US', IN: 3, hexId: 'A1' }, '1disadv');
  // AR_TRACK[1]: IN1 roll1 -> Panic outright.
  const r = Sched.insertMidRoundGerman(track, { id: 'G', IN: 1, hexId: 'M1', letter: 'V' }, { rollDie: () => 1, arTrack: AR_TRACK });
  check('insertMidRoundGerman: a Panic roll always inserts into Panic, cursor position irrelevant',
    r.inserted && r.slot === 'panic' && track.slots.panic.indexOf('G') !== -1);
}
{
  // Red has no effect on a mid-Round German either (§6/3), matching placeMarkers's German branch.
  const track = bareTrack('german');
  put(track, { id: 'A', side: 'german', IN: 3, letter: 'A', hexId: 'A1' }, '2adv'); // cursor sits at index 0
  // AR_TRACK[3]: IN3 roll7 -> red 2-Turn; Germans ignore isRed entirely.
  const r = Sched.insertMidRoundGerman(track, { id: 'G', IN: 3, hexId: 'M1', letter: 'V' }, { rollDie: () => 7, arTrack: AR_TRACK });
  check('insertMidRoundGerman: red roll has no effect on a German -> still a full 2-Turn insertion',
    r.inserted && r.slot === '2adv' && track.soldiers.G.wasTwoTurn === true);
}
{
  // receivesTwoTurns: true bypasses the roll entirely and goes straight to the 2-Turn slot.
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 3, hexId: 'A1' }, '2disadv'); // cursor sits at index 1
  let rollCalled = false;
  const r = Sched.insertMidRoundGerman(track, { id: 'G', IN: 3, hexId: 'M1', letter: 'V', receivesTwoTurns: true },
    { rollDie: () => { rollCalled = true; return 0; }, arTrack: AR_TRACK });
  check('insertMidRoundGerman: receivesTwoTurns never calls rollDie', rollCalled === false);
  check('insertMidRoundGerman: receivesTwoTurns places directly in the disadvantage-side 2-Turn slot',
    r.inserted && r.slot === '2disadv' && track.soldiers.G.wasTwoTurn === true);
}
{
  // Newly inserted German is immediately eligible to act via the normal nextActor/completeAction
  // machinery — no special-casing needed downstream. 'Mover' (letter A, alphabetically first)
  // is who holds the cursor at 2adv; once he completes, G (letter V, inserted mid-Round) is
  // next up in that same slot, exactly like any round-start 2adv occupant.
  const track = bareTrack('german');
  put(track, { id: 'Mover', side: 'german', IN: 3, letter: 'A', hexId: 'A1' }, '2adv');
  Sched.insertMidRoundGerman(track, { id: 'G', IN: 3, hexId: 'M1', letter: 'V' }, { rollDie: () => 1, arTrack: AR_TRACK });
  Sched.completeAction(track, 'Mover');
  const step = Sched.nextActor(track);
  check('insertMidRoundGerman: the newly-inserted German is offered a turn like any other 2adv occupant',
    !step.done && step.soldierId === 'G' && step.slot === '2adv');
  const r = Sched.completeAction(track, 'G');
  check('insertMidRoundGerman: completing his action demotes him into 1adv exactly like a round-start 2-Turn soldier', r.movedTo === '1adv');
}
{
  const track = bareTrack('US');
  put(track, { id: 'G', side: 'german', IN: 3, letter: 'V', hexId: 'M1' }, '1adv');
  check('insertMidRoundGerman throws if the id is already on the track',
    throws(() => Sched.insertMidRoundGerman(track, { id: 'G', IN: 3, hexId: 'M1', letter: 'V' }, { rollDie: () => 1, arTrack: AR_TRACK })));
}

// ---------------------------------------------------------------------
// Structural-violation throws
// ---------------------------------------------------------------------
{
  const track = bareTrack('US');
  put(track, { id: 'A', side: 'US', IN: 3, hexId: 'A1' }, '2adv');
  put(track, { id: 'B', side: 'US', IN: 3, hexId: 'A1' }, '1adv');
  check('completeAction throws for a soldier not in the current slot at all', throws(() => Sched.completeAction(track, 'B')));
  check('giveTurn throws if giverId is not the current legal actor', throws(() => Sched.giveTurn(track, 'B', 'A')));
}

// Phase 8c: a contact paragraph's "receives 2 turns this Round" skips the roll (§6/1).
{
  let rolls = 0;
  const roster = [
    { id: 'us1', side: 'US', IN: 3, isActive: true, hexId: 'A1', receivesTwoTurns: true },
    { id: 'us2', side: 'US', IN: 3, isActive: true, hexId: 'A1', wounded: true, receivesTwoTurns: true },
    { id: 'g34', side: 'german', IN: 3, isActive: true, hexId: 'M5', letter: 'S', receivesTwoTurns: true },
  ];
  const track = Sched.placeMarkers({ round: 1, advantageSide: 'german', arTrack: AR_TRACK, roster: roster, rollDie: () => { rolls++; return 0; } });
  check('2-turn entries roll nothing', rolls === 0);
  check('German with advantage and 2 turns -> 2adv', track.soldiers.g34.slot === '2adv' && track.soldiers.g34.wasTwoTurn);
  check('US without advantage, 2 turns -> 2disadv', track.soldiers.us1.slot === '2disadv');
  check('wounded US gets one turn only -> 1disadv', track.soldiers.us2.slot === '1disadv' && !track.soldiers.us2.wasTwoTurn);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

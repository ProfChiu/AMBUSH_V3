#!/usr/bin/env node
/*
 * tools/test_action_round.js — Phase 8 Action Round rules tests (docs/22_ACTION_ROUND.md)
 *
 * Run:  node tools/test_action_round.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/hexgrid.js'));
require(path.join(ROOT, 'apps/game/arrules.js'));
require(path.join(ROOT, 'assets/data/ar_track.js'));
const AR = window.AmbushActionRound;
const AR_TRACK = window.AMBUSH_AR_TRACK;
const ROSTER = require(path.join(ROOT, 'assets/data/german_roster.json')).soldiers;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// ---------------------------------------------------------------------
// Command (§6/3) — reconstructed from the rulebook's own "Commander Functions" worked
// example: commander A (IN 3, alone); D (IN 1) and E (IN 2) share a hex within A's Command
// Radius ("D and E... combine their IN's for a total of 6" — matches only if they're
// co-located, since D+E+A = 1+2+3 = 6 exactly); C (IN 2) alone in a different hex within A's
// radius ("combined with A's for a total of 5" — matches C+A = 2+3 = 5); B (IN 1) alone, three
// hexes from A, outside the radius ("out of command... his IN is less than 5").
// ---------------------------------------------------------------------
{
  const roster = [
    { id: 'A', hexId: 'A1', IN: 3, isCommander: true, isActive: true },
    { id: 'D', hexId: 'B1', IN: 1, isCommander: false, isActive: true },
    { id: 'E', hexId: 'B1', IN: 2, isCommander: false, isActive: true },
    { id: 'C', hexId: 'C1', IN: 2, isCommander: false, isActive: true },
    { id: 'B', hexId: 'E1', IN: 1, isCommander: false, isActive: true }, // 4 columns over — outside A's 2-hex radius
  ];
  function others(id) { return roster.filter((s) => s.id !== id); }

  check("A's radius reaches B1 and C1 but not E1 (fixture sanity check)",
        AR.commandRadiusHexIds('A1').includes('B1') &&
        AR.commandRadiusHexIds('A1').includes('C1') &&
        !AR.commandRadiusHexIds('A1').includes('E1'));

  const dContributors = AR.commandContributors('B1', others('D'));
  check('D: contributors are E (co-located) + A (radius) -> sums to 6', 1 + dContributors.reduce((a, b) => a + b, 0) === 6);
  check('D is in command', AR.isInCommand(1, dContributors));

  const eContributors = AR.commandContributors('B1', others('E'));
  check('E is in command (same hex as D, total 6)', AR.isInCommand(2, eContributors));

  const cContributors = AR.commandContributors('C1', others('C'));
  check('C: contributor is A only (radius) -> sums to 5', 2 + cContributors.reduce((a, b) => a + b, 0) === 5);
  check('C is in command', AR.isInCommand(2, cContributors));

  const bContributors = AR.commandContributors('E1', others('B'));
  check('B has no contributors (outside every radius, alone)', bContributors.length === 0);
  check('B is out of command (IN 1 < 5)', !AR.isInCommand(1, bContributors));
}

// A commander who becomes inactive exerts no radius.
{
  const roster = [{ hexId: 'A1', IN: 3, isCommander: true, isActive: false }];
  check('an inactive commander contributes nothing', AR.commandContributors('B1', roster).length === 0);
}

// Task #65 (docs/40_PANIC_EFFECTS.md): "A panicked commander has no command radius" — but he
// still counts via plain co-location, since that's not a commander-specific power.
{
  const panickedFar = [{ hexId: 'A1', IN: 3, isCommander: true, isActive: true, panicked: true }];
  check('a panicked commander contributes no radius to a hex he is not in', AR.commandContributors('B1', panickedFar).length === 0);

  const panickedHere = [{ hexId: 'B1', IN: 3, isCommander: true, isActive: true, panicked: true }];
  check('a panicked commander still contributes via co-location', AR.commandContributors('B1', panickedHere).length === 1 && AR.commandContributors('B1', panickedHere)[0] === 3);
}

// ---------------------------------------------------------------------
// Initiative Determination (§6/1 step 1)
// ---------------------------------------------------------------------
check('advantage: US 6 vs German 4 -> US', AR.resolveAdvantage(6, 4) === 'US');
check('advantage: US 4 vs German 6 -> german', AR.resolveAdvantage(4, 6) === 'german');
check('advantage: tie goes to Germans', AR.resolveAdvantage(5, 5) === 'german');

// ---------------------------------------------------------------------
// AR Track roll classification (§6/1 step 2) — against the real shared chart.
// ---------------------------------------------------------------------
check('classifyARRoll: IN 3 roll 7 is a red 2-Turn (matches AR_DRILL ar1/ar2 in the trainer)',
      JSON.stringify(AR.classifyARRoll(AR_TRACK, 3, 7)) === JSON.stringify({ space: '2turn', isRed: true }));
check('classifyARRoll: IN 0 roll 2 is panic', AR.classifyARRoll(AR_TRACK, 0, 2).space === 'panic');
check('classifyARRoll: IN 5 has no red numbers anywhere (matches AR_DRILL ar7)',
      !AR.classifyARRoll(AR_TRACK, 5, 0).isRed && !AR.classifyARRoll(AR_TRACK, 5, 3).isRed && !AR.classifyARRoll(AR_TRACK, 5, 9).isRed);
{
  let threw = false;
  try { AR.classifyARRoll(AR_TRACK, 9, 0); } catch (e) { threw = true; }
  check('classifyARRoll: unknown IN column throws', threw);
}

// ---------------------------------------------------------------------
// AR marker placement / panic (§6/1, §6/4)
// ---------------------------------------------------------------------
check('2-Turn, unwounded -> 2 turns', AR.resolveMarkerPlacement({ space: '2turn', wounded: false }).turns === 2);
check('2-Turn, wounded -> demoted to 1 turn (§6/1 exception)', AR.resolveMarkerPlacement({ space: '2turn', wounded: true }).turns === 1);
check('1-Turn -> 1 turn', AR.resolveMarkerPlacement({ space: '1turn' }).turns === 1);
check('Panic space -> panics', AR.resolveMarkerPlacement({ space: 'panic' }).outcome === 'panic');
check('Red number, out of command -> panics', AR.resolveMarkerPlacement({ space: 'red', inCommand: false }).outcome === 'panic');
check('Red number, in command -> receives turns instead (default 1-Turn)',
      AR.resolveMarkerPlacement({ space: 'red', inCommand: true }).outcome === 'turns');
check('Red number, in command, explicit 2-Turn cell -> 2 turns',
      AR.resolveMarkerPlacement({ space: 'red', inCommand: true, spaceIfInCommand: '2turn' }).turns === 2);

check('can give a turn from 1-Turn space', AR.canReceiveGivenTurn('1turn', false));
check('can give a turn from Complete space', AR.canReceiveGivenTurn('complete', false));
check('cannot give a turn from 2-Turn space', !AR.canReceiveGivenTurn('2turn', false));
check('cannot give a turn to a wounded soldier, regardless of space', !AR.canReceiveGivenTurn('1turn', true));

// ---------------------------------------------------------------------
// US Awareness (§6/5)
// ---------------------------------------------------------------------
check('Round 1, can see activated German -> check', AR.awarenessRule(1, true) === 'check');
check('Round 1, cannot see activated German -> remains unaware, no check', AR.awarenessRule(1, false) === 'remainUnaware');
check('Round 2, regardless of sight -> check', AR.awarenessRule(2, false) === 'check' && AR.awarenessRule(2, true) === 'check');
check('Round 3+ -> automatic', AR.awarenessRule(3, false) === 'automatic' && AR.awarenessRule(5, false) === 'automatic');

// ---------------------------------------------------------------------
// Event Check dice (§6/1 step 2 — resolves the open question from docs/21)
// ---------------------------------------------------------------------
{
  const rolls = [3, 4];
  const roll = () => rolls.shift();
  check('rollEventSum sums two d10 rolls', AR.rollEventSum(roll) === 7);
}

// ---------------------------------------------------------------------
// German Action Number + card cross-reference (§6/8) — real transcribed card data.
// ---------------------------------------------------------------------
{
  const ge33 = ROSTER['GE 33/V']; // DIE,CONDITION 4,SPECIAL S: 0-1/863,816  2-6/866,819  7/819,833  8-9/867,833
  check('GE 33/V die 0, Condition 4 -> 863', AR.resolveGermanActionParagraph(ge33, 0, 4).paragraph === '863');
  check('GE 33/V die 1, Condition 4 -> 863 (range row)', AR.resolveGermanActionParagraph(ge33, 1, 4).paragraph === '863');
  check('GE 33/V die 4, Condition 4 -> 866', AR.resolveGermanActionParagraph(ge33, 4, 4).paragraph === '866');
  check('GE 33/V die 7, Condition 4 -> 819', AR.resolveGermanActionParagraph(ge33, 7, 4).paragraph === '819');
  check('GE 33/V die 9, Condition 4 -> 867', AR.resolveGermanActionParagraph(ge33, 9, 4).paragraph === '867');
  check('GE 33/V die 7, Self-Preservation active -> 833 (SPECIAL S column, not Condition)',
        AR.resolveGermanActionParagraph(ge33, 7, 4, { selfPreservationActive: true }).paragraph === '833');
}
{
  // GE 2/N: DIE,CONDITION 1-2,CONDITION 3-4,CONDITION 5-6,SPECIAL A,SPECIAL B,SPECIAL S — a
  // card whose Condition columns each cover a *range* of Conditions, not one apiece.
  const ge2 = ROSTER['GE 2/N'];
  check('GE 2/N Condition 1 uses the "CONDITION 1-2" column', AR.findColumnForCondition(ge2.table.columns, 1) === 'CONDITION 1-2');
  check('GE 2/N Condition 2 also uses "CONDITION 1-2"', AR.findColumnForCondition(ge2.table.columns, 2) === 'CONDITION 1-2');
  check('GE 2/N Condition 4 uses "CONDITION 3-4"', AR.findColumnForCondition(ge2.table.columns, 4) === 'CONDITION 3-4');
  check('GE 2/N die 5, Condition 4 (CONDITION 3-4 col, row "5") -> 802',
        AR.resolveGermanActionParagraph(ge2, 5, 4).paragraph === '802');
  check('GE 2/N Special Reaction B, die 2 -> 810', AR.resolveGermanActionParagraph(ge2, 2, 1, { specialReaction: 'B' }).paragraph === '810');
}
{
  // Decision transparency (session 63): the resolver must say WHICH of the three rules picked the
  // column and what it displaced, so the UI can explain a paragraph number rather than just print
  // one. The rule that fired belongs here; naming the adjacent US soldier is the caller's job.
  const ge33 = ROSTER['GE 33/V'];
  const ge2 = ROSTER['GE 2/N'];

  const byCondition = AR.resolveGermanActionParagraph(ge33, 7, 4).reason;
  check('an ordinary lookup reports the Condition rule and which Condition',
        byCondition.rule === 'condition' && byCondition.condition === 4);

  const bySelfPres = AR.resolveGermanActionParagraph(ge33, 7, 4, { selfPreservationActive: true }).reason;
  check('a Self-Preservation lookup reports the rule and the Condition column it displaced',
        bySelfPres.rule === 'self_preservation' && bySelfPres.overrides === 'CONDITION 4');

  const byReaction = AR.resolveGermanActionParagraph(ge2, 2, 1, { specialReaction: 'B' }).reason;
  check('a Special Reaction lookup reports the rule, the letter, and what it displaced',
        byReaction.rule === 'special_reaction' && byReaction.letter === 'B' && byReaction.overrides === 'CONDITION 1');

  // §11/4: Self-Preservation outranks a Special Reaction, and the reason must say so — this is
  // the one combination where naming only the winning column would hide half the decision.
  const both = AR.resolveGermanActionParagraph(ge2, 2, 1, { selfPreservationActive: true, specialReaction: 'B' }).reason;
  check('Self-Preservation over a Special Reaction reports displacing the Reaction, not the Condition',
        both.rule === 'self_preservation' && both.overrides === 'SPECIAL B');

  // The reason must never disagree with the column actually used.
  const r = AR.resolveGermanActionParagraph(ge33, 7, 4, { selfPreservationActive: true });
  check('the reported reason matches the column actually returned',
        r.reason.rule === 'self_preservation' && /^SPECIAL S$/i.test(r.column));
  const r2 = AR.resolveGermanActionParagraph(ge33, 7, 4);
  check('the Condition reason matches the Condition column actually returned',
        r2.reason.rule === 'condition' && /^CONDITION/i.test(r2.column));
}
{
  // GE 19 (Kubelwagen group card) has no table at all — must fail loudly, not silently guess.
  const ge19 = ROSTER['GE 19'];
  let threw = false;
  try { AR.resolveGermanActionParagraph(ge19, 5, 1); } catch (e) { threw = true; }
  check('a table-less group card (GE 19) throws rather than guessing', threw);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

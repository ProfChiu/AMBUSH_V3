#!/usr/bin/env node
/*
 * test_difficulty.js — Easy mode (apps/game/difficulty.js)
 *
 * Easy mode is not rulebook content, so these tests pin the DESIGN INTENT rather than a rule:
 * that Normal is untouched by its existence, that every Easy lever moves in the player's favour
 * and only in the player's favour, and that the field-dressing allowance is spent exactly once.
 *
 * Run:  node tools/test_difficulty.js
 */
const path = require('path');
const ROOT = path.dirname(__dirname);

global.window = {};
require(path.join(ROOT, 'apps/game/difficulty.js'));
require(path.join(ROOT, 'assets/data/squad_generation.js'));
require(path.join(ROOT, 'apps/game/victoryrules.js'));
const D = global.window.AmbushDifficulty;
const V = global.window.AmbushVictory;
const SQ = global.window.AMBUSH_SQUAD_GEN;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// ---------------------------------------------------------------------
// Normal must be exactly the game without this module
// ---------------------------------------------------------------------
{
  check('normal: no hit-chance modifier either way',
    D.hitChanceMod(D.NORMAL, 'US') === 0 && D.hitChanceMod(D.NORMAL, 'german') === 0);
  check('normal: one squad-generation roll', D.squadRolls(D.NORMAL) === 1);
  check('normal: no field dressing',
    D.fieldDressingApplies(D.NORMAL, { side: 'US' }, 'K') === false);
  check('normal: unknown level falls back to normal, never to easy',
    D.squadRolls('nonsense') === 1 && D.hitChanceMod('nonsense', 'US') === 0);
}

// ---------------------------------------------------------------------
// Every Easy lever helps the player, and only the player
// ---------------------------------------------------------------------
{
  check('easy: US fire gets +1', D.hitChanceMod(D.EASY, 'US') === 1);
  check('easy: German fire gets -1', D.hitChanceMod(D.EASY, 'german') === -1);
  check('easy: two squad-generation rolls', D.squadRolls(D.EASY) === 2);
  check('easy: a lower target than normal', D.vpMargin(D.EASY) > D.vpMargin(D.NORMAL));

  // The handicap must respect the 0-8 Hit Chance clamp (§9/1 step 4) in both directions.
  check('hit mod clamps at the top', D.applyHitMod({ raw: 8, clamped: 8 }, 1).clamped === 8);
  check('hit mod clamps at the bottom', D.applyHitMod({ raw: 0, clamped: 0 }, -1).clamped === 0);
  check('hit mod keeps the raw total for display', D.applyHitMod({ raw: 8, clamped: 8 }, 1).raw === 9);
}

// ---------------------------------------------------------------------
// chooseBest scores by OUTCOME, not by the die — the §4 tables do not all run the same way
// ---------------------------------------------------------------------
{
  const sq = (r) => SQ.SQUAD_QUALITY[r];
  check('squad quality: the higher die wins (more Squad Points)',
    D.chooseBest([2, 7], sq).roll === 7);

  // Weapon Points DECREASE as the squad+weapon sum rises, so here the LOW die is the good one.
  const wq = (r) => SQ.WEAPON_QUALITY[4 + r];
  check('weapon quality: the lower die wins (more Weapon Points)',
    D.chooseBest([2, 7], wq).roll === 2);
  check('weapon quality: and it really is the better outcome',
    SQ.WEAPON_QUALITY[4 + 2] > SQ.WEAPON_QUALITY[4 + 7]);

  check('a tie keeps the first roll, so the pop-up can say so honestly',
    D.chooseBest([5, 5], sq).index === 0);
  check('reports the value it kept', D.chooseBest([2, 7], sq).value === SQ.SQUAD_QUALITY[7]);
  check('a single roll is returned unchanged', D.chooseBest([3], sq).roll === 3);
  let threw = false;
  try { D.chooseBest([], sq); } catch (e) { threw = true; }
  check('no rolls at all throws rather than guessing', threw);
}

// ---------------------------------------------------------------------
// Field dressing: once per soldier, players only, kills only
// ---------------------------------------------------------------------
{
  const soldier = { side: 'US', name: 'Pvt. Test' };
  check('applies to a US soldier killed for the first time',
    D.fieldDressingApplies(D.EASY, soldier, 'K') === true);
  check('asking does not spend it', D.fieldDressingApplies(D.EASY, soldier, 'K') === true
    && !soldier.usedFieldDressing);

  check('commit downgrades Killed to Incapacitated',
    D.consumeFieldDressing(D.EASY, soldier, 'K') === 'I');
  check('and marks the allowance spent', soldier.usedFieldDressing === true);
  check('second kill on the same soldier is not downgraded',
    D.consumeFieldDressing(D.EASY, soldier, 'K') === 'K');

  const other = { side: 'US' };
  check('the allowance is per soldier, not per squad',
    D.consumeFieldDressing(D.EASY, other, 'K') === 'I');

  check('never applies to a German', D.fieldDressingApplies(D.EASY, { side: 'german' }, 'K') === false);
  check('never applies to a non-kill result',
    D.fieldDressingApplies(D.EASY, { side: 'US' }, 'W') === false
    && D.fieldDressingApplies(D.EASY, { side: 'US' }, 'I') === false);
  check('passes other codes through untouched',
    D.consumeFieldDressing(D.EASY, { side: 'US' }, 'W') === 'W');
}

// ---------------------------------------------------------------------
// The target actually moves, and in the right direction, against Mission 1's real ceiling
// ---------------------------------------------------------------------
{
  const CEILING = 14; // Mission 1, from computeReachableVP — see victoryrules.js
  const normal = V.scaleRequirement(CEILING, 13, D.vpMargin(D.NORMAL)).requirement;
  const easy = V.scaleRequirement(CEILING, 13, D.vpMargin(D.EASY)).requirement;
  check('normal targets 8', normal === 8);
  check('easy targets 5', easy === 5);
  check('easy is strictly easier to reach', easy < normal);
  check('neither exceeds the rulebook number', normal <= 13 && easy <= 13);
  check('easy is still a real target, not a giveaway', easy > 0);
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

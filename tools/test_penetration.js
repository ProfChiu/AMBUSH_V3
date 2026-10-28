#!/usr/bin/env node
/*
 * tools/test_penetration.js — Phase 9 penetration tests (docs/30_PENETRATION.md)
 *
 * Run:  node tools/test_penetration.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/penetrationrules.js'));
const P = window.AmbushPenetration;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// ---------------------------------------------------------------------
// Explosive vs non-explosive shell classification
// ---------------------------------------------------------------------
{
  check('bazooka fires an explosive shell', P.isExplosiveWeapon('baz') === true);
  check('a rifle fires a non-explosive bullet', P.isExplosiveWeapon('bolt') === false);
  check('an automatic rifle fires a non-explosive bullet', P.isExplosiveWeapon('bar') === false);
}

// ---------------------------------------------------------------------
// resolvePenetrationLevel — the explicit judgment-call placeholder (docs/30_PENETRATION.md §2),
// not the real chart. Bazooka always heavy; everything else only on a Killed result.
// ---------------------------------------------------------------------
{
  check('judgment call: bazooka is always heavy penetration on any hit', P.resolvePenetrationLevel('baz', 'I') === 'heavy');
  check('judgment call: bazooka heavy even on its weakest hit result', P.resolvePenetrationLevel('baz', 'K') === 'heavy');
  check('judgment call: a rifle\'s Killed result -> light penetration', P.resolvePenetrationLevel('bolt', 'K') === 'light');
  check('judgment call: a rifle\'s non-Killed result -> no penetration', P.resolvePenetrationLevel('bolt', 'W') === null);
  check('judgment call: an automatic weapon\'s Killed result -> light penetration', P.resolvePenetrationLevel('bar', 'K') === 'light');
  check('judgment call: no weapon reaches medium penetration in this placeholder', P.resolvePenetrationLevel('bar', 'I') !== 'medium' && P.resolvePenetrationLevel('bolt', 'I') !== 'medium');
}

// ---------------------------------------------------------------------
// Penetration level x shell type -> effect (all six combinations)
// ---------------------------------------------------------------------
{
  check('light + explosive -> destroyed', P.resolvePenetrationEffect('light', true).destroyed === true);
  check('light + non-explosive -> passes through, not destroyed', P.resolvePenetrationEffect('light', false).destroyed === false && P.resolvePenetrationEffect('light', false).passesThrough === true);
  check('medium + explosive -> destroyed', P.resolvePenetrationEffect('medium', true).destroyed === true);
  check('medium + non-explosive -> passes through, not destroyed', P.resolvePenetrationEffect('medium', false).destroyed === false && P.resolvePenetrationEffect('medium', false).passesThrough === true);
  check('heavy + explosive -> destroyed and passes through', P.resolvePenetrationEffect('heavy', true).destroyed === true && P.resolvePenetrationEffect('heavy', true).passesThrough === true);
  check('heavy + non-explosive -> destroyed and passes through regardless of shell type', P.resolvePenetrationEffect('heavy', false).destroyed === true && P.resolvePenetrationEffect('heavy', false).passesThrough === true);

  let threw = false;
  try { P.resolvePenetrationEffect('massive', true); } catch (e) { threw = /level must be/.test(e.message); }
  check('unknown penetration level throws', threw);
}

// ---------------------------------------------------------------------
// Wall hit-by-stance thresholds — a soldier behind a penetrated (not destroyed) wall
// ---------------------------------------------------------------------
{
  check('prone: hit on 0', P.resolveWallHitByStance('prone', 0) === true);
  check('prone: not hit on 1', P.resolveWallHitByStance('prone', 1) === false);
  check('crouching: hit on 0', P.resolveWallHitByStance('crouching', 0) === true);
  check('crouching: hit on 1', P.resolveWallHitByStance('crouching', 1) === true);
  check('crouching: not hit on 2', P.resolveWallHitByStance('crouching', 2) === false);
  check('standing: hit on 0, 1, and 2', P.resolveWallHitByStance('standing', 0) && P.resolveWallHitByStance('standing', 1) && P.resolveWallHitByStance('standing', 2));
  check('standing: not hit on 3', P.resolveWallHitByStance('standing', 3) === false);

  let threwStance = false;
  try { P.resolveWallHitByStance('diving', 0); } catch (e) { threwStance = /unknown stance/.test(e.message); }
  check('unknown stance throws', threwStance);
  let threwRoll = false;
  try { P.resolveWallHitByStance('prone', 10); } catch (e) { threwRoll = /0-9/.test(e.message); }
  check('out-of-range roll throws', threwRoll);
}

// ---------------------------------------------------------------------
// Most-exposed-first targeting (standing > crouching > prone — the opposite priority from
// assault's "most disadvantageous" rule)
// ---------------------------------------------------------------------
{
  const mixed = [
    { id: 'proneGuy', stance: 'prone' },
    { id: 'standingGuy', stance: 'standing' },
    { id: 'crouchingGuy', stance: 'crouching' },
  ];
  check('most exposed: standing beats crouching and prone', P.selectMostExposedTarget(mixed, () => 0).id === 'standingGuy');

  const tie = [
    { id: 'a', stance: 'standing' },
    { id: 'b', stance: 'standing' },
  ];
  check('most exposed: tie among the same stance resolved by injected rollDie', P.selectMostExposedTarget(tie, () => 1).id === 'b');

  const noStanding = [
    { id: 'crouch1', stance: 'crouching' },
    { id: 'prone1', stance: 'prone' },
  ];
  check('most exposed: crouching beats prone when no one is standing', P.selectMostExposedTarget(noStanding, () => 0).id === 'crouch1');

  let threw = false;
  try { P.selectMostExposedTarget([], () => 0); } catch (e) { threw = /no candidates/.test(e.message); }
  check('most exposed: empty candidate list throws', threw);
}

// ---------------------------------------------------------------------
// Aimed automatic weapons fire against a multi-soldier hex overrides sequential targeting
// ---------------------------------------------------------------------
{
  check('aimed automatic -> each soldier rolls independently', P.wallHitResolutionMode('aimed', true) === 'each-soldier-rolls');
  check('snap automatic -> still most-exposed-first (only aimed triggers the exception)', P.wallHitResolutionMode('snap', true) === 'most-exposed-first');
  check('aimed non-automatic -> most-exposed-first', P.wallHitResolutionMode('aimed', false) === 'most-exposed-first');
}

// ---------------------------------------------------------------------
// Wall-destroyed collateral damage and building collapse
// ---------------------------------------------------------------------
{
  check('wall-destroyed collateral always uses the Semi-Auto Rifle row', P.wallDestroyedCollateralWeaponId() === 'sar');

  check('0 destroyed walls: no collapse', P.resolveBuildingCollapse(0).collapses === false);
  check('1 destroyed wall: no collapse yet', P.resolveBuildingCollapse(1).collapses === false);
  check('2 destroyed walls: collapses, occupants killed', P.resolveBuildingCollapse(2).collapses === true && P.resolveBuildingCollapse(2).occupantsKilled === true);
  check('more than 2 destroyed walls: still collapses', P.resolveBuildingCollapse(3).collapses === true);
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

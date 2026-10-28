#!/usr/bin/env node
/*
 * tools/test_assault.js — Phase 9 assault/capture tests (docs/27_ASSAULT.md)
 *
 * Run:  node tools/test_assault.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'assets/data/weapon_chart.js'));
require(path.join(ROOT, 'apps/game/firecombat.js'));
require(path.join(ROOT, 'apps/game/assaultrules.js'));
const FC = window.AmbushFireCombat;
const A = window.AmbushAssault;
const CHART = window.AMBUSH_WEAPON_CHART;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}
function weapon(id) { return CHART.WEAPON_CHART.find(function (w) { return w.id === id; }); }

// ---------------------------------------------------------------------
// §11/1 step 1: German target selection — most disadvantageous stance
// ---------------------------------------------------------------------
{
  const candidates = [
    { id: 'standing', stance: 'standing', wounded: false },
    { id: 'prone', stance: 'prone', wounded: false },
  ];
  check('target: prone beats standing', A.resolveGermanAssaultTarget(candidates, () => 0).id === 'prone');

  const candidates2 = [
    { id: 'crouching', stance: 'crouching', wounded: false },
    { id: 'wounded', stance: 'crouching', wounded: true },
  ];
  check('target: wounded (even if crouching, not prone) beats a merely-crouching soldier', A.resolveGermanAssaultTarget(candidates2, () => 0).id === 'wounded');

  const tieDisadvantaged = [
    { id: 'a', stance: 'prone', wounded: false },
    { id: 'b', stance: 'prone', wounded: false },
  ];
  check('target: tie among disadvantaged resolved by injected rollDie (index 1)', A.resolveGermanAssaultTarget(tieDisadvantaged, () => 1).id === 'b');

  const tieOther = [
    { id: 'x', stance: 'standing', wounded: false },
    { id: 'y', stance: 'crouching', wounded: false },
  ];
  check('target: crouching vs standing (neither disadvantaged) is a tie, not a further tier', A.resolveGermanAssaultTarget(tieOther, () => 0).id === 'x');

  check('target: single candidate needs no rollDie call', A.resolveGermanAssaultTarget([{ id: 'only', stance: 'standing', wounded: false }], () => { throw new Error('should not be called'); }).id === 'only');

  let threw = false;
  try { A.resolveGermanAssaultTarget([], () => 0); } catch (e) { threw = /no candidates/.test(e.message); }
  check('target: empty candidate list throws', threw);
}

// ---------------------------------------------------------------------
// §11/1 the rulebook's own ASSAULT COMBAT EXAMPLE, end to end: Soldier D charge-assaults to
// kill German X (standing, unpanicked, unwounded). Base 7, D's WS +1, charge -3, X's WS +2
// (eligible, subtracted) -> final Hit Chance 3. Roll 2 hits. Damage roll 7 -> Incapacitated.
// ---------------------------------------------------------------------
{
  const hitChance = A.computeHitChance(CHART.BASE_HIT.assault, {
    attackerWS: 1, defenderWS: 2, defenderPanicked: false, defenderWounded: false,
    defenderUnaware: false, isChargeAssault: true, attackerWounded: false, attackerUsingCapturedWeapon: false,
  });
  check('ASSAULT EXAMPLE: base 7 -> final Hit Chance 3', hitChance.raw === 3 && hitChance.clamped === 3);
  check('ASSAULT EXAMPLE: roll 2 is a hit', FC.resolveHitRoll(hitChance.clamped, 2) === 'hit');
  const dmg = FC.resolveDamage(weapon('asltk'), 7, CHART.DAMAGE_LEGEND);
  check('ASSAULT EXAMPLE: damage roll 7 on the Kill row -> Incapacitated', dmg.code === 'I' && dmg.label === 'Incapacitated');
}

// ---------------------------------------------------------------------
// §11/4 modifiers, each in isolation
// ---------------------------------------------------------------------
{
  const base = CHART.BASE_HIT.assault; // 7
  check('mods: attacker WS always applies', A.computeHitChance(base, { attackerWS: 2 }).raw === 9);

  check('mods: defender WS +1/+2 subtracts when eligible', A.computeHitChance(base, { defenderWS: 2 }).raw === 5);
  check('mods: defender WS 0 has no effect (not >=1)', A.computeHitChance(base, { defenderWS: 0 }).raw === 7);
  check('mods: defender WS negative has no effect', A.computeHitChance(base, { defenderWS: -1 }).raw === 7);
  check('mods: defender WS ignored if panicked', A.computeHitChance(base, { defenderWS: 2, defenderPanicked: true }).raw === 7);
  check('mods: defender WS ignored if wounded', A.computeHitChance(base, { defenderWS: 2, defenderWounded: true }).raw === 7);
  check('mods: defender WS ignored if unaware (the gap fixed this session)', A.computeHitChance(base, { defenderWS: 2, defenderUnaware: true }).raw === 7);

  check('mods: charge assault -3', A.computeHitChance(base, { isChargeAssault: true }).raw === 4);
  check('mods: attacker wounded -2', A.computeHitChance(base, { attackerWounded: true }).raw === 5);
  check('mods: captured weapon -1 (the other gap fixed this session)', A.computeHitChance(base, { attackerUsingCapturedWeapon: true }).raw === 6);

  const stacked = A.computeHitChance(base, { attackerWS: 2, isChargeAssault: true, attackerWounded: true, attackerUsingCapturedWeapon: true });
  check('mods: all attacker-side modifiers stack (7+2-3-2-1=3)', stacked.raw === 3);

  const clampHigh = A.computeHitChance(8, { attackerWS: 2 });
  check('mods: clamps to 8', clampHigh.raw === 10 && clampHigh.clamped === 8);
  const clampLow = A.computeHitChance(3, { isChargeAssault: true, attackerWounded: true, attackerUsingCapturedWeapon: true });
  check('mods: clamps to 0', clampLow.raw === -3 && clampLow.clamped === 0);
}

// ---------------------------------------------------------------------
// §11/3 Charge Assault MPA — half MPA, rounded down. Verified against the rulebook's own
// example: an MPA-3 soldier's halved allowance (1) can't afford a 2-MP window crossing.
// ---------------------------------------------------------------------
{
  check('charge MPA: 3 -> 1 (the rulebook\'s own example)', A.chargeAssaultMaxMP(3) === 1);
  check('charge MPA: 4 -> 2', A.chargeAssaultMaxMP(4) === 2);
  check('charge MPA: 5 -> 2', A.chargeAssaultMaxMP(5) === 2);
  check('charge MPA: 2 -> 1', A.chargeAssaultMaxMP(2) === 1);
  check('charge MPA: 1 -> 0', A.chargeAssaultMaxMP(1) === 0);
}

// ---------------------------------------------------------------------
// §11/2 Capture — the asltc row's 'Z' code, resolved via firecombat.resolveZCode (not part of
// escalateDamageResult's ladder — see docs/27_ASSAULT.md).
// ---------------------------------------------------------------------
{
  const asltc = weapon('asltc'); // dmg "ICCCCZZPP*"
  const dmg = FC.resolveDamage(asltc, 4, CHART.DAMAGE_LEGEND); // dmg[9-4]=dmg[5]='Z'
  check('capture row: roll 4 -> raw Z code', dmg.code === 'Z');
  check('capture row: Z + target already panicked/wounded -> Captured', FC.resolveZCode(true) === 'C');
  check('capture row: Z + target otherwise unharmed -> Wounded', FC.resolveZCode(false) === 'W');

  const directCapture = FC.resolveDamage(asltc, 8, CHART.DAMAGE_LEGEND); // dmg[9-8]=dmg[1]='C'
  check('capture row: roll 8 -> direct Captured (no Z resolution needed)', directCapture.code === 'C');

  const incap = FC.resolveDamage(asltc, 9, CHART.DAMAGE_LEGEND); // dmg[9-9]=dmg[0]='I'
  check('capture row: roll 9 -> Incapacitated is still possible even when attempting capture', incap.code === 'I');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

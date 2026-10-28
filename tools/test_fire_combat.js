#!/usr/bin/env node
/*
 * tools/test_fire_combat.js — Phase 9 core fire combat tests (docs/24_FIRE_COMBAT.md)
 *
 * Run:  node tools/test_fire_combat.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/hexgrid.js'));
require(path.join(ROOT, 'assets/data/weapon_chart.js'));
require(path.join(ROOT, 'apps/game/firecombat.js'));
const FC = window.AmbushFireCombat;
const CHART = window.AMBUSH_WEAPON_CHART;
const G = window.AmbushHexGrid;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}
function weapon(id) { return CHART.WEAPON_CHART.find(function (w) { return w.id === id; }); }

// ---------------------------------------------------------------------
// §9/1 Fire Combat Example, verbatim from the rulebook: Soldier C in T3 snap-firing a
// semi-automatic rifle at Soldier Q in P9 (standing, in the open). Jam roll 12 (no jam, needs
// <=05 aimed/snap for SAR), range 8 hexes (medium), base 4, WS -1, terrain +1, snap -2 -> final
// Hit Chance 2. To-hit roll 1 -> hit. Damage roll 4 -> Wounded. Ammo roll 17 vs <=25 -> spent.
// ---------------------------------------------------------------------
{
  const sar = weapon('sar');
  const range = FC.hexDistance('T3', 'P9');
  check('worked example: range T3->P9 is 8', range === 8);
  const band = FC.resolveRangeBand(sar, range);
  check('worked example: range 8 is medium for SAR', band === 'med');

  const jam = FC.resolveJamCheck(sar, 'snap', 12);
  check('worked example: roll 12 does not jam (threshold 05)', jam.jammed === false && jam.threshold === 5);

  const terrainMod = FC.resolveTerrainMod(CHART.FIRE_MODS_TERRAIN, 0, 'standing'); // Open, standing
  check('worked example: Open/standing terrain mod is +1', terrainMod === 1);

  const baseHit = CHART.BASE_HIT[band];
  check('worked example: base hit at medium range is 4', baseHit === 4);

  const finalHit = FC.computeFinalHitChance({ baseHit: baseHit, terrainMod: terrainMod, fireType: 'snap', weaponSkill: -1 });
  check('worked example: final Hit Chance is 2', finalHit.clamped === 2 && finalHit.raw === 2);

  check('worked example: to-hit roll 1 hits', FC.resolveHitRoll(finalHit.clamped, 1) === 'hit');

  const dmg = FC.resolveDamage(sar, 4, CHART.DAMAGE_LEGEND);
  check('worked example: damage roll 4 -> Wounded', dmg.code === 'W' && dmg.label === 'Wounded');

  const ammo = FC.resolveAmmoExpenditure(sar, 17);
  check('worked example: ammo roll 17 vs <=25 -> clip spent', ammo.expended === true && ammo.alwaysCertain === false);
}

// ---------------------------------------------------------------------
// §9/1 step 3: range bands (same/adjacent short-circuit, then weapon-specific bands)
// ---------------------------------------------------------------------
{
  const pistol = weapon('pistol');
  check('range: distance 0 is same', FC.resolveRangeBand(pistol, 0) === 'same');
  check('range: distance 1 is adjacent', FC.resolveRangeBand(pistol, 1) === 'adjacent');
  check('range: pistol short band 2-3', FC.resolveRangeBand(pistol, 2) === 'short' && FC.resolveRangeBand(pistol, 3) === 'short');
  check('range: pistol med band 4-5', FC.resolveRangeBand(pistol, 4) === 'med' && FC.resolveRangeBand(pistol, 5) === 'med');
  check('range: pistol long band starts at 6', FC.resolveRangeBand(pistol, 6) === 'long');
  check('range: pistol out past long (21) is null', FC.resolveRangeBand(pistol, 21) === null);

  const asltk = weapon('asltk');
  check('range: assault weapon has no range bands (throws null, not a crash)', FC.resolveRangeBand(asltk, 5) === null);
}

// ---------------------------------------------------------------------
// §9/3 Fire Shifts: terrain modifier table, all stances, plus the "no data" throw
// ---------------------------------------------------------------------
{
  const t = CHART.FIRE_MODS_TERRAIN;
  check('terrain: Open standing +1', FC.resolveTerrainMod(t, 0, 'standing') === 1);
  check('terrain: Open crouching 0', FC.resolveTerrainMod(t, 0, 'crouching') === 0);
  check('terrain: Open prone -1', FC.resolveTerrainMod(t, 0, 'prone') === -1);
  check('terrain: Woods prone -4', FC.resolveTerrainMod(t, 5, 'prone') === -4);
  let threwNullMod = false;
  try { FC.resolveTerrainMod(t, 6, 'prone'); } catch (e) { threwNullMod = /no modifier defined/.test(e.message); }
  check('terrain: interior-not-adjacent + prone (undefined cell) throws', threwNullMod);
  let threwBadStance = false;
  try { FC.resolveTerrainMod(t, 0, 'crawling'); } catch (e) { threwBadStance = /unknown stance/.test(e.message); }
  check('terrain: unknown stance throws', threwBadStance);
}

// ---------------------------------------------------------------------
// §9/1 step 4: clamping to 0-8, and the fireType validation
// ---------------------------------------------------------------------
{
  const high = FC.computeFinalHitChance({ baseHit: 8, terrainMod: 1, fireType: 'aimed', weaponSkill: 2, otherMods: [3] });
  check('clamp: high total clamps to 8', high.raw === 14 && high.clamped === 8);
  const low = FC.computeFinalHitChance({ baseHit: 3, terrainMod: -3, fireType: 'snap', weaponSkill: -2 });
  check('clamp: low total clamps to 0', low.raw === -4 && low.clamped === 0);
  let threwFireType = false;
  try { FC.computeFinalHitChance({ baseHit: 4, terrainMod: 0, fireType: 'burst', weaponSkill: 0 }); }
  catch (e) { threwFireType = /fireType must be/.test(e.message); }
  check('clamp: invalid fireType throws', threwFireType);
  const withOther = FC.computeFinalHitChance({ baseHit: 4, terrainMod: 0, fireType: 'aimed', weaponSkill: 0, otherMods: [1, 1] });
  check('clamp: otherMods array sums in (multi-target automatic bonus etc.)', withOther.clamped === 6);
}

// ---------------------------------------------------------------------
// §9/1 step 2 / §9/4: jam check, aimed vs snap thresholds, bounds
// ---------------------------------------------------------------------
{
  const smg = weapon('smg'); // jam:[5,10] — snap fire raises jam chance, per §9/7's note
  check('jam: aimed threshold 05', FC.resolveJamCheck(smg, 'aimed', 5).jammed === true);
  check('jam: aimed roll 06 does not jam', FC.resolveJamCheck(smg, 'aimed', 6).jammed === false);
  check('jam: snap threshold 10 (higher than aimed)', FC.resolveJamCheck(smg, 'snap', 10).jammed === true);
  check('jam: snap roll 06 jams too (snap threshold is 10)', FC.resolveJamCheck(smg, 'snap', 6).jammed === true);
  let threwRange = false;
  try { FC.resolveJamCheck(smg, 'aimed', 100); } catch (e) { threwRange = /0-99/.test(e.message); }
  check('jam: out-of-range percentile throws', threwRange);
  let threwNoJamData = false;
  try { FC.resolveJamCheck(weapon('asltk'), 'aimed', 5); } catch (e) { threwNoJamData = /no jam data/.test(e.message); }
  check('jam: weapon with no jam data throws', threwNoJamData);
}

// ---------------------------------------------------------------------
// §9/1 step 5: to-hit roll, the 0-always-hits/9-always-misses override
// ---------------------------------------------------------------------
{
  check('to-hit: roll 0 always hits even at Hit Chance 0', FC.resolveHitRoll(0, 0) === 'hit');
  check('to-hit: roll 9 always misses even at Hit Chance 8', FC.resolveHitRoll(8, 9) === 'miss');
  check('to-hit: roll <= chance hits', FC.resolveHitRoll(3, 3) === 'hit');
  check('to-hit: roll > chance misses', FC.resolveHitRoll(3, 4) === 'miss');
}

// ---------------------------------------------------------------------
// §9/1 step 6: damage table lookup, high-roll-first indexing
// ---------------------------------------------------------------------
{
  const pistol = weapon('pistol'); // dmg "KIWWWWWPPP"
  check('damage: pistol roll 9 -> K (dmg[0])', FC.resolveDamage(pistol, 9, CHART.DAMAGE_LEGEND).code === 'K');
  check('damage: pistol roll 0 -> P (dmg[9])', FC.resolveDamage(pistol, 0, CHART.DAMAGE_LEGEND).code === 'P');
  check('damage: pistol roll 8 -> I (dmg[1])', FC.resolveDamage(pistol, 8, CHART.DAMAGE_LEGEND).code === 'I');
  const dmgLabel = FC.resolveDamage(pistol, 9, CHART.DAMAGE_LEGEND).label;
  check('damage: legend label resolves', dmgLabel === 'Killed');
}

// ---------------------------------------------------------------------
// §9/1 step 7 / §9/5: ammo expenditure — numeric threshold, "A" always-certain, null throws
// ---------------------------------------------------------------------
{
  const carb = weapon('carb'); // ammo 25
  check('ammo: roll <= threshold spends a clip', FC.resolveAmmoExpenditure(carb, 25).expended === true);
  check('ammo: roll > threshold does not', FC.resolveAmmoExpenditure(carb, 26).expended === false);
  const grenade = weapon('grout'); // ammo "A"
  check('ammo: "A" items are always-certain expenditure', FC.resolveAmmoExpenditure(grenade, 0).expended === true);
  let threwNoAmmoData = false;
  try { FC.resolveAmmoExpenditure(weapon('asltk'), 10); } catch (e) { threwNoAmmoData = /no ammo mechanic/.test(e.message); }
  check('ammo: assault weapon (ammo null) throws', threwNoAmmoData);
}

// ---------------------------------------------------------------------
// §13/6 Aimed Automatic Weapon Damage — the decreasing-roll cascade
// ---------------------------------------------------------------------
{
  const bar = weapon('bar'); // automatic:true, dmg "KKKIIIWWWP"
  check('cascade: BAR is flagged automatic', bar.automatic === true);
  check('cascade: SAR (semi-auto) is not flagged automatic', weapon('sar').automatic === undefined);

  // Rolls 4, then 2 (< 4, hits secondary), then 5 (>= 2, stops) — 3 targets available.
  {
    const rolls = [4, 2, 5];
    let i = 0;
    const rollDie = function () { return rolls[i++]; };
    const results = FC.resolveAimedAutomaticCascade(bar, rollDie, 3, CHART.DAMAGE_LEGEND);
    check('cascade: primary always applied', results[0].role === 'primary' && results[0].roll === 4);
    check('cascade: secondary applied (2 < 4)', results[1] && results[1].role === 'secondary' && results[1].roll === 2);
    check('cascade: stops once a roll >= previous (5 >= 2), no tertiary despite a 3rd target', results.length === 2);
  }

  // Primary roll of 0: no roll can be lower, cascade stops after primary even with more targets.
  {
    const rollDie = function () { return 0; };
    const results = FC.resolveAimedAutomaticCascade(bar, rollDie, 4, CHART.DAMAGE_LEGEND);
    check('cascade: primary roll 0 stops the cascade immediately', results.length === 1);
  }

  // Single target: no cascade attempted regardless of roll.
  {
    let calls = 0;
    const rollDie = function () { calls++; return 9; };
    const results = FC.resolveAimedAutomaticCascade(bar, rollDie, 1, CHART.DAMAGE_LEGEND);
    check('cascade: single target only rolls once', calls === 1 && results.length === 1);
  }

  let threwNotAutomatic = false;
  try { FC.resolveAimedAutomaticCascade(weapon('sar'), function () { return 5; }, 2, CHART.DAMAGE_LEGEND); }
  catch (e) { threwNotAutomatic = /not an automatic weapon/.test(e.message); }
  check('cascade: non-automatic weapon throws', threwNotAutomatic);
}

// ---------------------------------------------------------------------
// §9/6 German Fire Combat Terms — Best Fire, Closest Target, Easiest Target
// ---------------------------------------------------------------------
{
  check('best fire: can aim -> aimed', FC.resolveBestFireType(true) === 'aimed');
  check('best fire: cannot aim -> snap', FC.resolveBestFireType(false) === 'snap');

  const candidates = [
    { id: 'A', distance: 3, hitChance: 5 },
    { id: 'B', distance: 5, hitChance: 8 },
    { id: 'C', distance: 3, hitChance: 2 },
  ];
  check('closest target: A and C tie on distance 3, A is easier (hitChance 5 > 2)',
    FC.resolveClosestTarget(candidates, function () { return 0; }).id === 'A');
  check('easiest target: B has the highest hitChance outright',
    FC.resolveEasiestTarget(candidates, function () { return 0; }).id === 'B');

  const fullTie = [
    { id: 'X', distance: 4, hitChance: 4 },
    { id: 'Y', distance: 4, hitChance: 4 },
  ];
  check('closest target: full tie resolved by injected rollDie (index 1 -> Y)',
    FC.resolveClosestTarget(fullTie, function () { return 1; }).id === 'Y');
  check('easiest target: full tie resolved by injected rollDie (index 0 -> X)',
    FC.resolveEasiestTarget(fullTie, function () { return 0; }).id === 'X');

  let threwNoCandidates = false;
  try { FC.resolveClosestTarget([], function () { return 0; }); }
  catch (e) { threwNoCandidates = /no candidates/.test(e.message); }
  check('target selection: empty candidate list throws', threwNoCandidates);
}

// ---------------------------------------------------------------------
// §13/1-13/4 damage-result escalation ladder
// ---------------------------------------------------------------------
{
  const E = FC.escalateDamageResult;
  check('escalate: unharmed + Wound -> wounded', E(null, 'W') === 'wounded');
  check('escalate: unharmed + Incap -> incapacitated', E('unharmed', 'I') === 'incapacitated');
  check('escalate: unharmed + Panic -> panicked', E('unharmed', 'P') === 'panicked');
  check('escalate: unharmed + Kill -> killed', E('unharmed', 'K') === 'killed');

  check('escalate: wounded + second Wound -> incapacitated (§13/2)', E('wounded', 'W') === 'incapacitated');
  check('escalate: wounded + Incap -> incapacitated (§13/2)', E('wounded', 'I') === 'incapacitated');
  check('escalate: wounded + Panic -> stays wounded (panic does not downgrade)', E('wounded', 'P') === 'wounded');
  check('escalate: wounded + Kill -> killed', E('wounded', 'K') === 'killed');

  check('escalate: incapacitated + Wound -> killed (§13/3)', E('incapacitated', 'W') === 'killed');
  check('escalate: incapacitated + second Incap -> killed (§13/3)', E('incapacitated', 'I') === 'killed');
  check('escalate: incapacitated + Panic -> stays incapacitated', E('incapacitated', 'P') === 'incapacitated');

  check('escalate: killed + anything -> stays killed', E('killed', 'W') === 'killed' && E('killed', 'P') === 'killed');

  let threwBadCode = false;
  try { E('unharmed', 'X'); } catch (e) { threwBadCode = /only handles raw/.test(e.message); }
  check('escalate: raw X/Z/C/* codes rejected, not guessed at', threwBadCode);
}

// ---------------------------------------------------------------------
// §10's 'X' code resolution (added for grenades, docs/26_GRENADES.md) — the raw P/W handoff
// escalateDamageResult expects.
// ---------------------------------------------------------------------
{
  check('resolveXCode: prone target -> P (Panic)', FC.resolveXCode(true) === 'P');
  check('resolveXCode: non-prone target -> W (Wounded)', FC.resolveXCode(false) === 'W');
}

// ---------------------------------------------------------------------
// §11's 'Z' code resolution (added for assault/capture, docs/27_ASSAULT.md) — 'C' (Captured)
// is deliberately NOT one of escalateDamageResult's P/W/I/K codes (see file header).
// ---------------------------------------------------------------------
{
  check('resolveZCode: target already panicked/wounded -> C (Captured)', FC.resolveZCode(true) === 'C');
  check('resolveZCode: target otherwise unharmed -> W (Wounded)', FC.resolveZCode(false) === 'W');
  let threwOnC = false;
  try { FC.escalateDamageResult('unharmed', 'C'); } catch (e) { threwOnC = /only handles raw/.test(e.message); }
  check('escalateDamageResult: raw C is still rejected — callers must branch on it before this point', threwOnC);
}

// ---------------------------------------------------------------------
// §9/4 Clear Jammed Weapon Chart (added for grenades' research pass, docs/26_GRENADES.md —
// the same source image also carried the Grenade Scatter Diagrams)
// ---------------------------------------------------------------------
{
  const chart = CHART.CLEAR_JAM_CHART;
  check('clear jam: WS+2, roll 0 -> clear', FC.resolveClearJamAction(2, 0, chart).result === 'clear');
  check('clear jam: WS+2, roll 8 -> jam', FC.resolveClearJamAction(2, 8, chart).result === 'jam');
  check('clear jam: WS+2, roll 9 -> break', FC.resolveClearJamAction(2, 9, chart).result === 'break');
  check('clear jam: WS 0, roll 6 -> jam', FC.resolveClearJamAction(0, 6, chart).result === 'jam');
  check('clear jam: WS 0, roll 8 -> break', FC.resolveClearJamAction(0, 8, chart).result === 'break');
  check('clear jam: WS -3 (captured, base -2), roll 2 -> break', FC.resolveClearJamAction(-3, 2, chart).result === 'break');
  check('clear jam: WS -3, roll 0 -> clear (clear is always possible on a 0-1)', FC.resolveClearJamAction(-3, 0, chart).result === 'clear');

  let threwNoRow = false;
  try { FC.resolveClearJamAction(5, 0, chart); } catch (e) { threwNoRow = /no chart row/.test(e.message); }
  check('clear jam: out-of-range Weapon Skill throws', threwNoRow);
  let threwBadRoll = false;
  try { FC.resolveClearJamAction(0, 10, chart); } catch (e) { threwBadRoll = /0-9/.test(e.message); }
  check('clear jam: out-of-range roll throws', threwBadRoll);

  check('resolveClearJammedWeapon: own weapon, WS unchanged', FC.resolveClearJammedWeapon(0, false, 6, chart).result === FC.resolveClearJamAction(0, 6, chart).result);
  check('resolveClearJammedWeapon: captured weapon, WS reduced by 1 (§14)', FC.resolveClearJammedWeapon(0, true, 2, chart).result === FC.resolveClearJamAction(-1, 2, chart).result);
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

#!/usr/bin/env node
/*
 * tools/test_grenades.js — Phase 9 grenade/satchel charge tests (docs/26_GRENADES.md)
 *
 * Run:  node tools/test_grenades.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/hexgrid.js'));
require(path.join(ROOT, 'apps/game/losrules.js'));
require(path.join(ROOT, 'assets/data/weapon_chart.js'));
require(path.join(ROOT, 'assets/data/grenade_scatter.js'));
require(path.join(ROOT, 'apps/game/firecombat.js'));
require(path.join(ROOT, 'apps/game/grenaderules.js'));
const Gr = window.AmbushGrenades;
const FC = window.AmbushFireCombat;
const CHART = window.AMBUSH_WEAPON_CHART;
const SCATTER = window.AMBUSH_GRENADE_SCATTER;
const G = window.AmbushHexGrid;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// ---------------------------------------------------------------------
// §10/1 step 1: throw range limits by the thrower's own stance
// ---------------------------------------------------------------------
{
  check('grenade throw range: standing 6', Gr.maxThrowRange('grenade', 'standing') === 6);
  check('grenade throw range: crouching 3', Gr.maxThrowRange('grenade', 'crouching') === 3);
  check('grenade throw range: prone 0 (cannot throw)', Gr.maxThrowRange('grenade', 'prone') === 0);
  check('satchel throw range: standing 3', Gr.maxThrowRange('satchel', 'standing') === 3);
  check('satchel throw range: crouching 0 (cannot throw)', Gr.maxThrowRange('satchel', 'crouching') === 0);
  check('satchel throw range: prone 0', Gr.maxThrowRange('satchel', 'prone') === 0);

  let threwBadKind = false;
  try { Gr.maxThrowRange('bazooka', 'standing'); } catch (e) { threwBadKind = /kind must be/.test(e.message); }
  check('maxThrowRange: unknown kind throws', threwBadKind);
  let threwBadStance = false;
  try { Gr.maxThrowRange('grenade', 'diving'); } catch (e) { threwBadStance = /unknown stance/.test(e.message); }
  check('maxThrowRange: unknown stance throws', threwBadStance);
}

// ---------------------------------------------------------------------
// Weapon-row selection by whether the TARGET hex is interior/exterior (independent of the
// thrower's own stance/location)
// ---------------------------------------------------------------------
{
  check('weaponIdFor: grenade, exterior target -> grout', Gr.weaponIdFor('grenade', false) === 'grout');
  check('weaponIdFor: grenade, interior target -> grin', Gr.weaponIdFor('grenade', true) === 'grin');
  check('weaponIdFor: satchel, exterior target -> satout', Gr.weaponIdFor('satchel', false) === 'satout');
  check('weaponIdFor: satchel, interior target -> satin', Gr.weaponIdFor('satchel', true) === 'satin');
  let threw = false;
  try { Gr.weaponIdFor('bazooka', false); } catch (e) { threw = /kind must be/.test(e.message); }
  check('weaponIdFor: unknown kind throws', threw);
}

// ---------------------------------------------------------------------
// §10/1 step 3: Hit Chance — no terrain/stance/fire-type shifts, just base + GRENADE_MODS
// ---------------------------------------------------------------------
{
  const high = Gr.computeHitChance(8, [2, 2]);
  check('hit chance: clamps to 8', high.raw === 12 && high.clamped === 8);
  const low = Gr.computeHitChance(3, [-3, -3]);
  check('hit chance: clamps to 0', low.raw === -3 && low.clamped === 0);
  const mid = Gr.computeHitChance(CHART.BASE_HIT.long, [1, -3]); // WS +1, target hex not in sight
  check('hit chance: long-range base 3, +1 WS, -3 not-in-sight -> 1 (matches the rulebook GRENADE EXAMPLE\'s final Hit Chance of 0 in spirit — different WS here)', mid.clamped === 1);
  const noMods = Gr.computeHitChance(CHART.BASE_HIT.adjacent, []);
  check('hit chance: no mods just passes base through', noMods.clamped === CHART.BASE_HIT.adjacent);
}

// ---------------------------------------------------------------------
// The rulebook's own GRENADE EXAMPLE (§10/1): German R in P4 throws at K2 (long range, base 3),
// can't see the target (-3), no WS given in the example beyond implied 0 -> final Hit Chance 0.
// ---------------------------------------------------------------------
{
  const range = FC.hexDistance('P4', 'K2');
  check('GRENADE EXAMPLE: range P4->K2 is 5 (long)', range === 5);
  const band = FC.resolveRangeBand(CHART.WEAPON_CHART.find(w => w.id === 'grout'), range);
  check('GRENADE EXAMPLE: range 5 is long for a grenade', band === 'long');
  const hitChance = Gr.computeHitChance(CHART.BASE_HIT[band], [-3]); // not in sight, WS 0
  check('GRENADE EXAMPLE: base 3, -3 not-in-sight -> final Hit Chance 0', hitChance.clamped === 0);
  check('GRENADE EXAMPLE: "any roll but 0 causes the grenade to miss" (0 always hits at chance 0)', FC.resolveHitRoll(0, 0) === 'hit' && FC.resolveHitRoll(0, 1) === 'miss');
}

// ---------------------------------------------------------------------
// §10/1 step 5: dud check — fixed threshold (unlike a weapon-specific jam threshold)
// ---------------------------------------------------------------------
{
  check('dud check: roll 5 is a dud', Gr.resolveDudCheck(5).dud === true);
  check('dud check: roll 6 is not a dud', Gr.resolveDudCheck(6).dud === false);
  check('dud check: roll 0 is a dud', Gr.resolveDudCheck(0).dud === true);
  let threw = false;
  try { Gr.resolveDudCheck(100); } catch (e) { threw = /0-99/.test(e.message); }
  check('dud check: out-of-range roll throws', threw);
}

// ---------------------------------------------------------------------
// §10/2 Grenade Strike PC Check reaction
// ---------------------------------------------------------------------
{
  const R = Gr.resolveStrikeReaction;
  check('strike reaction: failed check -> no-reaction', R({ pcSucceeded: false }).outcome === 'no-reaction');
  check('strike reaction: success, turn remaining, standing -> toss-away', R({ pcSucceeded: true, hasTurnRemaining: true, stance: 'standing' }).outcome === 'toss-away');
  check('strike reaction: success, turn remaining, crouching -> toss-away', R({ pcSucceeded: true, hasTurnRemaining: true, stance: 'crouching' }).outcome === 'toss-away');
  check('strike reaction: success, turn remaining, but already prone -> no-reaction (nothing to toss with)', R({ pcSucceeded: true, hasTurnRemaining: true, stance: 'prone' }).outcome === 'no-reaction');
  check('strike reaction: success, no turn remaining, unwounded -> fall-prone (free)', R({ pcSucceeded: true, hasTurnRemaining: false, wounded: false }).outcome === 'fall-prone');
  check('strike reaction: success, no turn remaining, wounded -> no-reaction', R({ pcSucceeded: true, hasTurnRemaining: false, wounded: true }).outcome === 'no-reaction');
}

// ---------------------------------------------------------------------
// §10/3 Scatter — data integrity for both diagrams
// ---------------------------------------------------------------------
{
  function checkTable(name, table) {
    const seen = [];
    table.forEach(function (row) { row.rolls.forEach(function (r) { seen.push(r); }); });
    seen.sort(function (a, b) { return a - b; });
    check(name + ': covers every roll 0-9 exactly once', JSON.stringify(seen) === JSON.stringify([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]));
    const offsets = table.map(function (row) { return row.offset; }).sort();
    check(name + ': has offsets 0-5 exactly once each', JSON.stringify(offsets) === JSON.stringify([0, 1, 2, 3, 4, 5]));
  }
  checkTable('diagramA', SCATTER.diagramA);
  checkTable('diagramB', SCATTER.diagramB);
}

// ---------------------------------------------------------------------
// §10/3 Scatter — resolveScatter against real Map A geometry. Diagram A is the only one
// reachable on this map: an exhaustive sweep of every hex pair at every real distance found
// zero cases where losrules.hexLine's tie-detection fires immediately before the destination
// (the condition §10/3 calls "Diagram B") — the map's specific hex geometry apparently never
// produces it, for ANY pair, not just within grenade range. Documented, not asserted as
// rulebook-certain that it's impossible in general — only verified for this map.
// ---------------------------------------------------------------------
{
  // The rulebook's own GRENADE EXAMPLE pair (§10/1): German R in P4 throws into K2.
  const results = {};
  for (let r = 0; r <= 9; r++) {
    const res = Gr.resolveScatter('P4', 'K2', r);
    check('GRENADE EXAMPLE scatter: roll ' + r + ' uses Diagram A (the only reachable one on this map)', res.diagram === 'A');
    results[res.hexId] = (results[res.hexId] || 0) + 1;
    check('GRENADE EXAMPLE scatter: roll ' + r + ' lands on a real hex, never P4 (the thrower) or K2 (the target itself)', res.hexId !== 'P4' && res.hexId !== 'K2');
  }
  const sizes = Object.values(results).sort(function (a, b) { return a - b; });
  check('GRENADE EXAMPLE scatter: bucket sizes across the 6 landing hexes match Diagram A (1,1,1,1,2,4)', JSON.stringify(sizes) === JSON.stringify([1, 1, 1, 1, 2, 4]));

  // Adjacent-throw redirect (§10/3 asterisk): "if throw originates in this hex, grenade lands
  // in target hex" — a scattered throw can never land back on the thrower.
  const adjacentResults = [];
  for (let r = 6; r <= 9; r++) adjacentResults.push(Gr.resolveScatter('B2', 'C3', r).hexId);
  check('adjacent throw: rolls 6-9 (the direction-of-throw bucket) redirect to the target hex, not the thrower', adjacentResults.every(function (h) { return h === 'C3'; }));
  for (let r = 0; r <= 5; r++) {
    const h = Gr.resolveScatter('B2', 'C3', r).hexId;
    check('adjacent throw: roll ' + r + ' never lands on the thrower\'s own hex', h !== 'B2');
  }

  let threwSameHex = false;
  try { Gr.resolveScatter('K2', 'K2', 3); } catch (e) { threwSameHex = /must be different hexes/.test(e.message); }
  check('resolveScatter: thrower === target throws', threwSameHex);
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

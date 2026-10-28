#!/usr/bin/env node
/*
 * tools/test_hazards.js — Phase 9 minefield/boobytrap tests (docs/29_HAZARDS.md)
 *
 * Run:  node tools/test_hazards.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'assets/data/weapon_chart.js'));
require(path.join(ROOT, 'apps/game/checksrules.js'));
require(path.join(ROOT, 'apps/game/firecombat.js'));
require(path.join(ROOT, 'apps/game/hazardrules.js'));
const Checks = window.AmbushChecks;
const FC = window.AmbushFireCombat;
const H = window.AmbushHazards;
const CHART = window.AMBUSH_WEAPON_CHART;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}
function weapon(id) { return CHART.WEAPON_CHART.find(function (w) { return w.id === id; }); }

// ---------------------------------------------------------------------
// Shared: explosion damage always resolves via the Grenade Inside row
// ---------------------------------------------------------------------
{
  check('explosion weapon id is always "grin" (Grenade Inside)', H.explosionWeaponId() === 'grin');
  const w = weapon(H.explosionWeaponId());
  check('that weapon row actually exists on the chart', w && w.name === 'Grenade (inside)');
}

// ---------------------------------------------------------------------
// §12/1 Boobytrap — checker selection: highest PC among candidates present
// ---------------------------------------------------------------------
{
  const candidates = [
    { id: 'low', pc: 2 },
    { id: 'high', pc: 5 },
    { id: 'mid', pc: 3 },
  ];
  check('boobytrap checker: highest PC selected', H.selectBoobytrapChecker(candidates).id === 'high');
  check('boobytrap checker: single candidate trivially selected', H.selectBoobytrapChecker([{ id: 'only', pc: 1 }]).id === 'only');

  const tie = [{ id: 'a', pc: 4 }, { id: 'b', pc: 4 }];
  check('boobytrap checker: tie resolves to the first-listed candidate (documented arbitrary default)', H.selectBoobytrapChecker(tie).id === 'a');

  let threw = false;
  try { H.selectBoobytrapChecker([]); } catch (e) { threw = /no candidates/.test(e.message); }
  check('boobytrap checker: empty candidate list throws', threw);
}

// ---------------------------------------------------------------------
// §12/1 Boobytrap — one-shot regardless of outcome; explosion damages everyone in the hex
// ---------------------------------------------------------------------
{
  const success = H.resolveBoobytrapCheck(true);
  check('boobytrap: successful check -> not exploded', success.exploded === false);
  check('boobytrap: successful check still consumes it ("no longer exists in the hex")', success.consumed === true);

  const failure = H.resolveBoobytrapCheck(false);
  check('boobytrap: failed check -> exploded', failure.exploded === true);
  check('boobytrap: failed check also consumes it', failure.consumed === true);

  // "if the boobytrap explodes, all soldiers in the hex suffer damage (roll a die separately
  // for each soldier)" — caller loops FC.resolveDamage per soldier off the fixed 'grin' row.
  const grin = weapon(H.explosionWeaponId());
  const soldiersInHex = ['A', 'B', 'C'];
  const results = soldiersInHex.map(function (id, i) { return { id: id, dmg: FC.resolveDamage(grin, i * 3, CHART.DAMAGE_LEGEND) }; });
  check('boobytrap: every soldier in the hex gets an independent damage roll off the same row', results.every(function (r) { return r.dmg.code !== undefined; }));
}

// ---------------------------------------------------------------------
// §12/2 Minefield — never consumed; only the failing soldier is affected
// ---------------------------------------------------------------------
{
  const success = H.resolveMinefieldCheck(true);
  check('minefield: successful check -> not exploded', success.exploded === false);
  check('minefield: never consumed ("never depleted or destroyed")', success.consumed === false);

  const failure = H.resolveMinefieldCheck(false);
  check('minefield: failed check -> exploded', failure.exploded === true);
  check('minefield: still never consumed even on a failure', failure.consumed === false);

  // "If more than one soldier enters a minefield at the same time, each soldier conducts a
  // separate PC Check, and only those who fail their check suffer" — simulate a group entry.
  const group = [
    { id: 'A', pc: 4, roll: 2 }, // succeeds (2 <= 4)
    { id: 'B', pc: 2, roll: 7 }, // fails (7 > 2)
    { id: 'C', pc: 3, roll: 0 }, // always succeeds (0)
  ];
  const outcomes = group.map(function (s) {
    const result = Checks.resolvePerceptionCheck(s.pc, 0, s.roll);
    return { id: s.id, hazard: H.resolveMinefieldCheck(result === 'success') };
  });
  check('minefield group entry: A succeeds, unaffected', outcomes[0].hazard.exploded === false);
  check('minefield group entry: B fails, exploded', outcomes[1].hazard.exploded === true);
  check('minefield group entry: C succeeds (0 always succeeds), unaffected', outcomes[2].hazard.exploded === false);
  check('minefield group entry: exactly one of the three is affected, not all or none', outcomes.filter(function (o) { return o.hazard.exploded; }).length === 1);
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

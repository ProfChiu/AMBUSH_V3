#!/usr/bin/env node
/*
 * tools/test_crewweapons.js — Phase 9 crew weapon / bazooka tests (docs/28_CREW_WEAPONS.md)
 *
 * Run:  node tools/test_crewweapons.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'assets/data/weapon_chart.js'));
require(path.join(ROOT, 'apps/game/firecombat.js'));
require(path.join(ROOT, 'apps/game/crewweaponrules.js'));
const FC = window.AmbushFireCombat;
const CW = window.AmbushCrewWeapons;
const CHART = window.AMBUSH_WEAPON_CHART;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}
function weapon(id) { return CHART.WEAPON_CHART.find(function (w) { return w.id === id; }); }

// ---------------------------------------------------------------------
// §9/7: firing eligibility — must be crouching
// ---------------------------------------------------------------------
{
  check('crew weapon: crouching can fire', CW.canFireCrewWeapon('crouching') === true);
  check('crew weapon: standing cannot fire', CW.canFireCrewWeapon('standing') === false);
  check('crew weapon: prone cannot fire', CW.canFireCrewWeapon('prone') === false);
}

// ---------------------------------------------------------------------
// §9/7: what's possible given the crouching-soldier count
// ---------------------------------------------------------------------
{
  const zero = CW.crewFireOptions(0);
  check('crew fire options: 0 soldiers -> nothing possible', !zero.canSnapSolo && !zero.canSnapEach && !zero.canAimedCombined);
  const one = CW.crewFireOptions(1);
  check('crew fire options: 1 soldier -> solo snap only', one.canSnapSolo && !one.canSnapEach && !one.canAimedCombined);
  const two = CW.crewFireOptions(2);
  check('crew fire options: 2 soldiers -> solo snap, each-snap, or combined aimed all possible', two.canSnapSolo && two.canSnapEach && two.canAimedCombined);
}

// ---------------------------------------------------------------------
// §9/7: "a maximum of two soldiers can fire a single crew weapon in one Round"
// ---------------------------------------------------------------------
{
  check('crew round cap: first soldier always allowed', CW.canSoldierJoinCrewWeaponRound([], 'A') === true);
  check('crew round cap: second distinct soldier allowed', CW.canSoldierJoinCrewWeaponRound(['A'], 'B') === true);
  check('crew round cap: a third distinct soldier is rejected', CW.canSoldierJoinCrewWeaponRound(['A', 'B'], 'C') === false);
  check('crew round cap: a soldier already in the list can fire again (his own later turn)', CW.canSoldierJoinCrewWeaponRound(['A', 'B'], 'A') === true);
}

// ---------------------------------------------------------------------
// §9/7 the rulebook's own CREW WEAPON EXAMPLE: Germans S and T man a medium machinegun. T has
// two turns, S has one. Cards say S fires while T assists — S is the designated firer
// regardless of whose turn comes first or either soldier's WS. T's turn comes first: combined
// aimed fire, resolved with S's WS. For T's second turn, only T is present (S is out of turns),
// so it's a solo snap fire using T's own WS.
// ---------------------------------------------------------------------
{
  const S = { id: 'S', WS: 0 };
  const T = { id: 'T', WS: 1 }; // T has the higher WS, but the card overrides that
  check('CREW WEAPON EXAMPLE: card designates S as firer despite T having the higher WS', CW.resolveGermanCrewFirer(T, S, 'S') === 'S');

  const mmg = weapon('mmg');
  const combinedAimed = FC.computeFinalHitChance({ baseHit: CHART.BASE_HIT.med, terrainMod: 0, fireType: 'aimed', weaponSkill: S.WS });
  check('CREW WEAPON EXAMPLE: T\'s first turn — combined aimed fire uses designated firer S\'s WS (0), not T\'s (1)', combinedAimed.raw === CHART.BASE_HIT.med + S.WS);

  // T's second turn: S is out of turns, so only T can act — the fire is necessarily solo, and
  // §9/7 is explicit a solo crew-weapon fire is always a snap fire using the actual firer's WS.
  const soloSnap = FC.computeFinalHitChance({ baseHit: CHART.BASE_HIT.med, terrainMod: 0, fireType: 'snap', weaponSkill: T.WS });
  check('CREW WEAPON EXAMPLE: T\'s second turn — solo snap fire uses T\'s own WS (1), not S\'s', soloSnap.raw === CHART.BASE_HIT.med - 2 + T.WS);

  const jamAimed = FC.resolveJamCheck(mmg, 'aimed', 5);
  const jamSnap = FC.resolveJamCheck(mmg, 'snap', 5);
  check('CREW WEAPON EXAMPLE: snap fire jams more easily than aimed for the mmg (§9/7 "snap fire greatly increases jam chance")', jamSnap.threshold > jamAimed.threshold);
}

// ---------------------------------------------------------------------
// §9/7 German firer designation without a card override — higher WS fires
// ---------------------------------------------------------------------
{
  const low = { id: 'low', WS: -1 };
  const high = { id: 'high', WS: 2 };
  check('firer designation: higher WS fires when no override', CW.resolveGermanCrewFirer(low, high) === 'high');
  check('firer designation: order doesn\'t matter', CW.resolveGermanCrewFirer(high, low) === 'high');
  check('firer designation: equal WS defaults to the first soldier (deterministic, not rulebook-specified)', CW.resolveGermanCrewFirer({ id: 'a', WS: 1 }, { id: 'b', WS: 1 }) === 'a');
}

// ---------------------------------------------------------------------
// §9/8 Bazookas
// ---------------------------------------------------------------------
{
  check('bazooka: can never snap fire', CW.bazookaCanSnapFire() === false);
  check('bazooka: standing can prepare it', CW.canPrepareBazooka('standing') === true);
  check('bazooka: crouching can prepare it', CW.canPrepareBazooka('crouching') === true);
  check('bazooka: prone cannot prepare it', CW.canPrepareBazooka('prone') === false);
  check('bazooka: splash damage to other soldiers in the hex always uses the Grenade Inside row', CW.bazookaSplashWeaponId() === 'grin');

  const baz = weapon('baz');
  check('bazooka weapon row exists and has no snap-relevant second jam threshold difference issue (single jam value)', baz.jam[0] === baz.jam[1]);
  const primary = FC.resolveDamage(baz, 5, CHART.DAMAGE_LEGEND);
  const splashWeapon = weapon(CW.bazookaSplashWeaponId());
  const splash = FC.resolveDamage(splashWeapon, 5, CHART.DAMAGE_LEGEND);
  check('bazooka: primary (Personnel/baz row) and splash (grin row) resolve independently off the same roll but different tables', primary.code !== undefined && splash.code !== undefined);
}

// ---------------------------------------------------------------------
// §9/9 (OPTIONAL) — eligibility gate only; the actual wall-fire resolution needs §13/5
// Penetration, still deferred.
// ---------------------------------------------------------------------
{
  check('building fire eligibility: PC Check success -> may fire at the wall', CW.resolveBuildingFireEligibility(true).outcome === 'fire-at-wall');
  check('building fire eligibility: PC Check failure -> no action', CW.resolveBuildingFireEligibility(false).outcome === 'no-action');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

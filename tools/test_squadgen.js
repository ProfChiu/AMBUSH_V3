#!/usr/bin/env node
/*
 * tools/test_squadgen.js — §4 Squad Generation tests (docs/31_VICTORY.md)
 *
 * Run:  node tools/test_squadgen.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'assets/data/squad_generation.js'));
require(path.join(ROOT, 'assets/data/weapon_chart.js'));
require(path.join(ROOT, 'apps/game/equipmentrules.js'));
require(path.join(ROOT, 'apps/game/squadgenrules.js'));
const SG = window.AmbushSquadGen;
const EQ = window.AmbushEquipment;
const CHART = window.AMBUSH_SQUAD_GEN;
const WEAPONS = window.AMBUSH_WEAPON_CHART.WEAPON_CHART;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// ---------------------------------------------------------------------
// §4 steps 2-3: Squad/Weapon Quality
// ---------------------------------------------------------------------
{
  check('squad quality: roll 0 -> 29 SP', SG.resolveSquadQuality(CHART, 0) === 29);
  check('squad quality: roll 9 -> 43 SP', SG.resolveSquadQuality(CHART, 9) === 43);
  let threw = false;
  try { SG.resolveSquadQuality(CHART, 10); } catch (e) { threw = /no entry/.test(e.message); }
  check('squad quality: out-of-range roll throws', threw);

  check('weapon quality: squad roll 0 + weapon roll 0 -> sum 0 -> 48 WP', SG.resolveWeaponQuality(CHART, 0, 0) === 48);
  check('weapon quality: squad roll 9 + weapon roll 9 -> sum 18 -> 30 WP', SG.resolveWeaponQuality(CHART, 9, 9) === 30);
}

// ---------------------------------------------------------------------
// §4 steps 5-8: per-soldier ratings
// ---------------------------------------------------------------------
{
  check('PC: roll 0, IN 0 -> 0', SG.resolvePC(CHART, 0, 0) === 0);
  check('PC: roll 9, IN 5 -> 9', SG.resolvePC(CHART, 9, 5) === 9);
  check('WS: roll+IN sum 0 -> -2', SG.resolveWS(CHART, 0, 0) === -2);
  check('WS: roll+IN sum 14 -> +2', SG.resolveWS(CHART, 9, 5) === 2);
  check('DS: roll+IN sum 0 -> 0', SG.resolveDS(CHART, 0, 0) === 0);
  check('DS: roll+IN sum 14 -> 8', SG.resolveDS(CHART, 9, 5) === 8);
  check('MPA: IN 0 -> 3', SG.mpaForIN(CHART, 0) === 3);
  check('MPA: IN 5 -> 5', SG.mpaForIN(CHART, 5) === 5);

  let threw = false;
  try { SG.resolvePC(CHART, 0, 6); } catch (e) { threw = /no entry/.test(e.message); }
  check('PC: out-of-range IN throws', threw);
}

// ---------------------------------------------------------------------
// Validity and letter assignment
// ---------------------------------------------------------------------
{
  check('valid squad: 4 soldiers incl. a commander', SG.isValidSquad([{ IN: 3, isCommander: true }, { IN: 1 }, { IN: 1 }, { IN: 0 }]));
  check('invalid squad: only 3 soldiers', !SG.isValidSquad([{ IN: 3, isCommander: true }, { IN: 1 }, { IN: 1 }]));
  check('invalid squad: 4 soldiers but no commander', !SG.isValidSquad([{ IN: 3 }, { IN: 1 }, { IN: 1 }, { IN: 0 }]));

  const roster = [
    { id: 'x', IN: 1, isCommander: false },
    { id: 'y', IN: 5, isCommander: false },
    { id: 'z', IN: 3, isCommander: true },
  ];
  const lettered = SG.assignLetters(roster, CHART);
  check('letters: sorted descending IN', lettered.map(function (s) { return s.id; }).join(',') === 'y,z,x');
  check('letters: assigned A, B, C in sorted order', lettered[0].letter === 'A' && lettered[1].letter === 'B' && lettered[2].letter === 'C');
  check('letters: assignLetters does not mutate the input array', roster[0].letter === undefined);

  const tie = SG.assignLetters([{ id: 'plain', IN: 3, isCommander: false }, { id: 'cmdr', IN: 3, isCommander: true }], CHART);
  check('letters: on an IN tie, the commander sorts first', tie[0].id === 'cmdr');
}

// ---------------------------------------------------------------------
// autoBuySoldiers — the judgment-call heuristic. Must produce a valid squad across the whole
// real Squad Quality range (29-43 SP) without ever throwing.
// ---------------------------------------------------------------------
{
  var allValid = true, allWithinBudget = true, allHaveCommander = true;
  for (var sp = 29; sp <= 43; sp++) {
    var result = SG.autoBuySoldiers(sp, CHART);
    if (!SG.isValidSquad(result.soldiers.map(function (t) { return { IN: t.in, isCommander: t.cmdr }; }))) allValid = false;
    if (result.spentSP > sp) allWithinBudget = false;
    if (!result.soldiers.some(function (t) { return t.cmdr; })) allHaveCommander = false;
  }
  check('autoBuySoldiers: produces a valid squad across the entire real SP range (29-43)', allValid);
  check('autoBuySoldiers: never overspends the budget', allWithinBudget);
  check('autoBuySoldiers: always includes a commander', allHaveCommander);

  // Regression for the redundant-commander bug (see autoBuySoldiers' own comment): the fill pass
  // used to buy IN 5 COMMANDERS at 21 SP as its "highest IN affordable" pick, capping nine of the
  // ten real Squad Quality rolls at a four-man squad. A squad needs exactly one commander to be
  // valid, and the real SP range (29-43) comfortably buys six to eight bodies once the filler
  // stops overpaying for commander entries nobody asked for.
  var exactlyOneCommander = true, sixOrMore = true, smallest = 99;
  for (var sp2 = 29; sp2 <= 43; sp2++) {
    var squad = SG.autoBuySoldiers(sp2, CHART);
    if (squad.soldiers.filter(function (t) { return t.cmdr; }).length !== 1) exactlyOneCommander = false;
    if (squad.soldiers.length < 6) sixOrMore = false;
    smallest = Math.min(smallest, squad.soldiers.length);
  }
  check('autoBuySoldiers: buys exactly one commander, never a redundant second', exactlyOneCommander);
  check('autoBuySoldiers: the real SP range (29-43) buys at least six soldiers, not four', sixOrMore && smallest >= 6);

  const tight = SG.autoBuySoldiers(8, CHART); // artificially low, below the real minimum roll
  check('autoBuySoldiers: even a very tight budget reaches the 4-soldier minimum via free IN-0 fillers', tight.soldiers.length >= 4);
  check('autoBuySoldiers: a tight budget still ends up valid', SG.isValidSquad(tight.soldiers.map(function (t) { return { IN: t.in, isCommander: t.cmdr }; })));
}

// ---------------------------------------------------------------------
// autoBuyEquipment — every soldier gets a personal weapon before anything else is bought
// ---------------------------------------------------------------------
{
  const eq = SG.autoBuyEquipment(48, 6, CHART);
  check('autoBuyEquipment: buys one rifle per soldier first', eq.equipment.sar === 6);
  check('autoBuyEquipment: no carbines — the SAR costs the same and dominates it', !eq.equipment.carb);
  check('autoBuyEquipment: never overspends', eq.spentWP <= 48);
  check('autoBuyEquipment: spends everything it can (unspent points are lost)', eq.remainingWP === 0);

  const tiny = SG.autoBuyEquipment(3, 6, CHART);
  check('autoBuyEquipment: a tight budget buys fewer rifles rather than throwing', tiny.equipment.sar < 6 && tiny.equipment.sar >= 1);

  // Pins the reason the standard-issue weapon changed from the carbine to the SAR, so the choice
  // rests on the data rather than on a comment that could quietly go stale: identical cost and
  // Port Box footprint, strictly better range bands (Base Hit Chance is 5/4/3 short/med/long, so
  // a longer short band is a straight upgrade) and one extra Incapacitate on the damage row.
  const item = (id) => CHART.EQUIPMENT.filter((e) => e.id === id)[0];
  const wpn = (id) => WEAPONS.filter((w) => w.id === id)[0];
  check('SAR costs the same as the carbine', item('sar').cost === item('carb').cost);
  check('SAR occupies the same single Port Box', item('sar').boxes === item('carb').boxes);
  check('SAR short band reaches at least as far', wpn('sar').short[1] >= wpn('carb').short[1]);
  check('SAR medium band reaches at least as far', wpn('sar').med[1] >= wpn('carb').med[1]);
  check('SAR damage row is never worse, and better on a roll of 6', (function () {
    const order = 'PWIK'; // severity, worst-for-the-target last
    let neverWorse = true, betterSomewhere = false;
    for (let roll = 0; roll <= 9; roll++) {
      const a = order.indexOf(wpn('sar').dmg[9 - roll]);
      const b = order.indexOf(wpn('carb').dmg[9 - roll]);
      if (a < b) neverWorse = false;
      if (a > b) betterSomewhere = true;
    }
    return neverWorse && betterSomewhere;
  })());
}

// ---------------------------------------------------------------------
// distributeEquipment (Task #61, docs/33_PORT_BOX.md) — the real per-soldier Port Box / Ammo
// Box assignment, replacing the old "provisional, always 'carb'" placeholder.
// ---------------------------------------------------------------------
{
  function makeSoldiers(n, cmdrIdx) {
    var out = [];
    for (var i = 0; i < n; i++) out.push({ id: 'us' + i, isCommander: i === cmdrIdx });
    return out;
  }

  // Real-range case: plenty of WP for a rifle each, one BAR, and ammo/grenades left over.
  {
    const soldiers = makeSoldiers(6, 0);
    const bought = SG.autoBuyEquipment(48, 6, CHART);
    SG.distributeEquipment(soldiers, bought, CHART, EQ);

    check('distribute: every soldier armed when rifles were bought for all', soldiers.every(function (s) { return !!s.weaponId; }));
    check('distribute: exactly one soldier ends up with the BAR', soldiers.filter(function (s) { return s.weaponId === 'bar'; }).length === (bought.equipment.bar ? 1 : 0));
    check('distribute: the BAR carrier is the commander', !bought.equipment.bar || soldiers[0].weaponId === 'bar');
    check('distribute: every armed soldier carries their own weapon in a Port Box', soldiers.every(function (s) {
      return !s.weaponId || EQ.carriedItemIds(s.inventory).indexOf(s.weaponId) !== -1;
    }));
    check('distribute: every armed soldier has at least the free clip for their weapon', soldiers.every(function (s) {
      return !s.weaponId || EQ.hasAmmo(s.inventory, s.weaponId);
    }));
    check('distribute: no soldier exceeds 2 Port Boxes worth', soldiers.every(function (s) {
      return EQ.emptyPortBoxCount(s.inventory, s) >= 0;
    }));
    check('distribute: no soldier exceeds 6 Ammo Boxes', soldiers.every(function (s) {
      return s.inventory.ammoBoxes.filter(Boolean).length <= 6;
    }));
    const totalClipsCarried = soldiers.reduce(function (n, s) { return n + s.inventory.ammoBoxes.filter(function (id) { return id && id !== 'gren'; }).length; }, 0);
    check('distribute: total carried clips do not exceed what was bought (free ones + purchased)', totalClipsCarried <= soldiers.filter(function (s) { return s.weaponId; }).length + (bought.equipment.ammo || 0) * 5);
    // NOTE: the real WP range can buy far more ammo/grenades than 6 soldiers' Ammo Boxes can
    // physically hold (autoBuyEquipment spends every last WP with no carrying-capacity check of
    // its own) — a pre-existing property of the greedy heuristic, not something distribution
    // should paper over. Carried grenades are bounded by capacity, not necessarily equal to
    // what was bought.
    const totalGrenadesCarried = soldiers.reduce(function (n, s) { return n + s.inventory.ammoBoxes.filter(function (id) { return id === 'gren'; }).length; }, 0);
    check('distribute: does not carry more grenades than were bought', totalGrenadesCarried <= (bought.equipment.gren || 0) * 3);
    check('distribute: no soldier carries more than 6 Ammo Boxes worth total', soldiers.every(function (s) { return s.inventory.ammoBoxes.filter(Boolean).length <= 6; }));
  }

  // Task #63 (docs/35_GRENADE_COMBAT.md) regression: clips and grenades must be interleaved,
  // not clips-then-grenades — otherwise a purchase mix with far more clips than grenades (routine
  // at the real WP range) fills every Ammo Box with clips before a single grenade is placed, and
  // the squad never actually carries one.
  {
    const soldiers = makeSoldiers(4, 0);
    // Hand-built "bought" totals standing in for autoBuyEquipment's real output shape: way more
    // clip purchases than the squad could ever carry, but only a couple of grenade purchases.
    const bought = { equipment: { sar: 4, ammo: 20, gren: 2 }, spentWP: 0, remainingWP: 0 };
    SG.distributeEquipment(soldiers, bought, CHART, EQ);
    const grenadesCarried = soldiers.reduce(function (n, s) { return n + s.inventory.ammoBoxes.filter(function (id) { return id === 'gren'; }).length; }, 0);
    check('distribute: grenades still reach the squad even when massively outnumbered by clip purchases', grenadesCarried > 0);
    check('distribute: still respects the 6-box cap per soldier under interleaving', soldiers.every(function (s) { return s.inventory.ammoBoxes.filter(Boolean).length <= 6; }));
  }

  // Tight-budget case: not every soldier gets a rifle — distribute should say so honestly
  // rather than pretend, unlike the old placeholder.
  {
    const soldiers = makeSoldiers(6, 0);
    const bought = SG.autoBuyEquipment(3, 6, CHART); // buys 1 rifle only
    SG.distributeEquipment(soldiers, bought, CHART, EQ);
    check('distribute: tight budget leaves some soldiers unarmed rather than faking a rifle', soldiers.filter(function (s) { return !s.weaponId; }).length === 6 - bought.equipment.sar);
    check('distribute: unarmed soldiers carry nothing', soldiers.filter(function (s) { return !s.weaponId; }).every(function (s) { return EQ.carriedItemIds(s.inventory).length === 0; }));
  }
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

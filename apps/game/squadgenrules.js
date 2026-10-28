/*
 * squadgenrules.js — §4 Squad Generation (docs/31_VICTORY.md), Mission 1's "generate one of
 * your own" path
 *
 * Pure logic, no DOM. The rulebook's own Mission 1 setup text says a squad can either be a
 * pre-generated one printed in the physical booklet, or "generate one of your own" per §4 — both
 * explicitly sanctioned, not a fallback. This project doesn't have the printed pre-generated
 * squad transcribed anywhere, so it always generates one, using the real §4 procedure and real,
 * rulebook-verified tables (assets/data/squad_generation.js — the same relocation-from-trainer
 * precedent as ar_track.js/weapon_chart.js).
 *
 * Functions through `assignLetters` are the real §4 procedure, unchanged from the trainer's own
 * (already rulebook-verified) implementation. `autoBuySoldiers`/`autoBuyEquipment` are NOT
 * rulebook content — §4 assumes a human player negotiating a budget interactively; this project
 * doesn't have a squad-buying UI for the Mission 1 playthrough this was built for, so these are
 * a deliberate, documented JUDGMENT CALL: simple, deterministic greedy heuristics that always
 * produce a valid squad within budget. A future interactive buying screen wouldn't touch the
 * §4 procedure functions at all, only replace these two.
 */
(function () {
  'use strict';

  // ---- §4 steps 2-3: Squad/Weapon Quality ------------------------------------------
  function resolveSquadQuality(chart, roll) {
    var sp = chart.SQUAD_QUALITY[roll];
    if (sp === undefined) throw new Error('resolveSquadQuality: no entry for roll ' + roll);
    return sp;
  }
  function resolveWeaponQuality(chart, squadRoll, weaponRoll) {
    var sum = squadRoll + weaponRoll;
    var wp = chart.WEAPON_QUALITY[sum];
    if (wp === undefined) throw new Error('resolveWeaponQuality: no entry for sum ' + sum);
    return wp;
  }

  // ---- §4 steps 5-8: per-soldier ratings --------------------------------------------
  function resolvePC(chart, roll, inRating) {
    var row = chart.PERCEPTION_TABLE[roll];
    if (!row || row[inRating] === undefined) throw new Error('resolvePC: no entry for roll ' + roll + ', IN ' + inRating);
    return row[inRating];
  }
  function resolveWS(chart, roll, inRating) {
    var v = chart.WS_TABLE[roll + inRating];
    if (v === undefined) throw new Error('resolveWS: no entry for sum ' + (roll + inRating));
    return v;
  }
  function resolveDS(chart, roll, inRating) {
    var v = chart.DS_TABLE[roll + inRating];
    if (v === undefined) throw new Error('resolveDS: no entry for sum ' + (roll + inRating));
    return v;
  }
  function mpaForIN(chart, inRating) {
    var v = chart.MPA_BY_IN[inRating];
    if (v === undefined) throw new Error('mpaForIN: no entry for IN ' + inRating);
    return v;
  }

  // ---- §4 step 4 / roster rules: validity and letter assignment ---------------------
  // "§4: descending IN; soldier A = commander with the highest IN" (matches the trainer's own
  // verified sort, apps/trainer/index.html sortRoster()).
  function isValidSquad(soldiers) {
    return soldiers.length >= 4 && soldiers.some(function (s) { return s.isCommander; });
  }
  function assignLetters(soldiers, chart) {
    var sorted = soldiers.slice().sort(function (a, b) {
      if (b.IN !== a.IN) return b.IN - a.IN;
      return (b.isCommander ? 1 : 0) - (a.isCommander ? 1 : 0);
    });
    return sorted.map(function (s, i) { return Object.assign({}, s, { letter: chart.SQUAD_LETTERS[i] }); });
  }

  // ---- JUDGMENT CALL: auto-buy heuristics, not rulebook content ---------------------
  // Greedy, deterministic, always produces a valid squad (§4's own minimum: at least 4 soldiers,
  // at least one commander) within budget, capped at 8 (the Squad Record's letter slots A-H).
  // Prefers one commander first (cheapest that fits, since a squad only needs one to be valid),
  // then fills remaining budget with the highest-IN soldier still affordable, cheapest tie-break.
  function autoBuySoldiers(sp, chart) {
    var remaining = sp;
    var bought = [];
    var costTable = chart.SOLDIER_COST;

    var cheapestCommander = costTable.filter(function (t) { return t.cmdr; })
      .sort(function (a, b) { return a.cost - b.cost; })[0];
    bought.push(cheapestCommander);
    remaining -= cheapestCommander.cost;

    // IN 0 costs 0 Squad Points — always available, so the §4 minimum (>=4 soldiers) is always
    // reachable for free even on a tight budget; used only as a last-resort filler, never
    // preferred over an actually-affordable higher-IN pick.
    var zeroCostFiller = costTable.filter(function (t) { return t.cost === 0; })[0];
    // REAL BUG, fixed: this list used to include commander entries, so the "highest IN still
    // affordable" fill below immediately bought a SECOND commander — an IN 5 commander at 21 SP —
    // as its first filler pick, at four times the cost of the IN 3 non-commander (5 SP) that the
    // heuristic's own doc comment says it should prefer. The result was that nine of the ten real
    // Squad Quality rolls produced a squad of exactly FOUR soldiers, two or three of them
    // redundant commanders, when the same points buy seven or eight. That mattered well beyond
    // raw firepower: Mission 1's Ending 1 requires four separate hexes (T8, K13, L13, a heights
    // hex) occupied simultaneously, so a four-man squad could not accomplish the scoring ending
    // at all after a single casualty. A squad only needs one commander to be valid (isValidSquad
    // above), so the fill list is non-commanders only — matching what this function always
    // claimed to do.
    var byINDesc = costTable.filter(function (t) { return !t.cmdr; })
      .sort(function (a, b) { return b.in - a.in || a.cost - b.cost; });

    var guard = 0;
    while (bought.length < 8 && guard < 100) {
      guard++;
      var affordable = byINDesc.filter(function (t) { return t.cost > 0 && t.cost <= remaining; });
      if (affordable.length) {
        bought.push(affordable[0]);
        remaining -= affordable[0].cost;
      } else if (bought.length < 4 && zeroCostFiller) {
        bought.push(zeroCostFiller);
      } else {
        break;
      }
    }

    if (!isValidSquad(bought.map(function (t) { return { IN: t.in, isCommander: t.cmdr }; }))) {
      throw new Error('autoBuySoldiers: could not assemble a valid squad (>=4 soldiers, >=1 commander) with ' + sp + ' Squad Points');
    }
    return { soldiers: bought, spentSP: sp - remaining, remainingSP: remaining };
  }

  // The squad's standard-issue personal weapon. This used to be the carbine, described here as
  // the "cheapest reliable option" — but the SAR (M1 rifle) costs exactly the same 2 Weapon
  // Points, occupies the same single Port Box, and takes the same ammo/jam values, while being
  // strictly better on both axes that matter (weapon_chart.js):
  //   range   carb short 2-5 / med 6-11 / long 12+   vs   sar short 2-6 / med 7-14 / long 15+
  //           — the SAR's better band covers every hex the carbine's does and then some, and
  //             Base Hit Chance is 5/4/3 by band, so a longer short band is a straight upgrade
  //   damage  carb KIIWWWWWPP  vs  sar KIIIWWWWPP    — identical except a damage roll of 6,
  //           which wounds with a carbine and incapacitates with a SAR
  // There is no distance and no die roll at which the carbine is the better buy, so the old pick
  // was simply leaving free capability on the table. (It's also the more historically apt weapon
  // for a 1944 US rifle squad, though that isn't why it changed.) Named rather than inlined so
  // the two places that must agree — what gets bought, and what gets handed out in
  // distributeEquipment — can never drift apart again.
  var STANDARD_WEAPON_ID = 'sar';

  // Ensures every soldier has a personal weapon before spending anything else, then fills
  // remaining Weapon Points on ammo and grenades in rotation, splurging on one automatic weapon
  // (BAR) if there's enough left over for it.
  function autoBuyEquipment(wp, soldierCount, chart) {
    var remaining = wp;
    var bought = {};
    function buy(id, times) {
      var item = chart.EQUIPMENT.filter(function (e) { return e.id === id; })[0];
      if (!item) throw new Error('autoBuyEquipment: unknown equipment id "' + id + '"');
      for (var i = 0; i < (times || 1); i++) {
        if (item.cost > remaining) break;
        remaining -= item.cost;
        bought[id] = (bought[id] || 0) + 1;
      }
    }

    buy(STANDARD_WEAPON_ID, soldierCount);
    if (remaining >= chart.EQUIPMENT.filter(function (e) { return e.id === 'bar'; })[0].cost) buy('bar', 1);
    var guard = 0;
    while (remaining > 0 && guard < 200) {
      guard++;
      var before = remaining;
      buy('ammo', 1);
      buy('gren', 1);
      if (remaining === before) break; // nothing left affordable
    }
    return { equipment: bought, spentWP: wp - remaining, remainingWP: remaining };
  }

  // ---- Task #61 (docs/33_PORT_BOX.md): assign the aggregate purchase from autoBuyEquipment to
  // real per-soldier Port Boxes / Ammo Boxes -----------------------------------------------
  //
  // Not rulebook content by itself (same JUDGMENT CALL status as autoBuySoldiers/autoBuyEquipment
  // above — §4 assumes a human deciding who carries what); this is the deterministic assignment
  // this project's auto-buy path needs. The actual box mechanics it calls
  // (stow/drop/capacity/wound-loss) ARE the real §2/15/§9/5/§13/2 rules, in equipmentrules.js.
  //
  // Mutates and returns `soldiers`: gives each a `.inventory` (apps/game/equipmentrules.js shape)
  // and sets `.weaponId` for real, replacing the old "provisional, always 'carb'" placeholder.
  function distributeEquipment(soldiers, bought, chart, EQ) {
    function boxesFor(id) {
      var item = chart.EQUIPMENT.filter(function (e) { return e.id === id; })[0];
      if (!item) throw new Error('distributeEquipment: unknown equipment id "' + id + '"');
      return item.boxes;
    }
    function unitsFor(id) {
      var item = chart.EQUIPMENT.filter(function (e) { return e.id === id; })[0];
      if (!item) throw new Error('distributeEquipment: unknown equipment id "' + id + '"');
      return item.unitsPerPurchase || 1;
    }
    var rifleBought = bought.equipment[STANDARD_WEAPON_ID] || 0;
    soldiers.forEach(function (s, i) {
      s.inventory = EQ.createInventory();
      // §4/9: not every purchase necessarily reaches every soldier (an artificially tight
      // budget can leave a soldier unarmed) — honest about it rather than pretending, per this
      // project's standing convention of flagging gaps instead of silently guessing.
      if (i < rifleBought) {
        EQ.stowItem(s.inventory, s, STANDARD_WEAPON_ID, boxesFor(STANDARD_WEAPON_ID));
        s.weaponId = STANDARD_WEAPON_ID;
        EQ.stowAmmo(s.inventory, STANDARD_WEAPON_ID); // §4/9: "each weapon... comes with one free ammo clip"
      } else {
        s.weaponId = null;
      }
    });

    // BAR upgrade: swap one soldier's rifle for the squad's single purchasable BAR (mirrors
    // the pre-existing "commander gets it" special case in mission1demo.js's buyEquipment()).
    if (bought.equipment.bar) {
      var cmdr = soldiers.filter(function (s) { return s.isCommander; })[0] || soldiers[0];
      if (EQ.carriedItemIds(cmdr.inventory).indexOf(STANDARD_WEAPON_ID) !== -1) {
        EQ.dropItem(cmdr.inventory, STANDARD_WEAPON_ID);
        EQ.expendAmmo(cmdr.inventory, STANDARD_WEAPON_ID);
      }
      if (EQ.stowItem(cmdr.inventory, cmdr, 'bar', boxesFor('bar'))) {
        cmdr.weaponId = 'bar';
        EQ.stowAmmo(cmdr.inventory, 'bar');
      }
    }

    // §9/5 additional clips (beyond the free one, typed to match each soldier's own weapon —
    // "clips are not interchangeable," so an unarmed soldier gets none) + §10 grenades
    // (untyped, anyone with a free Ammo Box) — interleaved one-of-each-per-soldier-per-pass,
    // NOT clips-then-grenades. Found live while wiring Task #63 (docs/35_GRENADE_COMBAT.md):
    // the real WP range routinely buys far more ammo than grenades in raw purchase count
    // (autoBuyEquipment has no carrying-capacity awareness at all, docs/33_PORT_BOX.md §4), so a
    // sequential clips-first pass filled every Ammo Box in the squad before a single grenade
    // ever got placed — grenade combat would have shipped with the squad never actually carrying
    // one in ordinary play. Interleaving gives grenades a fair shot at whatever capacity exists
    // instead of losing a priority race they were never meant to lose.
    var clipsRemaining = (bought.equipment.ammo || 0) * unitsFor('ammo');
    var grenadesRemaining = (bought.equipment.gren || 0) * unitsFor('gren');
    var guard = 0, cap = (clipsRemaining + grenadesRemaining) * (soldiers.length || 1) + soldiers.length + 1;
    while ((clipsRemaining > 0 || grenadesRemaining > 0) && guard < cap) {
      guard++;
      var progressed = false;
      soldiers.forEach(function (s) {
        if (clipsRemaining > 0 && s.weaponId && EQ.stowAmmo(s.inventory, s.weaponId)) { clipsRemaining--; progressed = true; }
        if (grenadesRemaining > 0 && EQ.stowAmmo(s.inventory, 'gren')) { grenadesRemaining--; progressed = true; }
      });
      if (!progressed) break; // no soldier has room left for either
    }

    return soldiers;
  }

  window.AmbushSquadGen = {
    resolveSquadQuality: resolveSquadQuality,
    resolveWeaponQuality: resolveWeaponQuality,
    resolvePC: resolvePC,
    resolveWS: resolveWS,
    resolveDS: resolveDS,
    mpaForIN: mpaForIN,
    isValidSquad: isValidSquad,
    assignLetters: assignLetters,
    autoBuySoldiers: autoBuySoldiers,
    autoBuyEquipment: autoBuyEquipment,
    distributeEquipment: distributeEquipment,
  };
})();

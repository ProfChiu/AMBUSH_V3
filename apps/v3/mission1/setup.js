// mission1/setup.js (5 of 13) — section 4 squad generation, entry placement. Stage A cut of mission1.js lines 1582-1795 (docs/REFACTOR_MAP.md 5.4).
// Exports to M1 (3): placeNextSoldier, promptPlaceSoldier, startSquadGeneration
// Uses from M1:
//   core: D, ENTRY_HEXES, EQ, SG, SQCHART, img, state
//   present: d10, fmtSigned, infoPopup, logLine, rollPopup
//   roster: canvas, entryEls, makeCounter, placeEl, renderRoster, updateCounterVisual
//   operations: startOperations
(function () {
  'use strict';
  var M1 = window.AmbushM1;
  // Exported functions (hoisted, so they are on M1 before any line below runs).
  M1.placeNextSoldier = placeNextSoldier; M1.promptPlaceSoldier = promptPlaceSoldier;
  M1.startSquadGeneration = startSquadGeneration;
  // ---------------------------------------------------------------------
  // §4 Squad Generation — real procedure, auto-buy heuristic for the actual choices (see header)
  // ---------------------------------------------------------------------
  function startSquadGeneration() {
    M1.infoPopup({ title: 'Squad Generation', bodyHtml: 'Rolling to determine your squad\'s quality and equipment (§4).' }, function () {
      rollSquadQuality();
    });
  }
  // Easy mode rolls §4's generation dice twice and keeps the better OUTCOME (difficulty.js
  // chooseBest). Both dice are shown, and the pop-up says which was kept and why — the rule is
  // that Easy never hides a die. Scoring by outcome rather than by the raw number matters here:
  // Squad Points rise with the die, but Weapon Points FALL as the Squad+Weapon sum rises, so the
  // "better" die is the high one in the first case and the low one in the second.
  //
  // `kind: 'dual'` reuses the two-dice tray the Initiative roll already uses; on Normal
  // (squadRolls === 1) the single-die path is unchanged.
  function easyRollPopup(opts, cb) {
    var n = M1.D.squadRolls(M1.state.difficulty);
    if (n < 2) {
      M1.rollPopup({
        title: opts.title, kind: 'single', contextHtml: opts.contextHtml,
        explain: function (roll) { return opts.explain(roll); },
        logText: function (roll) { return opts.logText(roll); },
      }, function (roll) { cb(roll); });
      return;
    }
    M1.rollPopup({
      title: opts.title + ' (Easy — best of two)', kind: 'dual', diceLabels: ['ROLL 1', 'ROLL 2'],
      contextHtml: opts.contextHtml + '<br>Easy mode rolls twice and keeps the better result.',
      explain: function (rolls) {
        var best = M1.D.chooseBest([rolls.a, rolls.b], opts.valueOf);
        var other = best.index === 0 ? rolls.b : rolls.a;
        return opts.explain(best.roll) + '<br><span style="color:var(--text-label);">Kept the ' +
          (best.index === 0 ? 'first' : 'second') + ' die (' + best.roll + '); the other (' + other +
          ') would have given ' + opts.valueOf(other) + '.</span>';
      },
      logText: function (rolls) {
        var best = M1.D.chooseBest([rolls.a, rolls.b], opts.valueOf);
        return opts.title + ' (easy, best of two): <span class="roll">' + rolls.a + '</span> / <span class="roll">' +
          rolls.b + '</span> &rarr; kept ' + best.roll + '. ' + opts.logText(best.roll);
      },
    }, function (rolls) { cb(M1.D.chooseBest([rolls.a, rolls.b], opts.valueOf).roll); });
  }

  function rollSquadQuality() {
    easyRollPopup({
      title: 'Squad Quality',
      contextHtml: 'Roll one die to determine Squad Points.',
      valueOf: function (roll) { return M1.SG.resolveSquadQuality(M1.SQCHART, roll); },
      explain: function (roll) { return 'Squad Points: <b>' + M1.SG.resolveSquadQuality(M1.SQCHART, roll) + '</b>.'; },
      logText: function (roll) { return 'Squad Quality roll: <span class="roll">' + roll + '</span> &rarr; ' + M1.SG.resolveSquadQuality(M1.SQCHART, roll) + ' Squad Points.'; },
    }, function (roll) {
      rollWeaponQuality(roll, M1.SG.resolveSquadQuality(M1.SQCHART, roll));
    });
  }
  function rollWeaponQuality(squadRoll, sp) {
    easyRollPopup({
      title: 'Weapon Quality',
      contextHtml: 'Roll one die, add it to the Squad Quality roll (' + squadRoll + ').',
      valueOf: function (roll) { return M1.SG.resolveWeaponQuality(M1.SQCHART, squadRoll, roll); },
      explain: function (roll) { return 'Weapon Points: <b>' + M1.SG.resolveWeaponQuality(M1.SQCHART, squadRoll, roll) + '</b>.'; },
      logText: function (roll) { return 'Weapon Quality roll: <span class="roll">' + roll + '</span> (+' + squadRoll + ') &rarr; ' + M1.SG.resolveWeaponQuality(M1.SQCHART, squadRoll, roll) + ' Weapon Points.'; },
    }, function (roll) {
      var wp = M1.SG.resolveWeaponQuality(M1.SQCHART, squadRoll, roll);
      buySquad(sp, wp);
    });
  }
  function buySquad(sp, wp) {
    var bought = M1.SG.autoBuySoldiers(sp, M1.SQCHART);
    var lettered = M1.SG.assignLetters(bought.soldiers.map(function (t, i) {
      return { IN: t.in, isCommander: t.cmdr, mpa: M1.SG.mpaForIN(M1.SQCHART, t.in) };
    }), M1.SQCHART);
    var names = M1.SQCHART.DEFAULT_NAMES.slice();
    lettered.forEach(function (s, i) {
      s.id = 'us' + i;
      s.name = 'Pvt. ' + names[i];
      s.side = 'US';
      s.img = M1.img('soldiers/us_soldier_' + s.letter + '_standing.png');
      s.imgCrouch = M1.img('soldiers/us_soldier_' + s.letter + '_crouching.png');
      s.stance = 'standing';
      s.mpRemaining = s.mpa;
      s.usedFreeStanceChange = false;
      s.wounded = false; s.status = 'unharmed'; s.isActive = true; s.exited = false;
      s.aware = false; // §6/5 US Awareness — reset for real at the start of every fresh Rounds sequence
      s.hexId = null;
      s.weaponId = null; // set for real by distributeEquipment() once Weapon Points resolve below
      // Task #69 (docs/43_PREPARE_WEAPON.md): irrelevant while weaponId is a personal weapon
      // (WEAPONS_REQUIRING_PREPARATION never gates those), but set the real starting state now
      // in case this soldier ever picks up a crew weapon later (Pick Up/Exchange Equipment,
      // Task #68) — a newly acquired one always starts unprepared.
      s.weaponPrepared = false;
    });
    M1.state.usSoldiers = lettered;

    M1.infoPopup({
      title: 'Squad Assembled', bodyHtml: M1.state.usSoldiers.length + ' soldiers bought for ' + bought.spentSP + '/' + sp + ' Squad Points: ' +
        M1.state.usSoldiers.map(function (s) { return s.letter + ' (IN ' + s.IN + (s.isCommander ? ', Commander' : '') + ')'; }).join(', ') + '.',
    }, function () {
      rollRatingsSequentially(0, wp);
    });
  }
  function rollRatingsSequentially(i, wp) {
    if (i >= M1.state.usSoldiers.length) { buyEquipment(wp); return; }
    var s = M1.state.usSoldiers[i];
    M1.rollPopup({
      actor: s, title: 'Ratings — ' + s.name, kind: 'single',
      contextHtml: 'Rolling Perception, Weapon Skill, and Driving Skill for ' + s.letter + ' (IN ' + s.IN + ').',
      explain: function (roll) {
        // Each rating takes the better of N rolls on Easy (N == 1 on Normal, so the behaviour is
        // unchanged there). Every roll is named in the text, including the Weapon Skill and
        // Driving Skill dice, which were previously rolled without ever being shown — the
        // standing rule is that the player sees the machinery, and these were part of it.
        function rated(firstRoll, resolve) {
            var rolls = [firstRoll];
            for (var k = 1; k < M1.D.squadRolls(M1.state.difficulty); k++) rolls.push(M1.d10());
            var best = M1.D.chooseBest(rolls, resolve);
            return { value: best.value, rolls: rolls, kept: best.roll };
        }
        var pc = rated(roll, function (r) { return M1.SG.resolvePC(M1.SQCHART, r, s.IN); });
        var ws = rated(M1.d10(), function (r) { return M1.SG.resolveWS(M1.SQCHART, r, s.IN); });
        var ds = rated(M1.d10(), function (r) { return M1.SG.resolveDS(M1.SQCHART, r, s.IN); });
        s.PC = pc.value; s.WS = ws.value; s.DS = ds.value;
        function shown(label, r) {
          return r.rolls.length > 1
            ? label + ' rolled ' + r.rolls.join(' / ') + ', kept ' + r.kept
            : label + ' rolled ' + r.rolls[0];
        }
        return 'PC <b>' + s.PC + '</b> &middot; WS <b>' + M1.fmtSigned(s.WS) + '</b> &middot; DS <b>' + s.DS +
          '</b> &middot; MPA <b>' + s.mpa + '</b>.' +
          '<br><span style="color:var(--text-label); font-size:12px;">' +
          [shown('PC', pc), shown('WS', ws), shown('DS', ds)].join(' &middot; ') + '</span>';
      },
      logText: function () { return s.letter + ' ' + s.name + ': PC ' + s.PC + ', WS ' + M1.fmtSigned(s.WS) + ', DS ' + s.DS + ', MPA ' + s.mpa + '.'; },
    }, function () { rollRatingsSequentially(i + 1, wp); });
  }
  function buyEquipment(wp) {
    var bought = M1.SG.autoBuyEquipment(wp, M1.state.usSoldiers.length, M1.SQCHART);
    // Task #61 (docs/33_PORT_BOX.md): assign the aggregate purchase to real per-soldier Port
    // Boxes / Ammo Boxes — this is also where the BAR-to-commander swap actually happens now,
    // via equipmentrules.js's stow/drop rather than just overwriting weaponId.
    M1.SG.distributeEquipment(M1.state.usSoldiers, bought, M1.SQCHART, M1.EQ);
    M1.infoPopup({
      title: 'Equipment', bodyHtml: 'Spent ' + bought.spentWP + '/' + wp + ' Weapon Points: ' +
        Object.keys(bought.equipment).map(function (id) { return bought.equipment[id] + '&times; ' + id; }).join(', ') + '.',
    }, function () {
      M1.renderRoster();
      startEntryPlacement();
    });
  }

  // ---------------------------------------------------------------------
  // Entry placement — "Your soldiers can enter the map in any hexes on the north edge between
  // A1 and J1 (inclusive)."
  // ---------------------------------------------------------------------
  function startEntryPlacement() {
    M1.state.phase = 'entry';
    document.getElementById('tb-phase').textContent = 'Entry Placement';
    document.getElementById('roster-sec').style.display = '';
    M1.ENTRY_HEXES.forEach(function (hexId) {
      var el = document.createElement('div');
      el.className = 'entry-hex';
      M1.placeEl(el, hexId);
      el.title = hexId;
      el.addEventListener('click', function (e) { e.stopPropagation(); placeNextSoldier(hexId); });
      M1.canvas.appendChild(el);
      M1.entryEls[hexId] = el;
    });
    promptPlaceSoldier();
  }
  // Directs a real gameplay decision (where to place this soldier), so it gets its own popup —
  // Dialogs' full-screen backdrop already blocks the entry-hex markers underneath while it's open,
  // so no extra click-guard is needed.
  function promptPlaceSoldier() {
    var s = M1.state.usSoldiers[M1.state.entryIndex];
    document.getElementById('status-banner').textContent = 'Place ' + s.name + ' on the north edge (A1-J1).';
    M1.infoPopup({ actor: s, title: 'Entry Placement', bodyHtml: 'Place ' + s.name + ' on the north edge (A1&ndash;J1).' });
  }
  function placeNextSoldier(hexId) {
    if (M1.state.entryIndex >= M1.state.usSoldiers.length) return;
    var s = M1.state.usSoldiers[M1.state.entryIndex];
    s.hexId = hexId;
    M1.makeCounter(s, hexId);
    M1.updateCounterVisual(s);
    M1.logLine(s.name + ' enters the map at ' + hexId + '.');
    M1.state.entryIndex++;
    if (M1.state.entryIndex >= M1.state.usSoldiers.length) {
      Object.keys(M1.entryEls).forEach(function (id) { M1.entryEls[id].remove(); });
      M1.startOperations();
    } else {
      promptPlaceSoldier();
    }
  }
})();

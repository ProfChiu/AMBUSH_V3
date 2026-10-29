'use strict';
// mission1/setup.js (5 of 13) — section 4 squad generation, entry placement. Stage A cut of mission1.js lines 1582-1795 (docs/REFACTOR_MAP.md 5.4).
  // ---------------------------------------------------------------------
  // §4 Squad Generation — real procedure, auto-buy heuristic for the actual choices (see header)
  // ---------------------------------------------------------------------
  function startSquadGeneration() {
    infoPopup({ title: 'Squad Generation', bodyHtml: 'Rolling to determine your squad\'s quality and equipment (§4).' }, function () {
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
    var n = D.squadRolls(difficulty);
    if (n < 2) {
      rollPopup({
        title: opts.title, kind: 'single', contextHtml: opts.contextHtml,
        explain: function (roll) { return opts.explain(roll); },
        logText: function (roll) { return opts.logText(roll); },
      }, function (roll) { cb(roll); });
      return;
    }
    rollPopup({
      title: opts.title + ' (Easy — best of two)', kind: 'dual', diceLabels: ['ROLL 1', 'ROLL 2'],
      contextHtml: opts.contextHtml + '<br>Easy mode rolls twice and keeps the better result.',
      explain: function (rolls) {
        var best = D.chooseBest([rolls.a, rolls.b], opts.valueOf);
        var other = best.index === 0 ? rolls.b : rolls.a;
        return opts.explain(best.roll) + '<br><span style="color:var(--text-label);">Kept the ' +
          (best.index === 0 ? 'first' : 'second') + ' die (' + best.roll + '); the other (' + other +
          ') would have given ' + opts.valueOf(other) + '.</span>';
      },
      logText: function (rolls) {
        var best = D.chooseBest([rolls.a, rolls.b], opts.valueOf);
        return opts.title + ' (easy, best of two): <span class="roll">' + rolls.a + '</span> / <span class="roll">' +
          rolls.b + '</span> &rarr; kept ' + best.roll + '. ' + opts.logText(best.roll);
      },
    }, function (rolls) { cb(D.chooseBest([rolls.a, rolls.b], opts.valueOf).roll); });
  }

  function rollSquadQuality() {
    easyRollPopup({
      title: 'Squad Quality',
      contextHtml: 'Roll one die to determine Squad Points.',
      valueOf: function (roll) { return SG.resolveSquadQuality(SQCHART, roll); },
      explain: function (roll) { return 'Squad Points: <b>' + SG.resolveSquadQuality(SQCHART, roll) + '</b>.'; },
      logText: function (roll) { return 'Squad Quality roll: <span class="roll">' + roll + '</span> &rarr; ' + SG.resolveSquadQuality(SQCHART, roll) + ' Squad Points.'; },
    }, function (roll) {
      rollWeaponQuality(roll, SG.resolveSquadQuality(SQCHART, roll));
    });
  }
  function rollWeaponQuality(squadRoll, sp) {
    easyRollPopup({
      title: 'Weapon Quality',
      contextHtml: 'Roll one die, add it to the Squad Quality roll (' + squadRoll + ').',
      valueOf: function (roll) { return SG.resolveWeaponQuality(SQCHART, squadRoll, roll); },
      explain: function (roll) { return 'Weapon Points: <b>' + SG.resolveWeaponQuality(SQCHART, squadRoll, roll) + '</b>.'; },
      logText: function (roll) { return 'Weapon Quality roll: <span class="roll">' + roll + '</span> (+' + squadRoll + ') &rarr; ' + SG.resolveWeaponQuality(SQCHART, squadRoll, roll) + ' Weapon Points.'; },
    }, function (roll) {
      var wp = SG.resolveWeaponQuality(SQCHART, squadRoll, roll);
      buySquad(sp, wp);
    });
  }
  function buySquad(sp, wp) {
    var bought = SG.autoBuySoldiers(sp, SQCHART);
    var lettered = SG.assignLetters(bought.soldiers.map(function (t, i) {
      return { IN: t.in, isCommander: t.cmdr, mpa: SG.mpaForIN(SQCHART, t.in) };
    }), SQCHART);
    var names = SQCHART.DEFAULT_NAMES.slice();
    lettered.forEach(function (s, i) {
      s.id = 'us' + i;
      s.name = 'Pvt. ' + names[i];
      s.side = 'US';
      s.img = img('soldiers/us_soldier_' + s.letter + '_standing.png');
      s.imgCrouch = img('soldiers/us_soldier_' + s.letter + '_crouching.png');
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
    usSoldiers = lettered;

    infoPopup({
      title: 'Squad Assembled', bodyHtml: usSoldiers.length + ' soldiers bought for ' + bought.spentSP + '/' + sp + ' Squad Points: ' +
        usSoldiers.map(function (s) { return s.letter + ' (IN ' + s.IN + (s.isCommander ? ', Commander' : '') + ')'; }).join(', ') + '.',
    }, function () {
      rollRatingsSequentially(0, wp);
    });
  }
  function rollRatingsSequentially(i, wp) {
    if (i >= usSoldiers.length) { buyEquipment(wp); return; }
    var s = usSoldiers[i];
    rollPopup({
      actor: s, title: 'Ratings — ' + s.name, kind: 'single',
      contextHtml: 'Rolling Perception, Weapon Skill, and Driving Skill for ' + s.letter + ' (IN ' + s.IN + ').',
      explain: function (roll) {
        // Each rating takes the better of N rolls on Easy (N == 1 on Normal, so the behaviour is
        // unchanged there). Every roll is named in the text, including the Weapon Skill and
        // Driving Skill dice, which were previously rolled without ever being shown — the
        // standing rule is that the player sees the machinery, and these were part of it.
        function rated(firstRoll, resolve) {
            var rolls = [firstRoll];
            for (var k = 1; k < D.squadRolls(difficulty); k++) rolls.push(d10());
            var best = D.chooseBest(rolls, resolve);
            return { value: best.value, rolls: rolls, kept: best.roll };
        }
        var pc = rated(roll, function (r) { return SG.resolvePC(SQCHART, r, s.IN); });
        var ws = rated(d10(), function (r) { return SG.resolveWS(SQCHART, r, s.IN); });
        var ds = rated(d10(), function (r) { return SG.resolveDS(SQCHART, r, s.IN); });
        s.PC = pc.value; s.WS = ws.value; s.DS = ds.value;
        function shown(label, r) {
          return r.rolls.length > 1
            ? label + ' rolled ' + r.rolls.join(' / ') + ', kept ' + r.kept
            : label + ' rolled ' + r.rolls[0];
        }
        return 'PC <b>' + s.PC + '</b> &middot; WS <b>' + fmtSigned(s.WS) + '</b> &middot; DS <b>' + s.DS +
          '</b> &middot; MPA <b>' + s.mpa + '</b>.' +
          '<br><span style="color:var(--text-label); font-size:12px;">' +
          [shown('PC', pc), shown('WS', ws), shown('DS', ds)].join(' &middot; ') + '</span>';
      },
      logText: function () { return s.letter + ' ' + s.name + ': PC ' + s.PC + ', WS ' + fmtSigned(s.WS) + ', DS ' + s.DS + ', MPA ' + s.mpa + '.'; },
    }, function () { rollRatingsSequentially(i + 1, wp); });
  }
  function buyEquipment(wp) {
    var bought = SG.autoBuyEquipment(wp, usSoldiers.length, SQCHART);
    // Task #61 (docs/33_PORT_BOX.md): assign the aggregate purchase to real per-soldier Port
    // Boxes / Ammo Boxes — this is also where the BAR-to-commander swap actually happens now,
    // via equipmentrules.js's stow/drop rather than just overwriting weaponId.
    SG.distributeEquipment(usSoldiers, bought, SQCHART, EQ);
    infoPopup({
      title: 'Equipment', bodyHtml: 'Spent ' + bought.spentWP + '/' + wp + ' Weapon Points: ' +
        Object.keys(bought.equipment).map(function (id) { return bought.equipment[id] + '&times; ' + id; }).join(', ') + '.',
    }, function () {
      renderRoster();
      startEntryPlacement();
    });
  }

  // ---------------------------------------------------------------------
  // Entry placement — "Your soldiers can enter the map in any hexes on the north edge between
  // A1 and J1 (inclusive)."
  // ---------------------------------------------------------------------
  var entryIndex = 0;
  function startEntryPlacement() {
    phase = 'entry';
    document.getElementById('tb-phase').textContent = 'Entry Placement';
    document.getElementById('roster-sec').style.display = '';
    ENTRY_HEXES.forEach(function (hexId) {
      var el = document.createElement('div');
      el.className = 'entry-hex';
      placeEl(el, hexId);
      el.title = hexId;
      el.addEventListener('click', function (e) { e.stopPropagation(); placeNextSoldier(hexId); });
      canvas.appendChild(el);
      entryEls[hexId] = el;
    });
    promptPlaceSoldier();
  }
  // Directs a real gameplay decision (where to place this soldier), so it gets its own popup —
  // Dialogs' full-screen backdrop already blocks the entry-hex markers underneath while it's open,
  // so no extra click-guard is needed.
  function promptPlaceSoldier() {
    var s = usSoldiers[entryIndex];
    document.getElementById('status-banner').textContent = 'Place ' + s.name + ' on the north edge (A1-J1).';
    infoPopup({ actor: s, title: 'Entry Placement', bodyHtml: 'Place ' + s.name + ' on the north edge (A1&ndash;J1).' });
  }
  function placeNextSoldier(hexId) {
    if (entryIndex >= usSoldiers.length) return;
    var s = usSoldiers[entryIndex];
    s.hexId = hexId;
    makeCounter(s, hexId);
    updateCounterVisual(s);
    logLine(s.name + ' enters the map at ' + hexId + '.');
    entryIndex++;
    if (entryIndex >= usSoldiers.length) {
      Object.keys(entryEls).forEach(function (id) { entryEls[id].remove(); });
      startOperations();
    } else {
      promptPlaceSoldier();
    }
  }


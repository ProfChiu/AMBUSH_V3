'use strict';
// mission1/rounds.js (8 of 13) — Action Round start, events, awareness, initiative, track, turns, action panel. Stage A cut of mission1.js lines 2881-3467 (docs/REFACTOR_MAP.md 5.4).
  // ---------------------------------------------------------------------
  // Action Round
  // ---------------------------------------------------------------------
  function startActionRound(n) {
    walking = null; // a walk interrupted by Rounds commencing is over, and its continuation
    M1.state.phase = 'round';
    M1.state.roundNum = n;
    // §9/7's "a maximum of two soldiers can fire a single crew weapon in one Round" is a per-Round
    // cap, so it is cleared here with the Round, not per turn.
    M1.state.usSoldiers.forEach(function (s) { s.crewFiredBy = []; });
    allGermans().forEach(function (g) { g.crewFiredBy = []; });
    document.getElementById('tb-phase').textContent = 'Action Round ' + n;
    if (n === 1) Cues.banner('phase', 'Contact!', 'Action Round 1', 'alert'); else Cues.banner('phase', 'Action Round ' + n);
    document.getElementById('status-banner').textContent = 'Contact! Action Round in progress.';
    document.getElementById('status-banner').className = '';
    document.getElementById('movement-sec').style.display = 'none';
    document.getElementById('round-sec').style.display = 'none';
    clearDestMarks();

    // §6/5: "When Rounds end and you return to Operations, all US soldiers are again considered
    // unaware." startActionRound(1) is called exactly once per fresh Rounds sequence (never
    // again while already mid-Round — see activateGermansSequentially's own comment), so it's
    // the one safe place to reset everyone for real.
    if (n === 1) M1.state.usSoldiers.forEach(function (s) { s.aware = false; });
    // "The US soldier who just made his PC check is automatically aware" (289, 312, 316, 333,
    // 602, 606): aware before the Awareness Phase, so he skips its check and is placed normally.
    if (n === 1 && pendingContact) {
      pendingContact.awareIds.forEach(function (id) {
        var s = findSoldier(id);
        if (!s || !s.isActive) return;
        s.aware = true;
        logLine(s.name + ' made the PC check and is automatically aware (paragraph ' + pendingContact.paragraph + ').');
      });
    }

    infoPopup({ title: 'Round ' + n, bodyHtml: 'Round ' + n + ' begins.' + (n <= 2 ? ' Determining US Awareness.' : '') }, function () {
      runAwarenessPhase(n, function () { runEventPhase(n, function () { rollInitiativeAdvantage(n); }); });
    });
  }

  // ---------------------------------------------------------------------
  // §6/1 step 2 Rounds Event Phase — "Not conducted in Round 1." One Event Check per Round,
  // resolved "in the same way as an Event Check during Operations (5/6)" — same RE-column
  // mechanism, reused via Ops.roundEventCheck. Unlike Operations' per-hex version, this isn't
  // tied to any soldier's move, so there's no natural "mover" for the resulting pop-ups' actor
  // portrait or for a `check` op's default PC rating — reuses activeUS()[0] as the stand-in,
  // the same judgment call runConditionChange already makes for its own per-hex PC Checks
  // (operationsloop.js's ctx has no concept of "whose PC" for a check with no specific soldier).
  // Reuses the exact same pendingSteps/presentParagraphChain display pipeline as every other
  // paragraph-driven pop-up chain — event_roll shows first (queued below, matching
  // runParagraphCheck's own rollForEvent), then the resulting paragraph and its effects, if any.
  function runEventPhase(n, next) {
    if (n === 1) { next(); return; } // "Not conducted in Round 1"
    var mover = activeUS()[0];
    if (!mover) { next(); return; } // no active US soldier left — the mission has surely ended by now
    pendingSteps = []; currentHex = null; currentParagraph = null;
    var ctx = buildOpsCtx(mover);
    var result = Ops.roundEventCheck({
      mission: '1', missionCards: MISSION_CARDS, condition: M1.state.opsState.condition, paragraphs: PARAGRAPHS,
      programs: PROGRAMS, state: M1.state.opsState, ctx: ctx,
      rollForEvent: function () {
        var a = d10(), b = d10();
        pendingSteps.push({ type: 'event_roll', hex: null, paragraph: null, a: a, b: b, sum: a + b });
        return a + b;
      },
    });
    presentParagraphChain(mover, result.chain, null, next);
  }

  // ---------------------------------------------------------------------
  // §6/1 step 1 / §6/5 US Soldier Awareness — Rounds 1 and 2 only; automatic from Round 3.
  // ---------------------------------------------------------------------
  function runAwarenessPhase(n, next) {
    if (n > 2) {
      // "Round 3 and after, all active US soldiers are automatically aware, regardless of their
      // location" — no check, no Awareness Phase step at all (§6/1 step 1 is "Rounds 1 and 2
      // only"), so unlike the Round 1/2 checks below, this grants a full normal turn this Round,
      // not the Complete-only placement a just-passed check gets.
      var awakened = activeUS().filter(function (s) { return !s.aware; });
      awakened.forEach(function (s) { s.aware = true; });
      if (!awakened.length) { next(); return; }
      infoPopup({
        title: 'US Awareness', bodyHtml: awakened.map(function (s) { return s.name; }).join(', ') +
          (awakened.length > 1 ? ' are' : ' is') + ' automatically aware from Round 3 onward (&sect;6/5).',
      }, next);
      return;
    }
    var candidates;
    if (n === 1) {
      // "each active US soldier that can see the German just activated" — at this exact moment
      // activeGermans() IS the just-activated batch, since startActionRound(1) only ever runs
      // once, at the true start of a fresh Rounds sequence (no other German can be active yet).
      // A paragraph activating more than one German at once isn't addressed by the rule text
      // (which assumes one) — checked against seeing ANY of them, the natural reading.
      var justActivated = activeGermans();
      candidates = activeUS().filter(function (s) { return !s.aware && justActivated.some(function (g) { return losClearBetween(s, g); }); });
    } else {
      // Round 2: "each active US soldier ON THE MAP that is not yet aware", regardless of LOS.
      candidates = activeUS().filter(function (s) { return !s.aware; });
    }
    runAwarenessChecks(candidates, 0, next);
  }
  function runAwarenessChecks(list, i, next) {
    if (i >= list.length) { next(); return; }
    var s = list[i];
    rollPopup({
      actor: s, title: 'US Awareness Check', kind: 'single',
      contextHtml: s.name + ' (PC ' + s.PC + ') checks for awareness of the German activation (&sect;6/5).',
      explain: function (roll) { return Checks.resolvePerceptionCheck(s.PC, 0, roll) === 'success' ? '<b style="color:var(--clear)">AWARE</b>.' : 'Still <b>unaware</b>.'; },
      logText: function (roll) { var ok = Checks.resolvePerceptionCheck(s.PC, 0, roll) === 'success'; return 'Awareness check for ' + s.name + ': <span class="roll">' + roll + '</span> vs PC ' + s.PC + ' &rarr; ' + (ok ? 'AWARE' : 'unaware') + '.'; },
    }, function (roll) {
      // Placed straight in Complete by placeMarkersChain below, not given a normal turn slot —
      // the rulebook places a just-passed Awareness Check's soldier in Complete directly (same
      // wording used for the "unaware soldier who is attacked" case, wakeUpUnawareInHex).
      if (Checks.resolvePerceptionCheck(s.PC, 0, roll) === 'success') { s.aware = true; s.justBecameAware = true; }
      runAwarenessChecks(list, i + 1, next);
    });
  }
  // §6/5 / §11/4: an unaware US soldier who is attacked (even a miss) becomes aware once the
  // attack resolves — every soldier in the target hex, not just the one actually targeted.
  // Called only for German-initiated fire/assault; US soldiers firing at Germans never affects
  // US awareness (Germans have no such state — they're aware the instant they're activated).
  function wakeUpUnawareInHex(hexId) {
    activeUS().filter(function (s) { return s.hexId === hexId && !s.aware; }).forEach(function (s) {
      s.aware = true;
      if (M1.state.phase === 'round') Sched.applyBecomesAware(M1.state.track, s.id);
      logLine(s.name + ' is now aware (&sect;6/5).');
    });
  }
  function rollInitiativeAdvantage(n) {
    // §6/1: "The paragraph that activates the Germans and initiates Rounds may state that one
    // side or the other has the advantage in the first Round... although you still roll."
    var fixed = n === 1 && pendingContact && pendingContact.advantage ? pendingContact : null;
    function sideOf(rolls) {
      if (fixed) return fixed.advantage;
      return AR.resolveAdvantage(rolls.a, rolls.b) === 'german' ? 'german' : 'US';
    }
    rollPopup({
      title: 'Initiative — Round ' + n, kind: 'dual', diceLabels: ['US', 'GERMAN'],
      contextHtml: fixed
        ? 'Paragraph ' + fixed.paragraph + ' gives the <b>' + fixed.advantage.toUpperCase() + '</b> side the advantage this Round. The dice are still rolled (&sect;6/1).'
        : 'US rolls one die, the German side rolls one die. Higher roll has the advantage; ties go to the German.',
      explain: function (rolls) {
        return 'US <b>' + rolls.a + '</b> vs German <b>' + rolls.b + '</b> &rarr; advantage <b>' + sideOf(rolls).toUpperCase() + '</b>' +
          (fixed ? ' (paragraph ' + fixed.paragraph + ')' : '') + '.';
      },
      logText: function (rolls) {
        return 'Round ' + n + ' Initiative: US ' + rolls.a + ', German ' + rolls.b + ' &rarr; advantage ' + sideOf(rolls).toUpperCase() +
          (fixed ? ' (set by paragraph ' + fixed.paragraph + ')' : '') + '.';
      },
    }, function (rolls) {
      placeMarkersChain(n, sideOf(rolls));
    });
  }
  function placeMarkersChain(n, advantageSide) {
    document.getElementById('track-sec').style.display = 'none';
    var contact = n === 1 ? pendingContact : null;
    pendingContact = null;
    // §6/5: a still-unaware soldier skips initiative placement entirely (Unaware slot); a
    // soldier whose Awareness Check just succeeded this Round (runAwarenessChecks) also skips
    // it, landing straight in Complete rather than a real turn — see placeMarkers' `placement`
    // doc comment in arscheduler.js. Both were already narrated by the Awareness Phase's own
    // pop-ups, so neither gets a redundant Initiative Roll pop-up below.
    var roster = activeUS().map(function (s) {
      // §13/1 (docs/40_PANIC_EFFECTS.md, Task #65): "A panicked commander has no command
      // radius" — read by AR.commandContributors' own panicked-aware radius check.
      var entry = { id: s.id, side: 'US', IN: s.IN, wounded: s.wounded, isCommander: s.isCommander, isActive: true, hexId: s.hexId, letter: null, panicked: s.status === 'panicked' };
      if (!s.aware) entry.placement = 'unaware';
      else if (s.justBecameAware) { entry.placement = 'complete'; s.justBecameAware = false; }
      // "All aware US soldiers, that do not panic, receive 2 turns this Round" (289, 312, 333).
      else if (contact && contact.awareUsTwoTurns && s.status !== 'panicked') entry.receivesTwoTurns = true;
      return entry;
    });
    var gList = activeGermans();
    M1.state.currentGermanIdsThisRound = gList.map(function (g) { return g.id; });
    gList.forEach(function (g) {
      roster.push({ id: g.id, side: 'german', IN: g.IN, wounded: g.wounded, isCommander: false, isActive: true, hexId: g.hexId, letter: g.letter,
        receivesTwoTurns: !!(contact && contact.germanIds.indexOf(g.id) !== -1) });
    });

    var rollsById = {}, classifyById = {};
    roster.forEach(function (entry) {
      if (entry.placement || entry.receivesTwoTurns) return;
      var r = d10();
      rollsById[entry.id] = r;
      classifyById[entry.id] = AR.classifyARRoll(window.AMBUSH_AR_TRACK, entry.IN, r);
    });
    M1.state.track = Sched.placeMarkers({ round: n, advantageSide: advantageSide, arTrack: window.AMBUSH_AR_TRACK, roster: roster, rollDie: function (entry) { return rollsById[entry.id]; } });

    roster.forEach(function (entry) {
      if (entry.receivesTwoTurns) logLine(findSoldier(entry.id).name + ' receives ' + (entry.wounded ? 'one turn (wounded)' : '2 turns') + ' this Round, no roll (paragraph ' + contact.paragraph + ').');
    });
    var queue = roster.filter(function (entry) { return !entry.placement && !entry.receivesTwoTurns; });
    function nextEntry() {
      if (!queue.length) { document.getElementById('track-sec').style.display = ''; renderTrack(); afterPlacement(n); return; }
      var entry = queue.shift();
      var soldier = findSoldier(entry.id);
      var roll = rollsById[entry.id], cls = classifyById[entry.id];
      rollPopup({
        actor: soldier, title: 'Initiative Roll', kind: 'single', presetValue: roll,
        contextHtml: soldier.name + ' (IN ' + entry.IN + ') rolls for the AR Track.',
        explain: function () { var slot = M1.state.track.soldiers[entry.id].slot; return 'Rolls <b>' + roll + '</b> &rarr; placed in <b>' + slotLabel(slot) + '</b>.'; },
        logText: function () { var slot = M1.state.track.soldiers[entry.id].slot; return 'Initiative for ' + soldier.name + ': <span class="roll">' + roll + '</span> &rarr; ' + slotLabel(slot) + '.'; },
      }, function () { nextEntry(); });
    }
    nextEntry();
  }
  // The contact paragraph's "Go to Condition N" waits in pendingConditionChange, because the
  // Germans' activation hands straight to Round 1 (activateGermansSequentially). Applied once
  // Round 1's markers are down, as a change during Rounds (§6/11), so the first German turn
  // already reads the new Condition's column (docs/PARAGRAPH_DATA_GAPS.md §4, Phase 8c).
  function afterPlacement(n) {
    if (n === 1 && pendingConditionChange !== null) {
      var to = pendingConditionChange;
      pendingConditionChange = null;
      if (to > M1.state.opsState.condition) { runRoundsConditionChange(to, driveNext); return; }
    }
    driveNext();
  }
  function slotLabel(key) {
    return { '2adv': '2-Turn (adv)', '2disadv': '2-Turn (disadv)', '1adv': '1-Turn (adv)', '1disadv': '1-Turn (disadv)', panic: 'Panic', complete: 'Complete', inactive: 'Inactive', unaware: 'Unaware' }[key];
  }
  function occStr(ids) {
    if (!ids.length) return '<span style="color:var(--text-label);">&mdash;</span>';
    return ids.map(function (id) { var s = findSoldier(id); return '<span' + (s.side === 'german' ? ' class="g"' : '') + '>' + s.name.split(' ').pop() + '</span>'; }).join(', ');
  }
  function renderTrack() {
    var cur = Sched.isRoundComplete(M1.state.track) ? { done: true } : Sched.nextActor(M1.state.track);
    var html = '';
    ['unaware', '2adv', '2disadv', '1adv', '1disadv', 'panic', 'complete'].forEach(function (key) {
      var occ = Sched.occupantsOf(M1.state.track, key);
      var isCurrent = !cur.done && key === cur.slot;
      html += '<div class="ar-slot' + (isCurrent ? ' current' : '') + '"><span class="label">' + slotLabel(key) + '</span><span class="occ">' + occStr(occ) + '</span></div>';
    });
    document.getElementById('ar-track').innerHTML = html;
  }
  // v3 Phase 3b (Wan, 2026-10-22): the next turn starts at once; the finished card stays up until
  // the player's next decision closes it (Resolve.awaitDone).
  function driveNext() {
    if (M1.state.phase !== 'round') return;
    document.getElementById('action-sec').style.display = 'none';
    highlightActor(null);
    Resolve.awaitDone(driveNextNow);
  }
  // §6/1: "If more than one US soldier occupies a space, you can have them go in any order you
  // wish." The scheduler takes the player's pick through its chooseUS hook; v2 always took the
  // first. While the player chooses, those counters glow and the soldier panel lists them.
  var picking = null;
  function driveNextNow() {
    if (M1.state.phase !== 'round' || picking) return;
    if (Sched.isRoundComplete(M1.state.track)) { endRound(); return; }
    var na = Sched.nextActor(M1.state.track);
    if (na.done) { endRound(); return; }
    var occ = na.side === 'german' ? [] : Sched.occupantsOf(M1.state.track, na.slot);
    if (occ.length > 1) { offerPick(occ); return; }
    beginTurn(na);
  }
  function offerPick(ids) {
    picking = { ids: ids };
    M1.state.currentActorId = null;
    renderTrack();
    highlightActor(null);
    document.getElementById('action-sec').style.display = 'none';
    ids.forEach(function (id) { if (counterEls[id]) counterEls[id].classList.add('eligible'); });
    document.getElementById('pick-list').innerHTML = ids.map(function (id) {
      var s = findSoldier(id);
      return '<button class="btn pick" data-pick="' + id + '"><img src="' + currentImgFor(s) + '" alt="">' + s.name +
        '<small>' + s.hexId + ' &middot; ' + s.stance + (s.status !== 'unharmed' ? ' &middot; ' + s.status : '') + '</small></button>';
    }).join('');
    document.getElementById('pick-sec').style.display = '';
    document.getElementById('status-banner').textContent = 'Choose who goes next: ' + ids.length + ' soldiers share this space (§6/1).';
    FX.ensureVisible(ids.map(function (id) { return findSoldier(id).hexId; }), true);
  }
  function pickActor(id) {
    if (!picking || picking.ids.indexOf(id) === -1) return false;
    picking.ids.forEach(function (k) { if (counterEls[k]) counterEls[k].classList.remove('eligible'); });
    picking = null;
    document.getElementById('pick-sec').style.display = 'none';
    document.getElementById('status-banner').textContent = 'Contact! Action Round in progress.';
    beginTurn(Sched.nextActor(M1.state.track, { chooseUS: function () { return id; } }));
    return true;
  }
  document.getElementById('pick-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]');
    if (b) pickActor(b.dataset.pick);
  });
  canvas.addEventListener('click', function (e) {
    var c = picking && e.target.closest('.counter.eligible');
    if (!c) return;
    e.stopPropagation();
    pickActor(c.dataset.soldierId);
  }, true);
  function beginTurn(na) {
    M1.state.currentActorId = na.soldierId;
    renderTrack();
    highlightActor(M1.state.currentActorId);
    if (na.side === 'german') { document.getElementById('action-sec').style.display = 'none'; setTimeout(germanAutoTurn, 500); }
    else {
      // §6/7: "an unwounded soldier can, at any point during his turn, make one free stance
      // change" — a fresh opportunity every turn, not a once-per-Round resource. Reset here
      // (a genuinely new turn beginning), not inside showActionPanel, which also re-renders
      // mid-turn after a cancelled Move/Fire/etc. without that being a new turn.
      var s = findSoldier(M1.state.currentActorId);
      s.usedFreeStanceChange = false;
      // Task #70 (docs/44_SNAP_FIRE_COMBO.md): a fresh combo opportunity every turn, same
      // reasoning as usedFreeStanceChange above.
      s.comboStepsUsed = 0;
      s.comboMoveCostUsed = 0;
      showActionPanel(M1.state.currentActorId);
    }
  }
  function canFireAt(firer, target) {
    if (!target.isActive || !losClearBetween(firer, target)) return false;
    if (FC.hexDistance(firer.hexId, target.hexId) > weaponMaxRange(weaponById(firer.weaponId))) return false;
    // §8/2 / the chart's one impossible cell: a prone soldier inside a building, shot at from a
    // hex that is not one of his apertures, cannot be hit at all.
    return FC.canBeFiredAt(CHART.FIRE_MODS_TERRAIN, terrainRowForTarget(firer, target), target.stance);
  }
  function visibleEnemyTargets(firer) {
    return (firer.side === 'german' ? activeUS() : activeGermans()).filter(function (t) { return canFireAt(firer, t); });
  }
  // v3 (Phase 3, ring menu): a greyed verb says why, in the rules' words, from the same tests that
  // greyed it above. Presentation only: the reason is written to the button's data-why; nothing
  // here decides whether the verb is legal.
  function explainVerbs(s, targets, canFire, crew, crewOk) {
    function why(id, text) {
      var b = document.getElementById(id);
      if (b.disabled) b.dataset.why = text; else delete b.dataset.why;
    }
    why('moveBtn', 'No hex he can reach with the MP he has left (§6/7).');
    why('fireAimed', fireWhy('aimed'));
    why('fireSnap', fireWhy('snap'));
    function fireWhy(kind) {
      if (!canFire) return s.weaponBroken ? 'His weapon is broken (§9/4).' : s.weaponJammed ? 'His weapon is jammed: clear it first (§9/4).' :
        (WEAPONS_REQUIRING_PREPARATION[s.weaponId] && !s.weaponPrepared) ? 'His weapon must be prepared before it fires (§6/7).' :
        !s.weaponId ? 'He has no weapon.' : 'He is out of ammunition (§9/5).';
      if (!targets.length) return 'No German in line of sight and in range (§8).';
      if (!crewOk) return 'A crew weapon is fired crouching (§9/7).';
      if (crew && kind === 'aimed' && !crew.aimed) return 'Alone on a crew weapon he can only snap fire (§9/7).';
      if (crew && !crew.snap) return 'Two soldiers have already crewed this weapon this Round (§9/7).';
      return 'Not available now.';
    }
    why('assaultBtn', s.stance !== 'standing' ? 'The attacking soldier must be standing (§11/1).' : 'No German in his hex or in an adjacent hex he can charge into (§11/1, §11/3).');
    why('grenadeBtn', 'No grenade, or no hex in throwing range he can see (§10/1).');
    why('dragBtn', 'No inactive soldier in his hex to drag, or nowhere to drag him (§6/7).');
    why('giveTurnBtn', !s.isCommander ? 'Only a commander can give a Turn (§6/3).' : 'No soldier on the 1-Turn or Complete space can take one (§6/3).');
    why('makeAwareBtn', !s.isCommander ? 'Only a commander can make a soldier aware (§6/5).' : 'No unaware, unwounded soldier within his Command Radius (§6/5).');
    why('changeStanceBtn', 'His free change is used and he has no MP to pay for another (§6/7).');
    why('prepareWeaponBtn', !WEAPONS_REQUIRING_PREPARATION[s.weaponId] ? 'His weapon needs no preparation.' :
      s.weaponPrepared ? 'His weapon is already prepared.' : 'He must be standing or crouching to prepare it (§6/7).');
    why('pickupBtn', 'Nothing in his hex to pick up or exchange (§14).');
    why('clearJamBtn', !s.weaponJammed ? 'His weapon is not jammed.' : 'He must be standing or crouching to clear a jam (§9/4).');
  }
  function showActionPanel(id) {
    var s = findSoldier(id);
    clearDestMarks();
    document.getElementById('cancelMoveBtn').style.display = 'none';
    document.getElementById('act-img').src = currentImgFor(s);
    document.getElementById('act-name').textContent = s.name;
    document.getElementById('act-stats').innerHTML = 'IN:' + s.IN + ' WS:' + fmtSigned(s.WS) + ' \u00b7 ' + s.stance + ' at ' + s.hexId + (s.status !== 'unharmed' ? ' \u00b7 ' + s.status : '') + kitHtml(s, true);
    var targets = visibleEnemyTargets(s);
    var canFire = weaponUsable(s);
    document.getElementById('moveBtn').disabled = !Object.keys(roundLegalDestinations(s)).length;
    // §9/7 (Task A1): a crew weapon needs a crouching firer, is snap-only when he crews it alone,
    // and only offers aimed fire when a second crouching soldier in the hex can combine actions.
    var crew = isCrewWeapon(s.weaponId) ? crewFireAvailability(s) : null;
    var crewOk = !crew || crewWeaponStanceOk(s);
    document.getElementById('fireAimed').disabled = !targets.length || !canFire || !crewOk || (crew && !crew.aimed);
    document.getElementById('fireSnap').disabled = !targets.length || !canFire || !crewOk || (crew && !crew.snap);
    // §11/1 + §11/3 reachability, not a bare adjacency test — see assaultCandidates().
    document.getElementById('assaultBtn').disabled = !assaultCandidates(s).length;
    document.getElementById('grenadeBtn').disabled = !grenadeCandidates(s).length;
    document.getElementById('dragBtn').disabled = !dragCandidates(s).length || !dragHexCandidates(s).length;
    document.getElementById('giveTurnBtn').disabled = !giveTurnCandidates(s).length;
    document.getElementById('makeAwareBtn').disabled = !makeAwareCandidates(s).length;
    document.getElementById('changeStanceBtn').disabled = !stanceChangeCandidates(s).length;
    document.getElementById('prepareWeaponBtn').disabled = !canPrepareWeapon(s);
    document.getElementById('pickupBtn').disabled = !pickupOffers(s).length;
    document.getElementById('clearJamBtn').disabled = !canClearJam(s);
    document.getElementById('passTurn').disabled = false;
    explainVerbs(s, targets, canFire, crew, crewOk);
    document.getElementById('action-sec').style.display = '';
    Info.refresh(); // task 5: shade this soldier's reachable hexes now that it is his decision
    if (!targets.length) logLine(nameFor(id) + ' has no line of sight to any German this turn.');
    else if (!canFire) logLine(nameFor(id) + '\'s weapon is ' + (s.weaponBroken ? 'broken' : s.weaponJammed ? 'jammed' : 'out of ammo') + ' and cannot fire.');
    else if (crew && !crewWeaponStanceOk(s)) logLine(nameFor(id) + ' must be crouching to fire the ' + equipmentName(s.weaponId) + ' (&sect;9/7).');
    else if (crew && guardsAPrisoner(s)) logLine(nameFor(id) + ' is guarding a prisoner and so cannot fire a crew weapon (&sect;11/2).');
    else if (crew && !crew.snap) logLine(nameFor(id) + ' cannot fire the ' + equipmentName(s.weaponId) + ' again this Round &mdash; two soldiers have already crewed it (&sect;9/7).');
    else if (crew && !crew.aimed) logLine(nameFor(id) + ' crews the ' + equipmentName(s.weaponId) + ' alone, so it can only snap fire (&sect;9/7).');
  }
  document.getElementById('moveBtn').addEventListener('click', function () {
    var s = findSoldier(M1.state.currentActorId);
    var dests = roundLegalDestinations(s);
    if (!Object.keys(dests).length) return;
    disableActionButtons();
    pendingCancelAction = null; // this is a fresh, non-combo Move — default cancel behavior
    document.getElementById('cancelMoveBtn').style.display = '';
    clearDestMarks();
    Object.keys(dests).forEach(function (hexId) {
      addDestMark(hexId, destCostClass(dests[hexId].cost), hexId + ' (' + dests[hexId].cost + ' MP)',
        function () { doRoundMove(s, dests[hexId].path, dests[hexId].cost, function () { completeTurn(s.id); }); });
    });
    document.getElementById('status-banner').textContent = s.name + ' — choose a destination (up to ' + s.mpa + ' MP' +
      (s.stance === 'prone' ? ', ' + (standUpCost(s) === 0 ? 'standing up free first' : standUpCost(s) + ' of them to stand up first') : '') + '), or Cancel.';
  });
  document.getElementById('cancelMoveBtn').addEventListener('click', function () {
    if (pendingCancelAction) { var fn = pendingCancelAction; pendingCancelAction = null; fn(); return; }
    document.getElementById('status-banner').textContent = 'Contact! Action Round in progress.';
    showActionPanel(M1.state.currentActorId);
  });
  document.getElementById('fireAimed').addEventListener('click', function () { doPlayerFire('aimed'); });
  document.getElementById('fireSnap').addEventListener('click', function () { doPlayerFire('snap'); });
  document.getElementById('assaultBtn').addEventListener('click', function () { doPlayerAssault(); });
  document.getElementById('grenadeBtn').addEventListener('click', function () { doPlayerGrenade(); });
  document.getElementById('dragBtn').addEventListener('click', function () { doPlayerDrag(); });
  document.getElementById('giveTurnBtn').addEventListener('click', function () { doPlayerGiveTurn(); });
  document.getElementById('makeAwareBtn').addEventListener('click', function () { doPlayerMakeAware(); });
  document.getElementById('changeStanceBtn').addEventListener('click', function () { doPlayerChangeStance(); });
  document.getElementById('prepareWeaponBtn').addEventListener('click', function () { doPlayerPrepareWeapon(); });
  document.getElementById('pickupBtn').addEventListener('click', function () { doPlayerPickup(); });
  document.getElementById('passTurn').addEventListener('click', function () {
    var actor = findSoldier(M1.state.currentActorId);
    infoPopup({ actor: actor, title: 'Pass', bodyHtml: actor.name + ' passes.' }, function () { Sched.completeAction(M1.state.track, M1.state.currentActorId); renderTrack(); driveNext(); });
  });
  // §6/7 Move: walk the chosen path one hex at a time, same real Paragraph Check every hex-entry
  // gets in Operations (§5/1's "made during Rounds in this same manner"), except Event Checks are
  // skipped (Event Markers are still placed) — the skipEventCheck flag on runParagraphCheck.
  // `totalCost`/`onEndTurn` (Task #70, docs/44_SNAP_FIRE_COMBO.md): every caller now routes
  // completion through finishMoveStep rather than completing the turn directly, so a
  // combo-eligible move (≤ half MPA, first sub-action this turn) can offer a snap-fire follow-up
  // instead of always ending the turn immediately.
  function doRoundMove(mover, path, totalCost, onEndTurn) {
    clearDestMarks();
    pendingCancelAction = null;
    document.getElementById('cancelMoveBtn').style.display = 'none';
    var steps = path.slice(1); // path[0] is the start hex
    var i = 0;
    // §6/7/§7/3: a prone soldier's Movement Action opens by standing up — free if his free stance
    // change is still available, otherwise 1 MP, which legalDestinationsWithBudget has already
    // charged against this move's cost. Announced as its own pop-up because it is the step that
    // makes the rest of the move legal, and because on a wounded soldier it is what the MP went on.
    function standUpThen(next) {
      if (mover.stance !== 'prone') { next(); return; }
      var free = standUpCost(mover) === 0;
      mover.stance = 'standing';
      if (free) mover.usedFreeStanceChange = true;
      updateCounterVisual(mover);
      var how = free ? 'using his free stance change' : 'spending 1 MP';
      infoPopup({
        actor: mover, title: 'Stand Up',
        bodyHtml: mover.name + ' stands up, ' + how + '.' +
          (free ? '' : ' Wounded soldiers never receive a free stance change (&sect;6/7).'),
        logHtml: mover.name + ' stands up (' + how + ', &sect;6/7).',
      }, next);
    }
    function stepNext() {
      if (M1.state.phase !== 'round' || M1.state.currentActorId !== mover.id) return;
      // Same gap as doMove's (see its comment): a Rounds move can be the step that completes
      // Ending 1's four-hex requirement, so the condition has to be re-tested once the move is
      // done. Placed after the path is exhausted rather than per hex — the ending is about where
      // the soldier ends up, and endMission() mid-path would leave stepNext half-run.
      if (i >= steps.length) {
        checkEndingConditions();
        if (M1.state.phase !== 'round') return;
        finishMoveStep(mover, totalCost, onEndTurn);
        return;
      }
      var hexId = steps[i]; i++;
      var fromHexId = mover.hexId;
      mover.hexId = hexId;
      placeEl(counterEls[mover.id], hexId);
      // Task #69 (docs/43_PREPARE_WEAPON.md). No-op for anyone but a crew-weapon carrier.
      var unprepared = unprepareWeaponOnMove(mover);
      infoPopup({
        actor: mover, title: 'Move',
        bodyHtml: mover.name + ' moves ' + fromHexId + ' &rarr; ' + hexId + ' (' + TERRAIN_LABELS[REAL_TERRAIN[hexId]] + ').' +
          (unprepared ? ' The ' + equipmentName(mover.weaponId) + ' is no longer prepared.' : ''),
        fx: function () { FX.trail(fromHexId, hexId); FX.ensureVisible([hexId]); },
      }, function () { runParagraphCheck(mover, stepNext, { skipEventCheck: true }); });
    }
    standUpThen(stepNext);
  }

  // §9/1 step 1 ("Select Target, check LOS, determine if Aimed or Snap fire") and §11/1 ("Can
  // only attack 1 soldier. US chooses any") both make target selection the PLAYER's decision.
  // Previously the engine silently took `targets[0]` — whatever order the germans{} object
  // happened to enumerate in — so choosing "Fire" also chose who you shot at. This prompts
  // instead, showing the real numbers the choice turns on: range, the target's terrain/stance
  // cover, and the hit chance computed by the same functions that will resolve the shot, so the
  // odds shown can never disagree with the odds rolled against.
  //
  // A single legal target is not a decision — it goes straight through with no extra click.
  function chooseTarget(actor, targets, opts, cb) {
    // Auto-picking a lone candidate is fine for pure logistics (drag/give-turn/pick-up), but for
    // anything showing hit chance the player explicitly wants to SEE that number before
    // committing — a real user report ("I need more information to make decisions") — even when
    // there's only one soldier to shoot at, which is the common case this was silently skipping.
    if (targets.length === 1 && !opts.hitChanceFor) { cb(targets[0]); return; }
    var spec = {
      title: opts.title, variant: 'wide', allowEnter: false, allowEscape: true, escapeButtonId: 'cancel',
      buttons: [{ id: 'cancel', label: 'Cancel' }],
      render: function (ctx) {
        // spec.choices is the same list as the rows, as data: what __mission1Debug.pendingDecision
        // reports and choose(i) picks, so automation never reads the row markup.
        spec.choices = [];
        var html = targets.map(function (t, i) {
          var dist = FC.hexDistance(actor.hexId, t.hexId);
          var note = opts.noteFor ? opts.noteFor(t) : '';
          var odds = opts.hitChanceFor ? opts.hitChanceFor(t) : null;
          var distText = dist === 0 ? 'same hex' : dist + ' hex' + (dist === 1 ? '' : 'es');
          var oddsNum = odds === null ? null : parseInt(stripTags(String(odds)), 10);
          // 2026-09-23 (Wan: "this dialog box is formatted badly"): the breakdown used to be a
          // focusable tooltip on the odds box. The dialog focuses its first focusable element, so
          // it opened already showing, and inside the scrolling list it grew both scrollbars. It
          // is decision information, so it is now a plain line under the target's details, and
          // the odds read as a percentage (every picker caller resolves with resolveHitRoll:
          // Hit Chance c hits on 0..c, so (c + 1) in 10), with the raw chance beneath.
          var why = opts.hitChanceTipFor ? opts.hitChanceTipFor(t) : '';
          var oddsHtml = isNaN(oddsNum) || oddsNum === null ? String(odds)
            : Math.max(0, Math.min(100, (oddsNum + 1) * 10)) + '%';
          spec.choices.push({
            text: stripTags(t.name + ' ' + t.hexId + ' &middot; ' + (TERRAIN_LABELS[REAL_TERRAIN[t.hexId]] || 'unknown') +
              ' &middot; ' + t.stance + ' &middot; ' + distText + (note ? ' ' + note : '')),
            odds: isNaN(oddsNum) ? null : oddsNum,
            pick: function () { Dialogs.reset(); cb(t); }, // close without firing onClose — a real pick is not a cancel
          });
          return '<div class="target-row" data-idx="' + i + '">' +
            '<img src="' + currentImgFor(t) + '">' +
            '<span class="target-id"><b>' + t.name + '</b><span class="target-meta">' + t.hexId +
              ' &middot; ' + (TERRAIN_LABELS[REAL_TERRAIN[t.hexId]] || 'unknown') + ' &middot; ' + t.stance +
              ' &middot; ' + distText + '</span>' +
              (note ? '<span class="target-note">' + note + '</span>' : '') +
              (why ? '<span class="target-why">' + why.replace('->', '&rarr;') + '</span>' : '') + '</span>' +
            (opts.hitChanceFor ? '<span class="target-odds">' + oddsHtml + '<span>' + (opts.oddsLabel || 'to hit') +
              (isNaN(oddsNum) || oddsNum === null ? '' : ' &middot; chance ' + oddsNum) + '</span></span>' : '') + '</div>';
        }).join('');
        ctx.bodyEl.innerHTML = '<div class="step-context">' + opts.prompt + '</div><div class="target-list">' + html + '</div>';
        Array.prototype.forEach.call(ctx.bodyEl.querySelectorAll('.target-row'), function (row) {
          row.addEventListener('click', function () { spec.choices[parseInt(row.dataset.idx, 10)].pick(); });
        });
      },
      onButton: function (id, ctx) { ctx.close(); },
      onClose: function () { if (opts.onCancel) opts.onCancel(); }, // Cancel/Escape only
    };
    Dialogs.push(spec);
  }
  // Shared by the target picker and assaultChain's own resolution so the two can never drift.
  function assaultOpts(attacker, defender, isCharge) {
    return {
      attackerWS: attacker.WS, defenderWS: defender.WS,
      defenderPanicked: defender.status === 'panicked', defenderWounded: defender.status === 'wounded',
      // §11/4: "A US soldier who is unaware when assaulted cannot use his WS to modify the
      // German assault." Germans have no awareness state (aware the instant they're activated),
      // so this only ever applies to a US defender.
      defenderUnaware: defender.side !== 'german' && !defender.aware,
      isChargeAssault: !!isCharge,
      attackerWounded: attacker.status === 'wounded', attackerUsingCapturedWeapon: false,
    };
  }

  // §11/1: "the attacking soldier must be standing and must occupy the SAME hex as the soldier he
  // is assaulting. If the attacker is not in the same hex ... he must perform a Move/Charge
  // Assault Action (11/3) in order to enter the defender's hex and assault him."
  // §11/3: that move may spend "only half his Movement Point Allowance, rounded down" — so an
  // adjacent German in expensive terrain can be genuinely unreachable this turn — and the assault
  // then takes "an additional -3 modifier to the Base Hit Chance."
  //
  // Previously the Assault button just took `hexDistance <= 1` and always resolved as a plain
  // same-hex assault: the move into the hex never happened, the half-MPA limit was never checked,
  // and isChargeAssault was hardcoded false so the -3 never applied.
  function assaultCandidates(s) {
    if (!s || s.stance !== 'standing') return []; // §11/1: "the attacking soldier must be standing"
    var budget = Asl.chargeAssaultMaxMP(s.mpa);
    var out = [];
    activeGermans().forEach(function (g) {
      var dist = FC.hexDistance(s.hexId, g.hexId);
      if (dist === 0) { out.push({ german: g, isCharge: false, cost: 0, budget: budget }); return; }
      if (dist !== 1) return;
      var terrain = REAL_TERRAIN[g.hexId];
      if (terrain && M.isProhibited(terrain)) return;
      var cost = M.mpCost(terrain);
      if (cost > budget) return; // can't reach him on half MPA — not a legal target this turn
      out.push({ german: g, isCharge: true, cost: cost, budget: budget });
    });
    return out;
  }


'use strict';
// mission1/operations.js (6 of 13) — selection, destinations, combo moves, walking, HUD, Paragraph Check, step chain. Stage A cut of mission1.js lines 1796-2488 (docs/REFACTOR_MAP.md 5.4).
  // ---------------------------------------------------------------------
  // Operations phase — real movement + real Paragraph Check (operationsloop.js) per hex entered.
  // ---------------------------------------------------------------------
  function selectedSoldier() { return findSoldier(M1.state.selectedId); }
  // §5/3/§7/1 Group Movement (Task #67, docs/42_GROUP_MOVEMENT.md): "any number of soldiers in
  // the same hex in the same stance can move into an adjacent hex together" — the group that a
  // selected soldier could optionally move together with, including himself.
  function groupAt(s) {
    if (!s) return [];
    return activeUS().filter(function (t) { return t.hexId === s.hexId && t.stance === s.stance; });
  }
  // §5/1: "If a group of soldiers enters the same hex, only one Paragraph Check is made. Any
  // Perception Checks required by the paragraph are made by the soldier with the highest PC
  // only." — same rule the existing per-hex PC-selection in Ops.buildContext's
  // defaultPcRating already implements for a single mover; picking the group's highest-PC
  // soldier as that one mover reuses it unchanged rather than teaching runParagraphCheck a new
  // "which soldier" concept.
  function highestPcOf(group) { return group.slice().sort(function (a, b) { return b.PC - a.PC; })[0]; }
  function renderGroupMoveRow() {
    var s = selectedSoldier();
    var group = groupAt(s);
    var row = document.getElementById('groupMoveRow');
    document.getElementById('groupMoveToggle').checked = false; // always opt in fresh per selection
    if (!s || group.length <= 1) { row.style.display = 'none'; return; }
    row.style.display = '';
    document.getElementById('groupMoveCount').textContent = group.length;
  }
  // v3 punch list 3 (Wan, 2026-10-21, feedback/feedback1mov.mov): in Operations the player picks
  // who moves (§5/3: "in any order you choose"). Nobody is pre-selected: after a move or walk
  // (once Done closes its card), when Operations begins, and when a soldier exits, the selection
  // is cleared. lastSelectedId keeps the soldier v2 would have kept selected, for the bot only.
  var lastSelectedId = null;
  function deselect(suggestId) {
    if (suggestId) lastSelectedId = suggestId;
    selectSoldier(null);
  }
  function endOpsMove() {
    if (M1.state.phase !== 'movement') return;
    var id = M1.state.selectedId;
    M1.Resolve.awaitDone(function () { if (M1.state.phase === 'movement' && M1.state.selectedId === id && !walking) deselect(id); });
    if (id) document.getElementById('status-banner').textContent = nameFor(id) + '’s move is done. Choose who moves next.';
  }
  function selectSoldier(id) {
    if (walking && walking.id !== id) walking = null; // selecting someone else ends the walk
    M1.state.selectedId = id;
    if (id) lastSelectedId = id;
    if (M1.state.phase === 'movement') document.getElementById('movement-sec').style.display = id ? '' : 'none';
    Object.keys(counterEls).forEach(function (k) { counterEls[k].classList.toggle('selected', k === id); });
    renderHud();
    renderGroupMoveRow();
    renderBringPrisonerRow();
    renderDestinations();
    M1.Info.refresh();
    renderStatusBanner();
  }
  function clearDestMarks() { Object.keys(destEls).forEach(function (k) { destEls[k].remove(); }); destEls = {}; destPicks = {}; }
  // Every destination marker goes through here, so its pick handler is recorded next to the
  // element: a map click and __mission1Debug.clickHex() run the same function.
  var destPicks = {};
  function addDestMark(hexId, className, title, onPick) {
    var el = document.createElement('div');
    el.className = className;
    placeEl(el, hexId);
    el.title = title;
    el.addEventListener('click', function (e) { e.stopPropagation(); onPick(); });
    canvas.appendChild(el);
    destEls[hexId] = el;
    destPicks[hexId] = onPick;
  }
  function destCostClass(cost) { return 'dest-mark ' + (cost <= 1 ? 'cost-1' : cost === 2 ? 'cost-2' : 'cost-3plus'); }

  function startOperations() {
    M1.state.phase = 'movement';
    M1.state.opsState = Ops.createGameState();
    document.getElementById('tb-phase').textContent = 'Operations';
    document.getElementById('movement-sec').style.display = '';
    M1.Cues.banner('ops', 'Operations', 'Move your squad · no turns until contact');
    deselect(M1.state.usSoldiers[0].id); // sets the status banner too
  }

  // §3/1 + §5/3: "no Game-Turns... without keeping track of Turns, Movement Points, or anything
  // else" during Operations — a soldier just moves one adjacent hex at a time, any number of
  // times, in any order. (MPA/mpRemaining still exist on the soldier object as a real §4 stat for
  // a future Rounds-movement feature, §6/7 — Operations code just never reads them.) Since
  // Operations and Rounds are mutually exclusive (an active German ends Operations immediately),
  // activeGermans() is always empty here, so no enemy-occupied-hex filtering is needed either.
  // Shared by renderDestinations() (what to draw) and renderStatusBanner() (what to say).
  function legalAdjacentHexIds(s) {
    if (!s || s.side === 'german' || s.stance === 'prone') return []; // "Prone soldiers cannot move at all" (§5/3)
    var start = G.parseId(s.hexId);
    var out = [];
    G.neighbors(start.colIdx, start.rowIdx).forEach(function (n) {
      var terrain = REAL_TERRAIN[n.id];
      if (terrain && M.isProhibited(terrain)) return;
      // §7/3: a wall hexside cannot be crossed at all. Operations tracks no Movement Points, so
      // the aperture surcharge has nothing to be charged against here — but "you may not walk
      // through the wall of a building" holds in both phases.
      if (M.hexsideCost(edgeFeatureBetween(s.hexId, n.id)) === Infinity) return;
      out.push(n.id);
    });
    return out;
  }
  // §6/7 Move (Rounds): "expend some or all of soldier's Movement Point Allowance" — unlike
  // Operations (§5/3, no MP tracked), Rounds movement uses the real MPA/terrain-cost pathfinding
  // movementrules.js was built for (M.legalDestinations) but Operations never needed. A Move
  // action is one of the actions a soldier can take on their turn (same tier as Fire/Assault),
  // so the full MPA is available — there's no partial-turn MP carryover to track separately.
  //
  // §6/7 stance and movement, the paid half. "A soldier without a free stance change must spend
  // one Movement Point to change stance, and thus must perform a Movement Action", and §7/3: "A
  // crouching or prone soldier must change stance using a free stance change, if he has one, or
  // by spending a Movement Point, in order to stand and then move." So a prone soldier is NOT
  // immobile — he is a soldier whose Movement Action must open with a stance change. Modelling
  // him as immobile is what produced the stalemates: a wounded soldier never gets a free stance
  // change, so a wounded prone soldier had no legal action at all, forever, and since a Round
  // only ends when no active German remains, the whole mission froze. See docs/49.
  //
  // M.legalDestinations keeps its own "prone cannot move" rule, which is right at its level — it
  // answers "where can a soldier in THIS stance go", and the answer for prone is nowhere. Standing
  // up first is a turn-level concern, so it belongs here, where the free-stance-change state lives.
  //
  // Deliberately NOT modelled: a CROUCHING soldier standing up to move further than his one-hex
  // crawl. It is legal by the same sentence, but it turns every crouching Move into a two-mode
  // choice for a case the crawl already covers, and no stalemate depends on it.
  function standUpCost(s) {
    return M.stanceChangeCost(!!s.usedFreeStanceChange, !!s.wounded);
  }
  function legalDestinationsWithBudget(s, mpaBudget) {
    if (!s || mpaBudget <= 0) return {};
    var occupiedByEnemy = activeGermans().map(function (g) { return g.hexId; });
    if (s.stance !== 'prone') {
      return M.legalDestinations({ startHexId: s.hexId, mpa: mpaBudget, stance: s.stance, terrainByHexId: REAL_TERRAIN, occupiedByEnemy: occupiedByEnemy, edgeFeatures: edgeFeatures });
    }
    // Prone: the Movement Action buys the stance change first, then moves standing on the rest.
    var upfront = standUpCost(s);
    if (upfront > mpaBudget) return {};
    var out = {};
    // Standing up and going no further is a legal Movement Action in its own right — and for a
    // wounded soldier with 2 MPA it is often the only one worth taking. Unused MP are lost (§7/3).
    out[s.hexId] = { cost: upfront, path: [s.hexId], standUp: true };
    var remaining = mpaBudget - upfront;
    if (remaining > 0) {
      var onward = M.legalDestinations({ startHexId: s.hexId, mpa: remaining, stance: 'standing', terrainByHexId: REAL_TERRAIN, occupiedByEnemy: occupiedByEnemy, edgeFeatures: edgeFeatures });
      Object.keys(onward).forEach(function (hexId) {
        out[hexId] = { cost: onward[hexId].cost + upfront, path: onward[hexId].path, standUp: true };
      });
    }
    return out;
  }
  function roundLegalDestinations(s) { return s ? legalDestinationsWithBudget(s, s.mpa) : {}; }

  // ---------------------------------------------------------------------
  // §6/7 Snap Fire Twice / §7/3 Move/Snap Fire (Task #70, docs/44_SNAP_FIRE_COMBO.md).
  //
  // A soldier's turn can be ONE regular action, or — only when the first sub-action is a snap
  // fire, or a move costing at most half his MPA (rounded down) — followed by exactly one more:
  // fire twice, fire-then-move, or move-then-fire. `s.comboStepsUsed` (reset per turn in
  // driveNext) caps it at that one follow-up; `s.comboMoveCostUsed` tracks MP already spent on
  // the movement half of the combo so a fire-then-move follow-up can't exceed the same half-MPA
  // budget a move-then-fire opener would have.
  //
  // Deliberately NOT modelled: "you can split movement so that it occurs both before and after
  // fire" (the errata's own third variant) — a third sub-action in the same turn. Aimed fire
  // never combos with anything (§6/7 lists "Snap Fire Twice"/"Move/Snap Fire" specifically,
  // never an Aimed equivalent), so doPlayerFire('aimed') is untouched by any of this.
  // ---------------------------------------------------------------------
  function comboMoveBudget(s) { return Math.floor(s.mpa / 2) - (s.comboMoveCostUsed || 0); }
  function completeTurn(soldierId) {
    if (M1.state.phase !== 'over') { Sched.completeAction(M1.state.track, soldierId); renderTrack(); driveNext(); }
  }
  // Called once a snap fire resolves. Offers a follow-up (another snap fire, or a move within
  // whatever half-MPA budget remains) if this was the turn's first sub-action and something is
  // actually still available; otherwise just ends the turn.
  function finishFireStep(s, onEndTurn) {
    if (M1.state.phase === 'over' || s.comboStepsUsed > 0) { onEndTurn(); return; }
    var canFireAgain = weaponUsable(s) && visibleEnemyTargets(s).length > 0;
    var moveDests = legalDestinationsWithBudget(s, comboMoveBudget(s));
    var canMove = Object.keys(moveDests).length > 0;
    if (!canFireAgain && !canMove) { onEndTurn(); return; }
    offerComboChoice(s, { fire: canFireAgain, move: canMove, moveDests: moveDests }, onEndTurn);
  }
  // Called once a Move resolves. Only offers a snap-fire follow-up if this was the turn's first
  // sub-action AND the whole move cost at most half the soldier's MPA (rounded down) — a move
  // that used more than that was never combo-eligible to begin with, matching a plain Move.
  function finishMoveStep(s, moveCostSoFar, onEndTurn) {
    var half = Math.floor(s.mpa / 2);
    if (M1.state.phase === 'over' || s.comboStepsUsed > 0 || moveCostSoFar > half) { onEndTurn(); return; }
    s.comboMoveCostUsed = moveCostSoFar;
    if (!(weaponUsable(s) && visibleEnemyTargets(s).length > 0)) { onEndTurn(); return; }
    offerComboChoice(s, { fire: true, move: false, moveDests: {} }, onEndTurn);
  }
  function offerComboChoice(s, avail, onEndTurn) {
    var offers = [];
    if (avail.fire) offers.push({ label: 'Fire &mdash; Snap (again)', kind: 'fire' });
    if (avail.move) offers.push({ label: 'Move (up to ' + comboMoveBudget(s) + ' MP left)', kind: 'move', dests: avail.moveDests });
    offers.push({ label: 'End Turn', kind: 'end' });
    chooseOffer(offers, {
      title: 'Combo Action',
      prompt: s.name + ' can take one more action this turn (&sect;6/7/&sect;7/3):',
      onCancel: onEndTurn,
    }, function (offer) {
      s.comboStepsUsed = 1;
      if (offer.kind === 'end') { onEndTurn(); return; }
      if (offer.kind === 'fire') {
        var targets = visibleEnemyTargets(s);
        chooseTarget(s, targets, {
          title: 'Select Target — Snap Fire',
          prompt: s.name + ' has line of sight to ' + targets.length + (targets.length === 1 ? ' German' : ' Germans') + '. Choose a target.',
          hitChanceFor: function (t) { return estimateHitChance(s, t, 'snap'); },
          hitChanceTipFor: function (t) { var b = estimateHitChanceBreakdown(s, t, 'snap'); return b ? hitBreakdownText(b) : ''; },
          onCancel: onEndTurn,
        }, function (target) {
          fireChain(s, target, 'snap', function () { finishFireStep(s, onEndTurn); });
        });
        return;
      }
      showComboMoveDestinations(s, offer.dests, onEndTurn);
    });
  }
  var pendingCancelAction = null; // set while a combo-move destination picker is open
  function showComboMoveDestinations(s, dests, onEndTurn) {
    pendingCancelAction = onEndTurn;
    document.getElementById('cancelMoveBtn').style.display = '';
    clearDestMarks();
    Object.keys(dests).forEach(function (hexId) {
      addDestMark(hexId, destCostClass(dests[hexId].cost), hexId + ' (' + dests[hexId].cost + ' MP)',
        function () { doRoundMove(s, dests[hexId].path, dests[hexId].cost, onEndTurn); });
    });
    document.getElementById('status-banner').textContent = s.name + ' — combo move, choose a destination (up to ' + comboMoveBudget(s) + ' MP), or Cancel.';
  }
  function renderDestinations() {
    clearDestMarks();
    if (M1.state.phase !== 'movement') return;
    var s = selectedSoldier();
    if (!s) return;
    legalAdjacentHexIds(s).forEach(function (hexId) {
      addDestMark(hexId, 'dest-mark', hexId, function () { doMove(hexId, endOpsMove); });
    });
  }
  // Narrates the same state renderDestinations() just drew — live, not a one-time static string.
  function renderStatusBanner() {
    if (M1.state.phase !== 'movement') return;
    var banner = document.getElementById('status-banner');
    var s = selectedSoldier();
    if (!s) { banner.textContent = 'Select a soldier to move.'; return; }
    banner.textContent = legalAdjacentHexIds(s).length
      ? s.name + ' selected — click any hex to walk there (he stops if anything happens), or choose another action.'
      : s.name + ' cannot move — change stance or select another soldier.';
  }

  // §5/3 Operations movement is one hex per Action and tracks no Movement Points, so a walk to a
  // distant hex is just that action repeated: the wall-aware route below is the same breadth-first
  // search the automated player has always borrowed (operationsNextStepForTesting), returning the
  // whole path instead of only its first step. Prohibited terrain and wall hexsides are excluded
  // by the game's own rules (M.isProhibited, M.hexsideCost === Infinity).
  function operationsRoute(fromHexId, goalHexId) {
    if (!fromHexId || !goalHexId || fromHexId === goalHexId) return null;
    var seen = {}, queue = [[fromHexId, []]];
    seen[fromHexId] = true;
    while (queue.length) {
      var entry = queue.shift(), hexId = entry[0], path = entry[1];
      var parsed = G.parseId(hexId);
      if (!parsed) continue;
      var nbrs = G.neighbors(parsed.colIdx, parsed.rowIdx);
      for (var i = 0; i < nbrs.length; i++) {
        var nid = nbrs[i].id;
        if (seen[nid]) continue;
        var terrain = REAL_TERRAIN[nid];
        if (terrain && M.isProhibited(terrain)) continue;
        if (M.hexsideCost(edgeFeatureBetween(hexId, nid)) === Infinity) continue; // wall
        var next = path.concat([nid]);
        if (nid === goalHexId) return next;
        seen[nid] = true;
        queue.push([nid, next]);
      }
    }
    return null;
  }

  // A multi-hex Operations move: step the route one hex at a time, each step the ordinary
  // single-hex move with its own Paragraph Check, and stop the moment anything happens — a
  // paragraph with an effect, an event, an activation, Rounds commencing, the mission ending, or
  // the soldier becoming unable to move. Quiet hexes just go by. (§5/3 is unchanged: this is the
  // same action repeated, not a new kind of move.)
  var walking = null;
  // A walk is only live while its own soldier is still the selected one in Operations: anything
  // that ends the phase, the selection or the soldier ends it (a continuation that never arrives —
  // Rounds commencing inside a Paragraph Check, say — must not leave the map unclickable).
  function walkLive() { return !!walking && M1.state.phase === 'movement' && M1.state.selectedId === walking.id; }
  function walkRoute(goalHexId) {
    if (walking && !walkLive()) walking = null;
    var s = selectedSoldier();
    if (walking || !s || M1.state.phase !== 'movement') return false;

    var route = operationsRoute(s.hexId, goalHexId);
    if (!route || !route.length) return false;
    if (route.length === 1) { doMove(route[0], endOpsMove); return true; }
    walking = { id: s.id, route: route, i: 0, goal: goalHexId };
    M1.logLine(s.name + ' sets off for <b>' + goalHexId + '</b> (' + route.length + ' hexes).');
    stepWalk();
    return true;
  }
  function stopWalk(why) {
    if (!walking) return;
    var s = findSoldier(walking.id);
    if (why && s) M1.logLine(s.name + ' stops at ' + s.hexId + ' &mdash; ' + why + '.');
    walking = null;
    if (M1.state.phase === 'movement') { renderDestinations(); renderStatusBanner(); M1.Info.refresh(); }
  }
  function stepWalk() {
    if (!walking) return;
    var s = findSoldier(walking.id);
    if (M1.state.phase !== 'movement') { walking = null; return; }          // Rounds began, or the mission ended
    if (!s || !s.isActive || s.exited) { stopWalk('he can no longer move'); return; }
    if (M1.state.selectedId !== walking.id) { stopWalk('another soldier was selected'); return; }
    var next = walking.route[walking.i];
    if (legalAdjacentHexIds(s).indexOf(next) === -1) { stopWalk('the way is blocked'); return; }
    walking.i++;
    doMove(next, function (quiet) {
      if (!walking) return;
      if (!quiet) { stopWalk('something happened here'); endOpsMove(); return; }
      if (walking.i >= walking.route.length) { stopWalk(null); endOpsMove(); return; }
      stepWalk();
    });
  }

  // One hex per Action (§5/3), so this is now a single step — no path/MP budget to walk. The
  // counter's own CSS transition (left/top .35s ease) provides the glide.
  //
  // §5/3 Group Movement (Task #67): when the "Move as group" checkbox is on, every soldier
  // `groupAt` returns moves together and the whole move shares ONE Paragraph Check — not the
  // rule's default (a lone soldier moving is already "a group of one" and always was), an
  // explicit opt-in the player chooses per move via `groupMoveRow`.
  // §5/3 "Move Captured German" (Task #72, docs/46_CAPTURED_GERMAN.md): every OTHER hex-content
  // change on a move (soldier positions) already existed; a captured German never moves on his
  // own, so bringing him along is an explicit opt-in via `bringPrisonerRow`, same pattern as
  // Group Move's opt-in checkbox — defaulting off, since leaving him behind (§11/2's "voluntary
  // release") is a legitimate, common choice, not an oversight to guard against.
  function capturedGermansAt(hexId) {
    return allGermans().filter(function (g) { return g.status === 'captured' && g.hexId === hexId; });
  }
  function renderBringPrisonerRow() {
    var s = selectedSoldier();
    var row = document.getElementById('bringPrisonerRow');
    document.getElementById('bringPrisonerToggle').checked = false; // always opt in fresh per selection
    if (!s || !capturedGermansAt(s.hexId).length) { row.style.display = 'none'; return; }
    row.style.display = '';
  }
  function doMove(hexId, onSettled) {
    clearDestMarks();
    var s = selectedSoldier();
    var asGroup = document.getElementById('groupMoveToggle').checked;
    var group = asGroup ? groupAt(s) : [s];
    var fromHexId = s.hexId;
    var bringPrisoners = document.getElementById('bringPrisonerToggle').checked;
    var prisoners = bringPrisoners ? capturedGermansAt(fromHexId) : [];
    group.forEach(function (t) {
      t.hexId = hexId;
      placeEl(counterEls[t.id], hexId);
    });
    prisoners.forEach(function (g) {
      g.hexId = hexId;
      var el = counterEls[g.id]; if (el) placeEl(el, hexId);
    });
    renderHud();
    var mover = group.length > 1 ? highestPcOf(group) : s;
    var names = group.map(function (t) { return t.name; }).join(', ');
    M1.infoPopup({
      actor: mover, title: group.length > 1 ? 'Group Move' : 'Move',
      bodyHtml: (group.length > 1
        ? names + ' move together ' + fromHexId + ' &rarr; ' + hexId + ' (' + TERRAIN_LABELS[REAL_TERRAIN[hexId]] + ') &mdash; one Paragraph Check for the group (&sect;5/3).'
        : s.name + ' moves ' + fromHexId + ' &rarr; ' + hexId + ' (' + TERRAIN_LABELS[REAL_TERRAIN[hexId]] + ').') +
        (prisoners.length ? '<br>' + prisoners.map(function (g) { return g.name; }).join(', ') + ' (captured) comes along under guard (&sect;11/2).' : ''),
    }, function () {
      checkCapturedGermanEscapes(); // §11/2: anyone left behind unguarded is freed right now
      if (M1.state.phase !== 'movement') { if (onSettled) onSettled(false); return; } // freeing a German can immediately commence Rounds
      runParagraphCheck(mover, function () {
        // REAL BUG, fixed: checkEndingConditions() was called only when a German left the map,
        // when damage was applied, on a capture, and when a US soldier exited — never after an
        // ordinary move. Ending 1 requires four specific hexes occupied AND no active Germans,
        // and the natural way to reach that is to clear the Germans first and then walk into
        // position. That last arrival is an ordinary move, so the condition was satisfied and
        // never noticed: the +4 VP scoring ending was effectively unreachable, which also
        // silently invalidated the reachable-VP ceiling the victory target is scaled from.
        // Found by the automated player (tools/bot/) walking onto T8 and finding nothing happened.
        checkEndingConditions();
        if (M1.state.phase === 'movement') { renderGroupMoveRow(); renderBringPrisonerRow(); renderDestinations(); renderStatusBanner(); }
        // quiet = the hex produced nothing the player must see: the walk may go on.
        if (onSettled) onSettled(M1.state.phase === 'movement' && lastCheckQuiet);
      });
    });
  }

  function renderHud() {
    var s = selectedSoldier();
    if (!s) return;
    document.getElementById('mc-img').src = currentImgFor(s);
    document.getElementById('mc-name').textContent = s.name;
    document.getElementById('mc-stats').innerHTML = 'IN:' + s.IN + ' PC:' + s.PC + ' WS:' + M1.fmtSigned(s.WS) + ' \u00b7 at ' + s.hexId + ' \u00b7 ' + s.stance + kitHtml(s, true);
    document.getElementById('mc-mp').innerHTML = '<span style="color:var(--text-label);">MPA</span> <b>' + s.mpa + '</b> <span style="color:var(--text-label);font-size:10px;">(Rounds only — Operations tracks no MP, &sect;5/3)</span>';
    ['standing', 'crouching', 'prone'].forEach(function (st) { document.getElementById('stance-' + st).classList.toggle('active', s.stance === st); });
    var exitBtn = document.getElementById('exitMapBtn');
    exitBtn.disabled = !canExit(s);
    exitBtn.title = canExit(s) ? s.name + ' can leave the map from ' + s.hexId + '.' : 'Only from a north-edge entry hex (A1–J1).';
    var jamBtn = document.getElementById('clearJamOpsBtn');
    jamBtn.disabled = !canClearJam(s);
    jamBtn.title = s.weaponJammed ? (canClearJam(s) ? s.name + '\'s weapon is jammed — attempt to clear it (§9/4).' : 'Must be standing or crouching to clear a jam.') : 'No jammed weapon to clear.';
  }
  // A stance change is a finished action, and it reads as one: the stance stamps onto his counter
  // with what it allows, the ring closes, and the move markers fade in only after (Wan, 2026-10-23).
  // The state is final at once (renderDestinations runs now); only the showing waits.
  var STANCE_SAYS = { standing: '', crouching: 'crawl 1 hex', prone: 'cannot move' };
  var stanceBeatTimer = null;
  function stanceBeat(s) {
    M1.FX.stamp(s.hexId, s.stance, 'amber', STANCE_SAYS[s.stance], 1400);
    document.body.classList.add('stance-beat');
    clearTimeout(stanceBeatTimer);
    stanceBeatTimer = setTimeout(function () { document.body.classList.remove('stance-beat'); }, 650);
  }
  // §5/3: "A soldier can change his stance" — no MP cost during Operations (that's §6/7's
  // Action-Round-only "one free change, extra costs 1 MP" mechanic). Always free here.
  ['standing', 'crouching', 'prone'].forEach(function (st) {
    document.getElementById('stance-' + st).addEventListener('click', function () {
      if (M1.state.phase !== 'movement') return;
      var s = selectedSoldier();
      if (!s || s.stance === st) return;
      s.stance = st;
      M1.logLine(s.name + ' changes stance to ' + st + '.');
      updateCounterVisual(s);
      renderHud(); renderGroupMoveRow(); renderDestinations(); renderStatusBanner();
      stanceBeat(s);
    });
  });
  // §5/3: Clear Jammed Weapon during Operations — untimed like every other Operations action
  // (no Turns/MP tracked, so nothing is "spent"), unlike the Rounds version which consumes the
  // soldier's Action for the Round.
  document.getElementById('clearJamOpsBtn').addEventListener('click', function () {
    if (M1.state.phase !== 'movement') return;
    var s = selectedSoldier();
    if (!canClearJam(s)) return;
    document.getElementById('clearJamOpsBtn').disabled = true;
    clearJamRoll(s, function () { renderHud(); renderStatusBanner(); });
  });

  // A condition change requested by the paragraph interpreter (ctx.setCondition) mid-chain —
  // applied AFTER the current chain's pop-ups finish, per §5/5: "after completing the
  // instructions called for in the paragraph... replace the current Mission Card."
  var pendingConditionChange = null;

  // §5 step-by-step visibility: Perception/Activation Checks, Event Marker placement, Landmark
  // placement, VP awards, and named procedures all fire synchronously inside
  // Ops.paragraphCheck/readParagraphChain/conditionChange (paragraphinterpreter.js calls
  // ctx.resolveCheck/placeEventMarker/placeLandmark/awardVP/runProcedure directly, mid-computation
  // — there's no natural place to pause for a pop-up). Reused trick: the real roll/effect happens
  // for real, immediately (never faked or deferred) — only the POP-UP explaining it is queued and
  // replayed afterward, same as placeMarkersChain's AR Track rolls and the German target
  // tie-break. Each queued step is tagged with the hex and paragraph that produced it (via the
  // onEnterHex/onEnterParagraph observability hooks, operationsloop.js) so presentParagraphChain
  // can interleave it with the right paragraph's text instead of dumping everything at the end.
  var pendingSteps = [];
  var currentHex = null;
  var currentParagraph = null;

  // ctx.resolveCheck's Perception Check needs a real soldier's PC, but a Condition Change scan
  // (§5/5) walks EVERY occupied hex, potentially several different soldiers, with one shared ctx
  // — operationsloop.js's ctx model doesn't expose which hex is currently being checked back to
  // the caller. JUDGMENT CALL: use the given soldier's PC for the whole scan pass rather than
  // deriving a per-hex PC, documented in docs/31_VICTORY.md.
  function buildOpsCtx(pcSoldier) {
    return Ops.buildContext({
      rollDie: M1.d10,
      activationLevel: MISSION.activation_by_condition[String(M1.state.opsState.condition)],
      defaultPcRating: pcSoldier.PC,
      state: M1.state.opsState,
      // paragraphHex: the incoming id comes straight from a paragraph's `hex` field, so it is
      // hyphenated ("T-8") and must be normalised before it reaches the LOS database.
      // {id, pc}: each soldier in sight rolls his own PC check (Phase 8c; it was the mover's PC).
      soldiersWhoCanSee: function (hexId) { var h = paragraphHex(hexId); return activeUS().filter(function (s) { return losClear(s.hexId, h, s.stance); }).map(function (s) { return { id: s.id, pc: s.PC }; }); },
      isGermanRemovedOnce: function (numericId) { var g = M1.state.germans[germanInstanceId(numericId)]; return !!(g && !g.isActive); },
      onEnterHex: function (hexId) { currentHex = hexId; currentParagraph = null; },
      onEnterParagraph: function (num) { currentParagraph = num; },
      onCheckResolved: function (kind, modifier, roll, result, soldier) {
        pendingSteps.push({ type: 'check', hex: currentHex, paragraph: currentParagraph, kind: kind, modifier: modifier, roll: roll, result: result, soldierId: soldier ? soldier.id : null });
      },
      // 608 ("see 290 if in clear") and 195 (on or under the bridge) ask where the soldier
      // whose check is running stands. The engine has no under-the-bridge position, so a
      // soldier is never "under" one; a hex is a bridge when the LOS data notes a crossing.
      moverIs: function (test) {
        var h = pcSoldier.hexId;
        if (test === 'in_clear') return /^clear/.test(LOS_TERRAIN[h] || '');
        if (test === 'on_bridge') return /bridge/i.test((LOS_DB.hexes[h] || {}).notes || '');
        return false;
      },
      onHiddenFire: function (spec) { pendingSteps.push({ type: 'hidden_fire', hex: currentHex, paragraph: currentParagraph, spec: spec }); },
      // A "place_event_marker"/"place_landmark" op with no explicit hex in its paragraph data
      // means "this hex" (the one whose Paragraph Check is running) — fall back to currentHex.
      onPlaceEventMarker: function (hexId) { pendingSteps.push({ type: 'event_marker', hex: currentHex, paragraph: currentParagraph, hexId: hexId || currentHex }); },
      onPlaceLandmark: function (hexId) { pendingSteps.push({ type: 'landmark', hex: currentHex, paragraph: currentParagraph, hexId: paragraphHex(hexId) || currentHex }); },
      onSetCondition: function (to) { pendingConditionChange = to; },
      onAwardVP: function (amount, note) { pendingSteps.push({ type: 'award_vp', hex: currentHex, paragraph: currentParagraph, amount: amount, note: note }); },
      onRunProcedure: function (name) { pendingSteps.push({ type: 'run_procedure', hex: currentHex, paragraph: currentParagraph, name: name }); },
    });
  }

  // ---- The real Paragraph Check (§5/1) --------------------------------------------
  // Set by every Paragraph Check: did that hex have nothing to say? (task 6's walk stop test)
  var lastCheckQuiet = true;
  function runParagraphCheck(mover, next, opts) {
    opts = opts || {};
    pendingSteps = []; currentHex = mover.hexId; currentParagraph = null;
    var ctx = buildOpsCtx(mover);
    var result = Ops.paragraphCheck({
      hexId: mover.hexId, mission: '1', missionCards: MISSION_CARDS, paragraphs: PARAGRAPHS,
      programs: PROGRAMS, state: M1.state.opsState, ctx: ctx, skipEventCheck: !!opts.skipEventCheck,
      rollForEvent: function () {
        var a = M1.d10(), b = M1.d10();
        pendingSteps.push({ type: 'event_roll', hex: mover.hexId, paragraph: null, a: a, b: b, sum: a + b });
        return a + b;
      },
    });

    lastCheckQuiet = result.effect === 'none' || !!result.skipped;
    // v3 Phase 8b: a hex whose sighting has already happened says so (show the machinery); the
    // walk does not stop for it
    if (result.skipped === 'sighting-already-occurred') {
      M1.logLine(mover.hexId + ': sighting s' + result.sighting + ' has already happened, so its paragraph is crossed off (&sect;5/4).');
    }
    if (lastCheckQuiet) { next(); return; }
    presentParagraphChain(mover, result.chain, mover.hexId, next);
  }

  // ---- Condition Change scan shared by §5/5 (Operations) and §6/11 (Rounds) — same per-hex
  // procedure, ascending hex order, each entry's paragraph chain shown and folded in through the
  // ordinary presentParagraphChain/afterParagraphChain pipeline (which already runs §6/6's
  // mid-Round German-activation procedure for any activate_german effect it finds, whether we're
  // mid-Round or not — no separate activation handling needed here). The two callers below differ
  // only in whether the scan stops at the first activation and what happens once it's done.
  function runConditionChangeScan(to, stopOnActivation, onFinish) {
    M1.logHeader('Condition changes to ' + to + '.');
    M1.Cues.banner('condition', 'Condition ' + to, 'The Germans are more alert', 'alert');
    M1.Cues.kranz('stern', '<b>Alarm!</b> Condition ' + to + '. Unless something closer forces his hand, every one of my men now reads the <b>Condition ' + to +
      '</b> column of his card (' + (M1.state.phase === 'round' ? '&sect;6/11' : '&sect;5/5') + ').');
    var pcSoldier = activeUS()[0];
    if (!pcSoldier) { onFinish(); return; }
    pendingSteps = []; currentHex = null; currentParagraph = null;
    var ctx = buildOpsCtx(pcSoldier);
    var occupiedHexIds = activeUS().map(function (s) { return s.hexId; });
    // Both §5/5 and §6/11 clear all Event markers when the Condition changes — the on-map
    // markers follow.
    Object.keys(eventMarkerEls).forEach(function (id) { eventMarkerEls[id].remove(); });
    eventMarkerEls = {};
    var result = Ops.conditionChange({ to: to, occupiedHexIds: occupiedHexIds, mission: '1', missionCards: MISSION_CARDS, paragraphs: PARAGRAPHS, programs: PROGRAMS, state: M1.state.opsState, ctx: ctx, stopOnActivation: stopOnActivation });

    var entries = result.log; // every hex's outcome, not just ones with a paragraph chain — a
    // bare Event-marker-placed-no-roll entry (§5/5's own text) is still shown via pendingSteps.
    var i = 0;
    function showNextEntry() {
      if (i >= entries.length) { onFinish(); return; }
      var entry = entries[i]; i++;
      var mover = activeUS().filter(function (s) { return s.hexId === entry.hexId; })[0] || pcSoldier;
      presentParagraphChain(mover, entry.chain, entry.hexId, showNextEntry);
    }
    showNextEntry();
  }
  // §5/5: paragraph checks for every occupied hex, ascending order, stopping the instant a
  // German activates ("do not check other hexes"). Only ever entered from Operations (phase
  // 'movement'), so a resulting activation starts a fresh Round 1.
  function runConditionChange(to, next) {
    runConditionChangeScan(to, true, function () {
      if (activeGermans().length && M1.state.phase === 'movement') { startActionRound(1); return; }
      next();
    });
  }
  // §6/11: "Conduct Paragraph Checks for all US occupied hexes... All indicated German
  // activations (if any) occur using the procedure in 6/6... Once all Paragraph Checks and
  // activations are dealt with, return to the Round in progress." Unlike §5/5, does NOT stop at
  // the first activation, and never starts a fresh Round — the Round already in progress simply
  // resumes (`next` returns control to wherever the triggering paragraph chain was — a German's
  // own turn, a US soldier's Round move, or the Event Phase).
  function runRoundsConditionChange(to, next) {
    runConditionChangeScan(to, false, next);
  }

  // Merges the paragraph-text steps (chain.visited) with the queued pendingSteps tagged to this
  // hex, in presentation order: any hex-level steps with no paragraph yet (paragraph: null — e.g.
  // the leading Event Check roll, or a bare marker placement) first, then each paragraph's text
  // followed immediately by the steps its own program produced.
  function buildStepPlan(visited, hexId) {
    var plan = [];
    pendingSteps.filter(function (s) { return s.hex === hexId && s.paragraph === null; }).forEach(function (s) { plan.push(s); });
    visited.forEach(function (num) {
      plan.push({ type: 'paragraph_text', num: num });
      pendingSteps.filter(function (s) { return s.hex === hexId && s.paragraph === num; }).forEach(function (s) { plan.push(s); });
    });
    return plan;
  }

  // A Random Event's paragraph (the plan opens with an Event Check roll; a hex gives a paragraph
  // or an event, never both, §5/1) shows one line on the card and keeps the full text in the
  // radio log, like a German's paragraph. The steps it produces still show on the card.
  var EVENT_READ_MS = 4000;
  function eventLine(num, text) {
    var plain = M1.stripTags(String(text || '').replace(/_x000B_/g, ' ').replace(/¥/g, '')).replace(/\s+/g, ' ').trim();
    var first = (/^.*?[.!?:](?=\s|$)/.exec(plain) || [plain])[0];
    var words = first.split(' ');
    if (words.length > 18) first = words.slice(0, 18).join(' ') + '&hellip;';
    return 'Paragraph <b>' + num + '</b>: ' + first + ' <span class="why">(full text in the log)</span>';
  }
  function presentParagraphChain(mover, chain, hexId, next) {
    chain = chain || { visited: [], effects: [] };
    var plan = buildStepPlan(chain.visited, hexId);
    var fromEvent = plan.some(function (s) { return s.type === 'event_roll'; });
    var i = 0;
    function showNext() {
      if (i >= plan.length) { noteContact(mover, chain); afterParagraphChain(chain, next); return; }
      var step = plan[i]; i++;
      if (step.type === 'paragraph_text') {
        var text = PARAGRAPHS[step.num];
        M1.infoPopup({
          actor: mover, title: 'Paragraph ' + step.num, variant: 'wide', bodyIsParagraph: true,
          bodyHtml: text || '(no text on file)', logHtml: 'Paragraph <b>' + step.num + '</b> read.',
          cardHtml: fromEvent ? eventLine(step.num, text) : undefined, maxReadMs: fromEvent ? EVENT_READ_MS : undefined,
        }, showNext);
        return;
      }
      presentStep(mover, step, showNext);
    }
    showNext();
  }

  // One popup per queued side-effect step, replaying the already-decided real roll where there
  // is one (kind: 'single' with presetValue — same trick as placeMarkersChain).
  function presentStep(mover, step, cb) {
    if (step.type === 'check') {
      var label = step.kind === 'activation' ? 'Activation Check' : 'Perception Check';
      var roller = (step.soldierId && findSoldier(step.soldierId)) || mover;
      var rating = step.kind === 'activation' ? MISSION.activation_by_condition[String(M1.state.opsState.condition)] : roller.PC;
      if (step.soldierId) label += ' — ' + roller.name;
      M1.rollPopup({
        actor: roller, title: label, kind: 'single', presetValue: step.roll,
        contextHtml: label + (step.modifier ? ' (' + M1.fmtSigned(step.modifier) + ')' : '') + ' — rating ' + rating + '.',
        explain: function () { return 'Rolls <b>' + step.roll + '</b> &rarr; <b>' + step.result.toUpperCase() + '</b>.'; },
        logText: function () { return label + ': <span class="roll">' + step.roll + '</span> &rarr; ' + step.result + '.'; },
      }, cb);
      return;
    }
    if (step.type === 'event_roll') {
      var reIndex = M1.pad2(step.sum);
      M1.rollPopup({
        actor: mover, title: 'Event Check', kind: 'dual', diceLabels: ['D1', 'D2'], presetValue: { a: step.a, b: step.b }, maxReadMs: EVENT_READ_MS,
        contextHtml: 'Roll two dice and add them together (&sect;5/6).',
        explain: function () { return 'Sum <b>' + step.sum + '</b> &rarr; Random Event <b>RE-' + reIndex + '</b>.'; },
        logText: function () { return 'Event Check: <span class="roll">' + step.a + ' + ' + step.b + '</span> &rarr; RE-' + reIndex + '.'; },
      }, cb);
      return;
    }
    if (step.type === 'event_marker') {
      // No hex: the paragraph was reached by the Rounds Event Check (§6/1), which belongs to the
      // Round rather than to any hex, so there is no square to mark. Say so plainly instead of
      // announcing a marker "placed at null".
      if (!step.hexId) {
        M1.infoPopup({ actor: mover, title: 'Event Marker', maxReadMs: EVENT_READ_MS, bodyHtml: 'This paragraph calls for an Event marker, but it was reached by the Round&rsquo;s own Event Check rather than by entering a hex (&sect;6/1) &mdash; there is no hex to mark, so none is placed.' }, cb);
        return;
      }
      placeEventMarkerEl(step.hexId);
      M1.infoPopup({ actor: mover, title: 'Event Marker', maxReadMs: EVENT_READ_MS, bodyHtml: 'An Event marker is placed at ' + step.hexId + '. No further Paragraph or Event Checks are made there until the Condition changes.' }, cb);
      return;
    }
    if (step.type === 'landmark') {
      // Same hexless case as the Event marker above.
      M1.infoPopup({
        actor: mover, title: 'Landmark',
        bodyHtml: step.hexId
          ? 'A landmark is placed at ' + step.hexId + '.'
          : 'This paragraph calls for a landmark, but it was reached by the Round&rsquo;s own Event Check rather than by entering a hex (&sect;6/1) &mdash; there is no hex to place it in.',
      }, cb);
      return;
    }
    if (step.type === 'award_vp') {
      M1.state.vpState.awards.push({ amount: step.amount, note: step.note || 'paragraph award' });
      renderVP();
      M1.infoPopup({ actor: mover, title: 'Victory Points', bodyHtml: 'This paragraph awards <b>+' + step.amount + ' VP</b>' + (step.note ? ' (' + step.note + ')' : '') + '.' }, cb);
      return;
    }
    if (step.type === 'hidden_fire') { hiddenFireChain(mover, step.spec, cb); return; }
    if (step.type === 'run_procedure') {
      M1.infoPopup({ actor: mover, title: 'Procedure', bodyHtml: 'Procedure triggered: <b>' + step.name + '</b>.' }, cb);
      return;
    }
    cb();
  }


  // Bug 13 (docs/REFACTOR_MAP.md 3.4): a load abandons whatever chain was running. applySavedState
  // calls this so no paragraph-check queue, walk, combo-move cancel or destination pick from the
  // abandoned position reaches the loaded one.
  function resetOperationsFlow() {
    pendingConditionChange = null;
    pendingSteps = []; currentHex = null; currentParagraph = null;
    lastCheckQuiet = true;
    walking = null;
    pendingCancelAction = null;
    destPicks = {};
    clearTimeout(stanceBeatTimer); stanceBeatTimer = null;
    document.body.classList.remove('stance-beat');
  }

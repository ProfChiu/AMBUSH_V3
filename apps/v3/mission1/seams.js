// mission1/seams.js (13 of 13) — VERBS, verbsOffered, __mission1Debug, AmbushMission. Stage A cut of mission1.js lines 5604-5871 (docs/REFACTOR_MAP.md 5.4).
// Exports to M1: nothing.
// Uses from M1:
//   core: state
//   present: Resolve, lessonRng, stripTags
//   info: Sight
//   roster: allGermans, counterEls, currentImgFor, entryEls, equipmentName, findSoldier, renderVP, shownVP
//   setup: placeNextSoldier, startSquadGeneration
//   operations: deselect, destPicks, lastSelectedId, operationsRoute, roundLegalDestinations, selectSoldier,
//   selectedSoldier, walkRoute
//   contact: activateGermansSequentially
//   rounds: pickActor, picking
//   verbs: allInHex, disableActionButtons, pickupOffers, resolvePickup
//   combat: applyDamage, tryExit
//   save: applySavedState, isSafeToSave, loadSaveList, saveGame, startGameFlow
// Still global (their files are not wrapped yet):
//   core: CHART, D, Dialogs, EQ, FC, G, LOS, LOS_ELEV, LOS_TERRAIN, M, MISSION_CARDS, Ops, REAL_TERRAIN,
//   TERRAIN_LABELS, dialogLog, edgeFeatures, setDifficulty, terrainRowFor, upright
(function () {
  'use strict';
  var M1 = window.AmbushM1;
  // ---------------------------------------------------------------------
  // Automation seam (v2 task 2, docs/02_HANDOFF.md). tools/bot/ plays ONLY through these five
  // calls plus select(); it never reads or clicks the page's markup. When the presentation
  // rewrite changes the DOM, it keeps these answering the same shapes and the bot, pacing.py and
  // autopsy.py keep working unchanged — that is the contract. Every action runs the same
  // handler a player's click runs.
  //
  //   pendingDecision()  the open dialog as data, or null when the board is waiting:
  //                      { kind:'dialog', title, text, phase, buttons:[{id,label,disabled}],
  //                        rows:[{idx,text,odds}] }
  //   choose(i)          pick row i of the open dialog
  //   press(id)          a dialog button while a dialog is open, otherwise a board verb (VERBS);
  //                      false when it is not available (disabled, as a click would be)
  //   clickHex(hexId)    the decision the map is offering at that hex: an entry hex during
  //                      placement, otherwise a destination marker (move, combo move, drag)
  //   select(soldierId)  Operations: make this soldier the one the panel acts for
  //   board()            the state the player can see: phase, soldiers, Germans, VP panel,
  //                      offered destinations/entry hexes, and verbs {name: enabled}
  //   dialogLog()        every dialog presented so far: { title, rows, modeless, phase } (pacing.py)
  //   setPresentation()  kept for old callers: always 'cards', the only presentation;
  //                      pendingDecision() answers { kind:'resolving' } while a card line plays
  // ---------------------------------------------------------------------
  // Verb name -> [panel section, button]. Names are the contract; element ids are this page's.
  var VERBS = {
    'stance:standing': ['movement-sec', 'stance-standing'], 'stance:crouching': ['movement-sec', 'stance-crouching'],
    'stance:prone': ['movement-sec', 'stance-prone'], exitMap: ['movement-sec', 'exitMapBtn'],
    clearJamOps: ['movement-sec', 'clearJamOpsBtn'],
    move: ['action-sec', 'moveBtn'], fireAimed: ['action-sec', 'fireAimed'], fireSnap: ['action-sec', 'fireSnap'],
    assault: ['action-sec', 'assaultBtn'], grenade: ['action-sec', 'grenadeBtn'], drag: ['action-sec', 'dragBtn'],
    giveTurn: ['action-sec', 'giveTurnBtn'], makeAware: ['action-sec', 'makeAwareBtn'],
    changeStance: ['action-sec', 'changeStanceBtn'], prepareWeapon: ['action-sec', 'prepareWeaponBtn'],
    pickup: ['action-sec', 'pickupBtn'], clearJam: ['action-sec', 'clearJamBtn'], pass: ['action-sec', 'passTurn'],
    cancelMove: ['action-sec', 'cancelMoveBtn'],
    newRound: ['round-sec', 'newRoundBtn'],
  };
  function verbsOffered() {
    var out = {};
    Object.keys(VERBS).forEach(function (name) {
      var sec = document.getElementById(VERBS[name][0]), btn = document.getElementById(VERBS[name][1]);
      if (!sec || !btn || sec.style.display === 'none') return;
      if (name === 'cancelMove' && btn.style.display === 'none') return;
      out[name] = !btn.disabled;
    });
    return out;
  }
  var automation = {
    pendingDecision: function () {
      var spec = Dialogs.current;
      if (!spec) return null;
      // A resolution-card line is resolving, not asking: nothing to decide yet, but the board
      // is not waiting for the player either.
      if (spec.modeless) return { kind: 'resolving', title: spec.title || '' };
      return {
        kind: 'dialog', title: spec.title || '', text: Dialogs.bodyText(),
        phase: document.getElementById('tb-phase').textContent,
        buttons: (spec.buttons || []).map(function (b) { return { id: b.id, label: b.label, disabled: !!b.disabled }; }),
        rows: (spec.choices || []).map(function (c, i) { return { idx: i, text: c.text, odds: c.odds }; }),
      };
    },
    choose: function (i) {
      var spec = Dialogs.current;
      if (!spec || !spec.choices || !spec.choices[i]) throw new Error('choose(' + i + '): no such row in the open dialog');
      spec.choices[i].pick();
      return true;
    },
    press: function (id) {
      if (Dialogs.current) return Dialogs.press(id);
      if (id === 'resultDone') return M1.Resolve.pressDone();
      var v = VERBS[id];
      if (!v) throw new Error('press(' + id + '): no dialog is open and that is not a verb');
      var btn = document.getElementById(v[1]);
      if (btn.disabled) return false;
      btn.click(); // the button's own handler — same code path as the player's click
      return true;
    },
    clickHex: function (hexId) {
      if (M1.state.phase === 'entry' && M1.entryEls[hexId]) { M1.placeNextSoldier(hexId); return true; }
      if (M1.destPicks[hexId]) { M1.destPicks[hexId](); return true; }
      // Task 6: in Operations any hex with a wall-aware route is a destination — the soldier
      // walks it and stops when something happens.
      if (M1.state.phase === 'movement' && M1.selectedSoldier() && M1.walkRoute(hexId)) return true;
      throw new Error('clickHex(' + hexId + '): the map offers no decision there');
    },
    pickActor: function (soldierId) { return M1.pickActor(soldierId); },
    select: function (soldierId) {
      if (M1.state.phase !== 'movement' || !M1.counterEls[soldierId] || !M1.findSoldier(soldierId)) return false;
      if (M1.state.selectedId !== soldierId) M1.selectSoldier(soldierId);
      return true;
    },
    board: function () {
      var shownSel = M1.state.selectedId && M1.counterEls[M1.state.selectedId] && M1.counterEls[M1.state.selectedId].classList.contains('selected') ? M1.state.selectedId : null;
      return {
        phase: M1.state.phase, roundNum: M1.state.roundNum, condition: M1.state.opsState ? M1.state.opsState.condition : null,
        currentActorId: M1.state.currentActorId, selectedId: shownSel, lastSelectedId: M1.lastSelectedId,
        us: M1.state.usSoldiers.map(function (s) {
          return { id: s.id, letter: s.letter, hexId: s.hexId, stance: s.stance, status: s.status,
            isActive: !!s.isActive, exited: !!s.exited, aware: !!s.aware, mpa: s.mpa,
            weaponId: s.weaponId, PC: s.PC, WS: s.WS, IN: s.IN,
            jammed: !!s.weaponJammed, broken: !!s.weaponBroken };
        }),
        germans: M1.allGermans().map(function (g) {
          return { id: g.id, hexId: g.hexId, status: g.status, isActive: !!g.isActive, role: g.card.Role };
        }),
        vp: { gained: M1.shownVP.gained, lost: M1.shownVP.lost, total: M1.shownVP.total, need: M1.shownVP.need },
        casualties: M1.state.vpState.usCasualties, activations: M1.state.vpState.germanActivations.length,
        dests: Object.keys(M1.destPicks),
        entryHexes: M1.state.phase === 'entry' ? Object.keys(M1.entryEls) : [],
        verbs: verbsOffered(),
        // v3: the soldiers the player may pick (§6/1)
        pickable: M1.picking ? M1.picking.ids.slice() : [],
        presentation: 'cards',
        banner: document.getElementById('status-banner').textContent || '',
      };
    },
    dialogLog: function () { return dialogLog.slice(); },
    setPresentation: function () { return 'cards'; },
  };

  // The console seam for tools/: the automation calls above, plus the hooks tools/bot and
  // tools/live_save.py use (R2 removed the 36 *ForTesting hooks nothing called). Each drives the
  // same production function a player's action runs.
  window.__mission1Debug = {
    pendingDecision: automation.pendingDecision, choose: automation.choose, press: automation.press,
    clickHex: automation.clickHex, select: automation.select, pickActor: automation.pickActor, board: automation.board,
    dialogLog: automation.dialogLog, setPresentation: automation.setPresentation,
    tryExit: function () { var s = M1.selectedSoldier(); if (s) M1.tryExit(s); },
    // currentActorId matters as much as the track itself for anything driving a Round from
    // outside: the AR Track says whose turn it SHOULD be, this says whose turn the game is
    // actually presenting. Its absence silently broke the automated player (tools/bot/), which
    // read undefined and so could never identify the acting soldier — reducing every Rounds turn
    // to "fire or pass" and freezing 27 of 30 test games in an endless firefight.
    state: function () { return { phase: M1.state.phase, usSoldiers: M1.state.usSoldiers, germans: M1.state.germans, vpState: M1.state.vpState, opsState: M1.state.opsState, track: M1.state.track, roundNum: M1.state.roundNum, currentActorId: M1.state.currentActorId }; },
    // Passes hexId straight through as eff.hex, the same shape a real activate_german effect
    // uses — exercises the exact production code path instead of spawning at a placeholder and
    // patching the position afterward, which raced against the reveal pop-up/scroll once
    // activateGermansSequentially stopped being fully synchronous.
    spawnGermanForTesting: function (cardId, hexId) {
      M1.activateGermansSequentially([{ ids: [cardId.replace(/^GE /, '').replace(/\/.*/, '')], hex: hexId, stance: 'crouching' }], 0, function () {});
    },
    saveGame: M1.saveGame,
    listSaves: M1.loadSaveList,
    loadSaveAtIndex: function (i) { var list = M1.loadSaveList(); if (list[i] !== undefined) M1.applySavedState(list[i]); },
    isSafeToSave: M1.isSafeToSave,
    // Console-only verification hook for §13/2's Port Box loss on wound (task 61) — drives the
    // real applyDamage('W') path directly, since reaching a specific soldier's wound naturally
    // depends on random fire-combat outcomes.
    applyWoundForTesting: function (soldierId) { var s = M1.findSoldier(soldierId); if (s) M1.applyDamage(s, 'W', 'test'); },
    groundItemsForTesting: function () { return M1.state.groundItems; },
    // Wall-aware Operations pathfinding, exposed for the automated player. The bot steps toward a
    // goal by picking whichever adjacent hex is nearest by raw hex distance, which walks it
    // straight into a building wall and oscillates for ever — K12 and L12 are both "closer to
    // K13" than each other, and neither can actually reach it. Rather than teach the bot the
    // wall rules (a second, driftable copy of them), this hands it the game's own answer.
    // Returns the next hex to step to, or null if the goal is unreachable.
    operationsNextStepForTesting: function (fromHexId, goalHexId) {
      var route = M1.operationsRoute(fromHexId, goalHexId); // same search, now shared with the walk
      return route && route.length ? route[0] : null;
    },
  };

  M1.renderVP(); // populates the Objectives float window body even if it's opened before any game starts
  // v3: the mission card on the shell's mission select picks the difficulty (brief, Phase 2), so
  // the shell starts the mission; v2's start dialog (startGameFlow) is not shown.
  window.AmbushMission = {
    start: function (level) {
      setDifficulty(level === 'easy' ? D.EASY : D.NORMAL);
      M1.startSquadGeneration();
    },
    // v3 punch list 2 (stack.js): everything in one hex, what each token carries, and what the
    // player may do from there: pick/select a soldier, or (in a Round) have the current actor take
    // an item, the same Pick Up / Exchange code as v2's button (§5/3, §6/7).
    stack: function (hexId) {
      var actor = M1.state.phase === 'round' && M1.state.currentActorId && !M1.picking ? M1.findSoldier(M1.state.currentActorId) : null;
      if (actor && actor.side === 'german') actor = null;
      var pickupBtn = document.getElementById('pickupBtn');
      var canTake = !!actor && actor.hexId === hexId && !pickupBtn.disabled && !Dialogs.current &&
        document.getElementById('action-sec').style.display !== 'none';
      var offers = canTake ? M1.pickupOffers(actor) : [];
      function gear(t) {
        if (t.side === 'german') return t.weaponId ? [M1.equipmentName(t.weaponId)] : [];
        if (!t.inventory) return [];
        // an Ammo Box holds a clip for a weapon, or a grenade
        return EQ.carriedItemIds(t.inventory).map(M1.equipmentName)
          .concat(t.inventory.ammoBoxes.filter(Boolean).map(function (id) { return id === 'gren' ? 'Grenade' : 'Clip: ' + M1.equipmentName(id); }));
      }
      return {
        hexId: hexId,
        actor: actor ? { id: actor.id, name: actor.name, here: actor.hexId === hexId } : null,
        takeWhy: !actor ? '' : actor.hexId !== hexId ? actor.name + ' is not in this hex.' :
          canTake ? '' : !upright(actor) ? 'He must be standing or crouching (§6/7).' :
          (actor.stance === 'standing' && M1.allInHex(hexId).some(function (t) { return t.id !== actor.id && !t.isActive; }))
            ? 'Taking equipment from an inactive soldier needs him crouching (§6/7).' :
          M1.allInHex(hexId).some(function (t) { return t.side !== actor.side && t.isActive && t.weaponId; })
            ? 'A German keeps his weapon until he is killed, incapacitated or captured (§6/7, §14).' : 'Nothing here he can take.',
        tokens: M1.allInHex(hexId).filter(function (t) { return !t.exited && (t.side !== 'german' || M1.counterEls[t.id]); }).map(function (t) {
          var act = M1.state.phase === 'movement' && t.side !== 'german' && t.isActive ? 'select' :
            M1.picking && M1.picking.ids.indexOf(t.id) !== -1 ? 'pick' : '';
          return { id: t.id, name: t.name, letter: t.letter, side: t.side, stance: t.stance, status: t.status,
            isActive: !!t.isActive, img: M1.currentImgFor(t), gear: gear(t), act: act,
            current: t.id === M1.state.currentActorId, selected: t.id === M1.state.selectedId };
        }),
        ground: (M1.state.groundItems[hexId] || []).map(function (it) { return M1.equipmentName(it.id); }),
        offers: offers.map(function (o, i) { return { idx: i, from: o.from, item: o.item, label: M1.stripTags(o.label) }; }),
      };
    },
    hexOf: function (id) { var t = M1.findSoldier(id); return t ? t.hexId : null; },
    actOn: function (id) {
      if (M1.picking) return M1.pickActor(id);
      if (M1.state.phase === 'movement' && M1.counterEls[id] && M1.findSoldier(id).side !== 'german') { M1.selectSoldier(id); return true; }
      return false;
    },
    take: function (idx) {
      var actor = M1.findSoldier(M1.state.currentActorId), st = this.stack(actor.hexId);
      if (!st.offers[idx]) return false;
      M1.disableActionButtons();
      M1.resolvePickup(actor, M1.pickupOffers(actor)[idx]);
      return true;
    },
    // v2's own start dialog (Normal / Easy / Load): index.html?play=ask, so the bot picks the level
    // exactly as it does on v2's page
    ask: function () { M1.startGameFlow(); },
    // v3 Phase 6 (lesson.js): a lesson opens on a saved position (a fixture, the same shape a save
    // has) and rolls from its own seeded stream; the bot's seam reads the board while it runs.
    lesson: {
      load: function (data, rng) {
        M1.lessonRng = rng || null;
        M1.applySavedState(JSON.parse(JSON.stringify(data)));
        // v3 opens Operations with nobody selected (punch list 3); a load selects the first soldier
        if (M1.state.phase === 'movement') M1.deselect();
      },
      board: automation.board, pending: automation.pendingDecision,
      // the German side, revealed the way a paragraph's activate_german effect reveals it
      activate: function (cardId, hexId, stance) {
        M1.activateGermansSequentially([{ ids: [String(cardId)], hex: hexId, stance: stance || 'crouching' }], 0, function () {});
      },
      // Phase 7b (chapter 3): what the map says about a hex, from the functions the game itself
      // asks (the movement chart, the fire chart's terrain row, traceLOS), so a puzzle's answer
      // and its refusal are the engine's, never a copy. soldierId: whose move and stance; targetId:
      // whom he would look at from there.
      facts: function (hexId, soldierId, targetId) {
        var s = soldierId ? M1.findSoldier(soldierId) : null, t = targetId ? M1.findSoldier(targetId) : null;
        var terrain = REAL_TERRAIN[hexId], row = terrainRowFor(hexId), mod = {};
        ['standing', 'crouching', 'prone'].forEach(function (st) {
          mod[st] = FC.canBeFiredAt(CHART.FIRE_MODS_TERRAIN, row, st) ? FC.resolveTerrainMod(CHART.FIRE_MODS_TERRAIN, row, st) : null;
        });
        var d = s && M1.state.phase === 'round' ? M1.roundLegalDestinations(s)[hexId] : null;
        var out = { hex: hexId, terrain: terrain, label: TERRAIN_LABELS[terrain] || terrain || 'unknown',
          mp: M.mpCost(terrain), reach: d ? d.cost : null, mpa: s ? s.mpa : null, row: row, mod: mod,
          cover: row === 0 ? 'no cover' : row <= 3 ? 'light cover' : 'good cover',
          adjacent: !!(s && FC.hexDistance(s.hexId, hexId) === 1) };
        // Phase 8b (chapter 5): the hex's cell on the mission card, read by the engine's own parser
        var cid = G.printedIdToCartridgeId(hexId), grid = M1.state.opsState && MISSION_CARDS['1'][String(M1.state.opsState.condition)];
        var raw = cid && grid ? grid[cid] : null, cell = Ops.parseCellValue(raw);
        out.cell = { raw: raw, type: cell.type, paragraph: cell.paragraph || null, sighting: cell.sighting || null,
          occurred: !!(cell.sighting && M1.state.opsState.sightingsOccurred[cell.sighting]), marker: !!(M1.state.opsState && M1.state.opsState.eventMarkers[hexId]) };
        if (t) {
          var r = LOS.traceLOS({ fromId: hexId, toId: t.hexId, elevationByHexId: LOS_ELEV, terrainByHexId: LOS_TERRAIN,
            edgeFeatures: edgeFeatures, fromStance: s ? s.stance : 'standing', toStance: t.stance });
          var bt = r.hexId ? REAL_TERRAIN[r.hexId] : null;
          out.los = { clear: !r.blocked, block: r.hexId || null, blockLabel: bt ? (TERRAIN_LABELS[bt] || bt) : null,
            reason: r.reason || null, path: r.path || [], range: FC.hexDistance(hexId, t.hexId) };
        }
        return out;
      },
      sight: function (fromHex, toHex, fromStance, toStance) { return M1.Sight.draw(fromHex, toHex, fromStance, toStance); },
      unsight: function () { M1.Sight.clear(); },
    },
  };
})();

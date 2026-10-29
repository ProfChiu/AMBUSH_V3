// mission1/save.js (12 of 13) — save/load, start screen, game flow. Stage A cut of mission1.js lines 5324-5603 (docs/REFACTOR_MAP.md 5.4).
// Exports to M1 (5): applySavedState, isSafeToSave, loadSaveList, saveGame, startGameFlow
// Uses from M1:
//   core: state
//   present: logHeader
//   roster: activeUS, canvas, counterEls, entryEls, eventMarkerEls, findSoldier, makeCounter, placeEl,
//   placeEventMarkerEl, renderRoster, renderVP, updateCounterVisual
//   setup: placeNextSoldier, promptPlaceSoldier, startSquadGeneration
//   operations: clearDestMarks, resetOperationsFlow, selectSoldier
//   contact: resetContactFlow
//   rounds: driveNext, renderTrack, resetRoundFlow
// Still global (their files are not wrapped yet):
//   core: D, Dialogs, ENTRY_HEXES, Sched, Toasts, V, VP_REQUIREMENT_RULEBOOK, setDifficulty, vpReachable
(function () {
  'use strict';
  var M1 = window.AmbushM1;
  // Exported functions (hoisted, so they are on M1 before any line below runs).
  M1.applySavedState = applySavedState; M1.isSafeToSave = isSafeToSave; M1.loadSaveList = loadSaveList;
  M1.saveGame = saveGame; M1.startGameFlow = startGameFlow;
  // ---------------------------------------------------------------------
  // Save / Load — localStorage for a quick same-browser save, plus export/import to a JSON
  // file for portability (same "no server, client-side file only" constraint as Download Log).
  //
  // Every module-level piece of real game state (usSoldiers, germans, opsState, vpState, track,
  // etc.) is plain JSON-safe data — no DOM nodes or functions live on these objects — so a
  // straight JSON.stringify/parse round-trip is enough for the DATA. The DOM (counters, entry
  // markers, Event marker overlays, which HUD sections are visible) is never serialized; it's
  // rebuilt fresh from the restored data by applySavedState(), the same way startOperations()/
  // startActionRound()/etc. build it fresh from scratch today.
  //
  // Saving is only allowed at a genuinely quiescent moment — no popup open, and not mid-way
  // through picking a Move destination (an uncommitted UI selection, not real state) — because
  // the game is a step-by-step popup chain (pendingSteps/currentHex/currentParagraph) with no
  // well-defined "resume" point mid-chain. Every point where the player is actually waiting to
  // choose something (soldier selection, an entry hex, an Action Round's action panel) already
  // has no popup open, so this isn't a real restriction on normal play.
  // Multiple slots, most-recent-last, capped at MAX_SAVES — saveGame() evicts the oldest (index 0)
  // once the cap is exceeded. Each entry IS a serializeState() snapshot (it already carries its
  // own savedAt/version), so there's no separate metadata wrapper to keep in sync.
  // v3's own key (R5 Step 8, docs/REFACTOR_MAP.md 4.4 item 15). Under file:// every local page
  // shares one origin, so v2 and v3 shared 'ambush-mission1-saves-v1' and could load each other's
  // saves. On the first open of v3 (its key absent), the old list is copied in once; the old key
  // is left exactly as it is for v2. Writing the key (even an empty list) marks the import done.
  var SAVE_LIST_KEY = 'ambush.v3.saves';
  var OLD_SAVE_LIST_KEY = 'ambush-mission1-saves-v1';
  function importOldSaves() {
    try {
      if (localStorage.getItem(SAVE_LIST_KEY) !== null) return;
      var old = localStorage.getItem(OLD_SAVE_LIST_KEY);
      localStorage.setItem(SAVE_LIST_KEY, old !== null ? old : '[]');
    } catch (e) { /* storage blocked: no saves either way */ }
  }
  importOldSaves();
  var MAX_SAVES = 10;
  // Any queue item, modal or a resolution-card line: mid-chain is never a safe save point.
  function popupOpen() { return !!Dialogs.current; }
  function isSafeToSave() {
    if (popupOpen()) return false;
    if (M1.state.phase === 'squadgen' || M1.state.phase === 'over') return false;
    if (M1.state.phase === 'round' && document.getElementById('cancelMoveBtn').style.display !== 'none') return false; // mid Move destination-pick
    return true;
  }
  function serializeState() {
    return {
      version: 2, savedAt: Date.now(), phase: M1.state.phase, difficulty: M1.state.difficulty,
      usSoldiers: M1.state.usSoldiers, germans: M1.state.germans, opsState: M1.state.opsState, vpState: M1.state.vpState,
      track: M1.state.track, currentActorId: M1.state.currentActorId, roundNum: M1.state.roundNum,
      currentGermanIdsThisRound: M1.state.currentGermanIdsThisRound, entryIndex: M1.state.entryIndex, selectedId: M1.state.selectedId,
      // version 2 (R5, bug 12): the items lying on the map. A version-1 save has none.
      groundItems: M1.state.groundItems,
    };
  }
  function loadSaveList() {
    try { var raw = localStorage.getItem(SAVE_LIST_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }
  function describeSave(state) {
    var totals = V.computeVPTotal(state.vpState);
    var where = state.phase === 'entry' ? 'Entry placement'
      : state.phase === 'movement' ? 'Operations'
      : state.phase === 'round' ? 'Action Round ' + (state.roundNum || '?')
      : state.phase;
    return where + ' &middot; ' + totals.total + ' VP';
  }
  function saveGame() {
    if (!isSafeToSave()) { Toasts.show('Can\'t save mid-step — finish the current action first.'); return false; }
    var list = loadSaveList();
    list.push(serializeState());
    while (list.length > MAX_SAVES) list.shift(); // oldest first in, oldest first evicted
    try {
      localStorage.setItem(SAVE_LIST_KEY, JSON.stringify(list));
      Toasts.show('Game saved (' + list.length + '/' + MAX_SAVES + ').', { kind: 'success' });
      return true;
    } catch (e) { Toasts.show('Save failed: ' + e.message); return false; }
  }
  function applySavedState(data) {
    // A fresh page load auto-starts Squad Generation (its first popup can already be open by the
    // time the player clicks Load instead of playing through it) — force-close it so its callback
    // chain can never fire afterward and act on the state we're about to replace.
    Dialogs.reset();
    // Bug 13: the chains Dialogs.reset() just stopped leave their state behind; drop it too.
    M1.resetOperationsFlow(); M1.resetContactFlow(); M1.resetRoundFlow();
    Object.keys(M1.counterEls).forEach(function (k) { M1.counterEls[k].remove(); }); M1.counterEls = {};
    M1.clearDestMarks();
    Object.keys(M1.entryEls).forEach(function (k) { M1.entryEls[k].remove(); }); M1.entryEls = {};
    Object.keys(M1.eventMarkerEls).forEach(function (k) { M1.eventMarkerEls[k].remove(); }); M1.eventMarkerEls = {};

    M1.state.usSoldiers = data.usSoldiers; M1.state.germans = data.germans; M1.state.phase = data.phase;
    // `aware` (§6/5) postdates this field's introduction — a save written before it has none, so
    // default to already-aware rather than false: the concept didn't exist yet at save time, and
    // those soldiers were already acting normally, not sitting immobile.
    M1.state.usSoldiers.forEach(function (s) { if (s.aware === undefined) s.aware = true; });
    // Saves written before Easy mode existed carry no difficulty; they were all played on the
    // rulebook settings, so Normal is the correct default rather than a guess.
    setDifficulty(data.difficulty === D.EASY ? D.EASY : D.NORMAL);
    M1.state.opsState = data.opsState; M1.state.vpState = data.vpState; M1.state.track = data.track;
    // germanActivations/awards postdate the §2/1 VP fix — a save written before it has neither,
    // so default them rather than letting computeVPTotal reduce over undefined.
    M1.state.vpState.germanActivations = M1.state.vpState.germanActivations || [];
    M1.state.vpState.awards = M1.state.vpState.awards || [];
    M1.state.vpState.germanDefeats = M1.state.vpState.germanDefeats || [];
    M1.state.vpState.usCasualties = M1.state.vpState.usCasualties || [];
    M1.state.currentActorId = data.currentActorId; M1.state.roundNum = data.roundNum || 0;
    M1.state.currentGermanIdsThisRound = data.currentGermanIdsThisRound || [];
    M1.state.entryIndex = data.entryIndex || 0; M1.state.selectedId = data.selectedId || null;
    // Bug 12: version 2 saves the ground; a version-1 save has no field, so its ground is empty
    // (never the previous position's items).
    M1.state.groundItems = data.groundItems || {};

    M1.state.usSoldiers.forEach(function (s) {
      if (s.exited || !s.hexId) return;
      M1.makeCounter(s, s.hexId);
      M1.updateCounterVisual(s);
    });
    Object.keys(M1.state.germans).forEach(function (cardId) {
      var g = M1.state.germans[cardId];
      M1.makeCounter(g, g.hexId);
      M1.updateCounterVisual(g);
    });
    Object.keys(M1.state.opsState.eventMarkers || {}).forEach(function (hexId) { M1.placeEventMarkerEl(hexId); });

    M1.renderRoster();
    M1.renderVP();

    document.getElementById('roster-sec').style.display = '';
    document.getElementById('movement-sec').style.display = 'none';
    document.getElementById('action-sec').style.display = 'none';
    document.getElementById('track-sec').style.display = 'none';
    document.getElementById('round-sec').style.display = 'none';
    document.getElementById('cancelMoveBtn').style.display = 'none';

    if (M1.state.phase === 'entry') {
      document.getElementById('tb-phase').textContent = 'Entry Placement';
      ENTRY_HEXES.forEach(function (hexId) {
        var el = document.createElement('div');
        el.className = 'entry-hex';
        M1.placeEl(el, hexId);
        el.title = hexId;
        el.addEventListener('click', function (e) { e.stopPropagation(); M1.placeNextSoldier(hexId); });
        M1.canvas.appendChild(el);
        M1.entryEls[hexId] = el;
      });
      M1.promptPlaceSoldier();
    } else if (M1.state.phase === 'movement') {
      document.getElementById('tb-phase').textContent = 'Operations';
      document.getElementById('movement-sec').style.display = '';
      if (M1.activeUS().length) M1.selectSoldier(M1.state.selectedId && M1.findSoldier(M1.state.selectedId) ? M1.state.selectedId : M1.activeUS()[0].id);
    } else if (M1.state.phase === 'round') {
      document.getElementById('tb-phase').textContent = 'Round ' + M1.state.roundNum;
      document.getElementById('track-sec').style.display = '';
      if (Sched.isRoundComplete(M1.state.track)) {
        M1.renderTrack();
        document.getElementById('round-sec').style.display = '';
        document.getElementById('tb-phase').textContent = 'Round ' + M1.state.roundNum + ' complete';
        document.getElementById('status-banner').textContent = 'Round complete. Continue the fight.';
      } else {
        document.getElementById('status-banner').textContent = 'Contact! Action Round in progress.';
        M1.driveNext();
      }
    }
    M1.logHeader('Game loaded' + (data.savedAt ? ' (saved ' + new Date(data.savedAt).toLocaleString() + ')' : '') + '.');
  }
  // Lets the player pick which of the (up to MAX_SAVES) saved games to resume, newest first,
  // each row showing when it was saved and a short "where you were" descriptor.
  // onCancel: optional — called if the player backs out without loading anything. The mid-game
  // "Load" button leaves onCancel unset (there's already a live game underneath to fall back to);
  // the startup dialog passes one so Cancel returns to the start-screen choice instead of leaving
  // the game un-started with nothing on screen.
  function openLoadDialog(onCancel) {
    var list = loadSaveList();
    if (!list.length) { Toasts.show('No saved games found.'); if (onCancel) onCancel(); return; }
    Dialogs.push({
      title: 'Load Game', variant: 'wide', allowEnter: false, allowEscape: true, escapeButtonId: 'cancel',
      buttons: [{ id: 'cancel', label: 'Cancel' }],
      render: function (ctx) {
        var rows = list.slice().reverse(); // newest first
        var html = rows.map(function (state, i) {
          var idx = list.length - 1 - i;
          return '<div class="save-row" data-idx="' + idx + '">' +
            '<span class="save-ts">' + new Date(state.savedAt).toLocaleString() + '</span>' +
            '<span class="save-desc">' + describeSave(state) + '</span></div>';
        }).join('');
        ctx.bodyEl.innerHTML = '<div class="save-list">' + html + '</div>';
        Array.prototype.forEach.call(ctx.bodyEl.querySelectorAll('.save-row'), function (row) {
          row.addEventListener('click', function () { applySavedState(list[parseInt(row.dataset.idx, 10)]); });
        });
      },
      onButton: function (id, ctx) { ctx.close(); },
      onClose: function () { if (onCancel) onCancel(); }, // fires on Cancel/Escape only — a real
      // row pick goes through applySavedState()'s Dialogs.reset(), which bypasses onClose entirely.
    });
  }
  document.getElementById('saveGameBtn').addEventListener('click', saveGame);
  document.getElementById('loadGameBtn').addEventListener('click', function () { openLoadDialog(); });

  // ---------------------------------------------------------------------
  // Start screen — shown once, on page load, instead of jumping straight into Squad Generation.
  // ---------------------------------------------------------------------
  function startGameFlow() {
    var saves = loadSaveList();
    Dialogs.push({
      title: 'Ambush! Digital — Mission 1', variant: 'narrow', allowEnter: true, allowEscape: false,
      buttons: [
        { id: 'normal', label: 'Start — Normal', variant: 'amber' },
        { id: 'easy', label: 'Start — Easy' },
        { id: 'load', label: 'Load Game', disabled: !saves.length },
      ],
      render: function (ctx) {
        // Spell out exactly what Easy changes before the player picks. The mode is a set of
        // stated, visible adjustments, not a vague "easier" — so it is described up front and
        // repeated in the Objectives window for the rest of the mission.
        ctx.bodyEl.innerHTML = '<div class="step-context">' +
          '<b>Normal</b> &mdash; ' + D.settings(D.NORMAL).blurb +
          ' Victory target <b>' + V.scaleRequirement(vpReachable.ceiling, VP_REQUIREMENT_RULEBOOK, D.vpMargin(D.NORMAL)).requirement + ' VP</b>.' +
          '<br><br><b>Easy</b> &mdash; ' + D.settings(D.EASY).blurb +
          ' Victory target <b>' + V.scaleRequirement(vpReachable.ceiling, VP_REQUIREMENT_RULEBOOK, D.vpMargin(D.EASY)).requirement + ' VP</b>.' +
          '<ul style="text-align:left; margin:8px 0 0; padding-left:20px; line-height:1.6;">' +
          D.describe(D.EASY).map(function (line) { return '<li>' + line + '</li>'; }).join('') +
          '</ul><br>' +
          (saves.length ? saves.length + ' saved game' + (saves.length === 1 ? '' : 's') + ' available.' : 'No saved games found.') +
          '</div>';
      },
      onButton: function (id, ctx) { ctx.close(id); },
      onClose: function (id) {
        if (id === 'load') { openLoadDialog(function () { startGameFlow(); }); return; }
        setDifficulty(id === 'easy' ? D.EASY : D.NORMAL);
        M1.startSquadGeneration();
      },
    });
  }
  document.getElementById('exportSaveBtn').addEventListener('click', function () {
    if (!isSafeToSave()) { Toasts.show('Can\'t save mid-step — finish the current action first.'); return; }
    var blob = new Blob([JSON.stringify(serializeState(), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ambush-mission1-save-' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  document.getElementById('importSaveBtn').addEventListener('click', function () { document.getElementById('importSaveFile').click(); });
  document.getElementById('importSaveFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = ''; // allow re-importing the same filename later
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (err) { Toasts.show('That file is not a valid save.'); return; }
      applySavedState(data);
    };
    reader.readAsText(file);
  });

  // Debugging aid — dumps the visible play log plus a full state snapshot to a downloadable
  // .txt file. No server to persist to (this is a static file:// app), so a client-side download
  // is the whole mechanism.
  document.getElementById('downloadLogBtn').addEventListener('click', function () {
    var lines = Array.prototype.map.call(document.querySelectorAll('#combatlog .log-line'), function (el) { return el.textContent; });
    var text = 'Ambush! Digital — Mission 1 play log — ' + new Date().toISOString() + '\n\n' +
      lines.join('\n') + '\n\n---- state dump ----\n' + JSON.stringify(window.__mission1Debug.state(), null, 2) + '\n';
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ambush-mission1-log-' + Date.now() + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  document.getElementById('resetBtn').addEventListener('click', function () { location.reload(); });
})();

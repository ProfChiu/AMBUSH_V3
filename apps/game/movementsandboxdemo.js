/*
 * movementsandboxdemo.js — Phase 4 movement sandbox content (docs/11_GAME_BUILD_PHASES.md)
 *
 * Drives apps/game/movementsandbox.html: real Map A, the real (user-corrected) terrain
 * database, and the real rules engine (movementrules.js) — no canned/fake reachability,
 * only the squad roster, starting positions, and paragraph-trigger hexes are demo data,
 * same convention as ambushdemo.js/mainscreendemo.js. Paragraph text is placeholder —
 * the paragraph interpreter is Phase 6; this only proves the hex-entry -> dialog wiring.
 *
 * No Action Round turn order yet (Phase 8) — this is the movement action in isolation,
 * matching the phase brief's "movement sandbox," not a full Round.
 */
(function () {
  'use strict';

  var ASSET = '../../assets/library/';
  function img(path) { return ASSET + path; }

  var UI = window.AmbushUI;
  UI.init('dialogs-root');
  var Dialogs = UI.Dialogs, Toasts = UI.Toasts, Float = UI.FloatDialogs;

  var G = window.AmbushHexGrid;
  var M = window.AmbushMovement;
  var TERRAIN = window.AMBUSH_TERRAIN_A;
  var REAL_TERRAIN = {};
  TERRAIN.hexes.forEach(function (h) { REAL_TERRAIN[h.id] = h.terrain_guess; });

  var TERRAIN_LABELS = {
    clear1: 'Clear (L1)', clear2: 'Clear (L2)', clear3: 'Clear (L3)', cover: 'Cover',
    brush: 'Brush', rough: 'Rough', woods: 'Woods', water: 'River / Stream',
    road: 'Road', dirt_road: 'Dirt Road', bridge: 'Bridge', ford: 'Ford',
    building: 'Building', interior: 'Interior', second_story: 'Second Story',
    railroad: 'Railroad', crater: 'Crater', rubble: 'Rubble', river: 'River',
  };
  function terrainLabel(key) { return TERRAIN_LABELS[key] || key || 'Unknown'; }

  // ---------------------------------------------------------------------
  // Roster — starting hexes chosen from the real, reviewed terrain database
  // (mixed Clear/Cover/Woods, per docs/16_MOVEMENT.md) with one enemy contact
  // placed to demonstrate the mandatory-stop rule (§7/3).
  // ---------------------------------------------------------------------
  var soldiers = [
    { id: 'A', name: 'Soldier A', role: 'US Runner', img: img('soldiers/us_soldier_A_standing.png'), imgCrouch: img('soldiers/us_soldier_A_crouching.png'),
      mpa: 4, stats: 'IN:3 PC:5 WS:-1 MPA:4', hexId: 'B2', stance: M.STANCE.STANDING, mpRemaining: 4, usedFreeStanceChange: false },
    { id: 'B', name: 'Soldier B', role: 'US Jeep Driver', img: img('soldiers/us_soldier_B_standing.png'), imgCrouch: img('soldiers/us_soldier_B_crouching.png'),
      mpa: 4, stats: 'IN:2 PC:3 WS:-2 MPA:4', hexId: 'B3', stance: M.STANCE.CROUCHING, mpRemaining: 4, usedFreeStanceChange: false },
    { id: 'C', name: 'Soldier C', role: 'US Runner', img: img('soldiers/us_soldier_C_standing.png'), imgCrouch: img('soldiers/us_soldier_C_crouching.png'),
      mpa: 3, stats: 'IN:1 PC:2 WS:-2 MPA:3', hexId: 'B4', stance: M.STANCE.STANDING, mpRemaining: 3, usedFreeStanceChange: false },
  ];
  var enemyHexes = ['C4'];

  // Placeholder Paragraph Check triggers — a couple of hexes near the demo area, canned
  // sample content (not real paragraph-book text; see header note).
  var PARAGRAPH_TRIGGERS = {
    C3: { num: 214, text: 'The hedgerow ahead thins into a gap wide enough for a jeep. Someone left tire tracks in the mud, still soft.' },
    D3: { num: 118, text: 'A shutter bangs against a windowsill somewhere close. No further sound follows.' },
  };

  var LOG = [];
  function logLine(html) {
    LOG.unshift(html);
    var el = document.getElementById('turnlog');
    el.innerHTML = LOG.map(function (l) { return '<div class="log-line">' + l + '</div>'; }).join('');
  }

  // ---------------------------------------------------------------------
  // Map rendering
  // ---------------------------------------------------------------------
  var canvas = document.getElementById('map-canvas');
  var counterEls = {};
  var destEls = {};
  var pathEls = [];

  function pctPos(hexId) {
    var p = G.parseId(hexId);
    var px = G.hexToPixel(p.colIdx, p.rowIdx);
    return { left: px.pctX, top: px.pctY };
  }

  function currentImg(s) { return s.stance === M.STANCE.CROUCHING ? s.imgCrouch : s.img; }

  soldiers.forEach(function (s) {
    var el = document.createElement('div');
    el.className = 'counter';
    var pos = pctPos(s.hexId);
    el.style.left = pos.left + '%'; el.style.top = pos.top + '%';
    el.innerHTML = '<img src="' + currentImg(s) + '">';
    el.addEventListener('click', function (e) { e.stopPropagation(); selectSoldier(s.id); });
    canvas.appendChild(el);
    counterEls[s.id] = el;
  });
  enemyHexes.forEach(function (hexId, i) {
    var el = document.createElement('div');
    el.className = 'counter enemy';
    var pos = pctPos(hexId);
    el.style.left = pos.left + '%'; el.style.top = pos.top + '%';
    el.innerHTML = '<img src="' + img('soldiers/de_soldier_T_crouching.png') + '">';
    canvas.appendChild(el);
  });

  // ---------------------------------------------------------------------
  // Selection / destinations / planning
  // ---------------------------------------------------------------------
  var selectedId = null;
  var planned = null; // {hexId, cost, path}

  function selectedSoldier() { return soldiers.filter(function (s) { return s.id === selectedId; })[0]; }

  function selectSoldier(id) {
    selectedId = id;
    clearPlan();
    Object.keys(counterEls).forEach(function (k) { counterEls[k].classList.toggle('selected', k === id); });
    document.getElementById('tb-selected').textContent = selectedSoldier().name;
    renderHud();
    renderDestinations();
  }

  function clearDestMarks() {
    Object.keys(destEls).forEach(function (k) { destEls[k].remove(); });
    destEls = {};
  }
  function clearPathMarks() {
    pathEls.forEach(function (el) { el.remove(); });
    pathEls = [];
  }
  function clearPlan() {
    planned = null;
    clearPathMarks();
    Float.hide('moveConfirm');
    Object.keys(destEls).forEach(function (k) { destEls[k].classList.remove('planned'); });
  }

  function renderDestinations() {
    clearDestMarks();
    clearPlan();
    var s = selectedSoldier();
    if (!s) return;
    var dest = M.legalDestinations({
      startHexId: s.hexId, mpa: s.mpRemaining, stance: s.stance,
      terrainByHexId: REAL_TERRAIN, occupiedByEnemy: enemyHexes,
    });
    Object.keys(dest).forEach(function (hexId) {
      var d = dest[hexId];
      var el = document.createElement('div');
      var isEnemyStop = enemyHexes.indexOf(hexId) !== -1;
      el.className = 'dest-mark ' + (isEnemyStop ? 'enemy-stop' : ('cost-' + (d.cost >= 3 ? '3plus' : d.cost)));
      var pos = pctPos(hexId);
      el.style.left = pos.left + '%'; el.style.top = pos.top + '%';
      el.textContent = d.cost;
      el.title = hexId + ' — ' + d.cost + ' MP' + (isEnemyStop ? ' (enemy — must stop)' : '');
      el.addEventListener('click', function (e) { e.stopPropagation(); planMove(hexId, d); });
      canvas.appendChild(el);
      destEls[hexId] = el;
    });
  }

  function planMove(hexId, d) {
    clearPathMarks();
    Object.keys(destEls).forEach(function (k) { destEls[k].classList.toggle('planned', k === hexId); });
    planned = { hexId: hexId, cost: d.cost, path: d.path };
    d.path.slice(1, -1).forEach(function (midHexId) {
      var el = document.createElement('div');
      el.className = 'path-mark';
      var pos = pctPos(midHexId);
      el.style.left = pos.left + '%'; el.style.top = pos.top + '%';
      canvas.appendChild(el);
      pathEls.push(el);
    });
    showMoveConfirm(hexId, d);
  }

  // ---------------------------------------------------------------------
  // Confirm-move popup: floating, non-modal, anchored next to the destination
  // marker the user just clicked (not the far-away HUD) — content stays lean
  // by default (cost, remaining MP, terrain) and only adds a line when
  // something non-obvious is going on (multi-hex path, enemy stop, crawl cost).
  // ---------------------------------------------------------------------
  var moveConfirmWin = Float.create('moveConfirm', { title: 'Confirm Move' });
  (function () {
    var closeBtn = moveConfirmWin.win.querySelector('.float-titlebar button');
    closeBtn.addEventListener('click', function () { clearPlan(); });
  })();

  function showMoveConfirm(hexId, d) {
    var s = selectedSoldier();
    var mpAfter = s.mpRemaining - d.cost;
    var destTerrain = REAL_TERRAIN[hexId];
    var isEnemyStop = enemyHexes.indexOf(hexId) !== -1;
    var crossedIds = d.path.slice(1, -1);

    var html =
      '<div class="mc-row"><span>Destination</span><b>' + hexId + '</b></div>' +
      '<div class="mc-cost">' + d.cost + ' MP</div>' +
      '<div class="mc-row"><span>Terrain entered</span><b>' + terrainLabel(destTerrain) + '</b></div>' +
      '<div class="mc-row"><span>MP after move</span><b>' + mpAfter + ' / ' + s.mpa + '</b></div>';

    if (crossedIds.length) {
      html += '<div class="mc-row"><span>Via</span><b>' + crossedIds.map(function (id) { return terrainLabel(REAL_TERRAIN[id]); }).join(', ') + '</b></div>';
    }
    if (s.stance === M.STANCE.CROUCHING) {
      html += '<div class="mc-note">Crawling — costs the soldier\'s full MPA regardless of terrain (&sect;7/3).</div>';
    }
    if (isEnemyStop) {
      html += '<div class="mc-note alert">Enemy contact here — movement must stop on entry (&sect;7/3).</div>';
    }
    html +=
      '<div class="mc-buttons">' +
      '<button class="btn" id="mcCancel">Cancel</button>' +
      '<button class="btn amber" id="mcConfirm">Confirm</button>' +
      '</div>';

    moveConfirmWin.body.innerHTML = html;
    moveConfirmWin.body.querySelector('#mcConfirm').addEventListener('click', doConfirmMove);
    moveConfirmWin.body.querySelector('#mcCancel').addEventListener('click', clearPlan);

    // Float.show() resets left/top to its default center position whenever the
    // window transitions from hidden to visible (ambushdialogs.js), so position
    // it AFTER show(), not before, or that default wins.
    Float.show('moveConfirm');
    positionNear(moveConfirmWin.win, destEls[hexId]);
  }

  // Position a float window's fixed top/left next to a map marker, clamped to
  // stay fully on-screen (the marker can be near any edge of the viewport).
  function positionNear(win, markerEl) {
    var rect = markerEl.getBoundingClientRect();
    var winW = win.offsetWidth || 250, winH = win.offsetHeight || 220;
    var x = rect.right + 14;
    var y = rect.top - 10;
    if (x + winW > window.innerWidth - 8) x = rect.left - winW - 14;
    if (x < 8) x = 8;
    if (y + winH > window.innerHeight - 8) y = window.innerHeight - winH - 8;
    if (y < 8) y = 8;
    win.style.left = x + 'px';
    win.style.top = y + 'px';
  }

  function renderHud() {
    var s = selectedSoldier();
    if (!s) return;
    document.getElementById('mc-img').src = currentImg(s);
    document.getElementById('mc-name').textContent = s.name;
    document.getElementById('mc-stats').textContent = s.role + ' · ' + s.stats + ' · at ' + s.hexId + ' · ' + s.stance;
    document.getElementById('mc-mp').innerHTML = '<b>' + s.mpRemaining + '</b> / ' + s.mpa + ' MP remaining';
    ['standing', 'crouching', 'prone'].forEach(function (st) {
      document.getElementById('stance-' + st).classList.toggle('active', s.stance === st);
    });
  }

  // ---------------------------------------------------------------------
  // Confirm move: animate through the path, spend MP, fire Paragraph Checks
  // per hex entered (§5/3, §7/3), stopping mid-path is not modeled here since
  // legalDestinations already truncates paths at a mandatory-stop hex.
  // ---------------------------------------------------------------------
  function doConfirmMove() {
    if (!planned) return;
    var s = selectedSoldier();
    var path = planned.path.slice(1); // exclude the starting hex
    var el = counterEls[s.id];
    var cost = planned.cost;
    var destHexId = planned.hexId;
    var fromHexId = planned.path[0];

    Float.hide('moveConfirm');
    clearDestMarks();
    clearPathMarks();
    planned = null;

    var i = 0;
    function step() {
      if (i >= path.length) {
        s.mpRemaining -= cost;
        logLine(s.name + ' moved ' + fromHexId + ' &rarr; ' + destHexId + ' (' + cost + ' MP).');
        renderHud();
        renderDestinations();
        return;
      }
      var hexId = path[i];
      var pos = pctPos(hexId);
      el.style.left = pos.left + '%'; el.style.top = pos.top + '%';
      s.hexId = hexId;
      var trigger = PARAGRAPH_TRIGGERS[hexId];
      if (trigger) {
        Dialogs.push({
          id: 'paragraph_read', title: 'Paragraph ' + trigger.num, variant: 'narrow', allowEnter: true,
          render: function (ctx) {
            ctx.bodyEl.innerHTML =
              '<div class="event-tag">[SAMPLE — placeholder text, not real paragraph-book content] triggered by entering hex ' + hexId + '</div>' +
              '<div class="event-body">' + trigger.text + '</div>';
          },
          onButton: function (id2, ctx) { logLine('Paragraph <b>' + trigger.num + '</b> read at ' + hexId + '.'); ctx.close(); },
        });
      }
      i++;
      setTimeout(step, 380);
    }
    step();
  }

  // ---------------------------------------------------------------------
  // Stance changes (§6/7 free stance change, one per turn; otherwise 1 MP)
  // ---------------------------------------------------------------------
  ['standing', 'crouching', 'prone'].forEach(function (st) {
    document.getElementById('stance-' + st).addEventListener('click', function () {
      var s = selectedSoldier();
      if (!s || s.stance === st) return;
      var cost = M.stanceChangeCost(s.usedFreeStanceChange, false);
      if (cost > s.mpRemaining) {
        Toasts.show('Illegal action: ' + s.name + ' has no free stance change left and not enough MP (' + s.mpRemaining + ' remaining).', { kind: 'error' });
        return;
      }
      s.mpRemaining -= cost;
      if (cost === 0) s.usedFreeStanceChange = true;
      var from = s.stance;
      s.stance = st;
      logLine(s.name + ' changed stance ' + from + ' &rarr; ' + st + (cost ? ' (1 MP)' : ' (free)') + '.');
      counterEls[s.id].querySelector('img').src = currentImg(s);
      renderHud();
      renderDestinations();
    });
  });

  // ---------------------------------------------------------------------
  // New round: reset MP and free stance change for everyone (no AR Track yet — Phase 8)
  // ---------------------------------------------------------------------
  document.getElementById('newRound').addEventListener('click', function () {
    soldiers.forEach(function (s) { s.mpRemaining = s.mpa; s.usedFreeStanceChange = false; });
    logLine('<b>— new round —</b> movement and free stance change reset for all soldiers.');
    if (selectedId) renderHud();
    if (selectedId) renderDestinations();
  });

  logLine('Movement sandbox ready. Click a soldier to begin.');
  selectSoldier('A');
})();

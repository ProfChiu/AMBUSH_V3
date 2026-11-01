/*
 * Ambush! v3 — the shell (Phase 2): title, mission select, settings, and the game screen's stage
 * (map filling the window, four-level zoom, floating menu strip, popups, banner). Presentation
 * only. Phase 3: Mission 1 plays on this stage (mission1.js, v2's controller re-pointed here); the
 * shell starts it with the difficulty chosen on the mission card, and quitting reloads the page.
 * index.html?play=normal|easy opens straight into the mission (the bot, live drives).
 */
(function () {
  'use strict';

  var S = window.AmbushSettings, A = window.AmbushAudio, G = window.AmbushHexGrid;
  var $ = function (id) { return document.getElementById(id); };
  var all = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  // ---------------------------------------------------------------- screens
  var screen = null, chosen = { mission: 1, difficulty: 'normal' };
  function show(id) {
    if (screen === id) return;
    all('.screen').forEach(function (s) { s.classList.toggle('show', s.id === id); });
    screen = id;
    A.music(id === 'game' ? 'mission' : 'title');
    if (id === 'game') enterGame();
  }

  // ---------------------------------------------------------------- title
  // the title is authored on a 1920x1080 stage, scaled to the window as one unit
  function fitTitle() { document.documentElement.style.setProperty('--ts-k', Math.min(innerWidth / 1920, innerHeight / 1080)); }
  fitTitle(); addEventListener('resize', fitTitle);
  $('t-play').addEventListener('click', function () { A.play('confirm'); show('missions'); });
  $('t-settings').addEventListener('click', function () { openPop('settings'); });
  $('t-learn').addEventListener('click', function () { A.play('confirm'); buildChapters(); show('learn'); });

  // ---------------------------------------------------------------- learn to play (Phase 6)
  // The chapter list: a lesson ready to play opens on the mission stage; the rest are listed,
  // locked, so the course reads whole from day one. A tick marks a lesson finished in this browser.
  function buildChapters() {
    var list = $('chapter-list'), done = window.AmbushLesson ? AmbushLesson.ticks() : {}, html = '';
    (window.AmbushChapters || []).forEach(function (c) {
      var ready = !!c.lesson, tick = ready && done[c.lesson];
      html += '<article class="chapter' + (ready ? ' live' : ' locked') + (tick ? ' done' : '') + '"' + (ready ? ' data-lesson="' + c.lesson + '" tabindex="0"' : ' aria-disabled="true"') + '>' +
        '<span class="num">' + (c.n ? 'Chapter ' + c.n : 'Start here') + '</span>' +
        '<h3>' + esc(c.title) + '</h3><p>' + esc(c.blurb) + '</p>' +
        (ready ? '<span class="go">' + (tick ? '✓ Done · play again' : 'Begin ▸') + '</span>' : '<span class="lock">In a later build</span>') + '</article>';
    });
    list.innerHTML = html;
    all('.chapter.live', list).forEach(function (c) {
      function go() { chosen = { mission: 1, difficulty: 'normal', lesson: c.dataset.lesson }; A.play('confirm'); show('game'); }
      c.addEventListener('click', go);
      c.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });
    all('.chapter.locked', list).forEach(function (c) { c.addEventListener('click', function () { A.play('refuse'); }); });
  }
  $('l-back').addEventListener('click', function () { A.play('close'); show('title'); });

  // ---------------------------------------------------------------- mission select
  var M = (window.AMBUSH_MISSIONS || {}).missions || {};
  // the briefing's opening, cut at a word near max characters
  function opening(text, max) {
    var s = String(text || '').replace(/\s+/g, ' ').trim();
    if (s.length <= max) return s;
    s = s.slice(0, max); return s.slice(0, s.lastIndexOf(' ')).replace(/[,;:.]$/, '') + '…';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function buildMissions() {
    var grid = $('mission-grid'), html = '';
    Object.keys(M).sort(function (a, b) { return a - b; }).forEach(function (n) {
      var m = M[n];
      if (n === '1') {
        html += '<article class="mcard live" data-mission="1"><span class="num">Mission 1</span><h3>' + esc(m.name) + '</h3>' +
          '<p>' + esc(opening(m.briefing, 460)) + '</p>' +
          '<div class="diff"><span class="lbl">Choose a difficulty to begin</span><div class="row">' +
          '<button class="btn primary" data-diff="normal">Normal<small>The game as printed</small></button>' +
          '<button class="btn" data-diff="easy">Easy<small>A gentler German side</small></button>' +
          '</div></div></article>';
      } else {
        html += '<article class="mcard locked" aria-disabled="true"><span class="num">Mission ' + n + '</span><h3>' + esc(m.name) + '</h3>' +
          '<p>' + esc(opening(m.briefing, 150)) + '</p><span class="lock">Not in this release</span></article>';
      }
    });
    grid.innerHTML = html;
    all('[data-diff]', grid).forEach(function (b) {
      b.addEventListener('click', function () {
        chosen = { mission: 1, difficulty: b.dataset.diff };
        A.play('confirm'); show('game');
      });
    });
    all('.mcard.locked', grid).forEach(function (c) { c.addEventListener('click', function () { A.play('refuse'); }); });
  }
  buildMissions();
  $('m-back').addEventListener('click', function () { A.play('close'); show('title'); });
  $('m-settings').addEventListener('click', function () { openPop('settings'); });

  // ---------------------------------------------------------------- game stage
  var board = $('board'), world = $('world'), lastLevel = null;
  var view = AmbushBoard.create({
    board: board, world: world, width: G.MAP_WIDTH, height: G.MAP_HEIGHT,
    isPiece: function (t) { return !!t.closest('.counter'); },
    // furthest out: the map's edges flush with the title row's box (Wan, 2026-10-23)
    fitWidth: function () { var s = document.querySelector('#game .strip'); return s && s.offsetWidth && board.clientWidth ? s.offsetWidth / board.clientWidth : 0.9; },
    insetTop: function () { var s = document.querySelector('#game .strip'); return s && s.offsetHeight ? s.offsetTop + s.offsetHeight + 10 : 0; },
    onChange: function (level) {
      all('#zoom-seg [data-zoom]').forEach(function (b) { b.classList.toggle('on', +b.dataset.zoom === level); });
      if (lastLevel !== null && level !== lastLevel) A.play('zoom');
      lastLevel = level;
    },
  });
  AmbushBoard.NAMES.forEach(function (name, i) {
    var b = document.createElement('button');
    b.className = 'btn' + (i === 0 ? ' on' : ''); b.dataset.zoom = i; b.textContent = name;
    b.title = name + ' (' + (i + 1) + ')';
    b.addEventListener('click', function () { zoom(i); });
    $('zoom-seg').appendChild(b);
  });
  function zoom(level, cx, cy) { view.zoomTo(level, cx, cy); }
  window.AmbushStage = { view: view };   // mission1.js's camera (ensureVisible) pans this view

  // the hex grid overlay (a setting)
  (function drawGrid() {
    var svg = $('grid'), W = G.MAP_WIDTH, H = G.MAP_HEIGHT;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    var R = G.GRID.col_pitch * 2 / 3, h = G.GRID.row_pitch / 2;
    G.allHexIds().forEach(function (id) {
      var p = G.parseId(id), c = G.hexToPixel(p.colIdx, p.rowIdx);
      var pts = [[R, 0], [R / 2, h], [-R / 2, h], [-R, 0], [-R / 2, -h], [R / 2, -h]]
        .map(function (q) { return (c.x + q[0]).toFixed(1) + ',' + (c.y + q[1]).toFixed(1); }).join(' ');
      var poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      poly.setAttribute('points', pts); svg.appendChild(poly);
    });
  })();

  var started = false;
  function enterGame() {
    var m = M[chosen.mission] || { name: 'Mission ' + chosen.mission };
    if (chosen.lesson) { enterLesson(chosen.lesson); return; }
    $('tb-difficulty').textContent = chosen.difficulty === 'easy' ? 'Easy' : 'Normal';
    var diff = chosen.difficulty === 'easy' ? 'Easy' : chosen.difficulty === 'ask' ? 'Normal or Easy' : 'Normal';
    $('g-mission').textContent = m.name;
    $('g-sub').textContent = 'Mission ' + chosen.mission + ' · ' + diff;
    view.home();   // the squad enters on the north edge, so the mission opens there
    AmbushCues.banner('phase', 'Mission ' + chosen.mission, m.name + ' · ' + diff);
    // v2's controller runs one mission per page load (its Restart reloads), so it starts once
    if (!started && window.AmbushMission) {
      started = true;
      if (chosen.difficulty === 'ask') AmbushMission.ask(); else AmbushMission.start(chosen.difficulty);
    }
  }

  // lesson.js and lessons.js load after this file, and a timeout of 0 can fire between two script
  // tags, so whatever needs them on arrival waits for the page to finish loading
  function afterLoad(fn) { if (document.readyState === 'complete') setTimeout(fn, 0); else window.addEventListener('load', fn); }

  // a lesson plays Mission 1's stage from its own saved position (lesson.js), once per page load
  function enterLesson(id) {
    var l = (window.AmbushLessons || []).filter(function (x) { return x.id === id; })[0];
    $('tb-difficulty').textContent = 'Lesson';
    $('g-mission').textContent = l ? l.chapter : 'Lesson';
    $('g-sub').textContent = 'Learn to play · with Sgt. Whitaker';
    view.home();
    AmbushCues.banner('phase', l ? l.chapter : 'Lesson', 'Learn to play');
    if (started) return;
    started = true;
    // a deep link arrives here before lesson.js exists
    afterLoad(function () { window.AmbushLesson.start(id); });
  }

  // ---------------------------------------------------------------- popups
  var open = null, returnFocus = null;
  function openPop(name) {
    if (open) closePop(true);
    var el = $('pop-' + name); if (!el) return;
    returnFocus = document.activeElement;
    if (name === 'settings') syncSettings();
    el.classList.add('show'); open = el; A.play('open');
    var f = el.querySelector('[data-close], .btn, input'); if (f) f.focus();
  }
  function closePop(quiet) {
    if (!open) return;
    open.classList.remove('show'); open = null;
    if (!quiet) A.play('close');
    if (returnFocus && returnFocus.focus) returnFocus.focus();
  }
  all('[data-pop]').forEach(function (b) { b.addEventListener('click', function () { openPop(b.dataset.pop); }); });
  all('.scrim').forEach(function (s) {
    s.addEventListener('click', function (e) { if (e.target === s || e.target.closest('[data-close]')) closePop(); });
  });
  $('p-settings').addEventListener('click', function () { openPop('settings'); });
  // the mission cannot be unwound in place (v2 restarts by reloading), so quitting reloads to the title
  $('p-quit').addEventListener('click', function () { closePop(true); A.play('close'); location.href = location.pathname; });
  // v2's save, load and restart act at once; the pause menu closes behind them
  ['saveGameBtn', 'loadGameBtn', 'exportSaveBtn', 'importSaveBtn'].forEach(function (id) {
    $(id).addEventListener('click', function () { closePop(true); });
  });

  // ---------------------------------------------------------------- settings
  ['master', 'music', 'sfx'].forEach(function (k) {
    var r = $('s-' + k), out = r.parentNode.querySelector('output');
    r.addEventListener('input', function () { S.set(k, +r.value); out.textContent = r.value; });
    r.addEventListener('change', function () { if (k !== 'music') A.play('click'); });
  });
  function segSetting(id, key, parse) {
    all('#' + id + ' [data-v]').forEach(function (b) {
      b.addEventListener('click', function () { S.set(key, parse(b.dataset.v)); A.play('click'); syncSettings(); });
    });
  }
  segSetting('s-speed', 'speed', String);
  segSetting('s-still', 'reducedMotion', function (v) { return v === '1'; });
  segSetting('s-grid', 'grid', function (v) { return v === '1'; });
  // Phase 5: the test is a shot and a blast, heard against the music duck
  $('s-test').addEventListener('click', function () { A.play('rifle'); A.play('mg', { at: 0.4 }); A.play('blast', { at: 1.0 }); });
  $('s-reset').addEventListener('click', function () { S.reset(); syncSettings(); A.play('click'); });
  function syncSettings() {
    var c = S.all();
    ['master', 'music', 'sfx'].forEach(function (k) { var r = $('s-' + k); r.value = c[k]; r.parentNode.querySelector('output').textContent = c[k]; });
    var map = { 's-speed': c.speed, 's-still': c.reducedMotion ? '1' : '0', 's-grid': c.grid ? '1' : '0' };
    Object.keys(map).forEach(function (id) { all('#' + id + ' [data-v]').forEach(function (b) { b.classList.toggle('on', b.dataset.v === map[id]); }); });
  }
  function applySettings() {
    var c = S.all();
    // game speed drives v2's resolution speed (its own Slow/Normal/Fast control is kept, hidden)
    var sp = document.querySelector('#speedCtl [data-speed="' + c.speed + '"]');
    if (sp && !sp.classList.contains('active')) sp.click();
    document.body.classList.toggle('still', !!c.reducedMotion);
    document.body.classList.toggle('show-grid', !!c.grid);
    view.setReducedMotion(c.reducedMotion);
  }
  S.onChange(applySettings);
  applySettings();

  // ---------------------------------------------------------------- keys
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (open) { closePop(); return; }
      // v2's decision dialogs and the pinned hex card take Esc themselves
      if (document.querySelector('#dialogs-root .backdrop.open')) return;
      var tip = $('info-tip'); if (tip && tip.style.display !== 'none' && tip.style.display) return;
      if (screen === 'game') { openPop('menu'); return; }
      if (screen === 'missions' || screen === 'learn') { show('title'); return; }
      return;
    }
    if (open || screen !== 'game' || e.target.tagName === 'INPUT') return;
    if (e.key >= '1' && e.key <= '4') zoom(+e.key - 1);
    else if (e.key === '+' || e.key === '=') zoom(view.level() + 1);
    else if (e.key === '-' || e.key === '_') zoom(view.level() - 1);
  });

  // ?play=normal|easy: straight into Mission 1 (live drives); ?play=ask: v2's start dialog picks (tools/bot)
  var deep = /[?&]play=(normal|easy|ask)\b/.exec(location.search);
  // ?learn=1: the chapter list (a finished or abandoned lesson returns here); ?lesson=id: straight in
  var lessonLink = /[?&]lesson=(\w+)/.exec(location.search);
  if (deep) { chosen = { mission: 1, difficulty: deep[1] }; show('game'); }
  else if (lessonLink) { chosen = { mission: 1, difficulty: 'normal', lesson: lessonLink[1] }; show('game'); }
  else if (/[?&]learn=1\b/.test(location.search)) afterLoad(function () { buildChapters(); show('learn'); });
  else show('title');

  // automated drives (tools, live checks); no effect on play
  window.__v3 = {
    screen: function () { return screen; }, chosen: function () { return chosen; },
    view: view, open: function () { return open ? open.id : null; },
    // the 19 rules modules and the data globals this page must have loaded
    engine: ['AmbushHexGrid', 'AmbushMovement', 'AmbushLOS', 'AmbushChecks', 'AmbushActionRound', 'AmbushARScheduler',
      'AmbushFireCombat', 'AmbushGrenades', 'AmbushAssault', 'AmbushCrewWeapons', 'AmbushHazards', 'AmbushPenetration',
      'AmbushEquipment', 'AmbushSquadGen', 'AmbushVictory', 'AmbushDifficulty', 'AmbushGermanActions',
      'AmbushParagraphInterpreter', 'AmbushOperations', 'AMBUSH_AR_TRACK', 'AMBUSH_GERMAN_ROSTER', 'AMBUSH_GRENADE_SCATTER',
      'AMBUSH_LOS_A', 'AMBUSH_MISSION_CARDS', 'AMBUSH_MISSION_CARDS_MOVEMENT', 'AMBUSH_MISSIONS', 'AMBUSH_PARAGRAPH_PROGRAMS',
      'AMBUSH_PARAGRAPHS', 'AMBUSH_SQUAD_GEN', 'AMBUSH_TERRAIN_A', 'AMBUSH_WEAPON_CHART'],
  };
})();

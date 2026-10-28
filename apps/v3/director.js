/*
 * Ambush! v3 — the Director (Phase 6): how a lesson is shown. Ported from PhantomFury's
 * phantomfury_director.js; lesson.js says what to show, this file only stages it:
 *   - the camera glides the map to where the player should look (board.js frame, fixed levels);
 *   - a spotlight dims everything else and rings the piece or hex in play;
 *   - Sgt June Whitaker speaks in a large bubble that never moves (bottom centre, so Next is
 *     always in the same place), with a pointer drawn from the bubble to the ring;
 *   - a refused click is answered in the bubble, in words; Back re-reads earlier beats.
 * Not ported: PF's tray, quiz and dice rows (v3's dice land on the board, in the result card) and
 * its cameo (Major Kranz cuts in through cues.js, as she does in play).
 * lesson.js calls beat(ctx), refused(why), busy(); this file calls AmbushLesson.next / leave.
 */
(function () {
  'use strict';

  var IMG = '../../assets/characters/whitaker/sprites/whitaker-';
  // Her portraits (brief open item, checked 2026-10-23: ten head-and-shoulders faces cover it):
  // she smiles while she talks, waits calmly for your move, corrects you with a smile.
  var POSES = {
    talk: 'face-happy', grin: 'face-content', wow: 'face-surprised', focus: 'face-neutral',
    think: 'head-smiling', stern: 'face-stern', grimace: 'head-sad',
  };
  // Slow on purpose (PF, owner 2026-10-18): the camera glides, and the words fade in once it has
  // landed, so the eye knows where to look first.
  var CAMERA_MS = 1100, SWAP_MS = 180, GAP = 60;

  var cur = null, live = null, history = [], back = -1, shownKey = null;
  var flying = false, flyTimer = null, swapTimer = null;

  function $(id) { return document.getElementById(id); }
  function view() { return window.AmbushStage.view; }
  function still() { return document.body.classList.contains('still'); }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // ------------------------------------------------------------ where to look
  // The focus as a box in map pixels: each soldier's hex, each named hex, as the hex itself.
  function worldBox(f) {
    var G = window.AmbushHexGrid, R = G.GRID.col_pitch * 2 / 3, h = G.GRID.row_pitch / 2;
    var hexes = (f.hexes || []).slice();
    (f.soldiers || []).forEach(function (id) { var hx = window.AmbushMission.hexOf(id); if (hx) hexes.push(hx); });
    if (!hexes.length) return null;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    hexes.forEach(function (id) {
      var p = G.parseId(id), c = G.hexToPixel(p.colIdx, p.rowIdx);
      x0 = Math.min(x0, c.x - R); x1 = Math.max(x1, c.x + R); y0 = Math.min(y0, c.y - h); y1 = Math.max(y1, c.y + h);
    });
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, n: hexes.length };
  }
  // the same box on the screen, plus any of the page's own controls the beat names
  function screenBox(f) {
    var boxes = [], wb = worldBox(f);
    if (wb) {
      var a = view().toScreen(wb.x, wb.y), b = view().toScreen(wb.x + wb.w, wb.y + wb.h);
      boxes.push({ l: a.x, t: a.y, r: b.x, b: b.y });
    }
    (f.ui || []).forEach(function (sel) {
      var n = document.querySelector(sel);
      if (n && n.offsetParent) { var r = n.getBoundingClientRect(); boxes.push({ l: r.left, t: r.top, r: r.right, b: r.bottom }); }
    });
    if (!boxes.length) return null;
    var o = boxes.reduce(function (m, q) { return { l: Math.min(m.l, q.l), t: Math.min(m.t, q.t), r: Math.max(m.r, q.r), b: Math.max(m.b, q.b) }; });
    return { x: o.l, y: o.t, w: o.r - o.l, h: o.b - o.t };
  }

  // ------------------------------------------------------------------ camera
  function moveCamera() {
    var f = cur.focus || {};
    if (f.view === 'map') { view().home(); return true; }
    var wb = worldBox(f);
    if (!wb) return false;                           // keep looking where we were
    // frame it in the map above the bubble; a lone hex reads at Squad, a spread at Sector or Map
    view().frame(wb, { bottom: $('tutor').offsetHeight + GAP, fill: wb.n > 3 ? 0.7 : 0.35, maxLevel: 2, ms: CAMERA_MS });
    return true;
  }
  function reframe() {
    var moved = moveCamera();
    clearTimeout(flyTimer);
    if (moved && !still()) {
      flying = true;
      document.body.classList.add('lesson-flying');
      flyTimer = setTimeout(function () { flying = false; document.body.classList.remove('lesson-flying'); layout(); }, CAMERA_MS + 80);
    } else { flying = false; document.body.classList.remove('lesson-flying'); }
  }

  // ---------------------------------------------------------------- the beat
  function beat(ctx) {
    var fresh = ctx.key !== shownKey;
    live = ctx;
    if (fresh && ctx.key.split(':')[1] === '0') { history.push(ctx); back = -1; }
    else if (fresh) history[history.length - 1] = ctx;    // a step ticked: the same beat, redrawn
    if (back >= 0) return;                                // looking back: the live beat waits for Next
    var shown = !$('tutor').hidden && shownKey !== null, newBeat = fresh && ctx.key.split(':')[1] === '0';
    shownKey = ctx.key;
    cur = ctx;
    if (newBeat && shown && !still()) { swapIn(); return; }
    show(newBeat);
  }
  // fade the words out, then draw the next ones (still hidden) and fade in once
  function swapIn() {
    $('tutor').classList.add('swapping');
    clearTimeout(swapTimer);
    swapTimer = setTimeout(function () { swapTimer = null; show(true); }, SWAP_MS);
  }
  function show(fresh) {
    $('tutor').hidden = false;
    $('lesson-spot').hidden = false;
    fill(fresh);
    if (fresh) {
      reframe();
      var t = $('tutor');
      t.classList.remove('enter', 'why-open', 'refused', 'busy'); void t.offsetWidth; t.classList.add('enter');
    }
    $('tutor').classList.remove('swapping');
    $('tutor').classList.toggle('reviewing', back >= 0);
    $('btn-back').disabled = (back >= 0 ? back : history.length - 1) < 1;
    layout();
  }

  // Looking back: Back steps to the beats already shown (words and camera) without undoing
  // anything; Next walks forward again to the live beat.
  function reviewOf(c) {
    var r = {};
    Object.keys(c).forEach(function (k) { r[k] = c[k]; });
    r.waiting = false; r.steps = null; r.reviewing = true;
    return r;
  }
  function goTo(i) {
    back = i >= history.length - 1 ? -1 : i;
    cur = back < 0 ? live : reviewOf(history[back]);
    if (still()) { show(true); return; }
    swapIn();
  }
  function stepBack() {
    var at = back >= 0 ? back : history.length - 1;
    if (at >= 1) goTo(at - 1);
  }

  function fill(fresh) {
    var b = cur.beat || {};
    $('beat-step').textContent = (cur.chapter ? cur.chapter + ' · ' : '') + 'Step ' + Math.min(cur.index + 1, cur.total) + ' of ' + cur.total +
      (cur.reviewing ? ' · looking back' : '');
    $('beat-title').textContent = cur.title || '';
    $('beat-say').innerHTML = cur.say || '';
    // the rule behind it waits behind "Why?"
    $('beat-explain').innerHTML = (cur.explain ? cur.explain + ' ' : '') + (b.cite ? '<span class="cite">' + b.cite + '</span>' : '');
    $('btn-why').hidden = !cur.explain;
    renderSteps();
    renderAsk();
    showDebrief(cur.debrief);
    $('tutor').classList.toggle('debriefing', !!cur.debrief);
    if (fresh) { if (b.roster) showRoster(); else if (b.gcard) showGermanCard(b.gcard); else showCard(b.card); $('tutor-body').scrollTop = 0; }
    // a refusal answers one click: the next step (or beat) starts clean
    $('beat-refuse').hidden = true; $('tutor').classList.remove('refused');
    var c = $('btn-continue');
    // an answered prediction with moves to show plays them by itself; Next waits for the board
    c.hidden = (!!cur.waiting || !!(cur.ask && b.play)) && !cur.reviewing;
    c.textContent = b.done && !cur.reviewing ? 'Finish' : cur.watch && !cur.reviewing ? 'Watch ▸' : 'Next ▸';
    var a = cur.ask && cur.ask.answer !== null && !cur.reviewing ? cur.ask.options[cur.ask.answer] : null;
    setPose(a ? (a.right ? 'grin' : 'think') : cur.waiting ? 'focus' : (b.pose || 'talk'));
  }
  // What to do, as a numbered list: "First, … Then, …"; a step ticks when it is made.
  function renderSteps() {
    var list = $('beat-steps'), steps = cur.reviewing ? null : cur.steps;
    list.innerHTML = '';
    list.hidden = !(steps && steps.length);
    if (list.hidden) return;
    list.appendChild(el('li', 'ask', 'Your move.'));
    var words = steps.length === 1 ? ['Now, '] : ['First, ', 'Then, ', 'Then, ', 'Finally, '];
    steps.forEach(function (st, i) {
      var li = el('li', st.done ? 'done' : '');
      var w = i === steps.length - 1 && steps.length > 2 ? 'Finally, ' : words[Math.min(i, words.length - 1)];
      li.appendChild(el('span', 'step-n', st.done ? '✓' : String(i + 1)));
      li.appendChild(el('span', 'step-t', w + st.t.replace(/^./, function (ch) { return ch.toLowerCase(); })));
      list.appendChild(li);
    });
  }
  // A prediction: the answers as buttons; once one is picked, which was right and why. Looking
  // back shows the question with the answers but no verdict.
  function renderAsk() {
    var box = $('beat-ask'), q = cur.ask;
    box.innerHTML = '';
    box.hidden = !q;
    if (!q) return;
    var picked = cur.reviewing ? null : q.answer;
    if (picked === null) box.appendChild(el('div', 'ask', 'Your call.'));
    q.options.forEach(function (o, k) {
      var b = el('button', 'btn ask-opt');
      b.innerHTML = o.label;
      if (picked !== null) {
        b.disabled = true;
        if (o.right) b.classList.add('right');
        if (k === picked && !o.right) b.classList.add('wrong');
        if (k === picked) b.classList.add('picked');
      } else if (cur.reviewing) b.disabled = true;
      else b.addEventListener('click', function () { window.AmbushLesson.answer(k); });
      box.appendChild(b);
    });
    if (picked === null) return;
    var o = q.options[picked], v = el('div', 'ask-verdict ' + (o.right ? 'right' : 'wrong'));
    v.innerHTML = '<b>' + (o.right ? 'Right.' : 'Not quite.') + '</b> ' + (o.why || '');
    box.appendChild(v);
  }
  // The chapter's close: an after-action report of every decision the player made, what to
  // remember, and what the next chapter teaches.
  function showDebrief(d) {
    var box = $('beat-debrief');
    box.innerHTML = '';
    box.hidden = !d;
    if (!d) return;
    if (d.rows.length) {
      box.appendChild(el('div', 'db-kicker', 'After-action report'));
      var ol = el('ol', 'db-rows');
      d.rows.forEach(function (r) {
        var li = el('li', 'db-row');
        li.appendChild(el('span', 'db-mark' + (r.tries ? ' retry' : ''), '✓'));
        var body = el('div', 'db-body');
        body.appendChild(el('div', 'db-what', r.title + ' — ' + r.choice));
        if (r.predict) {
          if (!r.right) li.querySelector('.db-mark').className = 'db-mark miss';
          li.querySelector('.db-mark').textContent = r.right ? '✓' : '✗';
          body.querySelector('.db-what').textContent = r.title + ' — you called: ' + r.choice.replace(/<[^>]+>/g, '');
          body.appendChild(el('div', 'db-res', r.right ? 'called it' : 'it was: ' + (r.answer || '').replace(/<[^>]+>/g, '')));
        } else body.appendChild(el('div', 'db-res', r.tries ? 'right call on try ' + (r.tries + 1) : 'right call, first try'));
        if (r.lesson) body.appendChild(el('div', 'db-lesson', r.lesson));
        li.appendChild(body);
        ol.appendChild(li);
      });
      box.appendChild(ol);
    }
    if (d.takeaways.length) {
      box.appendChild(el('div', 'db-kicker', 'What to remember'));
      var ul = el('ul', 'db-take');
      d.takeaways.forEach(function (t) { var li = el('li'); li.innerHTML = t; ul.appendChild(li); });
      box.appendChild(ul);
    }
    if (d.next) box.appendChild(el('div', 'db-next', 'Next: ' + d.next));
  }
  // A soldier's counter shown large in the bubble: standing, and it turns over to crouching by
  // itself once, then on every click; his ratings beside it, in the HUD's own words.
  var flipTimer = null;
  function showCard(id) {
    var box = $('beat-card');
    clearTimeout(flipTimer);
    box.innerHTML = '';
    box.hidden = !id;
    if (!id) return;
    var fx = window.AmbushLesson.fixture() || window.AMBUSH_LESSON_FIXTURES.opsStart;
    var s = (fx.usSoldiers || []).filter(function (u) { return u.id === id; })[0];
    var live = window.AmbushMission.lesson.board().us.filter(function (u) { return u.id === id; })[0] || {};
    if (!s) { box.hidden = true; return; }
    var pc = el('div', 'pc two'), flip = el('div', 'pc-flip'), inner = el('div', 'pc-inner');
    var f = el('img', 'pc-face front'); f.src = s.img; f.alt = s.name + ', standing';
    var k = el('img', 'pc-face back'); k.src = s.imgCrouch; k.alt = s.name + ', crouching';
    inner.appendChild(f); inner.appendChild(k); flip.appendChild(inner); pc.appendChild(flip);
    flip.addEventListener('click', function () { pc.classList.toggle('flipped'); });
    if (!still()) flipTimer = setTimeout(function () { pc.classList.add('flipped'); }, 1800);
    var info = el('div', 'pc-info');
    info.appendChild(el('div', 'pc-name', s.name + ' · ' + s.letter));
    [['Initiative (IN)', live.IN], ['Perception (PC)', live.PC], ['Weapon Skill (WS)', live.WS], ['Movement (MPA)', live.mpa]].forEach(function (r) {
      var row = el('div', 'pc-stat');
      row.appendChild(el('span', null, r[0])); row.appendChild(el('b', null, String(r[1])));
      info.appendChild(row);
    });
    // what he carries and how he stands, as the board has him now
    var w = ((window.AMBUSH_WEAPON_CHART || {}).WEAPON_CHART || []).filter(function (x) { return x.id === live.weaponId; })[0];
    var kit = [w ? w.name : live.weaponId, live.stance, live.status].filter(Boolean).join(' · ');
    if (kit) info.appendChild(el('div', 'pc-kit', kit));
    info.appendChild(el('div', 'pc-tip', 'Click the counter to turn it over: standing, then crouching.'));
    pc.appendChild(info);
    box.appendChild(pc);
  }

  // A German's card as the roster has it (Phase 8b, chapter 5): his ratings and his Action table,
  // die rows by Condition columns. spec: { id: 'GE 53/S', col: column to mark, die: a roll whose
  // row to mark }; the marked cell is the paragraph he reads.
  function showGermanCard(spec) {
    var box = $('beat-card');
    clearTimeout(flipTimer);
    box.innerHTML = '';
    var all = (window.AMBUSH_GERMAN_ROSTER || {}).soldiers || {};
    var card = Object.keys(all).map(function (k) { return all[k]; }).filter(function (c) { return c['Card ID'] === spec.id; })[0];
    box.hidden = !card;
    if (!card || !card.table) return;
    box.appendChild(el('div', 'gc-name', card['Card ID'] + ' · ' + card.Role + ' · IN ' + card.IN + ' · PC ' + card.PC + ' · WS ' + card.WS + ' · MPA ' + card.MPA));
    function inRow(key, d) {
      var m = /^(\d)(?:-(\d))?$/.exec(key);
      return !!m && d >= +m[1] && d <= +(m[2] || m[1]);
    }
    var t = el('table', 'roster gcard-table'), h = el('tr');
    h.appendChild(el('th', null, 'Die'));
    card.table.columns.forEach(function (c) { h.appendChild(el('th', c === spec.col ? 'on' : null, c.replace('CONDITION', 'Cond.').replace('SPECIAL', 'Special'))); });
    t.appendChild(h);
    card.table.rows.forEach(function (r) {
      var tr = el('tr'), hit = spec.die !== undefined && inRow(r.DIE, spec.die);
      tr.appendChild(el('td', 'num', r.DIE));
      card.table.columns.forEach(function (c) {
        tr.appendChild(el('td', 'num' + (c === spec.col ? ' on' : '') + (hit && c === spec.col ? ' hit' : ''), r.values[c]));
      });
      t.appendChild(tr);
    });
    box.appendChild(t);
    if (card.Notes) box.appendChild(el('div', 'pc-tip', card.Notes));
  }

  // The squad's cards side by side, as the board has them now: a puzzle that asks for "the best
  // shot" or "the lowest Perception" is read here and answered on the map.
  function showRoster() {
    var box = $('beat-card');
    clearTimeout(flipTimer);
    box.innerHTML = '';
    box.hidden = false;
    var t = el('table', 'roster'), h = el('tr');
    ['', 'Soldier', 'IN', 'PC', 'WS', 'MPA', 'Weapon'].forEach(function (c) { h.appendChild(el('th', null, c)); });
    t.appendChild(h);
    var chart = (window.AMBUSH_WEAPON_CHART || {}).WEAPON_CHART || [], names = {};
    ((window.AmbushLesson.fixture() || {}).usSoldiers || []).forEach(function (u) { names[u.id] = u.name; });
    window.AmbushMission.lesson.board().us.forEach(function (u) {
      var w = chart.filter(function (x) { return x.id === u.weaponId; })[0], r = el('tr');
      var ws = u.WS > 0 ? '+' + u.WS : u.WS < 0 ? '−' + (-u.WS) : '0';
      [u.letter, (names[u.id] || u.id).replace(/^Pvt\. /, ''), u.IN, u.PC, ws, u.mpa, w ? w.name : u.weaponId].forEach(function (c, k) {
        r.appendChild(el('td', k === 0 ? 'ltr' : k > 1 && k < 6 ? 'num' : null, String(c)));
      });
      t.appendChild(r);
    });
    box.appendChild(t);
  }

  function setPose(p) {
    var img = $('guide-img'), src = IMG + (POSES[p] || POSES.talk) + '.png';
    if (img.getAttribute('src') === src) return;
    img.setAttribute('src', src);
    var g = $('guide');
    g.classList.remove('swap'); void g.offsetWidth; g.classList.add('swap');
  }

  // ---------------------------------------------------------------- layout
  // The bubble stands still (CSS puts it at the bottom centre); this rings the focus and draws
  // the pointer from the bubble's top edge to the ring. Run again whenever the view moves and
  // while counters glide, so the ring stays on its piece.
  function layout() {
    if (!cur || $('tutor').hidden) return;
    var spot = $('lesson-spot'), arrow = $('lesson-arrow');
    if (flying) { arrow.classList.remove('show'); return; }
    var r = cur.focus && cur.focus.view !== 'map' ? screenBox(cur.focus) : null;
    if (!r) {
      spot.classList.add('none');
      setRect(spot, { x: innerWidth / 2, y: innerHeight / 2, w: 0, h: 0 });
      arrow.classList.remove('show');
      return;
    }
    var pad = 10;
    r = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
    spot.classList.remove('none');
    setRect(spot, r);
    var b = $('tutor-bubble').getBoundingClientRect();
    if (r.y + r.h > b.top - 12) { arrow.classList.remove('show'); return; }   // beside it: no pointer
    drawArrow(r, b);
  }
  function setRect(n, r) {
    n.style.left = r.x + 'px'; n.style.top = r.y + 'px'; n.style.width = r.w + 'px'; n.style.height = r.h + 'px';
  }
  function drawArrow(r, b) {
    var arrow = $('lesson-arrow'), path = $('lesson-arrow-path');
    var tx = r.x + r.w / 2, ty = r.y + r.h;
    var fx = Math.max(b.left + 40, Math.min(b.right - 40, tx)), fy = b.top;
    var mx = (fx + tx) / 2, my = (fy + ty) / 2 - 24;
    var d = 'M' + fx.toFixed(1) + ',' + fy.toFixed(1) + ' Q' + mx.toFixed(1) + ',' + my.toFixed(1) + ' ' + tx.toFixed(1) + ',' + ty.toFixed(1);
    if (path.getAttribute('d') === d && arrow.classList.contains('show')) return;
    path.setAttribute('d', d);
    if (!arrow.classList.contains('show')) { void arrow.getBoundingClientRect(); arrow.classList.add('show'); }
  }

  // ---------------------------------------------------------------- answers
  function refused(why) {
    var n = $('beat-refuse');
    n.textContent = why;
    n.hidden = false;
    n.classList.remove('shake'); void n.offsetWidth; n.classList.add('shake');
    $('tutor').classList.add('refused');
    setPose('think');
    layout();
  }
  // the moves are made: the board plays them out, and the bubble says so until the next beat
  function busy() {
    $('tutor').classList.add('busy');
    $('beat-refuse').hidden = true;
    var list = $('beat-steps');
    list.innerHTML = ''; list.hidden = false;
    list.appendChild(el('li', 'ask', 'Watch the board.'));
    setPose('grin');
  }
  function hide() {
    cur = null; live = null; history = []; back = -1; shownKey = null;
    clearTimeout(flyTimer); clearTimeout(swapTimer);
    ['tutor', 'lesson-spot'].forEach(function (id) { $(id).hidden = true; });
    $('lesson-arrow').classList.remove('show');
    document.body.classList.remove('lesson-flying');
  }

  // ---------------------------------------------------------------- controls
  $('btn-continue').addEventListener('click', function () {
    if (back >= 0) { goTo(back + 1); return; }
    window.AmbushLesson.next();
  });
  $('btn-back').addEventListener('click', stepBack);
  $('btn-why').addEventListener('click', function () { $('tutor').classList.toggle('why-open'); layout(); });
  $('btn-leave').addEventListener('click', function () { window.AmbushLesson.leave(); });
  // Next with the keyboard too: Space, Enter or the right arrow; Back with the left arrow.
  document.addEventListener('keydown', function (ev) {
    if (!cur || $('tutor').hidden || document.querySelector('.scrim.show')) return;
    if (ev.key === 'ArrowLeft') { stepBack(); return; }
    if (ev.key !== ' ' && ev.key !== 'Enter' && ev.key !== 'ArrowRight') return;
    if (ev.target && ev.target.tagName === 'BUTTON' && ev.key !== 'ArrowRight') return;   // the button takes its own key
    var c = $('btn-continue');
    if (!c.hidden) { ev.preventDefault(); ev.stopImmediatePropagation(); c.click(); }
  }, true);
  $('board').addEventListener('stagemove', function () { if (!flying) layout(); });
  window.addEventListener('resize', layout);
  setInterval(function () { if (cur && !flying) layout(); }, 120);   // counters glide; the ring follows

  window.AmbushDirector = { beat: beat, refused: refused, busy: busy, hide: hide, layout: layout,
    reviewing: function () { return back >= 0; } };
})();

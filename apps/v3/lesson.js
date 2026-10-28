/*
 * Ambush! v3 — the lesson runner (Phase 6). Presentation only: the lesson plays the real Mission 1
 * controller (mission1.js) from a saved position, on its own seeded dice, and this file decides
 * which of the player's clicks the lesson takes. director.js stages it (camera, spotlight, bubble,
 * Sgt Whitaker); lessons.js holds the words.
 *
 * Why not FW.tutorial: v2's engine is orchestrated inside mission1.js, not behind create /
 * legalActions / apply, so a lesson cannot offer it actions. It gates the player's clicks instead,
 * at the same places a player acts (a counter, a hex, a ring verb, a dialog row), before
 * mission1.js sees them. A click that fits the step goes through untouched, to the same handler a
 * game click reaches; one that does not is refused, in words, and the lesson waits where it was.
 *
 * A lesson: { id, title, chapter, blurb, fixture, seed, beats: [beat] }
 * A beat:   { title, say, explain, cite, pose, view: 'map' | focus: { soldiers, hexes, ui },
 *             card: soldierId (his counter, large, in the bubble),
 *             await: [step],   the moves asked for, in order; each step is
 *                    { select: soldierId | [soldierId] } | { hex: hexId } | { verb: buttonId },
 *                    plus say (the step in plain words), wrong (said when another click is tried)
 *                    and wrongFor: { soldierId: words } (a wrong soldier answered by name);
 *                    point: true on a select step makes the click an answer only (the game does
 *                    not select him, so no ring or move markers are left over the next puzzle)
 *             ask: { options: [{ label, right, why }] }, a prediction (Phase 7): the player picks one;
 *                    a wrong pick is explained, not refused, and the beat goes on either way
 *             play: [move], moves the lesson makes itself, through the bot's seam, after the ask
 *                    is answered (or on Next when there is none); each move is
 *                    { verb: name } | { choose: row } | { pick: soldierId } | { hex: hexId }, made once
 *                    it is offered
 *             Phase 7b (the map): a hex step's hex may be a list or a test fn(hexId); a click on a
 *                    counter answers for his hex; point: true answers without moving anyone;
 *                    wrongHex: fn(hexId) -> words (the refusal, from the engine's facts);
 *                    look: fn(hexId) runs on every hex click of the step (a sight line drawn);
 *             sight: fn() draws on the map when the beat opens (cleared at the next beat);
 *             Phase 8a (drills): { row: i } is a row of the open target picker, { button: id | [id] } a
 *                    button of the open dialog (Capture / Kill); the player makes the pick, the lesson
 *                    only checks it is the one asked for. L.lastButton is the button last pressed.
 *             say and explain may be fn(lastHex) -> words, lastHex the hex last answered
 *             until(board) -> true when the board has done what the moves started (default: settled);
 *                    maxMs: how long to wait for it before going on anyway (default 60 s; Phase 8b)
 *             lesson: what the decision taught (the debrief's line), debrief: { takeaways, next },
 *             done: the closing beat }
 * The dice are a mulberry32 stream on the lesson's seed, so the words can quote them; the live
 * check (tools/live_lesson.py) proves they still do.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var M = function () { return window.AmbushMission.lesson; };
  var D = function () { return window.AmbushDirector; };
  var TICKS = 'ambush.v3.lessons.done';

  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s |= 0; s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- chapter ticks (per browser)
  function ticks() { try { return JSON.parse(localStorage.getItem(TICKS) || '{}') || {}; } catch (e) { return {}; } }
  function tick(id) { try { var t = ticks(); t[id] = Date.now(); localStorage.setItem(TICKS, JSON.stringify(t)); } catch (e) { /* private window */ } }

  // ---------------------------------------------------------------- the run
  var L = null;   // { lesson, i, step, waiting, settling, rows: [], tries, answer, auto }

  function find(id) { return (window.AmbushLessons || []).filter(function (l) { return l.id === id; })[0] || null; }

  function start(id) {
    var lesson = find(id);
    if (!lesson) return false;
    L = { lesson: lesson, i: -1, step: 0, waiting: false, settling: null, rows: [], tries: 0 };
    document.body.classList.add('in-lesson');
    M().load(window.AMBUSH_LESSON_FIXTURES[lesson.fixture], rng(lesson.seed));
    setTimeout(function () { go(0); }, 400);   // the map is up before the first words
    return true;
  }
  function beat() { return L && L.lesson.beats[L.i]; }
  function steps(b) { return (b && b.await) || []; }

  function go(i) {
    clearInterval(L.settling); L.settling = null;
    L.i = i; L.step = 0; L.tries = 0; L.answer = null;
    var b = beat();
    L.waiting = steps(b).length > 0 || !!b.ask;
    M().unsight();
    if (b.sight) { try { b.sight(); } catch (err) { console.error('[lesson]', err); } }
    show();
  }
  function show(key) {
    var b = beat();
    // a question is asked over a quiet board: a game dialog already open (chapter 3's Combo Action)
    // waits, hidden, until the call is made, and the lesson's own moves then answer it
    document.body.classList.toggle('lesson-asking', !!(b.ask && L.answer === null));
    // a map puzzle (a hex answered without moving anyone) hides the ring: its verbs are not the
    // answer, and at Map zoom they sit over the very hexes being asked about (Phase 8a)
    var s = L.waiting ? steps(b)[L.step] : null;
    document.body.classList.toggle('lesson-pointing', !!(s && s.hex && s.point));
    D().beat({
      index: L.i, total: L.lesson.beats.length, key: L.i + ':' + (key || 0), chapter: L.lesson.chapter,
      beat: b, title: b.title, say: words(b.say), explain: words(b.explain), waiting: L.waiting,
      steps: steps(b).map(function (s, k) { return { t: s.say, done: k < L.step }; }),
      focus: focusNow(), debrief: b.done ? debrief(b) : null,
      ask: b.ask ? { options: b.ask.options, answer: L.answer } : null, watch: !!b.play && !b.ask,
    });
  }
  function words(w) { return typeof w === 'function' ? w(L.last, L.lastButton) : w; }
  // what to look at: the beat's own focus, or the piece and the place the current step asks for
  function focusNow() {
    var b = beat(), f = b.focus || {}, s = L.waiting ? steps(b)[L.step] : null;
    if (b.view === 'map') return { view: 'map' };
    var out = { soldiers: (f.soldiers || []).slice(), hexes: (f.hexes || []).slice(), ui: (f.ui || []).slice() };
    if (s && s.select) out.soldiers.push(s.select);
    if (s && typeof s.hex === 'string') out.hexes.push(s.hex);
    if (s && s.with) out.soldiers.push(s.with);
    return out;
  }
  function next() {
    if (!L || L.waiting || L.settling) return;
    var b = beat();
    if (b.done) { finish(); return; }
    if (b.play && !b.ask) { play(b); return; }
    go(L.i + 1);
  }
  function finish() {
    tick(L.lesson.id);
    leave();
  }
  // v2's controller cannot be unwound in place (its Restart reloads), so leaving reloads to the list
  function leave() { location.href = location.pathname + '?learn=1'; }

  function debrief(b) {
    return {
      rows: L.rows, takeaways: (b.debrief && b.debrief.takeaways) || [], next: b.debrief && b.debrief.next,
    };
  }

  // ---------------------------------------------------------------- the gate
  // What a click on the game screen would do, in the lesson's terms; null for a click that acts on
  // nothing (the HUD's read-only panels, the menu strip, the bubble itself).
  function classify(e) {
    var t = e.target;
    if (!t.closest || t.closest('#tutor, .strip, .scrim, #hud-status, #kranz')) return null;
    var c = t.closest('.counter');
    if (c && c.dataset.soldierId) return { kind: 'select', id: c.dataset.soldierId, el: c };
    var rb = t.closest('#ring button');
    if (rb) return { kind: 'verb', id: rb.id };
    var tr = t.closest('#dialogs-root .target-row');
    if (tr) return { kind: 'row', id: parseInt(tr.dataset.idx, 10) };
    var db = t.closest('#dialogs-root button');
    if (db && db.dataset.btnId) return { kind: 'button', id: db.dataset.btnId };
    if (t.closest('#dialogs-root .row, #dialogs-root button')) return { kind: 'dialog' };
    if (t.closest('#stack-panel, #hud-soldier button, #pick-list')) return { kind: 'panel' };
    if (t.closest('#board')) {
      var w = window.AmbushStage.view.toWorld(e.clientX, e.clientY);
      var hx = window.AmbushHexGrid.pixelToHex(w.x, w.y);
      return hx && hx.id ? { kind: 'hex', id: hx.id } : null;
    }
    return null;
  }
  function fits(s, a) {
    if (s.select) return a.kind === 'select' && [].concat(s.select).indexOf(a.id) >= 0;
    if (s.hex) return a.kind === 'hex' && (typeof s.hex === 'function' ? !!s.hex(a.id) : [].concat(s.hex).indexOf(a.id) >= 0);
    if (s.verb) return a.kind === 'verb' && a.id === s.verb;
    if (s.row !== undefined) return a.kind === 'row' && a.id === s.row;
    if (s.button) return a.kind === 'button' && [].concat(s.button).indexOf(a.id) >= 0;
    return false;
  }
  function gate(e) {
    if (!L || L.auto || e.button !== 0) return;
    var a = classify(e);
    if (!a) return;
    var b = beat(), s = L.waiting ? steps(b)[L.step] : null;
    // asked for a hex, a click on a counter means the hex he stands in
    if (s && s.hex && a.kind === 'select') { var at = window.AmbushMission.hexOf(a.id); if (at) a = { kind: 'hex', id: at }; }
    if (s && s.look && a.kind === 'hex') { try { s.look(a.id); } catch (err) { console.error('[lesson]', err); } }
    // asked for a soldier, a click on his hex means him: a destination marker drawn over his
    // counter must not turn the answer into a move
    if (s && s.select && a.kind === 'hex') {
      var here = M().board().us.filter(function (u) { return u.hexId === a.id && u.isActive; })
        .sort(function (x, y) { return [].concat(s.select).indexOf(y.id) - [].concat(s.select).indexOf(x.id); })[0];
      if (here) {
        a = { kind: 'select', id: here.id };
        if (fits(s, a)) {
          e.stopImmediatePropagation(); e.preventDefault();
          if (!s.point) {
            L.auto = true;
            try { window.__mission1Debug.select(here.id); } finally { L.auto = false; }
          }
          accept(s, a);
          return;
        }
      }
    }
    if (s && fits(s, a)) {
      if (s.point) { e.stopImmediatePropagation(); e.preventDefault(); }
      accept(s, a);
      return;
    }
    e.stopImmediatePropagation(); e.preventDefault();
    if (s) {
      L.tries += 1;
      D().refused((a.kind === 'select' && s.wrongFor && s.wrongFor[a.id]) || (a.kind === 'hex' && s.wrongHex && s.wrongHex(a.id)) ||
        s.wrong || b.wrong || 'Not that. ' + s.say);
    }
    else if (b.ask && L.waiting) D().refused('Make your call first: pick one of the answers in the bubble.');
    else if (L.settling) D().refused('Watch the board: the game is still playing out your move.');
    else D().refused('Read on first: press Next ▸ when you are ready.');
  }
  function accept(s, a) {
    var b = beat();
    if (a.kind === 'hex') L.last = a.id;
    if (a.kind === 'button') L.lastButton = a.id;
    L.step += 1;
    if (L.step < steps(b).length) { setTimeout(function () { show(L.step); }, 0); return; }
    // every step made: the board plays it out, then the next beat
    L.waiting = false;
    L.rows.push({ title: b.title, choice: b.choice || s.say, tries: L.tries, lesson: b.lesson || '' });
    D().busy();
    settle(b);
  }
  // the board plays out what was started, then the next beat
  function settle(b) {
    var since = Date.now(), stable = 0;
    L.settling = setInterval(function () {
      var bd = M().board(), ok;
      try { ok = b.until ? b.until(bd) : settled(); } catch (err) { ok = false; console.error('[lesson]', err); }
      stable = ok ? stable + 1 : 0;
      // a beat may open while the board still resolves (b.early); otherwise it waits for quiet
      if (stable >= (b.until ? 1 : 3) || Date.now() - since > (b.maxMs || 60000)) { clearInterval(L.settling); L.settling = null; go(L.i + 1); }
    }, 200);
  }
  // ---------------------------------------------------------------- predictions and watching
  // A prediction is answered once: right or wrong, the bubble says what happens and why, and the
  // board then shows it (play) or Next goes on.
  function answer(k) {
    var b = beat();
    if (!L || !b.ask || L.answer !== null || !b.ask.options[k]) return false;
    var o = b.ask.options[k], right = b.ask.options.filter(function (x) { return x.right; })[0];
    L.answer = k; L.waiting = false;
    L.rows.push({ title: b.title, choice: o.label, predict: true, right: !!o.right, answer: right && right.label, lesson: b.lesson || '' });
    show(1);
    if (b.play) setTimeout(function () { if (L && beat() === b) play(b); }, 1400);   // the verdict is read first
    return true;
  }
  // The lesson's own moves, one at a time, each once the board offers it; the player's clicks are
  // held meanwhile ("Watch the board"). The seam runs the same handlers a click would.
  function play(b) {
    var dbg = window.__mission1Debug, moves = b.play.slice(), since = Date.now();
    L.waiting = false;
    D().busy();
    L.settling = setInterval(function () {
      if (!moves.length) { clearInterval(L.settling); L.settling = null; settle(b); return; }
      if (Date.now() - since > 90000) { clearInterval(L.settling); L.settling = null; console.error('[lesson] move not offered', moves[0]); go(L.i + 1); return; }
      var m = moves[0], bd = M().board(), p = M().pending(), ok = false;
      L.auto = true;
      try {
        if (m.choose !== undefined) ok = !!(p && p.kind === 'dialog' && p.rows.length) && dbg.choose(m.choose) !== false;
        else if (!settled()) ok = false;
        else if (m.pick) ok = (bd.pickable || []).indexOf(m.pick) >= 0 && dbg.pickActor(m.pick) !== false;
        else if (m.verb) ok = !!bd.verbs[m.verb] && dbg.press(m.verb) !== false;
        else if (m.hex) ok = (bd.dests || []).indexOf(m.hex) >= 0 && dbg.clickHex(m.hex) !== false;
      } finally { L.auto = false; }
      if (ok) { moves.shift(); since = Date.now(); }
    }, 250);
  }

  // the board is waiting for the player again: nothing resolving, no card line playing
  function settled() {
    var p = M().pending();
    return !document.body.classList.contains('resolving') && (!p || p.kind === 'dialog');
  }
  document.addEventListener('click', gate, true);

  window.AmbushLesson = {
    start: start, next: next, leave: leave, answer: answer, ticks: ticks, active: function () { return !!L; },
    fixture: function () { return L ? window.AMBUSH_LESSON_FIXTURES[L.lesson.fixture] : null; },
    // live checks
    state: function () { return L ? { id: L.lesson.id, beat: L.i, step: L.step, waiting: L.waiting, settling: !!L.settling, rows: L.rows.length, answer: L.answer } : null; },
  };
})();

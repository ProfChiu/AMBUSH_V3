'use strict';
// mission1/present.js (2 of 13) — dice, voice, log, pop-up helpers, Resolve, FX. Stage A cut of mission1.js lines 366-979 (docs/REFACTOR_MAP.md 5.4).
  // ---------------------------------------------------------------------
  // Dice
  // ---------------------------------------------------------------------
  // v3 Phase 6: a lesson plays on its own seeded stream (lesson.js), so the dice in Whitaker's
  // words are the dice on the board. Outside a lesson this is null and play is unchanged.
  var lessonRng = null;
  function d10() { return Math.floor((lessonRng || Math.random)() * 10); }
  function d100() { return d10() * 10 + d10(); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtSigned(n) { return (n >= 0 ? '+' : '') + n; }
  // Tumbling faces only — never a game roll. Drawn from crypto, not Math.random, so the
  // animation consumes nothing from the (seedable) game stream: tick count, skipping, or
  // replacing the animation cannot change any outcome. The game roll is decided by d10()
  // before animateDie is called.
  var faceBuf = new Uint8Array(1);
  function tumbleFace() {
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(faceBuf);
      return faceBuf[0] % 10;
    }
    return (Date.now() + Math.floor(performance.now())) % 10;
  }
  // onFace(face, landed) lets a table strip follow the tumble (Phase 4); it never sees a game roll
  // before the die lands on it.
  function animateDie(el, val, done, tickMs, onFace) {
    el.classList.add('rolling');
    var ticks = 0;
    var iv = setInterval(function () {
      var f = tumbleFace();
      el.textContent = f;
      if (onFace) onFace(f, false);
      if (ticks % 2 === 0) FX.sound('die'); // Phase 5: the rattle, every other face
      if (++ticks >= 8) {
        clearInterval(iv); el.textContent = val; el.classList.remove('rolling');
        FX.sound('land');
        if (onFace) onFace(val, true);
        if (done) done();
      }
    }, tickMs === undefined ? 55 : tickMs);
  }
  // The table row a single die is read against (Phase 4, "dice tray with the table row lit"):
  // ten cells, 0-9, each tinted by what that face means; the tumble flickers across them and the
  // landed face lights. Built from the same engine lookups the result uses, so it cannot disagree.
  function hitStrip(c) {
    var cells = [], hits = 0;
    for (var i = 0; i < 10; i++) {
      var hit = FC.resolveHitRoll(c, i) === 'hit';
      if (hit) hits++;
      cells.push({ label: hit ? 'HIT' : '', tone: hit ? 'hit' : 'miss' });
    }
    return { cells: cells, caption: 'Hit Chance ' + c + ' &mdash; hits on ' + (hits ? '0&ndash;' + (hits - 1) : 'nothing') };
  }
  var STRIP_TONE = { K: 'bad', I: 'bad', W: 'amber', X: 'amber', Z: 'amber', P: 'amber', C: 'amber' };
  function damageStrip(weapon) {
    var cells = [];
    for (var i = 0; i < 10; i++) {
      var code = FC.resolveDamage(weapon, i, CHART.DAMAGE_LEGEND).code;
      cells.push({ label: code === '*' ? '&ndash;' : code, tone: STRIP_TONE[code] || 'miss' });
    }
    return { cells: cells, caption: weapon.name + ' damage row' };
  }
  function stripHtml(strip) {
    return '<div class="res-strip">' + strip.cells.map(function (c, i) {
      return '<span class="rs-cell rs-' + c.tone + '" data-f="' + i + '"><b>' + i + '</b><i>' + c.label + '</i></span>';
    }).join('') + '</div><div class="res-strip-cap">' + strip.caption + '</div>';
  }
  function stripFollow(line) {
    var cells = line.querySelectorAll('.rs-cell');
    if (!cells.length) return null;
    return function (face, landed) {
      Array.prototype.forEach.call(cells, function (c) { c.classList.remove('peek'); });
      var cell = cells[face];
      if (cell) cell.classList.add(landed ? 'lit' : 'peek');
    };
  }
  // The game draw for a roll: the one place a rollPopup's dice are decided, always in the same
  // order (tens then ones; a then b), so the seeded stream matches the recorded baselines.
  function drawRoll(opts) {
    if (opts.kind === 'percentile') {
      var tens = opts.presetValue !== undefined ? Math.floor(opts.presetValue / 10) : d10();
      var ones = opts.presetValue !== undefined ? opts.presetValue % 10 : d10();
      return { value: tens * 10 + ones, faces: [tens, ones] };
    }
    if (opts.kind === 'dual') {
      var a = opts.presetValue ? opts.presetValue.a : d10();
      var b = opts.presetValue ? opts.presetValue.b : d10();
      return { value: { a: a, b: b }, faces: [a, b] };
    }
    var v = opts.presetValue !== undefined ? opts.presetValue : d10();
    return { value: v, faces: [v] };
  }

  // ---------------------------------------------------------------------
  // Voice-over — deferred item from the 2026-08-05 UX pass, built now. Browser-native
  // SpeechSynthesis, no dependency, works offline under file://. Off by default (muted); the
  // topbar toggle flips it. Strips HTML tags via the DOM (no regex) before speaking, and cancels
  // any in-flight utterance first so clicking through popups quickly doesn't queue a backlog.
  // ---------------------------------------------------------------------
  var voiceMuted = true;
  var stripTagsEl = document.createElement('div');
  function stripTags(html) {
    stripTagsEl.innerHTML = html || '';
    return (stripTagsEl.textContent || '').trim();
  }
  function speak(html) {
    if (voiceMuted || !window.speechSynthesis) return;
    var text = stripTags(html);
    if (!text) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  // ---------------------------------------------------------------------
  // Log
  // ---------------------------------------------------------------------
  function logLine(html, cls) {
    var div = document.createElement('div');
    div.className = 'log-line' + (cls ? ' ' + cls : '');
    div.innerHTML = html;
    var el = document.getElementById('combatlog');
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
    console.log('[Ambush]', div.textContent); // mirrors the play log to devtools/driver capture
  }
  function logHeader(text) { logLine('<b>' + text + '</b>', 'event'); }
  // A radio-log entry with structure (an expander) rather than one line of text — same log, same
  // devtools mirror.
  function logBlock(html, cls) {
    var div = document.createElement('div');
    div.className = 'log-line radio' + (cls ? ' ' + cls : '');
    div.innerHTML = html;
    var el = document.getElementById('combatlog');
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
    var sum = div.querySelector('summary');
    console.log('[Ambush]', (sum || div).textContent);
  }

  // ---------------------------------------------------------------------
  // Pop-up helpers — identical shape to skirmishchessdemo.js.
  // ---------------------------------------------------------------------
  // A US soldier has no PC/WS until his own Ratings roll resolves, and the Ratings pop-up shows
  // his portrait row BEFORE that happens — so those two stats are genuinely absent for one dialog
  // and were rendering as the literal text "PC undefined WS undefined". Omit what isn't known yet
  // rather than printing a placeholder that reads like a bug.
  function soldierStatLine(s) {
    var parts = ['IN ' + s.IN];
    if (s.side !== 'german' && s.PC !== undefined) parts.push('PC ' + s.PC);
    if (s.WS !== undefined) parts.push('WS ' + fmtSigned(s.WS));
    return parts.join(' ') + ' &middot; ' + s.stance;
  }
  function combatantHtml(s) {
    if (!s) return '';
    return '<div class="combatant"><img src="' + currentImgFor(s) + '"><div class="cname">' + s.name + '</div>' +
      '<div class="cstat">' + soldierStatLine(s) + '</div></div>';
  }
  function actorRowHtml(actor) {
    if (actor && (actor.left || actor.right)) {
      return '<div class="combat-row">' + combatantHtml(actor.left) + '<div class="vs">VS</div>' + combatantHtml(actor.right) + '</div>';
    }
    return '<div class="combat-row">' + combatantHtml(actor) + '</div>';
  }
  // Every non-decision step is a line on a resolution card (Resolve, below). The v1 modal versions
  // of these two helpers — one dialog per step, a "Roll" press for the player's own dice — were
  // the Classic dialogs build, removed 2026-09-21 once Wan no longer needed the comparison. The
  // rules and the order of every d10() are unchanged: Resolve keeps each line in the Dialogs queue.
  // v3 Phase 4b: banners and Major Kranz's cameos (cues.js). Decoration: never a press, never state.
  var Cues = window.AmbushCues || { banner: function () {}, kranz: function () {}, cardClosed: function () {}, cardOpened: function () {} };
  function infoPopup(opts, cb) { Resolve.pushInfo(opts, cb); }
  function rollPopup(opts, cb) { Resolve.pushRoll(opts, cb); }


  // ---------------------------------------------------------------------
  // Resolution cards (v2 tasks 3 and 6; docs/01_PRESENTATION_SPEC.md §3) — the game's only
  // presentation since Classic dialogs was retired (2026-09-21). Every infoPopup and rollPopup
  // becomes a line on a non-modal card near the actor: dice animate and land, the result shows,
  // and the game moves on without a press. Each line is still a Dialogs queue item (modeless), so
  // the order of everything — and therefore every seeded d10() — is exactly the order the v1
  // dialogs used, which is why the recorded baselines still reproduce. Decisions (target, option,
  // Capture/Kill) stay modal. Speed: slow / normal / fast; hold Space or hold the mouse on the
  // map to run to the next decision (Gate 0 answer 3). Speed never changes an outcome.
  // ---------------------------------------------------------------------
  var Resolve = (function () {
    var SPEED_KEY = 'ambush.v3.speed'; // v3's own (R5 Step 8); v2 keeps ambush.v2.speed
    var SPEEDS = { slow: 1.7, normal: 1, fast: 0.4 };
    function stored(key, fallback) { try { return window.localStorage.getItem(key) || fallback; } catch (e) { return fallback; } }
    function store(key, v) { try { window.localStorage.setItem(key, v); } catch (e) { /* private window: per-visit only */ } }
    var speed = stored(SPEED_KEY, 'normal');
    if (!SPEEDS[speed]) speed = 'normal';
    var skipping = false;
    var card = null;      // { el, linesEl, actorKey, lastTitle, open }

    // Task 6: cards cover Operations as well as Action Rounds — the per-step Move pop-up becomes
    // a line on the walking soldier's card, which is what lets a multi-hex walk flow at all.
    function T(ms) { return skipping ? 0 : Math.round(ms * SPEEDS[speed]); }

    // Reading time (Wan, 2026-09-23: "I would like to read them before they disappear"). A line
    // stays long enough to read at ~250 words a minute, never under 1.5 s, capped at 12 s (a long
    // Paragraph is clipped on the card anyway; the full text is in the log). The pointer resting
    // on the card holds the queue. The card has pointer-events:none (the map under it stays
    // clickable), so "on the card" is a rect test against the last known pointer position.
    var pointer = { x: -1, y: -1 };
    document.addEventListener('mousemove', function (e) { pointer.x = e.clientX; pointer.y = e.clientY; }, true);
    // maxMs: a lower cap for one line (Event Check lines use EVENT_READ_MS; Wan, 2026-10-24:
    // "event rolling takes a long time").
    function readMs(html, maxMs) {
      var words = String(html || '').replace(/<[^>]*>|&[#a-z0-9]+;/gi, ' ').split(/\s+/).filter(Boolean).length;
      return Math.min(maxMs || 12000, Math.max(1500, words * 240));
    }
    function hovered() {
      if (!card) return false;
      var r = card.el.getBoundingClientRect();
      return pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
    }
    // One timer per line, so the bot (which clamps every timer to 1 ms) keeps its speed. When it
    // runs out with the pointer on the card, the card is held and polled until the pointer
    // leaves. Holding Space (or the mouse on the map) fires the waiting line at once.
    var pendingHold = null;
    function hold(ms, fn) {
      var timer;
      function expire() {
        clearTimeout(timer);
        if (!skipping && hovered()) { card.el.classList.add('held'); timer = setTimeout(expire, 150); return; }
        if (card) card.el.classList.remove('held');
        pendingHold = null;
        fn();
      }
      pendingHold = expire;
      timer = setTimeout(expire, T(ms));
    }
    function startSkipping() { skipping = true; if (pendingHold) pendingHold(); }
    function actorKey(a) { return !a ? '' : a.id || (a.left && a.left.id) || ''; }
    function actorHex(a) { return !a ? null : a.hexId || (a.left && a.left.hexId) || null; }

    function closeCard(now) {
      if (!card) return;
      var old = card; card = null;
      Cues.cardClosed(!!old.finished);
      if (now) { old.el.remove(); return; }
      old.el.classList.add('fading');
      setTimeout(function () { old.el.remove(); }, 400);
    }
    // v3 Phase 3b (Wan, 2026-10-22; replaces punch list 1's Done gate): the turn is handed on at
    // once and the finished card stays up to be read until the player's next decision closes it:
    // a click on the map, a ring verb, a pick or a panel button, or a decision dialog. Done and
    // Enter still close it. The menu strip and its popups (log, squad) leave it up.
    function awaitDone(fn) {
      if (card) { card.finished = true; card.el.classList.add('done'); }
      fn();
    }
    function lingering() { return !!(card && card.finished); }
    function pressDone() { if (!lingering()) return false; closeCard(false); return true; }
    document.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || !lingering() || !e.target.closest) return;
      if (e.target.closest('.res-card, .strip, .popup')) return;
      closeCard(false);
    }, true);
    Dialogs.onPresent(function (spec) { if (spec && !spec.modeless && lingering()) closeCard(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && lingering() && !Dialogs.current) { e.preventDefault(); pressDone(); }
    });
    function lineFor(opts) {
      var key = actorKey(opts.actor);
      // One card per uninterrupted resolution: a new card when a decision or an idle gap closed
      // the last one, or when both the actor and the kind of step change (a new action).
      // A finished card (it showed Done: the player had the board) never takes the next action's lines.
      if (card && (opts.solo || !card.open || card.finished || (key !== card.actorKey && opts.title !== card.lastTitle))) closeCard(!!opts.solo);
      if (!card) {
        var el = document.createElement('div');
        el.className = 'res-card';
        var who = opts.actor && (opts.actor.name || (opts.actor.left && opts.actor.left.name));
        el.innerHTML = '<div class="res-head"></div><div class="res-lines"></div>' +
          '<div class="res-foot"><button type="button" class="btn res-done">Done</button></div>';
        // Done (2026-09-25, Wan: the click that closed the card also selected the next soldier).
        // Once the card is finished it takes the mouse (.done: pointer-events on), so a click on
        // it, or on its Done button, closes it and never reaches the map underneath.
        el.addEventListener('click', function (e) {
          if (!el.classList.contains('done')) return;
          e.stopPropagation(); e.preventDefault();
          if (card && card.el === el) closeCard(false); else el.remove();
        });
        el.querySelector('.res-head').innerHTML = who || opts.title || '';
        // Beside the action, never on it (task 4: the board now shows the result, so the card
        // must not cover the target): clear of the actor, his target and any aimed-at hex, on
        // whichever side has room; below in the top half of the map, above in the bottom half.
        var hex = actorHex(opts.actor);
        var pos = hex ? pctPos(hex) : { left: 50, top: 30 };
        var focus = [hex, opts.actor && opts.actor.right && opts.actor.right.hexId, opts.focusHex].filter(Boolean)
          .map(function (h) { return pctPos(h).left; });
        if (!focus.length) focus = [pos.left];
        var maxX = Math.max.apply(null, focus), minX = Math.min.apply(null, focus), CARD_W = 27;
        var GAP = 5; // a full hex and a half: clears a scatter into the next hex
        if (100 - maxX >= CARD_W + GAP) el.style.left = (maxX + GAP) + '%';
        else if (minX >= CARD_W + GAP) el.style.right = (100 - minX + GAP) + '%';
        else if (pos.left < 58) el.style.left = (pos.left + 3) + '%';
        else el.style.right = (100 - pos.left + 3) + '%';
        if (pos.top < 50) { el.style.top = Math.max(1, pos.top - 3) + '%'; } else { el.style.bottom = Math.max(1, 100 - pos.top - 3) + '%'; }
        // v3: the card is drawn at screen size on the zoomable board, scaled from its anchored corner
        el.style.setProperty('--card-origin', (el.style.left ? 'left' : 'right') + ' ' + (el.style.top ? 'top' : 'bottom'));
        canvas.appendChild(el);
        card = { el: el, linesEl: el.querySelector('.res-lines'), actorKey: key, lastTitle: opts.title, open: true, batch: false };
        Cues.cardOpened(key);
      }
      // Same step, another actor (Initiative, US Awareness): a batch card, headed by the step,
      // each line naming its actor.
      if (key !== card.actorKey && !card.batch) {
        card.batch = true;
        card.el.querySelector('.res-head').innerHTML = opts.title || '';
        Array.prototype.forEach.call(card.linesEl.children, function (l) {
          if (l.dataset.named || !l.dataset.actorName) return;
          l.dataset.named = '1';
          var tEl = l.querySelector('.res-title');
          if (tEl) tEl.innerHTML = l.dataset.actorName + ' &middot; ' + tEl.innerHTML;
        });
      }
      card.lastTitle = opts.title;
      var line = document.createElement('div');
      line.className = 'res-line';
      line.dataset.named = card.batch || key !== card.actorKey ? '1' : '';
      var nm = opts.actor && (opts.actor.name || (opts.actor.left && opts.actor.left.name));
      line.dataset.actorName = nm || '';
      card.linesEl.appendChild(line);
      while (card.linesEl.children.length > 6) card.linesEl.removeChild(card.linesEl.firstChild);
      return line;
    }
    // The line's small title: the step, plus the actor only when the card header does not say it.
    function lineTitle(line, opts) {
      var a = opts.actor, name = a && (a.name || (a.left && a.left.name));
      return (line.dataset.named && name ? name + ' &middot; ' : '') + (opts.title || '');
    }

    function pushInfo(opts, cb) {
      Dialogs.push({
        modeless: true, title: opts.title,
        run: function (ctx) {
          var line = lineFor(opts);
          // cardHtml: a one-line version for the card when the full body belongs in the log
          // (a German's paragraph and reasoning — Gate 0 answer 1).
          var shown = opts.cardHtml || opts.bodyHtml;
          line.innerHTML = '<div class="res-title">' + lineTitle(line, opts) + '</div>' +
            '<div class="res-text' + (opts.bodyIsParagraph && !opts.cardHtml ? ' res-paragraph' : '') + '">' + shown + '</div>';
          radioLog(opts);
          speak(shown);
          runFx(opts.fx);
          hold(readMs(shown, opts.maxReadMs), function () { ctx.close(); });
        },
        onClose: function () { if (cb) cb(); },
      });
    }
    function pushRoll(opts, cb) {
      Dialogs.push({
        modeless: true, title: opts.title,
        run: function (ctx) {
          var line = lineFor(opts);
          var n = opts.kind === 'percentile' || opts.kind === 'dual' ? 2 : 1;
          var dice = '';
          for (var i = 0; i < n; i++) dice += '<span class="res-die">&ndash;</span>';
          line.innerHTML = '<div class="res-title">' + lineTitle(line, opts) + '</div>' +
            (opts.contextHtml ? '<div class="res-context">' + opts.contextHtml + '</div>' : '') +
            '<div class="res-roll">' + dice + '<span class="res-result"></span></div>' +
            (opts.strip && n === 1 ? stripHtml(opts.strip) : '');
          var drawn = drawRoll(opts); // the game roll, decided now — the animation below draws nothing
          var dieEls = line.querySelectorAll('.res-die'), landed = 0, follow = stripFollow(line);
          setTimeout(function () {
            Array.prototype.forEach.call(dieEls, function (el, i) {
              animateDie(el, drawn.faces[i], function () {
                if (++landed < dieEls.length) return;
                var resultHtml = opts.explain(drawn.value);
                line.querySelector('.res-result').innerHTML = resultHtml;
                if (opts.logText) logLine(opts.logText(drawn.value));
                speak(resultHtml);
                runFx(opts.fxLanded, drawn.value);
                hold(readMs(resultHtml, opts.maxReadMs), function () { ctx.close(drawn.value); });
              }, T(45), follow);
            });
          }, T(120));
        },
        onClose: function (result) { if (cb) cb(result); },
      });
    }

    // Board effects are decoration: a failure in one must never stall the queue it rides on, so
    // it is reported (console.error — the live drive counts it) and play goes on.
    function runFx(fn, arg) {
      if (typeof fn !== 'function') return;
      try { fn(arg); } catch (e) { console.error('[Ambush fx]', e); }
    }
    // The radio log (Gate 0 answers 1, 2 and task 4's "clipped card"): a German's paragraph is
    // one line with a "why" expander holding the text and the option that applied; a US
    // Paragraph Check's text is a clipped card, click to read it all. Everything else is the
    // ordinary log line.
    function radioLog(opts) {
      var summary = opts.logHtml || opts.bodyHtml;
      if (opts.logDetailHtml) {
        logBlock('<details class="radio-why"><summary>' + summary + ' <span class="why">why</span></summary>' +
          '<div class="radio-detail">' + opts.logDetailHtml + '</div></details>');
        return;
      }
      if (opts.bodyIsParagraph) {
        logBlock('<details class="radio-para"><summary>' + (opts.title || 'Paragraph') +
          (opts.actor && opts.actor.name ? ' &middot; ' + opts.actor.name : '') + '<span class="radio-clip">' + opts.bodyHtml + '</span></summary>' +
          '<div class="radio-detail">' + opts.bodyHtml + '</div></details>', 'para');
        return;
      }
      logLine(summary);
    }

    // A decision closes the card for appends (the next line starts a fresh card after it); the
    // queue going idle leaves the last card up until the player's next click (2026-09-23: it used
    // to fade after 2.2 s, before it could be read); the next card also replaces it.
    // "Finished" means the queue has stayed idle for a moment: a walk hands one step to the next
    // through a brief idle, and Done must not flicker on between steps.
    var doneTimer = null;
    Dialogs.onPresent(function (spec) {
      document.body.classList.toggle('resolving', !!(spec && spec.modeless));
      if (spec && !spec.modeless && card) card.open = false;
      clearTimeout(doneTimer);
      if (!card) return;
      card.idle = !spec;
      card.el.classList.remove('done');
      if (!spec && card.gate) { card.el.classList.add('done'); return; }
      if (!spec) {
        var c = card;
        doneTimer = setTimeout(function () { if (card === c && c.idle) { c.finished = true; c.el.classList.add('done'); } }, 350);
      }
    });
    // A click anywhere else still closes a finished card, and does what it was aimed at.
    document.addEventListener('pointerdown', function (e) {
      if (card && card.idle && !card.gate && !card.el.contains(e.target)) closeCard(false);
    }, true);

    // Speed and skip controls.
    function setSpeed(s) {
      if (!SPEEDS[s]) return;
      speed = s; store(SPEED_KEY, s);
      document.querySelectorAll('#speedCtl button').forEach(function (b) { b.classList.toggle('active', b.dataset.speed === s); });
    }
    document.querySelectorAll('#speedCtl button').forEach(function (b) {
      b.addEventListener('click', function () { setSpeed(b.dataset.speed); });
    });
    function typing(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !typing(e)) { startSkipping(); e.preventDefault(); }
    });
    document.addEventListener('keyup', function (e) { if (e.code === 'Space') skipping = false; });
    var vp = document.getElementById('board');
    vp.addEventListener('mousedown', function (e) { if (e.button === 0 && document.body.classList.contains('resolving')) startSkipping(); });
    window.addEventListener('mouseup', function () { skipping = false; });
    window.addEventListener('blur', function () { skipping = false; });
    // Resolution cards are the only presentation (the v1.1/v1.2 chooser was removed in R2).
    document.getElementById('speedCtl').style.display = '';
    var lh = document.getElementById('log-heading'); if (lh) lh.textContent = 'Radio Log';
    document.body.classList.add('cards-mode');
    setSpeed(speed);

    return { pushInfo: pushInfo, pushRoll: pushRoll, setSpeed: setSpeed, T: T,
      awaitDone: awaitDone, lingering: lingering, pressDone: pressDone };
  })();

  // ---------------------------------------------------------------------
  // Board effects (v2 task 4; docs/01_PRESENTATION_SPEC.md §4): the fight happens on the map.
  // Tracers from shooter to target, the landed die floating up at the target, result badges on
  // counters, grenade blasts, move trails, and a camera that follows action only when it is
  // off-screen (Gate 0 task-4 answers). Resolution-card mode only; Classic stays v1. Pure
  // decoration: nothing here is queued, awaited, or reads a die — every call is fire-and-forget
  // from a card line that has already been decided.
  // ---------------------------------------------------------------------
  var FX = (function () {
    var svg = null, badgeCount = {};
    var NS = 'http://www.w3.org/2000/svg';
    function ms(base) { return Math.max(120, Resolve.T(base)); }
    // Phase 5: a cue only when the board is showing results, never while they are skipped
    function sound(name) { if (Resolve.T(100) > 0 && window.AmbushAudio) AmbushAudio.play(name); }
    function layer() {
      if (svg && svg.parentNode) return svg;
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'fx-layer');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      canvas.appendChild(svg);
      return svg;
    }
    function at(el, hexId, dx, dy) {
      var p = pctPos(hexId);
      el.style.left = (p.left + (dx || 0)) + '%'; el.style.top = (p.top + (dy || 0)) + '%';
    }
    function later(fn, base) { setTimeout(fn, ms(base)); }
    function fadeOut(el, base) {
      later(function () { el.classList.add('fx-gone'); setTimeout(function () { el.remove(); }, 450); }, base);
    }
    function line(fromHex, toHex, cls) {
      var a = pctPos(fromHex), b = pctPos(toHex);
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', a.left); l.setAttribute('y1', a.top); l.setAttribute('x2', b.left); l.setAttribute('y2', b.top);
      l.setAttribute('class', cls);
      layer().appendChild(l);
      return l;
    }
    // A shot, a throw or an assault: the line appears at once (marching toward the target) and
    // takes its verdict when the roll lands.
    // Phase 5: the shot's sound follows the weapon (weapon_chart ids); a grenade is a throw
    var SHOT = { pistol: 'pistol', smg: 'smg', mp: 'smg', bar: 'mg', mmg: 'mg', baz: 'rocket' };
    function tracer(fromHex, toHex, kind, weaponId) {
      if (!fromHex || !toHex) return { resolve: function () {} };
      var l = line(fromHex, toHex, 'fx-tracer fx-' + (kind || 'fire'));
      if ((kind || 'fire') === 'fire') { flash(fromHex); sound(SHOT[weaponId] || 'rifle'); }
      else if (kind === 'grenade') sound('throw');
      var done = false;
      function finish(result) {
        if (done) return; done = true;
        l.setAttribute('class', 'fx-tracer fx-' + (kind || 'fire') + ' fx-' + result);
        fadeOut(l, result === 'hit' ? 1600 : 1100);
      }
      later(function () { finish('stale'); }, 9000); // never leave a tracer behind a lost verdict
      return { resolve: finish };
    }
    function trail(fromHex, toHex) {
      if (!fromHex || !toHex || fromHex === toHex) return;
      fadeOut(line(fromHex, toHex, 'fx-trail'), 2600);
    }
    function floatDie(hexId, value, tone) {
      if (!hexId) return;
      var el = document.createElement('div');
      el.className = 'fx-die fx-' + (tone || 'neutral');
      el.textContent = value;
      at(el, hexId, 1.6, -1.2);
      el.style.animationDuration = ms(1500) + 'ms';
      canvas.appendChild(el);
      setTimeout(function () { el.remove(); }, ms(1500) + 50);
    }
    // Badges stack upward when several land on one hex in quick succession (a grenade's victims).
    function badge(hexId, text, tone) {
      if (!hexId) return;
      var n = badgeCount[hexId] = (badgeCount[hexId] || 0) + 1;
      var el = document.createElement('div');
      el.className = 'fx-badge fx-' + (tone || 'neutral');
      el.textContent = text;
      at(el, hexId, 0, -2.4 - (n - 1) * 1.7);
      canvas.appendChild(el);
      later(function () {
        el.classList.add('fx-gone');
        setTimeout(function () { el.remove(); badgeCount[hexId] = Math.max(0, (badgeCount[hexId] || 1) - 1); }, 450);
      }, 2600);
    }
    function blast(hexId, dud) {
      if (!hexId) return;
      var el = document.createElement('div');
      el.className = dud ? 'fx-blast fx-dud' : 'fx-blast';
      at(el, hexId);
      canvas.appendChild(el);
      setTimeout(function () { el.remove(); }, 900);
      sound(dud ? 'dud' : 'blast');
      if (!dud) shake();
    }
    // Phase 4 (Medium, Wan 2026-10-22): a muzzle flash at the shooter, a short shake of the map on
    // a hit only (off under reduced motion), and a stamp on the counter when his status changes.
    function still() { return document.body.classList.contains('still'); }
    function flash(hexId) {
      if (!hexId) return;
      var el = document.createElement('div');
      el.className = 'fx-flash';
      at(el, hexId);
      canvas.appendChild(el);
      setTimeout(function () { el.remove(); }, 450);
    }
    var shakeTimer = null;
    function shake() {
      if (still()) return;
      canvas.classList.remove('fx-shake');
      void canvas.offsetWidth; // restart the animation when hits land back to back
      canvas.classList.add('fx-shake');
      clearTimeout(shakeTimer);
      shakeTimer = setTimeout(function () { canvas.classList.remove('fx-shake'); }, 420);
    }
    // sub: a smaller second line; life: how long it stays (ms, default 2800)
    function stamp(hexId, text, tone, sub, life) {
      if (!hexId) return;
      var n = badgeCount[hexId] = (badgeCount[hexId] || 0) + 1;
      var el = document.createElement('div');
      el.className = 'fx-stamp fx-' + (tone || 'bad');
      el.textContent = text;
      if (sub) { var sm = document.createElement('small'); sm.textContent = sub; el.appendChild(sm); }
      at(el, hexId, 0, (n - 1) * 1.4);
      canvas.appendChild(el);
      later(function () {
        el.classList.add('fx-gone');
        setTimeout(function () { el.remove(); badgeCount[hexId] = Math.max(0, (badgeCount[hexId] || 1) - 1); }, 450);
      }, life || 2800);
    }
    // Pan only when something is off-screen, just far enough to show all of `hexes` (v3: the
    // camera is the stage's zoom/pan view, AmbushStage.view, not v2's vertical scroll).
    function ensureVisible(hexes, instant) {
      if (!window.AmbushStage) return;
      var pts = hexes.filter(Boolean).map(function (h) { var p = pctPos(h); return { x: p.left / 100 * G.MAP_WIDTH, y: p.top / 100 * G.MAP_HEIGHT }; });
      if (!pts.length) return;
      // Instant when the player is about to click (a gliding map moves the hex out from under
      // the cursor mid-click); smooth when it is following the action.
      AmbushStage.view.reveal(pts, 120, instant);
    }
    var STATUS_BADGE = { wounded: ['WOUNDED', 'bad'], incapacitated: ['INCAPACITATED', 'bad'], killed: ['KIA', 'bad'],
      panicked: ['PANIC', 'amber'], captured: ['CAPTURED', 'amber'] };
    function status(s) {
      var b = STATUS_BADGE[s.status];
      if (b) stamp(s.hexId, b[0], b[1]);
      if (s.status === 'killed' || s.status === 'incapacitated') sound('kia');
      // v3 Phase 4b: a US soldier killed is a notable moment for the other side
      if (s.status === 'killed' && M1.state.usSoldiers.indexOf(s) >= 0) {
        Cues.kranz('cheerful', '<b>Ein Amerikaner weniger.</b> ' + nameFor(s.id) + ' is killed at ' + s.hexId + '. His squad-mates cannot bring him back.');
      }
    }
    return { tracer: tracer, trail: trail, floatDie: floatDie, badge: badge, blast: blast, ensureVisible: ensureVisible, status: status,
      flash: flash, shake: shake, stamp: stamp, sound: sound };
  })();


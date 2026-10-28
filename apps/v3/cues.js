/*
 * Ambush! v3 — cues (Phase 4b): the banner and Major Kranz's cameos. Presentation only; nothing
 * here waits on the player or holds the resolution queue (a press is a decision, never an
 * acknowledgement), and nothing here touches game state, so bot parity cannot move.
 *
 * Banner (Wan, 2026-10-22): one banner, merged. A cue that arrives while a banner is up joins it:
 * the most important cue keeps the big title, the rest become the subtitle ("3 Germans activated ·
 * Condition 2"), and the banner's life is extended. Importance: mission end > Contact / Action
 * Round > Condition > Operations / Round complete > activation.
 *
 * Kranz (Wan, 2026-10-22): notable moments only (activation, Condition change, Self-Preservation /
 * Special Reaction column, a German grenade, a US soldier killed). Her face and a bubble slide in
 * bottom-left; she voices the engine's own reason in English with a German word or two, cite
 * kept. She leaves when the player's next decision closes the result card, when she speaks
 * again, or when another German starts acting after she has been up long enough to read.
 */
(function () {
  'use strict';

  var A = window.AmbushAudio;
  var $ = function (id) { return document.getElementById(id); };
  function still() { return document.body.classList.contains('still'); }

  // ---------------------------------------------------------------- banner
  var PRI = { end: 5, phase: 4, condition: 3, ops: 2, round: 2, activation: 1 };
  var LIFE = 2200, END_LIFE = 3600;
  var shown = null, timer = null;   // shown: { items: [{ kind, title, sub, tone }] }

  function render() {
    var b = $('banner'); if (!b) return;
    var items = shown.items;
    // the most important cue (the latest of equals) keeps the title
    var top = items.reduce(function (t, i) { return PRI[i.kind] >= PRI[t.kind] ? i : t; });
    var acts = items.filter(function (i) { return i.kind === 'activation'; }).length;
    var title = top.title, subs = [];
    if (top.kind === 'activation') {
      if (acts > 1) { title = 'Germans Activated'; subs.push(acts + ' Germans activated'); } else subs.push(top.sub);
    } else {
      if (top.sub) subs.push(top.sub);
      // the rest, most important first; only the latest Condition counts
      var cond = null;
      items.forEach(function (i) { if (i.kind === 'condition' && i !== top) cond = i; });
      items.filter(function (i) { return i !== top && i.kind !== 'activation' && i.kind !== 'condition'; })
        .forEach(function (i) { subs.push(i.title); });
      if (cond && top.kind !== 'condition') subs.push(cond.title);
      if (acts) subs.push(acts === 1 ? 'German activated' : acts + ' Germans activated');
    }
    b.innerHTML = esc(title) + (subs.length ? '<small>' + subs.filter(Boolean).map(esc).join(' &middot; ') + '</small>' : '');
    b.className = 'up' + (top.tone ? ' ' + top.tone : '');
  }
  function banner(kind, title, sub, tone) {
    var fresh = !shown;
    if (fresh) shown = { items: [] };
    if (kind === 'end') shown.items = [];          // the mission's last word stands alone
    shown.items.push({ kind: kind, title: title, sub: sub || '', tone: tone || '' });
    render();
    var b = $('banner');
    if (fresh) { b.classList.remove('up'); void b.offsetWidth; b.classList.add('up'); }
    if (fresh || PRI[kind] >= 3) A.play('banner');
    clearTimeout(timer);
    timer = setTimeout(function () {
      b.classList.remove('up'); b.classList.add('out');
      shown = null;
      timer = setTimeout(function () { if (!shown) b.className = ''; }, still() ? 0 : 450);
    }, kind === 'end' ? END_LIFE : LIFE);
  }

  // ---------------------------------------------------------------- Kranz
  var IMG = '../../assets/characters/kranz/sprite/kranz-face-';
  var k = { on: false, actor: null, since: 0, minMs: 0, hideT: null };
  function readMs(html) {
    var words = String(html || '').replace(/<[^>]*>|&[#a-z0-9]+;/gi, ' ').split(/\s+/).filter(Boolean).length;
    return Math.min(9000, Math.max(2500, words * 260));
  }
  function kranz(face, html, actorId) {
    var el = $('kranz'); if (!el) return;
    clearTimeout(k.hideT);
    var say = el.querySelector('.say');
    el.querySelector('img').src = IMG + face + '.png';
    // a line arriving before the last one has had its reading time joins it (two at most)
    if (k.on && Date.now() - k.since < k.minMs) {
      var prev = say.lastElementChild;
      say.innerHTML = (prev ? prev.outerHTML : '') + '<p>' + html + '</p>';
      k.minMs = readMs(say.innerHTML); k.since = Date.now(); k.actor = actorId || k.actor;
      return;
    }
    say.innerHTML = '<p>' + html + '</p>';
    // beside the Selected Soldier panel, never over it
    var hud = $('hud-soldier'), r = hud && hud.offsetParent ? hud.getBoundingClientRect() : null;
    el.style.left = (r && r.width ? Math.round(r.right + 12) : 16) + 'px';
    el.hidden = false;
    el.classList.remove('in', 'out'); void el.offsetWidth; el.classList.add('in');
    k.on = true; k.actor = actorId || null; k.since = Date.now(); k.minMs = readMs(html);
  }
  function hide() {
    var el = $('kranz'); if (!el || !k.on) return;
    k.on = false;
    el.classList.remove('in'); el.classList.add('out');
    k.hideT = setTimeout(function () { el.hidden = true; el.classList.remove('out'); }, still() ? 0 : 320);
  }
  // Resolve calls these: a finished card closed by the player's decision sends her off; a new
  // card for a different German does, once her line has had its reading time.
  function cardClosed(byDecision) { if (byDecision) hide(); }
  function cardOpened(actorId) {
    if (!k.on || !actorId || actorId === k.actor) return;
    if (Date.now() - k.since >= k.minMs) hide();
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  window.AmbushCues = {
    banner: banner, kranz: kranz, kranzHide: hide, cardClosed: cardClosed, cardOpened: cardOpened,
    // live drives
    state: function () { return { banner: shown ? $('banner').textContent : null, kranz: k.on ? $('kranz').querySelector('.say').textContent : null }; },
  };
})();

/*
 * Ambush! v3 — stacks (punch list 2, Wan 2026-10-21). Presentation only.
 *
 * v2 draws every counter in a hex at the same point, so only the top one can be seen or clicked.
 * Here a hex holding two or more tokens gets a "×N" badge on its top counter, and clicking a
 * counter in it opens the stack panel: every token in the hex, what he carries, and what the
 * player may do from there:
 *   - pick him to act (a Round, when soldiers share a track space, §6/1) or select him (Operations);
 *   - in a Round, have the current actor take an item from another token or the ground: v2's
 *     Pick Up / Exchange (§6/7), the same code as the ring's Pick up verb, so it uses his turn.
 * What the hex holds and what is allowed come from AmbushMission.stack(hexId) (mission1.js); this
 * file only draws them. A lone counter's click is left to mission1.js as before.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var board = $('board'), world = $('world'), panel = $('stack-panel');
  if (!board || !panel || !window.AmbushMission) return;
  var M = window.AmbushMission;
  var openHex = null, anchorEl = null;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function counters() {
    return Array.prototype.filter.call(world.querySelectorAll('.counter'), function (c) {
      return c.dataset.soldierId && getComputedStyle(c).display !== 'none';
    });
  }
  // hexId -> counters there, in drawing order (the last one is on top)
  function groups() {
    var g = {};
    counters().forEach(function (c) {
      var h = M.hexOf(c.dataset.soldierId);
      if (h) (g[h] = g[h] || []).push(c);
    });
    return g;
  }

  // ---- the ×N badge, refreshed a few times a second (counters move, die, appear)
  function badges() {
    var g = groups();
    Array.prototype.forEach.call(world.querySelectorAll('.stack-badge'), function (b) {
      var c = b.parentNode, list = g[M.hexOf(c.dataset.soldierId)];
      if (!list || list.length < 2 || list[list.length - 1] !== c) b.remove();
    });
    Object.keys(g).forEach(function (h) {
      var list = g[h];
      if (list.length < 2) return;
      var top = list[list.length - 1], b = top.querySelector('.stack-badge');
      if (!b) { b = document.createElement('span'); b.className = 'stack-badge'; top.appendChild(b); }
      if (b.textContent !== '×' + list.length) b.textContent = '×' + list.length;
    });
    if (openHex) place();
  }
  setInterval(badges, 300);

  // ---- open on a click on a stacked counter (capture on the board: before mission1.js's own
  // counter and pick handlers, which then never see this click)
  board.addEventListener('click', function (e) {
    var c = e.target.closest && e.target.closest('#world .counter');
    if (!c || !c.dataset.soldierId) return;
    var h = M.hexOf(c.dataset.soldierId), list = groups()[h];
    if (!list || list.length < 2) return;
    e.stopPropagation(); e.preventDefault();
    open(h, list[list.length - 1]);
  }, true);

  function open(hexId, el) {
    openHex = hexId; anchorEl = el;
    render();
    panel.classList.add('show');
    place();
    if (window.AmbushAudio) AmbushAudio.play('open');
  }
  function close() {
    if (!openHex) return;
    openHex = null; anchorEl = null;
    panel.classList.remove('show');
  }

  function render() {
    var st = M.stack(openHex);
    if (st.tokens.length < 2) { close(); return; }
    var html = '<header><b>Hex ' + esc(st.hexId) + '</b><span>' + st.tokens.length + ' tokens</span>' +
      '<button class="btn close" data-close aria-label="Close">×</button></header>';
    if (st.actor && st.actor.here) {
      html += '<p class="who">' + esc(st.actor.name) + ' is acting. ' +
        (st.offers.length ? 'He can take an item below; it uses his turn (§6/7).' : esc(st.takeWhy)) + '</p>';
    }
    html += st.tokens.map(function (t) {
      var takes = st.offers.filter(function (o) { return o.from === t.id; });
      var gear = t.gear.length ? t.gear.map(function (g) {
        var o = takes.filter(function (x) { return x.item === g && !x.used; })[0];
        if (o) { o.used = true; return '<button class="btn take" data-take="' + o.idx + '">Take ' + esc(g) + '</button>'; }
        return '<span class="item">' + esc(g) + '</span>';
      }).join('') : '<span class="item none">nothing</span>';
      var act = t.act === 'pick' ? '<button class="btn primary act" data-act="' + t.id + '">Goes next</button>' :
        t.act === 'select' ? '<button class="btn act' + (t.selected ? ' on' : '') + '" data-act="' + t.id + '">' + (t.selected ? 'Selected' : 'Select') + '</button>' : '';
      return '<div class="tok' + (t.side === 'german' ? ' de' : '') + (t.isActive ? '' : ' down') + (t.current ? ' current' : '') + '">' +
        '<img src="' + esc(t.img) + '" alt="">' +
        '<div class="id"><b>' + esc(t.name) + '</b><small>' + esc(t.stance || '') + (t.status && t.status !== 'unharmed' ? ' · ' + esc(t.status) : '') +
        (t.current ? ' · acting' : '') + '</small><div class="gear">' + gear + '</div></div>' + act + '</div>';
    }).join('');
    if (st.ground.length) {
      var takes = st.offers.filter(function (o) { return o.from === 'ground'; });
      html += '<div class="tok ground"><div class="id"><b>On the ground</b><div class="gear">' + st.ground.map(function (g, i) {
        var o = takes[i];
        return o ? '<button class="btn take" data-take="' + o.idx + '">Take ' + esc(g) + '</button>' : '<span class="item">' + esc(g) + '</span>';
      }).join('') + '</div></div></div>';
    }
    panel.innerHTML = html;
  }

  // beside the stack, on whichever side has room, kept on screen
  function place() {
    if (!anchorEl || !anchorEl.isConnected) return;
    var r = anchorEl.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    var pw = panel.offsetWidth, ph = panel.offsetHeight, gap = 16;
    var x = r.right + gap + pw <= W - 16 ? r.right + gap : Math.max(16, r.left - gap - pw);
    var y = Math.max(86, Math.min(H - ph - 16, r.top + r.height / 2 - ph / 2));
    panel.style.left = x + 'px'; panel.style.top = y + 'px';
  }

  panel.addEventListener('click', function (e) {
    var t = e.target.closest('button');
    if (!t) return;
    if (t.hasAttribute('data-close')) { close(); return; }
    if (t.dataset.act) { var id = t.dataset.act; close(); M.actOn(id); return; }
    if (t.dataset.take) { var i = +t.dataset.take; close(); M.take(i); return; }
  });
  // Esc, a click elsewhere, or the game moving on closes it
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && openHex) { e.stopImmediatePropagation(); close(); }
  }, true);
  document.addEventListener('pointerdown', function (e) {
    if (openHex && !panel.contains(e.target) && !(e.target.closest && e.target.closest('#world .counter'))) close();
  }, true);
  setInterval(function () {
    if (!openHex) return;
    if (document.body.classList.contains('resolving') || document.querySelector('#dialogs-root .backdrop.open')) close();
  }, 200);
  board.addEventListener('stagemove', function () { if (openHex) place(); });

  window.__v3stack = {
    open: function (hexId) { var l = groups()[hexId]; if (l && l.length > 1) open(hexId, l[l.length - 1]); return !!openHex; },
    isOpen: function () { return openHex; },
    badges: function () { var g = groups(), o = {}; Object.keys(g).forEach(function (h) { if (g[h].length > 1) o[h] = g[h].length; }); return o; },
  };
})();

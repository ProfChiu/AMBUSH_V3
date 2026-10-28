/*
 * Ambush! v3 — the ring menu (brief decision 12; v2 punch list item 4): the selected soldier's
 * verbs in a ring around his counter. Presentation only.
 *
 * The buttons are v2's own (same ids, same handlers, same disabled state, set by mission1.js);
 * this file only moves them out of the soldier panel into #ring and lays them out around the
 * counter they belong to, every frame, so the ring follows the counter through zoom, pan and
 * moves. A greyed verb stays in the ring and says why on hover (data-why, written by
 * mission1.js's explainVerbs, or the button's own title). The bot's seam (verbsOffered) reads
 * the sections' display and the buttons' disabled state, neither of which this file touches.
 *
 * Which ring: Operations (#movement-sec shown) rings the selected counter; an Action Round
 * (#action-sec shown) rings the current actor. While the game resolves, or a decision dialog is
 * up, the ring is hidden; while a destination is being picked only Cancel move stays, so the
 * ring never covers the hexes the player is choosing between. If his counter is panned out of
 * sight the ring hides; a click on the soldier card brings him back into view.
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var ring = $('ring');
  if (!ring) return;

  var GROUPS = [
    { name: 'movement', sec: 'movement-sec', anchor: '.counter.selected' },
    { name: 'action', sec: 'action-sec', anchor: '.counter.active-actor' },
  ];
  GROUPS.forEach(function (g) {
    var src = document.querySelector('[data-ring="' + g.name + '"]');
    g.el = document.createElement('div');
    g.el.className = 'ring-group';
    g.el.dataset.group = g.name;
    g.buttons = src ? Array.prototype.slice.call(src.children) : [];
    g.buttons.forEach(function (b) { g.el.appendChild(b); });
    if (src) src.remove();
    ring.appendChild(g.el);
  });
  // Cancel move joins the action ring; while it shows, it is the ring's only verb.
  var cancel = $('cancelMoveBtn');
  GROUPS[1].el.appendChild(cancel);
  GROUPS[1].buttons.push(cancel);

  function shown(el) { return el && el.style.display !== 'none' && !el.hidden; }
  function busy() {
    return document.body.classList.contains('resolving') || document.body.classList.contains('stance-beat') ||
      !!document.querySelector('#dialogs-root .backdrop.open') ||
      !!document.querySelector('.scrim.show') ||
      !!document.querySelector('#stack-panel.show') ||
      !(document.getElementById('game') || {}).classList.contains('show');
  }

  var lastKey = '';
  function frame() {
    requestAnimationFrame(frame);
    var g = null, anchor = null;
    if (!busy()) {
      for (var i = 0; i < GROUPS.length; i++) {
        if (shown($(GROUPS[i].sec))) {
          var a = document.querySelector(GROUPS[i].anchor);
          if (a) { g = GROUPS[i]; anchor = a; break; }
        }
      }
    }
    var panel = $('hud-soldier');
    if (panel) panel.hidden = !shown($('pick-sec')) && !GROUPS.some(function (x) { return shown($(x.sec)); });
    GROUPS.forEach(function (x) { x.el.classList.toggle('on', x === g); });
    ring.classList.toggle('on', !!g);
    if (!g) { lastKey = ''; return; }

    var picking = g.name === 'action' && shown(cancel);
    var live = g.buttons.filter(function (b) {
      if (b === cancel) return picking;
      return !picking && b.style.display !== 'none';
    });
    g.buttons.forEach(function (b) {
      var on = live.indexOf(b) !== -1;
      b.classList.toggle('ring-off', !on);
      // the reason a verb is greyed: mission1.js's data-why, else v2's own title
      if (on && b.disabled && !b.dataset.why && b.title) b.dataset.why = b.title;
      if (on && !b.disabled && b.dataset.why && b.dataset.why === b.title) delete b.dataset.why;
    });

    var r = anchor.getBoundingClientRect();
    var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    var n = live.length;
    // an ellipse a little wider than tall; it grows with the number of verbs and clears the counter
    var rx = Math.max(r.width / 2 + 70, n * 19 + 40), ry = Math.max(r.height / 2 + 34, rx * 0.6);
    if (n === 1) { rx = 0; ry = r.height / 2 + 30; }
    var W = window.innerWidth, H = window.innerHeight;
    var strip = document.querySelector('#game .strip'), sb = strip ? strip.getBoundingClientRect().bottom + 6 : 0;
    var away = cx < 0 || cx > W || cy < sb || cy > H;
    ring.classList.toggle('away', away);
    if (away) { lastKey = ''; return; }
    var key = [Math.round(cx), Math.round(cy), Math.round(r.width), n, W, H].join(',');
    if (key === lastKey) return;
    lastKey = key;

    var pos = live.map(function (b, k) {
      var t = n === 1 ? Math.PI / 2 : -Math.PI / 2 + k * 2 * Math.PI / n;
      return { b: b, x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t), hw: b.offsetWidth / 2 + 8, hh: b.offsetHeight / 2 + 8 };
    });
    // near an edge (or under the strip) the whole ring slides inward, keeping its shape, rather
    // than squashing its verbs together against the edge
    var lo = { x: Infinity, y: Infinity }, hi = { x: -Infinity, y: -Infinity };
    pos.forEach(function (p) {
      lo.x = Math.min(lo.x, p.x - p.hw); hi.x = Math.max(hi.x, p.x + p.hw);
      lo.y = Math.min(lo.y, p.y - p.hh); hi.y = Math.max(hi.y, p.y + p.hh);
    });
    var dx = lo.x < 0 ? -lo.x : hi.x > W ? W - hi.x : 0, dy = lo.y < sb ? sb - lo.y : hi.y > H ? H - hi.y : 0;
    pos.forEach(function (p) {
      var x = Math.max(p.hw, Math.min(W - p.hw, p.x + dx)), y = Math.max(p.hh + sb, Math.min(H - p.hh, p.y + dy));
      p.b.style.left = x + 'px'; p.b.style.top = y + 'px';
      p.b.classList.toggle('why-up', y > H - 140);
    });
  }
  requestAnimationFrame(frame);

  // a click on the soldier card brings his counter into view (the ring comes with it)
  Array.prototype.forEach.call(document.querySelectorAll('#hud-soldier .mini-card'), function (card) {
    card.title = 'Show him on the map';
    card.addEventListener('click', function () {
      var g = GROUPS.filter(function (x) { return shown($(x.sec)); })[0];
      var a = g && document.querySelector(g.anchor);
      if (!a || !window.AmbushStage) return;
      var W = AmbushHexGrid.MAP_WIDTH, H = AmbushHexGrid.MAP_HEIGHT;
      AmbushStage.view.reveal([{ x: parseFloat(a.style.left) / 100 * W, y: parseFloat(a.style.top) / 100 * H }], 260, false);
    });
  });

  window.__v3ring = {
    // what the ring shows now: [{ id, label, enabled, why }] (live drives)
    verbs: function () {
      var g = GROUPS.filter(function (x) { return x.el.classList.contains('on'); })[0];
      if (!g || ring.classList.contains('away')) return [];
      return g.buttons.filter(function (b) { return !b.classList.contains('ring-off'); }).map(function (b) {
        return { id: b.id, label: b.textContent.trim(), enabled: !b.disabled, why: b.dataset.why || '' };
      });
    },
  };
})();

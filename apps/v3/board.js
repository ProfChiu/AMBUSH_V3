/*
 * Ambush! v3 — the map view: four fixed zoom levels and pan. Presentation only.
 *
 * Lifted from PhantomFury's boardView (phantomfury_app.js): the world is the map scan at its own
 * pixel size, and zoom + pan are one transform on it. Map fits the whole map in the window;
 * Close is the scan at 1:1 on the display (device pixels); Sector and Squad sit between, each at
 * least 1.25x the level before. A wheel notch is one level toward the cursor.
 *
 *   var view = AmbushBoard.create({ board: el, world: el, width: W, height: H, onChange: fn });
 *   view.zoomTo(level, clientX?, clientY?); view.step(+1|-1); view.level(); view.scales();
 *   view.toWorld(clientX, clientY) -> {x, y}; view.setReducedMotion(bool); view.home()
 *   view.reveal([{x, y}...], pad, instant): pan, at the current level, just far enough to show
 *   these world points (Phase 3: v2's ensureVisible, the camera that follows the action)
 * Every change of view fires a 'stagemove' event on the board (v2 listened for the scroll).
 *
 * o.insetTop (px, or a function returning px) keeps that band at the top for a floating HUD: Map
 * fits the map below it, and at any level the map's top edge can be panned clear of it.
 * o.fitWidth (a fraction) makes Map the map at that share of the window's width instead of the
 * whole map, so the player cannot zoom out past it; the rest of the map is a pan away.
 */
(function () {
  'use strict';

  var NAMES = ['Map', 'Sector', 'Squad', 'Close'];

  function create(o) {
    var board = o.board, world = o.world, W = o.width, H = o.height;
    var v = { level: 0, x: 0, y: 0 }, still = false, settle = null;
    function top() { return typeof o.insetTop === 'function' ? o.insetTop() : (o.insetTop || 0); }
    world.style.width = W + 'px'; world.style.height = H + 'px';
    world.style.transformOrigin = '0 0';

    function scales() {
      var dpr = window.devicePixelRatio || 1, bw = board.clientWidth, bh = board.clientHeight;
      var fw = typeof o.fitWidth === 'function' ? o.fitWidth() : o.fitWidth;
      var fit = fw ? bw * fw / W : Math.min(bw / W, (bh - top()) / H);
      var native = 1 / dpr, lv = [fit, native * 0.5, native * 0.75, native];
      for (var i = 1; i < lv.length; i++) lv[i] = Math.max(lv[i], lv[i - 1] * 1.25);
      return lv;
    }
    function scale() { return scales()[v.level]; }
    function clamp() {
      var s = scale(), bw = board.clientWidth, bh = board.clientHeight, t = top();
      var xLo = Math.min(0, bw - W * s), xHi = 0, yLo = Math.min(t, bh - H * s), yHi = t;
      if (W * s < bw) xLo = xHi = (bw - W * s) / 2;   // centre the map when it is smaller than the window
      if (H * s < bh - t) yLo = yHi = t + (bh - t - H * s) / 2;
      v.x = Math.max(xLo, Math.min(xHi, v.x)); v.y = Math.max(yLo, Math.min(yHi, v.y));
    }
    function apply(animate, ms) {
      clamp();
      var ease = animate && !still;
      world.style.transition = ease ? 'transform ' + (ms || 220) / 1000 + 's ' + (ms ? 'cubic-bezier(.45,0,.2,1)' : 'ease-out') : '';
      world.style.willChange = ease ? 'transform' : '';
      // once a level lands, drop the promoted layer so the browser re-rasters the scan sharp (PF's fix)
      clearTimeout(settle);
      settle = setTimeout(function () { world.style.transition = ''; world.style.willChange = ''; }, (ms || 220) + 80);
      world.style.transform = 'translate(' + v.x + 'px,' + v.y + 'px) scale(' + scale() + ')';
      // labels drawn in world space (destination costs, dice, badges, result cards) stay one size
      world.style.setProperty('--inv', (1 / scale()).toFixed(4));
      if (o.onChange) o.onChange(v.level, NAMES[v.level]);
      board.dispatchEvent(new Event('stagemove'));
    }
    function zoomTo(level, cx, cy) {
      level = Math.max(0, Math.min(NAMES.length - 1, level));
      if (level === v.level) return;
      var r = board.getBoundingClientRect();
      cx = cx == null ? r.width / 2 : cx - r.left;
      cy = cy == null ? r.height / 2 : cy - r.top;
      var old = scale(), wx = (cx - v.x) / old, wy = (cy - v.y) / old;
      v.level = level;
      var ns = scale(); v.x = cx - wx * ns; v.y = cy - wy * ns;
      apply(true);
    }
    function toWorld(cx, cy) {
      var r = board.getBoundingClientRect(), s = scale();
      return { x: (cx - r.left - v.x) / s, y: (cy - r.top - v.y) / s };
    }

    var wheelAt = 0;
    board.addEventListener('wheel', function (e) {
      e.preventDefault();
      var now = Date.now(); if (now - wheelAt < 180) return; wheelAt = now;   // one notch = one level
      zoomTo(v.level + (e.deltaY < 0 ? 1 : -1), e.clientX, e.clientY);
    }, { passive: false });

    // pan: right-drag, as in v2; left-drag on empty map too (o.leftPan, default on). A drag starts
    // only once the pointer has moved a few pixels, so a plain click still lands on the map (Phase
    // 3: a click on open ground is a walk order); the click that ends a real drag is swallowed.
    var drag = null, dragged = false, leftPan = o.leftPan !== false;
    board.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    board.addEventListener('pointerdown', function (e) {
      if (e.button === 0 && (!leftPan || (o.isPiece && o.isPiece(e.target)))) return;
      if (e.button !== 0 && e.button !== 2) return;
      drag = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y, id: e.pointerId, live: false };
    });
    board.addEventListener('pointermove', function (e) {
      if (!drag) return;
      if (!drag.live) {
        if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) < 6) return;
        drag.live = true; board.classList.add('dragging');
        try { board.setPointerCapture(drag.id); } catch (err) { /* pointer already gone */ }
      }
      v.x = drag.vx + e.clientX - drag.x; v.y = drag.vy + e.clientY - drag.y; apply(false);
    });
    function endDrag() {
      if (drag && drag.live) { dragged = true; setTimeout(function () { dragged = false; }, 0); }
      drag = null; board.classList.remove('dragging');
    }
    board.addEventListener('pointerup', endDrag); board.addEventListener('pointercancel', endDrag);
    board.addEventListener('click', function (e) { if (dragged) { e.stopPropagation(); e.preventDefault(); } }, true);

    function reveal(pts, pad, instant) {
      if (!pts || !pts.length) return;
      pad = pad == null ? 80 : pad;
      var s = scale(), bw = board.clientWidth, bh = board.clientHeight, t = top();
      var xs = pts.map(function (p) { return p.x * s + v.x; }), ys = pts.map(function (p) { return p.y * s + v.y; });
      var lo = { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys) };
      var hi = { x: Math.max.apply(null, xs), y: Math.max.apply(null, ys) };
      var dx = 0, dy = 0, L = pad, R = bw - pad, T = t + pad, B = bh - pad;
      if (hi.x - lo.x > R - L) dx = L - lo.x; else if (lo.x < L) dx = L - lo.x; else if (hi.x > R) dx = R - hi.x;
      if (hi.y - lo.y > B - T) dy = T - lo.y; else if (lo.y < T) dy = T - lo.y; else if (hi.y > B) dy = B - hi.y;
      if (!dx && !dy) return;
      v.x += dx; v.y += dy; apply(!instant);
    }
    // Phase 6, the lesson's camera (PF's cameraTo, on fixed levels): the closest level, at most
    // o.maxLevel, at which the world box fits the open part of the window (o.bottom px kept clear
    // for the guide's bubble), then the box centred in it, gliding over o.ms.
    function frame(box, fo) {
      fo = fo || {};
      var bw = board.clientWidth, bh = board.clientHeight, t = top(), bottom = fo.bottom || 0;
      var freeH = Math.max(bh * 0.3, bh - t - bottom), lv = scales(), fill = fo.fill || 0.6;
      var level = 0;
      for (var i = Math.min(lv.length - 1, fo.maxLevel == null ? 2 : fo.maxLevel); i >= 0; i--) {
        if (box.w * lv[i] <= bw * fill && box.h * lv[i] <= freeH * fill) { level = i; break; }
      }
      v.level = level;
      var s = lv[level];
      v.x = bw / 2 - (box.x + box.w / 2) * s;
      v.y = t + freeH / 2 - (box.y + box.h / 2) * s;
      apply(true, fo.ms);
    }
    window.addEventListener('resize', function () { apply(false); });

    apply(false);
    return {
      zoomTo: zoomTo, step: function (d, cx, cy) { zoomTo(v.level + d, cx, cy); },
      level: function () { return v.level; }, scales: scales, names: NAMES, toWorld: toWorld,
      state: v, refresh: function () { apply(false); },
      // furthest out, the map's top edge just below the HUD band
      home: function () { v.level = 0; v.x = 0; v.y = top(); apply(false); },
      setReducedMotion: function (on) { still = !!on; }, reveal: reveal, frame: frame,
      // world point -> page (client) point, at the view's resting transform
      toScreen: function (x, y) {
        var r = board.getBoundingClientRect(), s = scale();
        return { x: r.left + v.x + x * s, y: r.top + v.y + y * s };
      },
    };
  }

  window.AmbushBoard = { create: create, NAMES: NAMES };
})();

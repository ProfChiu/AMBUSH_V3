// mission1/info.js (3 of 13) — Info (the map as information surface), Sight. Stage A cut of mission1.js lines 980-1305 (docs/REFACTOR_MAP.md 5.4).
// Exports to M1 (2): Info, Sight
// Uses from M1:
//   core: state
//   present: FX, fmtSigned
//   roster: activeGermans, canvas, findSoldier
//   contact: estimateHitChanceBreakdown
// Still global (their files are not wrapped yet):
//   core: CHART, Dialogs, FC, G, LOS, LOS_ELEV, LOS_TERRAIN, REAL_TERRAIN, TERRAIN_LABELS, edgeFeatureBetween,
//   edgeFeatures, losClear, terrainRowFor, weaponById, weaponUsable
//   operations: destPicks, legalAdjacentHexIds, operationsRoute, roundLegalDestinations, selectedSoldier, walkRoute
//   rounds: canFireAt
(function () {
  'use strict';
  var M1 = window.AmbushM1;
  // ---------------------------------------------------------------------
  // The map as an information surface (v2 task 5; docs/01_PRESENTATION_SPEC.md §4). Cards mode
  // only, like task 4 (Classic stays v1). Read-only by construction: every number here comes from
  // the same pure functions the rules use (legalAdjacentHexIds, roundLegalDestinations, losClear,
  // estimateHitChanceBreakdown, the fire chart's terrain row), and nothing here rolls, mutates game
  // state, or can be clicked — it only answers "what would happen if".
  //
  //   Right-click a hex (a pinned card since 2026-09-25; it was a hover card):
  //                   terrain and cover (what it does to a shot at you there), the move cost from
  //                   the soldier you are acting for, whether entering makes a Paragraph Check,
  //                   and which Germans on the map can see it.
  //   ... a German's hex adds your hit chance on him (aimed / snap), his on you, his stance and weapon,
  //                   and his last stated reason.
  //   Your decision   reachable hexes shaded by cover quality; walls, windows and doors drawn.
  //
  // What it does NOT reveal: what a hex's Paragraph Check would find. The paper player cannot
  // know which hexes hide Germans until he walks in; showing it would change the game.
  // ---------------------------------------------------------------------
  var Info = M1.Info = (function () {
    var NS = 'http://www.w3.org/2000/svg';
    var MW = G.MAP_WIDTH, MH = G.MAP_HEIGHT, R = G.GRID.col_pitch / 1.5; // flat-top: pitch = 1.5 R
    var svg = null, tip = null, lastHex = null, lastReason = {}, hoverRoute = null, lastEnsured = null;
    function layer() {
      if (svg && svg.parentNode) return svg;
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'info-layer');
      svg.setAttribute('viewBox', '0 0 ' + MW + ' ' + MH);
      svg.setAttribute('preserveAspectRatio', 'none');
      M1.canvas.insertBefore(svg, M1.canvas.children[1] || null); // above the map scan, below counters
      return svg;
    }
    function center(hexId) { var p = G.parseId(hexId); return G.hexToPixel(p.colIdx, p.rowIdx); }
    function hexPoints(hexId, shrink) {
      var c = center(hexId), r = R * (shrink || 0.94), pts = [];
      for (var k = 0; k < 6; k++) { var a = Math.PI / 3 * k; pts.push((c.x + r * Math.cos(a)).toFixed(1) + ',' + (c.y + r * Math.sin(a)).toFixed(1)); }
      return pts.join(' ');
    }
    // The shared hexside between two neighbours: perpendicular to the centre line, at its midpoint.
    function sideSegment(a, b) {
      var p = center(a), q = center(b), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      var dx = q.x - p.x, dy = q.y - p.y, len = Math.sqrt(dx * dx + dy * dy), h = R / 2;
      return { x1: mx - dy / len * h, y1: my + dx / len * h, x2: mx + dy / len * h, y2: my - dx / len * h };
    }
    function coverClass(hexId) {
      var row = terrainRowFor(hexId);
      return row === 0 ? 'cov-open' : row <= 3 ? 'cov-light' : 'cov-good';
    }
    function coverLabel(hexId) {
      var row = terrainRowFor(hexId);
      return row === 0 ? 'no cover' : row <= 3 ? 'light cover' : 'good cover';
    }

    // Who the player is acting for right now, if anyone.
    function viewer() {
      if (M1.state.phase === 'movement') return selectedSoldier() || null;
      if (M1.state.phase === 'round') { var a = M1.findSoldier(M1.state.currentActorId); return a && a.side !== 'german' ? a : null; }
      return null;
    }
    function decisionPending() { return !Dialogs.current; }

    // ---- shading -----------------------------------------------------------------------------
    function clear() { if (svg) svg.innerHTML = ''; }
    function refresh() {
      clear();
      if (!decisionPending()) return;
      var v = viewer();
      if (!v || !v.hexId || v.exited) return;
      // The map is taller than the window: a soldier whose turn it is must be where the player can
      // see and click. Only when he (or his hex) changes — re-scrolling under a poised cursor is
      // how a click ends up on the wrong hex — and instantly, for the same reason.
      var key = v.id + '@' + v.hexId;
      if (key !== lastEnsured) { lastEnsured = key; M1.FX.ensureVisible([v.hexId], true); }
      var reach = [];
      if (M1.state.phase === 'movement') reach = legalAdjacentHexIds(v);
      else if (document.getElementById('action-sec').style.display !== 'none') {
        reach = Object.keys(roundLegalDestinations(v)).filter(function (h) { return h !== v.hexId; });
      }
      var g = document.createElementNS(NS, 'g');
      reach.forEach(function (h) {
        var poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points', hexPoints(h));
        poly.setAttribute('class', 'reach ' + coverClass(h));
        g.appendChild(poly);
      });
      // Walls, windows and doors on every hexside touching the area in play.
      var area = {}; reach.concat([v.hexId]).forEach(function (h) { area[h] = true; });
      var seen = {};
      Object.keys(area).forEach(function (h) {
        var p = G.parseId(h);
        G.neighbors(p.colIdx, p.rowIdx).forEach(function (n) {
          var key = h < n.id ? h + '|' + n.id : n.id + '|' + h;
          if (seen[key]) return; seen[key] = true;
          var f = edgeFeatureBetween(h, n.id);
          if (!f) return;
          var s = sideSegment(h, n.id), l = document.createElementNS(NS, 'line');
          l.setAttribute('x1', s.x1); l.setAttribute('y1', s.y1); l.setAttribute('x2', s.x2); l.setAttribute('y2', s.y2);
          l.setAttribute('class', 'edge edge-' + f);
          g.appendChild(l);
        });
      });
      layer().appendChild(g);
    }

    // ---- hover -------------------------------------------------------------------------------
    // Hit Chance c hits on a roll of 0..c (0 always hits, 9 always misses): (c + 1) in 10.
    function pct(c) { return '<b>' + c + '</b> <span class="ih-dim">(' + (c + 1) * 10 + '%)</span>'; }
    function hexHtml(hexId, v) {
      var enemyHere = M1.activeGermans().some(function (g) { return g.hexId === hexId; });
      var terrain = LOS_TERRAIN[hexId] || REAL_TERRAIN[hexId];
      var label = TERRAIN_LABELS[terrain] || TERRAIN_LABELS[REAL_TERRAIN[hexId]] || terrain || 'unknown';
      var html = '<div class="ih-head"><b>' + hexId + '</b> &middot; ' + label + ' <span class="ih-cov ' + coverClass(hexId) + '">' + coverLabel(hexId) + '</span></div>';
      // What the terrain does to a shot at someone standing here, in the viewer's stance.
      var stance = v ? v.stance : 'standing', row = terrainRowFor(hexId);
      if (FC.canBeFiredAt(CHART.FIRE_MODS_TERRAIN, row, stance)) {
        var mod = FC.resolveTerrainMod(CHART.FIRE_MODS_TERRAIN, row, stance);
        html += '<div>Shots at a ' + stance + ' soldier here: <b>' + M1.fmtSigned(mod) + '</b> to hit (terrain row ' + row + ').</div>';
      } else {
        html += '<div>A ' + stance + ' soldier here cannot be fired at except through his aperture.</div>';
      }
      if (enemyHere) return html; // occupied by the enemy: nobody walks in, nothing more to say
      if (v && hexId !== v.hexId) {
        if (M1.state.phase === 'movement') {
          var route = hoverRoute;
          html += legalAdjacentHexIds(v).indexOf(hexId) !== -1
            ? '<div>' + v.name + ' can step here.</div>'
            : route ? '<div>Click to walk here: <b>' + route.length + ' hexes</b> <span class="ih-dim">(stops if anything happens)</span></div>'
              : '<div class="ih-dim">No route from ' + v.name + ' &mdash; walls or prohibited ground.</div>';
        } else {
          var d = roundLegalDestinations(v)[hexId];
          html += d ? '<div>Move: <b>' + d.cost + ' MP</b> of ' + v.mpa + (d.standUp ? ' (stands up first)' : '') + '.</div>'
            : '<div class="ih-dim">Beyond ' + v.name + '&rsquo;s ' + v.mpa + ' MP this turn.</div>';
        }
      }
      if (v && hexId === v.hexId) return html + watchersHtml(hexId, stance);
      html += (M1.state.opsState && M1.state.opsState.eventMarkers && M1.state.opsState.eventMarkers[hexId])
        ? '<div class="ih-dim">Event marker: no Paragraph Check here until the Condition changes.</div>'
        : '<div>Entering makes a Paragraph Check.</div>';
      return html + watchersHtml(hexId, stance);
    }
    function watchersHtml(hexId, stance) {
      var watchers = M1.activeGermans().filter(function (g) { return g.hexId && g.hexId !== hexId && losClear(g.hexId, hexId, g.stance, stance); });
      return watchers.length
        ? '<div class="ih-warn">Seen by ' + watchers.map(function (g) { return g.name; }).join(', ') + '.</div>'
        : (M1.activeGermans().length ? '<div class="ih-dim">No German on the map can see it.</div>' : '');
    }
    function germanHtml(g, v) {
      var w = weaponById(g.weaponId);
      var html = '<div class="ih-head"><b>' + g.name + '</b> &middot; ' + g.stance + (w ? ' &middot; ' + w.name : '') + '</div>';
      if (v) {
        if (!weaponUsable(v)) html += '<div class="ih-dim">' + v.name + '&rsquo;s weapon cannot fire now.</div>';
        else if (!canFireAt(v, g)) html += '<div class="ih-dim">' + v.name + ' has no shot at him (sight, range or cover).</div>';
        else {
          var aim = M1.estimateHitChanceBreakdown(v, g, 'aimed'), snap = M1.estimateHitChanceBreakdown(v, g, 'snap');
          html += '<div>' + v.name + ' &rarr; him: aimed ' + pct(aim.clamped) + ', snap ' + pct(snap.clamped) + '</div>';
        }
        if (g.weaponId && weaponUsable(g) && canFireAt(g, v)) {
          html += '<div class="ih-warn">He &rarr; ' + v.name + ': aimed ' + pct(M1.estimateHitChanceBreakdown(g, v, 'aimed').clamped) + '</div>';
        } else html += '<div class="ih-dim">He has no shot at ' + v.name + '.</div>';
      }
      if (lastReason[g.id]) html += '<div class="ih-reason">Last: ' + lastReason[g.id] + '</div>';
      return html;
    }
    function tipEl() {
      if (tip) return tip;
      tip = document.createElement('div');
      tip.id = 'info-tip';
      document.body.appendChild(tip);
      return tip;
    }
    // Hover draws only the walk route; the hex card is pinned on demand (2026-09-25, Wan: "I want
    // to control when it comes up"). A hover card also stayed up whenever the game moved on under a
    // still mouse (the start of the mission, a phase change), because only mouse movement hid it.
    function hide() { lastHex = null; hoverRoute = null; drawRoute(null, null); }
    var pinned = null; // { hex, x, y }: the right-clicked hex and where the card was opened
    function closePin() { pinned = null; if (tip) tip.style.display = 'none'; }
    function renderPin() {
      if (!pinned) return;
      var v = viewer(), hx = pinned.hex, el = tipEl();
      var html = M1.activeGermans().filter(function (g) { return g.hexId === hx; }).map(function (g) { return germanHtml(g, v); }).join('<hr>');
      el.innerHTML = (html ? html + '<hr>' : '') + hexHtml(hx, v) +
        '<div class="ih-dim ih-close">Right-click again or Esc to close.</div>';
      el.style.display = 'block';
      var x = pinned.x + 14, y = pinned.y + 10, w = el.offsetWidth, hgt = el.offsetHeight;
      if (x + w > window.innerWidth - 8) x = pinned.x - w - 14;
      if (y + hgt > window.innerHeight - 8) y = window.innerHeight - hgt - 8;
      el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, y) + 'px';
    }
    function hexAt(e) {
      var r = M1.canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
      return G.pixelToHex((e.clientX - r.left) / r.width * MW, (e.clientY - r.top) / r.height * MH).id || null;
    }
    // The walk the player would get by clicking, drawn hex to hex (task 6).
    function drawRoute(v, route) {
      var old = svg && svg.querySelector('#route-preview');
      if (old) old.remove();
      if (!v || !route || route.length < 2) return;
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('id', 'route-preview');
      var pts = [v.hexId].concat(route).map(function (h) { var c = center(h); return c.x + ',' + c.y; }).join(' ');
      var line = document.createElementNS(NS, 'polyline');
      line.setAttribute('points', pts);
      line.setAttribute('class', 'route');
      g.appendChild(line);
      var end = center(route[route.length - 1]);
      var dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', end.x); dot.setAttribute('cy', end.y); dot.setAttribute('r', R * 0.3);
      dot.setAttribute('class', 'route-end');
      g.appendChild(dot);
      layer().appendChild(g);
    }
    function onMove(e) {
      if (document.body.classList.contains('resolving') || Dialogs.current) { hide(); return; }
      var hx = hexAt(e);
      if (!hx) { hide(); return; }
      if (hx !== lastHex) {
        lastHex = hx;
        var v = viewer();
        hoverRoute = v && M1.state.phase === 'movement' && hx !== v.hexId ? operationsRoute(v.hexId, hx) : null;
        drawRoute(v, hoverRoute);
      }
    }
    var vp = document.getElementById('board');
    // Clicking open map in Operations walks there (task 6). Counters and destination markers stop
    // their own clicks, so this only ever sees a click on bare ground.
    // On the viewport, not the canvas: this module is built before `canvas` exists.
    vp.addEventListener('click', function (e) {
      // Only a click on bare map is a walk order. Markers, counters and entry hexes carry their
      // own meaning, and the last entry placement switches the phase inside its own click — that
      // click then bubbled here and marched the soldier off across the map.
      if (e.target !== M1.canvas && !e.target.classList.contains('map-image')) return;
      if (M1.state.phase !== 'movement' || Dialogs.current || !viewer()) return;
      var r = M1.canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      var hx = G.pixelToHex((e.clientX - r.left) / r.width * MW, (e.clientY - r.top) / r.height * MH).id;
      if (!hx) return;
      hide(); closePin();
      // A click just outside a destination marker still means that hex: do the ordinary one-hex
      // move rather than nothing (or, worse, a walk starting with the same step).
      if (destPicks[hx]) { destPicks[hx](); return; }
      walkRoute(hx);
    });
    vp.addEventListener('mousemove', function (e) { try { onMove(e); } catch (err) { hide(); console.error('[Ambush info]', err); } });
    vp.addEventListener('mouseleave', hide);
    vp.addEventListener('stagemove', function () { hide(); closePin(); });   // v3: the view panned or zoomed
    // Right-click pins a hex's card; right-click the same hex (or Esc) closes it, another hex moves
    // it. A right-DRAG is not a click: it is reserved for panning the map (Wan, 2026-09-25), so
    // anything past a few pixels of movement between press and release inspects nothing. Decided
    // on the button's release: macOS fires contextmenu on the press, before any drag exists, so
    // contextmenu only suppresses the browser's menu.
    var rDown = null;
    // v3: the ring of verbs floats over the selected soldier's hex, outside the map; a right-click
    // on it inspects the hex underneath, as anywhere else on the map. Pointer events, not mouse
    // events: a greyed (disabled) verb gets no mouse events in Chromium.
    var ringEl = document.getElementById('ring');
    document.addEventListener('pointerdown', function (e) {
      if (e.button === 2 && (vp.contains(e.target) || ringEl.contains(e.target))) rDown = { x: e.clientX, y: e.clientY };
    });
    vp.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    ringEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('pointerup', function (e) {
      if (e.button !== 2 || !rDown) return;
      var moved = Math.abs(e.clientX - rDown.x) + Math.abs(e.clientY - rDown.y) > 6;
      rDown = null;
      if (moved || (Dialogs.current && !Dialogs.current.modeless)) return;
      var hx = hexAt(e);
      if (!hx || (pinned && pinned.hex === hx)) { closePin(); return; }
      pinned = { hex: hx, x: e.clientX, y: e.clientY };
      try { renderPin(); } catch (err) { closePin(); console.error('[Ambush info]', err); }
    });
    // v3: this Esc is spent on the card; shell.js (registered after) must not also open the pause menu
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pinned) { e.stopImmediatePropagation(); closePin(); } });
    // Any left click closes it: it is a look, not a mode, and a click usually changes what it says.
    document.addEventListener('mousedown', function (e) { if (e.button === 0 && pinned) closePin(); }, true);
    function safeRefresh() {
      try { refresh(); } catch (err) { console.error('[Ambush info]', err); }
      try { renderPin(); } catch (err) { closePin(); console.error('[Ambush info]', err); }
    }
    // A decision closes it (a modal would sit under it); resolution lines keep it, refreshed.
    Dialogs.onPresent(function (spec) { hide(); if (spec && !spec.modeless) closePin(); safeRefresh(); });
    return {
      refresh: safeRefresh,
      noteReason: function (g, html) { lastReason[g.id] = html; },
    };
  })();

  // v3 Phase 7b (chapter 3): a sight line drawn on the map, from the same traceLOS the game asks.
  // Clear runs green end to end; blocked runs red to the hex that stops it, which is ringed. Its
  // own layer, so the hover card's redraws never wipe it. Lessons only.
  var Sight = M1.Sight = (function () {
    var NS = 'http://www.w3.org/2000/svg', svg = null;
    function center(hexId) { var p = G.parseId(hexId); return G.hexToPixel(p.colIdx, p.rowIdx); }
    function layer() {
      if (svg && svg.parentNode) return svg;
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'sight-layer');
      svg.setAttribute('viewBox', '0 0 ' + G.MAP_WIDTH + ' ' + G.MAP_HEIGHT);
      svg.setAttribute('preserveAspectRatio', 'none');
      M1.canvas.insertBefore(svg, M1.canvas.children[2] || null); // over the hover layer, under the counters
      return svg;
    }
    function node(tag, attrs) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      return n;
    }
    function clear() { if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild); }
    function draw(fromHex, toHex, fromStance, toStance) {
      var r = LOS.traceLOS({ fromId: fromHex, toId: toHex, elevationByHexId: LOS_ELEV, terrainByHexId: LOS_TERRAIN,
        edgeFeatures: edgeFeatures, fromStance: fromStance, toStance: toStance });
      clear();
      var g = layer(), a = center(fromHex), b = center(r.blocked && r.hexId ? r.hexId : toHex);
      var cls = r.blocked ? 'sight blocked' : 'sight clear';
      g.appendChild(node('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': cls }));
      if (r.blocked && r.hexId) {
        var e = center(toHex);
        g.appendChild(node('line', { x1: b.x, y1: b.y, x2: e.x, y2: e.y, 'class': 'sight beyond' }));
        g.appendChild(node('circle', { cx: b.x, cy: b.y, r: G.GRID.col_pitch / 1.5 * 0.62, 'class': 'sight-block' }));
      }
      g.appendChild(node('circle', { cx: a.x, cy: a.y, r: 14, 'class': cls + ' end' }));
      return r;
    }
    return { draw: draw, clear: clear };
  })();
})();

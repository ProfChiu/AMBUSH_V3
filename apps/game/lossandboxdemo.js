/*
 * lossandboxdemo.js — Phase 5 LOS sandbox content (docs/17_LOS.md)
 *
 * Drives apps/game/lossandbox.html: real Map A, the real reviewed LOS dataset
 * (assets/data/los_map_a.js), and the real rules engine (losrules.js) — nothing here is
 * demo/placeholder data, unlike the earlier movement/dialogs sandboxes (no soldiers, no
 * paragraph triggers — this page is a pure rules-visualization tool, not a gameplay demo).
 *
 * Interaction: click any hex to place the sighter, which triggers a whole-map visibility
 * sweep (AmbushLOS.visibilityFrom) shading every other hex green/red. Click any shaded hex
 * to make it the target and see the traced line plus the exact blocking hex/hexside.
 */
(function () {
  'use strict';

  var G = window.AmbushHexGrid;
  var LOS = window.AmbushLOS;
  var LOS_DB = window.AMBUSH_LOS_A;

  var TERRAIN_LABELS = {
    clear1: 'Clear (L1)', clear2: 'Clear (L2)', clear3: 'Clear (L3)', cover: 'Cover',
    brush: 'Brush', rough: 'Rough', woods: 'Woods', water: 'River / Stream',
    road: 'Road', dirt_road: 'Dirt Road', bridge: 'Bridge', ford: 'Ford',
    building: 'Building', interior: 'Interior', second_story: 'Second Story',
    railroad: 'Railroad', crater: 'Crater', rubble: 'Rubble', river: 'River',
  };
  function terrainLabel(key) { return TERRAIN_LABELS[key] || key || 'Unknown'; }

  var REASON_TEXT = {
    'elevation': 'a hex on the line is higher than both the sighter and the target (§8/2 Elevations).',
    'terrain-same-elevation': 'the sighter and target share an elevation, and forest/brush/rubble/rough always blocks between hexes at the same elevation (§8/2).',
    'terrain-diff-elevation': 'forest/brush/rubble/rough sits adjacent to one of the sighting hexes at that hex’s own elevation (§8/2).',
    'building-no-aperture-model': 'the line passes through a building hex — aperture fields of view aren’t modeled yet, so building hexes conservatively always block (see docs/17_LOS.md).',
    'crest': 'a crest hexside always blocks, regardless of elevation or position (§8/2).',
    'embankment': 'an embankment hexside is higher than the lower sighting hex and doesn’t touch the higher one (§8/2).',
  };

  // ---------------------------------------------------------------------
  // Data prep
  // ---------------------------------------------------------------------
  var elevationByHexId = {}, terrainByHexId = {};
  Object.keys(LOS_DB.hexes).forEach(function (id) {
    var h = LOS_DB.hexes[id];
    elevationByHexId[id] = h.elevation != null ? h.elevation : 1;
    terrainByHexId[id] = h.terrain;
  });
  var edgeFeatures = LOS.buildEdgeFeatures(LOS_DB.hexes);
  var ALL_HEX_IDS = G.allHexIds();

  // ---------------------------------------------------------------------
  // Geometry helpers
  // ---------------------------------------------------------------------
  var canvas = document.getElementById('map-canvas');

  function pctPos(hexId) {
    var p = G.parseId(hexId);
    var px = G.hexToPixel(p.colIdx, p.rowIdx);
    return { left: px.pctX, top: px.pctY };
  }
  function place(el, hexId) {
    var pos = pctPos(hexId);
    el.style.left = pos.left + '%';
    el.style.top = pos.top + '%';
  }

  // ---------------------------------------------------------------------
  // Static overlays: hit targets, elevation numbers, crest/embankment hexsides
  // ---------------------------------------------------------------------
  var hoverEl = document.getElementById('tb-hover');
  var losMarkEls = {};   // hexId -> .los-mark (visibility sweep dot)
  var elevEls = {};      // hexId -> elevation label
  var edgeMarkEls = [];  // crest/embankment hexside markers

  ALL_HEX_IDS.forEach(function (hexId) {
    var hit = document.createElement('div');
    hit.className = 'hex-hit';
    place(hit, hexId);
    hit.addEventListener('mouseenter', function () { onHover(hexId); });
    hit.addEventListener('click', function (e) { e.stopPropagation(); onClickHex(hexId); });
    canvas.appendChild(hit);

    var dot = document.createElement('div');
    dot.className = 'los-mark';
    dot.style.display = 'none';
    place(dot, hexId);
    canvas.appendChild(dot);
    losMarkEls[hexId] = dot;

    var elevLabel = document.createElement('div');
    elevLabel.style.position = 'absolute';
    elevLabel.style.transform = 'translate(-50%,-50%)';
    elevLabel.style.zIndex = '2';
    elevLabel.style.pointerEvents = 'none';
    elevLabel.style.fontFamily = "'IBM Plex Mono',monospace";
    elevLabel.style.fontWeight = '700';
    elevLabel.style.fontSize = '11px';
    elevLabel.style.color = '#22221a';
    elevLabel.style.textShadow = '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff';
    elevLabel.textContent = elevationByHexId[hexId];
    place(elevLabel, hexId);
    canvas.appendChild(elevLabel);
    elevEls[hexId] = elevLabel;
  });

  Object.keys(edgeFeatures).forEach(function (key) {
    var ids = key.split('|');
    var a = pctPos(ids[0]), b = pctPos(ids[1]);
    var el = document.createElement('div');
    el.className = 'edge-mark ' + edgeFeatures[key];
    el.style.left = ((a.left + b.left) / 2) + '%';
    el.style.top = ((a.top + b.top) / 2) + '%';
    el.title = ids[0] + '/' + ids[1] + ' — ' + edgeFeatures[key];
    el.dataset.edgeKey = key;
    canvas.appendChild(el);
    edgeMarkEls.push(el);
  });

  document.getElementById('tog-elev').addEventListener('change', function (e) {
    Object.keys(elevEls).forEach(function (id) { elevEls[id].style.display = e.target.checked ? '' : 'none'; });
  });
  document.getElementById('tog-edges').addEventListener('change', function (e) {
    edgeMarkEls.forEach(function (el) { el.style.display = e.target.checked ? '' : 'none'; });
  });

  // ---------------------------------------------------------------------
  // Sighter / target selection
  // ---------------------------------------------------------------------
  var sighterId = null, targetId = null;
  var pathEls = [];
  var sighterMarkEl = null, targetMarkEl = null;
  var sightLine = document.getElementById('sightline');
  var sightLineHalo = document.getElementById('sightline-halo');

  function onHover(hexId) {
    hoverEl.textContent = hexId + ' — ' + terrainLabel(terrainByHexId[hexId]) + ', elev ' + elevationByHexId[hexId];
  }

  function onClickHex(hexId) {
    if (!sighterId || hexId === sighterId) {
      setSighter(hexId);
    } else {
      setTarget(hexId);
    }
  }

  function clearPathMarks() {
    pathEls.forEach(function (el) { el.remove(); });
    pathEls = [];
    edgeMarkEls.forEach(function (el) { el.classList.remove('on-path'); });
    sightLine.style.opacity = 0;
    sightLineHalo.style.opacity = 0;
  }

  function setSighter(hexId) {
    sighterId = hexId;
    targetId = null;
    clearPathMarks();

    if (!sighterMarkEl) {
      sighterMarkEl = document.createElement('div');
      sighterMarkEl.className = 'sighter-mark';
      canvas.appendChild(sighterMarkEl);
    }
    place(sighterMarkEl, hexId);
    if (targetMarkEl) { targetMarkEl.remove(); targetMarkEl = null; }

    var visibility = LOS.visibilityFrom(sighterId, elevationByHexId, terrainByHexId, edgeFeatures, ALL_HEX_IDS);
    var clearCount = 0, blockedCount = 0;
    ALL_HEX_IDS.forEach(function (hexId2) {
      var dot = losMarkEls[hexId2];
      if (hexId2 === sighterId) { dot.style.display = 'none'; return; }
      var r = visibility[hexId2];
      dot.style.display = '';
      dot.className = 'los-mark ' + (r.blocked ? 'blocked' : 'clear');
      if (r.blocked) blockedCount++; else clearCount++;
    });

    document.getElementById('sighter-card').className = 'mini-card';
    document.getElementById('sighter-card').innerHTML =
      '<div class="hexid">' + hexId + '</div>' +
      '<div>' + terrainLabel(terrainByHexId[hexId]) + ' · elevation ' + elevationByHexId[hexId] + '</div>';

    document.getElementById('target-card').className = 'mini-card empty';
    document.getElementById('target-card').innerHTML = 'none — click a shaded hex';

    document.getElementById('sweep-stats').className = 'mini-card';
    document.getElementById('sweep-stats').innerHTML =
      '<div class="stat-line"><span>Visible</span><b style="color:var(--clear)">' + clearCount + '</b></div>' +
      '<div class="stat-line"><span>Blocked</span><b style="color:var(--alert)">' + blockedCount + '</b></div>';
  }

  function setTarget(hexId) {
    targetId = hexId;
    clearPathMarks();

    if (!targetMarkEl) {
      targetMarkEl = document.createElement('div');
      targetMarkEl.className = 'target-mark';
      canvas.appendChild(targetMarkEl);
    }
    place(targetMarkEl, hexId);

    var result = LOS.traceLOS({
      fromId: sighterId, toId: hexId, elevationByHexId: elevationByHexId,
      terrainByHexId: terrainByHexId, edgeFeatures: edgeFeatures,
    });
    targetMarkEl.classList.toggle('blocked', result.blocked);

    // Path dots for every intervening hex; the blocking hex (if any) gets a distinct mark.
    result.path.slice(1, -1).forEach(function (midHexId) {
      var el = document.createElement('div');
      el.className = 'path-mark' + (result.hexId === midHexId ? ' blocking' : '');
      place(el, midHexId);
      canvas.appendChild(el);
      pathEls.push(el);
    });

    // Highlight the blocking hexside, if the block reason is an edge feature.
    if (result.edge) {
      var key = result.edge[0] < result.edge[1] ? result.edge[0] + '|' + result.edge[1] : result.edge[1] + '|' + result.edge[0];
      edgeMarkEls.forEach(function (el) { if (el.dataset.edgeKey === key) el.classList.add('on-path'); });
    }

    var sPos = pctPos(sighterId), tPos = pctPos(hexId);
    [sightLineHalo, sightLine].forEach(function (line) {
      line.setAttribute('x1', sPos.left); line.setAttribute('y1', sPos.top);
      line.setAttribute('x2', tPos.left); line.setAttribute('y2', tPos.top);
      line.style.opacity = 1;
    });
    sightLine.setAttribute('stroke', result.blocked ? '#e8574a' : '#4a8f2e');

    var verdictHtml = '<div class="verdict ' + (result.blocked ? 'blocked' : 'clear') + '">' +
      (result.blocked ? 'BLOCKED' : 'CLEAR') + '</div>';
    var whyHtml;
    if (result.blocked) {
      var reasonText = REASON_TEXT[result.reason] || result.reason;
      whyHtml = '<div class="why">Blocked because ' + reasonText +
        (result.hexId ? ' Blocking hex: <b>' + result.hexId + '</b>.' : '') +
        (result.edge ? ' Hexside: <b>' + result.edge[0] + '/' + result.edge[1] + '</b>.' : '') + '</div>';
    } else {
      whyHtml = '<div class="why">Nothing on the traced line blocks — sighter and target are mutually visible (§8/1: lines of sight are reciprocal).</div>';
    }

    document.getElementById('target-card').className = 'mini-card';
    document.getElementById('target-card').innerHTML =
      verdictHtml +
      '<div class="hexid" style="font-size:16px;">' + hexId + '</div>' +
      '<div>' + terrainLabel(terrainByHexId[hexId]) + ' · elevation ' + elevationByHexId[hexId] + '</div>' +
      whyHtml;
  }

  document.getElementById('clearBtn').addEventListener('click', function () {
    sighterId = null; targetId = null;
    clearPathMarks();
    if (sighterMarkEl) { sighterMarkEl.remove(); sighterMarkEl = null; }
    if (targetMarkEl) { targetMarkEl.remove(); targetMarkEl = null; }
    Object.keys(losMarkEls).forEach(function (id) { losMarkEls[id].style.display = 'none'; });
    document.getElementById('sighter-card').className = 'mini-card empty';
    document.getElementById('sighter-card').textContent = 'none — click the map';
    document.getElementById('target-card').className = 'mini-card empty';
    document.getElementById('target-card').textContent = 'none — click a shaded hex';
    document.getElementById('sweep-stats').className = 'mini-card empty';
    document.getElementById('sweep-stats').textContent = '—';
  });

})();

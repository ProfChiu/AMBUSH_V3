/*
 * hexinspector.js — Phase 4 terrain review page (docs/11_GAME_BUILD_PHASES.md)
 *
 * Renders the auto-classified terrain database (assets/data/terrain_map_a.js) as
 * markers over the real map so the user can correct misclassifications before movement
 * rules are built on top of it. Corrections persist to localStorage (this is a review
 * tool, not the shipped data — the corrected export still needs to be saved back over
 * assets/data/terrain_map_a.json by hand once the pass is done).
 */
(function () {
  'use strict';

  var DATA = window.AMBUSH_TERRAIN_A;
  var G = window.AmbushHexGrid;
  var STORAGE_KEY = 'ambush_terrain_a_corrections_v1';

  var TERRAIN_TYPES = [
    { key: 'clear1', label: 'Clear L1', color: '#f2f2f2' },
    { key: 'clear2', label: 'Clear L2', color: '#f3f0a0' },
    { key: 'clear3', label: 'Clear L3', color: '#c9c37a' },
    { key: 'cover', label: 'Cover', color: '#b8a870' },
    { key: 'brush', label: 'Brush', color: '#a99b6a' },
    { key: 'rough', label: 'Rough', color: '#9a9a9a' },
    { key: 'woods', label: 'Woods', color: '#4a8f4a' },
    { key: 'water', label: 'River / Stream', color: '#6fb8e0' },
    { key: 'road', label: 'Road', color: '#8fa0ac' },
    { key: 'dirt_road', label: 'Dirt Road', color: '#a8703f' },
    { key: 'bridge', label: 'Bridge', color: '#7a6a52' },
    { key: 'ford', label: 'Ford', color: '#5a9ab0' },
    { key: 'building', label: 'Building (Stone/Wooden)', color: '#c97a5a' },
    { key: 'interior', label: 'Interior', color: '#8a6a8a' },
    { key: 'second_story', label: 'Second Story', color: '#6a7a9a' },
    { key: 'railroad', label: 'Railroad', color: '#3a3a3a' },
    { key: 'crater', label: 'Crater', color: '#5a4a3a' },
    { key: 'rubble', label: 'Rubble', color: '#8a8070' },
  ];
  var TERRAIN_BY_KEY = {};
  TERRAIN_TYPES.forEach(function (t) { TERRAIN_BY_KEY[t.key] = t; });

  var CONFIDENCE = [
    { key: 'low', label: 'Low', color: '#8E2A22' },
    { key: 'medium', label: 'Medium', color: '#C9A227' },
    { key: 'high', label: 'High', color: '#5a8f4a' },
  ];

  // ---- corrections store (localStorage) --------------------------------
  var corrections = {};
  try {
    corrections = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch (e) { corrections = {}; }

  function saveCorrections() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(corrections));
    document.getElementById('corrCount').textContent =
      Object.keys(corrections).length + ' correction' + (Object.keys(corrections).length === 1 ? '' : 's') + ' made this session';
  }

  function effectiveTerrain(hex) {
    return corrections[hex.id] || hex.terrain_guess;
  }

  // ---- filter state ------------------------------------------------------
  var terrainFilter = null;   // null = show all
  var confFilter = null;      // null = show all

  // ---- render map markers -------------------------------------------------
  var canvas = document.getElementById('map-canvas');
  var markerEls = {};

  DATA.hexes.forEach(function (h) {
    var el = document.createElement('div');
    el.className = 'hexmark conf-' + h.confidence;
    el.style.left = h.pct_x + '%';
    el.style.top = h.pct_y + '%';
    var t = TERRAIN_BY_KEY[effectiveTerrain(h)];
    el.style.background = t ? t.color : '#ff00ff';
    if (corrections[h.id]) el.classList.add('corrected');
    el.title = h.id;
    el.addEventListener('click', function () { selectHex(h.id); });
    canvas.appendChild(el);
    markerEls[h.id] = el;
  });

  function refreshMarker(h) {
    var el = markerEls[h.id];
    var t = TERRAIN_BY_KEY[effectiveTerrain(h)];
    el.style.background = t ? t.color : '#ff00ff';
    el.classList.toggle('corrected', !!corrections[h.id]);
  }

  function applyFilters() {
    DATA.hexes.forEach(function (h) {
      var el = markerEls[h.id];
      var show = true;
      if (terrainFilter && effectiveTerrain(h) !== terrainFilter) show = false;
      if (confFilter && h.confidence !== confFilter) show = false;
      el.classList.toggle('hidden-filtered', !show);
    });
  }

  // ---- legend / filter panels ---------------------------------------------
  var legendList = document.getElementById('legendList');
  TERRAIN_TYPES.forEach(function (t) {
    var row = document.createElement('div');
    row.className = 'legend-row';
    row.innerHTML = '<span class="swatch" style="background:' + t.color + '"></span><span>' + t.label + '</span>';
    row.addEventListener('click', function () {
      terrainFilter = (terrainFilter === t.key) ? null : t.key;
      Array.from(legendList.children).forEach(function (r, i) {
        r.classList.toggle('off', terrainFilter !== null && TERRAIN_TYPES[i].key !== terrainFilter);
      });
      applyFilters();
    });
    legendList.appendChild(row);
  });

  var confList = document.getElementById('confList');
  CONFIDENCE.forEach(function (c) {
    var row = document.createElement('div');
    row.className = 'conf-row';
    row.innerHTML = '<span class="conf-dot" style="background:' + c.color + '"></span><span>' + c.label + '</span>';
    row.addEventListener('click', function () {
      confFilter = (confFilter === c.key) ? null : c.key;
      Array.from(confList.children).forEach(function (r, i) {
        r.classList.toggle('off', confFilter !== null && CONFIDENCE[i].key !== confFilter);
      });
      applyFilters();
    });
    confList.appendChild(row);
  });

  function renderSummary() {
    var byConf = { low: 0, medium: 0, high: 0 };
    var byTerrain = {};
    DATA.hexes.forEach(function (h) {
      byConf[h.confidence]++;
      var t = effectiveTerrain(h);
      byTerrain[t] = (byTerrain[t] || 0) + 1;
    });
    var lines = [
      '<b>' + DATA.hexes.length + '</b> hexes total (25 cols &times; 19 rows)',
      '<b>' + byConf.low + '</b> low &middot; <b>' + byConf.medium + '</b> medium &middot; <b>' + byConf.high + '</b> high confidence',
    ];
    document.getElementById('summary').innerHTML = lines.join('<br>');
  }

  // ---- selection / detail panel -------------------------------------------
  var selectedId = null;

  function selectHex(id) {
    if (selectedId && markerEls[selectedId]) markerEls[selectedId].classList.remove('sel');
    selectedId = id;
    markerEls[id].classList.add('sel');
    markerEls[id].scrollIntoView({ block: 'center', behavior: 'smooth' });
    renderDetail(id);
  }

  function renderDetail(id) {
    var h = DATA.hexes.filter(function (x) { return x.id === id; })[0];
    var box = document.getElementById('detailBox');
    var cartridgeId = G.printedIdToCartridgeId(id);
    var nbrs = G.neighbors(h.col_idx, h.row_idx).map(function (n) { return n.id; });
    var current = effectiveTerrain(h);

    box.innerHTML =
      '<div class="detail">' +
      '<div class="hid">' + h.id + '</div>' +
      '<div class="row"><span>Cartridge id</span><b>' + cartridgeId + '</b></div>' +
      '<div class="row"><span>Auto-guess</span><b>' + (TERRAIN_BY_KEY[h.terrain_guess] ? TERRAIN_BY_KEY[h.terrain_guess].label : h.terrain_guess) + '</b></div>' +
      '<div class="row"><span>Confidence</span><span class="badge ' + h.confidence + '">' + h.confidence + '</span></div>' +
      '<div class="row"><span>Color distance</span><b>' + h.dist + '</b></div>' +
      '<div class="row"><span>Texture std</span><b>' + h.texture_std + '</b></div>' +
      '<div class="row"><span>Sampled RGB</span><b>' + h.rgb_median.join(',') + '</b></div>' +
      '<div class="row"><span>Neighbors</span><b>' + nbrs.join(' ') + '</b></div>' +
      '</div>' +
      '<select id="correctSelect"></select>' +
      (corrections[id] ? '<button class="btn" id="clearCorrection">Clear correction (revert to auto-guess)</button>' : '');

    var sel = document.getElementById('correctSelect');
    var optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '— correct terrain to —';
    sel.appendChild(optNone);
    TERRAIN_TYPES.forEach(function (t) {
      var o = document.createElement('option');
      o.value = t.key;
      o.textContent = t.label;
      if (t.key === current) o.selected = true;
      sel.appendChild(o);
    });
    sel.addEventListener('change', function () {
      if (!sel.value || sel.value === h.terrain_guess) {
        delete corrections[id];
      } else {
        corrections[id] = sel.value;
      }
      saveCorrections();
      refreshMarker(h);
      renderSummary();
      renderDetail(id);
    });

    var clearBtn = document.getElementById('clearCorrection');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        delete corrections[id];
        saveCorrections();
        refreshMarker(h);
        renderSummary();
        renderDetail(id);
      });
    }
  }

  // ---- "next low-confidence hex" review flow -------------------------------
  document.getElementById('nextReview').addEventListener('click', function () {
    var order = { low: 0, medium: 1, high: 2 };
    var pending = DATA.hexes
      .filter(function (h) { return !corrections[h.id]; })
      .sort(function (a, b) { return order[a.confidence] - order[b.confidence]; });
    if (!pending.length) return;
    var startIdx = selectedId ? pending.findIndex(function (h) { return h.id === selectedId; }) : -1;
    var next = pending[(startIdx + 1) % pending.length];
    selectHex(next.id);
  });

  // ---- export ---------------------------------------------------------------
  document.getElementById('exportBtn').addEventListener('click', function () {
    var out = DATA.hexes.map(function (h) {
      var c = corrections[h.id];
      return c ? Object.assign({}, h, { terrain_guess: c, terrain_corrected_from: h.terrain_guess, reviewed: true }) : h;
    });
    var payload = Object.assign({}, DATA, { hexes: out, corrections_applied: Object.keys(corrections).length });
    var box = document.getElementById('exportBox');
    box.value = JSON.stringify(payload, null, 1);
    box.style.display = box.style.display === 'none' ? 'block' : 'none';
  });

  renderSummary();
  saveCorrections();
})();

/*
 * hexgrid.js — Phase 4 hex grid foundation (docs/11_GAME_BUILD_PHASES.md)
 *
 * Pure coordinate math, no DOM, no rendering — axial coordinates, neighbor lookup,
 * distance, pixel<->hex conversion, and printed-label<->cartridge-ID mapping for Map A.
 *
 * Grid geometry (GRID below) was fitted from the printed hex-center dots on
 * assets/library/map/map_a_tactical.png via tools/build_terrain_db.py (connected-
 * component detection + least-squares fit, sub-2px accuracy against 475/528
 * detected candidates). If the map art is ever re-extracted, re-run that tool and
 * copy its "grid" object here.
 *
 * Recalibrated 2026-07-29 for the "v2" map crop (user's Photoshop aesthetic pass:
 * hex content shifted 135px left, 125px trimmed off both top and bottom, width
 * unchanged at 5336 — a pure translation/trim, no rescale, confirmed by an
 * unchanged col_pitch/row_pitch in the refit). MAP_HEIGHT dropped from 5100 to
 * 4850 accordingly.
 *
 * KEY FINDING: the printed map is 25 columns (A-Y) x 19 rows (1-19) = 475 hexes,
 * not 500. The Mission Cartridge (the game's per-mission hex data insert, see
 * docs/19_DATA_LAYER.md) references a 25x20=500 hex ID space (A-00..Y-19) with real,
 * non-blank data in all 500 rows. One row per column in that cartridge ID space has no
 * physical Map A counterpart. Confirmed by exact 475/475 grid-fit match against detected
 * dot centers (docs/15_TERRAIN_DB.md) — not a detection gap.
 * cartridgeIdToPrintedId() below maps cartridge row 19 (the 20th slot) to null; resolving
 * what it means is Phase 6 (data-layer) work, not this phase's. (Not the same thing as the
 * cartridge's separate "RE" Random Event lookup column, which is a 26th column outside the
 * A-Y hex range entirely — see docs/19_DATA_LAYER.md.)
 *
 * Hex orientation: flat-top, "odd-q" offset (odd column indices are pushed down
 * by half a row). Axial/neighbor formulas are the standard odd-q ones.
 */
(function () {
  'use strict';

  var LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXY';

  var GRID = {
    cols: 25,
    rows: 19,
    col_pitch: 203.27294629763267,
    row_pitch: 235.44444444444446,
    origin_x: 219.3400093801757,
    origin_y_even: 247.5,
    offset_y_odd: 117.0,
  };

  var MAP_WIDTH = 5336;
  var MAP_HEIGHT = 4850;

  function colIndex(letter) { return LETTERS.indexOf(letter); }
  function colLetter(idx) { return LETTERS[idx]; }

  function inBounds(colIdx, rowIdx) {
    return colIdx >= 0 && colIdx < GRID.cols && rowIdx >= 0 && rowIdx < GRID.rows;
  }

  // ---- ID parsing -----------------------------------------------------
  // Printed map label, e.g. "J5" -> {col:'J', colIdx:9, row:5, rowIdx:4}
  function parseId(id) {
    var m = /^([A-Y])(\d{1,2})$/.exec(id);
    if (!m) return null;
    var col = m[1], row = parseInt(m[2], 10);
    var ci = colIndex(col), ri = row - 1;
    if (!inBounds(ci, ri)) return null;
    return { col: col, colIdx: ci, row: row, rowIdx: ri, id: col + row };
  }

  function idFromIndex(colIdx, rowIdx) {
    if (!inBounds(colIdx, rowIdx)) return null;
    return colLetter(colIdx) + (rowIdx + 1);
  }

  // Mission Cartridge hex ID, e.g. "J-04" -> printed "J5". Cartridge row 19 (per column)
  // has no physical hex on Map A (see header note) -> returns null.
  function cartridgeIdToPrintedId(cartridgeId) {
    var m = /^([A-Y])-(\d{2})$/.exec(cartridgeId);
    if (!m) return null;
    var col = m[1], cartridgeRow = parseInt(m[2], 10);
    if (cartridgeRow >= GRID.rows) return null; // the unresolved 20th slot
    return col + (cartridgeRow + 1);
  }

  function printedIdToCartridgeId(id) {
    var p = parseId(id);
    if (!p) return null;
    var cartridgeRow = p.rowIdx; // printed row N (1-based) -> cartridge row N-1
    return p.col + '-' + (cartridgeRow < 10 ? '0' + cartridgeRow : cartridgeRow);
  }

  // ---- pixel <-> hex ----------------------------------------------------
  function hexToPixel(colIdx, rowIdx) {
    var x = GRID.origin_x + colIdx * GRID.col_pitch;
    var y = GRID.origin_y_even + (colIdx % 2 ? GRID.offset_y_odd : 0) + rowIdx * GRID.row_pitch;
    return { x: x, y: y, pctX: x / MAP_WIDTH * 100, pctY: y / MAP_HEIGHT * 100 };
  }

  function pixelToHex(x, y) {
    var ci = Math.round((x - GRID.origin_x) / GRID.col_pitch);
    ci = Math.max(0, Math.min(GRID.cols - 1, ci));
    var rowBase = GRID.origin_y_even + (ci % 2 ? GRID.offset_y_odd : 0);
    var ri = Math.round((y - rowBase) / GRID.row_pitch);
    ri = Math.max(0, Math.min(GRID.rows - 1, ri));
    return { colIdx: ci, rowIdx: ri, id: idFromIndex(ci, ri) };
  }

  // ---- axial coordinates (odd-q offset -> axial) -------------------------
  // Standard odd-q <-> axial conversion for flat-top hexagons.
  function offsetToAxial(colIdx, rowIdx) {
    var q = colIdx;
    var r = rowIdx - (colIdx - (colIdx & 1)) / 2;
    return { q: q, r: r };
  }
  function axialToOffset(q, r) {
    var colIdx = q;
    var rowIdx = r + (q - (q & 1)) / 2;
    return { colIdx: colIdx, rowIdx: rowIdx };
  }

  var ODDQ_DIRS_EVEN = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]];
  var ODDQ_DIRS_ODD = [[1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  function neighbors(colIdx, rowIdx) {
    var dirs = (colIdx % 2) ? ODDQ_DIRS_ODD : ODDQ_DIRS_EVEN;
    var out = [];
    for (var i = 0; i < dirs.length; i++) {
      var nc = colIdx + dirs[i][0], nr = rowIdx + dirs[i][1];
      if (inBounds(nc, nr)) out.push({ colIdx: nc, rowIdx: nr, id: idFromIndex(nc, nr) });
    }
    return out;
  }

  function distance(a, b) {
    var axA = offsetToAxial(a.colIdx, a.rowIdx);
    var axB = offsetToAxial(b.colIdx, b.rowIdx);
    var acA = { x: axA.q, z: axA.r, y: -axA.q - axA.r };
    var acB = { x: axB.q, z: axB.r, y: -axB.q - axB.r };
    return Math.max(Math.abs(acA.x - acB.x), Math.abs(acA.y - acB.y), Math.abs(acA.z - acB.z));
  }

  function allHexIds() {
    var out = [];
    for (var ci = 0; ci < GRID.cols; ci++) {
      for (var ri = 0; ri < GRID.rows; ri++) out.push(idFromIndex(ci, ri));
    }
    return out;
  }

  window.AmbushHexGrid = {
    GRID: GRID,
    MAP_WIDTH: MAP_WIDTH,
    MAP_HEIGHT: MAP_HEIGHT,
    colIndex: colIndex,
    colLetter: colLetter,
    inBounds: inBounds,
    parseId: parseId,
    idFromIndex: idFromIndex,
    cartridgeIdToPrintedId: cartridgeIdToPrintedId,
    printedIdToCartridgeId: printedIdToCartridgeId,
    hexToPixel: hexToPixel,
    pixelToHex: pixelToHex,
    offsetToAxial: offsetToAxial,
    axialToOffset: axialToOffset,
    neighbors: neighbors,
    distance: distance,
    allHexIds: allHexIds,
  };
})();

/*
 * losrules.js — Phase 5 line-of-sight rules (docs/17_LOS.md, §8 of the rulebook)
 *
 * Pure rules logic, no DOM — depends only on hexgrid.js. Traces a straight line between
 * two hex centers using the standard cube-coordinate lerp+round hex-line algorithm (exact
 * for a regular hex grid, which this one is — see hexgrid.js's fitted col_pitch/row_pitch),
 * then evaluates §8/2's blocking rules against every hex and hexside the line crosses.
 *
 * In scope: general elevation blocking, crest hexsides, embankment hexsides,
 * forest/brush/rubble/rough hexes (same- and different-elevation cases), and — since
 * 2026-09-07 — §8/2 BUILDING HEXES in full: wall hexsides, aperture hexsides, the
 * stance-dependent door/window rules, the one-hex limit across a non-adjacent aperture, and
 * the through-a-building elevation clause. See docs/53_BUILDINGS.md.
 *
 * The aperture stance table is transcribed from the rulebook's own summary sheet
 * (source/pdf/Ambush_LOS_Aid.pdf), which states it more compactly than §8/2's prose:
 *
 *              | Window                                  | Door
 *   Prone      | cannot see or be seen from outside      | only a target ADJACENT to the door
 *   Crouching  | cannot see a crouching or prone soldier | sees all of the field of view
 *              | in the hex ADJACENT to the window       |
 *   Standing   | sees all of the field of view           | sees all of the field of view
 *
 * traceLOS therefore takes optional `fromStance`/`toStance`. Callers with no soldier in hand
 * (the LOS sandbox, the hex inspector, a paragraph asking whether a hex is observable) omit
 * them and get 'standing' — the most permissive stance, so a terrain-only question can never
 * accidentally receive a stricter answer than terrain alone implies.
 *
 * Still NOT modelled: an aperture's field of view as a geometric CONE. Here the field of view
 * is implicit — a hex is in it when the traced hex-line actually crosses that aperture hexside.
 * That is what makes "one hex across a non-adjacent aperture" and "two soldiers in separate
 * buildings see each other only if both are in each other's FOV" fall out for free, and it
 * needs no extra data. A hand-drawn cone per aperture would differ only in edge cases the two
 * Map A buildings do not produce.
 */
(function () {
  'use strict';

  var G = window.AmbushHexGrid;

  var BLOCKING_FILL = { woods: true, brush: true, rubble: true, rough: true };

  // §8/2 BUILDING HEXES. A building's inside is an "Interior" hex (the Movement Point Cost
  // Chart's own name for it, and what the Fire Combat Modifiers rows call it); `building` and
  // `second_story` are accepted as synonyms so older data and the hex inspector's vocabulary
  // keep working.
  var BUILDING_TERRAIN = { interior: true, building: true, second_story: true };
  // Hexside features this module understands. Walls and apertures were previously dropped on the
  // floor by buildEdgeFeatures, which is why Map A's two buildings had no effect on sight.
  var EDGE_FEATURES = {
    crest: true, embankment: true,
    wall: true, aperture_window: true, aperture_door: true,
  };
  var APERTURE = { aperture_window: 'window', aperture_door: 'door' };

  // Same fixed direction order as the LOS csv columns (side_SE, side_NE, side_N, side_NW,
  // side_SW, side_S) and hexgrid.js's internal ODDQ_DIRS_EVEN/ODD — verified against
  // hexToPixel() offsets when this module was built. Kept local (not exported from
  // hexgrid.js) since only hexside-feature lookups need direction names.
  var ODDQ_DIRS_EVEN = [[1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [0, 1]];
  var ODDQ_DIRS_ODD = [[1, 1], [1, 0], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  var DIR_NAMES = ['SE', 'NE', 'N', 'NW', 'SW', 'S'];

  function neighborsByDir(colIdx, rowIdx) {
    var dirs = (colIdx % 2) ? ODDQ_DIRS_ODD : ODDQ_DIRS_EVEN;
    var out = {};
    for (var i = 0; i < dirs.length; i++) {
      var nc = colIdx + dirs[i][0], nr = rowIdx + dirs[i][1];
      if (G.inBounds(nc, nr)) out[DIR_NAMES[i]] = G.idFromIndex(nc, nr);
    }
    return out;
  }

  function edgeKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  function hexDistance(a, b) {
    var p = G.parseId(a), q = G.parseId(b);
    var A = G.offsetToAxial(p.colIdx, p.rowIdx), B = G.offsetToAxial(q.colIdx, q.rowIdx);
    return (Math.abs(A.q - B.q) + Math.abs(A.q + A.r - B.q - B.r) + Math.abs(A.r - B.r)) / 2;
  }

  // Build an edgeId -> feature ('crest'|'embankment'|other) lookup from the per-hex
  // `sides` maps produced by tools/compile_los_json.py (assets/data/los_map_a.json).
  function buildEdgeFeatures(losHexes) {
    var edges = {};
    Object.keys(losHexes).forEach(function (hexId) {
      var p = G.parseId(hexId);
      if (!p) return;
      var nbrs = neighborsByDir(p.colIdx, p.rowIdx);
      var sides = losHexes[hexId].sides || {};
      Object.keys(sides).forEach(function (dir) {
        var otherId = nbrs[dir];
        if (!otherId) return;
        var feature = sides[dir].replace(/\?$/, '').replace(/\s*\[.*\]\s*/, '').trim();
        if (EDGE_FEATURES[feature]) {
          edges[edgeKey(hexId, otherId)] = feature;
        }
      });
    });
    return edges;
  }

  // ---- hex-line tracing (cube lerp + round) --------------------------------
  function toCube(hexId) {
    var p = G.parseId(hexId);
    var ax = G.offsetToAxial(p.colIdx, p.rowIdx);
    return { x: ax.q, z: ax.r, y: -ax.q - ax.r };
  }

  function cubeToId(c) {
    var off = G.axialToOffset(c.x, c.z);
    return G.idFromIndex(off.colIdx, off.rowIdx);
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // Rounds a fractional cube coordinate to the nearest hex. Also reports whether the
  // point sits (within EPS) exactly on the boundary between two hexes — the rulebook's
  // "LOS exactly bisects two hexes" case (§8/1) — and if so, the alternate hex.
  var EPS = 1e-6;
  var TIE_EPS = 1e-4;
  function cubeRound(c) {
    var rx = Math.round(c.x), ry = Math.round(c.y), rz = Math.round(c.z);
    var xDiff = Math.abs(rx - c.x), yDiff = Math.abs(ry - c.y), zDiff = Math.abs(rz - c.z);

    // Detect a near-tie between the two largest corrections before resolving it, so we
    // can offer the alternate hex for the bisection rule.
    var diffs = [{ k: 'x', v: xDiff }, { k: 'y', v: yDiff }, { k: 'z', v: zDiff }];
    diffs.sort(function (a, b) { return b.v - a.v; });
    var tie = Math.abs(diffs[0].v - diffs[1].v) < TIE_EPS && diffs[0].v > EPS;

    var primary = { x: rx, y: ry, z: rz };
    if (xDiff > yDiff && xDiff > zDiff) primary.x = -ry - rz;
    else if (yDiff > zDiff) primary.y = -rx - rz;
    else primary.z = -rx - ry;

    var alt = null;
    if (tie) {
      // Force-correct using the *other* of the two largest components instead.
      alt = { x: rx, y: ry, z: rz };
      var other = diffs[1].k;
      if (other === 'x') alt.x = -ry - rz;
      else if (other === 'y') alt.y = -rx - rz;
      else alt.z = -rx - ry;
    }
    return { primary: primary, alt: alt };
  }

  // Ordered hex path from `fromId` to `toId` inclusive. Each step is
  // { hexId, altHexId } — altHexId is non-null only at an exact bisection point.
  function hexLine(fromId, toId) {
    var a = toCube(fromId), b = toCube(toId);
    var n = Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
    var steps = [];
    var count = Math.round(n);
    for (var i = 0; i <= count; i++) {
      var t = count === 0 ? 0 : i / count;
      var pt = { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
      var r = cubeRound(pt);
      steps.push({
        hexId: cubeToId(r.primary),
        altHexId: r.alt ? cubeToId(r.alt) : null,
      });
    }
    return steps;
  }

  // Expand tie points into the small set of candidate full paths (cartesian product,
  // capped — real LOS ranges only ever produce 0 or 1 ties in practice for this grid).
  var MAX_CANDIDATES = 16;
  function candidatePaths(steps) {
    var paths = [[]];
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      var options = step.altHexId ? [step.hexId, step.altHexId] : [step.hexId];
      var next = [];
      for (var p = 0; p < paths.length; p++) {
        for (var o = 0; o < options.length; o++) {
          if (next.length >= MAX_CANDIDATES) continue;
          next.push(paths[p].concat([options[o]]));
        }
      }
      paths = next;
    }
    return paths;
  }

  // ---- rule evaluation ------------------------------------------------------
  function isAdjacent(hexIdA, hexIdB) {
    var p = G.parseId(hexIdA);
    return G.neighbors(p.colIdx, p.rowIdx).some(function (n) { return n.id === hexIdB; });
  }

  // §8/2 apertures. `inside` is the stance of the soldier in the building hex, `outside` the
  // stance of the one beyond the aperture, and `adjacent` says whether the outside soldier
  // actually occupies the hex on the far side of that hexside (rather than looking in from
  // further away). Table transcribed from the rulebook's own summary (source/pdf/Ambush_LOS_Aid.pdf):
  //
  //            | Window                                    | Door
  //   Prone    | cannot see or be seen from outside        | only a target ADJACENT to the door
  //   Crouching| cannot see a crouching or prone soldier   | sees all of the field of view
  //            | in the hex ADJACENT to the window         |
  //   Standing | sees all of the field of view             | sees all of the field of view
  //
  // Returns null when the crossing is allowed, or a reason string when it blocks.
  function apertureBlocks(kind, inside, outside, adjacent) {
    if (kind === 'window') {
      if (inside === 'prone') return 'window-prone-inside';
      if (inside === 'crouching' && adjacent && (outside === 'crouching' || outside === 'prone')) {
        return 'window-crouching-adjacent';
      }
      return null;
    }
    // door
    if (inside === 'prone' && !adjacent) return 'door-prone-non-adjacent';
    return null;
  }

  // The adjacent-hex case of the wall/aperture rules. Kept separate from evaluatePath rather
  // than folded into it, because everything else evaluatePath does (elevation, blocking fill,
  // crest, embankment) is defined in terms of hexes BETWEEN the two soldiers, of which there are
  // none here — running it would risk changing long-settled adjacent-hex behaviour.
  function evaluateAdjacentEdge(pathIds, feature, opts) {
    var a = pathIds[0], b = pathIds[1];
    if (feature === 'wall') {
      return { blocked: true, reason: 'wall', edge: [a, b], path: pathIds };
    }
    var kind = APERTURE[feature];
    var terrainByHexId = opts.terrainByHexId || {};
    var insideHex = BUILDING_TERRAIN[terrainByHexId[a]] ? a
      : BUILDING_TERRAIN[terrainByHexId[b]] ? b : null;
    if (!insideHex) return { blocked: false, path: pathIds };
    var fromStance = opts.fromStance || 'standing';
    var toStance = opts.toStance || 'standing';
    var insideStance = insideHex === a ? fromStance : toStance;
    var outsideStance = insideHex === a ? toStance : fromStance;
    // Both soldiers are on the hexside itself, so the outside one is adjacent by definition.
    var why = apertureBlocks(kind, insideStance, outsideStance, true);
    if (why) return { blocked: true, reason: why, edge: [a, b], aperture: kind, path: pathIds };
    return { blocked: false, path: pathIds };
  }

  function evaluatePath(path, elevationByHexId, terrainByHexId, edgeFeatures, stances) {
    var fromId = path[0], toId = path[path.length - 1];
    var fromStance = (stances && stances.from) || 'standing';
    var toStance = (stances && stances.to) || 'standing';
    var sighterElev = elevationByHexId[fromId];
    var targetElev = elevationByHexId[toId];
    var loElev = Math.min(sighterElev, targetElev);
    var hiElev = Math.max(sighterElev, targetElev);
    var sameElev = sighterElev === targetElev;

    for (var i = 1; i < path.length - 1; i++) {
      var hexId = path[i];
      var elev = elevationByHexId[hexId];
      var terrain = terrainByHexId[hexId];

      // §8/2 ELEVATIONS: a hex higher than both sighting hexes always blocks, regardless
      // of terrain type.
      if (elev > hiElev) {
        return { blocked: true, reason: 'elevation', hexId: hexId, path: path };
      }

      if (BLOCKING_FILL[terrain]) {
        if (sameElev) {
          return { blocked: true, reason: 'terrain-same-elevation', hexId: hexId, path: path };
        }
        var blocksSighter = isAdjacent(hexId, fromId) && elev === sighterElev;
        var blocksTarget = isAdjacent(hexId, toId) && elev === targetElev;
        if (blocksSighter || blocksTarget) {
          return { blocked: true, reason: 'terrain-diff-elevation', hexId: hexId, path: path };
        }
      }

      // §8/2: "an LOS cannot be traced through a building hex at the same elevation as both
      // sighting hexes. If the two hexes are at different elevations, the LOS is blocked if the
      // building hex in question is closer to or equal to the lower hex." This is about passing
      // THROUGH a building; seeing into or out of one is the aperture logic below.
      if (BUILDING_TERRAIN[terrain]) {
        if (sameElev) {
          return { blocked: true, reason: 'building-through-same-elevation', hexId: hexId, path: path };
        }
        // "...the LOS is blocked if the building hex in question is closer to the soldier at the
        // LOWER elevation than to the soldier at the higher elevation. If exactly equal, the LOS
        // is blocked." This is a DISTANCE test, not an elevation one — an easy clause to misread,
        // and misreading it as `elev <= loElev` let sight run straight through both of Map A's
        // buildings from the low ground to the west.
        var lowHexId = sighterElev < targetElev ? fromId : toId;
        var highHexId = lowHexId === fromId ? toId : fromId;
        if (hexDistance(hexId, lowHexId) <= hexDistance(hexId, highHexId)) {
          return { blocked: true, reason: 'building-through-closer-to-lower', hexId: hexId, path: path };
        }
      }
    }

    for (var j = 0; j < path.length - 1; j++) {
      var feature = edgeFeatures[edgeKey(path[j], path[j + 1])];
      if (!feature) continue;

      if (feature === 'crest') {
        return { blocked: true, reason: 'crest', edge: [path[j], path[j + 1]], path: path };
      }

      if (feature === 'embankment') {
        if (sameElev) continue; // no effect at equal elevation
        var edgeElevA = elevationByHexId[path[j]], edgeElevB = elevationByHexId[path[j + 1]];
        var embElev = Math.max(edgeElevA, edgeElevB);
        if (embElev <= loElev) continue; // at or below the lower sighting hex: no block
        var higherHexId = sighterElev > targetElev ? fromId : toId;
        var adjacentToHigh = path[j] === higherHexId || path[j + 1] === higherHexId;
        if (adjacentToHigh) continue; // higher than low hex but touches the high hex: clear
        return { blocked: true, reason: 'embankment', edge: [path[j], path[j + 1]], path: path };
      }

      // §8/2: "An LOS can never be traced into a building hex across a non-aperture hexside."
      // A wall is opaque from either side, at any stance. (Fire CAN cross one — §13/5
      // penetration — but that is fire combat, not line of sight.)
      if (feature === 'wall') {
        return { blocked: true, reason: 'wall', edge: [path[j], path[j + 1]], path: path };
      }

      var kind = APERTURE[feature];
      if (kind) {
        var a = path[j], b = path[j + 1];
        var insideHex = BUILDING_TERRAIN[terrainByHexId[a]] ? a
          : BUILDING_TERRAIN[terrainByHexId[b]] ? b : null;
        // An aperture between two hexes where neither is a building interior is malformed data
        // rather than a rule case; let it through instead of inventing a restriction.
        if (insideHex) {
          var outsideHex = insideHex === a ? b : a;
          // Whose stance counts: the soldier standing IN the building. If neither endpoint of
          // the whole LOS is that hex, nobody is at this window — the line is merely passing by,
          // and the building hex itself has already been judged above.
          var insideStance = insideHex === fromId ? fromStance : insideHex === toId ? toStance : null;
          if (insideStance) {
            var outsideStance = insideHex === fromId ? toStance : fromStance;
            var outsideSoldierHex = insideHex === fromId ? toId : fromId;
            var adjacent = outsideSoldierHex === outsideHex;
            var why = apertureBlocks(kind, insideStance, outsideStance, adjacent);
            if (why) {
              return { blocked: true, reason: why, edge: [a, b], aperture: kind, path: path };
            }
          }

          // §8/2: "An LOS can be traced only one hex across an aperture hexside that is not
          // adjacent to the sighting soldier's hex." The sighter here is path[0]; if he is not
          // standing on either side of this aperture, he may see only one hex past it.
          // "An LOS can be traced only ONE HEX across an aperture hexside that is not adjacent to
          // the sighting soldier's hex." The one hex is the hex immediately across — the
          // rulebook's own LOS Nr. 3 says "the LOS between B and G is blocked by building hex
          // Q10, ALTHOUGH B CAN SEE INTO Q10", which is exactly this: into the hex across, and
          // no further. So the target must BE path[j + 1]; anything beyond it is blocked.
          var sighterAtEdge = (fromId === a || fromId === b);
          if (!sighterAtEdge && (j + 1) !== path.length - 1) {
            return { blocked: true, reason: 'aperture-non-adjacent-one-hex', edge: [a, b], path: path };
          }
        }
      }
    }

    return { blocked: false, path: path };
  }

  // opts: { fromId, toId, elevationByHexId, terrainByHexId, edgeFeatures }
  // edgeFeatures may be precomputed via buildEdgeFeatures(); pass it in when tracing many
  // sightlines against the same map so it isn't rebuilt every call.
  function traceLOS(opts) {
    var steps = hexLine(opts.fromId, opts.toId);
    if (steps.length < 3) {
      // Adjacent (or identical) hexes: nothing can stand between them, so terrain, elevation,
      // crest and embankment are all irrelevant and this has always returned clear. A WALL is
      // the exception — it sits on the hexside itself, which is exactly where two adjacent hexes
      // meet, and it is the whole reason a building is a building. Apertures are checked here for
      // the same reason: the stance rules bite hardest at point-blank range ("a crouching soldier
      // cannot see a crouching or prone soldier in the hex immediately adjacent to the window").
      var pathIds = steps.map(function (st) { return st.hexId; });
      if (pathIds.length === 2) {
        var adjFeature = opts.edgeFeatures ? opts.edgeFeatures[edgeKey(pathIds[0], pathIds[1])] : null;
        if (adjFeature === 'wall' || APERTURE[adjFeature]) {
          return evaluateAdjacentEdge(pathIds, adjFeature, opts);
        }
      }
      return { blocked: false, path: pathIds };
    }

    var candidates = candidatePaths(steps);
    // §8/2's aperture rules depend on the two soldiers' stances. Callers that don't care (the
    // LOS sandbox, the hex inspector, any pure terrain question) omit them and get 'standing',
    // which is the most permissive stance and so preserves the old behaviour exactly.
    var stances = { from: opts.fromStance || 'standing', to: opts.toStance || 'standing' };
    var results = candidates.map(function (path) {
      return evaluatePath(path, opts.elevationByHexId, opts.terrainByHexId, opts.edgeFeatures, stances);
    });
    var clear = results.filter(function (r) { return !r.blocked; });
    // §8/1 bisection rule: if any valid path through the tie points is clear, the LOS is
    // clear — the blocking hex on the other candidate path doesn't matter.
    return clear.length ? clear[0] : results[0];
  }

  // Traces from `fromId` to every hex in `hexIds` (defaults to every key in
  // elevationByHexId) — the whole-map "what can I see from here" sweep the LOS
  // sandbox needs. Cheap: each trace is a handful of hex steps, hundreds of hexes
  // is trivial even in a browser.
  function visibilityFrom(fromId, elevationByHexId, terrainByHexId, edgeFeatures, hexIds,
                         fromStance, toStance) {
    var out = {};
    (hexIds || Object.keys(elevationByHexId)).forEach(function (toId) {
      if (toId === fromId) return;
      out[toId] = traceLOS({
        fromId: fromId, toId: toId, elevationByHexId: elevationByHexId,
        terrainByHexId: terrainByHexId, edgeFeatures: edgeFeatures,
        fromStance: fromStance, toStance: toStance,
      });
    });
    return out;
  }

  window.AmbushLOS = {
    hexLine: hexLine,
    traceLOS: traceLOS,
    visibilityFrom: visibilityFrom,
    buildEdgeFeatures: buildEdgeFeatures,
    apertureBlocks: apertureBlocks,
    BUILDING_TERRAIN: BUILDING_TERRAIN,
    neighborsByDir: neighborsByDir,
  };
})();

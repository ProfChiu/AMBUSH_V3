/*
 * movementrules.js — Phase 4 movement rules (docs/11_GAME_BUILD_PHASES.md)
 *
 * Pure rules logic, no DOM — depends only on hexgrid.js. Covers §7 (Movement) and the
 * movement-related parts of §5/3 (Actions During Operations) and §6/7 (Performing
 * Actions During Rounds). Scope matches the phase brief exactly: MPA, terrain/hexside
 * MP costs, stance and the one free stance change, crouch-crawl vs stand-multihex,
 * prone cannot move, group movement (one Paragraph Check), stacking, mandatory stop
 * entering an enemy hex, drag inactive soldier, prohibited terrain.
 *
 * Deliberately NOT in scope here (later phases): combined Move/Snap-Fire and
 * Move/Charge-Assault (§6/7, combat phases), crew-weapon movement, vehicle movement,
 * the Action Round turn economy/AR Track (§6/1, Phase 8). This module models the
 * movement action in isolation, matching the "movement sandbox" the phase brief asks
 * for, not a full Round.
 *
 * Hexside costs (aperture/embankment/crest, +1 each) are NOT modeled — the terrain
 * database has no hexside data yet (deferred to the LOS phase, docs/15_TERRAIN_DB.md).
 * §7/3's one worked example (clear hex entered uphill across an embankment = 1+1 = 2 MP)
 * is exercised in the test harness against synthetic hex data to prove the rule itself
 * is correctly implemented, independent of that data gap.
 */
(function () {
  'use strict';

  var G = window.AmbushHexGrid;

  // Movement Point Cost Chart, apps/trainer/ambushdata.js MOVEMENT_MP (rulebook-verified
  // there per docs/12_ART_ASSET_AUDIT.md). Extended with the terrain-DB's classifier
  // vocabulary (docs/15_TERRAIN_DB.md) — Road/Dirt Road merge into the chart's single
  // "Road / Clear hex" entry; Building/Second Story/Railroad have no chart entry and are
  // approximated (flagged below) pending rulebook confirmation.
  var TERRAIN_MP_COST = {
    clear1: 1, clear2: 1, clear3: 1,       // "Road / Clear hex ('Open')"
    cover: 1,                               // "Cover hex"
    rough: 2,                               // "Rough hex"
    brush: 2,                               // "Brush hex"
    woods: 2,                               // "Woods hex"
    road: 1, dirt_road: 1,                  // chart doesn't distinguish Road from Dirt Road
    bridge: 1,                              // "Bridge hex ('Open')"
    ford: 2,                                // "Ford hex ('Open')"
    interior: 1,                            // "Interior hex"
    crater: 1,                              // "Crater hex"
    rubble: 2,                              // "Rubble hex"
    stream: 2,                              // "Stream hex ('Open')"
    river: Infinity,                        // "River hex" — prohibited (§7/1)
    water: 2,                               // terrain-DB doesn't yet distinguish river/stream
                                             // (docs/15_TERRAIN_DB.md §3) — defaults to the
                                             // passable Stream cost; correct specific hexes to
                                             // 'river' in the hex-inspector once that split exists.
    // APPROXIMATED — not in the printed chart, no rulebook citation yet:
    building: 1,                            // treated like Interior; confirm before Phase 9
    second_story: 1,                        // matches "Climb/descend staircase: 1"
    railroad: 1,                            // treated as Open; confirm before Phase 9
  };

  function mpCost(terrainKey) {
    var c = TERRAIN_MP_COST[terrainKey];
    return c === undefined ? 1 : c;
  }

  function isProhibited(terrainKey) {
    return mpCost(terrainKey) === Infinity;
  }

  // ---- hexside features (§7/3 Movement Point Cost Chart) ----------------------
  // "The MP cost to cross terrain hexsides is added to the cost of the hex entered." The printed
  // chart lists Aperture Hexside as +1 and has no row for a wall at all, because a wall is not a
  // cost — it cannot be crossed. §11/3's own worked example confirms the arithmetic: crossing a
  // window into a building costs 2 MP (1 for the Interior hex + 1 for the aperture), which is why
  // a soldier with a halved MPA of 1 "could not cross a window to enter the defender's hex".
  //
  // Doors and windows cost the same to cross; the door/window distinction is a LINE OF SIGHT
  // rule (§8/2), not a movement one.
  function edgeKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }
  var HEXSIDE_MP = { aperture_window: 1, aperture_door: 1, crest: 1 };
  function hexsideCost(feature) {
    if (!feature) return 0;
    if (feature === 'wall') return Infinity;   // impassable, not expensive
    var c = HEXSIDE_MP[feature];
    return c === undefined ? 0 : c;
  }

  // ---- stance -------------------------------------------------------------
  var STANCE = { STANDING: 'standing', CROUCHING: 'crouching', PRONE: 'prone' };

  // §6/7 Free Stance Change: one per turn, unwounded only. Additional changes cost 1 MP.
  function stanceChangeCost(usedFreeChangeAlready, wounded) {
    if (wounded) return 1; // wounded soldiers never get a free change
    return usedFreeChangeAlready ? 1 : 0;
  }

  // ---- legal destinations ---------------------------------------------------
  // terrainByHexId: {hexId -> terrainKey}. occupiedByEnemy: Set/array of hexIds with an
  // active enemy soldier — entering one is legal but movement must stop there (§7/3).
  //
  // Crouching: "can crawl one hex by expending all his MPA, regardless of the terrain
  // in the hex entered" (§7/3) — so crouching movement is exactly the 1-hex neighborhood,
  // every adjacent non-prohibited hex reachable at cost = full MPA, terrain cost ignored.
  //
  // Standing: "enter more than one hex, subject to the MP costs of the hexes entered and
  // the soldier's MPA" (§7/3) — Dijkstra over the hex graph, budget = MPA.
  function legalDestinations(opts) {
    var startHexId = opts.startHexId;
    var mpa = opts.mpa;
    var stance = opts.stance;
    var terrainByHexId = opts.terrainByHexId;
    var occupiedByEnemy = opts.occupiedByEnemy || [];
    var edgeFeatures = opts.edgeFeatures || {};
    var enemySet = {};
    occupiedByEnemy.forEach(function (id) { enemySet[id] = true; });

    if (stance === STANCE.PRONE) return {}; // "Prone soldiers cannot move at all" (§5/3)

    var start = G.parseId(startHexId);
    if (!start) return {};

    if (stance === STANCE.CROUCHING) {
      var out = {};
      G.neighbors(start.colIdx, start.rowIdx).forEach(function (n) {
        var terrain = terrainByHexId[n.id];
        if (terrain && isProhibited(terrain)) return; // can't cross prohibited terrain either
        if (hexsideCost(edgeFeatures[edgeKey(startHexId, n.id)]) === Infinity) return; // wall
        // The crawl "expends all his MPA regardless of the terrain in the hex entered" (§7/3), so
        // the aperture surcharge cannot be paid on top — it is already everything he has. A crawl
        // through a doorway is therefore still one hex for one full MPA, not a hex he cannot reach.
        out[n.id] = { cost: mpa, path: [startHexId, n.id] };
      });
      return out;
    }

    // standing: Dijkstra, cost = accumulated terrain MP cost of entered hexes, budget = mpa
    var best = {}; // hexId -> {cost, path}
    best[startHexId] = { cost: 0, path: [startHexId] };
    var frontier = [startHexId];

    while (frontier.length) {
      // simple O(n^2) pop-min — the movement graph per turn is small (MPA is a handful
      // of hexes deep), no need for a heap here.
      var fi = 0;
      for (var i = 1; i < frontier.length; i++) {
        if (best[frontier[i]].cost < best[frontier[fi]].cost) fi = i;
      }
      var curId = frontier.splice(fi, 1)[0];
      var cur = best[curId];

      if (curId !== startHexId && enemySet[curId]) continue; // mandatory stop — don't expand past it

      var curHex = G.parseId(curId);
      G.neighbors(curHex.colIdx, curHex.rowIdx).forEach(function (n) {
        var terrain = terrainByHexId[n.id];
        if (terrain && isProhibited(terrain)) return;
        var sideCost = hexsideCost(edgeFeatures[edgeKey(curId, n.id)]);
        if (sideCost === Infinity) return; // a wall — no path through it at any cost
        var stepCost = mpCost(terrain) + sideCost;
        var newCost = cur.cost + stepCost;
        if (newCost > mpa) return;
        if (!best[n.id] || newCost < best[n.id].cost) {
          best[n.id] = { cost: newCost, path: cur.path.concat([n.id]) };
          frontier.push(n.id);
        }
      });
    }

    delete best[startHexId];
    return best;
  }

  // §7/1: "no limit to the number of soldiers ... that can occupy the same hex" — stacking
  // is always legal; this function exists so callers don't have to special-case it.
  function stackingLegal() { return true; }

  // §5/3 / §7/3: a group move (soldiers in the same hex, same stance, moving together)
  // triggers exactly one Paragraph Check for the destination hex, not one per soldier.
  function groupMoveParagraphCheckCount(soldierIds) {
    return soldierIds.length > 0 ? 1 : 0;
  }

  // §7/3 & §6/7 "Drag Inactive Soldier": standing soldier, one empty Port Box, one hex only,
  // costs the dragging soldier's entire MPA. If the dragged soldier is incapacitated, a d10
  // roll of 0 kills him.
  function dragInactiveSoldier(opts) {
    if (opts.draggerStance !== STANCE.STANDING) {
      throw new Error('dragging soldier must be standing');
    }
    if (!opts.draggerHasEmptyPortBox) {
      throw new Error('dragging soldier needs an empty Port Box');
    }
    var result = { mpSpent: opts.draggerMPA, hexesMoved: 1, diedFromDrag: false };
    if (opts.draggedIsIncapacitated) {
      var roll = opts.rollD10 ? opts.rollD10() : (1 + Math.floor(Math.random() * 10));
      result.dragRoll = roll;
      result.diedFromDrag = (roll === 0 || roll === 10); // d10 "result of zero" — table convention: 10 reads as 0
    }
    return result;
  }

  window.AmbushMovement = {
    STANCE: STANCE,
    TERRAIN_MP_COST: TERRAIN_MP_COST,
    mpCost: mpCost,
    isProhibited: isProhibited,
    stanceChangeCost: stanceChangeCost,
    hexsideCost: hexsideCost,
    legalDestinations: legalDestinations,
    stackingLegal: stackingLegal,
    groupMoveParagraphCheckCount: groupMoveParagraphCheckCount,
    dragInactiveSoldier: dragInactiveSoldier,
  };
})();

#!/usr/bin/env node
/*
 * tools/test_movement.js — Phase 4 movement rules test harness
 * (docs/11_GAME_BUILD_PHASES.md, docs/16_MOVEMENT.md)
 *
 * "Replay the rulebook's own movement examples as regression tests." §7 (Movement) has
 * exactly one concrete worked numeric example in its text (the embankment-hexside case);
 * everything else here validates the Movement Point Cost Chart and the rules engine's
 * logic directly — crouch/stand/prone, prohibited terrain, mandatory stop, MPA budget —
 * plus a reachability check against the real, user-corrected Map A terrain database.
 *
 * Run:  node tools/test_movement.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/hexgrid.js'));
require(path.join(ROOT, 'apps/game/movementrules.js'));
const G = window.AmbushHexGrid;
const M = window.AmbushMovement;

const terrainDb = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/data/terrain_map_a.json')));
const REAL_TERRAIN = {};
terrainDb.hexes.forEach((h) => { REAL_TERRAIN[h.id] = h.terrain_guess; });

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL —', label); }
}
function approxEqual(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-6); }

// Build an isolated synthetic terrain map: every hex reachable from `corridorIds` (within
// a couple of hops, via the REAL grid topology) defaults to 'river' (prohibited) unless
// explicitly overridden — so a test corridor can't be defeated by an unintended alternate
// route through the rest of the map. `overrides` wins over the river default.
function isolatedTerrain(corridorIds, overrides) {
  const blocked = {};
  corridorIds.forEach((id) => {
    const p = G.parseId(id);
    G.neighbors(p.colIdx, p.rowIdx).forEach((n) => { blocked[n.id] = 'river'; });
  });
  return Object.assign(blocked, overrides);
}

// ---------------------------------------------------------------------
// 1. Movement Point Cost Chart — exact values from apps/trainer/ambushdata.js
//    MOVEMENT_MP (rulebook-verified there).
// ---------------------------------------------------------------------
check('Clear L1/L2/L3 cost 1', [1, 1, 1].every((c, i) => M.mpCost(['clear1', 'clear2', 'clear3'][i]) === c));
check('Cover costs 1', M.mpCost('cover') === 1);
check('Rough costs 2', M.mpCost('rough') === 2);
check('Brush costs 2', M.mpCost('brush') === 2);
check('Woods costs 2', M.mpCost('woods') === 2);
check('Road costs 1', M.mpCost('road') === 1);
check('Bridge costs 1', M.mpCost('bridge') === 1);
check('Ford costs 2', M.mpCost('ford') === 2);
check('Interior costs 1', M.mpCost('interior') === 1);
check('Crater costs 1', M.mpCost('crater') === 1);
check('Rubble costs 2', M.mpCost('rubble') === 2);
check('Stream costs 2', M.mpCost('stream') === 2);
check('River is prohibited (§7/1)', M.isProhibited('river') && M.mpCost('river') === Infinity);
check('Unknown terrain defaults to 1, not a crash', M.mpCost('__nope__') === 1);

// ---------------------------------------------------------------------
// 2. §7/3 worked example: "it costs two Movement Points for a standing soldier to enter
//    a clear hex by crossing an embankment hexside from a lower elevation to a higher
//    one (there is no additional cost to cross an embankment going downhill)."
//    Hexside costs aren't modeled yet (docs/16_MOVEMENT.md) — this proves the base
//    arithmetic the rule depends on, with the embankment surcharge applied by hand.
// ---------------------------------------------------------------------
const EMBANKMENT_HEXSIDE_COST = 1; // "+1 up only" per the Movement Point Cost Chart
check('§7/3 embankment example: clear(1) + embankment uphill(1) = 2 MP',
  M.mpCost('clear1') + EMBANKMENT_HEXSIDE_COST === 2);
check('§7/3 embankment example: downhill has no added cost',
  M.mpCost('clear1') + 0 === 1);

// ---------------------------------------------------------------------
// 3. Crouching: "can crawl one hex by expending all his MPA, regardless of the terrain
//    in the hex entered" (§7/3).
// ---------------------------------------------------------------------
(function () {
  const synthetic = { J5: 'clear1', K6: 'woods', K5: 'brush', J4: 'rough', I5: 'cover', I6: 'clear2', J6: 'clear3' };
  const dest = M.legalDestinations({
    startHexId: 'J5', mpa: 4, stance: M.STANCE.CROUCHING, terrainByHexId: synthetic,
  });
  const ids = Object.keys(dest);
  check('crouching reaches exactly the 6 neighbors', ids.length === 6);
  check('crouching cost is always the full MPA regardless of terrain',
    ids.every((id) => dest[id].cost === 4));
})();

// ---------------------------------------------------------------------
// 4. Prone cannot move at all (§5/3).
// ---------------------------------------------------------------------
check('prone soldier has zero legal destinations',
  Object.keys(M.legalDestinations({ startHexId: 'J5', mpa: 6, stance: M.STANCE.PRONE, terrainByHexId: {} })).length === 0);

// ---------------------------------------------------------------------
// 5. Standing multi-hex, MPA budget enforcement, and prohibited terrain — synthetic
//    hand-built terrain so the graph shape is known exactly.
// ---------------------------------------------------------------------
(function () {
  // A straight-ish line of clear hexes east from J5, one woods hex blocking a shortcut,
  // isolated from the rest of the real grid so there's no unintended alternate route.
  const corridor = ['J5', 'K5', 'L5', 'M5', 'N5', 'K6'];
  const synthetic = isolatedTerrain(corridor, {
    J5: 'clear1', K5: 'clear1', L5: 'clear1', M5: 'clear1', N5: 'clear1', K6: 'woods',
  });
  const dest = M.legalDestinations({ startHexId: 'J5', mpa: 3, stance: M.STANCE.STANDING, terrainByHexId: synthetic });
  check('standing MPA=3 through clear(1) terrain reaches 3 hexes out', dest.M5 !== undefined && dest.M5.cost === 3);
  check('standing MPA=3 does not overreach a 4th clear hex', dest.N5 === undefined);
  check('river hex never appears as a destination (prohibited)', dest.J4 === undefined);
  check('path cost equals the sum of per-hex terrain costs along it', (function () {
    return dest.M5.path.slice(1).reduce((sum, id) => sum + M.mpCost(synthetic[id] || 'clear1'), 0) === dest.M5.cost;
  })());

  const dest2 = M.legalDestinations({ startHexId: 'J5', mpa: 3, stance: M.STANCE.STANDING, terrainByHexId: synthetic });
  check('a woods hex (cost 2) plus one more clear hex (cost 1) fits exactly in MPA=3',
    dest2.K6 !== undefined && dest2.K6.cost === 2);
})();

// ---------------------------------------------------------------------
// 6. Mandatory stop entering an enemy-occupied hex (§7/3): the hex itself is reachable,
//    nothing beyond it through that path is.
// ---------------------------------------------------------------------
(function () {
  const corridor = ['J5', 'K5', 'L5', 'M5'];
  const synthetic = isolatedTerrain(corridor, {
    J5: 'clear1', K5: 'clear1', L5: 'clear1', M5: 'clear1',
  });
  const dest = M.legalDestinations({
    startHexId: 'J5', mpa: 4, stance: M.STANCE.STANDING, terrainByHexId: synthetic,
    occupiedByEnemy: ['L5'],
  });
  check('enemy-occupied hex is itself reachable', dest.L5 !== undefined);
  check('movement cannot continue past an enemy-occupied hex', dest.M5 === undefined);
  check('a hex before the enemy is still reachable normally', dest.K5 !== undefined);
})();

// ---------------------------------------------------------------------
// 7. Stacking is always legal (§7/1); group move is exactly one Paragraph Check (§5/3, §7/3).
// ---------------------------------------------------------------------
check('stacking is unconditionally legal', M.stackingLegal() === true);
check('group move of 3 soldiers = 1 Paragraph Check', M.groupMoveParagraphCheckCount(['A', 'B', 'C']) === 1);
check('group move of 0 soldiers = 0 Paragraph Checks', M.groupMoveParagraphCheckCount([]) === 0);

// ---------------------------------------------------------------------
// 8. Drag inactive soldier (§7/3, §6/7).
// ---------------------------------------------------------------------
(function () {
  const ok = M.dragInactiveSoldier({
    draggerStance: M.STANCE.STANDING, draggerHasEmptyPortBox: true, draggerMPA: 4,
    draggedIsIncapacitated: false,
  });
  check('drag (not incapacitated) spends full MPA, no death roll', ok.mpSpent === 4 && ok.diedFromDrag === false);

  const died = M.dragInactiveSoldier({
    draggerStance: M.STANCE.STANDING, draggerHasEmptyPortBox: true, draggerMPA: 4,
    draggedIsIncapacitated: true, rollD10: () => 0,
  });
  check('drag of incapacitated soldier, roll=0, dies', died.diedFromDrag === true);

  const survived = M.dragInactiveSoldier({
    draggerStance: M.STANCE.STANDING, draggerHasEmptyPortBox: true, draggerMPA: 4,
    draggedIsIncapacitated: true, rollD10: () => 5,
  });
  check('drag of incapacitated soldier, roll=5, survives', survived.diedFromDrag === false);

  let threw = false;
  try {
    M.dragInactiveSoldier({ draggerStance: M.STANCE.CROUCHING, draggerHasEmptyPortBox: true, draggerMPA: 4, draggedIsIncapacitated: false });
  } catch (e) { threw = true; }
  check('drag requires the dragger to be standing', threw);
})();

// ---------------------------------------------------------------------
// 9. Real Map A reachability — the actual, user-reviewed terrain database, not synthetic
//    data. Sanity-checks the whole pipeline (hexgrid + terrain DB + rules) together.
// ---------------------------------------------------------------------
(function () {
  const startId = 'J5';
  check('J5 exists in the real terrain database', REAL_TERRAIN[startId] !== undefined);

  const dest = M.legalDestinations({ startHexId: startId, mpa: 4, stance: M.STANCE.STANDING, terrainByHexId: REAL_TERRAIN });
  const ids = Object.keys(dest);
  check('real-map reachable set is non-empty', ids.length > 0);
  check('every reachable hex is within the MPA budget', ids.every((id) => dest[id].cost <= 4));
  check('every reachable hex is a real, in-bounds hex ID', ids.every((id) => G.parseId(id) !== null));
  check('every path cost matches the sum of real terrain costs along it', ids.every((id) => {
    const p = dest[id].path;
    let sum = 0;
    for (let i = 1; i < p.length; i++) sum += M.mpCost(REAL_TERRAIN[p[i]]);
    return sum === dest[id].cost;
  }));
  check('no prohibited-terrain hex appears in the reachable set',
    ids.every((id) => !M.isProhibited(REAL_TERRAIN[id])));

  const crouchDest = M.legalDestinations({ startHexId: startId, mpa: 4, stance: M.STANCE.CROUCHING, terrainByHexId: REAL_TERRAIN });
  check('crouching from J5 never exceeds its 6 neighbors', Object.keys(crouchDest).length <= 6);
})();

// ---------------------------------------------------------------------
// §7/3 hexside costs — walls and apertures (Map A's two buildings)
//
// The printed Movement Point Cost Chart lists "Aperture Hexside +1" and has NO wall row at all,
// because a wall is not a cost — it cannot be crossed. §11/3's worked example pins the arithmetic:
// crossing a window into a building costs 2 MP (1 Interior hex + 1 aperture), which is why a
// soldier with a halved MPA of 1 "could not cross a window to enter the defender's hex".
// ---------------------------------------------------------------------
(() => {
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const neighbours = G.neighbors(G.parseId('J5').colIdx, G.parseId('J5').rowIdx).map((n) => n.id);
  const [n0, n1] = neighbours;
  const flat = {};
  neighbours.concat(['J5']).forEach((id) => { flat[id] = 'clear1'; });

  check('hexsideCost: a wall is impassable, not merely expensive',
        M.hexsideCost('wall') === Infinity);
  check('hexsideCost: an aperture costs +1 whether door or window',
        M.hexsideCost('aperture_window') === 1 && M.hexsideCost('aperture_door') === 1);
  check('hexsideCost: no feature costs nothing', M.hexsideCost(undefined) === 0);

  // A single wall hexside does not seal a hex off — on open ground you walk around it, which is
  // both correct and worth asserting, since the naive version of this test ("the neighbour is
  // unreachable") passes only by accident when the detour happens to be too expensive.
  const walled = M.legalDestinations({
    startHexId: 'J5', mpa: 4, stance: M.STANCE.STANDING, terrainByHexId: flat,
    edgeFeatures: { [key('J5', n0)]: 'wall' },
  });
  const crossesWall = (d) => d && d.path.some((h, i) =>
    i > 0 && key(d.path[i - 1], h) === key('J5', n0));
  check('a walled neighbour is still reachable the long way round on open ground', !!walled[n0]);
  check('...but the route taken never crosses the wall itself', !crossesWall(walled[n0]));
  check('going around costs more than the one step it replaces', walled[n0].cost > 1);
  check('a wall does not affect the other neighbours', !!walled[n1] && walled[n1].cost === 1);

  const noDetour = M.legalDestinations({
    startHexId: 'J5', mpa: 1, stance: M.STANCE.STANDING, terrainByHexId: flat,
    edgeFeatures: { [key('J5', n0)]: 'wall' },
  });
  check('with no MP to spare for a detour, a wall does make the neighbour unreachable',
        !noDetour[n0]);
  const open = M.legalDestinations({
    startHexId: 'J5', mpa: 1, stance: M.STANCE.STANDING, terrainByHexId: flat,
  });
  check('with no wall, that same 1-MP step is legal', !!open[n0] && open[n0].cost === 1);

  // §11/3's arithmetic, reproduced exactly: interior hex (1) + aperture (1) = 2 MP.
  const intoBuilding = Object.assign({}, flat, { [n0]: 'interior' });
  const viaWindow = M.legalDestinations({
    startHexId: 'J5', mpa: 4, stance: M.STANCE.STANDING, terrainByHexId: intoBuilding,
    edgeFeatures: { [key('J5', n0)]: 'aperture_window' },
  });
  check('entering an Interior hex across a window costs 2 MP (1 hex + 1 aperture)',
        viaWindow[n0] && viaWindow[n0].cost === 2);

  const halvedMpa = M.legalDestinations({
    startHexId: 'J5', mpa: 1, stance: M.STANCE.STANDING, terrainByHexId: intoBuilding,
    edgeFeatures: { [key('J5', n0)]: 'aperture_window' },
  });
  check('§11/3: a soldier with only 1 MP cannot cross a window to enter the hex',
        !halvedMpa[n0]);

  // A crouching crawl spends the whole MPA "regardless of the terrain in the hex entered",
  // so the aperture surcharge cannot stack on top of it — but a wall still stops him.
  const crawlWall = M.legalDestinations({
    startHexId: 'J5', mpa: 4, stance: M.STANCE.CROUCHING, terrainByHexId: flat,
    edgeFeatures: { [key('J5', n0)]: 'wall' },
  });
  check('a crouching crawl cannot cross a wall either', !crawlWall[n0]);
  const crawlWindow = M.legalDestinations({
    startHexId: 'J5', mpa: 4, stance: M.STANCE.CROUCHING, terrainByHexId: intoBuilding,
    edgeFeatures: { [key('J5', n0)]: 'aperture_window' },
  });
  check('a crouching crawl through a window still costs exactly his whole MPA',
        crawlWindow[n0] && crawlWindow[n0].cost === 4);
})();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);

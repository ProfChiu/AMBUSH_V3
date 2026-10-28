#!/usr/bin/env node
/*
 * tools/test_los.js — Phase 5 line-of-sight rules test harness (docs/17_LOS.md)
 *
 * "Replay the rulebook's own LOS examples as regression tests" — same approach as
 * tools/test_movement.js. The rulebook's five worked LOS examples (§8, "LOS Nr. 1-5")
 * are diagrammed on Map B, which this project has no terrain/elevation database for
 * (only Map A went through the classify+correct+LOS-review pipeline). Reproducing the
 * exact diagrams pixel-for-pixel isn't the point anyway — what matters is that the
 * *rule* each example demonstrates is implemented correctly. So each test below builds
 * a small synthetic elevation/terrain/hexside fixture, on the real Map A grid topology
 * (for real adjacency), that isolates one clause of the rule and checks the engine
 * reaches the same verdict the rulebook states for that example. Every fixture quotes
 * the exact rulebook "why" text it's checking (same wording already encoded in
 * apps/trainer/ambushdata.js's LOS_EXAMPLES, cross-checked against the rulebook's own
 * diagrams at source/converted/Ambush_Rules_with_Errata_R2_images/*-p18/19/20-*.png).
 *
 * LOS Nr. 3 (building apertures) WAS excluded while that logic was deferred. It is now built
 * (§8/2 BUILDING HEXES) and is covered below, against the stance table the rulebook's own
 * summary sheet states (source/pdf/Ambush_LOS_Aid.pdf), plus the real Map A buildings.
 *
 * Run:  node tools/test_los.js
 */

const path = require('path');

const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/hexgrid.js'));
require(path.join(ROOT, 'apps/game/losrules.js'));
const G = window.AmbushHexGrid;
const LOS = window.AmbushLOS;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log('FAIL —', label); }
}

// A straight 7-hex corridor (real Map A adjacency) with default elevation 1 / terrain
// 'clear1' / no hexside features, so a test only has to specify what's different.
const CORRIDOR = ['J5', 'J6', 'J7', 'J8', 'J9', 'J10', 'J11'];

function fixture(elevOverrides, terrainOverrides, edgeOverrides) {
  const elevationByHexId = {};
  const terrainByHexId = {};
  CORRIDOR.forEach((id) => { elevationByHexId[id] = 1; terrainByHexId[id] = 'clear1'; });
  Object.assign(elevationByHexId, elevOverrides);
  Object.assign(terrainByHexId, terrainOverrides);
  return { elevationByHexId, terrainByHexId, edgeFeatures: edgeOverrides || {} };
}

function edgeKeyOf(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

function trace(fromId, toId, fx, fromStance, toStance) {
  return LOS.traceLOS({ fromId, toId, elevationByHexId: fx.elevationByHexId,
                         terrainByHexId: fx.terrainByHexId, edgeFeatures: fx.edgeFeatures,
                         fromStance, toStance });
}

// Sanity check the corridor really is a straight 7-hex line before trusting any fixture
// built on top of it.
const corridorPath = LOS.hexLine('J5', 'J11').map((s) => s.hexId);
check('corridor is the expected straight line', JSON.stringify(corridorPath) === JSON.stringify(CORRIDOR));

// ---------------------------------------------------------------------
// LOS Nr. 1 — hexes at different elevations (§8/2 ELEVATIONS)
// ---------------------------------------------------------------------
{
  // "The terrain in S13 and T12 is higher than the hexes occupied by A and B" -> blocked.
  const fx = fixture({ J7: 2 }, {});
  check('Nr.1 A→B: hex higher than both sighting hexes blocks', trace('J5', 'J9', fx).blocked);
}
{
  // "The terrain between them is lower, or at the same height, with no blocking terrain" -> clear.
  // Sighters at different elevations; intervening hex matches the *higher* one exactly
  // (not exceeding it) — same height is explicitly fine, only strictly-higher blocks.
  const fx = fixture({ J5: 1, J7: 2, J9: 2 }, {});
  check('Nr.1 C→D: intervening hex same height as higher sighter stays clear', !trace('J5', 'J9', fx).blocked);
}

// ---------------------------------------------------------------------
// LOS Nr. 2 — embankment hexsides (§8/2 EMBANKMENT HEXSIDES)
// ---------------------------------------------------------------------
{
  // "The embankment... is higher than B, but not adjacent to A" -> blocked.
  // Embankment sits between J7 (low side) and J8 (high side, elev 2) — not touching
  // either sighting hex (J5/J9), so the "adjacent to the higher hex" exception can't apply.
  const fx = fixture({ J5: 1, J7: 1, J8: 2, J9: 2 }, {}, { [edgeKeyOf('J7', 'J8')]: 'embankment' });
  check('Nr.2 A→B: embankment higher than the low hex, not touching the high hex, blocks',
        trace('J5', 'J9', fx).blocked);
}
{
  // "The embankment between the two is adjacent to D" -> clear.
  // Same elevation setup, but the embankment now sits on the edge touching the higher
  // sighting hex (J8/J9) directly.
  const fx = fixture({ J5: 1, J7: 1, J8: 2, J9: 2 }, {}, { [edgeKeyOf('J8', 'J9')]: 'embankment' });
  check('Nr.2 D→B: embankment adjacent to the higher sighting hex does not block',
        !trace('J5', 'J9', fx).blocked);
}
{
  // "Both are at the same elevation, and the embankments have no effect" -> clear.
  const fx = fixture({ J5: 1, J9: 1 }, {}, { [edgeKeyOf('J7', 'J8')]: 'embankment' });
  check('Nr.2 C→D: embankment has no effect when both sighting hexes share an elevation',
        !trace('J5', 'J9', fx).blocked);
}

// ---------------------------------------------------------------------
// LOS Nr. 4 — forest, brush, rubble, rough (§8/2 FOREST, BRUSH, RUBBLE, AND ROUGH HEXES)
// ---------------------------------------------------------------------
{
  // "Blocked by the brush in hex S2, because it is at the same elevation" -> blocked,
  // unconditionally, whenever both sighting hexes share an elevation.
  const fx = fixture({ J5: 1, J9: 1 }, { J7: 'brush' });
  check('Nr.4 A→B: blocking terrain always blocks when sighters share an elevation',
        trace('J5', 'J9', fx).blocked);
}
{
  // §8/2: "blocked if the LOS enters a hex adjacent to either the sighting or target hex
  // containing [blocking terrain] at the same elevation" — case where the blocking hex
  // sits next to the (higher) sighting hex.
  const fx = fixture({ J5: 2, J9: 1 }, { J6: 'woods' }, {});
  Object.assign(fx.elevationByHexId, { J6: 2 }); // matches J5's elevation, adjacent to J5
  check('Nr.4 A→C: blocking terrain adjacent to the sighting hex, same elevation, blocks',
        trace('J5', 'J9', fx).blocked);
}
{
  // Symmetric case: blocking hex adjacent to the *target* hex instead, same elevation as it.
  const fx = fixture({ J5: 1, J9: 2 }, { J8: 'woods' });
  fx.elevationByHexId.J8 = 2; // matches J9's elevation, adjacent to J9
  check('Nr.4 B→C: blocking terrain adjacent to the target hex, same elevation, blocks',
        trace('J5', 'J9', fx).blocked);
}
{
  // "D is not adjacent to a woods hex, so the LOS from B to D passes over the woods in S3
  // and is clear" — blocking hex in the middle of the corridor, not adjacent to either end.
  const fx = fixture({ J5: 1, J9: 2 }, { J7: 'woods' });
  check('Nr.4 B→D: blocking terrain not adjacent to either sighting hex does not block',
        !trace('J5', 'J9', fx).blocked);
}
{
  // §8/2: "A hex that is adjacent to the sighting or target hex but at a lower elevation
  // does not block LOS (the LOS passes over the top of the blocking terrain)."
  const fx = fixture({ J5: 1, J9: 3 }, { J8: 'woods' });
  fx.elevationByHexId.J8 = 2; // adjacent to J9 (elev 3), but lower than it
  check('Nr.4: blocking terrain adjacent to a sighting hex but lower than it does not block',
        !trace('J5', 'J9', fx).blocked);
}

// ---------------------------------------------------------------------
// LOS Nr. 5 — elevation changes without embankments (§8/2 ELEVATIONS)
// ---------------------------------------------------------------------
{
  // "The LOS between A and B is clear, even though neither is adjacent to the elevation
  // change at W12/X12." A plain elevation transition (smooth slope), no embankment.
  const fx = fixture({ J5: 1, J6: 1, J7: 1, J8: 2, J9: 2, J10: 2, J11: 2 }, {});
  check('Nr.5 A→B: an elevation change alone (no embankment) never blocks',
        !trace('J5', 'J11', fx).blocked);
}
{
  // "If W12/X12 were an embankment hexside, the LOS would be blocked." Same transition,
  // now with an embankment at the (non-adjacent-to-either-end) transition edge.
  const fx = fixture({ J5: 1, J6: 1, J7: 1, J8: 2, J9: 2, J10: 2, J11: 2 }, {},
                      { [edgeKeyOf('J7', 'J8')]: 'embankment' });
  check('Nr.5 variant: the same transition as an embankment, not touching either end, blocks',
        trace('J5', 'J11', fx).blocked);
}

// ---------------------------------------------------------------------
// Baseline sanity check against the real, user-reviewed Map A LOS data
// ---------------------------------------------------------------------
{
  const losDb = require(path.join(ROOT, 'assets/data/los_map_a.json'));
  const elevationByHexId = {}, terrainByHexId = {};
  Object.keys(losDb.hexes).forEach((id) => {
    elevationByHexId[id] = losDb.hexes[id].elevation != null ? losDb.hexes[id].elevation : 1;
    terrainByHexId[id] = losDb.hexes[id].terrain;
  });
  const edgeFeatures = LOS.buildEdgeFeatures(losDb.hexes);
  // A soldier can always see his own hex's immediate neighbor — no intervening hexes exist
  // to block anything.
  const nbr = G.neighbors(G.parseId('J10').colIdx, G.parseId('J10').rowIdx)[0];
  const adjacentResult = trace('J10', nbr.id, { elevationByHexId, terrainByHexId, edgeFeatures });
  check('real Map A data: adjacent hexes are always in sight (no intervening hex to block)',
        !adjacentResult.blocked);
}

// ---------------------------------------------------------------------
// LOS Nr. 3 — §8/2 BUILDING HEXES: walls, apertures, and the stance table
// ---------------------------------------------------------------------
{
  // "An LOS can never be traced into a building hex across a non-aperture hexside."
  const fx = fixture({}, { J7: 'interior' }, { [edgeKeyOf('J6', 'J7')]: 'wall' });
  check('a wall hexside blocks sight into the building, even between adjacent hexes',
        trace('J6', 'J7', fx).blocked && trace('J6', 'J7', fx).reason === 'wall');
  check('a wall blocks in both directions', trace('J7', 'J6', fx).blocked);
}
{
  // The aid's stance table, checked one cell at a time. Window, soldier inside at J7.
  const fx = fixture({}, { J7: 'interior' }, { [edgeKeyOf('J6', 'J7')]: 'aperture_window' });
  check('window: standing inside sees the adjacent hex', !trace('J7', 'J6', fx, 'standing', 'standing').blocked);
  check('window: prone inside "can\'t see/be seen from outside"',
        trace('J7', 'J6', fx, 'prone', 'standing').blocked);
  check('window: prone inside is blocked whichever end asks (LOS is symmetric)',
        trace('J6', 'J7', fx, 'standing', 'prone').blocked);
  check('window: crouching inside cannot see a CROUCHING soldier in the adjacent hex',
        trace('J7', 'J6', fx, 'crouching', 'crouching').blocked);
  check('window: crouching inside cannot see a PRONE soldier in the adjacent hex',
        trace('J7', 'J6', fx, 'crouching', 'prone').blocked);
  check('window: crouching inside CAN see a standing soldier in the adjacent hex',
        !trace('J7', 'J6', fx, 'crouching', 'standing').blocked);
}
{
  // Door: "sees all FOV hexes" for any stance, except prone, which sees only an adjacent target.
  const fx = fixture({}, { J7: 'interior' }, { [edgeKeyOf('J6', 'J7')]: 'aperture_door' });
  check('door: prone inside sees a target ADJACENT to the door',
        !trace('J7', 'J6', fx, 'prone', 'standing').blocked);
  check('door: crouching inside sees the adjacent hex (unlike a window)',
        !trace('J7', 'J6', fx, 'crouching', 'crouching').blocked);
  check('door: prone inside does NOT see a non-adjacent target',
        trace('J7', 'J5', fx, 'prone', 'standing').blocked);
  check('door: standing inside DOES see a non-adjacent target',
        !trace('J7', 'J5', fx, 'standing', 'standing').blocked);
}
{
  // "an LOS cannot be traced THROUGH a building hex at the same elevation as both sighting hexes"
  const fx = fixture({}, { J7: 'interior' },
                     { [edgeKeyOf('J6', 'J7')]: 'aperture_door', [edgeKeyOf('J7', 'J8')]: 'aperture_door' });
  check('a building hex blocks sight passing through it, apertures on both sides notwithstanding',
        trace('J5', 'J9', fx).blocked);
}
{
  // The real map, which is the point of the whole exercise: Map A's two buildings.
  const losDb = require(path.join(ROOT, 'assets/data/los_map_a.json')).hexes;
  const elevationByHexId = {}, terrainByHexId = {};
  Object.keys(losDb).forEach((id) => {
    terrainByHexId[id] = losDb[id].terrain;
    elevationByHexId[id] = losDb[id].elevation == null ? 1 : losDb[id].elevation;
  });
  const edgeFeatures = LOS.buildEdgeFeatures(losDb);
  const fx = { elevationByHexId, terrainByHexId, edgeFeatures };

  check('Map A: K13, L13 and T8 are building interiors',
        ['K13', 'L13', 'T8'].every((id) => terrainByHexId[id] === 'interior'));
  check('Map A: the two buildings actually produce wall hexsides',
        Object.values(edgeFeatures).filter((f) => f === 'wall').length > 0);

  // T8 (wooden building): windows to T7 and S9, door to T9, walls to S8/U8/U9.
  check('T8 -> U8 is blocked by a wall', trace('T8', 'U8', fx).blocked);
  check('T8 -> S8 is blocked by a wall', trace('T8', 'S8', fx).blocked);
  check('T8 -> T9 is clear through the door', !trace('T8', 'T9', fx).blocked);
  check('T8 -> S9 is clear through a window when standing', !trace('T8', 'S9', fx, 'standing').blocked);
  check('T8 -> S9 is blocked through the window when prone inside',
        trace('T8', 'S9', fx, 'prone', 'standing').blocked);

  // K13/L13 (stone building) share an open internal hexside and must still see each other.
  check('K13 and L13 are one building: the hexside between them is open',
        !trace('K13', 'L13', fx).blocked);
  check('K13 -> K12 is blocked by a wall', trace('K13', 'K12', fx).blocked);
  check('K13 -> J13 is clear through its window', !trace('K13', 'J13', fx).blocked);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

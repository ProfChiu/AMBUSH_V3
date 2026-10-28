# 17 — Line of Sight rules engine (Phase 5, part 1)

**Date:** 2026-07-31
**Phase:** 5 — Terrain DB completion + Line of Sight (`docs/11_GAME_BUILD_PHASES.md`) — **engine,
tests, and interactive sandbox all built; data 100% complete**.
**Follows:** the user's manual elevation/hexside review pass (session 18-19,
`assets/data/los/README.md`), merged into `assets/data/los/hex_los_data.csv` and compiled to
`assets/data/los_map_a.json`/`.js` via `tools/compile_los_json.py`. The last 3 elevations and 1
unresolved hexside marker were filled in via direct pixel-color sampling against
`assets/library/map/map_a_tactical.png` (session 20 — see `assets/data/los/README.md`), not a human
eyes-on check — flagged there for the user to override if anything looks wrong.

**Deliverables:** `apps/game/losrules.js` (pure LOS-tracing engine), `tools/test_los.js` (14-case
regression suite), `tools/compile_los_json.py` (LOS data compiler), `apps/game/lossandbox.html` +
`lossandboxdemo.js` (interactive visualizer).

---

## 1. Scope

§8 (Line of Sight): tracing a straight line between two hex centers (§8/1), and the blocking rules
in §8/2 — general elevation blocking, crest hexsides, embankment hexsides, and forest/brush/rubble/
rough hexes (both same- and different-elevation cases).

**Deliberately out of scope**, same call made in session 18: building-aperture fields of view
(§8/2 "Building Hexes" — door/window sight cones, stance restrictions, the "one hex across a
non-adjacent aperture" rule). Genuinely more complex than a flat blocking check, and Map A only has
two buildings — better done as a direct hands-on pass than folded in here. Building hexes are
conservatively treated as **always blocking** when intervening: stricter than the real rule (which
sometimes allows sight through an aperture), never looser, so it can't produce a false "clear" in
the meantime. Vehicle LOS (§8/2 "LOS INTO/OUT OF VEHICLES") is also out of scope — no vehicles yet.

---

## 2. LOS engine (`apps/game/losrules.js`)

Pure logic, no DOM, depends only on `hexgrid.js`.

**Tracing:** standard cube-coordinate lerp+round hex-line algorithm (`hexLine`) — exact for a
regular hex grid, which this one is (verified: `hexgrid.js`'s fitted `col_pitch`/`row_pitch` match
the ratio a true regular flat-top hex requires). Handles §8/1's "exactly bisects two hexes" case by
detecting near-ties in the rounding step and carrying both candidate hexes forward; `traceLOS` tries
every resulting candidate path and returns clear if *any* of them is — matching the rule that only
one of the two bisected hexes needs to be non-blocking.

**Blocking rules (`evaluatePath`), in order:**
1. Any intervening hex with elevation higher than *both* sighting hexes blocks — terrain-independent
   (§8/2 "ELEVATIONS").
2. Forest/Brush/Rubble/Rough: always blocks if both sighting hexes share an elevation; if they
   differ, blocks only if the hex is adjacent to the sighting or target hex *and* at that same hex's
   elevation (adjacent-but-lower passes over it; not-adjacent is never blocked by it).
3. Building hexes: always block (deferred aperture model, see above).
4. Crest hexsides: always block, unconditionally.
5. Embankment hexsides: no effect if both sighting hexes share an elevation. Otherwise, an
   embankment at or below the *lower* sighting hex's elevation never blocks; above it, it blocks
   unless the hexside directly touches the *higher* sighting hex.

Hexside features come from `buildEdgeFeatures`, which reads the `sides` map `tools/compile_los_json.py`
produces per hex (itself sourced from the user's `side_N`/`side_NE`/.../`side_S` CSV columns) and
resolves each into an undirected edge lookup keyed by the two hex IDs it sits between.

---

## 3. Test harness (`tools/test_los.js`) — 14/14 passing

The rulebook's five worked LOS examples ("LOS Nr. 1-5", §8) are diagrammed on **Map B**, which this
project has no terrain/elevation database for — only Map A went through the classify + correct +
LOS-review pipeline. Reproducing those diagrams pixel-for-pixel isn't actually what proves the engine
correct anyway (same reasoning `tools/test_movement.js` already used for its synthetic fixtures).
Instead, each test builds a small synthetic elevation/terrain/hexside fixture on a real 7-hex Map A
corridor (real adjacency, synthetic data) that isolates one clause of the rule being demonstrated,
and checks the engine reaches the rulebook's stated verdict — quoting the exact "why" text from
`apps/trainer/ambushdata.js`'s `LOS_EXAMPLES` (already cross-checked against the rulebook's own
diagram images at `source/converted/.../*-p18/19/20-*.png` when this harness was built). Nr. 3
(building apertures) is excluded — that logic is deferred.

Covers: Nr.1 (higher-than-both blocks; same-height-as-higher-sighter stays clear), Nr.2 (all three
embankment clauses — not-adjacent-to-high blocks, adjacent-to-high clears, same-elevation has no
effect), Nr.4 (same-elevation always blocks; different-elevation blocks only when adjacent-and-
same-elevation, symmetric on both the sighter and target side; not-adjacent and adjacent-but-lower
both stay clear), Nr.5 (a plain elevation change never blocks; the same change *as an embankment*,
touching neither sighting hex, does). Plus one sanity check against the real, user-reviewed Map A
LOS data: adjacent hexes are always in sight (no intervening hex exists to block them).

---

## 4. Interaction (`apps/game/lossandbox.html` + `lossandboxdemo.js`)

Real Map A, the real reviewed LOS dataset, the real rules engine — no demo/placeholder data at all
(unlike the movement sandbox's roster and paragraph triggers, this page is a pure rules
visualization tool, not a gameplay demo).

**Flow:** click any hex to place the sighter (amber "S" marker) → `AmbushLOS.visibilityFrom` sweeps
every one of the other 474 hexes in one pass and shades each green (visible) or red (blocked) →
click any shaded hex to make it the target ("T" marker); the traced line is drawn (white dashed on
a black halo, colored red/green by verdict) with a dot on every intervening hex, the specific
blocking hex or hexside called out distinctly, and a HUD panel stating CLEAR/BLOCKED plus the exact
rule reason. Toggleable overlays: per-hex elevation numbers, and crest (black)/embankment (tan)
hexside markers — useful both for using the tool and for eyeballing the underlying data (the crest
markers visibly trace the long T14-Y17 ridge line from the session 18 detector, for example).

## 5. Verification

- `node --check` clean on `losrules.js`, `lossandboxdemo.js`, `compile_los_json.py` (via
  `python3 -m py_compile`).
- `tools/test_los.js`: **14/14 passing**. `tools/test_movement.js`: still **41/41 passing**.
- Real headless-Chromium run of the sandbox (Playwright, no project-specific run skill existed yet
  for this repo — see below): loaded with zero console/page errors → clicked a hex (L9, River) as
  sighter → sweep correctly split 212 visible / 262 blocked → clicked a hex (P12, Road) as target →
  correctly CLEAR with the reciprocal-LOS explanation → clicked a hex (A1, Clear L1) that the sweep
  had marked blocked → correctly BLOCKED, naming the exact blocking hex (D3) and quoting the same-
  elevation forest/brush/rubble/rough rule → toggled both display overlays off/on → Clear Selection
  correctly reset all sighter/target/sweep state. Zero console errors across the whole run.
  Screenshots: `docs/17_los_sighter.png`, `docs/17_los_target_blocked.png`.

## 6. Next

Building-aperture LOS (stance-dependent door/window fields of view) is its own future pass — the
engine and sandbox both conservatively treat building hexes as always-blocking in the meantime.
No dedicated `run` skill exists yet for this project (worth generating via `/run-skill-generator`
if UI verification becomes a repeated need).

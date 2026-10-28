# 15 — Terrain Database & Hex Grid Foundation (Phase 4, part 1)

**Date:** 2026-07-28
**Phase:** 4 — First mechanic: troop movement (`docs/11_GAME_BUILD_PHASES.md`)
**Status:** Hex grid + auto-classified terrain DB built and verified. **Checkpoint — stopping here
for your correction pass**, per your call on how to run this phase (auto-classify + review before
movement rules, not build-the-whole-phase-then-review like Phase 3).

**Deliverables:** `apps/game/hexgrid.js` (pure coordinate math), `tools/build_terrain_db.py`
(reproducible classifier), `assets/data/terrain_map_a.json` / `.js` (the data),
`apps/game/hexinspector.html` + `.js` (the review page).

---

## 1. Finding: Map A is 475 hexes, not 500 — and the Mission Cartridge hex space doesn't agree

The phase brief (written before this session) assumed "Map A's 25 columns × 20 rows" and printed
labels "A1…Y20." Both assumptions were checked against the actual map art and turned out to be
half right.

**What's confirmed, precisely:** every hex on the printed map has a small black center dot. I
detected these programmatically (connected-component analysis on near-pure-black pixels, filtered
by size/shape to exclude the gray gridlines, tree-trunk strokes, and text) and least-squares-fit a
regular grid to them. The fit lands **475 of 528 candidate points at sub-2px accuracy** (mean error
0.76px on a 5336×5100px image) — and 475 is exactly 25 columns × **19** rows. The other 53
candidates are false positives (dark terrain art — crest hatching, railroad ties, tree trunks) that
don't fit the grid at all. This isn't a detection gap papered over with a guess; it's a clean,
verified fit with a hard count. I confirmed it by eye too — cropped the bottom-left corner and the
last printed row for both column A and column B is 19; there is no row 20.

**What doesn't match:** the game's Mission Cartridge hex data (the per-mission view-sleeve grid,
docs/19_DATA_LAYER.md) references hex IDs `A-00` through `Y-19` — **25 columns × 20 rows = 500** —
and every one of those 500 rows carries real, distinct, non-blank data (checked column A's full
A-00…A-19 range by hand; no row reads as an obvious placeholder). So the cartridge hex-ID space is
one row per column larger than the physical map.

**What I did about it:** `hexgrid.js`'s `cartridgeIdToPrintedId()` maps cartridge row 19 (the 20th
slot, every column) to `null` and documents why in a comment, rather than guessing which end is
padding. I did not try to resolve this at the time — the phase doc put this in **Phase 6** (data
layer), and guessing wrong here would be worse than leaving it explicitly unresolved. (Resolved in
Phase 6 proper, docs/19_DATA_LAYER.md — the extra row per column was never fully explained, but the
Phase 6 data pipeline reads the cartridge grid directly rather than needing this mapping resolved.)

---

## 2. Hex grid foundation (`apps/game/hexgrid.js`)

Pure logic, no DOM — matches the project's standing convention. Provides:

- **ID parsing both directions:** printed label (`"J5"`) ↔ column/row indices, and cartridge ID
  (`"J-04"`) ↔ printed label, with the row-19 caveat above baked in as a documented `null`.
- **Pixel ↔ hex conversion**, calibrated from the dot-detection fit (§1). Verified: **475/475 hexes
  round-trip to sub-0.1px accuracy** against the terrain database's own recorded pixel centers.
- **Axial coordinates, neighbor lookup, distance** — standard "odd-q" offset formulas (flat-top
  hexagons, odd column indices pushed down half a row, matching how Map A is actually printed).
  Verified: hex `J5` has exactly 6 neighbors, each at distance 1; distance to self is 0.

Grid geometry is a small hardcoded constant block at the top of the file (six numbers), sourced from
`tools/build_terrain_db.py`'s fit — the file says so and says to re-run that tool and copy the
numbers over if the map art is ever re-extracted again.

---

## 3. Terrain auto-classifier (`tools/build_terrain_db.py`)

Movement-subset only, per the phase brief — terrain type and a confidence flag per hex. LOS-specific
fields (apertures, crest/embankment detail) are deliberately not attempted here; that's the LOS
phase's job, and the brief says to reserve the schema, not fill it in.

**Method:** sample a patch at each hex's fitted pixel center, compare its median color against a
small reference palette hand-sampled from known ground-truth hexes on the real map (not the legend
thumbnail — that image is only 340×425px, too low-res to trust), plus one heuristic pass to split
Brush/Rough (sparse speckle on a mostly-light hex) from Cover/Clear (solid fill) by checking what
fraction of the patch is near-white background.

**Result over 475 hexes:**

| Terrain | Count | | Confidence | Count |
|---|---|---|---|---|
| Clear L1 | 135 | | High | 331 |
| Clear L2 | 118 | | Medium | 75 |
| Cover | 83 | | Low | 69 |
| Woods | 47 | | | |
| Clear L3 | 44 | | | |
| Water (River/Stream) | 43 | | | |
| Brush | 5 | | | |
| Rough | 0 | | | |

**Known weaknesses, by design left for the correction pass rather than over-engineered away:**

> **Buildings: corrected 2026-09-07 (`docs/53_BUILDINGS.md`).** K13, L13 and T8 are now set to
> `interior` by hand, with the two buildings' wall/window/door hexsides in the LOS dataset. Note the
> prediction below did **not** hold for them: they were recorded as `clear2` with
> `confidence: "high"`, so they never reached the low-confidence review queue this section expects
> to catch such hexes. Worth remembering before trusting a confidence score for any terrain the
> classifier has no reference colour for. Road/Railroad/Crater/Rubble remain unclassified.

- **Road, Dirt Road, Bridge, Ford, Building, Interior, Second Story, Railroad, Crater, Rubble are
  not classified at all** — the auto-classifier only has reference colors for the solid/textured
  *fill* terrain types (Clear ×3, Cover, Brush, Rough, Woods, Water). Hexes with these features
  correctly fall out as low-confidence "doesn't match any known color well," which is exactly what
  happened — the low-confidence markers visibly cluster along the diagonal road and around the two
  buildings in the hex-inspector screenshot. The signal is real even without an explicit classifier
  for these categories.
- **Brush vs. Rough is unreliable.** The background-fraction heuristic only caught 5 Brush hexes and
  zero Rough hexes — real counts on the map are almost certainly higher. Any hex the classifier
  called Clear/Cover with medium-to-high texture (the `texture_std` field, visible in the inspector's
  detail panel) is worth a second look even if it isn't flagged low-confidence.
- **River vs. Stream is not distinguished** — the legend renders them identically (one "River/Stream
  Hex" swatch); the rulebook's movement table treats them differently (River is prohibited, Stream is
  2 MP). All 43 water hexes are tagged generically; the correction pass needs to assign the real
  rule-relevant type by hex width/context, which color alone can't resolve.

---

Screenshots: `docs/15_hexinspector_screenshot.png` (full page, legend + map), `docs/15_hexinspector_detail.png`
(a hex selected, detail panel open). Note the red-ringed markers clustering along the diagonal road
and the two buildings — exactly the categories §3 says the classifier can't see.

## 4. Correction pass — `apps/game/hexinspector.html`

Open it in a browser. Each hex is a colored dot at its true map position (color = terrain, red/amber
ring = low/medium confidence). Click a dot to see its diagnostics (auto-guess, color distance,
texture, sampled RGB, computed neighbors) and pick the correct terrain from the dropdown — the full
movement-relevant vocabulary is offered, not just the 8 the classifier can detect. "Next
low-confidence hex" walks the queue in confidence order. Corrections persist to `localStorage`
automatically (survives a reload — verified) and "Show corrected JSON" dumps the full 475-hex export
including a `corrections_applied` count, for you to paste back over
`assets/data/terrain_map_a.json`/`.js` when the pass is done (this page doesn't write the file
itself — no server, no filesystem write from a `file://` page).

**Suggested order:** clear the low-confidence queue first (69 hexes) — that's where Road/Building/
Bridge/Ford and most real misclassifications live — then spot-check the "medium" bucket (75 hexes,
mostly the Brush/Rough split) at your discretion.

---

## 5. Verification

- `node --check` clean on `hexgrid.js`, `hexinspector.js`, and the generated `terrain_map_a.js`.
- `hexgrid.js`: 475/475 pixel round-trip, neighbor/distance sanity, TAB-ID mapping — all checked
  against the terrain database directly (see §2).
- Real headless-Chromium run of `hexinspector.html`: 475 markers rendered, click → detail panel,
  terrain correction → marker updates + count increments, export → valid JSON with the correction
  applied, reload → correction still present via `localStorage`. **Zero console/page errors.**
- Asset/script path sweep: all four `src` references resolve.

## 6. Gate

Per your chosen checkpoint: **stopping here.** Please run the correction pass in
`apps/game/hexinspector.html`, especially the low-confidence queue (Road/Building/Bridge/Ford hexes
the classifier can't see at all). Once you're satisfied with the terrain data (or want to hand back
a corrected export), movement rules (§7, §5/3, §6/7), the select/plan/move interaction, and the
rulebook-example test harness pick up from there.

---

## Addendum — 2026-07-29: map re-cropped, grid and terrain DB recalibrated

User made an aesthetic pass on the map art in Photoshop (`map_a_tactical_v2.png`, later renamed to
replace `map_a_tactical.png` at its canonical path): hex content shifted 135px left, 125px trimmed
off both top and bottom (height 5100 → 4850, width unchanged at 5336). No hexinspector.html
corrections existed yet at the time, so nothing needed to be preserved across the swap.

**Recalibrated cleanly** — confirmed by a fresh dot-detection fit against the new image:
`col_pitch`/`row_pitch`/`offset_y_odd` all landed **identical** to the pre-crop values (203.27294...,
235.44444..., 117.0), confirming this was a pure translation/trim, not a rescale.
`origin_x` shifted by exactly −135 (354.34 → 219.34) and `origin_y_even` by exactly −125
(372.5 → 247.5), matching the stated edit precisely. Grid is still 25×19=475 hexes — nothing about
the hex ID space changed, only where those hexes sit in the image. `apps/game/hexgrid.js`'s `GRID`
constants and `MAP_HEIGHT` were updated accordingly.

**Bug found and fixed in `tools/build_terrain_db.py`'s `fit_grid()`:** the "clean detection zone" used
to isolate reliable dot candidates from noisy terrain-art false positives was a **hardcoded absolute
pixel cutoff** (`x < 3850`), left over from the original framing. Once content shifted left, that
cutoff silently swallowed part of the noisy region, corrupted the column-spacing fit, and crashed
with an out-of-bounds index (`origin_y_even` computed from an empty match set). Replaced with a
framing-independent method: cluster all detected columns, then take the longest contiguous run whose
spacing falls in a physically plausible single-column-pitch range (150–260px) — robust to wherever
the map's noisy region happens to sit, not tied to one specific crop.

Terrain database regenerated fresh (`tools/build_terrain_db.py`) against the new geometry — **terrain
distribution and confidence counts came back byte-identical** to the pre-crop run (135/118/83/47/44/
43/5 by type, 331/75/69 by confidence), confirming the same real-world hexes were correctly tracked
through the recrop. `apps/game/mainscreen.html`, `movementsandbox.html`, and `hexinspector.html` had
their hardcoded `aspect-ratio` CSS updated from `5336/5100` to `5336/4850`.

Verified: `hexgrid.js` 475/475 pixel round-trip against the fresh terrain data; `tools/test_movement.js`
41/41 still passing (hex-ID-based, correctly decoupled from raw pixel geometry); `verify_assets.py`
clean; real headless-Chromium check of all three screens — correct aspect ratio, zero console errors,
all markers/counters visually aligned to hex centers.

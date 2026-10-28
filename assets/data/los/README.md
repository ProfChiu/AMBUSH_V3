# Phase 5 manual data — Line of Sight

Starter CSVs for the user's manual pass, generated 2026-07-29. Neither is a rules authority until
reviewed — see `docs/15_TERRAIN_DB.md` / `docs/16_MOVEMENT.md` for how the movement-phase data
these build on was produced and verified.

**Status (2026-07-31): `hex_los_data.csv` fully filled in, 475/475 hexes.** Merged in via
`tools/apply_los_terrain_corrections.py`. 6 of the original 9 blank elevations were resolved
automatically from unanimous neighbor agreement (C16, D1, D2, D4, O16, T10, via
`apps/game/hexgrid.js` neighbor lookup); the remaining 3 (`C19`, `D6`, `D7`) had disagreeing
neighbors — real elevation-zone boundaries — so were resolved instead by directly sampling
`assets/library/map/map_a_tactical.png` pixel colors against the same elevation reference RGBs
`tools/build_terrain_db.py` uses for Clear hexes (white/pale-yellow/olive), giving a decisive,
near-unanimous color match in each case (C19→1, D6→1, D7→2 — see `tools/test_los.js`'s git
history for the one-off sampling script if this needs redoing). The one leftover marker, `A5`
side_S `embank?`, was checked the same way — visually cropped the actual map art at that hexside
and it's ordinary woods-edge fringe art (brown boundary ticks), not a real embankment; cleared,
with a note left in the `notes` column. **None of this replaces an eyes-on check if you spot
something off** — it's pixel-color inference, not a human confirming the art. Terrain corrections
found during the pass (82 hexes, mostly Water→Road/River —
the auto-classifier's known blind spot per `docs/15_TERRAIN_DB.md` — plus a few
Clear→Woods/Brush) were also merged into `assets/data/terrain_map_a.json`/`.js`, the movement
app's terrain source, using the same `terrain_guess`/`terrain_corrected_from`/`reviewed` shape
`apps/game/hexinspector.js` already exports, so it reads as a normal correction pass to any code
that consumes it. `M12` ("bridge/river" in the LOS csv) is recorded as `river` for LOS purposes
(bridges don't block sight) and as the existing `bridge` terrain type in the master DB. Building
aperture fields at `L13` were also filled in by hand (`window`/`doorway`/`building` per side) —
still ad hoc, not the `aperture_door`/`aperture_window` vocabulary below; reconcile when the
aperture LOS logic is actually built.

## `hex_los_data.csv` — the one to actually fill in (475 rows)

Combines elevation and hexside candidates into a single sheet, one row per hex, so there's no
cross-referencing two files. Columns: `hex_id`, `terrain` (reference), `elevation` (fill in the
178 blanks), then six hexside columns `side_N`/`side_NE`/`side_SE`/`side_S`/`side_SW`/`side_NW` —
standard flat-top-hex compass directions, same order for every hex regardless of column parity.
Each hexside cell is pre-filled with `crest?` or `embank?` (plus a `[bld]`/`[brush]` flag — see
below) wherever the auto-detector found a candidate, blank where it found nothing, or `-` where
that hex has no neighbor in that direction (map edge). Overwrite each cell with what you actually
see: leave the `?` version if confirmed, clear it if it's a false positive, or type in the correct
feature (`crest`, `embankment`, `aperture_door`, `aperture_window`, `wall`) if you spot one the
detector missed. A `notes` column is included for anything that doesn't fit a single word.

Regenerate with `python3 tools/compile_los_csv.py` (reads the two files below — overwrites this
file, so save your filled-in progress elsewhere first if you've started).

The two files it's built from, kept for reference / regeneration:

### `hex_elevation.csv` — one row per hex (475 rows)

| Column | Meaning |
|---|---|
| `hex_id` | printed map label, e.g. `J5` |
| `elevation` | `1`/`2`/`3`. **Pre-filled for all 297 Clear hexes** (the color already encodes the level — Clear L1/L2/L3). **Blank for the other 178 hexes** (Woods, Brush, Cover, Building, etc.) — fill in by checking which color zone (white/pale-yellow/olive) the hex sits in. |
| `terrain` | pre-filled from the existing (approved) terrain database, for reference/cross-check while you're looking at each hex. Leave as-is unless you spot a real misclassification. |

Regenerate with `python3 tools/export_hex_elevation_csv.py` if the underlying terrain database
ever changes (overwrites this file — save your work elsewhere first if you've started filling it in).

### `hexsides_candidates.csv` — auto-detected candidates, sparse (401 rows)

One row per hexside where the art color-matched Crest (near-black hatching) or Embankment
(brown/tan hatching) closely enough to flag. Every hexside *not* listed here had no match at all.

| Column | Meaning |
|---|---|
| `hex_a`, `hex_b` | the two hexes sharing that edge, matching the rulebook's own notation style (e.g. "the embankment at Q16/Q17") |
| `feature` | `crest` or `embankment` |
| `confidence` | fraction of the sampled patch matching the reference color — higher isn't strictly "more likely real," see caveats below |
| `near_building` | `yes` if either hex touches one of Map A's two Stone Buildings (near T9 and L12/L13) — their outline art reads as false-positive embankment/crest at nearby hexsides |
| `near_brush_woods_rough` | `yes` if either hex is classified Brush/Woods/Rough — Brush's speckle color in particular sits close enough to the embankment reference to cause real false positives |
| `verified` | empty — yours to mark as you review (e.g. `yes`/`no`/a corrected feature name) |

**Known reliability, from visual spot-checks during generation:**
- **Crest detection is solid** — traced the long ridge line in the T14–Y17 area cleanly, matches the art closely.
- **Embankment detection is noisy**, even after the two flags above. Root cause: brown-toned art
  (tree clusters, brush speckle) sometimes sits right at a hex boundary without the hex's *center*
  being classified as Brush/Woods (the terrain database samples hex centers, not edges), so the
  `near_brush_woods_rough` flag doesn't catch every case. Treat unflagged embankment rows as "worth
  a look here," not "confirmed real" — verify every one against the actual art rather than
  rubber-stamping the high-confidence end of the list.
- Real ground-truth examples (confirmed against the rulebook's own worked LOS example area, R12/R13/S13)
  land in the 0.02–0.19 confidence range — confidence doesn't cleanly separate signal from noise
  (the building false positives score *higher* than genuine ridge hits), so don't use a confidence
  cutoff as a shortcut.

Regenerate with `python3 tools/detect_hexside_features.py` (also overwrites — same caution as above).

## Building apertures — BUILT 2026-09-07 (docs/53_BUILDINGS.md)

The deferral below stood until session 63d. §8/2 is now implemented in full, including the
stance-dependent door/window rules and the one-hex limit across a non-adjacent aperture, and the
wall/aperture hexsides for both buildings live in `hex_los_data.csv` (imported from the v2 file
below, which had them all along and was never the file the JSON is compiled from). The older ad-hoc
`window`/`doorway`/`building` entries at K12 and L13 were cleared as part of that import — they
used a different vocabulary and put doorways on K12, which is not part of any building.

The original note is kept below for the record.

## Not covered here — building apertures (SUPERSEDED)

Field of view for the two buildings' doors/windows is meaningfully more complex than a flat CSV
row (stance-dependent sight cones, the "one hex across a non-adjacent aperture" rule, etc. — see
§8/2 "Building Hexes" in the rulebook). Deferred to a direct hands-on pass once we're looking at
those two specific buildings together, rather than folded into either CSV above.

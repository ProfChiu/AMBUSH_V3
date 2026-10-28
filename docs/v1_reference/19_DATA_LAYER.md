# 19 — Data layer (Phase 6, part 1: paragraphs, missions, mission cards, German roster)

**Date:** 2026-08-01
**Phase:** 6 — Data layer (`docs/11_GAME_BUILD_PHASES.md`) — **all four datasets done and verified.**
The paragraph interpreter itself is next.
**Follows:** `docs/18_DATA_LAYER_SPIKE.md` (the sizing spike) and the same-day follow-up session
where the user provided `reference/` material — a fan-built Excel/VBA companion tool
(`Ambush!_ToolBoxV4.xlsm`), a photographed physical Mission Card, photographed reference charts,
the paragraph booklet PDF with errata, and photographed German soldier/vehicle cards (the user
hand-transcribed the latter into one CSV per card, `reference/character_vehicle_cards_A1/` and
`_A2/`, after the first pass at reviewing the images directly).

**Deliverables:** `tools/compile_reference_data.py`, `tools/verify_reference_data.py` (111/111
passing), `assets/data/paragraphs.json`/`.js`, `assets/data/missions.json`/`.js`,
`assets/data/mission_cards.json`/`.js`, `assets/data/german_roster.json`/`.js`.

---

## 1. A real course correction: reference/ material replaced the old data-file export

The spike (`docs/18_DATA_LAYER_SPIKE.md`) started from an old digitization of the game's data
(paragraphs, mission cards, tables) and found two open questions blocking a correct parser. Both
got resolved not by guessing but by reading further — the rulebook's own §5/6 explained the mystery
`RE` column (Random Event lookup), and the user then provided physical-component photos and the
ToolBox spreadsheet.

That material turned out to be **more accurate than the old export, not just more convenient**. A
systematic comparison of `Amb_M1_C1` (the ToolBox's Mission 1/Condition 1 grid) against the old
export's corresponding data found only 62.6% agreement (313/500 hexes) — and rotating the
photographed physical card upright and reading it directly confirmed **the ToolBox is correct and
the old export has real errors** on over a third of Mission 1's hexes (verified via exact-match spot
checks against the photo, not inference). The old data-file export is retired entirely;
`compile_reference_data.py` reads `reference/Ambush!_ToolBoxV4.xlsm` instead, and per-user
direction all references to it are being removed from the codebase and active docs going forward.

---

## 2. What's extracted (`tools/compile_reference_data.py`)

Scope: the base "Ambush!" game only (missions 1-8) — "Move Out!" and other expansions are in the
workbook but out of the locked project scope.

- **Paragraphs** (`AMBPARAGRAPHS` sheet → `paragraphs.json`): 825 unique numbers from 827 printed
  entries. Two numbers, **46 and 63, each have two genuinely different paragraphs** in the source
  booklet — a real quirk of the physical material, not a transcription error. Both texts are
  preserved (`paragraphs` holds the first/page-order
  text, `duplicates` holds every variant) rather than silently dropping one. Needs a look at
  `reference/Ambush_Paragraph_Booklet_Pages_with_Errata_v1.pdf` to resolve which is canonical, or
  whether both are legitimately live paragraphs.
- **Mission metadata** (`MISSIONTAB` sheet → `missions.json`): name, per-condition Activation Level,
  full briefing text, full victory-condition text, for all 8 base missions.
- **Mission-card grids** (`Amb_M#_C#` sheets → `mission_cards.json`): per mission, per condition, a
  520-entry grid (`A-00`..`Y-19` for the 25×20 cartridge hex space, plus `RE-00`..`RE-19` for the Random
  Event lookup column) → paragraph number, `NONE`, `EVENT`, or a sighting-tagged reference like
  `s3-600`. All 8 base missions' real condition counts came through correctly (Mission 1: 4
  conditions; Missions 2 & 4: 6; Mission 8: 5) — matching `MISSIONTAB`'s own per-condition
  Activation Level data, an independent cross-check within the same source.
- **German soldier/vehicle roster** (`reference/character_vehicle_cards_A1/` + `_A2/`, one CSV per
  card, hand-transcribed by the user from the photographed cards → `german_roster.json`): 47 cards,
  keyed by the card's own `Card ID` (e.g. `"GE 33/V"`). Parsed generically rather than forced into
  one schema — real cards vary structurally: a plain soldier has IN/PC/WS/MPA/Equipment/Notes plus a
  `DIE` → per-`CONDITION`/`SPECIAL` table; a vehicle (e.g. `GE 54/Z`, Jagdpanther) has an `Act Crew`
  table keyed by crew count instead of a die roll; a multi-soldier group card (`GE 19`, Kubelwagen +
  Driver + Officer) has no table at all, just a free-text `Stats` field covering every role. Field
  names are exactly as transcribed, not normalized, since normalizing would have meant guessing a
  common shape these cards don't actually share.

  **Caught a real transcription error by spot-checking against the photo, not by trusting the CSV:**
  `GE 9/R`'s table had a phantom 4th column (`CONDITION 5`, blank on every row — the real card only
  has `CONDITION 3`/`CONDITION 4`/`SPECIAL S`) and one wrong row (`7-8` read `927, 824, 816` in the
  transcription; the photo, cropped and zoomed, clearly reads `800, 809, 816`). Fixed in the CSV and
  guarded with a regression check so it can't silently come back.

---

## 3. Verification (`tools/verify_reference_data.py`) — 111/111 passing

Not just internal consistency — real ground truth. Two full hex-rows and one partial row were read
directly off the upright-rotated photograph of the physical Mission 1/Condition 1 card
(`reference/events.jpg`) and hard-coded as regression assertions: the topmost row (all `NONE` except
`RE` = `012`), the row directly below the card's title line (`325, 024, 325, 325, 181, s3-600,
s3-328, s3-600, 181, 179, 179`, then `NONE` through column Y, `RE` = `s9-348`), and a 3-column spot
check one row up. All match exactly (leading zeros aside — `"012"` on the printed card comes through
as `"12"` since Excel's numeric cells don't preserve them; noted, not a real discrepancy, and
consistent with `paragraphs.json`'s own unpadded number keys). Plus structural checks: paragraph/
mission/duplicate counts, and every mission's condition count and 520-entry grid size.

---

## 4. Next

All four datasets (paragraphs, mission metadata, mission cards, German roster) are built and
verified. **The paragraph interpreter itself** is next — the spike (`docs/18_DATA_LAYER_SPIKE.md`
§5) already categorized what it needs: plain display and straight branches are easy; dice-range
tables need prose parsing; checks (PC/Activation) and whole-procedure references (minefield,
boobytrap) are genuinely blocked on Phase 7 and Phase 9, which don't exist yet.

After that: the paragraph interpreter itself (categories of paragraph logic identified in the spike
— display, branching, dice tables, event-history state are buildable now; checks and whole-procedure
references are blocked on Phase 7/9 as already noted).

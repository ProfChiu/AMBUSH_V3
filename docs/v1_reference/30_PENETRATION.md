# 30 — Penetration (Phase 9, sixth slice — partial)

**Date:** 2026-08-04
**Phase:** 9 — Combat (`docs/11_GAME_BUILD_PHASES.md`) — sixth slice, following core fire combat
(docs/24), grenades (docs/26), assault/capture (docs/27), crew weapons/bazookas (docs/28), and
minefields/boobytraps (docs/29).
**Follows:** `docs/29_HAZARDS.md`.

**Deliverables:** `apps/game/penetrationrules.js`, `tools/test_penetration.js` (31/31 passing).
No changes to `firecombat.js` or `weapon_chart.js` this time — deliberately, see below.

---

## 1. Scope — the half of §13/5 that's text, not chart

§13/5 (walls and vehicles) splits cleanly into two halves. One half is plain rulebook prose with
fixed numbers spelled out directly in the text: the wall hit-by-stance thresholds ("a prone
soldier is hit on a result of 0; a crouching soldier is hit on 0 or 1; a standing soldier is hit
on 0, 1, or 2"), most-exposed-first targeting and its aimed-automatic exception, wall-destroyed
collateral damage ("as if he were hit by semi-automatic rifle fire"), building collapse at two
destroyed walls, and the explosive-vs-non-explosive effect table (light/medium/heavy crossed with
shell type). All of that is in `penetrationrules.js` now, built with the same confidence as every
other slice — nothing here was read off an image or guessed at.

The other half needs the actual Weapon Chart: *which die-roll ranges, for which weapons,
constitute Light/Medium/Heavy Penetration in the first place.* That's not in
`assets/data/weapon_chart.js` — it was never transcribed. This slice does not add it, and the
reasons are worth stating plainly rather than papering over.

## 2. What was found, and why it wasn't transcribed anyway

While tracking down where this data might live, found the real physical Weapon Chart —
`assets/library/reference/firechart.png` — with a Penetration column color-coded (light/medium/
dark blue shading layered over the same K/I/W/P letters already in `weapon_chart.js`) for the
weapons capable of it (Bazooka, PIAT, Tank Main Gun, and apparently some automatic weapons too).
Also checked `reference/Ambush!_ToolBoxV4.xlsm` (the fan-built companion tool this project
already trusts more than the old `.TAB` files) directly via its XML — its `COMBATTAB` sheet turned
out to be a plain dropdown-list reference (weapon names, terrain modifiers, status codes), not a
computed damage table; every other mention of "penetration" in that workbook is mission-specific
prose (an airplane strafing run, a zombie variant rule, bridge-destruction text), not chart data.

So the chart exists, but reliably transcribing which specific die rolls get which shade, for
which weapons, needs closer inspection than was reliable this session — a small, compressed
image and genuinely subtle color distinctions, not a case where "close enough" is good enough.
A wrong transcription here would silently corrupt future wall/vehicle combat results in a way
nobody would notice until it produced an inconsistent outcome. An honest gap is safer than a
guess, so `resolvePenetrationEffect(level, isExplosive)` takes the penetration *level* as
something the caller already determined, rather than reading a die roll and a weapon ID itself —
the function is ready for that data the moment it's transcribed properly; nothing about its
design needs to change when that happens.

**A second, related finding, also not acted on:** the same chart image appears to show *three*
crew-served machine gun rows — Light, Medium, and Heavy — where this project's
`assets/data/weapon_chart.js` only has one (`mmg`), built during `docs/24`'s original extraction
from the trainer. Reading letter-grid text is more reliable than reading color shading, but this
project already caught two real gaps this session alone (docs/27's `ASSAULT_MODS`) from trusting
a summary instead of the source — better to flag this one for a dedicated close look than add
weapon rows under the same time pressure that risks a third.

## 3. Verification

- `node --check` clean on `penetrationrules.js` and `test_penetration.js`.
- `tools/test_penetration.js`: **31/31 passing** — explosive/non-explosive classification, all
  six level×shell-type effect combinations plus the invalid-level throw, all three wall
  hit-by-stance thresholds (including the boundary just past each one), most-exposed-first
  targeting with its own tie-break (explicitly the opposite priority from assault's
  "most-disadvantageous" rule — worth a direct comparison test, not just an isolated one),
  the aimed-automatic override (confirmed it's specifically "aimed *and* automatic," not either
  condition alone), the fixed Semi-Auto-Rifle collateral-damage row, and the building-collapse
  threshold at exactly two destroyed walls.
- Full project regression: **2072 checks passing**, zero failures.

## 4. Next

Finishing this slice properly needs a dedicated close read of `firechart.png` (or the physical
chart itself) for the per-weapon penetration die-roll ranges, and separately, verifying whether
`weapon_chart.js` is really missing LMG/HMG rows or whether "mmg" already correctly represents
one of the three. Beyond that: the Clear Jammed Weapon action's caller, §11/2's deferred
Captured-status mechanics, and a Port Box/equipment-inventory model. Vehicle combat (§17) stays
out of scope regardless, per `docs/11`'s standing decision that Mission 1's Pz IV is scenery.

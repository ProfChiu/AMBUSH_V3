# 26 — Grenades and satchel charges (Phase 9, second slice)

**Date:** 2026-08-04
**Phase:** 9 — Combat (`docs/11_GAME_BUILD_PHASES.md`) — second slice, following core fire combat
(docs/24) and the mechanic-test/UI checkpoint (docs/25). Picked up directly per the phase's own
"Next" list — grenades/satchel charges (§10) was first among the remaining items.
**Follows:** `docs/24_FIRE_COMBAT.md`, `docs/25_MECHANIC_TEST.md`.

**Deliverables:** `apps/game/grenaderules.js`, `assets/data/grenade_scatter.js`,
`tools/test_grenades.js` (64/64 passing), plus additive changes to `apps/game/firecombat.js`
(`resolveXCode`, `resolveClearJamAction`, +11 tests, `tools/test_fire_combat.js` now 83/83) and
`assets/data/weapon_chart.js` (`GRENADE_MODS`, `CLEAR_JAM_CHART`).

---

## 1. Scope — reuse over duplication

§10/1 opens by saying the grenade procedure is "very similar to that used to resolve fire
combat, but differs in a few important ways." Taken literally: `grenaderules.js` reuses
`firecombat.js`'s `resolveRangeBand`, `resolveHitRoll` (the 0-always-hits/9-always-misses rule),
`resolveDamage`, and `escalateDamageResult` directly rather than re-implementing them — the
grenade/satchel weapon-chart rows (`grout`/`grin`/`satout`/`satin`) already have the same
short/med/long range-band shape as any fire-combat weapon. What `grenaderules.js` actually adds
is only what's genuinely different: throw-range limits by the thrower's own stance, a Hit Chance
calculation with **no** terrain/target-stance/aimed-snap shifts (§10/1 step 3 says so
explicitly — "the Fire Combat Modifiers Chart is not used"), a fixed-threshold dud check (not
weapon-specific like a jam check), the Grenade Strike PC Check reaction (§10/2), and scatter
(§10/3).

**In scope:** §10/1 core procedure, §10/2 PC Check reaction, §10/3 scatter (both diagrams),
§10/4 satchel charges (same procedure, different range/weapon-row selection, no separate
mechanic of its own).

**Explicitly deferred, not silently skipped:** throwing through building apertures (building
aperture LOS modeling is already deferred, `docs/17_LOS.md`); grenades/satchel charges thrown
into a vehicle (vehicles are scenery, `docs/11` decision #2); a satchel charge destroying a wall
(§13/5 Penetration, still deferred); the scatter procedure's own "apply common sense" wall-bounce
clarification (§10/3) — genuinely under-specified by the rulebook itself, not just by this
implementation. Not wired into either skirmish demo (`skirmish.html`/`skirmishchess.html`) in
this pass — same precedent as core fire combat, which was built standalone and wired into a demo
in a later session.

## 2. A second data gap closed by the same source image

`assets/library/reference/grenadechart.png` — the chart transcribed for the Scatter Diagrams —
turned out to also carry the **Clear Jammed Weapon Chart** on the same sheet. That chart was an
explicitly flagged, unresolved data gap since `docs/08_RULES_GAP_ANALYSIS.md` §3.4 and reaffirmed
in `docs/24_FIRE_COMBAT.md` §1 ("nothing invents numbers for clearing it"). Transcribed it
alongside the scatter data: `CLEAR_JAM_CHART` in `assets/data/weapon_chart.js`, resolved by the
new `firecombat.resolveClearJamAction(weaponSkill, roll, chart)`. Not otherwise wired into
anything yet (no caller needs it until a "Clear Jammed Weapon" action exists at the UI/demo
level) — the gap is closed at the data layer, matching how `ar_track.js`/`weapon_chart.js`
themselves sat unused for a session before their first real caller showed up.

Also extracted `GRENADE_MODS` from `apps/trainer/ambushdata.js` into the shared
`weapon_chart.js`, same relocation pattern as every other chart this project has moved
(`docs/23`, `docs/24`) — hand-transcribed and already trainer-verified, just needed to become
reachable from `apps/game/`.

## 3. The scatter diagram's geometry — proven, not guessed

§10/3's two diagrams describe *relative* geometry (a ring of six hexes around the target, keyed
off "the direction of throw"), not absolute compass directions — the diagram has to be mentally
rotated to match each real throw. Two things had to be pinned down to turn that into working
code, and both were resolved with evidence rather than assumption:

**Which real map hex is "the direction of throw."** `apps/game/losrules.js`'s `hexLine(fromId,
toId)` — already built for LOS tracing — returns the full ordered hex path between two hexes,
including a `{hexId, altHexId}` per step where `altHexId` is only non-null at an exact
bisection point. The second-to-last step of that path (the hex adjacent to the target, on the
line from the thrower) **is** the direction-of-throw hex, and a non-null `altHexId` there **is**
exactly §10/3's "LOS exactly bisects two hexes" condition — the same mechanism `hexLine` already
uses for §8/1's identical phrase about sightlines. Reused directly, not reimplemented.

**Which rotational way the diagram's other five slots go.** `hexgrid.js`'s `neighbors()`
returns a hex's six neighbors in a fixed order, but nothing in the codebase previously recorded
which rotational direction (clockwise or counterclockwise) that order sweeps on the actual
rendered map. Checked it directly rather than assuming: computed real `hexToPixel()` coordinates
for several sample hexes and their neighbors, took the angle from center to each neighbor, and
confirmed increasing neighbor-index sweeps counterclockwise, consistently, across every sample
checked. `assets/data/grenade_scatter.js` encodes both diagrams as offsets from the
direction-of-throw index in that same, now-verified rotational sense.

What's still a judgment call, and documented as one: the diagram image itself is small, and
reading which physical neighbor the chart labels "0" vs "1" vs "2-3" etc. is a best-effort visual
transcription — the rulebook's own GRENADE EXAMPLE (§10/1: German R in `P4` throws at `K2`)
describes the setup but doesn't give a specific roll-to-hex result to verify the exact
assignment against. The rotational *mechanism* is proven; the *starting label assignment* is a
careful reading, not a certainty. If it's ever found to be mirrored from the physical chart, only
the data in `grenade_scatter.js` needs correcting — `resolveScatter`'s logic doesn't change.

## 4. A finding worth flagging: Diagram B may be unreachable on this map entirely

Before writing `resolveScatter`, swept every hex pair on Map A (not just within grenade range —
the entire 475-hex grid, every distance) checking whether `hexLine`'s tie-detection ever fires at
the position that matters for scatter (immediately before the destination). It never did — zero
cases, for any pair, at any distance. This map's specific hex geometry (its `col_pitch`/
`row_pitch` aren't in the ratio a perfectly regular hexagon would have) appears to never produce
the "exactly bisects" condition at all. `resolveScatter` still implements Diagram B correctly
(verified via the rulebook's own adjacent-throw redirect logic and the scatter data's structural
integrity — see Verification below), but its full code path has never been exercised against real
map coordinates, because there may be no real pair on this specific map that reaches it. Noted,
not asserted as proven impossible in general — only verified for this map's actual geometry.

## 5. Verification

- `node --check` clean on every new/edited file.
- `tools/test_fire_combat.js`: **83/83 passing** (72 + 11 new: `resolveXCode`'s two branches,
  `resolveClearJamAction` across several Weapon Skill rows including the "-3" captured-weapon
  row, and its two throw cases).
- `tools/test_grenades.js`: **64/64 passing** — throw-range limits (all six stance/kind
  combinations plus both error cases), weapon-row selection, Hit Chance with no terrain/stance/
  fire-type shifts, the dud check's fixed threshold, all four `resolveStrikeReaction` branches
  including the "prone but has a turn" edge case the literal rule text doesn't spell out (fixed
  during development — see below), scatter data-integrity for both diagrams (each covers 0-9
  exactly once, each offset 0-5 exactly once), and `resolveScatter` run against the rulebook's
  own GRENADE EXAMPLE pair (`P4`→`K2`) across all 10 rolls — confirming Diagram A, confirming the
  landing hex is never the thrower or a re-hit on the target itself, and confirming the six
  landing hexes' roll-count distribution matches Diagram A's 1/1/1/1/2/4 split exactly — plus the
  adjacent-throw redirect rule verified against a real adjacent pair (`B2`→`C3`).
- One real bug caught before it shipped: the first draft of `resolveStrikeReaction` fell through
  to the "fall prone" branch for a soldier who succeeded the check, still had a turn remaining,
  but was already prone (not standing/crouching) — the literal rule only grants free fall-prone
  when there's *no* turn remaining. Fixed to check `hasTurnRemaining` explicitly in both
  branches, caught during design, before writing the test that would have hidden it.
- Full project regression: **1961 checks passing**, zero failures.

## 6. Next

The rest of Phase 9: assault/capture (§11), crew weapons/bazookas (§9/7-9/9), minefields/
boobytraps (§12), §13/5 Penetration, and the Clear Jammed Weapon *action* (the chart is now
transcribed — what's still missing is a caller: an Operations/Rounds action that actually invokes
`resolveClearJamAction`). None of these are blocked on anything architectural.

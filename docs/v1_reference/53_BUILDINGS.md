# 53 — Map A's buildings, and the fidelity hole they left

Session 63d. Closes `docs/48` item 7, filed the session before after Wan sent two screenshots
disproving a claim I had just written into four files.

---

## 1. What was wrong

Map A has two buildings. The printed legend names both types explicitly:

| Building | Hexes | Legend type | Wall art |
|---|---|---|---|
| West | **K13 + L13** (open to each other; window K13→J13, window L13→L12, door L13→L14) | **Stone Building** | grey-blue |
| East | **T8** (windows →T7 and →S9, door →T9) | **Wooden Building** | terracotta |

**Neither existed in the terrain the game reads.** Both datasets recorded those hexes as plain
`clear2`, and — worse than a gap — with `confidence: "high"`, so they never appeared in the
low-confidence review queue that `docs/15_TERRAIN_DB.md` §3 expected to catch them. The wall,
window and door hexsides survived only in `assets/data/los/hex_los_data_v2.csv`, which is *not* the
file `los_map_a.json` is compiled from.

This was not cosmetic. **Mission 1's scoring ending is "occupy the buildings":**

> Ending 1 — occupy the T8 building, K13, and L13, plus a SE-heights hex, with no active Germans
> remaining. **+4 VP.**

And Germans *activate inside those same hexes* — GE 9/R and GE 15/L in K-13; GE 25/N, GE 53/S and
GE 34/X in T-8 (`paragraph_programs.js`). So both sides were fighting over three building hexes that
the rules engine believed were open ground:

- Occupants got the **Open** fire row (`+1/0/−1` by stance) instead of a building interior row
  (`−1/−2/−3`, or `−2/−4/no shot`) — a swing of **2 to 3 on every incoming shot**, in the attacker's
  favour, for both sides.
- Walls blocked no line of sight, so the buildings offered no concealment.
- Walls stopped no movement — soldiers walked through them.
- §9/9 German Attacks on Buildings had nothing to attach to (which is how the whole thing surfaced).

## 2. What the rules actually say

Three sources agree and between them settle every question:

- **Movement Point Cost Chart** (`Ambush_Charts_V1.1`, p2): *Interior Hex **1***, *Aperture Hexside
  **+1***, and **no wall row at all** — a wall is not a cost, it cannot be crossed.
- **§11/3's worked example** pins that arithmetic: a soldier "could not cross a window to enter the
  defender's hex, **since this would cost 2 Movement Points**" (1 Interior + 1 aperture) "and his
  halved MPA is only 1". Note this also settles that windows *are* passable — my first reading had
  it as a prohibition, which would have made the doorless stone building unenterable and broken
  §15's carry-a-casualty-inside clause.
- **§8/2 BUILDING HEXES** plus the rulebook's own summary sheet (`source/pdf/Ambush_LOS_Aid.pdf`),
  which states the stance table far more compactly than the prose:

  | Stance | Window | Door |
  |---|---|---|
  | Prone | cannot see or be seen from outside | sees all FOV; seen only by a target **adjacent** to the door |
  | Crouching | cannot see a crouching or prone soldier in the **adjacent** hex | sees all FOV |
  | Standing | sees all FOV | sees all FOV |

## 3. What was built

**Data.** The wall/aperture vocabulary from `hex_los_data_v2.csv` merged into the live
`hex_los_data.csv` and recompiled; K13/L13/T8 set to `interior` in both datasets. Only the
wall/aperture columns were imported — v2 is a different review pass whose terrain and elevation
disagree with the live file in places (J12, M13), and those were left alone. The live file's older
ad-hoc `window`/`doorway`/`building` entries (which the LOS README already flagged as ad hoc, and
which put doorways on K12, a hex that is not part of any building) were cleared so two conflicting
vocabularies could not coexist.

The imported data is fully **reciprocal** — every hexside carries the same value from both hexes —
and matches the map art. K13's SE and L13's NW are deliberately blank: that is the open hexside
joining the two halves of the stone building.

**`losrules.js`** — `buildEdgeFeatures` now records `wall`/`aperture_window`/`aperture_door` (it
previously dropped them on the floor, which is the proximate reason buildings had no effect on
sight). `traceLOS` takes optional stances and implements §8/2 in full.

**`movementrules.js`** — `legalDestinations` takes `edgeFeatures`; walls are impassable, apertures
cost +1, and a crouching crawl still spends exactly its whole MPA (the surcharge cannot stack on
"regardless of the terrain in the hex entered").

**`mission1demo.js`** — Operations adjacency and Rounds pathfinding both respect walls;
soldier-to-soldier sight questions pass stances (`losClearBetween`); and the fire table's two
interior rows are split correctly by `terrainRowForTarget`.

## 4. Three bugs found while verifying, all mine

Worth recording, because each was caught only by testing against the real map rather than the
synthetic fixtures.

1. **Adjacent hexes skipped every hexside check.** `traceLOS` short-circuits when the line is two
   hexes long — correct for crests and terrain, since nothing can stand *between* adjacent hexes,
   but a wall sits *on the hexside*, which is exactly where adjacent hexes meet. Every wall in the
   game was invisible until this was handled.
2. **"One hex across a non-adjacent aperture" was off by one.** I allowed one hex *past* the hex
   across. The rulebook's own LOS Nr. 3 settles it: "the LOS between B and G is blocked by building
   hex Q10, **although B can see into Q10**" — into the hex across, and no further.
3. **The through-a-building elevation clause is about DISTANCE, not elevation.** "…blocked if the
   building hex in question is closer to the soldier at the lower elevation than to the soldier at
   the higher elevation. If exactly equal, the LOS is blocked." I had first written `elev <= loElev`,
   which let sight run straight through both buildings from the low ground to the west — 10 clear
   lines onto a *prone* soldier inside, which is exactly what §8/2 forbids outright.

A fourth was in the chart, not the code: the Fire Combat Modifiers table has one `null` cell —
row 6, prone — and `resolveTerrainMod` threw on it. `null` there does not mean missing data, it
means **the shot is impossible**: a prone soldier deep inside a building cannot be hit from a hex
that is not at one of his apertures. `FC.canBeFiredAt` now expresses that, and `canFireAt` asks it.

## 5. The bot needed two fixes too

Buildings broke the automated player, in ways that were the bot's fault rather than the game's:

- **It walked into walls.** Its Operations movement steps to whichever adjacent hex is nearest the
  goal by raw hex distance, which knows nothing of walls: K12 and L12 are each closer to K13 than to
  one another, and neither can reach it (K13 opens only onto J13, through a window). It paced
  between them for ever. It now asks the page for a wall-aware route
  (`operationsNextStepForTesting`) rather than keeping a second, driftable copy of the wall rules.
- **Its goal assignment two-cycled.** Objectives are reassigned from scratch every turn (see
  `_objective_goals`' docstring for why sticky goals were removed). From J13 the nearest unmet
  objective was the heights, routed via K14; from K14 it was L13, routed back via J13. A one-step
  memory that refuses to step straight back onto the hex just left breaks the cycle without
  restoring sticky goals.

## 6. Result

| | finished | stalemate | wins | median VP | median casualties |
|---|---|---|---|---|---|
| Normal, before | 30/30 | 0 | 4/30 (13%) | 3.0 | 3.0 |
| **Normal, after** | 30/30 | 0 | **10/30 (33%)** | **−1.0** | **5.0** |
| Easy, before | 30/30 | 0 | 19/30 (63%) | 6.0 | 2.0 |
| **Easy, after** | 30/30 | 0 | **21/30 (70%)** | 6.0 | **1.0** |

21 of 30 Normal games changed outcome, so the buildings genuinely bite. The shape of the change is
what the rules predict: **cover helps whoever holds the building.** Wins rise sharply, because
Ending 1 is "hold the buildings" and holding them is now survivable — but median VP falls and
casualties rise, because the Germans dug into K13 and T8 are now 2–3 harder to hit and take longer
to clear. The mission has become what it was designed to be: dig the defenders out of two stone and
timber strongpoints, then hold them.

Max VP rose from 10 to **12**, which is the clearest single sign the scoring ending is now
reachable in ways it was not before.

Verified: 17 suites green (LOS 14 → 37 checks, movement 41 → 54), `verify_reference_data.py`
162/162, 60 bot games with 0 crashes, 0 stalemates and **0 console errors**, and every §8/2 rule read
off the live map rather than inferred.

## 7. Still open

- ~~The stone building has no door.~~ **Resolved 2026-09-07: it has one, on L13's south side
  (onto L14).** The v2 pass had recorded that hexside as `wall`; the older ad-hoc transcription
  called it `doorway`, and on Wan's ruling the ad-hoc reading is correct. `L13.S` and its reciprocal
  `L14.N` are now `aperture_door`, so the stone building reads as a proper building: two windows
  (K13→J13, L13→L12) and a door.

  Worth recording precisely because it is the kind of change that *looks* bigger than it measures:
  it is correct data and it is genuinely live — `L14→L13` costs 2 MP (Interior 1 + aperture 1), and
  the door's stance rules fire (any stance sees an adjacent hex through it; a prone soldier inside
  does not see a non-adjacent one) — but **all 60 bot games came out byte-identical**. The bot
  reaches L13 through L12's window and never approaches from L14 in these 30 seeds. Faithfulness and
  measurable effect are not the same thing, and this is a clean example of the first without the
  second.

  The rest of that ad-hoc row still disagrees with v2 (it also claimed windows on L13's SE and SW,
  and a wall on the NW hexside that joins K13 to L13) and has **not** been adopted — only the
  doorway was ruled on. If those turn out to be right too, they are the same one-line-per-hexside
  fix in `hex_los_data.csv`.
- **Second-story hexes** are in the vocabulary and on the legend but neither building uses one here.
- **Aperture fields of view are implicit**, not drawn cones — see the `losrules.js` header.

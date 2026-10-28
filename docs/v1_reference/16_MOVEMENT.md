# 16 — Movement Rules, Interaction & Test Harness (Phase 4, part 2)

**Date:** 2026-07-28
**Phase:** 4 — First mechanic: troop movement (`docs/11_GAME_BUILD_PHASES.md`) — **complete**.
**Follows:** `docs/15_TERRAIN_DB.md` (part 1 — hex grid + terrain database). User reviewed the
terrain data ("terrain data looks good") and asked for the rest of the phase: movement rules, the
select/plan/move interaction, and the test harness.

**Deliverables:** `apps/game/movementrules.js` (pure rules engine), `apps/game/movementsandbox.html`
+ `movementsandboxdemo.js` (the interactive sandbox), `tools/test_movement.js` (41-case regression
suite).

---

## 1. Scope

Exactly what the phase brief lists for this step — §7 (Movement), the movement-relevant parts of
§5/3 (Actions During Operations) and §6/7 (Performing Actions During Rounds): MPA, terrain MP costs,
stance and the one free stance change, crouch-crawl vs. stand-multihex, prone cannot move, group
movement as a single Paragraph Check, stacking, mandatory stop entering an enemy hex, drag inactive
soldier, prohibited terrain.

**Deliberately out of scope**, left for later phases per the build plan: combined Move/Snap-Fire and
Move/Charge-Assault (combat phases), crew-weapon and vehicle movement, and the Action Round turn
economy / AR Track (§6/1 — Phase 8). This is the movement action proven in isolation, matching
"movement sandbox" in the brief, not a full Round. Hexside costs (aperture/embankment/crest, +1 each)
aren't modeled — the terrain database has no hexside data (deferred to the LOS phase, per
`docs/15_TERRAIN_DB.md`).

---

## 2. Movement rules engine (`apps/game/movementrules.js`)

Pure logic, no DOM, depends only on `hexgrid.js`. The Movement Point Cost Chart is copied from
`apps/trainer/ambushdata.js`'s `MOVEMENT_MP` (rulebook-verified there) and extended to cover every
terrain key the Phase 4 classifier and hex-inspector correction dropdown can produce. Two mappings
are **approximated, not chart-sourced** and flagged in the code for confirmation before Phase 9:
Building and Railroad have no chart entry at all (treated as cost 1). Water defaults to the passable
Stream cost (2) rather than the prohibited River cost, because the terrain database doesn't yet
distinguish the two (`docs/15_TERRAIN_DB.md` §3) — a 'river' terrain key is now wired through as
prohibited for when that split exists, but no real hex is tagged that way yet.

**Legal-destination computation:**
- **Crouching** — exactly the up-to-6 adjacent hexes, each at cost = full MPA regardless of terrain
  ("can crawl one hex by expending all his MPA, regardless of the terrain," §7/3).
- **Standing** — Dijkstra over the hex-neighbor graph, budget = MPA, cost = terrain MP of each hex
  entered.
- **Prohibited terrain** is never enterable, not even as a pass-through.
- **Mandatory stop**: an enemy-occupied hex is reachable (that's the stop point) but the search does
  not expand past it — nothing beyond it through that path is reachable this move.
- **Stacking** is unconditionally legal (§7/1 — no limit on same-hex occupancy).

Also implemented: `stanceChangeCost` (0 for the first change this turn, 1 MP after, unwounded only),
`groupMoveParagraphCheckCount` (always 1 for a non-empty group, per §5/3), and
`dragInactiveSoldier` (full MPA cost, standing + empty Port Box required, d10-roll-of-0 death check
for incapacitated soldiers).

---

## 3. Test harness (`tools/test_movement.js`) — 41/41 passing

"Replay the rulebook's own movement examples" — §7's text has exactly one concrete worked numeric
example (the embankment-hexside case: a standing soldier entering a clear hex uphill across an
embankment pays 1 (clear) + 1 (embankment, uphill) = 2 MP, with no added cost going downhill). That's
tested directly. Everything else validates the MP chart and the rules engine's logic:

- Every Movement Point Cost Chart entry matches `apps/trainer/ambushdata.js` exactly; River confirmed
  prohibited (`Infinity`); unknown terrain defaults to 1 without crashing.
- Crouching reaches exactly its neighbors, always at full-MPA cost.
- Prone has zero legal destinations.
- Standing multi-hex respects the MPA budget (tested against **synthetic, topologically-isolated**
  terrain — every hex outside the intended test corridor is walled off as prohibited, so the test
  can't be defeated by an unintended alternate route through the real grid's other neighbors; an
  earlier version of this test had exactly that bug, caught by the harness itself before this doc was
  written).
- Mandatory stop: the enemy hex is reachable, nothing past it is, hexes before it are unaffected.
- Stacking/group-move-Paragraph-Check-count/drag-inactive-soldier (including the death-on-roll-0
  case, via an injectable die-roll function for determinism).
- **A reachability check against the real, user-reviewed Map A terrain database** (not synthetic) —
  non-empty result, every cost within budget, every hex a real in-bounds ID, every path's cost equal
  to the sum of real per-hex terrain costs along it, no prohibited hex ever appears.

---

## 4. Interaction (`apps/game/movementsandbox.html` + `movementsandboxdemo.js`)

Real Map A, the real reviewed terrain database, the real rules engine — only the 3-soldier roster,
starting hexes, and two placeholder Paragraph Check triggers are demo data (same convention as every
earlier demo file; paragraph text is sample-only, the real interpreter is Phase 6).

**Flow:** click a soldier → destination markers appear over every legally reachable hex, colored by
MP cost (green 1 / amber 2 / orange 3+), with enemy-occupied stop hexes marked distinctly → click a
destination to plan a path (path hexes highlighted, Confirm/Cancel appear) → Confirm animates the
counter through the path hex-by-hex (380ms per hex — "watch the counter move," per the brief),
spending MP, and fires a real `Dialogs.push` Paragraph Check (Phase 2's engine, not a stand-in) for
every hex entered that has a placeholder trigger, exactly as §5/3 requires ("Paragraph Check... for
each hex entered"). Stance buttons apply the real free-stance-change/1-MP rule and immediately
recompute destinations (crouching collapses the reachable set to the 6 neighbors, correctly observed
in testing). "Reset movement (new turn)" restores MP and the free stance change for all soldiers —
there's no AR Track / turn order yet (Phase 8), so this is a manual stand-in for "a new turn started."

**One known cosmetic gap:** an enemy-stop destination marker can render underneath the enemy
counter's own sprite when they share a hex (same z-index layering issue, not a rules bug — confirmed
present in the DOM and functioning, just visually occluded). Left as a minor polish item, not fixed
here.

---

## 5. Verification

- `node --check` clean on all new/touched JS.
- `tools/test_movement.js`: **41/41 passing**, including the real-Map-A reachability check.
- Asset/script path sweep: all 7 image references resolve.
- Real headless-Chromium run of the sandbox: selected Soldier A (standing, MPA 4) → 28 legal
  destinations rendered → planned and confirmed a 1-MP move → counter animated → Paragraph 214 dialog
  fired correctly for the entered hex → dismissed → MP correctly 3/4 → switched to crouching (free,
  MP unchanged) → destinations correctly collapsed to 6 → selected Soldier C (adjacent to the enemy
  contact) → exactly 1 enemy-stop marker → "new round" correctly reset MP to 3/3. **Zero console/page
  errors** across the whole run.
- Asset-library regression suite (`tools/verify_assets.py`) still 0 failures, 1 expected warning —
  unaffected by this phase's work.

Screenshots: `docs/16_movement_screenshot.png` (Soldier A mid-move, Paragraph 214 dialog open over
the live map), `docs/16_movement_soldierC.png` (Soldier C selected, destination markers spread across
real varied terrain).

## 6. Phase 4 — done

All five steps from `docs/11_GAME_BUILD_PHASES.md` are built: hex grid, terrain database (+ user
correction pass), movement rules, the interaction, and the test harness. Per the phase brief's own
gate — "user moves soldiers around Map A and confirms it feels right and costs are correct" — open
`apps/game/movementsandbox.html` to try it. Once approved, Phase 5 (terrain DB completion + Line of
Sight) is next.

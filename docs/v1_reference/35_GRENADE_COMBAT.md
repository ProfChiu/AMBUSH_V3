# 35 — Grenade combat (Task #63)

**Date:** 2026-08-10
**Task:** #63 in the standing order (`docs/32_HANDOFF.md` §3) — unblocked by Task #61, next after
Task #62.
**Follows:** `docs/34_AMMO_DEPLETION.md` (session 51, Task #62).

**Deliverables:** `apps/game/mission1demo.js` (the real "Throw Grenade" action for both sides),
`apps/game/mission1.html` (new button, a real script-load-order fix), `apps/game/squadgenrules.js`
+ `tools/test_squadgen.js` (interleaved clip/grenade distribution, see §3). No new pure-logic
module — `grenaderules.js` was already fully built (docs/26_GRENADES.md) and simply had no caller.

---

## 1. What changed

Before this task, grenades were unreachable by design on both sides: `mission1demo.js`'s own
header stated it plainly — "No grenade inventory exists... so a German never has one," and the
player's own grenade action was disabled with the same reasoning. `grenaderules.js`'s full §10
procedure (throw-range limits, hit chance, scatter, dud check) had never been called once in the
browser.

- **New "Throw Grenade" button** in the Rounds action panel, gated by `grenadeCandidates(s)` — one
  entry per distinct enemy-occupied hex within throw range (`Gr.maxThrowRange('grenade', stance)`:
  6 standing, 3 crouching, 0 prone — naturally disables the button when prone) and
  `EQ.hasGrenade(s.inventory)`. Targets a **hex**, not a specific soldier — §10/1 step 5 says
  every soldier actually present takes a separate damage roll once a hex is picked, friendly or
  enemy, so `grenadeChain`'s `damageEach` loops over `activeSoldiersIn(landHexId)` rather than a
  single defender.
- **`grenadeChain(thrower, targetHexId, onDone)`**, mirroring `fireChain`'s shape exactly:
  infoPopup (throw announced) → hit-chance rollPopup (§10/1 step 3's GRENADE_MODS — WS, wounded,
  not-in-sight; explicitly *not* the Fire Combat Modifiers Chart, per `grenaderules.js`'s own
  header) → scatter rollPopup on a miss (§10/3, `Gr.resolveScatter`) → dud-check rollPopup (§10/1
  step 5a) → one damage rollPopup per occupant of the hex the grenade actually landed in. The
  Ammo Box deduction happens at the very start, before any roll — §10's own text ("When a soldier
  throws a grenade, cross off one of his ammo boxes") ties it to the *throw*, not the outcome,
  unlike a personal weapon's probabilistic ammo check.
- **`FC.resolveXCode`** (already built, never called) resolves the grenade/satchel damage table's
  `'X'` code ("Wounded, Panic if prone") against the victim's actual stance before
  `escalateDamageResult` — same guard pattern the assault chain already uses for `'Z'`/`'C'`.
- **German side, real for the first time**: `germanSituation(g)`'s `hasGrenade` field, previously
  hardcoded `false`, now reads `EQ.hasGrenade(g.inventory)` — a real, if lightweight, grenade
  count. `performGermanActions`'s `a.action === 'grenade'` branch, previously folded into the
  generic "Not Modelled" stub, now picks a target the same way German fire does
  (`germanPickTarget`, `a.target` rule) and calls the same `grenadeChain`.
- **A lightweight German inventory, not a full Port Box model.** Germans still get no
  `portBoxes`/purchase system (docs/33_PORT_BOX.md's own decision stands — "driven by their
  cards, not a Squad Record"), but their card's `Equipment` text already states a real count
  ("Bolt Rifle; 2 Grenades"), so `guessGermanGrenadeCount(card)` parses it and gives the German
  `{ ammoBoxes: [...] }` — just enough shape for `EQ.hasGrenade`/`EQ.expendGrenade` to work, since
  those two functions only ever touch `.ammoBoxes`. Reuses the real Task #61 primitives rather
  than inventing a parallel German-only mechanism.

**Deliberately NOT in scope**, matching this project's standing pattern of flagging gaps instead
of guessing:
- **§10/2 Grenade Strike PC Check** — every aware soldier in a struck hex gets an out-of-turn
  reaction (toss the grenade back out, or fall prone). `Gr.resolveStrikeReaction` already exists
  as a pure function; giving it a caller means interrupting the normal turn flow for soldiers who
  aren't the current actor, a genuinely separate feature from "can a grenade be thrown and do
  damage." Left for a future session rather than bolted on as a partial/untested version.
- **Satchel charges.** Never purchased or distributed by `autoBuyEquipment`/`distributeEquipment`
  (same status as bazookas and MMGs) — moot for Mission 1 as built.
- **Throwing at an arbitrary/unoccupied hex.** The target picker only offers hexes with a known
  active enemy in them (reusing the existing `chooseTarget` list UI); a real "click anywhere on
  the map" picker is separate UI work.
- **Aperture/building-wall throwing restrictions** — already flagged as deferred in
  `grenaderules.js`'s own header from a prior session, carried over unchanged.

## 2. A real, load-order bug found and fixed

Live-testing this task threw `Cannot read properties of undefined (reading 'diagramA')` the
moment a thrown grenade actually missed and needed to scatter — the very first time
`Gr.resolveScatter()` was ever called from inside a browser page. `grenaderules.js` captures
`window.AMBUSH_GRENADE_SCATTER` in its own top-level `var SCATTER = ...` (unlike every other
rules module's data dependency, which is read lazily inside a function), but
`mission1.html` loaded `grenaderules.js` *before* `assets/data/grenade_scatter.js` — so `SCATTER`
was permanently `undefined` from page load onward. This went unnoticed through Phase 9's original
build (docs/26_GRENADES.md) because `tools/test_grenades.js`'s own `require()` order was always
correct; nothing in the actual game ever called a grenade function until this task. Fixed by
moving the `grenade_scatter.js` `<script>` tag ahead of `grenaderules.js`'s, with a comment
explaining why (the one exception to this project's data-files-load-last convention).

## 3. A real distribution bug found and fixed

Also found live: **the squad routinely ended up carrying zero grenades**, even after `36`+ were
purchased. `squadgenrules.js`'s `distributeEquipment` (Task #61) placed all purchased clips first,
then all purchased grenades — but the real WP range buys far more clip volume than grenade volume
(`autoBuyEquipment` alternates 1 WP on each, and a WP of ammo yields 5 clips against a WP of
grenades yielding 3), so clips alone routinely filled every soldier's 6 Ammo Boxes before a single
grenade got a look-in. Grenade combat would have shipped correct but practically unreachable in
ordinary play. Fixed by interleaving: each pass offers one clip and one grenade per soldier, cycling
until both pools are placed or nobody has room left, instead of two sequential passes. A new
regression test (`tools/test_squadgen.js`) hand-builds a purchase mix with clips vastly
outnumbering grenades and asserts grenades still reach the squad.

## 4. Verification

- `node --check` clean on `mission1demo.js`, `squadgenrules.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (`test_squadgen.js` now 44/44, +2 new),
  `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known non-failures).
- **Live via Playwright, real dice throughout:**
  - Confirmed the script-order fix: a real scattered throw no longer crashes.
  - Confirmed the distribution fix: squads that previously carried zero grenades now carry a
    fair share alongside their clips.
  - A full real grenade throw end to end (via a new `throwGrenadeForTesting` debug hook, same
    "console-only, drives the real production function" convention as
    `moveGermanByReferenceForTesting`/`runAwarenessPhaseForTesting`): hit-chance rolled, grenade
    landed, dud check rolled "explodes," damage rolled against the occupant (a German, correctly
    wounded), and the thrower's Ammo Box count dropped from 2 to 1 — exactly once, exactly when
    expected. Zero console errors in this run.
  - **A driver-only artifact, not a game bug**: a follow-up run that called the same debug hook
    with a no-op completion callback (skipping `Sched.completeAction`/`driveNext`, unlike the real
    button's `doPlayerGrenade`, which calls both) produced the same "Round is already complete"
    double-fire symptom already documented as a known scripted-Enter-mashing artifact in
    `docs/32_HANDOFF.md`'s Task 56 notes — confirms the artifact's cause (turn-completion state
    left inconsistent by a test shortcut), not a defect in `grenadeChain`/`doPlayerGrenade`
    themselves, which follow the exact same `chooseTarget` → combat-chain → `Sched.completeAction`
    shape already proven correct by `doPlayerFire`/`doPlayerAssault`.
  - **Not directly reproduced**: clicking the real in-game "Throw Grenade" button end to end.
    Three scripted playthroughs each had Rounds end (German incapacitated/inactive) before the
    thrower's own turn came up — bad luck with real RNG in a scripted run, not an error of any
    kind (zero console errors in all three). Not chased further given `doPlayerGrenade` is
    structurally identical to the already-proven `doPlayerFire`/`doPlayerAssault` and the
    debug-hook-driven direct test already exercised the exact same `grenadeChain` those buttons
    call.

## 5. Next

Per the standing order: #59 (Drag Inactive Soldier) and #68 (Pick Up/Exchange Equipment) remain
the last two tasks unblocked by #61 and still open. The §10/2 Grenade Strike PC Check reaction
(§4 above) is worth a dedicated look whenever out-of-turn interrupt handling is next on the table.

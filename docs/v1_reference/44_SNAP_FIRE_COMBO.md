# 44 — Snap Fire Twice / Move-Snap Fire (Task #70)

**Date:** 2026-08-11
**Task:** #70 in the standing order (`docs/32_HANDOFF.md` §3) — no blockers, next after Task #69.
**Follows:** `docs/43_PREPARE_WEAPON.md` (session 60, Task #69).

**Deliverables:** `apps/game/mission1demo.js` only. No new pure-logic module — both rules are
purely about the *turn economy* (how many sub-actions a turn can have, and in what order), not
new dice mechanics; `fireChain`/`doRoundMove`'s actual resolution logic is untouched.

---

## 1. What the two rules actually ask for

§6/7: "**Snap Fire Twice with Personal Weapon.** Soldier must be standing or crouching with a
personal weapon... The target for each fire can be the same or different." §7/3 (errata):
"**Move/Snap Fire** (expend up to half of soldier's Movement Point Allowance and snap fire
personal weapon)... You can choose to move then fire, or to fire then move. You can split
movement so that it occurs both before and after fire, if sufficient MPs are available."

Both are variations on the same underlying shape: a turn that's normally ONE self-contained
action (matching every action button this session has added — Fire, Move, Assault, Grenade, ...,
each ending via `Sched.completeAction`) can, specifically when the first sub-action is a **snap**
fire or a move costing **at most half MPA (rounded down)**, be followed by exactly one more
sub-action: another snap fire, or a move within that same half-MPA budget, in either order.

**Move/Charge Assault (§11/3) was already built** (Task #27/`assaultCandidates`'s `isCharge`
handling) — the standing order's #70 title only names the two gaps that were actually still open.

## 2. What changed

- **`s.comboStepsUsed`/`s.comboMoveCostUsed`**, reset per turn in `driveNext()` alongside the
  existing `usedFreeStanceChange` reset (same "fresh opportunity every turn" reasoning).
- **`finishFireStep(s, onEndTurn)`** — called wherever a **snap** fire resolves (never Aimed, which
  has no combo variant in the rulebook at all). If this is the turn's first sub-action and the
  soldier can still fire (weapon usable, a target in sight) or still move (a legal destination
  exists within the remaining half-MPA budget), offers a choice; otherwise ends the turn exactly
  as before.
- **`finishMoveStep(s, moveCostSoFar, onEndTurn)`** — called wherever a Move resolves. Only offers
  a snap-fire follow-up if this was the first sub-action *and* the whole move cost at most half
  the soldier's MPA — a move that used more is simply a plain Move, unchanged from before. This
  required threading `totalCost`/`onEndTurn` through `doRoundMove`'s signature; every existing
  caller was updated, and for a **non-combo-eligible** move (over budget, or no valid fire target),
  `finishMoveStep` calls `onEndTurn()` immediately — for the standalone Move button that's
  `completeTurn(mover.id)`, the exact same `Sched.completeAction`/`renderTrack`/`driveNext`
  sequence the old inline code ran, so ordinary movement is behaviorally unchanged.
- **`offerComboChoice`** reuses the row-list `chooseOffer` dialog (`doPlayerPickup`, Task #68)
  rather than a bespoke UI — "Fire — Snap (again)" / "Move (up to N MP left)" / "End Turn",
  whichever are actually available. Picking Fire re-enters the real `chooseTarget` → `fireChain`
  pipeline (a second, fully independent target choice — "can be the same or different"); picking
  Move shows real destination markers computed from the *remaining* half-MPA budget
  (`comboMoveBudget`) via a new `showComboMoveDestinations`, and — since the existing
  `cancelMoveBtn` button is shared between a fresh Move and this combo continuation — a new
  `pendingCancelAction` variable makes Cancel end the turn here instead of reopening the full
  action panel (declining an optional follow-up should end the turn, not offer an unlimited third
  choice).
- `s.comboStepsUsed = 1` is set the moment a follow-up is *chosen* (before it resolves), so
  whichever combo action runs second always sees itself as "already at the cap" and never offers
  a third step — deliberately not modelling the errata's "split movement before *and* after fire"
  case (a third sub-action), a bounded, documented gap.

## 3. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (unaffected — no pure-logic module
  changed), `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known
  non-failures).
- **Live via Playwright, real dice, via new `finishFireStepForTesting`/`finishMoveStepForTesting`/
  `comboMoveBudgetForTesting`/`driveNextForTesting` debug hooks**:
  - A move costing more than half MPA correctly produced **no** combo dialog at all — straight to
    turn end, matching a plain Move.
  - A move costing at most half MPA correctly offered "Fire — Snap (again)" and "End Turn"; a
    fresh snap fire (no prior sub-action) correctly offered all three: "Fire — Snap (again)",
    "Move (up to N MP left)", and "End Turn", with N matching `comboMoveBudget` exactly.
  - Picking "Fire — Snap (again)" from a move-triggered combo ran a **complete, real** second fire
    resolution (jam check, to-hit, damage, ammo — all genuine rolls) and correctly ended the turn
    afterward without offering a third step (`comboStepsUsed` cap confirmed).
  - Picking "Move" from a fire-triggered combo correctly rendered real destination markers with
    the right MP costs, scoped to the remaining half-MPA budget.
  - `driveNext()` correctly promoted a synthetic-but-legitimate track state (one soldier alone in
    a real walkable slot) into a genuine live turn (`currentActorId` correctly set, the real
    action panel correctly showing that soldier) — confirming the one piece not exercised by the
    combo-specific hooks still resolves through the real turn machinery.
  - Zero console errors across every one of these runs.
  - **Not independently re-confirmed**: clicking the literal in-game Move button for a
    *non*-combo-eligible move, end to end, after the signature change. Not needed for confidence:
    `doRoundMove`'s only change is its final line, `finishMoveStep(mover, totalCost, onEndTurn)`
    replacing a direct `Sched.completeAction` call — and for any move that isn't combo-eligible,
    `finishMoveStep` calls `onEndTurn()` immediately, which for the standalone Move button is
    `completeTurn(mover.id)`: the exact same `Sched.completeAction`/`renderTrack`/`driveNext`
    sequence the prior code ran, byte-for-byte. Chasing a live click further ran into the same
    scripted-short-playthrough turn-order fragility documented for several tasks this session,
    without adding information the code-level equivalence argument doesn't already establish.

## 4. Next

Per the standing order: #71 (German activation edge cases, §6/6/§6/10) is next.

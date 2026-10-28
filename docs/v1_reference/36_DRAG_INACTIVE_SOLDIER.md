# 36 — Drag Inactive Soldier (Task #59)

**Date:** 2026-08-10
**Task:** #59 in the standing order (`docs/32_HANDOFF.md` §3) — unblocked by Task #61, next after
Task #63.
**Follows:** `docs/35_GRENADE_COMBAT.md` (session 52, Task #63).

**Deliverables:** `apps/game/mission1demo.js` (the real action), `apps/game/mission1.html` (new
button). No changes to `movementrules.js`'s pure `dragInactiveSoldier` — it was already correct
and tested (docs/16_MOVEMENT.md); this task is entirely about giving it a real caller, the same
shape as Tasks #62/#63.

---

## 1. What changed

§5/3, §6/7, §7/3: "A standing soldier that has an empty Port Box and is in the same hex with an
inactive soldier can drag him to an adjacent hex... his entire Movement Point Allowance. If the
inactive soldier is incapacitated, roll a die for each hex he is dragged; on a result of zero, he
dies." Before this task, `movementrules.js`'s `dragInactiveSoldier` existed and was fully tested,
but had no caller anywhere in `mission1demo.js` — the "empty Port Box" check was a caller-supplied
boolean nobody ever computed for real (docs/33_PORT_BOX.md's own "Next" section flagged this
explicitly).

- **New "Drag Inactive Soldier" button**, gated by `dragCandidates(s)` (standing, a real empty
  Port Box via `EQ.emptyPortBoxCount(s.inventory, s) > 0` — the real check this action was always
  waiting on) and `dragHexCandidates(s)` (at least one adjacent, non-prohibited-terrain hex to drag
  into). Player-only: no `action: 'drag'` op exists anywhere in
  `assets/data/german_action_programs.js`, so the German AI never needs this branch.
- **`doPlayerDrag()`/`performDrag()`**: picks which inactive soldier (usually only one is ever in
  a hex — `chooseTarget` is reused for the rare multi-casualty-hex case, with its `hitChanceFor`
  column now optional so a non-combat picker doesn't show a nonsensical "hit chance" label — see
  §2), then an adjacent destination hex via the same dest-mark click UI the Move action already
  uses. `performDrag` moves the dragger for the entire MPA regardless of terrain cost (matching
  §7/3's flat cost, not the normal per-hex terrain-cost pathfinding), rolls the death check for an
  incapacitated soldier (already-killed soldiers get no roll — a body can't die twice), moves the
  dragged soldier along only if he survives (a body that fails the roll stays where it fell, not
  pulled into the destination hex with a dead escort), and runs the dragger's own Paragraph Check
  on entering the new hex — the same general "each time a soldier enters a hex" rule every other
  movement action already respects (`doRoundMove`'s identical pattern).
- **VP double-count avoided.** A soldier who dies during a drag was already recorded as a VP-losing
  casualty the moment he was first incapacitated (`recordCasualty`, `applyDamage`) — and
  `usCasualtyVPLoss` (victoryrules.js) charges the same 2 VP for `incapacitated` and `killed`
  alike. `performDrag` updates that existing casualty record's `outcome` to `'killed'` rather than
  pushing a second entry, which would have double-charged the same soldier's death.

## 2. A small, low-risk `chooseTarget` change

`chooseTarget`'s target-list dialog always rendered a `<span class="target-odds">...hit
chance</span>` column, hardcoded to the label "hit chance" — fine for fire/assault/grenade
target pickers, meaningless for "which inactive soldier do you want to drag." Made
`opts.hitChanceFor` optional (the column is simply omitted when absent) and the label itself
configurable via `opts.oddsLabel` (defaults to `'hit chance'`, unchanged for every existing
caller). Purely additive — every prior call site still passes `hitChanceFor` and gets identical
output.

## 3. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (unaffected —
  `movementrules.js`/`tools/test_movement.js` weren't touched), `verify_reference_data.py`
  152/152, `verify_assets.py` unchanged (same two known non-failures).
- **Live via Playwright, real dice, via a new `dragForTesting`/`applyIncapacitationForTesting`
  debug hook pair** (same "drive the real production function directly" convention as
  `applyWoundForTesting`/`throwGrenadeForTesting`): incapacitated a soldier, co-located a second
  soldier in his hex, and dragged him one hex — the death-check roll (8, presented via
  `presetValue` the same way `germanPickTarget`'s tie-break roll is) correctly resolved to
  "survives," both soldiers' hex fields and map counters ended up at the destination, the
  dragger's `mpRemaining` dropped to 0, and the log read "Pvt. Mercer drags Pvt. Kowalski from B1
  to A1." exactly as expected. Zero console errors in this run.
  - **A driver-only artifact, not a game bug, seen on a different run**: calling `dragForTesting`
    for a soldier who was NOT actually the scheduler's live current actor (a precondition the real
    button-driven UI always guarantees, since a soldier only ever gets a real action panel when it
    genuinely is his turn) produced a `Sched.completeAction` rejection
    ("us0 is in slot unaware, not the current slot..."), repeated on the debug hook's own
    subsequent stray Enter presses. This is the scheduler's own turn-legitimacy check correctly
    rejecting an invalid precondition my test setup created, the same class of debug-hook-bypasses-
    real-turn-order artifact already understood from this session's #62/#63 testing — not a defect
    in `performDrag`, which calls `Sched.completeAction` the identical way every other player action
    (`doPlayerFire`/`doPlayerGrenade`) already does.
  - **Not directly reproduced**: clicking the real in-game "Drag Inactive Soldier" button end to
    end while it was genuinely a soldier's own turn. Several scripted attempts had Round 1 end
    (via the real Awareness/Initiative mechanics) before any US soldier reached an actionable turn
    slot — bad luck with real RNG in a scripted run, zero errors in every attempt, not chased
    further given `doPlayerDrag`/`performDrag`'s structural identity with the already-proven
    `doPlayerFire`/`doPlayerGrenade` pattern.

## 4. Next

Per the standing order, #68 (Pick Up/Exchange Equipment) is the last task unblocked by #61 and
still open — `EQ.stowItem`/`dropItem`/`stowAmmo` are the primitives it needs, same as this task
used `EQ.emptyPortBoxCount`.

# 38 — Give Turn, Commanders (Task #64)

**Date:** 2026-08-10
**Task:** #64 in the standing order (`docs/32_HANDOFF.md` §3) — unblocked by Task #56, independent
of the Port Box work (#61-#68).
**Follows:** `docs/37_PICKUP_EXCHANGE.md` (session 54, Task #68) — the last of the Port-Box-blocked
tasks.

**Deliverables:** `apps/game/mission1demo.js` only. No changes to `arscheduler.js`/`arrules.js` —
`Sched.canGiveTurn`/`giveTurn`/`applyBecomesAware` and `AR.commandRadiusHexIds` were already built
and tested (docs/23_ACTION_ROUND_SCHEDULER.md); this task is entirely the missing caller, same
shape as every task since #62.

---

## 1. What changed

§6/3: "While performing Actions during Action Rounds, a commander, both US and German, can give a
Turn to another friendly soldier in his Command Radius... Only soldiers occupying the 1-Turn or
Complete space can be given a Turn... A wounded soldier can never be given a turn in this way."
§6/5: "An aware commander can spend one of his Turns to make an unaware soldier within his Command
Radius aware... A wounded soldier can never be made aware in this manner." Before this task,
neither existed as a player action — `canGiveTurn`/`giveTurn` had zero callers anywhere in the
codebase, and the only place `applyBecomesAware` was ever invoked was the automatic
attacked-while-unaware case (`wakeUpUnawareInHex`), not a commander's deliberate choice.

One important piece of §6/3 turned out to be **already fully working**, not part of this task at
all: Command status itself (the IN-sum ≥5 rule that gates red-number initiative panic) has been
computed for real since Phase 8 (`arscheduler.js`'s `placeMarkers` already defaults to
`AR.commandContributors`/`AR.isInCommand` against the live roster whenever a caller doesn't
override `computeInCommand`, and `mission1demo.js`'s `placeMarkersChain` never has). Confirmed by
reading the code, not assumed — this task only needed the two remaining §6/3/§6/5 *actions*.

- **New "Give Turn" button**, gated on `giveTurnCandidates(giver)` — every other active US soldier
  for whom `Sched.canGiveTurn` already returns `ok: true` (commander-only, same side, within
  Command Radius, currently in a promotable slot, promotion target not already passed in the
  walk order, not wounded — every clause already enforced inside the existing pure functions).
  Picking a recipient calls `Sched.giveTurn` directly; it already handles both markers' movement
  internally (recipient promoted, giver advanced as if he'd acted), so no separate
  `Sched.completeAction` call is needed afterward, unlike every other action this session added.
- **New "Make Aware" button**, gated on `makeAwareCandidates(giver)` — every unaware, unwounded US
  soldier within the commander's Command Radius. Picking a recipient sets `recipient.aware = true`
  and calls `Sched.applyBecomesAware`, then completes the giver's own turn normally
  (`Sched.completeAction`) — this one *isn't* a special case like Give Turn; it's an ordinary
  action whose effect happens to land on someone else.

**German-side Give Turn deliberately left unmodelled — a data gap, not missing logic.** §6/3's own
text limits it anyway ("A German commander will only give a turn to another German when one of his
action paragraphs explicitly states he is to do so"), and `assets/data/german_action_programs.js`
does contain 3 real `{ op: 'give_turn', rule: '...' }` occurrences with real tie-break rule strings
("fewest_turns_then_ws" and similar) — but no German soldier is ever flagged `isCommander`
anywhere in this codebase: `assets/data/german_roster.js` has no commander field on any card at
all, and the German spawn code in `mission1demo.js` hardcodes `isCommander: false`. Building real
recipient-selection logic for those rule strings would be dead code — the branch can never
legitimately fire regardless of how faithfully it's implemented, since `Sched.canGiveTurn`'s very
first check is `if (!giver.isCommander) return not ok`. Left as the pre-existing "Not Modelled"
stub, now with this reasoning recorded in a comment rather than an unexplained gap.

## 2. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (unaffected — no pure-logic module
  changed), `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known
  non-failures).
- **Live via Playwright, real state, via new `giveTurnCandidatesForTesting`/
  `doGiveTurnForTesting`/`makeAwareCandidatesForTesting`/`doMakeAwareForTesting` debug hooks**
  (same convention as every prior task's hooks):
  - `Make Aware` confirmed clean end to end on the first attempt: a forced-unaware soldier
    correctly appeared as a candidate, `doMakeAwareForTesting` correctly flipped `aware` to `true`
    and moved his AR marker to Complete, zero errors.
  - `canGiveTurn`'s rejection reasons were confirmed accurate one at a time on a real Round-1
    track: `slot-already-passed` for two soldiers already resolved past the promotion target this
    early in the walk, `recipient-out-of-radius` for one placed 3+ hexes from the commander — both
    genuinely correct outcomes for that specific track state, not bugs.
  - `giveTurn` itself correctly enforces "it must actually be the giver's turn"
    (`assertCurrentActor`, the identical precondition every other action in this file already
    has) — confirmed by constructing a clean, minimal, legitimate track state (giver at the walk's
    first slot, recipient in Complete within radius) and calling it for real: the recipient
    promoted from Complete to a real 1-Turn slot, the giver correctly advanced to Complete as if
    he'd acted, zero errors.
  - Not separately attempted: clicking the real in-game buttons during a genuinely-live turn — the
    debug-hook runs above already exercise the identical `Sched.giveTurn`/`applyBecomesAware`
    calls `doPlayerGiveTurn`/`doPlayerMakeAware` make, and this session's prior four tasks
    established that scripted short playthroughs rarely reach a specific soldier's live turn by
    chance; not worth re-litigating here.

## 3. Next

Per the standing order, #58 (Wound effects + free stance change) is next.

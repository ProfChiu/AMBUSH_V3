# 42 — Group Movement (Task #67)

**Date:** 2026-08-11
**Task:** #67 in the standing order (`docs/32_HANDOFF.md` §3) — no blockers, next after Task #66.
**Follows:** `docs/41_CONDITION_CHANGE_ROUNDS.md` (session 58, Task #66).

**Deliverables:** `apps/game/mission1demo.js`, `apps/game/mission1.html` (new checkbox row). No
changes to `movementrules.js` — `stackingLegal()`/`groupMoveParagraphCheckCount()` already existed
(both trivial, "always true" / "1 if the group is non-empty"), and neither actually needed a
caller: stacking has no limit to enforce (nothing anywhere in this codebase ever checked hex
occupancy before allowing a move), and the real work is entirely about the Paragraph Check
economy, which `runParagraphCheck`'s existing single-mover shape already handles once fed the
right soldier.

---

## 1. Scope: Operations only

§5/3: "Any number of soldiers in the same hex in the same stance can move into an adjacent hex
together. Each time a group move is performed, only one Paragraph Check is conducted." This
clause lives under §5 (Operations) specifically — §6/7's Rounds "Move" action has no equivalent
text, and structurally couldn't: Rounds movement is one soldier's own turn on the Action Round
Track, not a turn multiple soldiers share. Scoped this task to Operations movement only, matching
where the rule actually applies.

## 2. What changed

- **`groupAt(s)`**: every active, non-exited US soldier sharing `s`'s hex *and* stance, including
  `s` himself — the group he *could* optionally move together with.
- **New "Move as group" checkbox**, shown only when `groupAt(selectedSoldier())` has more than one
  member, always reset to unchecked on a fresh selection (an explicit per-move opt-in, not a
  sticky mode) — moving a lone soldier is unaffected either way; a soldier who happens to share a
  hex with others is still moved *alone* by default unless the player deliberately checks the box.
- **`doMove(hexId)`**: when the checkbox is checked, every soldier in `groupAt(s)` moves to the
  destination together, and `runParagraphCheck` is called exactly **once**, using
  `highestPcOf(group)` as the mover — reusing §5/1's already-implemented "highest PC only" rule
  for a multi-soldier hex (the same one a lone mover already exercises trivially) rather than
  teaching `runParagraphCheck` a new "which soldier(s)" concept. The confirmation pop-up names
  every soldier moving and says so explicitly ("one Paragraph Check for the group, §5/3").

## 3. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (unaffected — no pure-logic module
  changed), `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known
  non-failures).
- **Live via Playwright, entirely through the real UI (no debug hooks needed)** — Operations
  movement has no RNG-driven turn order to fight, unlike every Rounds-phase action this session:
  - Co-located two soldiers, selected one via a real counter click: the group-move row correctly
    appeared with count 2; checking it and clicking a real destination marker moved *both*
    soldiers there, logged as a single group move.
  - A solo soldier (alone in his hex): the group-move row correctly stayed hidden, and his move
    worked exactly as it always has.
  - Re-selecting a soldier who has a stack-mate: the checkbox correctly defaulted back to
    unchecked (not sticky from a prior selection); moving *without* checking it moved only the
    selected soldier, correctly leaving his stack-mate behind — confirming the feature is a real
    opt-in addition, not a change to the existing single-soldier behavior.
  - Zero console errors across every run.

## 4. Next

Per the standing order: #69 (Prepare Weapon) is next.

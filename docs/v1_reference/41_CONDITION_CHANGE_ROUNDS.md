# 41 — §6/11 Condition Changes During Rounds (Task #66)

**Date:** 2026-08-11
**Task:** #66 in the standing order (`docs/32_HANDOFF.md` §3) — no blockers, next after Task #65.
**Follows:** `docs/40_PANIC_EFFECTS.md` (session 57, Task #65).

**Deliverables:** `apps/game/mission1demo.js`, `apps/game/operationsloop.js`,
`tools/test_operations_loop.js` (new tests). This session also switched to a better rulebook
source per direct user instruction: `source/converted/Ambush_Rules_with_Errata_R2.md` (a clean,
errata-corrected, already-converted markdown) instead of re-running PDF OCR extraction per lookup
— recorded as a standing reference memory for future sessions.

---

## 1. What §6/11 actually asks for, vs §5/5

§5/5 (Operations, already built — docs/31_VICTORY.md's `runConditionChange`) and §6/11 (Rounds)
share the same per-hex procedure — ascending hex order, Event Checks skipped but markers still
placed, every other paragraph type read normally — but differ in one load-bearing way:

- **§5/5**: "If a check causes a German to be activated, immediately commence Rounds (**do not
  check other hexes** occupied by US soldiers)."
- **§6/11**: "Conduct Paragraph Checks for **all** US occupied hexes... **All indicated German
  activations (if any)** occur using the procedure in **6/6**... Once all Paragraph Checks and
  activations are dealt with, **return to the Round in progress**."

Rounds does *not* stop early, and never starts a fresh Round — it resumes the one already
happening.

## 2. What changed

- **`operationsloop.js`'s `conditionChange`** gained one additive option,
  `stopOnActivation` (default `true` — every existing caller/test is unaffected, byte-for-byte
  same behavior). `false` makes it scan every occupied hex regardless of activations, matching
  §6/11 exactly; the per-hex logic itself (Event markers, paragraph reading, ascending order) is
  identical either way, so this stayed one function with a flag rather than a fork.
- **`mission1demo.js`**: the old `runConditionChange` was split into a shared
  `runConditionChangeScan(to, stopOnActivation, onFinish)` plus two thin callers —
  `runConditionChange` (§5/5: `stopOnActivation: true`, starts a fresh Round 1 if an activation
  occurred and Operations is still in progress) and the new `runRoundsConditionChange` (§6/11:
  `stopOnActivation: false`, `onFinish` is just `next` — the Round already in progress simply
  resumes, no new Round started). Both reuse the exact same
  `presentParagraphChain`/`afterParagraphChain` pipeline every other paragraph chain already
  goes through — a `activate_german` effect found mid-scan already gets folded in through §6/6's
  existing mid-Round activation procedure (`activateGermansSequentially`) with zero new plumbing,
  the same thing Task 74b's own notes already found true for German movement.
- **The dispatch point**: `afterParagraphChain` — the one place that already knows whether
  `phase === 'round'` when a paragraph's `pendingConditionChange` request is actually consumed —
  now picks `runRoundsConditionChange` vs `runConditionChange` based on that, rather than pushing
  a phase check onto every caller of `runParagraphCheck`/`runGermanParagraph`/`runEventPhase`.

## 3. Two real, pre-existing bugs found live while testing this — both fixed

Live-testing this task (see §4) surfaced two genuine correctness bugs in `afterParagraphChain`,
neither introduced by this task's own changes but both newly *exercised* by it — §6/11's
no-stop-early scan is far more likely to actually reach a paragraph combining German activation
with a condition change than §5/5's stop-early one ever was.

**Bug 1 — a condition change bundled into the same paragraph as a German activation was silently
dropped.** Some paragraphs (e.g. real Mission 1 paragraph 289: "activate Germans 9/15... go to
Condition 3") carry an `activate_german` effect whose own `conditionChange` field triggers
`ctx.setCondition` — the *same* hook a bare `set_condition` op uses. The old `afterParagraphChain`
checked for `activate_german` effects first and returned immediately on a match
(`activateGermansSequentially(...); return;`), so the `pendingConditionChange` that paragraph had
just set was never consumed at the point it was set — it sat latent (this function is the *only*
place that ever clears it) until some later, unrelated paragraph resolution happened to reach the
check, misattributing an old request to the wrong trigger. Fixed by always checking
`pendingConditionChange` once activation finishes (or immediately if there was none) — both
consequences of the same paragraph now apply in sequence rather than one silently winning.

**Bug 2 — even after fixing bug 1, a live repro still produced runaway recursion** (dozens of
identical "Condition changes to 3" log lines, then `Maximum call stack size exceeded`), traced to
`Ops.conditionChange`'s hexes being interpreted *synchronously* inside its own scan loop — a later
hex's `set_condition` can already be pending by the time an *earlier* hex (in presentation order)
finishes its own unrelated, empty-chain no-op and reaches the check first, an ordering quirk that
doesn't fully explain repeated re-triggering to the identical value on its own. Rather than chase
every possible re-entrant path through paragraph interpretation with certainty, fixed at the
source of truth instead: §5/5's own text — "Conditions always change from a lower number to a
higher number" — is now enforced directly. A request where `to <= opsState.condition` is treated
as a no-op. This is correct per the rule regardless of mechanism, and makes the recursion
*structurally* finite (Conditions run 1-6, so at most 5 real transitions are ever possible) rather
than depending on every caller getting `pendingConditionChange`'s lifecycle exactly right.

## 4. Verification

- `node --check` clean on `mission1demo.js`, `operationsloop.js`.
- Full regression: all 17 `tools/test_*.js` suites passing — `test_operations_loop.js` gained a
  real test for `stopOnActivation: false` (same fixture the existing stop-early test uses, mirror
  image assertions: both hexes visited, activation still reported), `verify_reference_data.py`
  152/152, `verify_assets.py` unchanged (same two known non-failures).
- **Live via Playwright, real dice, against real Mission 1 paragraph 325/289 (not a synthetic
  fixture) via a new `runRoundsConditionChangeForTesting` debug hook**: the exact scenario that
  first surfaced both bugs above — a soldier on a hex whose real paragraph chain (325 → 289)
  activates two real Germans (9/R, 15/L) bundled with a Condition 2 → 3 change, mid-Round — now
  resolves cleanly every time across five separate runs with real, unmocked dice: both Germans
  correctly appear on the map, the Condition advances exactly once (2, then 3 — no repeats), the
  Round correctly stays in progress throughout (`phase: 'round'`, same `roundNum`, never restarted
  or bumped to Operations), and the scan finishes with "resuming Round 1." Zero console errors in
  every run.

## 5. Next

Per the standing order: #67 (Group movement — one Paragraph Check per stack) is next.

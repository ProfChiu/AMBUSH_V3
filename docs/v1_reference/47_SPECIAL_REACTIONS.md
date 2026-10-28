# 47 — Special Reactions Triggerable Mid-Mission (Task #73, §6/8)

**Date:** 2026-08-11
**Task:** #73 in the standing order (`docs/32_HANDOFF.md` §3) — the last task on the list, no
blockers, next after Task #72.
**Follows:** `docs/46_CAPTURED_GERMAN.md` (session 60, Task #72).

**Deliverables:** `apps/game/mission1demo.js` only. `apps/game/germanactions.js` (the pure §6/8
resolution engine) needed **zero changes** — see §2 below for why.

---

## 1. What §6/8 actually says, and what was already built

> "Certain German action paragraphs and Movement Reference paragraphs call for a Special Reaction
> (identified by a letter) to be put into effect for the German you are moving. When a Special
> Reaction is in effect for a German, use the indicated Special Reaction column on his card
> instead of the current condition column... A Special Reaction is used only for the German that
> triggered it and remains in effect until another paragraph rescinds [it]... whenever a Special
> Reaction comes into effect, a new German Action Number is rolled... use the Action paragraph
> indicated by the new Action number and the Special Reaction column to determine what he does
> for the rest of the turn. The self-preservation column often takes precedence over the Special
> Reaction column [unless a paragraph specifically says otherwise]."

Setting a Special Reaction was already real, but **only at the moment of activation** —
`activate_german` paragraph effects already carry an optional `specialReaction` field
(`paragraphinterpreter.js`, wired well before this session), consumed by `arrules.js`'s
`resolveGermanActionParagraph`. What was missing is the "certain German action paragraphs... call
for a Special Reaction" half — an *already-active* German's own turn reading a paragraph that
changes (or rescinds) his Special Reaction mid-mission, not just at the moment he first appears.

## 2. Why `germanactions.js` needed no changes

`germanactions.js`'s `toAction()` is fully generic — it copies every field off a compiled program
op verbatim (`a.action = op.op`, then every other key passes through unchanged) and hands it to
the caller. `mission1demo.js`'s `performGermanActions()` dispatcher is the only place that
actually interprets an action's `.action` string; adding a brand new one there (`set_special_reaction`,
below) required no engine change at all — the exact "cheaper than it looks" pattern
`docs/32_HANDOFF.md` §3 already called out for several other tasks this session.

## 3. What changed

- **New `set_special_reaction` action**, handled in `performGermanActions` — sets
  `g.specialReaction` (an already-existing field, previously write-once-at-activation) and a new
  `g.specialReactionIgnoresSelfPreservation` flag (§6/8: "unless specifically noted otherwise...
  in a paragraph" — some Special Reactions explicitly say the German ignores self-preservation
  while it's in effect, e.g. the real paragraph text for Reaction Y: "This German ignores
  self-preservation while in Special Reaction Y"). `a.letter` of `null`/falsy rescinds it. Then
  re-enters `germanAutoTurn()` — "a new German Action Number is rolled... for the rest of the
  turn" — the exact same re-entry shape the pre-existing `reroll_action_number` action already
  used for a different trigger (paragraph 816).
- **`germanAutoTurn(opts)` gained an `opts.ignoreSelfPreservation` parameter** and its
  `selfPreservationActive` computation now reads, in order: an explicit one-time override (from
  paragraph 816's own text, see below) beats everything; then Task #72's freed-prisoner
  `forcedSelfPreservation` flag (unconditional, "for the rest of the mission"); then the normal
  proximity trigger, UNLESS the German's *current* Special Reaction is flagged as
  self-preservation-immune. Every existing caller is unaffected — `opts` is optional and the
  default (no override, no forced flag, no immune Special Reaction) is byte-for-byte the same
  boolean the old one-line version computed.
- **A real, reachable bug fixed along the way**: paragraph 816 was already compiled —
  `'816': [{ op: 'reroll_action_number', ignoreSelfPreservation: true }]` — and is genuinely
  reachable (GE 34/X's own SPECIAL S column, DIE roll 2, confirmed by reading
  `assets/data/german_roster.json` directly). But the OLD `reroll_action_number` handler called
  `germanAutoTurn()` with no arguments at all, silently discarding `a.ignoreSelfPreservation` —
  meaning 816's own explicit instruction ("Ignore the self-preservation Reaction...") was never
  actually honored. Since 816 is only ever reached *via* the self-preservation column in the first
  place (by definition, a US soldier must be nearby), the un-fixed code would immediately
  recompute `selfPreservationActive = true` again on the reroll and just pick a different
  self-preservation-column paragraph — the opposite of what the paragraph says to do. Now fixed:
  `germanAutoTurn({ ignoreSelfPreservation: !!a.ignoreSelfPreservation })`.

## 4. What's flagged, not built: no Mission 1 data reaches `set_special_reaction` today

Every "Put Special Reaction [letter] into effect for this German" paragraph found in
`assets/data/paragraphs.js` (37, 254, 285, 287, 567, 611, 612, 624, 707, 772, 775, 885, 954, 957,
960, 961, 974, 978, 984 — the mid-mission ones, as opposed to the already-working activation-time
ones) was cross-checked two ways: (1) against `assets/data/paragraph_programs.js`'s own documented
72-number reachable-from-Mission-1's-Mission-Cards set — none present; (2) against every DIE-table
cell (all columns, not just the SPECIAL ones) on Mission 1's six real German cards (GE 9/R, 15/L,
32/S, 33/V, 34/X, 53/S) — none present; (3) against every currently-uncompiled `goto` target
already referenced somewhere in `german_action_programs.js`'s compiled tree — only one exists
(869), and its real text has nothing to do with Special Reactions. **None of these paragraphs are
reachable with Mission 1's actual data**, so `set_special_reaction` is wired but genuinely
unexercised by any real playthrough today — matching the same "flag the gap, don't invent
unreachable logic" convention already used for §6/10 (Task #71) and the bazooka/satchel
preparation states (Task #69). The mechanism is forward-compatible for a future mission whose
data does reach one.

## 5. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing, `verify_reference_data.py` 152/152,
  `verify_assets.py` unchanged. `tools/test_german_actions.js` (the pure `germanactions.js` engine
  suite) is untouched and still passes, confirming the claim in §2 — no engine change was needed.
- **Live Playwright verification was attempted but not completed for `set_special_reaction`
  itself.** A new `performGermanActionForTesting` debug hook was added (drives the real
  `performGermanActions()` directly with a synthetic action — same "drive the real function"
  convention as every other hook this session) specifically for this. The attempt surfaced a real
  test-harness race worth recording for future sessions: the instant a spawned German's Initiative
  Roll popup is dismissed, `driveNext()` synchronously arms `setTimeout(germanAutoTurn, 500)` for
  his *real* auto-turn — racing any scripted intervention that follows. Neutralizing
  `window.setTimeout` in the page right before that dismissal (`page.evaluate("() => {
  window.setTimeout = function(){}; }")`) reliably wins that race in principle, but getting a
  clean end-to-end run through squad-gen → entry placement → spawn → this neutralization →
  the synthetic action, all in one script, repeatedly hit the same squad-gen/entry-placement
  driver slowness already documented for Tasks #71/#72 and didn't finish in reasonable time. Per
  the precedent set in `docs/44_SNAP_FIRE_COMBO.md` and reused for Tasks #71/#72, this is shipped
  on code-review + regression strength: `set_special_reaction`'s handler is a direct field
  assignment (`g.specialReaction = a.letter || null; g.specialReactionIgnoresSelfPreservation =
  !!a.ignoresSelfPreservation;`) followed by the exact same `germanAutoTurn()` re-entry call the
  pre-existing, already-proven `reroll_action_number`/`set_condition` handlers use — not new
  branching logic, and directly traceable by inspection.
- **The `ignoreSelfPreservation` fix to paragraph 816's path was likewise verified by code review
  and the full regression suite, not by a live click-through** — reaching GE 34/X's SPECIAL S
  column at exactly DIE roll 2, in a live scripted session, depends on random turn order and dice
  the same way several other Rounds-phase mechanics this session already documented as impractical
  to force live; the fix itself is a one-line, easily-traced parameter-threading change (confirmed
  by reading both the caller and `germanAutoTurn`'s new signature side by side) rather than new
  branching logic.

## 6. Next

This was the last task on the standing order (`docs/32_HANDOFF.md` §3) — all 20 tasks are now
done. See `PROGRESS.md` for the session wrap-up.

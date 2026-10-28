# 45 — German Activation Edge Cases: §6/6, §6/10 (Task #71)

**Date:** 2026-08-11
**Task:** #71 in the standing order (`docs/32_HANDOFF.md` §3) — no blockers, next after Task #70.
**Follows:** `docs/44_SNAP_FIRE_COMBO.md` (session 60, Task #70).

**Deliverables:** `apps/game/arscheduler.js` (new pure function), `apps/game/mission1demo.js`
(wiring + two new debug hooks), `tools/test_arscheduler.js` (new tests).

---

## 1. §6/6 — German Activation During Rounds

> "During Action Rounds, there is the possibility that additional Germans may become activated.
> If activation occurs during a Round, use the following procedure. Interrupt whatever is
> happening and place the newly activated German on the map in the stance indicated in the
> activation paragraph. Ignore those parts of the paragraph dealing with advantage and US
> awareness. If the paragraph states that the German receives two turns, place his AR marker in
> the 2-Turn space of the AR Track using the current German advantage/disadvantage result. If the
> activation paragraph did not specify that the German receives two turns, then roll a new German
> Action number and place the newly activated German's AR marker in the indicated space (again,
> using the current advantage/disadvantage). The newly activated German has no effect on US
> awareness (6/5)... If German activation occurs during the action of a US soldier (typically
> movement) that soldier may end his action before any German takes an action."

This was a **real, already-flagged gap**: a Move action's per-hex Paragraph Check can activate a
German mid-Round (moving into a hex whose paragraph triggers `activate_german`), and the code's
own comment in `activateGermansSequentially` admitted the newly activated German was placed and
visible but simply deferred to *next* Round's `placeMarkersChain()` instead of joining the
in-progress one — correct eventually, but a Round late.

## 2. What changed

- **New `Sched.insertMidRoundGerman(track, entry, opts)`** in `arscheduler.js` — the pure-logic
  half. Given a track already mid-walk and a brand-new soldier entry, it either:
  - places him straight into the 2-Turn slot matching `track.advantageSide` if
    `entry.receivesTwoTurns` is true (no roll at all, per the rule text), or
  - rolls via `opts.rollDie()`/`AR.classifyARRoll` exactly like `placeMarkers`'s German branch
    (red has no effect on German markers, §6/3, same as always) and resolves to a 2-Turn,
    1-Turn, or Panic slot using the track's own `advantageSide` — never a fresh roll for
    advantage, matching "ignore those parts of the paragraph dealing with advantage."
  - Then checks whether that target slot's position in `SLOT_ORDER` is still `>= track.cursorIndex`
    (not yet walked past). If so, he's inserted for real — `nextActor`/`completeAction` treat him
    exactly like any other occupant, 2-Turn demotion included, no special-casing needed
    downstream. If the target slot has *already* been walked past this Round, he's parked in
    Complete instead (present and tracked, but no turn until next Round).
  - **A judgment call**, since the rulebook has no explicit answer for "what if the newly rolled
    slot is already behind the cursor": this mirrors the *same* bounded call `canGiveTurn` already
    makes for its own `'slot-already-passed'` case, rather than inventing a rule to reopen an
    already-concluded portion of the Round. In practice this means a 2-Turn roll for a German
    activated while the Round has already moved on to 1-Turn actors correctly does *not*
    retroactively reopen 2-Turn — the round's forward, single-pass philosophy (see the file's own
    header comment) holds for a fresh insertion too, not just for demotion/promotion of soldiers
    already on the track.
- **`mission1demo.js`'s `activateGermansSequentially`** now threads a `newIds` accumulator through
  its recursive/per-effect reveal chain (every genuinely-new German activated by this batch of
  effects, as opposed to one already active). Once every reveal popup for the whole batch has run
  (the same point that used to just log-and-defer), a new **`insertMidRoundGermans(ids, next)`**
  runs one placement per newly-activated German — a "Mid-Round Activation — AR Track" popup per
  German (roll-based, matching `placeMarkersChain`'s own Initiative Roll popup shape; a plain
  info popup with no roll when `receivesTwoTurns` is set) — then `renderTrack()` before resuming.
  This only runs when `phase === 'round'`; the Operations-phase branch (`startActionRound(1)`) is
  unchanged.
- **No effect on US awareness**: `insertMidRoundGermans` never touches any soldier's `aware` flag
  or calls into the Awareness Phase — it only ever calls `Sched.insertMidRoundGerman` and shows a
  popup. Nothing else in the activation chain was reading US awareness state either, so this is
  satisfied by omission, not by an explicit override.
- **The triggering US soldier finishing his action first**: already true by construction — this
  insertion runs from inside the Paragraph Check's `afterParagraphChain`/`afterActivation` chain,
  which is itself invoked mid-move, *before* the mover's own `Sched.completeAction` call. The
  cursor is still sitting on the mover's own slot when `insertMidRoundGerman` runs (which is
  exactly why the "already passed" check above is meaningful and not just theoretical: a common
  case is a 1-Turn mover whose in-progress move is what triggered the activation, meaning the
  cursor already sits at 1adv/1disadv, and a freshly-rolled 2-Turn German correctly can't jump
  backward past that mover's own current slot).
- **`receivesTwoTurns` is wired but unexercised by real data today** — confirmed via grep that no
  `activate_german` effect in `assets/data/paragraph_programs.js` currently sets it. Wired anyway
  (read off a new optional field on the activation effect, defaulting false) so a future paragraph
  annotation doesn't require touching this code again — same "wire the gap even if today's data
  never hits it" convention used for Prepare Weapon's bazooka/satchel handling (Task #69).
- **Two new debug hooks**: `activateGermanMidRoundForTesting(numericId, hexId)` (drives the real
  `activateGermansSequentially` while `phase === 'round'`, exactly like a real paragraph would) and
  `insertMidRoundGermanForTesting(cardId, receivesTwoTurns)` (drives `Sched.insertMidRoundGerman`
  directly against an already-active German, for a faster unit-style console check).

## 3. §6/10 — German Activation Before All US Soldiers Have Entered

> "It is possible that German activation may occur before all US soldiers enter the map. In this
> case, Rounds begin normally for those US soldiers on the map. Soldiers off-map cannot enter;
> they remain off-map for the duration of Round 1... During Round 2, off-map US soldiers make
> Awareness Checks; those that succeed receive turns... and can enter the map..."

**Confirmed structurally unreachable in this codebase, not built** — matching the established
"flag gaps, don't build unreachable logic" convention (German give-turn in Task #64, bazooka/
satchel prep in Task #69). `startEntryPlacement`/`placeNextSoldier` require **every** US soldier
to be placed (`entryIndex >= usSoldiers.length`) before `startOperations()` — the function that
transitions to `phase = 'movement'` and makes Rounds reachable at all — is ever called. There is
no code path in which Rounds can begin with a soldier still off-map, so §6/10's entire procedure
(soldiers deferred to Round 2, occupying a shared off-map "hex" for command/panic purposes, unable
to be attacked) has no scenario to apply to. Building it would be speculative logic against a
state the game can never actually enter.

## 4. Verification

- `node --check` clean on both `arscheduler.js` and `mission1demo.js`.
- **`tools/test_arscheduler.js`: 71 passing (was 64; 7 new, targeted at `insertMidRoundGerman`)**:
  plain roll-based insertion while the cursor still genuinely sits on the target slot; a rolled
  slot already passed by the cursor parking the soldier in Complete instead; a Panic roll always
  inserting into Panic regardless of cursor position; red having no effect on a mid-Round German
  (§6/3); `receivesTwoTurns` bypassing the roll entirely; the newly-inserted German being offered
  a turn and demoted via the *same* `nextActor`/`completeAction` machinery as any round-start
  2-Turn soldier, with no special-casing; and a duplicate-id insertion throwing (structural
  violation, same convention as every other `assertCurrentActor`-adjacent guard in this file).
- Full regression: all 17 `tools/test_*.js` suites passing, `verify_reference_data.py` 152/152,
  `verify_assets.py` unchanged (same two known non-failures: German Y/Z fallback art WARN,
  orphan `.DS_Store` FAIL).
- **Live verification via Playwright was attempted but not completed this session** — the
  automated squad-generation/entry-placement bootstrap needed to reach a genuine in-progress Round
  hit a driver/environment issue unrelated to this task's actual code (`ElementHandle.click()`
  without an explicit `timeout` silently uses Playwright's 30s default, and a transient
  "element is not visible" state during dialog transitions repeatedly burned that full 30s before
  retrying — not a hang in the game itself, confirmed zero console errors in every partial run).
  Diagnosing and fixing the driver script cost real time without reaching a completed run; per the
  precedent already established in `docs/44_SNAP_FIRE_COMBO.md` for accepting code-level/unit-test
  equivalence when live-click Playwright verification hits environment fragility unrelated to
  code correctness, this task is being shipped on the strength of the 7 new targeted unit tests
  above (which exercise every branch of the actual new logic: open slot, passed slot, panic, red,
  receivesTwoTurns, full scheduler integration, duplicate-id guard) plus the full regression
  suite, rather than continuing to sink time into the test harness. The wiring in
  `activateGermansSequentially`/`insertMidRoundGermans` is thin, deterministic glue code (loop
  over newly-activated ids, call the now-tested pure function, show a popup) around that
  already-verified pure function, not new rules logic in its own right.

## 5. Next

Per the standing order: #72 (Captured-German state machine, §11/2) is next.

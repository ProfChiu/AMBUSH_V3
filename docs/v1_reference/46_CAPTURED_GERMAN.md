# 46 — Captured-German State Machine (Task #72, §11/2)

**Date:** 2026-08-11
**Task:** #72 in the standing order (`docs/32_HANDOFF.md` §3) — no blockers, next after Task #71.
**Follows:** `docs/45_GERMAN_ACTIVATION_EDGE_CASES.md` (session 60, Task #71).

**Deliverables:** `apps/game/mission1demo.js` (state machine + wiring), `apps/game/mission1.html`
(new "Bring captured German along" toggle). No new pure-logic module — every piece reuses an
already-tested pure function (`Sched.removeFromRound`, `losClear`, `AR.resolveGermanActionParagraph`
via `germanAutoTurn`, `Sched.placeMarkers` via `startActionRound`/`placeMarkersChain`); this task is
entirely state-machine/wiring work, matching the "cheaper than it looks" pattern `docs/32_HANDOFF.md`
already called out for the remaining tasks.

---

## 1. What was already built vs. what this task closes

`assaultrules.js`'s own header (written during Task #27) explicitly scoped out "the full §11/2
Captured-status state machine" while noting the first half was already correct: `applyCapture`
(in `mission1demo.js`) already set `status: 'captured'`, forced prone, set `isActive = false`, and
called `Sched.removeFromRound` — matching "falls prone... AR marker immediately moved to the
Inactive space... loses any turns... does not receive any turns until he is free." That part
needed no changes.

Flagged as NOT built: "guarding, changing guards, a captured German's reduced Movement Allowance
while being moved, and the freeing conditions when left without an active US soldier."

## 2. What changed

- **Freeing conditions (the actual state-machine trigger)** — new `checkCapturedGermanEscapes()` +
  `freeGerman(g)`. Scoped to `phase === 'movement'` only, matching the rule's own words ("During
  Operations..."); capture only ever happens via Assault (a Rounds-only action), so a captured
  German can only become unguarded once Rounds has already ended and control has returned to
  Operations. Scans every German ever activated (`allGermans()`, a new helper — `activeGermans()`
  would skip a captured German entirely, since `isActive === false`), and for each one still
  `status === 'captured'`, checks whether any active US soldier shares his hex:
  - **Guarded** (at least one active US soldier co-located): no-op.
  - **Unguarded, but a US soldier is in LOS** (`losClear`, the same pure LOS-tracer function
    `lossandbox.html`/target selection already use): `status` reverts to `'unharmed'`,
    `isActive = true`, every active US soldier is marked `aware = true` ("all US soldiers are
    automatically aware of him" — matching this codebase's existing single-boolean-per-soldier
    simplification of "awareness," the same field §6/5's Awareness Phase already reads/writes),
    and `startActionRound(1)` commences Rounds immediately — "receives turns normally beginning
    the next Action Round" is satisfied by his going through the exact same fresh `placeMarkers`
    roll every other Round-1 soldier gets.
  - **Unguarded and no US soldier in LOS**: "removed from the map permanently (he ran away)" —
    `isActive` stays false, his counter element is removed, no VP/casualty record is touched (he
    was never a kill/incapacitation, and §2's capture-VP already fired at the moment of capture).
  - Either way, `g.forcedSelfPreservation = true` is set — "Use the Self-preservation column...
    regardless of the Condition or subsequent directions given in paragraphs) for the rest of the
    mission." This reuses `germanAutoTurn`'s existing `selfPreservationActive` computation
    (built for the normal proximity trigger) by simply OR-ing in the forced flag, rather than
    building a parallel behavior-selection path.
  - Called from three real trigger points: the Rounds→Operations transition (`endRound`, when the
    last active German count drops to zero), after every Operations `doMove` (both solo and group
    moves), and after `tryExit` (a soldier leaving the map can also leave a prisoner unguarded).
    All three correctly short-circuit their own follow-up UI work if freeing just flipped `phase`
    back to `'round'` out from under them.
- **"Move Captured German" (§5/3)** — confirmed via `source/converted/Ambush_Rules_with_Errata_R2.md`
  that this is listed **only** under §5/3's Operations action list, never under §6/7's Rounds
  action list — captured Germans never move during Rounds at all (unsurprising, since they never
  get a turn there either). Since this codebase's Operations movement is already completely
  untimed/untracked (no MP accounting at all — confirmed via the existing comment on
  `legalAdjacentHexIds`), §11/2's "Movement Allowances of the German and his guard are reduced to
  2" has no observable effect to model here; the only real missing piece was giving the player a
  way to actually relocate a prisoner. New `capturedGermansAt(hexId)` + a `bringPrisonerRow`
  toggle (same opt-in-checkbox pattern as Group Movement's `groupMoveToggle`, Task #67), defaulting
  OFF each time a soldier is selected — leaving him behind (§11/2's own "voluntary release") is a
  legitimate default, not an oversight to guard against. When checked, `doMove` moves the
  captured German's `hexId` alongside the mover's group.
- **"Guard" is never tracked as its own field** — a judgment call, not an oversight. Whichever
  active US soldier(s) currently share the captured German's hex are implicitly his guard(s);
  there is no persisted `guardId` and therefore no "change guard" UI. §11/2's "changing guards...
  costs nothing" mechanic becomes moot under this model — the effective guard is just whoever's
  there, and swapping which specific soldier that is has no state to change.
- **The guard's crew-weapon-firing restriction** ("A US soldier guarding a captured enemy soldier
  can perform all Actions normally during Rounds, with the exception of firing a crew weapon") —
  **BUILT 2026-09-06 (session 63, Task A2)**, once Task A1 wired §9/7 crew weapons into the fire
  flow and gave this rule something to restrict. `guardsAPrisoner(s)` is simply "is there a
  captured German in my hex", consistent with this document's own decision not to track a
  `guardId`; it suppresses both the guard's own crew-weapon fire and his eligibility to act as a
  second crewman for someone else's (combining actions to aim the weapon is firing it). The
  original note below is kept as the record of why it waited.

  *Original note:* **NOT built, flagged rather than guessed at**. `crewweaponrules.js`'s own header already states
  the §9/7 two-soldier crew-weapon firing mechanic itself is pure logic that's never actually
  wired into the player's fire-button flow (confirmed: zero references to `AmbushCrewWeapons`
  anywhere in `mission1demo.js`) — a real, separate, pre-existing gap outside this task's scope.
  Restricting an action that doesn't exist yet in the UI would be dead code.

## 3. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (unaffected — no pure-logic module
  changed), `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known
  non-failures).
- **Live via Playwright, real squad generation, real entry placement, via new
  `checkCapturedGermanEscapesForTesting` debug hook**: fabricated a captured German co-located
  with a real US soldier — confirmed `checkCapturedGermanEscapesForTesting()` correctly left him
  `status: 'captured'`, `isActive: false` (still guarded, no-op). Then moved every US soldier off
  his hex and re-ran the check — confirmed he correctly flipped to `status: 'unharmed'`,
  `isActive: true`, `phase: 'round'` (Rounds correctly commenced), `forcedSelfPreservation: true`.
  Zero console errors throughout.
- **Not independently re-verified live**: the "no US soldier in LOS → removed permanently" branch
  (would need careful terrain/blocking-hex setup to guarantee a blocked LOS in a live run) and the
  "Bring captured German along" UI toggle's literal button click. Both are code-reviewed and
  reuse already-verified pure functions (`losClear` — the same function `lossandbox.html`'s own
  verified interactions exercise — and simple array/hexId assignment matching the existing,
  already-proven Group Move pattern) rather than new logic of their own; accepted on that basis,
  matching the precedent already set in `docs/44_SNAP_FIRE_COMBO.md` for a bounded, code-level
  equivalence argument in place of exhaustive live-branch coverage.

## 4. Next

Per the standing order: #73 (Special Reactions triggerable mid-mission, §6/8) is next.

# 40 — Panic Effects (Task #65)

**Date:** 2026-08-11
**Task:** #65 in the standing order (`docs/32_HANDOFF.md` §3) — no blockers, next after Task #58.
**Follows:** `docs/39_WOUND_EFFECTS.md` (session 56, Task #58) — same pattern as that task: read
every clause against the code first, only build what's genuinely missing.

**Deliverables:** `apps/game/mission1demo.js`, `apps/game/arrules.js` (one small, additive change),
`tools/test_action_round.js` (updated a stale comment into a real test). No new pure-logic module.

---

## 1. What §13/1 actually needed

§13/1 lists four Panic consequences. Checked all four against the code before writing anything:

| Clause | Status found |
|---|---|
| Loses remaining turns, AR marker to Panic space, can perform no actions (including free stance change), remains immobile for the Round | Already done — `Sched.applyPanicStatus` moves the marker; `'panic'` isn't in `arscheduler.js`'s `WALK_SLOTS`, so `nextActor` structurally can never select a panicked soldier, guaranteeing "no actions" for free |
| Panicked commander has no command radius, cannot give turns or make others aware | **Half-true, half-missing** — see §2 below |
| Cannot use WS defending against an assault | Already done — `assaultOpts`'s `defenderPanicked` flag, checked in `assaultrules.js`'s hit-chance computation |
| Falls prone at end of Round if not already prone | **Missing — built here** |

Two real gaps, not the four the task name might suggest.

## 2. The command-radius gap — already flagged in the code, now closed

`AR.commandContributors` (`arrules.js`) already had a `!s.isActive` filter that correctly excludes
an *inactive* commander's radius, and its own test file (`tools/test_action_round.js`) carried an
honest comment: "A commander who becomes inactive/panicked exerts no radius — not modeled as a
separate flag here (that's state the caller tracks)." That was true but incomplete — no caller
ever actually tracked it. `mission1demo.js`'s `placeMarkersChain` built its command roster with no
panic information at all, so a panicked commander's Command Radius kept silently influencing
other soldiers' in/out-of-command status, exactly the case the rule forbids.

Fixed with one additive field rather than reusing `isActive` (which would have been wrong): a
panicked commander must still count toward another soldier's command total when they're
**co-located** — that's just "another soldier here," not a commander power — he only loses the
**radius** projection into hexes he isn't physically in. `commandContributors`'s two branches
already treated co-location and radius separately, so `else if (s.isCommander)` became
`else if (s.isCommander && !s.panicked)`, and `placeMarkersChain` now passes
`panicked: s.status === 'panicked'` on every US roster entry. `giveTurnCandidates`/
`makeAwareCandidates` (Task #64) needed no equivalent fix — a panicked *giver* can never reach the
action panel in the first place (same `WALK_SLOTS` guarantee above), so the eligibility check on
the giver side is structurally moot, not silently wrong.

## 3. Falls prone at Round end

New `fallPronePanickedSoldiers()`, called from `endRound()` before branching on whether Rounds
continue. Keyed off `status === 'panicked'` (set the instant a damage/assault result panics
someone) rather than which AR Track slot the soldier's marker sits in — a soldier already in
Complete when panicked *stays* in Complete per `applyPanicStatus`'s own marker-placement exception
("unless it already occupies the Panic or Complete space"), but the fall-prone consequence applies
regardless of which slot the marker landed in. Applies to both sides — the same 'P' damage code
that panics a US soldier can panic a German.

**"If in Operations, the Panic result has no effect" — currently unreachable, not defended
against.** `applyDamage` (the only place a soldier's `status` can become `'panicked'`) is called
from exactly three places, all Rounds-only combat resolution (`fireChain`, `grenadeChain`,
`assaultChain`) — minefields/boobytraps (§12, `hazardrules.js`) are a fully-built pure module with
no caller yet, the same "resolved logic, no wiring" state grenades were in before Task #63. Until
a hazard can actually fire during Operations movement, this clause has nothing to guard against;
adding a defensive check for a path that can't currently be reached would be speculative, not
resolving a real gap.

## 4. Verification

- `node --check` clean on `mission1demo.js`, `arrules.js`.
- Full regression: all 17 `tools/test_*.js` suites passing — `test_action_round.js` now has a
  real test for the panicked-commander case instead of an acknowledged-but-untested comment (both
  the "no radius contribution" and "still counts via co-location" halves of the rule),
  `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known non-failures).
- **Live via Playwright, real state, via new `applyPanicForTesting`/`endRoundForTesting` debug
  hooks** (same convention as every prior task's hooks): a real panic result correctly set
  `status: 'panicked'` without touching stance immediately (matches "he remains immobile... at the
  end of the Round he falls prone" — not immediately); calling the real `endRound()` afterward
  correctly flipped his stance to prone and logged "Pvt. Mercer falls prone (panicked, §13/1)."
  Zero console errors throughout.

## 5. Next

Per the standing order: #66 (§6/11 Condition changes during Rounds) is next.

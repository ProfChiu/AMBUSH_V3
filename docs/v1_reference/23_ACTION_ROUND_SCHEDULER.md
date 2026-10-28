# 23 — Action Round turn-order scheduler (Phase 8 completion)

**Date:** 2026-08-01
**Phase:** 8 — The Action Round (`docs/11_GAME_BUILD_PHASES.md`) — **fully complete.** This is the
piece `docs/22_ACTION_ROUND.md` deliberately deferred: the stateful walk that actually drives a
Round through the AR Track in order, rather than just the rules that decide outcomes.
**Follows:** `docs/22_ACTION_ROUND.md`.

**Deliverables:** `apps/game/arscheduler.js`, `assets/data/ar_track.js`, `tools/test_arscheduler.js`
(40/40 passing), plus two small additive functions in `apps/game/arrules.js`
(`resolveAdvantage`, `classifyARRoll`, +7 tests in `tools/test_action_round.js`, now 44/44).

---

## 1. The chart existed already — just in the wrong place

`apps/trainer/ambushdata.js` already had a hand-transcribed, verified AR Track chart (die roll →
2-Turn/1-Turn/Panic space, per Initiative 0-5, with red-number subsets), checked against
`assets/extracted/reference/action_round_track.png`. It just lived only in the trainer, which
`apps/game/` doesn't depend on. Extracted it to `assets/data/ar_track.js` — `window.AMBUSH_AR_TRACK`,
matching the `assets/data/paragraph_programs.js` precedent (hand-authored data, not compiled,
`require()`-able by both the browser and Node test harnesses) — so the trainer and the real engine
share one source instead of two hand-copies that could silently drift if the chart is ever
corrected. The trainer's own `AR_TRACK` is now just `const AR_TRACK = window.AMBUSH_AR_TRACK;`, byte
-identical values, verified by loading the actual trainer page (not just a syntax check) and
confirming `AR_TRACK[3]` and `AR_DRILL`'s length matched before and after with zero console errors.

## 2. Two small additions to `arrules.js`, not the new module

`resolveAdvantage(usRoll, germanRoll)` (§6/1 step 1 — ties go to Germans) and
`classifyARRoll(arTrack, inRating, roll)` (chart lookup → `{space, isRed}`, deliberately *not*
applying the wounded/command exceptions — that stays `resolveMarkerPlacement`'s job) landed in
`arrules.js` rather than the scheduler: both are stateless "data + roll + rule → result" lookups,
the same shape as the file's existing `resolveGermanActionParagraph`, and `arrules.js`'s own header
already commits its scope to "AR Track, initiative, ... turn order." Purely additive — no existing
function signature changed, and the existing 37 checks in `tools/test_action_round.js` stayed green
throughout.

## 3. The scheduler (`apps/game/arscheduler.js`)

Owns a plain mutable "track" object — same pattern as `operationsloop.js`'s `createGameState()`,
not a class — walking `SLOT_ORDER = ['2adv', '2disadv', '1adv', '1disadv']` in a single forward
pass. That single pass is enough to handle a 2-Turn soldier's marker demoting mid-Round and acting
again later in the *same* pass, because 2-Turn slots always precede their matching 1-Turn slot in
that fixed order — a demotion always moves a soldier *forward* into a not-yet-processed slot, never
backward into one already exhausted. Each slot is re-checked for new arrivals (from a demotion or a
given turn) before the walk advances past it.

`placeMarkers` does the initial AR Marker Placement (§6/1 step 2): for each active roster entry,
roll → `classifyARRoll` → (for US, on a red result) `isInCommand`/`commandContributors` →
`resolveMarkerPlacement` → final slot, split into the advantage or disadvantage half of whichever
Turn-space based on the soldier's own side vs. the Round's `advantageSide`. One real rule caught
here: **red has no effect on German markers at all** (§6/3: "German soldiers panic only when their
initiative die roll result is actually printed in the Panic space... never as a result of their
roll being printed in red") — `placeMarkers` only runs the command-lookup/red branch for US
soldiers; a German's red roll is resolved directly off its plain (non-red) space, unconditionally.

`nextActor`/`occupantsOf` return the next legal actor (or full slot order) per slot, with the
tie-break split described below. `completeAction` records that the current actor acted and
advances his marker — demote-on-first-action for a 2-Turn soldier, Complete otherwise.
`canGiveTurn`/`giveTurn` implement §6/3/§6/7's giving-turns mechanic.

## 4. Giving turns: precedence, and the "slot already passed" ruling

Eligibility, checked in order: giver must be a commander; recipient must be friendly (same side);
recipient's hex must be within the giver's Command Radius (`arrules.commandRadiusHexIds`);
recipient's current slot must be 1-Turn or Complete (`arrules.canReceiveGivenTurn`, already
excludes wounded soldiers and 2-Turn/Panic/anything else). A successful promotion moves
Complete→matching-1-Turn, or 1-Turn→matching-2-Turn (same advantage/disadvantage half as the
*recipient's own side*, not the giver's slot).

**A real ambiguity, resolved and documented rather than left implicit:** can a commander promote a
1-Turn friendly all the way up to 2-Turn if that side's 2-Turn window has already passed this
Round? Walking through when this is even reachable: Complete→1-Turn always targets one of the two
*last* slots in the fixed order, so it can never be "already passed." 1-Turn→2-Turn targets an
*earlier* slot — reachable only when the giving commander is himself still acting from within
`2adv`/`2disadv` (i.e., that side's 2-Turn window hasn't closed yet). Ruling: `giveTurn` compares
the target slot's index against the track's current cursor position and rejects with
`{ok:false, reason:'slot-already-passed'}` — **no state change at all**, not a silent no-op — if
the target has already been walked past. This isn't asserted as rulebook-certain (the rulebook
doesn't spell out this exact edge case); it's the reading that keeps the mechanic self-consistent,
documented honestly as a judgment call, tested directly (`tools/test_arscheduler.js` builds a track
with `2adv`/`2disadv` already exhausted and confirms both the rejection and that neither soldier's
marker moves).

## 5. Tie-break design and the throw-vs-`{ok:false}` contract

German order within a slot is alphabetical by AR-marker letter (§6/1, explicit, not overridable) —
derived straight from the real `Card ID` suffix in `assets/data/german_roster.json`
(`letterFromGermanCardId("GE 33/V") === "V"`; `"GE 19"`, the table-less Kubelwagen group card,
→ `null`, consistent with `arrules.js` already excluding that card from action-paragraph lookup).
US order is a genuine player choice — `nextActor`/`occupantsOf` accept an optional
`opts.chooseUS(candidateIds, track)`, defaulting to insertion order if omitted.

API contract, applied consistently: calling `completeAction`/`giveTurn` for a soldier who isn't
currently the legal actor (wrong slot, or a German out of alphabetical turn) **throws** — a caller
bug, matching `arrules.js`'s existing "fail loudly rather than silently guess" precedent (its
table-less-card throw). Whether a *proposed* give-turn is rules-legal returns **`{ok:false, reason}`**
instead — a real in-game outcome a UI needs to show the player without crashing, matching
`canReceiveGivenTurn`'s existing plain-boolean shape.

## 6. Verification

- `node --check` clean on `arscheduler.js`, `ar_track.js`, and every edited file.
- `tools/test_action_round.js`: **44/44 passing** (37 original + 7 for `resolveAdvantage`/`classifyARRoll`).
- `tools/test_arscheduler.js`: **40/40 passing** — placement across real chart data (including
  red, wounded-cap, German-red-has-no-effect, and disadvantage-side cases), the demotion-and-
  acts-again-later mechanic end to end, both tie-break rules, every give-turn eligibility branch
  including `slot-already-passed` with an explicit before/after state check, and structural-
  violation throws.
- Trainer regression: loaded `apps/trainer/index.html` for real (Playwright, via the `run-ambush`
  skill), confirmed `AR_TRACK[3]` and `AR_DRILL.length` unchanged and zero console errors after
  the relocation — the shared-data-file move didn't change trainer behavior.
- Full project regression (every suite built this session) — see `PROGRESS.md` for the count.

## 7. Next

This module answers "who acts, when, in what order" — it hands control back to a caller for what
actually happens: resolving a German's Action Paragraph number (`arrules.resolveGermanActionParagraph`,
already built) and then *acting on it* (movement, fire, targeting — Phase 9/combat, still not
built), or a US player's chosen action. Phase 9 is what turns a scheduler-selected actor into an
actual resolved action, and reports wounded/panicked/killed status back so the *next* Round's
`placeMarkers` roster reflects it.

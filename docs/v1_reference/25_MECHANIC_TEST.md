# 25 — Mechanic test: the skirmish demo (Phase 9.5)

**Date:** 2026-08-01
**Phase:** 9.5 — inserted between Phase 9 (Combat) and Phase 10 (`docs/11_GAME_BUILD_PHASES.md`).
Not on the original roadmap — requested directly: after Phase 9's first slice (core fire combat,
`docs/24_FIRE_COMBAT.md`) landed, the user asked "so can I test play this game now?" The honest
answer was no — every rules module since Phase 6 existed only as pure logic behind Node test
scripts, never wired to a screen. This phase is that wiring: not new rules, not new content, just
proof that everything built so far actually composes into something playable.
**Follows:** `docs/24_FIRE_COMBAT.md`.

**Deliverables:** `apps/game/skirmish.html`, `apps/game/skirmishdemo.js`, plus three additive
functions in `apps/game/arscheduler.js` (`applyWoundedStatus`, `applyPanicStatus`,
`removeFromRound`, +11 tests, `tools/test_arscheduler.js` now 51/51).

---

## 1. What this is, and isn't

A small standalone skirmish: two demo-authored US soldiers (not Mission 1's real briefed squad)
against one real German card (`GE 33/V`, Veteran Infantry, from
`assets/data/german_roster.js` — hand-transcribed and already used throughout Phase 8's tests),
on a real four-hex corner of Map A chosen and verified against the actual terrain/LOS data so the
opening position is genuinely blocked (§8/2 woods-blocks-same-elevation) and the first move or
two toward the tree line genuinely opens the shot. Every rules module runs for real:
`hexgrid.js`, `movementrules.js`, `losrules.js`, `checksrules.js`, `arrules.js`,
`arscheduler.js`, `firecombat.js` — nothing in the resolution path is scripted or faked.

**Deliberately out of scope**, matching each mechanic's own documented phase boundary, not
silently dropped:
- **Movement or snap-fire-and-move during Rounds** — §6/7's combined actions aren't built; a
  Round here is Fire (aimed/snap) or Pass only.
- **Giving turns** — `arscheduler.giveTurn` exists and is tested (`docs/23`) but this demo's two-
  soldier scale never gives a commander a reason to use it, so it isn't wired into the UI.
- **The German's Condition** — `GE 33/V`'s card has exactly one Condition column
  (`CONDITION 4`), so the demo always passes `4`. Real Condition tracking (§5/5) already exists
  in `operationsloop.js` but isn't wired here — this demo only needed a card whose Condition
  Change ladder never mattered for the roll to resolve correctly.
- **Grenades, assault, crew weapons** — not built yet (Phase 9's remaining slices).
- **The German's Action Paragraph text** — `arrules.resolveGermanActionParagraph` *is* called
  for real every German turn, against the real card table, and its result (a genuine paragraph
  number like `816` or `833`) is logged. What doesn't happen is rendering that paragraph's actual
  prose — only Mission 1's 71 reachable paragraphs are hand-annotated
  (`assets/data/paragraph_programs.js`); an arbitrary German card's action numbers reachable
  outside that specific mission context aren't guaranteed to be among them. The demo's own
  interpretation of "what the German does" is a fixed, documented stand-in: Best Fire (aimed)
  at the Closest Target (§9/6), which is a genuinely common instruction those paragraphs give,
  just not necessarily *the* instruction paragraph 816 specifically gives.

## 2. A real gap this found: combat damage had no way to move an AR marker mid-Round

Phase 8 built the scheduler assuming the only thing that moves a soldier's marker is *him acting*
(`completeAction`) or *a commander giving him a turn* (`giveTurn`) — both of which only ever
touch the current actor or a soldier the current actor is explicitly interacting with. Phase 8's
own doc said as much: simulating what happens when a soldier *takes damage* was explicitly Phase
9's problem, not Phase 8's. But nobody had actually hit that seam until this demo tried to fire
one soldier's weapon at another mid-Round and needed to move the *target's* marker — a soldier
who might not even be the current actor.

Three small additive functions in `arscheduler.js` close it, each a direct, literal reading of
one rule:
- `applyWoundedStatus(track, soldierId)` — §13/2: "loses any turns he has remaining in the
  current Round; move his AR marker to the Complete space." Works regardless of the soldier's
  current slot, including Panic (a wound is more specific than an existing panic placement).
- `applyPanicStatus(track, soldierId)` — §13/1: the Round-time Panic result, same shape, target
  slot is Panic instead of Complete.
- `removeFromRound(track, soldierId)` — §13/3-13/4: incapacitated or killed, marker to a new
  `inactive` slot bucket (added to the track's slot set), out of this Round and — since roster
  entries for a dead/incapacitated soldier would have `isActive: false` — out of every Round
  after it too.

All three deliberately skip `assertCurrentActor`: that check exists to catch a caller bug where
someone tries to act out of turn. A casualty isn't acting at all — combat damage can land on
whoever's in LOS, whatever slot they happen to occupy right now. `tools/test_arscheduler.js`
covers all three against every slot they can plausibly be called from, including the no-op case
of a soldier already in Complete and idempotency for an already-inactive soldier.

## 3. Verifying it — actually played, not just loaded

Loaded via the `run-ambush` skill's Playwright driver, headless, and driven through real
interaction rather than a single static screenshot:

- Selected a soldier, walked him from the blocked starting position (`B2`/`C3`, both verified
  BLOCKED to the German's `D5` hex against the real LOS data) toward the tree line. Confirmed
  the real Perception Check fires the instant LOS clears, and confirmed **both outcomes** happen
  across repeated runs — several genuine "no contact" failures (roll > PC) and several genuine
  "SPOTTED!" successes, all off real `Math.random()`, not scripted.
- Once sighted, played through multiple full Action Rounds via the actual UI: initiative rolls,
  red-number placement, the turn-order walk handing control between both US soldiers and the
  German in the correct order, Fire Aimed/Fire Snap/Pass all exercised.
- Watched the full §9/1 procedure resolve and log every step for real shots in both directions:
  jam checks, range/terrain/stance-derived Hit Chance breakdowns, to-hit rolls including a
  genuine 0-always-hits and a genuine 9-always-misses, damage rolls, and ammo checks.
- Watched the escalation ladder fire correctly from live play, not just its unit tests: a soldier
  wounded, then panicked by a second hit (correctly logged as staying **WOUNDED** — panic doesn't
  downgrade an existing wound, `docs/24`'s ladder), then incapacitated by a third
  (`escalateDamageResult('wounded', 'W') -> 'incapacitated'`).
  Watched `removeFromRound` correctly pull that soldier out of `usSoldiers` roster contention —
  the very next Round's German-targeting logic (`selfPreservationActive`, §6/8) correctly
  switched from the card's `SPECIAL S` column to `CONDITION 4` the moment that soldier was no
  longer active and adjacent, live, mid-playthrough.
- Watched the `lose` end-state render correctly (both US soldiers reduced to `isActive: false`,
  status banner switches to the lose styling, log records `SKIRMISH LOST`). The `win` path is the
  same function with one branch condition (`target.side === 'german'`) and wasn't independently
  screenshotted, but its two building blocks — `FC.escalateDamageResult` producing `'killed'` and
  `Sched.removeFromRound` — are each already covered by their own module's test suite.
- **Zero console/page errors across every run**, including runs that chained through a dozen-plus
  Rounds without a casualty (proves the loop itself doesn't leak or desync over repeated cycles,
  not just a single pass).
- One real bug found and fixed along the way: `endRound()`'s log line unconditionally said
  "no casualties," which went stale the instant this exact playthrough incapacitated a soldier
  mid-Round. Fixed to a plain "Round N complete" — the casualty itself is already visible from the
  preceding damage-result log line, so the summary line doesn't need to re-assert it.
- Full project regression: **1886 checks passing**, zero failures.

## 4. Next

Nothing here changes Phase 9's remaining scope (grenades, assault, crew weapons, minefields/
boobytraps, the Clear Jammed Weapon chart's data gap) or Phase 10 (Victory + Mission 1 wiring).
This was a checkpoint, not new content — the next real content phase is still finishing Phase 9.

---

## 5. Turn-by-turn variant (`skirmishchess.html`) — 2026-08-04

Once the skirmish demo existed, the honest follow-up question was pacing: the whole demo above
presents as instant text-log lines — a full fire exchange resolves and prints in one JS tick.
The user asked for a "chess game" feel instead: every step its own pop-up naming the actor and
the action, every die roll animated and paused-on before the game explains what it means.

**Deliverables:** `apps/game/skirmishchess.html`, `apps/game/skirmishchessdemo.js` — a separate
page, not an edit to `skirmish.html`/`skirmishdemo.js` (both untouched, still the fast version).
Same roster, same real Map A corner, same real German card, same engine calls — only the
presentation layer differs.

**Nothing new had to be built at the dialog-engine level.** `apps/game/ambushdialogs.js`
(`window.AmbushUI.Dialogs`) already does exactly "one modal at a time, FIFO-queued, wait for
acknowledgment," and `apps/trainer/index.html` already had a working cycling-die animation
(`animateDie` — 8 random faces at 55ms, lands on the true value, fires a callback). Both were
already proven, just never wired into an `apps/game/` page before. Ported verbatim; the popup/
dice CSS (`.popup`, `.dice-tray`, `.die-face`, `.combatant`/`.combat-row`) came from
`apps/game/dialogharness.html`'s existing Phase 2 dialog harness.

**The one real design problem:** `arscheduler.js`'s `placeMarkers(opts)` takes a *synchronous*
`rollDie(entry)` callback and resolves a whole roster's AR Track placement in one call — it has
no way to pause mid-loop for a player to dismiss a pop-up. Rewriting it to be async was out of
scope (a rules module, not presentation). Solved by pre-rolling every entry's die for real
(genuine `Math.random()`, correctly consumed by `placeMarkers` exactly as any other caller would)
and then *replaying* each already-decided roll as its own pop-up, one at a time, each animating
to its true value. The resulting track state is byte-identical to any other `rollDie`
implementation — this is a presentation trick, not a rules shortcut. The same technique covers
the one other synchronous multi-roll call, `firecombat.resolveClosestTarget`'s rare target
tie-break.

**Verified by actually playing it** (the `run-ambush` skill's Playwright driver, headless,
clicking through real popups): confirmed the full expected sequence end-to-end — `Round N` →
`Initiative` (dual dice, US vs German, labeled) → one `Initiative Roll` pop-up per roster entry →
into the first actor's turn → `German Action Number` → `Fire` → `Jam Check` (percentile, two
dice) → `Hit Chance & To-Hit` → `Damage` (only when hit) → `Ammo Check` → back to the scheduler.
Watched a jam-free miss (no Damage pop-up, correctly skipped) and a jam-free hit (Damage pop-up
present) both occur naturally in the same run. Watched a soldier go inactive from a real hit and
correctly drop out of the following rounds' `Initiative Roll` pop-ups, and watched the German's
card-column choice switch from `SPECIAL S` to `CONDITION 4` the moment that happened — same
correctness already established for `skirmish.html`, now reachable through the pop-up flow too.
Zero console errors across every run, including a 7-round chain. Full project regression
(unchanged — this variant touches no rules module): 1886 checks passing. Confirmed `skirmish.html`
itself still loads clean and is unaffected.

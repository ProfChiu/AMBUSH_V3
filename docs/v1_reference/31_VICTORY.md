# 31 — Victory, Squad Generation, and Mission 1 (Phase 10)

**Date:** 2026-08-04/05
**Phase:** 10 — Victory + Mission 1 wiring (`docs/11_GAME_BUILD_PHASES.md`).
**Follows:** Phase 9's six combat slices (docs/24, 26–30).

**Deliverables:** `apps/game/victoryrules.js` (`tools/test_victory.js`, 30/30), `apps/game/squadgenrules.js`
+ `assets/data/squad_generation.js` (`tools/test_squadgen.js`, 30/30), and the full Mission 1
build: `apps/game/mission1.html` + `apps/game/mission1demo.js`.

**Trigger:** the user's explicit direction, "For any questionable rule, make a judgement call, and
pick/create a sensible outcome for now. Flag them for possible problem in future. I want to play
the game (scenario 1) to the ending condition." — i.e. stop treating open rule/data questions as
blockers; make a bounded, documented call and keep moving toward an actual playable, winnable/
losable Mission 1.

---

## 1. §15 Victory — `victoryrules.js`

Real procedure, no judgment calls needed for the core math:

- `parseGermanVP(vpText)` — regex parser for the roster's free-text VP field (`"+1 VP"`,
  `"+2 VP (+3 VP if captured)"`, `"+1 VP*"`). Validated against all 46 real VP strings in
  `german_roster.json`.
- `germanVPValue(vpText, outcome)` / `usCasualtyVPLoss(outcome, wasExfiltrated)` — a killed US
  soldier always costs 2 VP (unavoidable); an incapacitated one costs 2 VP unless exfiltrated
  (the mission's own escape/medevac provision).
- `computeVPTotal(opts)`, `resolveVictory(vpTotal, requirement)` — 13 VP to win Mission 1.
- `checkEnding1(opts)` / `checkEnding2(allActiveUSExited)` — Mission 1's two real ending
  conditions, quoted verbatim from `missions.json`: Ending 1 (US squad holds the T8 building,
  K13, L13, and a SE-heights hex with LOS to every road hex, with zero active Germans remaining →
  +4 VP bonus) and Ending 2 (every active US soldier exits the map via A1–J1).

**JUDGMENT CALL — `parseGermanVP` ignores vehicle-only bonus text** ("knocked out"/"disabled"
qualifiers on some cards) since Mission 1 as built has no vehicle model. Flagged in the function's
own header comment, not silently dropped.

**JUDGMENT CALL — Ending 1's "heights ... from which he can see all the road hexes on the map"**
needs real terrain/LOS analysis this build doesn't attempt. `victoryrules.js` itself stays honest
about this: `checkEnding1` takes a caller-supplied `heightsHexWithFullRoadLOS` boolean rather than
computing it. The Mission 1 demo layer (`mission1demo.js`) approximates the described elevation
line with a small hardcoded candidate-hex set, `HEIGHTS_CANDIDATE_HEXES = {Q19, T17, V15, X14,
Y13}` — occupying any one of those satisfies the condition here, without verifying actual LOS to
every road hex. A future pass could compute this for real using the same `losrules.js` machinery
already built for Phase 5.

## 2. §4 Squad Generation — `squadgenrules.js` / `assets/data/squad_generation.js`

The real procedure (Squad Quality roll → Squad Points; Weapon Quality roll → Weapon Points; buy
soldiers by IN cost off `SOLDIER_COST`; roll PC/WS/DS per soldier; buy equipment) was already
correctly encoded in the trainer — relocated verbatim to `assets/data/squad_generation.js`,
following the same precedent as `ar_track.js`/`weapon_chart.js`.

**JUDGMENT CALL — auto-buy heuristics.** §4 assumes a human negotiating a budget interactively;
this build has no squad-buying UI, so `autoBuySoldiers`/`autoBuyEquipment` are deliberate,
documented, non-rulebook heuristics: buy the cheapest commander first, then greedily fill with
the highest-IN soldier still affordable. A **real bug** in the first version of this heuristic was
caught before it ever shipped: greedily buying the highest-IN-affordable soldier repeatedly could
spend the *entire* budget on one soldier and fail §4's own 4-soldier minimum (e.g. SP 29 → only 2
soldiers bought). Fixed by adding a free (cost-0, IN-0) filler soldier, used only once nothing
else is affordable and the roster is still under 4 — guarantees the minimum is always reachable
for free. Verified across the entire real Squad Quality range (SP 29–43).

The rulebook's own Mission 1 setup text sanctions two paths — use a pre-generated squad from the
booklet, or "generate one of your own" per §4 — both legitimate. This project has no pre-generated
squad transcribed anywhere, so Mission 1 always generates fresh via the real §4 procedure.

## 3. Mission 1 — `apps/game/mission1.html` / `mission1demo.js`

The first place every module built across Phases 4–10 runs together against **real** Mission 1
data: real Map A, the real paragraph book, the real German roster, real Action Round scheduling,
the full combat suite, and real VP accounting — presented in the chess-pop-up default style
(docs/25 §5, confirmed as the standing default in docs/11).

Flow: squad generation (§4, real dice) → entry placement (soldiers placed by the player on the
north edge, A1–J1) → Operations phase (real movement, a real Paragraph Check fired on every hex
entered) → German activation (when a paragraph's `activate_german` effect fires) → Action Round
(real AR Track placement, real turn order, real Fire/Assault/Pass, real German auto-turn) → back
to Operations once a Round ends with no active Germans → repeat until a real ending condition is
met → final VP tally and win/lose reveal.

### 3.1 Judgment calls made (all flagged loudly in-code, `mission1demo.js` header)

- **German card IDs "25" and "81"**, referenced by real Mission 1 paragraph programs
  (`assets/data/paragraph_programs.js`), do not exist anywhere in the 47-card transcribed roster
  (`assets/data/german_roster.json`) — almost certainly additional physical cards never
  photographed for this project. `resolveGermanCardId()` substitutes a real, well-tested stand-in
  (`GE 33/V`) whenever this happens, logging loudly to the game log every time — never a silent
  swap.
- **No Port Box/Ammo Box inventory model** (docs/24 §1) — equipment tracking during the mission is
  abstracted to "the soldier still has this weapon," not a box-by-box count.
- **§5/5 Condition Change's per-hex PC** — the real procedure scans every occupied hex in
  ascending order for a Paragraph Check, but `operationsloop.js`'s `ctx` model is built once per
  scan pass, not per hex. `runConditionChange` uses the first active US soldier's PC for the
  whole scan rather than deriving a per-hex PC. Documented, not silently approximated.
- The Ending-1 heights-hex and auto-buy squad generation calls from §§1–2 above.

### 3.2 A real bug found and fixed: `onSetCondition`

While investigating why extensive natural movement/paragraph-triggering never produced a German
encounter, found `onSetCondition` was wired as a no-op stub (`function () {}`) — Condition never
actually advanced past 1, so any paragraph calling `set_condition` had no effect and
`Ops.conditionChange()` was never invoked. Fixed by adding `pendingConditionChange` tracking, a
shared `buildOpsCtx(pcSoldier)` context builder, and `runConditionChange(to, next)` implementing
the real §5/5 procedure (scan every occupied hex ascending, stop the instant a German activates —
matching "do not check other hexes"). This is a substantive fix, not cosmetic.

### 3.3 A genuine content finding, not a bug

Even with `onSetCondition` fixed, a direct reachability analysis of `paragraph_programs.js` (ad
hoc node scripts, not guesswork) found that **within the 71 currently-annotated Mission 1
paragraphs, no path exists from Condition 1 to any German activation via `set_condition` alone.**
The only `set_condition` call across all 71 paragraphs is in paragraph 611 (→ Condition 4), and
611 is itself only reachable from Condition 4's own Random Event table, gated behind
`if_german_removed_once germanId:"34"` — a circular dependency unreachable from Condition 1.

This is being treated as a genuine, honestly-flagged limitation of the currently-annotated
paragraph set (or an accurate reflection of some other trigger mechanism — e.g. real-time or a
Random Event roll during ordinary movement — not yet modeled here), not a bug to silently patch
around. It means: in this build, as verified, German contact in Mission 1 is reached through
`activate_german` effects fired directly out of a paragraph chain triggered by *movement* into a
specific hex, not through a Condition escalation chain. Natural play was confirmed to reach
several such paragraphs (325, 24, 13, 453) and an Event Check without yet landing on one that
carries an `activate_german` effect within the session's play window — consistent with, not
contradicting, the reachability finding above.

### 3.4 Verification

**Natural play** (`run-ambush` driver, real `Math.random()` dice, zero scripted rolls): full
pipeline exercised end-to-end — squad generation → entry placement → movement with real paragraph
triggers (325/24/13/453, an Event Check, a landmark placement) → Exit Map action → Ending 2
detected → VP computed → "MISSION LOST — 0 VP (ending2)". Zero console errors.

**Combat path** (since §3.3 means natural play alone won't reach a German encounter within a
short session): added a console-only debug hook,
`window.__mission1Debug.spawnGermanForTesting(cardId, hexId)`, which calls the **real**
`activateGermansSequentially()` function — the same one a real `activate_german` paragraph effect
calls — to place a German at a chosen hex for testing. Explicitly documented in-code as
verification scaffolding, not a gameplay feature. Using it, verified with real dice, zero console
errors across every run:

- German activation → Action Round → AR Track placement (multi-soldier, US + German in one
  `germans` dict keyed by card ID, not a single-German variable).
- Player **Assault** (adjacent, standing) → hit → damage → German incapacitated → VP gained
  correctly recorded → round ends with no active Germans → automatic return to Operations.
- Player ranged **Fire Aimed** (distance 2–4, real LOS) → jam check → hit chance/to-hit → damage
  → same clean resolution.
- **German's own auto-turn**: Action Number roll → real card-column lookup → target selection →
  fire back at a US soldier → wound → (a later round) escalate to killed → VP *loss* correctly
  recorded (`usCasualties`), confirmed via a live screenshot showing Pvt. Ruiz struck through as
  "— killed" and the roster's other soldiers correctly marked wounded, with VP total swinging to
  −1 (1 gained − 2 lost).

One test-harness pitfall found and worked around, **not a game bug**: calling
`spawnGermanForTesting` twice in quick succession (to try to get two Germans on the board at once)
corrupts scheduler state (`Sched.completeAction` throws "in slot X, not the current slot Y"),
because `activateGermansSequentially`'s completion branch always calls `startActionRound(1)` once
its own `effects` array is exhausted — two independent debug calls race to start the Round twice.
Real gameplay never does this: a single paragraph chain's `activate_german` effects are always
batched into one array and processed by one call. Not fixed (it's a debug-hook usage constraint,
not a production code path), but documented here so it isn't rediscovered and mistaken for a real
defect later.

### 3.5 Full project regression (2026-08-05)

All 14 `tools/test_*.js` suites, run together after the Mission 1 build:

```
tools/test_action_round.js:          44 passed, 0 failed
tools/test_arscheduler.js:           51 passed, 0 failed
tools/test_assault.js:               32 passed, 0 failed
tools/test_crewweapons.js:           26 passed, 0 failed
tools/test_fire_combat.js:           88 passed, 0 failed
tools/test_grenades.js:              64 passed, 0 failed
tools/test_hazards.js:               19 passed, 0 failed
tools/test_los.js:                   14 passed, 0 failed
tools/test_movement.js:              41 passed, 0 failed
tools/test_operations_loop.js:       31 passed, 0 failed
tools/test_paragraph_interpreter.js: 1522 passed, 0 failed
tools/test_penetration.js:           37 passed, 0 failed
tools/test_squadgen.js:              30 passed, 0 failed
tools/test_victory.js:               30 passed, 0 failed

TOTAL: 2029 passed, 0 failed
```

## 5. Post-launch UX pass (2026-08-05, session 39)

The user played the Mission 1 build end to end and reported 8 concrete problems. Discussed each
before implementing; built and verified one at a time with a stop-and-report between each,
per-item. Full write-up of the fixes and the deferred voice-over item is in `PROGRESS.md`'s
2026-08-05 session 39 entry — this section covers the one finding worth citing here because it
corrects something this doc's §3 got wrong.

**§5/3 Operations-phase movement has no Movement Point budget — this was a real rules bug, not a
pacing issue.** Checked the primary source directly, `source/pdf/Ambush_Rules_with_Errata_R2.pdf`,
§3/1 and §5/3: "unlike other wargames, has no Game-Turns or Sequence of Play... While in
Operations, you can perform any of the Actions listed in 5/3... without keeping track of Turns,
Movement Points, or anything else," and movement itself is explicitly one adjacent hex per Action,
with "each time a soldier enters a hex, a Paragraph Check is conducted." The original Mission 1
build (§3 above) had applied the Action-Round MP budget (`M.legalDestinations`, correct for §6/7
combat movement) to Operations movement, which does not use it — that's why soldiers eventually
ran out of moves and the game appeared to halt, and why a multi-hex move only fired one Paragraph
Check (at the final hex) instead of one per hex entered, as the rule requires. Fixed in
`mission1demo.js`: Operations movement is now one-adjacent-hex-per-click with no MP tracking and
free stance changes (also confirmed not MP-gated in Operations, unlike the Action-Round "one free
change" rule). `M.legalDestinations` itself is untouched — it's the correct function for a future
Rounds-movement feature (§6/7), just the wrong one for Operations.

This pass also closed §3.2's follow-on gap properly: every Perception/Activation Check, Event
Marker placement, Landmark placement, VP award, and named procedure that used to resolve silently
inside `operationsloop.js`/`paragraphinterpreter.js` now gets its own pop-up, correctly ordered
against the paragraph text that triggered it — verified against paragraph 24 ("Place Event marker.
Conduct PC Check (-1). If successful, see 013.") end to end, including the marker's real map
presence. Two small, additive, non-behavioral observability hooks
(`ctx.onEnterHex`/`ctx.onEnterParagraph`) were added to `operationsloop.js` for this; no rules
function's return value or control flow changed, confirmed by the full regression holding at
2029/0 throughout.

## 6. Next

- Playtest and polish (Phase 11) — the build is playable end-to-end; remaining work is judgment
  rather than blocking gaps: the §13/5 Penetration chart transcription (docs/30), §9/9 wall fire,
  §11/2 guard/escort mechanics, a real Port Box model, and (optionally) real LOS-based computation
  of Ending 1's heights condition instead of the hardcoded candidate-hex set.
- Voice-over narration (deferred from the 2026-08-05 UX pass, §5 above) — `SpeechSynthesis`-based,
  off by default, sketched but not built.
- If more of the paragraph book gets annotated beyond the current 71, re-run the Condition-1→4
  reachability check (§3.3) — it may open up natural-play German encounters that don't currently
  exist.

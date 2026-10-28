# 22 — Action Round rules (Phase 8)

**Date:** 2026-08-01
**Phase:** 8 — The Action Round (`docs/11_GAME_BUILD_PHASES.md`) — **the turn-structure rules
built and verified.** Scope matches the phase brief exactly: AR Track, initiative, awareness,
command, panic, giving turns, turn order. Simulating what a German soldier actually *does* when
his Action Paragraph is read (crouch, fire at the closest target, move...) is Phase 9 (combat)
territory — it needs real targeting and fire resolution that doesn't exist yet. What's in scope
here is resolving *which* Action Paragraph number applies, which is pure card lookup and doesn't
need combat to exist.
**Follows:** `docs/21_OPERATIONS_LOOP.md`. Also resolves an open question from that doc: §6/1's
Rounds-phase Event Phase text turned out to answer §5/6's dice-formula question too (see §3 below).

**Deliverables:** `apps/game/arrules.js`, `tools/test_action_round.js` (44/44 passing after the
`resolveAdvantage`/`classifyARRoll` additions in `docs/23_ACTION_ROUND_SCHEDULER.md`).

---

## 1. Reading §6 — bigger, and more combat-dependent, than it first looks

§6 runs ~750 lines (6/1 through 6/11) and covers a lot: the AR Track itself, activating Germans,
command and commanders, panic, US awareness, German re-activation mid-Round, everything a soldier
can do on his turn, and — in 6/8-6/9 — the actual German AI behavior scripts ("crouch, then conduct
best fire at closest target..."). That last part is where the phase brief's own scoping
("AR Track, initiative, awareness, command, panic, giving turns, turn order") turns out to matter:
it doesn't list "simulate German behavior," and reading 6/8-6/9 makes clear why not — those
paragraphs require closest/easiest-target selection (fire-combat math), movement, stance logic, all
of which is Phase 9. Building that now would mean either faking combat resolution or blocking this
phase on Phase 9 existing first. Scoped accordingly: this phase resolves *which paragraph number* a
German's action refers to; reading and acting on that paragraph is the next phase's job.

---

## 2. Command (`apps/game/arrules.js`)

§6/3: a soldier is in command if his IN plus the IN of every other active US soldier in his hex is
≥5. The subtlety that's easy to miss: a commander's IN reaches into every hex within his Command
Radius (his own hex plus everything within 2 hexes), not just his own hex — so "other soldiers in
his hex" implicitly includes IN contributed by a commander standing somewhere else entirely.
`commandContributors(targetHexId, roster)` assembles that correctly: co-located soldiers always
count (commander or not — that's just being in the same hex), plus any *other* active commander
whose radius reaches the target hex. Reconstructed and verified against the rulebook's own
"Commander Functions" worked example (commander A, IN 3; privates combining to totals of 5 and 6
depending on position) — the numbers only work out if D and E share a hex within A's radius rather
than each standing alone, which isn't obvious from the prose alone but is required by "combine
their IN's for a total of 6" being a single shared number, not two separate totals.

Also: `resolveMarkerPlacement` (the wounded-2-turn-becomes-1-turn exception, and the red-number
panic-if-out-of-command / normal-turns-if-in-command branch, both §6/1 and §6/4), and
`canReceiveGivenTurn` (only from the 1-Turn or Complete space, never a wounded soldier, §6/3).

---

## 3. The Event Check dice formula — resolved, not just documented as still-open

`docs/21_OPERATIONS_LOOP.md` left `rollForEvent()` injected because §5/6 doesn't say how two
physical dice map to the Random Event column's 20 entries. §6/1's description of the *Rounds*-phase
Event Phase turned out to answer it: "roll two dice and add the two results together... resolved in
the same way as an Event Check during Operations (5/6)." Both phases use the same mechanism, and
it's a plain sum of two d10 rolls (0-18) — `AR.rollEventSum(rollDie)`. One loose end, noted rather
than explained away: the Random Event table has 20 entries (`RE-00`..`RE-19`), and a two-d10 sum
only reaches 18, so `RE-19` isn't reachable by this formula. Possibly reserved for something else,
possibly a padding row — not guessed at.

---

## 4. German Action Number + card cross-reference (§6/8)

This is where September's German-roster transcription work (session 25) pays off directly: each
card's `table` is exactly the structure §6/8 describes — roll one die, cross-reference the result
against the card using whichever column applies. Precedence, from the rule text: **Self-Preservation**
(the card's `SPECIAL S` column — used whenever the German is in or adjacent to an active US soldier,
regardless of anything else) beats an active **Special Reaction** column (`SPECIAL <letter>`, set by
a paragraph), which beats the current **Condition**'s own column. `resolveGermanActionParagraph`
implements that precedence and is tested against two real cards with different column shapes:
`GE 33/V` (one Condition per column) and `GE 2/N` (each column covers a *range* of Conditions,
`CONDITION 1-2` / `CONDITION 3-4` / `CONDITION 5-6` — `findColumnForCondition` handles both shapes
the same way). A table-less group card (`GE 19`, the Kubelwagen crew) throws rather than silently
guessing, since §6/8's card-lookup procedure doesn't apply to a card that has no table at all.

---

## 5. Verification (`tools/test_action_round.js`) — 37/37 passing

Command, against the reconstructed worked example. Marker placement and panic, all four branches
(2-Turn/wounded, 1-Turn, Panic, Red-number × in/out of command). Giving-turn eligibility. US
Awareness's three round-dependent rules (§6/5). The Event dice sum. German card resolution against
real transcribed data for both column shapes, plus the table-less-card failure case.

---

## 6. Next

The turn-order *scheduler* described here as deferred is now built — see
`docs/23_ACTION_ROUND_SCHEDULER.md` (`apps/game/arscheduler.js`). Phase 8 is complete. Phase 9
(combat) is the actual next phase: what turns a scheduler-selected actor and a resolved German
Action Paragraph number into an actual action.

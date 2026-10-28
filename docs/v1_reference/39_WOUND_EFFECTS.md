# 39 — Wound Effects + Free Stance Change (Task #58)

**Date:** 2026-08-10
**Task:** #58 in the standing order (`docs/32_HANDOFF.md` §3) — no blockers, next after Task #64.
**Follows:** `docs/38_GIVE_TURN.md` (session 55, Task #64).

**Deliverables:** `apps/game/mission1demo.js` only. No new pure-logic module — every eligibility
rule this task needed to actually *check* (one-turn-per-Round cap, "cannot be given a turn or made
aware," assault WS-negation and −2, fire −1, grenade −2) turned out to already be correctly
implemented; this task closes the two clauses of §13/2 that genuinely had no code at all.

---

## 1. What §13/2 actually needed — smaller than the task list entry suggested

§13/2 lists nine wound consequences. Read the code for all nine before writing anything, rather
than assuming the task's own "MPA -> 2, no free stance change, firing/grenade modifiers" framing
(carried over from Tasks #61/#62/#63's own scope notes) was a complete list of what was missing:

| Clause | Status found |
|---|---|
| Falls prone, Wounded marker | Already done (`applyDamage`) |
| Loses remaining turns, AR marker to Complete | Already done (`Sched.applyWoundedStatus`) |
| Only one turn per Round (2-turn roll capped to 1) | **Already done** — `arrules.js`'s `resolveMarkerPlacement` |
| No WS in assault defense; −2 attacking while wounded | **Already done** — `assaultOpts`/`assaultrules.js` |
| Port Box reduced to one | Already done (Task #61) |
| Cannot be given a turn / made aware by a commander | **Already done** — `AR.canReceiveGivenTurn`/`makeAwareCandidates` (Task #64) |
| −2 grenade Base Hit Chance | **Already done** — `grenadeMods` (Task #63) |
| −1 fire Base Hit Chance | **Already done** — `fireChain`'s `hitStep` (pre-existing) |
| **MPA reduced to 2, for the rest of the mission** | **Missing — built here** |
| **Never receives a free stance change** | **Missing — built here (Rounds action didn't exist at all)** |

Only the last two needed real work. The second one turned out to be bigger than it sounds: there
was no Free Stance Change *action* anywhere in the Rounds action panel at all, for anyone,
wounded or not — `usedFreeStanceChange` existed as a soldier field, set once at squad generation
and never read or written again.

## 2. What changed

- **MPA reduction.** `applyDamage`'s wound branch now sets `target.mpa = 2` directly. Confirmed
  this is the single correct place to change it: `roundLegalDestinations`, `dragCandidates`, and
  every other MPA consumer in the file all read `s.mpa` fresh each time, nothing caches an
  original value elsewhere.
- **New "Change Stance" action.** `stanceChangeCandidates(s)` — empty for a wounded soldier or one
  who's already used this turn's free change, otherwise the two stances other than his current
  one. `doPlayerChangeStance()` picks one via the same `chooseOffer` row-list `doPlayerPickup`
  established, then ends the turn normally (`Sched.completeAction`). `usedFreeStanceChange` resets
  in `driveNext()` — specifically *not* inside `showActionPanel`, which also re-renders mid-turn
  after a cancelled Move/Fire/etc. (that isn't a new turn and must not grant a fresh change).

**Deliberately NOT modelled, and explained in code why rather than left unexplained:** the
rulebook's paid alternative — "a soldier without a free stance change must spend one Movement
Point to change stance, and thus must perform a Movement Action... a free stance change can be
combined with a movement action." This codebase's Rounds turn economy gives every action (Move,
Fire, Assault, ...) the soldier's full fresh MPA for that one self-contained action; there's no
persistent, depleting MP counter a *second*, separate stance change could spend one point from —
confirmed by reading `roundLegalDestinations`, which computes legal moves from `s.mpa` directly
every turn, not from a running balance. Modelling "pay 1 MP for stance change" faithfully needs
that budget to exist first, so it's a real, bounded, flagged gap rather than a guess dressed up as
a feature. A practical consequence: a wounded soldier (who never gets the free version) currently
has no way to change stance at all during Rounds — the button is simply unavailable to him.

## 3. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (unaffected — no pure-logic module
  changed), `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known
  non-failures).
- **Live via Playwright, real state, via the new `stanceChangeCandidatesForTesting` debug hook**
  plus the existing `applyWoundForTesting`:
  - A real wound dropped a soldier's MPA from 5 to 2, confirmed directly on the live soldier
    object.
  - The wounded soldier correctly showed zero stance-change candidates.
  - An unwounded standing soldier correctly showed both other stances as candidates; after
    simulating "used this turn's free change," candidates correctly dropped to zero; after
    resetting the flag (what `driveNext()` does at the start of a genuinely new turn), candidates
    correctly came back.
  - Zero console errors throughout.
  - Not directly reproduced: clicking the real in-game "Change Stance" button during a
    genuinely-live turn. Five scripted attempts across earlier tasks this session (and a sixth
    here) have now shown the same pattern — short scripted playthroughs often resolve Round 1
    before any specific US soldier reaches an actionable turn by chance, zero errors every time —
    an accepted limitation of this testing approach at this point in the session, not chased
    further given `doPlayerChangeStance` follows the identical, already-proven
    `chooseOffer`-then-`Sched.completeAction` shape `doPlayerGiveTurn`/`doPlayerMakeAware`/
    `doPlayerPickup` all already use.

## 4. Next

Per the standing order: #65 (Panic effects, §13/1) is next.

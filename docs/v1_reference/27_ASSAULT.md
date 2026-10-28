# 27 — Assault and capture (Phase 9, third slice)

**Date:** 2026-08-04
**Phase:** 9 — Combat (`docs/11_GAME_BUILD_PHASES.md`) — third slice, following core fire combat
(docs/24) and grenades/satchel charges (docs/26). Next per the phase's own "Next" list.
**Follows:** `docs/26_GRENADES.md`.

**Deliverables:** `apps/game/assaultrules.js`, `tools/test_assault.js` (32/32 passing), plus
additive changes to `apps/game/firecombat.js` (`resolveZCode`, +3 tests, now 86/86) and
`assets/data/weapon_chart.js` (`ASSAULT_MODS`, extracted and corrected).

---

## 1. Scope — same reuse pattern as grenades

Same approach as `docs/26`: assault reuses `firecombat.js` directly for the parts that are
identical to fire combat (`resolveHitRoll`'s 0-always-hits/9-always-misses rule,
`resolveDamage`'s dmg-string lookup on the `asltk`/`asltc` weapon-chart rows, and
`escalateDamageResult`), and `assaultrules.js` only implements what §11 actually does
differently: German target selection (§11/1 step 1 — a stance-based rule, not fire combat's
closest/easiest), a five-modifier Hit Chance calculation that's explicitly *not* the Fire Combat
Modifiers Chart (§11/4), and the Move/Charge Assault MPA limit (§11/3).

**In scope:** §11/1 core procedure, §11/3 Charge Assault's MPA rule, §11/4 all five modifiers.

**Explicitly deferred:** the full §11/2 Captured-status state machine. One piece of it needed
nothing new — "immediately moved to the Inactive space of the AR Track" is exactly what
`arscheduler.removeFromRound` already does for incapacitation/kill (docs/25 §2), so capture
reuses that directly, no scheduler change required. What's genuinely deferred: guarding a
prisoner, changing guards, a captured German's Movement Allowance while being escorted, and the
freeing conditions when left without an active US soldier — real, substantial mechanics that
belong with whatever module eventually owns squad/prisoner state, not this resolution-only
slice. Also deferred: entering a wheeled vehicle before assaulting its occupant, and the
tank/Jadgpanther assault prohibition (vehicles are scenery, `docs/11` decision #2).

## 2. Two real gaps found in the trainer's ASSAULT_MODS summary

`apps/trainer/ambushdata.js`'s `ASSAULT_MODS` — the same hand-transcribed, previously
"sound"-rated data this project has relied on since `docs/24` — turned out to be incomplete once
checked against §11/4's actual prose, not just its own summary form:

- **A whole missing modifier.** The rule text has a standalone bullet: "If the only weapon
  available to the attacker is a captured weapon, then the -1 modifier for 'captured weapons
  use' applies to the assault." `ASSAULT_MODS` only ever listed four modifiers; this one wasn't
  among them.
- **An incomplete condition.** The rule nulls the defender's Weapon-Skill shift under three
  conditions — "panicked or wounded," per the trainer's summary, *and* "a US soldier who is
  unaware when assaulted cannot use his WS to modify the German assault," which the summary
  dropped entirely.

Both added directly from the rule text (not from the incomplete summary) when extracting
`ASSAULT_MODS` into the shared `weapon_chart.js`, same relocation this project has done for
every other chart. `computeHitChance` implements the corrected, five-condition version;
`tools/test_assault.js` covers the "unaware" and "captured weapon" cases specifically, since
those are exactly the two a naive port of the old summary would have missed.

## 3. Verified against the rulebook's own worked example, end to end

§11/1's ASSAULT COMBAT EXAMPLE (Soldier D charge-assaults to kill German X — standing, unpanicked,
unwounded): Base Hit Chance 7, D's WS +1, a -3 charge-assault modifier, X's WS +2 (eligible,
subtracted) → final Hit Chance 3. Roll of 2 hits. Damage roll of 7 on the Kill row →
Incapacitated. `computeHitChance` reproduces the exact 3, and the full chain
(`computeHitChance` → `firecombat.resolveHitRoll` → `firecombat.resolveDamage` against the real
`asltk` weapon-chart row) reproduces the exact Incapacitated result — the same "reuse the
existing worked example as a regression test" pattern every combat slice so far has used.

## 4. The Capture code path — 'Z' is not on the wound ladder

The `asltc` (Assault to Capture) row's dmg string (`"ICCCCZZPP*"`) needed its own resolver, same
shape as grenades' `resolveXCode` — `firecombat.resolveZCode(targetAlreadyPanickedOrWounded)` →
`'C'` if the target was already panicked or wounded, else `'W'`. The important distinction from
`resolveXCode`: a `'C'` (Captured) result is genuinely **not** part of `escalateDamageResult`'s
severity ladder — being captured isn't a point between Wounded and Incapacitated, it's its own
status. `resolveZCode` returns `'C'` directly rather than funneling it toward
`escalateDamageResult`, and that function still rejects a raw `'C'` if one somehow reaches it —
callers must branch on Captured themselves, the same "fail loudly on an unhandled code" contract
`escalateDamageResult` has always had.

## 5. Verification

- `node --check` clean on every new/edited file.
- `tools/test_fire_combat.js`: **86/86 passing** (83 + 3 new: `resolveZCode`'s two branches, and
  confirming `escalateDamageResult` still rejects a raw `'C'`).
- `tools/test_assault.js`: **32/32 passing** — German target selection (prone beats standing,
  wounded beats merely-crouching, ties within a tier resolved by an injected `rollDie`, ties
  *between* crouching and standing correctly treated as the same tier rather than a further
  split, single-candidate and empty-list edge cases), the full ASSAULT COMBAT EXAMPLE end to end,
  every one of the five §11/4 modifiers in isolation (including the two gap-fixes specifically),
  all four Charge Assault MPA cases, and the Capture code path across all three relevant rolls of
  the `asltc` row (direct Incapacitated, `Z`-resolved-to-Captured, and direct Captured).
- Trainer regression: loaded `apps/trainer/index.html` for real (the `run-ambush` skill driver),
  confirmed `ASSAULT_MODS.length` is now 5 (was silently 4) and zero console errors.
- Full project regression: **1996 checks passing**, zero failures.

## 6. Next

The rest of Phase 9: crew weapons/bazookas (§9/7-9/9), minefields/boobytraps (§12), §13/5
Penetration, the Clear Jammed Weapon action's caller, and — whenever a module takes on
squad/prisoner state — the deferred half of §11/2 (guarding, freeing, escorted movement). None
of these are blocked on anything architectural.

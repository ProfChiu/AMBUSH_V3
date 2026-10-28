# 24 — Core fire combat (Phase 9, first slice)

**Date:** 2026-08-01
**Phase:** 9 — Combat (`docs/11_GAME_BUILD_PHASES.md`) — **first slice built and verified.**
Phase 9 spans §9–§13 (fire, grenades, assault/capture, minefields/boobytraps, crew weapons,
bazookas, and the §13 damage-result tables) — too much for one pass. User chose the scope: core
fire combat first (§9/1–9/6, plus the §13 damage-result rules the fire procedure itself depends
on), since it's the load-bearing mechanic snap fire, crew weapons, and assault all reuse.
**Follows:** `docs/23_ACTION_ROUND_SCHEDULER.md`.

**Deliverables:** `assets/data/weapon_chart.js`, `apps/game/firecombat.js`,
`tools/test_fire_combat.js` (72/72 passing).

---

## 1. Scope — what's in, what's explicitly deferred

**In scope, all of §9/1–9/6:** the seven-step Fire Combat Procedure end to end (target/fire-type
choice, jam/dud check, range, Hit Chance with all modifiers, the to-hit roll, damage, ammo
expenditure), Multiple Fire Targets' automatic-weapon bonus, Fire Shifts (the terrain modifier
table), Weapon Jamming (the check itself — see the Clear Jammed Weapon gap below), Ammo
Expenditure (the roll), and German Fire Combat Terms (Best Fire, Closest Target, Easiest Target).
Plus the §13 damage-result rules the procedure's step 6 hands off to: Panic/Wound/Incapacitation/
Kill status effects (§13/1–13/4) and Aimed Automatic Weapon Damage's multi-target cascade (§13/6).

**Explicitly deferred to later Phase 9 slices**, not forgotten:
- **Grenades/satchel charges (§10)** and **assault/capture (§11)** — different procedures
  entirely (scatter, PC Checks, capture rolls), even though their weapon-chart rows already live
  in the shared data file.
- **Crew weapons and bazookas (§9/7–9/9)** — preparation, two-soldier aimed fire, Port Box
  carrying.
- **Minefields/boobytraps (§12)**.
- **§13/5 Penetration** (walls/vehicles) — Mission 1's Pz IV is scenery, not a combat target,
  per `docs/11`'s Phase-order decision #2; walls may matter later but nothing in this slice needs
  them.
- **The Clear Jammed Weapon action** — a real, documented gap, not an oversight: the rulebook
  describes the procedure (§9/4: roll one die against the soldier's Weapon Skill on the *Clear
  Jammed Weapon Chart*, `B` = broken permanently) but that chart's actual die-roll/WS-column
  values were never transcribed anywhere in this project (`docs/08_RULES_GAP_ANALYSIS.md` §3.4
  flagged this independently). `firecombat.js` records that a weapon *is* jammed
  (`resolveJamCheck`'s result); nothing here invents numbers for clearing it. That's the next
  piece of transcription work this mechanic needs before it can be built.
- **Full Ammo Box inventory** (six boxes, matching clip types, exchanging ammo, bazooka reload) —
  `resolveAmmoExpenditure` answers the dice question ("was a clip spent") that §9/1 step 7 asks
  for; bookkeeping which of a soldier's six boxes that clip came from is inventory state that
  doesn't exist yet in this engine (no full per-soldier equipment record has been built) and
  belongs with whatever module eventually owns loadouts.

---

## 2. The chart existed already — same story as the AR Track

`apps/trainer/ambushdata.js` already had a hand-transcribed, rulebook-verified Weapon Chart,
Fire Combat Modifiers Chart, and Damage Legend (`docs/08_RULES_GAP_ANALYSIS.md` called this data
"sound"). Same situation as `docs/23`'s AR Track: real, checked data that only `apps/trainer/`
could see. Extracted to `assets/data/weapon_chart.js` — `window.AMBUSH_WEAPON_CHART` — matching
the `ar_track.js` precedent exactly (hand-authored, not compiled, `require()`-able by both the
browser and Node test harnesses). The trainer's own consts are now thin pointers into it
(`const WEAPON_CHART = window.AMBUSH_WEAPON_CHART.WEAPON_CHART;`, etc.), with one new
`<script>` tag in `apps/trainer/index.html` before `ambushdata.js`. Verified by loading the real
trainer page (not just a syntax check): `WEAPON_CHART.length` and `AMBUSH_WEAPON_CHART.
WEAPON_CHART.length` both read 16, zero console errors.

One real addition, not just relocation: an `automatic: true` flag on the four automatic weapons
(Submachinegun, Machine Pistol, Automatic Rifle, MMG) — needed by §13/6's cascade, which only
applies to automatic weapons. Every other field is byte-identical to the trainer's original data.

## 3. The damage-index convention — inherited, not reinterpreted

`weapon.dmg` is a 10-character string indexed **high roll first**: `dmg[9 - roll]`. This was
already the trainer's convention (`apps/trainer/index.html`'s `combatStep`), already exercised
against the rulebook's own Fire Combat Example (Semi-Automatic Rifle, roll of 4 → Wounded).
`firecombat.js` keeps it unchanged rather than re-deriving an index scheme from scratch — the
worked example is now a regression test (`tools/test_fire_combat.js`'s first block), so any
future accidental re-reversal of this convention would fail loudly.

## 4. The §13/6 cascade's stopping condition falls out for free

The rule: primary target always takes the first damage roll; each subsequent roll only lands on
a new target if it's *strictly lower* than the one before it, and the whole cascade stops the
instant a roll isn't lower. The rulebook also gates the very first re-roll on "if the damage die
roll was greater than 0" — but that gate never needed its own branch: no die roll is ever lower
than 0, so a primary roll of 0 stops the loop on the very first comparison, identically to any
other "roll ≥ previous" stop. `resolveAimedAutomaticCascade`'s loop is one condition
(`r >= prevRoll → break`), not two.

## 5. Damage-result escalation is a ladder, not a max()

§13/2 and §13/3, read literally: a wounded soldier who suffers *a second wound* becomes
incapacitated — not "stays wounded," which is what a naive `max(current, new)` severity
comparison would produce, since Wound-vs-Wound has no natural ordering against itself. Same
shape one level up: an incapacitated soldier who suffers *a second incapacitation* is killed.
`escalateDamageResult` implements this as an explicit ladder (unharmed → wounded →
incapacitated → killed) where landing a Wound-or-worse result on an already-Wounded soldier
bumps him one rung regardless of which of Wound/Incap it was, and same for
already-Incapacitated. Panic is handled separately: it never downgrades a worse existing status,
and never escalates anything on its own (nothing in §13/1 says a second panic does anything
special).

Only the raw `P`/`W`/`I`/`K` codes this slice's actual weapon rows produce (pistol through MMG)
are handled. The `X`/`Z`/`C`/`*` conditional codes belong to grenade/satchel rows and the
assault-to-capture row — out of scope here — and `escalateDamageResult` rejects them outright
rather than guessing at what "Wounded (Panic if prone)" or "Captured if already
panicked/wounded" should resolve to before that logic actually exists.

## 6. Verification

- `node --check` clean on `weapon_chart.js`, `apps/trainer/ambushdata.js`, `firecombat.js`.
- `tools/test_fire_combat.js`: **72/72 passing** — the full rulebook worked example end to end;
  every range band including the same/adjacent short-circuit and the out-of-range/no-range-data
  cases; all eight terrain rows × three stances including the one genuinely undefined cell
  (interior-not-adjacent + prone) throwing rather than returning a silent `null`; hit-chance
  clamping both directions plus the 0-always-hits/9-always-misses override; the damage table's
  high-roll-first indexing; ammo expenditure's numeric/`"A"`/`null` branches; the §13/6 cascade
  (multi-hit, primary-roll-of-0 stop, single-target no-op, non-automatic-weapon throw); German
  target selection's two-level tie-break for both Closest and Easiest Target including a full
  tie resolved by an injected `rollDie`; and the full escalation ladder in both directions.
- Trainer regression: loaded `apps/trainer/index.html` for real (the `run-ambush` skill driver),
  confirmed `WEAPON_CHART.length` (16) matches `AMBUSH_WEAPON_CHART.WEAPON_CHART.length` and zero
  console errors — the relocation didn't change trainer behavior.
- Full project regression (every suite built so far): **1875 checks passing**, zero failures.

## 7. Next

The rest of Phase 9: grenades/satchel charges (§10), assault/capture (§11), crew weapons and
bazookas (§9/7–9/9), minefields/boobytraps (§12) — and, whenever the physical Clear Jammed
Weapon Chart gets transcribed, the clear-jam action itself. None of these are blocked on
anything architectural; `firecombat.js` and `assets/data/weapon_chart.js` already carry the data
rows they'll need.

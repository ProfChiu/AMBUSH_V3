# 28 — Crew weapons and bazookas (Phase 9, fourth slice)

**Date:** 2026-08-04
**Phase:** 9 — Combat (`docs/11_GAME_BUILD_PHASES.md`) — fourth slice, following core fire combat
(docs/24), grenades (docs/26), and assault/capture (docs/27). Next per the phase's own "Next" list.
**Follows:** `docs/27_ASSAULT.md`.

**Deliverables:** `apps/game/crewweaponrules.js`, `tools/test_crewweapons.js` (26/26 passing). No
changes to `firecombat.js` this time — crew weapons and bazookas are ordinary `WEAPON_CHART` rows
(`mmg`, `baz`) and every dice-resolution step reuses `firecombat.js` unchanged.

---

## 1. Scope — the smallest slice so far

§9/7-9/8 add procedure on top of fire combat, not new dice mechanics: `mmg` and `baz` fire and
damage exactly like any other weapon row (jam check, to-hit, damage, ammo — all already built).
What's actually new is *who's allowed to fire, in what mode, and whose stats the roll uses* —
purely eligibility and selection logic, no new tables. That kept `crewweaponrules.js` small: no
new `firecombat.js` functions were needed at all, the first slice since core fire combat itself
that didn't touch it.

**In scope:** §9/7 Crew Weapons (fire eligibility and mode — 1-vs-2-soldier snap/aimed rules,
German firer designation, the two-soldiers-per-Round cap), §9/8 Bazookas (preparation
eligibility, the no-snap-fire rule, the Personnel+Grenade-Inside splash rule), and §9/9's
eligibility gate only.

**Explicitly deferred:**
- **The Port Box carrying/preparation state machine.** Which two soldiers hold which pieces of
  a crew weapon, when its marker flips prepared/unprepared — same "no full equipment-inventory
  model yet" gap already flagged for personal-weapon ammo boxes in `docs/24_FIRE_COMBAT.md` §1.
  This slice treats "is this weapon crouching-and-fireable" as a given eligibility check, not a
  tracked state.
- **§9/9's actual resolution.** The optional German-fires-at-a-wall action needs §13/5
  Penetration to resolve what the fire actually does — still deferred (`docs/24` §1). This slice
  only implements the eligibility gate (the PC Check that decides *whether* the German attempts
  it), matching the pattern of resolving what's resolvable and flagging the rest rather than
  guessing at Penetration mechanics that don't exist yet.
- Building collapse and vehicle knockout (§13/5, §17 — vehicles are scenery, `docs/11` decision #2).

## 2. The non-obvious splash rule

§9/8: a bazooka hitting a multi-soldier hex resolves the primary target off the bazooka's own
`Personnel` result, but every *other* soldier in the hex takes damage from the **Grenade Inside**
row specifically — not whichever grenade row would normally apply to that hex's actual
interior/exterior status. `bazookaSplashWeaponId()` returns the fixed string `'grin'`
unconditionally, documented as a fixed rule rather than something a caller might reasonably
compute from the hex's own terrain (which would be the natural, wrong assumption).

## 3. Verified against the rulebook's own CREW WEAPON EXAMPLE

Germans S and T man a medium machinegun; T has two turns, S has one, and — the detail the
example exists specifically to illustrate — **S's card designates him as the firer regardless of
either soldier's Weapon Skill or whose turn comes first.** `resolveGermanCrewFirer(T, S, 'S')`
returns `'S'` even though `T`'s WS (1) is higher than `S`'s (0), confirming the override always
wins over the higher-WS default. For T's first (combined, aimed) turn, the Hit Chance
calculation correctly uses S's WS (0), not T's; for T's second turn — where S is out of turns
and only T can act — it's necessarily a solo snap fire using **T's own** WS (1), exactly matching
the example's own conclusion ("the fire must be a snap fire using T's Weapon Skill, because only
T is firing the weapon"). Also confirmed the `mmg` row's snap threshold is higher than its aimed
threshold, matching §9/7's own aside that "snap fire greatly increases the chances of a crew
weapon jamming."

## 4. Verification

- `node --check` clean on `crewweaponrules.js` and `test_crewweapons.js`.
- `tools/test_crewweapons.js`: **26/26 passing** — crouching-only firing eligibility, all three
  fire-mode combinations by soldier count, the two-distinct-soldiers-per-Round cap (including
  that an already-counted soldier can still fire again on a later turn), the full CREW WEAPON
  EXAMPLE end to end, German firer designation without an override (higher WS, order-independent,
  a documented arbitrary tie-break), bazooka's no-snap-fire rule and prepare-eligibility by
  stance, the fixed Grenade-Inside splash row, and the §9/9 eligibility gate's two outcomes.
- Full project regression: **2022 checks passing**, zero failures.

## 5. Next

The rest of Phase 9: minefields/boobytraps (§12), §13/5 Penetration (which both unblocks §9/9's
actual resolution and building/wall combat generally), the Clear Jammed Weapon action's caller,
§11/2's deferred Captured-status mechanics, and the Port Box/equipment-inventory model this and
the ammo-box gap both now depend on.

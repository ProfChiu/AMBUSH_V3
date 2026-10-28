# 29 — Minefields and boobytraps (Phase 9, fifth slice)

**Date:** 2026-08-04
**Phase:** 9 — Combat (`docs/11_GAME_BUILD_PHASES.md`) — fifth slice, following core fire combat
(docs/24), grenades (docs/26), assault/capture (docs/27), and crew weapons/bazookas (docs/28).
Next per the phase's own "Next" list.
**Follows:** `docs/28_CREW_WEAPONS.md`.

**Deliverables:** `apps/game/hazardrules.js`, `tools/test_hazards.js` (19/19 passing). No changes
to `firecombat.js` or `checksrules.js` — both hazards resolve entirely with existing pieces.

---

## 1. Scope — two hazards, one damage table, opposite "who's hit" rules

§12 covers Boobytrap Procedure (§12/1) and Minefield Procedure (§12/2). Both use a plain
Perception Check (reused from `checksrules.js` unchanged — nothing hazard-specific about the
dice) and both resolve damage against the same fixed weapon-chart row. What's actually different
between them, and what `hazardrules.js` exists to capture, is *who checks and who gets hit*:

- **Boobytrap:** one PC Check total, by whichever soldier present has the highest PC. If it
  fails, **every** soldier in the hex takes a damage roll — not just the one who checked. One-shot
  either way: success or failure both remove the boobytrap.
- **Minefield:** every soldier who enters checks **individually**, on every single entry, forever
  (unlimited mines, never depleted). Only the soldier who fails **his own** check is hit; a
  neighbor's failed check doesn't touch anyone else in the hex.

These are close to opposite shapes for "who's affected" despite sharing everything else, which is
exactly why `resolveBoobytrapCheck`/`resolveMinefieldCheck` are kept as two named functions even
though their current bodies are identical (`{exploded: !pcSucceeded, consumed: <fixed>}`) —
same rationale `checksrules.js` already gives for keeping Perception and Activation Checks
distinct: callers reason about them as different rules, and a future change to one shouldn't
require touching the other's call sites.

**In scope:** the full resolution logic for both hazards once a hazard hex is already known to
exist. **Explicitly not in scope:** the paragraph-book trigger that establishes a hex *has* a
boobytrap or is a minefield in the first place — that's the paragraph interpreter's job
(`docs/20_PARAGRAPH_INTERPRETER.md`), already built and fully generic; nothing hazard-specific
was needed there.

## 2. A third sighting of the same "ignore actual terrain" pattern

Both §12/1 and §12/2 use identical language: damage is resolved "as if hit by an exploding
grenade indoors ... even if he is in an outdoor hex." This is the third time this exact pattern
has shown up in Phase 9 — grenades' own row selection normally depends on interior/exterior
(`docs/26`), the bazooka's splash damage to bystanders always uses the Inside row regardless of
the hex (`docs/28` §2), and now boobytraps/minefields do the same thing unconditionally.
`explosionWeaponId()` returns the fixed string `'grin'`, documented the same way the bazooka
splash rule was — a rule to trust literally, not a value to compute from the hex's own terrain
data (which would be the natural, wrong instinct here).

## 3. Verification

- `node --check` clean on `hazardrules.js` and `test_hazards.js`.
- `tools/test_hazards.js`: **19/19 passing** — the shared explosion weapon-row constant,
  boobytrap checker selection (highest PC, a documented arbitrary tie default, single-candidate
  and empty-list edge cases), boobytrap's one-shot consumption on *both* outcomes (not just
  failure — a detail easy to miss, since "successful check... the boobytrap no longer exists" is
  stated separately from the failure case), a simulated group boobytrap explosion damaging every
  soldier present, minefield's never-consumed property on both outcomes, and a simulated group
  minefield entry (three soldiers, three different PC ratings and rolls, using the real
  `checksrules.resolvePerceptionCheck`) confirming exactly the one soldier who actually failed is
  affected — not all three, not zero.
- Full project regression: **2041 checks passing**, zero failures.

## 4. Next

The rest of Phase 9: §13/5 Penetration (unblocks both wall/vehicle combat generally and §9/9's
deferred wall-fire resolution, `docs/28` §1), the Clear Jammed Weapon action's caller, §11/2's
deferred Captured-status mechanics, and the Port Box/Ammo Box equipment-inventory model several
earlier slices now depend on. After that, Phase 9 is essentially content-complete and Phase 10
(Victory + Mission 1 wiring) becomes the natural next phase.

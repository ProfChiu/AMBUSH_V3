# 34 — Ammo depletion (Task #62)

**Date:** 2026-08-10
**Task:** #62 in the standing order (`docs/32_HANDOFF.md` §3) — unblocked by Task #61.
**Follows:** `docs/33_PORT_BOX.md` (session 50, Task #61).

**Deliverables:** `apps/game/mission1demo.js` only — no new files. This task is pure wiring: the
Ammo Box primitives (`EQ.hasAmmo`/`EQ.expendAmmo`) and the real percentile-roll computation
(`FC.resolveAmmoExpenditure`) both already existed; nothing here needed a new pure-logic module.

---

## 1. What changed

§9/5: "a crouching or standing soldier can fire any weapon he possesses **if he has at least one
clip of ammo for the weapon**." Before this task, that eligibility clause didn't exist at all —
`ammoStep()` rolled percentile dice, displayed "Clip spent." or "Clip not used up.", and threw the
result away; a soldier with zero clips could still fire indefinitely.

Two changes in `mission1demo.js`:

- **`weaponUsable(s)`** (the single existing gate already used for both the player's Fire buttons
  and the German AI's fire eligibility) now also requires `EQ.hasAmmo(s.inventory, s.weaponId)`
  for US soldiers. Germans are exempt outright: §9/5's very next line is "German soldiers do not
  have Ammo Boxes and do not expend ammo clips when firing... Germans can run out of ammunition as
  a result of a paragraph" — that paragraph-driven mechanic isn't modelled anywhere in this
  codebase (no paragraph effect sets a German's ammo state), so a German is never treated as out
  of ammo by this general check. One function change covers both call sites (`showActionPanel`'s
  Fire-button disable, and `performGermanActions`'s fire-eligibility branch) since both already
  routed through it.
- **`ammoStep()`** now does the deduction for real: for a German firer it returns immediately —
  §9/5 says the Ammo Check itself doesn't apply to them, not just its consequence, so no
  "Ammo Check" popup or log line is ever produced for a German shot (guaranteed by construction —
  a single `if` guard sits before the function's only `rollPopup` call, so there is no code path
  that reaches it for `firer.side === 'german'`). For a US firer, the deduction happens in the
  roll's completion callback — `EQ.expendAmmo(firer.inventory, firer.weaponId)` when the roll says
  a clip was spent — matching this file's own established convention (`damageStep` applies its
  side effect the same way: recompute from the roll inside the completion callback, never inside
  `explain`/`logText`, which stay pure display functions of the roll and may not fire exactly
  once).

The panel and log messages were extended to say "out of ammo" alongside the existing "broken"/
"jammed" reasons, rather than only ever attributing a disabled Fire button to the weapon's
physical condition.

## 2. A real bug found and fixed along the way

Live-verifying this task (see §3) surfaced a genuine, pre-existing crash unrelated to ammo:
`assaultChain`'s `damageStep` special-cased the Assault Table's `'C'` (Captured) result before
calling `FC.escalateDamageResult`, but not `'*'` ("No effect" — `DAMAGE_LEGEND['*']`, a real
result on the `asltk` row, e.g. an Assault-to-Kill roll of 0). `escalateDamageResult` only accepts
raw P/W/I/K codes and throws on anything else, so any assault landing on a `*` damage result
crashed the page — in both the `explain` callback (before the player even sees the roll's outcome)
and the `onClose` callback (which would otherwise have called `applyDamage(defender, '*', ...)`).
Fixed by adding the same `if (code === '*')` short-circuit already used for `'C'`, in both places.
Unrelated to this task's actual scope but small, real, and found directly by this task's own live
testing, so fixed rather than left for a future session to rediscover.

## 3. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (unaffected — none of them exercise
  `mission1demo.js`'s DOM-driven fire chain directly, only the pure modules it calls),
  `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known non-failures).
- **Live via Playwright, real dice throughout:**
  - Pre-set a soldier's Ammo Boxes to zero clips of their own weapon type (simulating "already
    ran dry" — the natural end state this task produces, without needing to grind real RNG down to
    zero first) and drove play to that soldier's turn: `#fireAimed`/`#fireSnap` were both disabled,
    the stat line read "... out of ammo", and the log recorded "Pvt. Mercer's weapon is out of
    ammo and cannot fire."
  - Drove a real multi-round US-fires-repeatedly sequence (no pre-set state, only real dice): total
    clips carried across the squad dropped from 24 to 23 after 4 real shots, log confirming exactly
    one "Ammo: NN → clip spent." roll among them and three "not used up." — the deduction fires
    exactly when, and only when, the real percentile roll says it should.
  - Zero console errors in either run (after the `*`-guard fix above).
  - **Not directly reproduced live:** a German actually getting a fireable turn and confirming no
    "Ammo Check" ever appears for it. Scripted playthroughs in this session had the German either
    die quickly to US fire or never get LOS to a target before the run's iteration budget ran out —
    not a sign of a problem, just bad luck with real RNG in a scripted run. Not chased further since
    the guarantee here doesn't rest on observation: `ammoStep`'s German branch is a single `if`
    ahead of the function's only `rollPopup` call, so there is no code path left that could produce
    one for a German firer.
  - **One unreproduced anomaly, noted rather than chased:** a single scripted run produced one
    `PAGEERROR: Cannot read properties of null (reading 'colIdx')` immediately after a German was
    killed and the game transitioned back to Operations — did not reproduce on a repeat run with
    the same setup. Structurally, this sits in the pre-existing Operations-transition/rendering
    path (`endRound`'s "no active Germans → back to Operations" branch, `selectSoldier`/
    `renderDestinations`, or hex-grid math on a removed counter's now-stale hex reference) — none
    of which this task touched. Flagged rather than silently ignored, per this project's standing
    convention, but not fixed: it didn't reproduce reliably enough to isolate a cause, and doing so
    is movement/rendering-domain work, not ammo depletion.

## 4. Next

Per the standing order: #63 (grenade combat — `EQ.hasGrenade`/`EQ.expendGrenade` are ready, same
shape of wiring this task just did for personal weapons), #59 (Drag Inactive Soldier), and #68
(Pick Up/Exchange Equipment) remain unblocked from Task #61 and are still open. The unreproduced
`colIdx` anomaly above is worth a five-minute look if it's ever seen again with a reproducible
setup.

# 43 — Prepare Weapon (Task #69)

**Date:** 2026-08-11
**Task:** #69 in the standing order (`docs/32_HANDOFF.md` §3) — no blockers, next after Task #67.
**Follows:** `docs/42_GROUP_MOVEMENT.md` (session 59, Task #67).

**Deliverables:** `apps/game/mission1demo.js` (real state + action), `apps/game/mission1.html`
(new button). No changes to `crewweaponrules.js` — it already implements every actual *firing*
consequence of a crew weapon (§9/7); this task is specifically the missing "is it ready to fire
at all" state that module's own header already flagged as out of scope.

---

## 1. Scope: mmg only, both sides

§5/3/§6/7: "A standing or crouching soldier can prepare a weapon that requires preparation before
it can be fired... Personal weapons need not be prepared to fire." Only `mmg` (crew machine gun)
requires this in the current build — bazookas and satchel charges are never purchased,
distributed, or pickup-able by any soldier (the same "never reachable with current data" status
already flagged for both in `crewweaponrules.js`'s header and the satchel note in
`docs/35_GRENADE_COMBAT.md`), so tracking a prepared state for either would be dead code. Several
German cards do carry a Light Machinegun (`guessGermanWeaponId` maps that text to `mmg`), so this
is genuinely reachable on the German side today, and reachable on the US side the moment a player
picks one up via Task #68's Pick Up/Exchange Equipment.

## 2. What changed

- **`WEAPONS_REQUIRING_PREPARATION = { mmg: true }`** and a new `s.weaponPrepared` boolean, folded
  into `weaponUsable(s)`'s existing gate (the same function §9/4 jammed/broken and §9/5 ammo
  already live in) — one more "can this soldier actually fire" condition, not a parallel check.
- **New "Prepare Weapon" action** (Rounds only — matching every other action-panel button added
  this session; §5/3 lists an Operations-phase version too, left as a small, flagged follow-up
  since nothing about `canPrepareWeapon`/the state itself is phase-specific). Standing or
  crouching only, consumes the turn like Pass/Change Stance.
- **"Remains prepared until it is moved"** — a new shared `unprepareWeaponOnMove(s)` helper,
  called from every place a soldier's `hexId` changes: the player's own Rounds move
  (`doRoundMove`), and both German movement paths (`a.action === 'move'` and
  `move_by_reference`) — the rule applies to either side, not just the player's.
- **Starting state, a real judgment call**: a US soldier's crew weapon always starts unprepared
  (whether from squad generation — moot today, since one is never purchased — or a battlefield
  pickup via Task #68, where `afterWeaponPickup` now resets `weaponPrepared` on a newly adopted
  weapon: whoever last carried it isn't handing it over ready-to-fire). A **German**'s crew weapon
  starts **already prepared** — no German action program anywhere in
  `assets/data/german_action_programs.js` contains a "prepare" step of any kind (confirmed by
  grep, not assumed), so treating an activated German as arriving with his machine gun ready
  avoids inventing an unmodelled AI behavior that would otherwise leave him permanently unable to
  fire it.

## 3. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (unaffected — no pure-logic module
  changed), `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known
  non-failures).
- **Live via Playwright, real state, via new `canPrepareWeaponForTesting`/`weaponUsableForTesting`/
  `unprepareWeaponOnMoveForTesting` debug hooks**: a spawned German's weapon starts prepared
  (confirmed on `GE 33/V`, whose card happened to carry a Machine Pistol this run — not gated
  either way, since `WEAPONS_REQUIRING_PREPARATION` only cares about `mmg`); simulating a US
  soldier picking up an `mmg` correctly left him unable to fire (`weaponUsable: false`) with
  `canPrepareWeapon: true`; `unprepareWeaponOnMove` correctly flipped a prepared `mmg` to
  unprepared (and is correctly idempotent — a second call is a no-op), and correctly left a
  personal-weapon soldier's movement unaffected. Zero console errors throughout. The DOM
  button/click wiring itself wasn't separately re-verified via a live click — it follows the
  identical `infoPopup` → `Sched.completeAction` → `driveNext` shape already proven correct by
  eight prior action buttons this session (Give Turn, Make Aware, Change Stance, Pick Up,
  Drag, ...), and the state transition it performs is the same one-line mutation already
  confirmed above.

## 4. Next

Per the standing order: #70 (Snap Fire twice, Move/Snap Fire) is next.

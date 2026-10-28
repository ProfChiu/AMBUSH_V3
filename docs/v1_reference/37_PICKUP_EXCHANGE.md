# 37 — Pick Up / Exchange Equipment (Task #68)

**Date:** 2026-08-10
**Task:** #68 in the standing order (`docs/32_HANDOFF.md` §3) — the last task unblocked by Task
#61, following Task #59.
**Follows:** `docs/36_DRAG_INACTIVE_SOLDIER.md` (session 53, Task #59).

**Deliverables:** `apps/game/mission1demo.js` (the real action, a new ground-items model),
`apps/game/mission1.html` (new button). No changes to `equipmentrules.js` — every primitive this
task needed (`stowItem`, `dropItem`, `stowAmmo`, `carriedItemIds`) already existed from Task #61.

---

## 1. What changed

§5/3/§6/7: "A soldier that is standing or crouching can pick up or put down any portable items in
his hex. Two soldiers in the same hex can exchange equipment... A soldier that is taking equipment
from an inactive soldier must be crouching. ... You can pick up and use most German equipment
(§14)." Before this task, none of it existed, and — found while building it — the one place items
were already supposed to end up on the ground (§13/2 wound-loss overflow, Task #61) never actually
put them there: `applyDamage`'s wound branch logged "drops BAR" and the item simply vanished.

- **New ground-items model.** `groundItems[hexId]` is an array of `{ id, kind: 'port'|'ammo' }` —
  needed because a bare item id is ambiguous (a `'carb'` string could mean the weapon itself, one
  Port Box, or a matching clip, one Ammo Box; only the array it's tagged for disambiguates it).
  Wound-loss overflow now calls `addGroundItem` for real instead of only logging.
- **New "Pick Up / Exchange Equipment" button**, gated on `pickupOffers(actor)` — enumerates every
  ground item in the actor's hex, every weapon and ammo/grenade unit carried by every *other*
  soldier (US or German, active or not) in the same hex, filtering out anything from an inactive
  soldier unless the actor is crouching (§5/3's own distinction — ground items and an active
  ally's gear need only standing/crouching).
- **One "take" action, not a two-way trade UI.** The rulebook's "exchange" is item-transfer
  between two soldiers in a hex; which soldier's turn performs the move doesn't change which end
  states are reachable — if A wants to give X to B, B can just take X from A on his own turn
  instead. Modelled as a single flat offer list (reusing the row-picker shape `chooseTarget`
  already established, via a new `chooseOffer`) rather than building a full bidirectional
  give/take/drop UI.
- **§14 German equipment.** A German's personal weapon was never in any Port Box at all — Germans
  get no full inventory model (docs/33_PORT_BOX.md's own decision: "driven by their cards, not a
  Squad Record"). `takeGermanWeapon` synthesizes a single-item transfer straight from his
  `weaponId` string instead of a box move, and nulls it out once taken (he's genuinely disarmed —
  a second soldier can't also loot the same rifle). His grenades already went through the real
  Task #63 lightweight inventory, so those use the normal ammo-transfer path unchanged.
- **A small local weapon-cost lookup, not a shared-table addition.** Two German-only weapon ids
  (`bolt`, `mp` — `guessGermanWeaponId`) had no Port Box cost anywhere, since nothing had ever
  needed to stow one before. The natural place, `assets/data/squad_generation.js`'s `EQUIPMENT`
  table, is also what drives `apps/trainer/index.html`'s interactive purchase lesson — adding them
  there would have let a trainer user "buy" German-issue weapons in Squad Generation, which the
  real Equipment Cost Chart doesn't offer. Kept as a small `GERMAN_ONLY_WEAPON_BOXES` map local to
  `mission1demo.js` instead.

**Deliberately NOT in scope**, matching this project's standing pattern of flagging gaps instead
of guessing:
- **§14's captured-weapon −1 WS penalty.** WS is a single scalar per soldier here, not tracked
  per-weapon — the exact same pre-existing simplification `assaultOpts`'s hardcoded
  `attackerUsingCapturedWeapon: false` already flagged as unapplied (§11/4's captured-weapon
  assault modifier). Picking up German gear now just activates that already-acknowledged gap
  rather than introducing a new one.
- **Voluntary "put down."** Dropping an item with nothing else happening isn't wired to a button —
  the one case that actually needs items on the ground (wound-loss overflow) already creates them
  for real now. A bare drop action is low-value without a concrete use case and left for later.
- **Operations-phase availability.** §5/3 lists this as an Operations action too (§6/7 for
  Rounds); this task only wires the Rounds action panel, matching every other action button built
  this week (Fire/Assault/Grenade/Drag are all Rounds-only in this codebase). `pickupOffers`/the
  `take*` functions are phase-agnostic, so an Operations button is a small follow-up, not a
  redesign.

## 2. Verification

- `node --check` clean on `mission1demo.js`.
- Full regression: all 17 `tools/test_*.js` suites passing (unaffected — no pure-logic module
  changed), `verify_reference_data.py` 152/152, `verify_assets.py` unchanged (same two known
  non-failures).
- **Live via Playwright, real state, via new `pickupOffersForTesting`/`takePickupOfferForTesting`/
  `groundItemsForTesting` debug hooks** (same convention as every prior task's hooks — read real
  state and drive the real production functions directly):
  - A real wound correctly dropped a BAR into `groundItems` for the first time ever (previously
    logged and discarded); a co-located ally correctly picked it up once given room, `weaponId`
    correctly adopted since he was unarmed, the ground entry correctly removed.
  - Capacity correctly rejects an over-budget take (confirmed with a BAR — 2 Port Boxes — against
    a soldier with only 1 free) without mutating either side, matching `doPlayerPickup`'s "no room
    to carry X" message path.
  - The crouching-for-inactive-soldier gate confirmed both ways: an inactive German's weapon was
    absent from the offer list while the actor was standing, present once crouching.
  - A clean German-weapon pickup end to end: offer taken, weapon moved into the taker's Port Box,
    `weaponId` adopted (taker was unarmed), the German's own `weaponId` correctly nulled — a
    second soldier can no longer also loot the same rifle.
  - Zero console errors across every one of these runs.
  - **Not directly reproduced**: clicking the real in-game button during a genuinely-live turn.
    Three scripted playthroughs each had Round 1 end before any US soldier reached an actionable
    turn slot — the same RNG-driven outcome already seen (and accepted) for Tasks #59 and #63,
    zero errors in every attempt. Not chased further given `doPlayerPickup` calls the identical
    `pickupOffers`/`chooseOffer`/`Sched.completeAction` sequence already exercised directly above.

## 3. Next

This closes out every task Task #61 unblocked (#62, #63, #59, #68). Per the standing order, #64
(Give Turn, commanders) is next — unblocked by Task #56, independent of the Port Box work.

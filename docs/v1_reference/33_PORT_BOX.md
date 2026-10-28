# 33 — Port Box / Ammo Box equipment inventory (Task #61, the keystone)

**Date:** 2026-08-09
**Task:** #61 in the standing order (`docs/32_HANDOFF.md` §3) — "the keystone," the last genuinely
new piece of architecture before the remaining Mission 1 gaps become wiring work.
**Follows:** `docs/32_HANDOFF.md` (session 49, Task #57).

**Deliverables:** `apps/game/equipmentrules.js` (new), `tools/test_equipment.js` (new, 38/38
passing), `assets/data/squad_generation.js` (`EQUIPMENT` entries gain `box`/`boxes`/
`unitsPerPurchase`, additive — `portage` untouched, still read by `apps/trainer/index.html`),
`apps/game/squadgenrules.js` (`distributeEquipment`, new), `tools/test_squadgen.js` (+13
assertions), `apps/game/mission1demo.js` (real distribution wired into `buyEquipment()`, roster
display, §13/2 wound hook), `apps/game/mission1.html` (new script tag).

---

## 1. What this closes

Before this task, the game abstracted equipment to "the soldier still has this weapon"
(docs/31_VICTORY.md §3.1, docs/24_FIRE_COMBAT.md §1): `weaponId` was a single hard-coded string
(`s.weaponId = s.isCommander ? 'carb' : 'carb'; // provisional`), ammo-expenditure dice were rolled
and displayed but never deducted from anything, grenades were unlimited-in-theory but disabled
outright ("no grenade inventory is modelled"), and Drag Inactive Soldier's "empty Port Box"
requirement was a caller-supplied boolean with no real inventory behind it. Four other tasks
(#62 ammo depletion, #63 grenade combat, #59 Drag Inactive Soldier, #68 Pick Up/Exchange Equipment)
were explicitly blocked on this one existing.

**In scope:** the real §2/15 Squad Record model — 2 Port Boxes and 6 Ammo Boxes per soldier,
§4/9's weapon-purchase-to-Port-Box assignment (auto-buy heuristic, not a human choosing), §9/5's
"clips are not interchangeable" ammo typing, and §13/2's "wounded soldier's Port Box total is
reduced to one" consequence. Also fixed a real, if minor, pre-existing data-modeling bug while
building this: `squad_generation.js`'s `EQUIPMENT` table listed a pistol as a 1-Port-Box item;
§2/15 is explicit that "each ammo clip, bazooka round, grenade, **and pistol** takes up one Ammo
Box" — a pistol is the one weapon that does *not* take a Port Box. Corrected via the new `box`
field (additive, `portage` kept for the trainer's existing display).

**Deliberately NOT in scope**, matching this project's standing pattern of flagging gaps instead
of guessing:
- **Enforcing ammo depletion as a combat consequence** (Task #62). `firecombat.js`'s
  `resolveAmmoExpenditure()` still just computes whether a clip *would* be spent; this task gives
  #62 a real `EQ.hasAmmo`/`EQ.expendAmmo` to call, but nothing here calls them from `ammoStep()`
  yet — a soldier can still fire with an empty Ammo Box today.
- **Enabling the grenade-throw action** (Task #63). `EQ.hasGrenade`/`EQ.expendGrenade` exist for
  it; `grenaderules.js` and the player's own grenade action are untouched.
- **The crew-weapon two-soldier carry/split state machine** (§9/7, flagged as deferred in
  `crewweaponrules.js`'s own header). `stowItem`/`dropItem` are written to support a multi-box
  item split across two soldiers' separate inventories whenever something calls them that way, but
  nothing does yet — `mmg` (3 Port Boxes) is never auto-bought by the current squad-gen heuristic,
  so Mission 1 as built never exercises it.
- **Other §13/2 wound consequences** (MPA → 2, no free stance change, −1 firing / −2 grenade
  modifiers) — Task #58 "Wound effects." Only the Port-Box-specific clause of §13/2 belongs to the
  inventory model itself; wiring it now (rather than waiting for #58) was a judgment call, made
  because it's the one piece of "does the Port Box model correctly handle a capacity change"
  behavior that's otherwise untestable outside a unit test.
- **A real interactive buying screen.** §4 assumes a human negotiating a budget; `autoBuySoldiers`/
  `autoBuyEquipment` (pre-existing) and the new `distributeEquipment` are all documented judgment
  calls for the auto-play path this project actually has, same status as before this task.

## 2. The model (`equipmentrules.js`)

Two fixed box counts per soldier, both derived directly from rule text rather than assumed:
Port Boxes = 2 (§13/2's "reduced to one" only makes sense against an un-wounded baseline of 2,
confirmed independently by §4/9's "a soldier can never carry more than two Port Boxes worth of
weapons"); Ammo Boxes = 6 (§9/5, stated directly). `createInventory()` returns
`{ portBoxes: [null, null], ammoBoxes: [null,null,null,null,null,null] }` — fixed-length arrays
regardless of wound state, since resizing on wound would lose the original shape; wound instead
sets a `portBoxCapacityOverride` on the *soldier*, and every capacity-aware function
(`emptyPortBoxCount`, `stowItem`) reads it.

`stowItem`/`dropItem` work in box-*counts*, not named slots — a weapon's `boxes` cost (1-3, from
`squad_generation.js`'s `EQUIPMENT` table) fills that many empty boxes; `dropItem` clears every box
holding a given item id, so a 2-box item is dropped as a unit automatically. `carriedItemIds`
dedupes across an item's boxes for display purposes (a BAR occupying 2 boxes shows as one item, not
two).

Ammo Boxes are typed by the identifier of what's in them — a weapon's own id for a clip (`carb`,
`bar`, ...), `'gren'` for a grenade — which is how `hasAmmo`/`expendAmmo` enforce §9/5's "clips are
not interchangeable" without a separate lookup table: a clip only matches if its stored id equals
the weapon being fired. Expending ammo just nulls the slot rather than tracking a separate "spent"
marker, matching §9/5's own text: "acquired ammo can be marked in any empty box, **including a box
indicating spent ammo**" — a spent box already behaves as empty for refill purposes, so there's no
observable difference worth a second state.

## 3. §13/2 wound loss — one algorithm, both cases

"If he is carrying two Port Boxes of equipment, he must immediately drop the contents of one Port
Box. If the item he is carrying is a two-box item, he must drop it immediately." Rather than
branching on which case applies, `applyWoundPortBoxLoss` repeatedly drops whatever occupies the
highest-index occupied box until occupancy fits the new 1-box capacity. For two separate 1-box
items this drops just the one in box index 1; for a single 2-box item, both boxes hold the same id,
so the first (and only) iteration's `dropItem` call clears both at once — the same code path
produces the rulebook's two different-sounding outcomes because they're really one rule ("keep
dropping until it fits") described from two example angles.

Wired into `mission1demo.js`'s `applyDamage()` right after the existing `Sched.applyWoundedStatus`
call, US soldiers only (Germans carry no Port Box model — they're driven by their cards, not a
Squad Record). Verified live (Playwright, not just the unit suite): a BAR-armed soldier
(`portBoxes: ['bar','bar']`) forced to `applyDamage('W')` mid-Rounds via a new debug hook
(`applyWoundForTesting`) came out with `portBoxes: [null, null]`, `portBoxCapacityOverride: 1`, and
a real combat-log line — "Pvt. Mercer drops BAR (wounded, Port Box reduced to one)." — zero
console errors, ammo boxes untouched (correct: the rule only reduces Port Boxes, not Ammo Boxes).

## 4. Squad-generation distribution (`distributeEquipment`)

`autoBuySoldiers`/`autoBuyEquipment` (pre-existing) only ever produced *aggregate* totals — "6
carbines, 1 BAR, 14 ammo purchases, 14 grenade purchases" — never assigned to anyone.
`distributeEquipment(soldiers, bought, chart, EQ)` does the assignment: every soldier who was
actually bought a carbine gets it stowed plus its free clip (§4/9: "each weapon... comes with one
free ammo clip when bought"); the single purchasable BAR swaps onto the commander's Port Boxes
(dropping the carbine and its now-mismatched clip first, mirroring the pre-existing "commander
gets it" special case, but through the real stow/drop functions instead of overwriting a string);
remaining purchased clips round-robin across armed soldiers **typed to each soldier's own weapon**
(§9/5); remaining grenades round-robin across everyone with a free Ammo Box.

**A pre-existing property surfaced, not introduced, by this task:** `autoBuyEquipment` spends every
last Weapon Point with no awareness of carrying capacity at all — the real WP range can buy far
more ammo and grenades than 6-8 soldiers' Ammo Boxes can physically hold. `distributeEquipment`
correctly stops at each soldier's 6-box cap rather than overflowing, so some purchased ammo/grenades
end up un-carriable and simply don't get distributed. `test_squadgen.js` asserts on this directly
(`<=` what was bought, not `===`) rather than silently accepting a looser bound. Tightening
`autoBuyEquipment` itself to stop buying past total squad carrying capacity would be a reasonable
follow-up but is a squad-gen-heuristic quality question, not a Port Box correctness one — left
alone to keep this task's diff to the inventory model itself.

**Also handled honestly:** an artificially tight WP budget (this project's existing
`test_squadgen.js` "tiny" case, 3 WP / 6 soldiers) doesn't buy a carbine for everyone.
`distributeEquipment` now leaves the remainder genuinely unarmed (`weaponId: null`, empty
inventory) rather than the old code's unconditional `s.weaponId = 'carb'` regardless of what was
actually purchased.

Verified live: a full squad-generation playthrough (Playwright, headless, zero console errors)
produced real, distinct per-soldier inventories — e.g. `A` (commander, BAR): `portBoxes: ['bar',
'bar']`, `ammoBoxes` full of 6 `'bar'` clips; `B`/`C`/`D` (carbine): `portBoxes: ['carb', null]`,
6 `'carb'` clips each — and the roster panel now shows a live equipment summary per soldier
("BAR, 6 clips" / "M1 Carbine, 6 clips") instead of nothing.

## 5. Verification

- `node --check` clean on `equipmentrules.js`, `squadgenrules.js`, `mission1demo.js`.
- `tools/test_equipment.js`: **38/38 passing** — base capacities, stow/drop with correct box
  counts, Ammo Box typing and the "spent box is refillable" rule, both §13/2 wound-loss cases plus
  the "already fits, nothing to drop" and "capacity itself shrinks, not just occupancy" edge cases.
- `tools/test_squadgen.js`: **42/42 passing** (13 new) — real-budget distribution (every
  armed soldier carries their own weapon + free clip, no soldier exceeds either box cap, carried
  totals never exceed what was bought), tight-budget distribution (honest partial arming).
- Full regression: all 17 `tools/test_*.js` suites passing, `verify_reference_data.py` 152/152,
  `verify_assets.py` unchanged (the same two pre-existing, documented non-failures).
- Live via Playwright: full squad-generation playthrough with real per-soldier inventories
  (§4 above) and a real mid-Rounds wound dropping a 2-box BAR correctly (§3 above), zero console
  errors in both runs.

## 6. Next

Per the standing order, #61 unblocks four tasks: #62 (ammo depletion — wire `EQ.hasAmmo`/
`expendAmmo` into `firecombat.js`'s ammo-check step so an empty weapon actually can't fire), #63
(grenade combat — wire `EQ.hasGrenade`/`expendGrenade` into the player's and German's grenade
action, currently disabled outright), #59 (Drag Inactive Soldier — replace the caller-supplied
`draggerHasEmptyPortBox` boolean in `movementrules.js` with a real
`EQ.emptyPortBoxCount(dragger.inventory, dragger) > 0` check, and actually wire the action into
`mission1demo.js`, which today has no caller for it at all), and #68 (Pick Up/Exchange Equipment —
`EQ.stowItem`/`dropItem`/`stowAmmo` are the primitives it needs). #64 (Give Turn, commanders) also
remains next per the order, independent of this task.

/*
 * equipmentrules.js — Task #61 Port Box / Ammo Box equipment inventory (§2/15, §5/3, §9/5, §9/7,
 * §13/2, docs/33_PORT_BOX.md)
 *
 * Pure logic, no DOM. Before this file, the game abstracted equipment to "the soldier still has
 * this weapon" (docs/31_VICTORY.md §3.1) — `weaponId` was a single string on the soldier object,
 * ammo checks rolled dice but never deducted anything (`mission1demo.js` `ammoStep()`), and
 * `movementrules.js`'s Drag Inactive Soldier accepted a caller-supplied `draggerHasEmptyPortBox`
 * boolean with no real inventory behind it. This module is the real Squad Record model those
 * gaps were waiting on.
 *
 * §2/15: "Port Boxes provide space to record the weapons and equipment the soldier is carrying...
 * A soldier cannot carry more items than his Port Boxes allow." / "Ammo Boxes provide space to
 * record the clips, grenades, bazooka charges, and pistols the soldier is carrying."
 *
 * Two box counts, established from §9/5 ("A soldier can never carry more than six Ammo Boxes") and
 * §13/2 ("A wounded soldier's Port Box total is reduced to one" — the un-wounded total is 2, matching
 * §4/9's "a soldier can never carry more than two Port Boxes worth of weapons"):
 *   - Port Boxes: 2 (weapons/satchel charges — see `EQUIPMENT[].boxes` in squad_generation.js).
 *   - Ammo Boxes: 6 (one per clip, grenade, bazooka round, or pistol — §9/5, §2/15).
 *
 * Deliberately NOT in scope, matching this project's standing pattern of flagging gaps rather
 * than guessing: the crew-weapon two-soldier carry/split state machine (§9/7 — MMG is never
 * auto-bought by squadgenrules.js's current heuristic, so nothing in Mission 1 as built exercises
 * it yet; `stowItem`/`dropItem` below are written to support a multi-box split across two
 * soldiers' inventories whenever that's needed, but no caller wires it — crewweaponrules.js's own
 * header already flags this the same way); actually enforcing "no ammo -> can't fire" during fire
 * combat (Task #62, blocked by this one) and enabling the grenade-throw action (Task #63, also
 * blocked by this one) — this module exposes `hasAmmo`/`expendAmmo`/`hasGrenade`/`expendGrenade`
 * for those tasks to call, but nothing here calls them into a combat consequence yet.
 */
(function () {
  'use strict';

  var PORT_BOX_CAPACITY = 2;
  var AMMO_BOX_CAPACITY = 6;

  function createInventory() {
    return { portBoxes: [null, null], ammoBoxes: [null, null, null, null, null, null] };
  }

  // §13/2: "A wounded soldier's Port Box total is reduced to one." Stored as an override on the
  // soldier (set by applyWoundPortBoxLoss below) rather than resizing the inventory's own array,
  // so a healed/unwounded soldier's original two boxes are never lost from the data shape.
  function portBoxCapacity(soldier) {
    return (soldier && soldier.portBoxCapacityOverride) || PORT_BOX_CAPACITY;
  }

  function emptyPortBoxCount(inv, soldier) {
    var cap = portBoxCapacity(soldier);
    var count = 0;
    for (var i = 0; i < inv.portBoxes.length && i < cap; i++) if (!inv.portBoxes[i]) count++;
    return count;
  }

  function carriedItemIds(inv) {
    var seen = {}, out = [];
    inv.portBoxes.forEach(function (id) { if (id && !seen[id]) { seen[id] = true; out.push(id); } });
    return out;
  }

  // §4/9: "A weapon... takes up 1, 2, or 3 Port Boxes." Fills the first `boxesNeeded` empty boxes
  // within the soldier's current capacity (wound-aware); does nothing if it doesn't fit.
  function stowItem(inv, soldier, itemId, boxesNeeded) {
    if (emptyPortBoxCount(inv, soldier) < boxesNeeded) return false;
    var cap = portBoxCapacity(soldier), filled = 0;
    for (var i = 0; i < inv.portBoxes.length && i < cap && filled < boxesNeeded; i++) {
      if (!inv.portBoxes[i]) { inv.portBoxes[i] = itemId; filled++; }
    }
    return true;
  }

  // Clears every box holding `itemId` (a multi-box item occupies more than one) and returns how
  // many boxes were freed.
  function dropItem(inv, itemId) {
    var count = 0;
    for (var i = 0; i < inv.portBoxes.length; i++) {
      if (inv.portBoxes[i] === itemId) { inv.portBoxes[i] = null; count++; }
    }
    return count;
  }

  function emptyAmmoBoxCount(inv) {
    return inv.ammoBoxes.filter(function (v) { return !v; }).length;
  }

  // §9/5: "Ammo acquired... can be marked in any empty box, including a box indicating spent
  // ammo" — a spent slot is functionally an empty one, so expendAmmo just nulls it rather than
  // tracking a separate "spent" marker.
  function stowAmmo(inv, ammoTypeId) {
    for (var i = 0; i < inv.ammoBoxes.length; i++) {
      if (!inv.ammoBoxes[i]) { inv.ammoBoxes[i] = ammoTypeId; return true; }
    }
    return false;
  }
  function hasAmmo(inv, ammoTypeId) { return inv.ammoBoxes.indexOf(ammoTypeId) !== -1; }
  function expendAmmo(inv, ammoTypeId) {
    var idx = inv.ammoBoxes.indexOf(ammoTypeId);
    if (idx === -1) return false;
    inv.ammoBoxes[idx] = null;
    return true;
  }
  function hasGrenade(inv) { return hasAmmo(inv, 'gren'); }
  function expendGrenade(inv) { return expendAmmo(inv, 'gren'); }

  // §13/2: "reduced to one; ... If he is carrying two Port Boxes of equipment, he must
  // immediately drop the contents of one Port Box. If the item he is carrying is a two-box item,
  // he must drop it immediately." Repeatedly drops the item in the highest-index occupied box
  // until occupancy fits the new 1-box capacity — this naturally covers both cases: two separate
  // one-box items (drops just the one in box index 1) and a single two-box item (both boxes hold
  // the same id, so the first drop clears both at once).
  function applyWoundPortBoxLoss(soldier, inv) {
    soldier.portBoxCapacityOverride = 1;
    var dropped = [];
    var guard = 0;
    while (inv.portBoxes.filter(Boolean).length > 1 && guard < 10) {
      guard++;
      var lastItem = null;
      for (var i = inv.portBoxes.length - 1; i >= 0; i--) {
        if (inv.portBoxes[i]) { lastItem = inv.portBoxes[i]; break; }
      }
      if (!lastItem) break;
      dropped.push(lastItem);
      dropItem(inv, lastItem);
    }
    return { droppedItemIds: dropped };
  }

  window.AmbushEquipment = {
    PORT_BOX_CAPACITY: PORT_BOX_CAPACITY,
    AMMO_BOX_CAPACITY: AMMO_BOX_CAPACITY,
    createInventory: createInventory,
    portBoxCapacity: portBoxCapacity,
    emptyPortBoxCount: emptyPortBoxCount,
    carriedItemIds: carriedItemIds,
    stowItem: stowItem,
    dropItem: dropItem,
    emptyAmmoBoxCount: emptyAmmoBoxCount,
    stowAmmo: stowAmmo,
    hasAmmo: hasAmmo,
    expendAmmo: expendAmmo,
    hasGrenade: hasGrenade,
    expendGrenade: expendGrenade,
    applyWoundPortBoxLoss: applyWoundPortBoxLoss,
  };
})();

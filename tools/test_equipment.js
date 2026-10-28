#!/usr/bin/env node
/*
 * tools/test_equipment.js — Task #61 Port Box / Ammo Box tests (docs/33_PORT_BOX.md)
 *
 * Run:  node tools/test_equipment.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/equipmentrules.js'));
const EQ = window.AmbushEquipment;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// ---------------------------------------------------------------------
// §2/15 base capacities
// ---------------------------------------------------------------------
{
  const inv = EQ.createInventory();
  check('fresh inventory: 2 empty Port Boxes', EQ.emptyPortBoxCount(inv, {}) === 2);
  check('fresh inventory: 6 empty Ammo Boxes', EQ.emptyAmmoBoxCount(inv) === 6);
  check('unwounded soldier: Port Box capacity 2', EQ.portBoxCapacity({}) === 2);
  check('wounded-override soldier: Port Box capacity 1', EQ.portBoxCapacity({ portBoxCapacityOverride: 1 }) === 1);
}

// ---------------------------------------------------------------------
// §4/9 stowing/dropping weapons in Port Boxes
// ---------------------------------------------------------------------
{
  const inv = EQ.createInventory();
  check('stow a 1-box carbine succeeds', EQ.stowItem(inv, {}, 'carb', 1));
  check('one Port Box now empty', EQ.emptyPortBoxCount(inv, {}) === 1);
  check('carried item ids include carb', EQ.carriedItemIds(inv).indexOf('carb') !== -1);

  // "A soldier can never carry more than two Port Boxes worth of weapons" — a 2-box BAR still
  // fits (the carbine hasn't been dropped), but only because 1 box remains free below.
  check('stowing a 2-box BAR on top fails (only 1 box free)', !EQ.stowItem(inv, {}, 'bar', 2));

  EQ.dropItem(inv, 'carb');
  check('after dropping carb, both boxes empty again', EQ.emptyPortBoxCount(inv, {}) === 2);
  check('a 2-box BAR now fits', EQ.stowItem(inv, {}, 'bar', 2));
  check('no Port Boxes left empty', EQ.emptyPortBoxCount(inv, {}) === 0);
  check('carried item ids: just bar (deduped across its 2 boxes)', EQ.carriedItemIds(inv).length === 1 && EQ.carriedItemIds(inv)[0] === 'bar');
}

// ---------------------------------------------------------------------
// §9/5 Ammo Boxes — clips, grenades, matching by type
// ---------------------------------------------------------------------
{
  const inv = EQ.createInventory();
  check('stow a carb clip', EQ.stowAmmo(inv, 'carb'));
  check('stow a grenade', EQ.stowAmmo(inv, 'gren'));
  check('has a carb clip', EQ.hasAmmo(inv, 'carb'));
  check('has no bar clip (clips are not interchangeable, §9/5)', !EQ.hasAmmo(inv, 'bar'));
  check('has a grenade', EQ.hasGrenade(inv));

  check('expend the carb clip', EQ.expendAmmo(inv, 'carb'));
  check('no longer has a carb clip', !EQ.hasAmmo(inv, 'carb'));
  check('expending an absent clip type fails', !EQ.expendAmmo(inv, 'carb'));

  check('expend the grenade via expendGrenade', EQ.expendGrenade(inv));
  check('no longer has a grenade', !EQ.hasGrenade(inv));

  // §9/5: "A soldier can never carry more than six Ammo Boxes worth."
  const full = EQ.createInventory();
  for (let i = 0; i < 6; i++) check('fill ammo box ' + i, EQ.stowAmmo(full, 'carb'));
  check('7th clip does not fit', !EQ.stowAmmo(full, 'carb'));
  check('a spent box (now empty) can take new ammo, even a different type', (function () {
    EQ.expendAmmo(full, 'carb');
    return EQ.stowAmmo(full, 'gren');
  })());
}

// ---------------------------------------------------------------------
// §13/2 wound reduces Port Box total to one
// ---------------------------------------------------------------------
{
  // Two separate 1-box items: wound drops just one, keeps the other.
  const soldierA = {};
  const invA = EQ.createInventory();
  EQ.stowItem(invA, soldierA, 'carb', 1);
  EQ.stowItem(invA, soldierA, 'satch', 1);
  const resultA = EQ.applyWoundPortBoxLoss(soldierA, invA);
  check('wound: capacity now 1', EQ.portBoxCapacity(soldierA) === 1);
  check('wound: exactly one item dropped', resultA.droppedItemIds.length === 1);
  check('wound: one Port Box worth of contents remains', EQ.carriedItemIds(invA).length === 1);

  // A single 2-box item: wound must drop the whole thing, per the rulebook's explicit clause.
  const soldierB = {};
  const invB = EQ.createInventory();
  EQ.stowItem(invB, soldierB, 'bar', 2);
  const resultB = EQ.applyWoundPortBoxLoss(soldierB, invB);
  check('wound: two-box item is dropped entirely', resultB.droppedItemIds.length === 1 && resultB.droppedItemIds[0] === 'bar');
  check('wound: nothing left carried after dropping the 2-box item', EQ.carriedItemIds(invB).length === 0);

  // Already at or under the new capacity: nothing to drop.
  const soldierC = {};
  const invC = EQ.createInventory();
  EQ.stowItem(invC, soldierC, 'carb', 1);
  const resultC = EQ.applyWoundPortBoxLoss(soldierC, invC);
  check('wound: soldier already within reduced capacity drops nothing', resultC.droppedItemIds.length === 0);

  // After the override, a soldier can no longer stow a 2nd 1-box item even into a nominally
  // empty box — capacity itself is down to 1, not just occupancy.
  const soldierD = {};
  const invD = EQ.createInventory();
  EQ.applyWoundPortBoxLoss(soldierD, invD); // wound before carrying anything
  check('wound: stowing one 1-box item still fits', EQ.stowItem(invD, soldierD, 'carb', 1));
  check('wound: a second 1-box item no longer fits', !EQ.stowItem(invD, soldierD, 'satch', 1));
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

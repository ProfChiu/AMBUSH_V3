/*
 * squad_generation.js — the §4 Squad Generation tables (Squad/Weapon Quality, Perception,
 * Weapon/Driving Skill, MPA, Soldier Cost, Equipment Cost)
 *
 * Hand-transcribed and rulebook-verified (source/converted/Ambush_Rules_with_Errata_R2.md §4,
 * plus reference/table1.jpg — Squad/Weapon Quality, Perception, Weapon Skill, Driving Skill,
 * MPA tables). Originally lived only in apps/trainer/ambushdata.js; relocated here for Phase 10
 * (docs/31_VICTORY.md, apps/game/squadgenrules.js) the same way every other verified trainer
 * chart has been (docs/23/24/26/27's ar_track.js/weapon_chart.js precedent) — one hand-authored
 * source, not compiled, require()-able by both the browser and Node test harnesses.
 */
window.AMBUSH_SQUAD_GEN = {
  // §4 step 2: roll 1 die (d10, 0-9) -> Squad Points.
  SQUAD_QUALITY: { 0: 29, 1: 30, 2: 31, 3: 33, 4: 35, 5: 37, 6: 39, 7: 41, 8: 42, 9: 43 },

  // §4 step 3: Squad Quality roll + 1 new die, summed (0-18) -> Weapon Points.
  WEAPON_QUALITY: {
    0: 48, 1: 47, 2: 46, 3: 45, 4: 44, 5: 43, 6: 42, 7: 41, 8: 40, 9: 39,
    10: 38, 11: 37, 12: 36, 13: 35, 14: 34, 15: 33, 16: 32, 17: 31, 18: 30,
  },

  // §4 step 4: Squad Member Cost Chart — cost in Squad Points by IN. Commanders have a 2-hex
  // Command Radius (§2/10, already implemented — arrules.commandRadiusHexIds).
  SOLDIER_COST: [
    { in: 5, cmdr: true, cost: 21, label: 'IN 5 · Commander' },
    { in: 4, cmdr: true, cost: 13, label: 'IN 4 · Commander' },
    { in: 3, cmdr: true, cost: 8, label: 'IN 3 · Commander' },
    { in: 3, cmdr: false, cost: 5, label: 'IN 3' },
    { in: 2, cmdr: false, cost: 3, label: 'IN 2' },
    { in: 1, cmdr: false, cost: 1, label: 'IN 1' },
    { in: 0, cmdr: false, cost: 0, label: 'IN 0' },
  ],

  // §4 step 5: d10 (rows 0-9) x soldier IN (cols 0-5) -> PC.
  PERCEPTION_TABLE: [
    [0, 0, 2, 4, 5, 6],
    [0, 1, 3, 4, 6, 7],
    [0, 1, 3, 5, 6, 7],
    [0, 2, 3, 5, 6, 7],
    [1, 2, 3, 5, 6, 8],
    [1, 2, 4, 5, 7, 8],
    [1, 3, 4, 6, 7, 8],
    [1, 3, 4, 6, 7, 8],
    [2, 3, 5, 6, 8, 9],
    [2, 4, 5, 7, 8, 9],
  ],

  // §4 steps 6-7: d10 + IN (0-14) -> rating.
  WS_TABLE: { 0: -2, 1: -2, 2: -2, 3: -1, 4: -1, 5: -1, 6: 0, 7: 0, 8: 0, 9: 1, 10: 1, 11: 1, 12: 2, 13: 2, 14: 2 },
  DS_TABLE: { 0: 0, 1: 0, 2: 0, 3: 2, 4: 2, 5: 2, 6: 4, 7: 4, 8: 4, 9: 6, 10: 6, 11: 6, 12: 8, 13: 8, 14: 8 },

  // §4 step 8: fixed by IN, no roll.
  MPA_BY_IN: { 0: 3, 1: 3, 2: 4, 3: 4, 4: 4, 5: 5 },

  // §4 step 9: cost in Weapon Points. Each weapon comes with 1 free ammo clip/charge.
  //
  // `box`/`boxes`/`unitsPerPurchase` added for Task #61 (docs/33_PORT_BOX.md), additive to the
  // pre-existing `portage` field (kept unchanged — still read as-is by apps/trainer/index.html's
  // purchase table). `box: 'port'` items occupy Port Boxes (`boxes` each, via
  // apps/game/equipmentrules.js `stowItem`); `box: 'ammo'` items occupy Ammo Boxes, one per unit
  // (`unitsPerPurchase` says how many individual Ammo-Box items one purchase yields — e.g. buying
  // 1 "ammo" grants 5 separate clips, per §4/9: "You receive five ammo clips for one Weapon
  // Point"). §2/15: "Each ammo clip, bazooka round, grenade, and pistol takes up one Ammo Box" —
  // note a pistol itself is an Ammo Box item, never a Port Box one, unlike every other weapon.
  EQUIPMENT: [
    { id: 'mmg', name: 'MMG (machine gun)', cost: 13, portage: 3, box: 'port', boxes: 3, note: 'crew weapon — carried split across two soldiers (§9/7)' },
    { id: 'bar', name: 'BAR', cost: 8, portage: 2, box: 'port', boxes: 2, note: '' },
    { id: 'baz', name: 'Bazooka', cost: 8, portage: 1, box: 'port', boxes: 1, note: '' },
    { id: 'smg', name: 'SMG', cost: 6, portage: 1, box: 'port', boxes: 1, note: '' },
    { id: 'sar', name: 'SAR (M1 rifle)', cost: 2, portage: 1, box: 'port', boxes: 1, note: '' },
    { id: 'carb', name: 'M1 Carbine', cost: 2, portage: 1, box: 'port', boxes: 1, note: '' },
    { id: 'satch', name: 'Satchel Charge', cost: 2, portage: 1, box: 'port', boxes: 1, note: '' },
    { id: 'pistol', name: 'Pistol', cost: 1, portage: 1, box: 'ammo', unitsPerPurchase: 1, note: 'occupies an Ammo Box, not a Port Box (§2/15)' },
    { id: 'ammo', name: 'Ammo (5 clips)', cost: 1, portage: 1, box: 'ammo', unitsPerPurchase: 5, note: 'each clip must match the carrier\'s own weapon (§9/5)' },
    { id: 'gren', name: 'Grenades (3)', cost: 1, portage: 1, box: 'ammo', unitsPerPurchase: 3, note: '' },
    { id: 'bazch', name: 'Bazooka Charge', cost: 1, portage: 1, box: 'ammo', unitsPerPurchase: 1, note: '' },
  ],

  SQUAD_LETTERS: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
  DEFAULT_NAMES: ['Mercer', 'Kowalski', 'Ruiz', 'Baker', 'Delvecchio', 'Okafor', 'Lindqvist', 'Toth'],
};

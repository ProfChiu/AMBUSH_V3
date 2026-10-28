/*
 * weapon_chart.js — the Weapon Chart, Fire Combat Modifiers Chart, and Damage Table (§9/1-9/6, §13)
 *
 * Hand-transcribed and rulebook-verified against the physical chart (docs/08_RULES_GAP_ANALYSIS.md
 * §3 called it "sound"). Originally lived only in apps/trainer/ambushdata.js; relocated here so
 * apps/game/firecombat.js can share it, same precedent as assets/data/ar_track.js
 * (docs/23_ACTION_ROUND_SCHEDULER.md) — one hand-authored source, not compiled, require()-able by
 * both the browser and Node test harnesses.
 *
 * dmg is a 10-character string indexed by die roll, HIGH ROLL FIRST: dmg[9 - roll] is the result
 * for a given roll (roll 0 -> dmg[9], roll 9 -> dmg[0]). This is the trainer's own established
 * indexing convention (apps/trainer/index.html, combatStep step 3) — kept unchanged, not
 * reinterpreted, since it was already exercised against the rulebook's Fire Combat Example
 * (§9/1: Semi-Automatic Rifle, roll of 4 -> Wounded).
 *
 * Additions beyond the original trainer data:
 *  - `automatic: true` on the four weapons that are automatic weapons for §13/6 (Aimed Automatic
 *    Weapon Damage) purposes — Submachinegun, Machine Pistol, Automatic Rifle, MMG.
 *  - GRENADE_MODS, extracted from apps/trainer/ambushdata.js the same way BASE_HIT/WEAPON_CHART/
 *    etc. were (docs/24_FIRE_COMBAT.md) — needed once grenades came into scope (docs/26_GRENADES.md).
 *  - CLEAR_JAM_CHART, transcribed fresh (not previously in the trainer at all) from
 *    assets/library/reference/grenadechart.png, which turned out to carry both the Grenade
 *    Scatter Diagrams AND this chart on the same sheet — closes the Clear Jammed Weapon Chart
 *    data gap flagged as unresolved in docs/24_FIRE_COMBAT.md §1 and docs/08_RULES_GAP_ANALYSIS.md
 *    §3.4. Row keys are Weapon Skill (already adjusted -1 by the caller for a captured weapon,
 *    §9/4/§14); columns are the fixed die-roll buckets in `buckets`.
 *  - ASSAULT_MODS, extracted from apps/trainer/ambushdata.js the same way GRENADE_MODS was, for
 *    §11 (docs/27_ASSAULT.md) — but the trainer's original 4-entry list turned out to be missing
 *    two things §11/4's actual rule text states: the "-1 captured weapon" modifier (a whole
 *    separate bullet in the rulebook, absent from the trainer's summary), and "unaware" as a
 *    third condition (alongside panicked/wounded) that nulls the defender's WS shift. Both added
 *    here, cited against the rule text directly, not carried over from the incomplete summary.
 * Every other field is unchanged from the trainer's original values.
 */
window.AMBUSH_WEAPON_CHART = {
  BASE_HIT: { same: 8, adjacent: 7, assault: 7, short: 5, med: 4, long: 3 },

  WEAPON_CHART: [
    { id: "pistol", name: "Pistol",            jam: [5, 5],  short: [2, 3],  med: [4, 5],   long: [6, 20],  dmg: "KIWWWWWPPP", ammo: 25 },
    { id: "carb",   name: "Carbine",           jam: [5, 5],  short: [2, 5],  med: [6, 11],  long: [12, 99], dmg: "KIIWWWWWPP", ammo: 25 },
    { id: "bolt",   name: "Bolt Rifle",        jam: [5, 5],  short: [2, 6],  med: [7, 14],  long: [15, 99], dmg: "KIIIWWWWPP", ammo: 25 },
    { id: "sar",    name: "Semi-Auto Rifle",   jam: [5, 5],  short: [2, 6],  med: [7, 14],  long: [15, 99], dmg: "KIIIWWWWPP", ammo: 25 },
    { id: "scope",  name: "Bolt Rifle, Scope", jam: [5, 5],  short: [2, 8],  med: [9, 18],  long: [19, 99], dmg: "KKIIIWWWWP", ammo: 25 },
    { id: "smg",    name: "Submachinegun",     jam: [5, 10], short: [2, 4],  med: [5, 9],   long: [10, 99], dmg: "KKIIIWWWPP", ammo: 50, automatic: true },
    { id: "mp",     name: "Machine Pistol",    jam: [5, 10], short: [2, 4],  med: [5, 9],   long: [10, 99], dmg: "KIIWWWWWPP", ammo: 50, automatic: true },
    { id: "bar",    name: "Automatic Rifle",   jam: [5, 10], short: [2, 9],  med: [10, 16], long: [17, 99], dmg: "KKKIIIWWWP", ammo: 50, automatic: true },
    { id: "mmg",    name: "MMG (crew)",        jam: [5, 10], short: [2, 10], med: [11, 22], long: [23, 99], dmg: "KKKKIIIWWW", ammo: 50, automatic: true },
    { id: "baz",    name: "Bazooka",           jam: [5, 5],  short: [2, 4],  med: [5, 8],   long: [9, 14],  dmg: "KKKKKKKKII", ammo: "A" },
    { id: "grout",  name: "Grenade (outside)", jam: [5, 5],  short: [2, 2],  med: [3, 4],   long: [5, 6],   dmg: "KIWXXPPPPP", ammo: "A" },
    { id: "grin",   name: "Grenade (inside)",  jam: [5, 5],  short: [2, 2],  med: [3, 4],   long: [5, 6],   dmg: "KIIWWXXPPP", ammo: "A" },
    { id: "satout", name: "Satchel (outside)", jam: [5, 5],  short: [0, 0],  med: [2, 2],   long: [3, 3],   dmg: "KIIWWWWXXP", ammo: "A" },
    { id: "satin",  name: "Satchel (inside)",  jam: [5, 5],  short: [0, 0],  med: [2, 2],   long: [3, 3],   dmg: "KKKIIIWWWX", ammo: "A" },
    { id: "asltk",  name: "Assault to Kill",   jam: null,    short: null,    med: null,     long: null,     dmg: "KIIWWWWPP*", ammo: null },
    { id: "asltc",  name: "Assault to Capture",jam: null,    short: null,    med: null,     long: null,     dmg: "ICCCCZZPP*", ammo: null },
  ],

  DAMAGE_LEGEND: {
    K: "Killed", I: "Incapacitated", W: "Wounded", P: "Panicked",
    X: "Wounded (Panic if prone)", C: "Captured", Z: "Wounded (Captured if already panicked/wounded)", "*": "No effect",
  },

  // [standing, crouching, prone] target modifier
  FIRE_MODS_TERRAIN: [
    { loc: "Open (clear/stream/bridge/road/ford)", mods: [1, 0, -1] },
    { loc: "Cover (or open with vehicle in it)",   mods: [0, -1, -3] },
    { loc: "Brush",                                mods: [0, -1, -3] },
    { loc: "Rough",                                mods: [-1, -2, -3] },
    { loc: "Rubble / Crater",                      mods: [-1, -2, -3] },
    { loc: "Woods",                                mods: [-2, -3, -4] },
    { loc: "Interior, aperture not adjacent",      mods: [-2, -4, null] },
    { loc: "Interior, aperture adjacent / none",   mods: [-1, -2, -3] },
  ],

  FIRE_MODS_OTHER: [
    { mod: "+WS", text: "Firer's Weapon Skill" },
    { mod: "−2", text: "Snap fire" },
    { mod: "+1",  text: "Aimed automatic fire, per extra target in hex" },
    { mod: "−1", text: "Firer is wounded" },
    { mod: "+4",  text: "Target is a wall" },
  ],

  GRENADE_MODS: [
    { mod: "+WS", text: "Thrower's Weapon Skill" },
    { mod: "−2", text: "Thrower is wounded" },
    { mod: "−3", text: "Throwing through non-adjacent aperture" },
    { mod: "−3", text: "Target hex not in sight" },
  ],

  // §9/4 "Clearing a Jammed Weapon": roll one die, cross-reference the soldier's Weapon Skill.
  // B/"Break" = broken permanently; explosive/penetration rounds can never be cleared (caller's
  // job to exclude those, same as any other rule this chart doesn't itself enforce).
  CLEAR_JAM_CHART: {
    buckets: [[0, 1], [2, 3], [4, 5], [6, 7], [8, 8], [9, 9]],
    rows: {
      "2": ["clear", "clear", "clear", "clear", "jam", "break"],
      "1": ["clear", "clear", "clear", "jam", "jam", "break"],
      "0": ["clear", "clear", "clear", "jam", "break", "break"],
      "-1": ["clear", "clear", "clear", "jam", "break", "break"],
      "-2": ["clear", "jam", "jam", "break", "break", "break"],
      "-3": ["clear", "break", "break", "break", "break", "break"],
    },
  },

  // §11/4 Assault Modifiers. Text form for display; apps/game/assaultrules.js applies the
  // actual conditions (attacker WS always; defender WS only if +1/+2 AND not panicked/wounded/
  // unaware; -3 charge assault; -2 attacker wounded; -1 captured weapon).
  ASSAULT_MODS: [
    { mod: "+WS", text: "Attacker always adds his WS" },
    { mod: "−WS", text: "Defender's WS subtracts only if it is +1/+2 and he isn't panicked, wounded, or unaware" },
    { mod: "−3", text: "Charge assault" },
    { mod: "−2", text: "Attacker is wounded" },
    { mod: "−1", text: "Attacker's only available weapon is a captured weapon" },
  ],
};

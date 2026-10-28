/*
 * crewweaponrules.js — Phase 9 crew weapons and bazookas (§9/7-9/9, docs/28_CREW_WEAPONS.md)
 *
 * Pure logic, no DOM. Like grenaderules.js/assaultrules.js, reuses apps/game/firecombat.js
 * directly for the actual fire resolution (resolveJamCheck, resolveHitRoll, resolveDamage,
 * resolveAmmoExpenditure, escalateDamageResult all apply unchanged — mmg and baz are just
 * WEAPON_CHART rows like any other). This file only implements what §9/7-9/8 add on top: who's
 * allowed to fire a crew weapon and in what mode (1 vs 2 soldiers, aimed vs snap), which soldier
 * a German pair's fire is resolved with, the "at most two soldiers per Round" cap, bazooka
 * preparation eligibility and its no-snap-fire rule, and the Personnel+Grenade-Inside splash
 * rule for a bazooka hitting a multi-soldier hex.
 *
 * In scope: §9/7 Crew Weapons (firing eligibility and mode, not the Port-Box carrying/
 * preparation state machine — see below), §9/8 Bazookas (preparation eligibility, no-snap-fire,
 * the splash-damage weapon-row rule), and §9/9's eligibility gate only (the PC Check that
 * decides WHETHER a German may attempt firing at a wall).
 *
 * WIRING STATUS (2026-09-06, Task A1/A2). §9/7 is now live: mission1demo.js enforces the
 * crouching requirement, snap-only solo fire, two-soldier combined aimed fire, the
 * two-distinct-soldiers-per-Round cap, and resolveGermanCrewFirer for a German pair. §9/8 and
 * §9/9 remain unwired, and for reasons that are worth stating precisely because the older note
 * here was wrong:
 *   - §9/8 bazookas: no bazooka is purchasable, distributable or pickup-able with the current
 *     data, so every bazooka function here would sit behind an unreachable branch.
 *   - §9/9 wall fire: NOT blocked on §13/5 Penetration any more — penetrationrules.js was built
 *     later in Phase 9 and provides the whole resolution (docs/30_PENETRATION.md). It is blocked
 *     on the TERRAIN DATA, which does not know Map A's buildings exist.
 *
 *     CORRECTION (2026-09-06): an earlier version of this note claimed Map A has no buildings at
 *     all. That was wrong, and wrong in an instructive way — it read "no building hexes in
 *     terrain_map_a.json" and concluded "no buildings on the map". Map A has TWO buildings, and
 *     the printed legend names both types: a STONE building around J13/K13/L12/L13 and a WOODEN
 *     building around S9/T7/T8/T9. §9/9 requires a wooden building hex, so it is reachable in
 *     principle on this very map.
 *
 *     What is actually missing is the data. Both live datasets classify those hexes as plain
 *     `clear2` — with `confidence: "high"`, so they are not even flagged for review — and their
 *     wall/window/door hexsides survive only in assets/data/los/hex_los_data_v2.csv, which is NOT
 *     the file los_map_a.json is built from. docs/15_TERRAIN_DB.md §3 already records that the
 *     auto-classifier has no reference colors for Building/Interior/Second Story and that the
 *     correction pass for them was never done. Until buildings exist in the terrain the game
 *     reads, there is no building hex for a German to fire into, and §9/9 has nothing to hook to.
 *     The prerequisite is the terrain correction pass, not Map B.
 *
 * Deliberately NOT in scope: the Port Box carrying/preparation state machine for crew weapons
 * (which two soldiers hold which pieces, when the marker flips prepared/unprepared) — the same
 * "no full equipment-inventory model yet" gap already noted for personal-weapon ammo boxes in
 * docs/24_FIRE_COMBAT.md §1; bazooka preparation is likewise just an eligibility check here, not
 * a tracked prepared/unprepared state; building collapse and vehicle knockout (§13/5, §17,
 * vehicles are scenery per docs/11 decision #2).
 *
 * JUDGMENT CALL (2026-08-04): the physical Weapon Chart (assets/library/reference/firechart.png,
 * found during docs/30_PENETRATION.md's research) appears to show three separate crew-served
 * machine gun rows — Light, Medium, Heavy — where assets/data/weapon_chart.js only has one
 * ("mmg", from the original docs/24 trainer extraction). Rather than guess at two more weapon
 * rows' worth of jam/range/damage values from an image that already proved unreliable to read
 * precisely this session, every crew-served machine gun in this build uses the single "mmg" row
 * regardless of which physical marker (light/medium/heavy) it represents. Flagged, not silently
 * assumed correct — replace with real LMG/HMG rows once that chart gets a proper close read.
 */
(function () {
  'use strict';

  // ---- §9/7 Crew Weapons: firing eligibility and mode -----------------------------
  // "A soldier must be crouching to fire a crew weapon."
  function canFireCrewWeapon(stance) {
    return stance === 'crouching';
  }

  // What's available given how many (crouching, prepared-weapon) soldiers are in the hex.
  // "A crew weapon fired by a single soldier is always a single snap fire... Two soldiers can
  // combine their actions to make a single aimed fire... [or] each can snap fire the weapon
  // once, at a cost of one action each."
  function crewFireOptions(soldierCountInHex) {
    return {
      canSnapSolo: soldierCountInHex >= 1,
      canSnapEach: soldierCountInHex >= 2,
      canAimedCombined: soldierCountInHex >= 2,
    };
  }

  // "A maximum of two soldiers can fire a single crew weapon in one Round, regardless of the
  // number of soldiers in the hex." soldiersWhoFiredThisRound: array of soldier IDs who have
  // already fired this specific weapon this Round (a soldier already in that list can fire it
  // again on a later turn — e.g. a 2-Turn soldier — the cap is on distinct soldiers, not shots).
  function canSoldierJoinCrewWeaponRound(soldiersWhoFiredThisRound, soldierId) {
    if (soldiersWhoFiredThisRound.indexOf(soldierId) !== -1) return true;
    return soldiersWhoFiredThisRound.length < 2;
  }

  // "When two soldiers fire a crew weapon together, declare one soldier as the firer and use
  // his Weapon Skill... when two Germans are firing a crew weapon, the German with the higher
  // WS is the firer, unless instructed otherwise by a paragraph or one of the soldier's cards."
  // `override`, if given (a paragraph/card instruction), always wins — matching the rulebook's
  // own CREW WEAPON EXAMPLE, where the card designates the firer regardless of WS or whose turn
  // comes first chronologically. Ties (equal WS, no override) resolve to soldierA — arbitrary
  // but deterministic; the rulebook doesn't specify a tie-break for this specific case.
  function resolveGermanCrewFirer(soldierA, soldierB, override) {
    if (override) return override;
    return soldierB.WS > soldierA.WS ? soldierB.id : soldierA.id;
  }

  // ---- §9/8 Bazookas ----------------------------------------------------------------
  // "Unlike other personal weapons it cannot be snap fired."
  function bazookaCanSnapFire() {
    return false;
  }

  // "Preparation is an action to load the weapon. The loading soldier must be standing or
  // crouching." (Can be the carrier or another soldier in the same hex — a caller-side choice,
  // not a distinction this function needs to make.)
  function canPrepareBazooka(stance) {
    return stance === 'standing' || stance === 'crouching';
  }

  // "If the hex contains more than one active soldier, use the bazooka Personnel result against
  // the target soldier, then roll separately for each other soldier in the hex using the
  // Grenade Inside row of the Weapon Chart Damage Table." Always 'grin' — not 'grout' — even if
  // the target hex is actually exterior; the rulebook is explicit that it's the Inside row
  // specifically, not whichever row would normally apply to that hex.
  function bazookaSplashWeaponId() {
    return 'grin';
  }

  // ---- §9/9 German Attacks on Buildings (OPTIONAL) — eligibility gate only ------------
  // "If the paragraph gives no other options for the German..., the German conducts a PC
  // Check: if successful, the German will fire at the wall; if fails, the German will do
  // nothing." This function resolves only that gate; the "fire at the wall" outcome is §13/5,
  // which penetrationrules.js does provide in full. Neither is wired into Mission 1: Map A does
  // have a wooden building (S9/T7/T8/T9), but the terrain data the game reads does not know it is
  // there, so there is no building hex to fire into yet. See the WIRING STATUS note in the header
  // and docs/48 item 7.
  function resolveBuildingFireEligibility(pcSucceeded) {
    return pcSucceeded ? { outcome: 'fire-at-wall' } : { outcome: 'no-action' };
  }

  window.AmbushCrewWeapons = {
    canFireCrewWeapon: canFireCrewWeapon,
    crewFireOptions: crewFireOptions,
    canSoldierJoinCrewWeaponRound: canSoldierJoinCrewWeaponRound,
    resolveGermanCrewFirer: resolveGermanCrewFirer,
    bazookaCanSnapFire: bazookaCanSnapFire,
    canPrepareBazooka: canPrepareBazooka,
    bazookaSplashWeaponId: bazookaSplashWeaponId,
    resolveBuildingFireEligibility: resolveBuildingFireEligibility,
  };
})();

/*
 * penetrationrules.js — Phase 9 penetration (§13/5, docs/30_PENETRATION.md)
 *
 * Pure logic, no DOM. §13/5 covers fire against walls and vehicles. Vehicles are out of scope
 * (Mission 1's Pz IV is scenery, docs/11 decision #2) — this file only covers the wall half:
 * the fixed hit-by-stance thresholds for a soldier behind a penetrated (not destroyed) wall, the
 * most-exposed-first targeting rule (and its aimed-automatic exception), wall-destroyed
 * collateral damage, and building collapse. All of that is taken directly from clear rulebook
 * prose — none of it requires reading the physical Weapon Chart.
 *
 * The real per-weapon Light/Medium/Heavy Penetration die-roll ranges (assets/library/reference/
 * firechart.png's color-coded Penetration column) were still not reliably transcribable as of
 * this session (docs/30_PENETRATION.md §2) — same reasoning as before: a wrong transcription
 * would silently corrupt wall/vehicle combat, and the chart's color distinctions weren't legible
 * enough to trust. Per the user's explicit direction (2026-08-04, "for any questionable rule,
 * make a judgement call... flag them for possible problem in future"), `resolvePenetrationLevel`
 * below is a deliberate, clearly-labeled JUDGMENT CALL — not the real chart — so wall combat can
 * resolve end to end now instead of blocking on a transcription problem indefinitely. Swap in
 * the real data later; `resolvePenetrationEffect`'s own signature (level in, effect out) doesn't
 * change either way.
 */
(function () {
  'use strict';

  // "Bazookas and tank main guns fire explosive shells; all other weapons fire non-explosive
  // bullets." Tank main guns aren't modeled (vehicles are scenery).
  function isExplosiveWeapon(weaponId) {
    return weaponId === 'baz';
  }

  // §13/5's three penetration levels, crossed with explosive/non-explosive shell type:
  //   Light:  explosive -> destroyed.  non-explosive -> passes through wood walls / unarmored.
  //   Medium: explosive -> destroyed.  non-explosive -> passes through anything but heavy armor.
  //   Heavy:  either -> passes through AND destroys, regardless of shell type.
  function resolvePenetrationEffect(level, isExplosive) {
    if (level === 'light') {
      return isExplosive ? { destroyed: true, passesThrough: true } : { destroyed: false, passesThrough: true, exceptions: 'heavy-armored-or-non-wood-wall' };
    }
    if (level === 'medium') {
      return isExplosive ? { destroyed: true, passesThrough: true } : { destroyed: false, passesThrough: true, exceptions: 'heavy-armored-vehicle-only' };
    }
    if (level === 'heavy') {
      return { destroyed: true, passesThrough: true };
    }
    throw new Error('resolvePenetrationEffect: level must be "light", "medium", or "heavy", got ' + level);
  }

  // ---- JUDGMENT CALL (2026-08-04) — not the real chart, see file header --------------
  // A deliberately simple, internally-consistent placeholder: an explosive weapon (bazooka)
  // always achieves Heavy Penetration on any hit (it's a dedicated anti-materiel round — no
  // tiering needed since explosive+light/medium/heavy all destroy the target anyway per
  // resolvePenetrationEffect, so the choice barely matters for a bazooka specifically). A
  // non-explosive weapon achieves Light Penetration only on its single most severe (Killed)
  // damage-table result, and no penetration at all otherwise — no weapon is granted Medium
  // penetration by this placeholder, since calibrating a third tier without the real data would
  // be guessing twice over instead of once. Flagged for replacement once firechart.png (or the
  // physical chart) gets a proper close read.
  function resolvePenetrationLevel(weaponId, damageCode) {
    if (isExplosiveWeapon(weaponId)) return 'heavy';
    return damageCode === 'K' ? 'light' : null;
  }

  // "A soldier occupying a hex when one of its wall hexsides is penetrated (but not destroyed)
  // can be hit... A prone soldier is hit on a result of 0; a crouching soldier is hit on a
  // result of 0 or 1; a standing soldier is hit on a result of 0, 1, or 2."
  var WALL_HIT_THRESHOLD = { prone: 0, crouching: 1, standing: 2 };
  function resolveWallHitByStance(stance, dieRoll) {
    var threshold = WALL_HIT_THRESHOLD[stance];
    if (threshold === undefined) throw new Error('resolveWallHitByStance: unknown stance "' + stance + '"');
    if (dieRoll < 0 || dieRoll > 9) throw new Error('resolveWallHitByStance: dieRoll must be 0-9, got ' + dieRoll);
    return dieRoll <= threshold;
  }

  // "If more than one soldier is in the hex, the fire hits the soldier in the most exposed
  // stance first [standing, then crouching, then prone]. If there are two or more soldiers in
  // the most exposed stance, determine the target of the attack at random." Note this priority
  // is the OPPOSITE of assault's "most disadvantageous" rule (assaultrules.js) — here the most
  // EXPOSED (standing) is hit first, not the weakest.
  var EXPOSURE_RANK = { standing: 0, crouching: 1, prone: 2 };
  function selectMostExposedTarget(candidates, rollDie) {
    if (!candidates || !candidates.length) throw new Error('selectMostExposedTarget: no candidates');
    var bestRank = Infinity, pool = [];
    candidates.forEach(function (c) {
      var rank = EXPOSURE_RANK[c.stance];
      if (rank === undefined) throw new Error('selectMostExposedTarget: unknown stance "' + c.stance + '"');
      if (rank < bestRank) { bestRank = rank; pool = [c]; }
      else if (rank === bestRank) { pool.push(c); }
    });
    if (pool.length === 1) return pool[0];
    return pool[rollDie() % pool.length];
  }

  // "If a hex with more than one active soldier is attacked by aimed automatic weapons fire,
  // roll one die for each and every soldier to see if he is hit" — overrides the normal
  // most-exposed-first sequential targeting for this one fire-type/weapon combination.
  function wallHitResolutionMode(fireType, isAutomaticWeapon) {
    return fireType === 'aimed' && isAutomaticWeapon ? 'each-soldier-rolls' : 'most-exposed-first';
  }

  // "If a wall is destroyed, all soldiers in the building hex... are automatically hit. Check
  // damage to each such soldier as if he were hit by semi-automatic rifle fire."
  function wallDestroyedCollateralWeaponId() {
    return 'sar';
  }

  // "If a building hex has two of its wall hexsides destroyed, the building collapses and
  // becomes a rubble hex. Any soldiers occupying the hex when this occurs are killed."
  function resolveBuildingCollapse(destroyedWallCount) {
    var collapses = destroyedWallCount >= 2;
    return { collapses: collapses, occupantsKilled: collapses };
  }

  window.AmbushPenetration = {
    isExplosiveWeapon: isExplosiveWeapon,
    resolvePenetrationLevel: resolvePenetrationLevel,
    resolvePenetrationEffect: resolvePenetrationEffect,
    resolveWallHitByStance: resolveWallHitByStance,
    selectMostExposedTarget: selectMostExposedTarget,
    wallHitResolutionMode: wallHitResolutionMode,
    wallDestroyedCollateralWeaponId: wallDestroyedCollateralWeaponId,
    resolveBuildingCollapse: resolveBuildingCollapse,
  };
})();

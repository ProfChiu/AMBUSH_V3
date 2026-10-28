/*
 * firecombat.js — Phase 9 core fire combat (docs/24_FIRE_COMBAT.md)
 *
 * Pure logic, no DOM. Scope is the first slice of Phase 9 (docs/11_GAME_BUILD_PHASES.md):
 * §9/1 Fire Combat Procedure, §9/2 Multiple Fire Targets, §9/3 Fire Shifts, §9/4 Weapon Jamming,
 * §9/5 Ammo Expenditure, §9/6 German Fire Combat Terms, and the §13/1-13/4 + 13/6 damage-result
 * rules the fire procedure depends on. Deliberately NOT in scope: minefields/boobytraps (§12),
 * crew-weapon preparation and bazookas (§9/7-9/9), and §13/5 Penetration (walls/vehicles —
 * Mission 1's Pz IV is scenery per docs/11 decision #2). Grenades/satchel charges (§10,
 * docs/26_GRENADES.md) and assault/capture (§11, docs/27_ASSAULT.md) both reuse several
 * functions here directly (resolveRangeBand, resolveHitRoll, resolveDamage,
 * escalateDamageResult, resolveXCode/resolveZCode) rather than duplicating them — see
 * apps/game/grenaderules.js and apps/game/assaultrules.js for what's actually specific to each.
 *
 * All randomness is injected (a rolled value or a rollDie() callback), never Math.random() —
 * same convention as checksrules.js/arrules.js/arscheduler.js.
 *
 * §9/1 Fire Combat Procedure, step by step, and where each step's function lives here:
 *   1. Choose target/fire type              — caller's decision (or resolveBestFireType/
 *                                              resolveClosestTarget/resolveEasiestTarget for §9/6)
 *   2. Jam/dud check (percentile)            — resolveJamCheck
 *   3. Determine range                       — resolveRangeBand
 *   4. Determine final Hit Chance            — resolveTerrainMod + computeFinalHitChance
 *   5. Roll one die, hit or miss             — resolveHitRoll (0 always hits, 9 always misses)
 *   6. Determine damage                      — resolveDamage (+ resolveAimedAutomaticCascade,
 *                                              §13/6, for aimed automatic fire on multiple targets)
 *   7. Ammo check (percentile)               — resolveAmmoExpenditure
 * Verified against the rulebook's own worked Fire Combat Example (§9/1: Soldier C, semi-auto
 * rifle, snap fire at medium range, WS -1, target standing in Open -> base 4, mods -1/+1/-2 ->
 * final Hit Chance 2; damage roll 4 -> Wounded) — see tools/test_fire_combat.js.
 *
 * Damage-result escalation (§13/2 "a wounded soldier who suffers ... a second wound result is
 * incapacitated", §13/3 "an incapacitated soldier who suffers a wound or second incapacitation
 * result is killed") is a severity ladder, not a simple max(): escalateDamageResult implements it
 * exactly as those two sentences state. Only handles the raw P/W/I/K codes fire-combat weapon
 * rows (pistol..mmg) produce directly — grenade/satchel rows also produce 'X' (resolved to P/W
 * via resolveXCode) and the assault-to-capture row produces 'Z' (resolved to W or, distinctly,
 * a non-ladder 'C' Captured result via resolveZCode) before anything reaches
 * escalateDamageResult. The literal 'C' code itself is deliberately rejected rather
 * than silently misinterpreted.
 */
(function () {
  'use strict';

  var G = window.AmbushHexGrid;

  // ---- §9/1 step 3: range -----------------------------------------------------
  // Same-hex/adjacent short-circuit before the weapon's short/med/long bands, matching the
  // rulebook's own step order ("If the target is in the same hex ... or adjacent ... range is
  // not determined. Otherwise, count the number of hexes ...").
  function resolveRangeBand(weapon, hexDistance) {
    if (hexDistance === 0) return 'same';
    if (hexDistance === 1) return 'adjacent';
    var bands = ['short', 'med', 'long'];
    for (var i = 0; i < bands.length; i++) {
      var b = weapon[bands[i]];
      if (b && hexDistance >= b[0] && hexDistance <= b[1]) return bands[i];
    }
    return null;
  }

  function hexDistance(fromId, toId) {
    var a = G.parseId(fromId), b = G.parseId(toId);
    if (!a || !b) throw new Error('hexDistance: invalid hex id (' + fromId + ', ' + toId + ')');
    return G.distance(a, b);
  }

  // ---- §9/3 Fire Shifts: terrain modifier lookup -------------------------------
  var STANCE_INDEX = { standing: 0, crouching: 1, prone: 2 };

  // A null cell in the Fire Combat Modifiers terrain table is not missing data — it means the
  // shot is IMPOSSIBLE. The only such cell is "Interior, aperture not adjacent" for a prone
  // target: a prone soldier deep inside a building simply cannot be hit from a hex that is not at
  // one of his apertures (§8/2 says he cannot even be SEEN through a window). Callers must ask
  // this before resolveTerrainMod, which still throws — reaching it for an impossible shot is a
  // programming error, not a game state.
  function canBeFiredAt(fireModsTerrain, terrainRowIndex, stance) {
    var row = fireModsTerrain[terrainRowIndex];
    if (!row) return false;
    var idx = STANCE_INDEX[stance];
    if (idx === undefined) return false;
    var mod = row.mods[idx];
    return mod !== null && mod !== undefined;
  }
  function resolveTerrainMod(fireModsTerrain, terrainRowIndex, stance) {
    var row = fireModsTerrain[terrainRowIndex];
    if (!row) throw new Error('resolveTerrainMod: no terrain row ' + terrainRowIndex);
    var idx = STANCE_INDEX[stance];
    if (idx === undefined) throw new Error('resolveTerrainMod: unknown stance "' + stance + '"');
    var mod = row.mods[idx];
    if (mod === null || mod === undefined) {
      throw new Error('resolveTerrainMod: no modifier defined for ' + stance + ' in "' + row.loc + '"');
    }
    return mod;
  }

  // Combines Base Hit Chance with every applicable modifier (§9/3), clamped to 0-8 (§9/1 step 4).
  // opts: { baseHit, terrainMod, fireType:'aimed'|'snap', weaponSkill, otherMods:[...] }
  function computeFinalHitChance(opts) {
    var total = opts.baseHit + opts.terrainMod + (opts.weaponSkill || 0);
    if (opts.fireType === 'snap') total -= 2;
    else if (opts.fireType !== 'aimed') {
      throw new Error('computeFinalHitChance: fireType must be "aimed" or "snap", got ' + opts.fireType);
    }
    (opts.otherMods || []).forEach(function (m) { total += m; });
    return { raw: total, clamped: Math.max(0, Math.min(8, total)) };
  }

  // ---- §9/1 step 2 / §9/4: jam check -------------------------------------------
  // weapon.jam is [aimedThreshold, snapThreshold] (snap fire's jam chance is often higher, e.g.
  // an SMG jams on 05 aimed but 10 snap). Roll <= threshold jams.
  function resolveJamCheck(weapon, fireType, percentileRoll) {
    if (!weapon.jam) throw new Error('resolveJamCheck: weapon "' + weapon.id + '" has no jam data');
    if (percentileRoll < 0 || percentileRoll > 99) {
      throw new Error('resolveJamCheck: percentileRoll must be 0-99, got ' + percentileRoll);
    }
    var threshold;
    if (fireType === 'aimed') threshold = weapon.jam[0];
    else if (fireType === 'snap') threshold = weapon.jam[1];
    else throw new Error('resolveJamCheck: fireType must be "aimed" or "snap", got ' + fireType);
    return { jammed: percentileRoll <= threshold, threshold: threshold };
  }

  // ---- §9/1 step 5: to-hit roll -------------------------------------------------
  // 0 always hits, 9 always misses, regardless of Hit Chance (rulebook, explicit both in §9/1
  // step 5 and the worked example) — same override shape as checksrules.js's Perception/
  // Activation Checks, but kept separate since it's a different table (Hit Chance, not a rating).
  function resolveHitRoll(hitChance, dieRoll) {
    if (dieRoll < 0 || dieRoll > 9) throw new Error('resolveHitRoll: dieRoll must be 0-9, got ' + dieRoll);
    if (dieRoll === 0) return 'hit';
    if (dieRoll === 9) return 'miss';
    return dieRoll <= hitChance ? 'hit' : 'miss';
  }

  // ---- §9/4 Clearing a Jammed Weapon --------------------------------------------
  // Roll one die, cross-reference the soldier's Weapon Skill (already reduced by 1 by the
  // caller if the weapon is captured, §14) on the Clear Jammed Weapon Chart
  // (assets/data/weapon_chart.js CLEAR_JAM_CHART). Explosive/penetration rounds can never be
  // cleared — that's a caller-side eligibility check (which weapon this even applies to), not
  // this function's job, same division of responsibility as every other resolver here.
  function resolveClearJamAction(weaponSkill, dieRoll, clearJamChart) {
    if (dieRoll < 0 || dieRoll > 9) throw new Error('resolveClearJamAction: dieRoll must be 0-9, got ' + dieRoll);
    var row = clearJamChart.rows[String(weaponSkill)];
    if (!row) throw new Error('resolveClearJamAction: no chart row for Weapon Skill ' + weaponSkill);
    var buckets = clearJamChart.buckets;
    for (var i = 0; i < buckets.length; i++) {
      if (dieRoll >= buckets[i][0] && dieRoll <= buckets[i][1]) return { result: row[i] };
    }
    throw new Error('resolveClearJamAction: no bucket covers roll ' + dieRoll);
  }

  // Convenience wrapper applying §14's "-1 to WS when clearing a captured weapon" adjustment,
  // so a caller doesn't have to remember to do that arithmetic itself before calling
  // resolveClearJamAction. Added when this action first got a real caller (a Mission 1
  // playthrough) — resolveClearJamAction itself is unchanged and still usable directly.
  function resolveClearJammedWeapon(weaponSkill, isCapturedWeapon, dieRoll, clearJamChart) {
    var effectiveWS = isCapturedWeapon ? weaponSkill - 1 : weaponSkill;
    return resolveClearJamAction(effectiveWS, dieRoll, clearJamChart);
  }

  // ---- §9/1 step 6: damage table lookup -----------------------------------------
  // weapon.dmg is a 10-char string indexed HIGH ROLL FIRST: dmg[9 - roll]. Established
  // convention, carried over unchanged from the trainer (see assets/data/weapon_chart.js header).
  function resolveDamage(weapon, dieRoll, damageLegend) {
    if (!weapon.dmg) throw new Error('resolveDamage: weapon "' + weapon.id + '" has no damage table');
    if (dieRoll < 0 || dieRoll > 9) throw new Error('resolveDamage: dieRoll must be 0-9, got ' + dieRoll);
    var code = weapon.dmg[9 - dieRoll];
    return { code: code, label: damageLegend ? damageLegend[code] : undefined };
  }

  // ---- §9/1 step 7 / §9/5: ammo expenditure -------------------------------------
  // weapon.ammo is a percentile threshold (roll <= threshold spends a clip) for personal/crew
  // weapons, or the literal string "A" for single-use items (grenade/satchel/bazooka — always
  // expended, no roll) or null for actions with no ammo mechanic (assault). Only the numeric-
  // threshold case is exercised by this slice's scope (§9/5's clip check); "A" is handled for
  // completeness since it's the same table, not because grenades/bazookas are in scope here.
  function resolveAmmoExpenditure(weapon, percentileRoll) {
    if (weapon.ammo === null || weapon.ammo === undefined) {
      throw new Error('resolveAmmoExpenditure: weapon "' + weapon.id + '" has no ammo mechanic');
    }
    if (weapon.ammo === 'A') return { expended: true, alwaysCertain: true };
    if (percentileRoll < 0 || percentileRoll > 99) {
      throw new Error('resolveAmmoExpenditure: percentileRoll must be 0-99, got ' + percentileRoll);
    }
    return { expended: percentileRoll <= weapon.ammo, alwaysCertain: false };
  }

  // ---- §13/6 Aimed Automatic Weapon Damage --------------------------------------
  // Only for aimed fire with an automatic weapon (weapon.automatic) against a multiple-target
  // hex. Primary target always takes the first damage roll. Then: "If the damage die roll was
  // greater than 0, roll for damage again. If the result of the second roll is less than the
  // result of the first roll, apply the indicated damage to a second target... As long as each
  // damage roll result is less than the one before it, keep rolling... Once a damage die roll
  // result is equal to or greater than the previous roll, stop immediately." The ">0" gate on
  // the primary roll falls out naturally: no roll can be < 0, so a primary roll of 0 always
  // stops the cascade on its own without a separate branch.
  function resolveAimedAutomaticCascade(weapon, rollDie, targetCount, damageLegend) {
    if (!weapon.automatic) {
      throw new Error('resolveAimedAutomaticCascade: "' + weapon.id + '" is not an automatic weapon');
    }
    if (!(targetCount >= 1)) throw new Error('resolveAimedAutomaticCascade: targetCount must be >= 1');
    var roleNames = ['primary', 'secondary', 'tertiary', 'quaternary', 'quinary'];
    var results = [];
    var roll = rollDie();
    var d = resolveDamage(weapon, roll, damageLegend);
    results.push({ role: 'primary', roll: roll, code: d.code, label: d.label });
    var prevRoll = roll, remaining = targetCount - 1, idx = 1;
    while (remaining > 0) {
      var r = rollDie();
      if (r >= prevRoll) break;
      var dd = resolveDamage(weapon, r, damageLegend);
      results.push({ role: roleNames[idx] || ('target' + (idx + 1)), roll: r, code: dd.code, label: dd.label });
      prevRoll = r; remaining--; idx++;
    }
    return results;
  }

  // ---- §9/6 German Fire Combat Terms --------------------------------------------
  function resolveBestFireType(canAim) { return canAim ? 'aimed' : 'snap'; }

  function selectBest(candidates, keyFn, better) {
    if (!candidates || candidates.length === 0) {
      throw new Error('selectBest: no candidates to select from');
    }
    var bestKey = keyFn(candidates[0]);
    var best = [candidates[0]];
    for (var i = 1; i < candidates.length; i++) {
      var k = keyFn(candidates[i]);
      if (better(k, bestKey)) { best = [candidates[i]]; bestKey = k; }
      else if (k === bestKey) { best.push(candidates[i]); }
    }
    return best;
  }

  // candidates: [{ id, distance, hitChance }]. "Closest Target ... if two or more targets
  // equally close, fire at the easiest. If still tied, determine the target at random."
  function resolveClosestTarget(candidates, rollDie) {
    var closest = selectBest(candidates, function (c) { return c.distance; }, function (a, b) { return a < b; });
    if (closest.length === 1) return closest[0];
    var easiest = selectBest(closest, function (c) { return c.hitChance; }, function (a, b) { return a > b; });
    if (easiest.length === 1) return easiest[0];
    return easiest[rollDie() % easiest.length];
  }

  // "Easiest Target ... if two or more targets equally easy, fire at the closest. If still
  // tied, determine the target at random."
  function resolveEasiestTarget(candidates, rollDie) {
    var easiest = selectBest(candidates, function (c) { return c.hitChance; }, function (a, b) { return a > b; });
    if (easiest.length === 1) return easiest[0];
    var closest = selectBest(easiest, function (c) { return c.distance; }, function (a, b) { return a < b; });
    if (closest.length === 1) return closest[0];
    return closest[rollDie() % closest.length];
  }

  // ---- §13/1-13/4 damage-result escalation --------------------------------------
  // currentStatus: 'unharmed' | 'panicked' | 'wounded' | 'incapacitated' | 'killed' (falsy ==
  // 'unharmed'). newCode: raw 'P'|'W'|'I'|'K' from resolveDamage — this slice's weapon rows
  // never produce X/Z/C/*, so those are rejected rather than guessed at.
  function escalateDamageResult(currentStatus, newCode) {
    if (['P', 'W', 'I', 'K'].indexOf(newCode) === -1) {
      throw new Error('escalateDamageResult: only handles raw P/W/I/K codes, got "' + newCode + '"');
    }
    var cur = currentStatus || 'unharmed';
    if (newCode === 'K') return 'killed';
    if (newCode === 'P') {
      // Panic layers on top of, but never downgrades, an existing wound/incap/kill status.
      if (cur === 'killed' || cur === 'incapacitated' || cur === 'wounded') return cur;
      return 'panicked';
    }
    // newCode is 'W' or 'I'.
    if (cur === 'killed') return 'killed';
    if (cur === 'incapacitated') return 'killed';          // §13/3: wound or 2nd incap -> killed
    if (cur === 'wounded') return 'incapacitated';          // §13/2: incap or 2nd wound -> incapacitated
    return newCode === 'W' ? 'wounded' : 'incapacitated';
  }

  // ---- Damage Table conditional codes (§10 grenade/satchel rows, §11 assault-to-capture) -----
  // 'X' = "Wounded (Panic if prone)" — the grenade/satchel rows' only conditional code
  // (grout/grin/satout/satin's dmg strings contain K/I/W/X/P only). Resolves to the raw P/W
  // code escalateDamageResult expects.
  function resolveXCode(targetProne) {
    return targetProne ? 'P' : 'W';
  }

  // 'Z' = "Wounded (Captured if already panicked/wounded)" — the asltc (Assault to Capture)
  // row's conditional code (§11/2). Unlike 'X', a 'C' (Captured) result is NOT one of the raw
  // P/W/I/K codes escalateDamageResult's ladder handles — capture is its own status, not a
  // point on the wound/incapacitation/kill severity ladder (a captured soldier falls prone and
  // goes inactive, but isn't "wounded" or "incapacitated" for ladder-escalation purposes). So
  // resolveZCode returns 'C' directly rather than a code meant for escalateDamageResult; the
  // caller branches on 'C' separately (see apps/game/assaultrules.js / docs/27_ASSAULT.md for
  // what's built vs. deferred around the Captured status itself).
  function resolveZCode(targetAlreadyPanickedOrWounded) {
    return targetAlreadyPanickedOrWounded ? 'C' : 'W';
  }

  window.AmbushFireCombat = {
    resolveRangeBand: resolveRangeBand,
    hexDistance: hexDistance,
    resolveTerrainMod: resolveTerrainMod,
    canBeFiredAt: canBeFiredAt,
    computeFinalHitChance: computeFinalHitChance,
    resolveJamCheck: resolveJamCheck,
    resolveClearJamAction: resolveClearJamAction,
    resolveClearJammedWeapon: resolveClearJammedWeapon,
    resolveHitRoll: resolveHitRoll,
    resolveDamage: resolveDamage,
    resolveAmmoExpenditure: resolveAmmoExpenditure,
    resolveAimedAutomaticCascade: resolveAimedAutomaticCascade,
    resolveBestFireType: resolveBestFireType,
    resolveClosestTarget: resolveClosestTarget,
    resolveEasiestTarget: resolveEasiestTarget,
    escalateDamageResult: escalateDamageResult,
    resolveXCode: resolveXCode,
    resolveZCode: resolveZCode,
  };
})();

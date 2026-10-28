/*
 * grenaderules.js — Phase 9 grenade/satchel charge combat (§10, docs/26_GRENADES.md)
 *
 * Pure logic, no DOM. Reuses apps/game/firecombat.js directly for everything §10/1 says is
 * "very similar to fire combat" (range banding, the 0-always-hits/9-always-misses to-hit roll,
 * damage-table lookup, the raw P/W/I/K escalation ladder, the new 'X' code) — this file only
 * implements what's actually different: throw-range limits by stance, a hit-chance calculation
 * with NO terrain/stance/aimed-snap shifts (§10/1 step 3's explicit note), the fixed-threshold
 * dud check (not weapon-specific like a jam check), the Grenade Strike PC Check reaction
 * (§10/2), and scatter (§10/3).
 *
 * In scope: §10/1 core procedure, §10/2 PC Check reaction, §10/3 scatter (both diagrams),
 * §10/4 satchel charges (same procedure, different range/weapon-row selection — no separate
 * mechanic of its own beyond that).
 *
 * Deliberately NOT in scope, matching this project's standing pattern of flagging gaps rather
 * than guessing: throwing into/out of buildings through apertures ("Neither weapon can be
 * thrown into or out of a building through a wall hexside that has no aperture" — building
 * aperture modeling itself is already deferred, docs/17_LOS.md); grenades/satchel charges
 * thrown into a vehicle (vehicles are scenery, docs/11 decision #2); a satchel charge
 * destroying a wall (§13/5 Penetration, still deferred); the scatter procedure's "apply common
 * sense" wall-bounce clarification (§10/3) — genuinely under-specified by the rulebook itself,
 * not just by this implementation.
 */
(function () {
  'use strict';

  var G = window.AmbushHexGrid;
  var LOS = window.AmbushLOS;
  var FC = window.AmbushFireCombat;
  var SCATTER = window.AMBUSH_GRENADE_SCATTER;

  // ---- §10/1 step 1: throw range limits by the thrower's own stance -------------
  // "A soldier can throw a grenade up to six hexes if standing, or up to three hexes if
  // crouching. He cannot throw at all if prone." / satchel: "three hexes if standing... cannot
  // be thrown at all if the soldier is crouching or prone."
  var GRENADE_THROW_RANGE = { standing: 6, crouching: 3, prone: 0 };
  var SATCHEL_THROW_RANGE = { standing: 3, crouching: 0, prone: 0 };

  function maxThrowRange(kind, stance) {
    var table = kind === 'satchel' ? SATCHEL_THROW_RANGE : kind === 'grenade' ? GRENADE_THROW_RANGE : null;
    if (!table) throw new Error('maxThrowRange: kind must be "grenade" or "satchel", got ' + kind);
    var max = table[stance];
    if (max === undefined) throw new Error('maxThrowRange: unknown stance "' + stance + '"');
    return max;
  }

  // Which weapon-chart row applies depends on whether the TARGET hex is interior or exterior —
  // independent of the thrower's own stance/location.
  function weaponIdFor(kind, targetIsInterior) {
    if (kind === 'grenade') return targetIsInterior ? 'grin' : 'grout';
    if (kind === 'satchel') return targetIsInterior ? 'satin' : 'satout';
    throw new Error('weaponIdFor: kind must be "grenade" or "satchel", got ' + kind);
  }

  // ---- §10/1 step 3: Hit Chance — Grenade/Satchel Charge Combat Modifiers Chart -----------
  // "The Fire Combat Modifiers Chart is not used; thus the stance of the target and the terrain
  // in the target hex have no effect; nor are there shifts for aimed or snap fire." Just the
  // base (by range band) plus whatever of GRENADE_MODS applies (WS, wounded, aperture, not in
  // sight) — no terrain lookup, no fire-type branch, unlike firecombat.computeFinalHitChance.
  function computeHitChance(baseHit, mods) {
    var total = baseHit;
    (mods || []).forEach(function (m) { total += m; });
    return { raw: total, clamped: Math.max(0, Math.min(8, total)) };
  }

  // ---- §10/1 step 5: dud check ----------------------------------------------------
  // Fixed threshold (unlike a weapon's jam threshold, which varies by weapon and fire type):
  // "roll percentile dice... If the result is a 5 or less, it is a dud."
  function resolveDudCheck(percentileRoll) {
    if (percentileRoll < 0 || percentileRoll > 99) {
      throw new Error('resolveDudCheck: percentileRoll must be 0-99, got ' + percentileRoll);
    }
    return { dud: percentileRoll <= 5 };
  }

  // ---- §10/2 Grenade Strike PC Check -----------------------------------------------
  // opts: { pcSucceeded, hasTurnRemaining, stance, wounded }. Unaware/panicked soldiers never
  // get a check at all — the caller filters those out before calling this (same "caller decides
  // eligibility, this resolves the outcome" split used throughout the codebase).
  function resolveStrikeReaction(opts) {
    if (!opts.pcSucceeded) return { outcome: 'no-reaction' };
    if (opts.hasTurnRemaining) {
      if (opts.stance === 'standing' || opts.stance === 'crouching') return { outcome: 'toss-away' };
      return { outcome: 'no-reaction' }; // succeeded, has a turn, but already prone — nothing this reaction offers
    }
    if (!opts.wounded) return { outcome: 'fall-prone' };
    return { outcome: 'no-reaction' }; // succeeded, but wounded with no turn left — nothing to do
  }

  // ---- §10/3 Grenade/Satchel Charge Scatter ----------------------------------------
  function neighborIndex(neighbors, hexId) {
    for (var i = 0; i < neighbors.length; i++) if (neighbors[i].id === hexId) return i;
    return -1;
  }

  function bucketOffsetForRoll(table, roll) {
    for (var i = 0; i < table.length; i++) {
      if (table[i].rolls.indexOf(roll) !== -1) return table[i].offset;
    }
    throw new Error('bucketOffsetForRoll: no scatter bucket covers roll ' + roll);
  }

  // throwerHexId/targetHexId are the original (missed) throw; roll is the scatter die (§10/3).
  // Diagram choice (A vs B) and the "direction of throw" hex(es) are derived from
  // losrules.hexLine's own tie-detection — the SAME mechanism LOS already uses for the
  // rulebook's "LOS exactly bisects two hexes" case (§8/1), reused here for §10/3's identical
  // phrase, not reimplemented. Returns the real hex ID the grenade/satchel charge lands in.
  function resolveScatter(throwerHexId, targetHexId, roll) {
    if (throwerHexId === targetHexId) throw new Error('resolveScatter: thrower and target must be different hexes');
    var targetP = G.parseId(targetHexId);
    var neighbors = G.neighbors(targetP.colIdx, targetP.rowIdx);
    var steps = LOS.hexLine(throwerHexId, targetHexId);
    var dirStep = steps[steps.length - 2];

    var idxA, table;
    if (dirStep.altHexId && dirStep.altHexId !== dirStep.hexId) {
      var i1 = neighborIndex(neighbors, dirStep.hexId);
      var i2 = neighborIndex(neighbors, dirStep.altHexId);
      if (i1 === -1 || i2 === -1) throw new Error('resolveScatter: direction-of-throw hex is not a neighbor of the target');
      idxA = (i1 + 1) % 6 === i2 ? i1 : i2;
      table = SCATTER.diagramB;
    } else {
      idxA = neighborIndex(neighbors, dirStep.hexId);
      if (idxA === -1) throw new Error('resolveScatter: direction-of-throw hex is not a neighbor of the target');
      table = SCATTER.diagramA;
    }

    var offset = bucketOffsetForRoll(table, roll);
    var landHexId = neighbors[(idxA + offset) % 6].id;
    // §10/3 asterisk: "if throw originates in this hex, grenade lands in target hex" — a
    // scattered throw can never land back on the thrower.
    if (landHexId === throwerHexId) landHexId = targetHexId;
    return { hexId: landHexId, diagram: table === SCATTER.diagramB ? 'B' : 'A' };
  }

  window.AmbushGrenades = {
    maxThrowRange: maxThrowRange,
    weaponIdFor: weaponIdFor,
    computeHitChance: computeHitChance,
    resolveDudCheck: resolveDudCheck,
    resolveStrikeReaction: resolveStrikeReaction,
    resolveScatter: resolveScatter,
  };
})();

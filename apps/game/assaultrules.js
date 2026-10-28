/*
 * assaultrules.js — Phase 9 assault/capture combat (§11, docs/27_ASSAULT.md)
 *
 * Pure logic, no DOM. Reuses apps/game/firecombat.js directly for what §11 shares with fire
 * combat — resolveHitRoll (0-always-hits/9-always-misses), resolveDamage (the asltk/asltc
 * weapon-chart rows, §11/1 step 5), escalateDamageResult, and resolveZCode (§11/2's 'C'
 * Captured code) — this file only implements what's actually assault-specific: German target
 * selection (§11/1 step 1's "most disadvantageous stance" rule), the five-modifier Hit Chance
 * (§11/4 — a different modifier set from fire combat's, not the Fire Combat Modifiers Chart),
 * and the Move/Charge Assault MPA limit (§11/3).
 *
 * In scope: §11/1 core procedure (target selection, hit chance, to-hit, damage), §11/3 Charge
 * Assault's MPA rule, §11/4 all five modifiers (two of which — the captured-weapon modifier and
 * "unaware" nulling the defender's WS shift — were missing from the trainer's ASSAULT_MODS
 * summary and had to be added from the rule text itself; see assets/data/weapon_chart.js and
 * docs/27_ASSAULT.md).
 *
 * Deliberately NOT in scope, matching this project's standing pattern of flagging gaps rather
 * than guessing: the full §11/2 Captured-status state machine (falls prone, AR marker to
 * Inactive — that part reuses arscheduler.removeFromRound directly, same mechanism as
 * incapacitation/kill, no new scheduler code needed — but guarding, changing guards, a captured
 * German's reduced Movement Allowance while being moved, and the freeing conditions when left
 * without an active US soldier are all real, substantial mechanics this slice doesn't build);
 * entering a wheeled vehicle before assaulting its occupant, and the tank/Jadgpanther assault
 * prohibition (vehicles are scenery per docs/11 decision #2).
 */
(function () {
  'use strict';

  // ---- §11/1 step 1: target selection (German-only rule) -------------------------
  // "A German soldier must assault the US soldier in the most disadvantageous stance. There are
  // two stance categories: being prone or wounded is the more disadvantageous; then crouching/
  // standing. If there is a tie, determine the target at random." candidates: [{id, stance,
  // wounded}]. A US soldier's own target choice among multiple Germans is a free choice — not
  // resolved here, matching §11/1 step 1's own wording ("choose which one is the target").
  function resolveGermanAssaultTarget(candidates, rollDie) {
    if (!candidates || !candidates.length) throw new Error('resolveGermanAssaultTarget: no candidates');
    var disadvantaged = candidates.filter(function (c) { return c.stance === 'prone' || c.wounded; });
    var pool = disadvantaged.length ? disadvantaged : candidates;
    if (pool.length === 1) return pool[0];
    return pool[rollDie() % pool.length];
  }

  // ---- §11/4 Assault Modifiers ----------------------------------------------------
  // baseHit is injected (BASE_HIT.assault, §11/1 step 3: "always the same, as listed on the
  // Weapons Chart") rather than looked up here, matching firecombat.computeFinalHitChance's own
  // convention. opts: { attackerWS, defenderWS, defenderPanicked, defenderWounded,
  // defenderUnaware, isChargeAssault, attackerWounded, attackerUsingCapturedWeapon }.
  // Verified against the rulebook's own ASSAULT COMBAT EXAMPLE (§11/1): base 7, attacker WS +1,
  // defender WS +2 (eligible, subtracted), charge assault -3 -> final Hit Chance 3.
  function computeHitChance(baseHit, opts) {
    var total = baseHit + (opts.attackerWS || 0);

    var defenderShiftEligible = (opts.defenderWS || 0) >= 1
      && !opts.defenderPanicked && !opts.defenderWounded && !opts.defenderUnaware;
    if (defenderShiftEligible) total -= opts.defenderWS;

    if (opts.isChargeAssault) total -= 3;
    if (opts.attackerWounded) total -= 2;
    if (opts.attackerUsingCapturedWeapon) total -= 1;

    return { raw: total, clamped: Math.max(0, Math.min(8, total)) };
  }

  // ---- §11/3 Charge Assault ---------------------------------------------------------
  // "He can expend only half his Movement Point Allowance, rounded down, in order to enter the
  // hex." Verified against the rulebook's own MPA-3 example: half of 3, rounded down, is 1 —
  // not enough to cross a 2-MP window.
  function chargeAssaultMaxMP(mpa) {
    return Math.floor(mpa / 2);
  }

  window.AmbushAssault = {
    resolveGermanAssaultTarget: resolveGermanAssaultTarget,
    computeHitChance: computeHitChance,
    chargeAssaultMaxMP: chargeAssaultMaxMP,
  };
})();

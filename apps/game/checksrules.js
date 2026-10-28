/*
 * checksrules.js — Phase 7 Perception & Activation Check resolution (docs/21_OPERATIONS_LOOP.md)
 *
 * Pure logic, no DOM. Both checks share one rule, confirmed from two independent places in the
 * rulebook (§5/7 Perception Checks, and §5/8 Activation Checks — the latter's continuous text was
 * split across a two-column PDF page break in the MD conversion; reassembled from both halves,
 * source/converted/Ambush_Rules_with_Errata_R2.md lines 1225-1244 and 1315-1341):
 *
 *   Roll one die (d10, 0-9). Success if the roll is <= the rating (PC, or the Condition's
 *   Activation Level), after applying any modifier. Regardless of modifiers, a roll of 0 is
 *   always a success and a roll of 9 is always a failure.
 *
 * Worked examples both check out against this rule: §5/7's paragraph 288 example (PC reduced by
 * 2), and §5/8's own worked example, paragraph 136 ("Conduct Activation Check (-1)").
 */
(function () {
  'use strict';

  function resolveCheck(rating, modifier, roll) {
    if (roll < 0 || roll > 9) throw new Error('roll must be 0-9, got ' + roll);
    if (roll === 0) return 'success';
    if (roll === 9) return 'fail';
    return roll <= rating + (modifier || 0) ? 'success' : 'fail';
  }

  // Named wrappers — same rule, but kept distinct since callers reason about them as different
  // things (a soldier's Perception rating vs. the current Condition's Activation Level) and a
  // future rules change to only one of them shouldn't require touching call sites for the other.
  function resolvePerceptionCheck(pcRating, modifier, roll) { return resolveCheck(pcRating, modifier, roll); }
  function resolveActivationCheck(activationLevel, modifier, roll) { return resolveCheck(activationLevel, modifier, roll); }

  window.AmbushChecks = {
    resolvePerceptionCheck: resolvePerceptionCheck,
    resolveActivationCheck: resolveActivationCheck,
  };
})();

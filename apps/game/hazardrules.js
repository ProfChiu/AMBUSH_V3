/*
 * hazardrules.js — Phase 9 minefields and boobytraps (§12, docs/29_HAZARDS.md)
 *
 * Pure logic, no DOM. The PC Check itself reuses checksrules.js (window.AmbushChecks) unchanged
 * — a Boobytrap/Minefield check is a plain Perception Check, §5/7, nothing hazard-specific about
 * the die mechanics. Damage resolution reuses firecombat.js's resolveDamage against the fixed
 * 'grin' (Grenade Inside) weapon-chart row — the third time this project has hit the same "the
 * rule mandates a specific row regardless of actual terrain" pattern, after grenades' own
 * interior/exterior selection and the bazooka splash rule (docs/28_CREW_WEAPONS.md §2).
 *
 * This file only implements what's genuinely §12-specific: WHO checks and WHO is hit, which
 * differs sharply between the two hazards despite both using an identical PC Check and an
 * identical damage table:
 *   - Boobytrap (§12/1): ONE check total, by whichever soldier present has the highest PC. If
 *     it explodes, EVERY soldier in the hex is damaged (rolled separately per soldier). One-shot
 *     either way — success or failure both remove the boobytrap ("place a Boobytrap marker").
 *   - Minefield (§12/2): EVERY soldier who enters checks individually, on every entry, forever
 *     ("unlimited number of mines... never depleted"). Only the soldier(s) who fail their own
 *     check are damaged; other soldiers in the hex are unaffected by someone else's mine.
 *
 * Deliberately NOT in scope: the paragraph-book trigger itself ("a paragraph may state that the
 * hex contains a boobytrap/is a minefield") — that's the paragraph interpreter's job
 * (docs/20_PARAGRAPH_INTERPRETER.md), already built and generic; this file only resolves what
 * happens once a hazard hex is known to exist, not how the game learns a given hex has one.
 */
(function () {
  'use strict';

  // §12/1, §12/2: "damage as if hit by an exploding grenade indoors" — fixed, regardless of
  // whether the hex is actually interior or exterior.
  function explosionWeaponId() {
    return 'grin';
  }

  // ---- §12/1 Boobytrap --------------------------------------------------------------
  // "If more than one soldier enters a hex with a boobytrap at the same time, the soldier with
  // the highest PC conducts the PC Check." Ties: the rulebook doesn't specify a tie-break;
  // resolves to the first-listed of the tied soldiers — arbitrary but deterministic, same
  // convention as crewweaponrules.resolveGermanCrewFirer's undocumented-tie default.
  function selectBoobytrapChecker(candidates) {
    if (!candidates || !candidates.length) throw new Error('selectBoobytrapChecker: no candidates');
    var best = candidates[0];
    for (var i = 1; i < candidates.length; i++) {
      if (candidates[i].pc > best.pc) best = candidates[i];
    }
    return best;
  }

  // A boobytrap is consumed by this check regardless of outcome ("once the boobytrap explodes,
  // it no longer exists" — and a successful check also removes it: "the boobytrap no longer
  // exists in the hex"). Kept as its own named function (not merged with resolveMinefieldCheck,
  // which is currently identical in shape) since callers reason about these as different rules —
  // same rationale checksrules.js gives for keeping Perception/Activation Checks distinct.
  function resolveBoobytrapCheck(pcSucceeded) {
    return { exploded: !pcSucceeded, consumed: true };
  }

  // ---- §12/2 Minefield ----------------------------------------------------------------
  // Never consumed ("unlimited number of mines... never depleted or destroyed"); every entrant
  // checks on their own, and only a soldier who fails HIS OWN check is affected — "other
  // soldiers in the hex are not affected by the explosion."
  function resolveMinefieldCheck(pcSucceeded) {
    return { exploded: !pcSucceeded, consumed: false };
  }

  window.AmbushHazards = {
    explosionWeaponId: explosionWeaponId,
    selectBoobytrapChecker: selectBoobytrapChecker,
    resolveBoobytrapCheck: resolveBoobytrapCheck,
    resolveMinefieldCheck: resolveMinefieldCheck,
  };
})();

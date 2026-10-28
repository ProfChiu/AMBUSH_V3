/*
 * difficulty.js — Easy mode (NOT rulebook content)
 *
 * Pure logic, no DOM, no dice. Every value here is a deliberate departure from the printed game,
 * so the whole file is a judgment call by construction — which is exactly why it lives in one
 * place instead of being sprinkled through mission1demo.js as scattered `if (easy)` branches.
 *
 * DESIGN RULE, inherited from the project's own working rules: Easy mode never lies about a die.
 * "The player always sees the roll and the table lookup that resolved it, never a silent result",
 * and the standing instruction is to show the player the machinery. So nothing here quietly
 * re-rolls, nudges a threshold, or hides a modifier. Each lever is either a VISIBLE extra roll the
 * player watches happen, a VISIBLE line in a hit-chance breakdown, or a VISIBLE announcement when
 * it fires. A player on Easy can audit every number exactly as on Normal.
 *
 * The four levers:
 *
 *   1. BETTER SQUAD ROLLS. §4's generation rolls are made twice and the better result kept. Both
 *      dice are shown and the reason the kept one is better is stated. This does not touch the §4
 *      tables at all — it draws from the same distribution, just from its good end.
 *   2. COMBAT HANDICAP. +1 to US Hit Chance, -1 to German, printed as its own term in every
 *      breakdown ("+1 easy mode") so the arithmetic still adds up on screen.
 *   3. FIELD DRESSING. The first Killed result on each US soldier becomes Incapacitated instead —
 *      once per soldier, announced in the damage pop-up. Incapacitated is not free: he is out of
 *      the fight, still costs 2 VP, and must be carried off the map to avoid even that (§15). It
 *      converts an instant, unrecoverable loss into a problem the player can respond to.
 *   4. LOWER TARGET. A bigger margin below the mission's reachable VP ceiling.
 *
 * The Normal numbers are not arbitrary either — see victoryrules.js's scaleRequirement for how
 * the 6-VP margin was derived from measured play (tools/bot/).
 */
(function () {
  'use strict';

  var NORMAL = 'normal';
  var EASY = 'easy';

  var SETTINGS = {
    normal: {
      label: 'Normal',
      blurb: 'The mission as the rulebook plays it.',
      squadRolls: 1,
      usHitMod: 0,
      germanHitMod: 0,
      fieldDressing: false,
      // Derived from 30 measured games — see victoryrules.js scaleRequirement.
      vpMargin: 6,
    },
    easy: {
      label: 'Easy',
      blurb: 'Same rules, same visible dice — a better squad, a small edge in a firefight, and one '
           + 'second chance per soldier.',
      squadRolls: 2,
      usHitMod: 1,
      germanHitMod: -1,
      fieldDressing: true,
      // 9 puts Mission 1's target at 5 against its ceiling of 14. Measured: the automated player
      // (a deliberately mediocre player, so a floor) clears 5 in about half its games versus about
      // a fifth at the Normal target of 8.
      vpMargin: 9,
    },
  };

  function settings(level) {
    return SETTINGS[level] || SETTINGS[NORMAL];
  }

  function isEasy(level) {
    return level === EASY;
  }

  function label(level) {
    return settings(level).label;
  }

  // The lines shown on the start screen and repeated in the Objectives window, so a player can
  // always re-read what their chosen difficulty is doing to the game mid-mission.
  function describe(level) {
    if (!isEasy(level)) return [];
    return [
      'Squad Generation rolls twice and keeps the better result — you see both dice.',
      '+1 to your Hit Chance and −1 to the Germans’, shown as its own line in every breakdown.',
      'Field dressing: the first Killed result on each soldier becomes Incapacitated instead. He is '
        + 'still out of the fight and still costs 2 VP unless you carry him off the map.',
      'A lower Victory Point target.',
    ];
  }

  // §9/3-style modifier, applied to whichever side is FIRING. Kept as one function rather than two
  // so a caller cannot accidentally apply the player's bonus to a German's shot.
  function hitChanceMod(level, firerSide) {
    var s = settings(level);
    return firerSide === 'german' ? s.germanHitMod : s.usHitMod;
  }

  // Re-clamps to the 0-8 Hit Chance range (§9/1 step 4) after a modifier is applied. Needed for
  // the assault and grenade paths, whose own resolvers clamp before this modifier exists.
  function applyHitMod(hitChance, mod) {
    var raw = hitChance.raw + mod;
    return { raw: raw, clamped: Math.max(0, Math.min(8, raw)) };
  }

  function squadRolls(level) {
    return settings(level).squadRolls;
  }

  function vpMargin(level) {
    return settings(level).vpMargin;
  }

  // ---- Lever 1: keep the better of N rolls ----------------------------------------------------
  // `valueOf(roll)` turns a die roll into the thing actually being generated (Squad Points, a
  // Perception rating, ...) and the BEST of those is kept. Comparing outcomes rather than raw dice
  // matters because the §4 tables do not all run the same direction: a high die is better for
  // Squad Quality, but Weapon Points DECREASE as the Squad+Weapon roll sum rises, so there the low
  // die is the good one. Scoring by result gets both right without the caller having to know.
  //
  // Ties keep the first roll, so the pop-up can always say "kept the first" honestly.
  function chooseBest(rolls, valueOf) {
    if (!rolls || !rolls.length) throw new Error('chooseBest: no rolls supplied');
    var bestIndex = 0;
    var bestValue = valueOf(rolls[0]);
    for (var i = 1; i < rolls.length; i++) {
      var v = valueOf(rolls[i]);
      if (v > bestValue) { bestValue = v; bestIndex = i; }
    }
    return { roll: rolls[bestIndex], value: bestValue, index: bestIndex, rolls: rolls.slice() };
  }

  // ---- Lever 3: field dressing ----------------------------------------------------------------
  // Split into a pure question and a separate commit, deliberately. The damage pop-up's `explain`
  // callback runs BEFORE the result is applied and must show the same outcome the commit will
  // produce — if the question mutated, the pop-up would announce a downgrade and then the commit
  // would find the allowance already spent and kill the soldier anyway.
  //
  // Germans never receive it: it is a handicap for the player, not a general softening of §13.
  function fieldDressingApplies(level, target, code) {
    return !!(settings(level).fieldDressing
      && target && target.side !== 'german'
      && code === 'K'
      && !target.usedFieldDressing);
  }

  // Returns the code to use, marking the allowance spent if it fired. Call once, at commit time.
  function consumeFieldDressing(level, target, code) {
    if (!fieldDressingApplies(level, target, code)) return code;
    target.usedFieldDressing = true;
    return 'I';
  }

  window.AmbushDifficulty = {
    NORMAL: NORMAL,
    EASY: EASY,
    LEVELS: [NORMAL, EASY],
    settings: settings,
    isEasy: isEasy,
    label: label,
    describe: describe,
    hitChanceMod: hitChanceMod,
    applyHitMod: applyHitMod,
    squadRolls: squadRolls,
    vpMargin: vpMargin,
    chooseBest: chooseBest,
    fieldDressingApplies: fieldDressingApplies,
    consumeFieldDressing: consumeFieldDressing,
  };
})();

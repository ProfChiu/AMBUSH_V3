/*
 * victoryrules.js — Phase 10 Victory (§15, docs/31_VICTORY.md), Mission 1's real conditions
 *
 * Pure logic, no DOM. §15's general VP accounting is simple and rulebook-literal: gain VP for
 * mission tasks and German cards, lose 2 VP per US soldier killed or incapacitated during the
 * mission (with an exfiltration exemption for incapacitated-but-not-killed soldiers), compare
 * the total to the mission's stated requirement. Mission 1's specific tasks come from
 * assets/data/missions.json's exact victory text (quoted in full in docs/31_VICTORY.md), not a
 * paraphrase — read directly before writing any of this.
 *
 * Mission 1's own paragraph programs never call the interpreter's `award_vp` op (checked
 * directly, zero hits across all 71 annotated paragraphs) — "Other Victory Point awards will be
 * revealed during the mission" turns out to mean each German soldier's own card VP value
 * (assets/data/german_roster.json's `VP` field, e.g. "+1 VP", "+2 VP (+3 VP if captured)"),
 * which the player only learns once that specific German is actually activated — not
 * paragraph-triggered awards at all.
 *
 * VP TIMING: the card's leading value is an §2/1 "Activation Victory Point Award" — earned when
 * the German ACTIVATES, not when he is defeated — and the parenthetical is a separate, additive
 * "Conditional Victory Point Award". See parseGermanVP below for the verbatim rule text and for
 * why the earlier defeat-only reading was wrong.
 */
(function () {
  'use strict';

  // German card VP field is free text, e.g. "+1 VP", "+2 VP (+3 VP if captured)", "+1 VP*",
  // "+2 VP (+3 VP if knocked out)". §2/1 defines the two values on the card as DIFFERENT KINDS
  // of award, quoted verbatim:
  //
  //   "Activation Victory Point Award. The number of Victory Points you receive when the German
  //    is activated, regardless of what happens later with that German."
  //   "Conditional Victory Point Award. The number of Victory Points you receive if something
  //    specific happens to the German. Most Germans have no Conditional VP award."
  //
  // So the LEADING value is earned the moment the German is activated and is never lost, and the
  // parenthetical is an ADDITIONAL award earned only if its named trigger occurs. They stack.
  //
  // CORRECTED (was a real bug): this module previously treated the leading value as a
  // kill/incapacitate reward and the parenthetical as a REPLACEMENT for it, so activating a
  // German you never killed scored nothing. GE 7/N's card is the proof that reading was wrong —
  // "+1 VP (+1 VP if incapacitated or killed)" is redundant nonsense if the base value already
  // meant "for killing him", but reads correctly as "+1 for showing up, +1 more if you drop him."
  //
  // JUDGMENT CALL retained: a "knocked out"/"disabled" trigger (vehicle-crew cards) can never
  // fire, since vehicles aren't modeled (docs/11 decision #2) — it parses, but matchesOutcome()
  // never matches it, so it contributes 0 rather than guessing at vehicle combat.
  function parseGermanVP(vpText) {
    var text = vpText || '';
    var activationMatch = /\+(\d+)\s*VP/.exec(text);
    var activation = activationMatch ? parseInt(activationMatch[1], 10) : 0;
    var conditionalMatch = /\(\s*\+(\d+)\s*VP\s+if\s+([^)]+?)\s*\)/i.exec(text);
    var conditional = conditionalMatch
      ? { amount: parseInt(conditionalMatch[1], 10), trigger: conditionalMatch[2].toLowerCase() }
      : null;
    return { activation: activation, conditional: conditional };
  }

  // §2/1: awarded on activation, "regardless of what happens later with that German."
  function germanActivationVP(vpText) {
    return parseGermanVP(vpText).activation;
  }

  // The card's trigger text is free-form ("captured", "incapacitated or killed", "knocked out").
  // An outcome earns the conditional award when the trigger names it.
  function matchesOutcome(trigger, outcome) {
    return trigger.indexOf(outcome) !== -1;
  }

  // The ADDITIONAL award for a defeated German, on top of the activation VP already banked.
  // Returns 0 when the card names no conditional award, or names one this outcome doesn't trigger.
  function germanConditionalVP(vpText, outcome) {
    if (outcome !== 'captured' && outcome !== 'killed' && outcome !== 'incapacitated') {
      throw new Error('germanConditionalVP: unknown outcome "' + outcome + '"');
    }
    var conditional = parseGermanVP(vpText).conditional;
    if (!conditional) return 0;
    return matchesOutcome(conditional.trigger, outcome) ? conditional.amount : 0;
  }

  // §15: "you lose two VPs for each US soldier killed or incapacitated during the mission... VP
  // loss for an incapacitated US soldier can be avoided by moving him off the map [or into a
  // qualifying building hex if ending 1 is accomplished]." A KILLED soldier's loss is NOT
  // avoidable by this exemption — the rule text only ever names "an incapacitated US soldier."
  function usCasualtyVPLoss(outcome, wasExfiltrated) {
    if (outcome === 'killed') return 2;
    if (outcome === 'incapacitated') return wasExfiltrated ? 0 : 2;
    // JUDGMENT CALL: §15 names only "killed or incapacitated", so a CAPTURED US soldier has no
    // stated VP treatment. Treated as an unexfiltratable 2 VP loss — he is as lost to the squad as
    // an incapacitated man and, unlike one, cannot be carried off the map. Previously this threw,
    // which would have taken down computeVPTotal and with it every renderVP() call, freezing the
    // HUD mid-mission. Not reachable today (a German assault always uses the Assault-to-Kill row,
    // whose damage codes contain no capture result), but a thrown exception is the wrong failure
    // mode for a rule the rulebook simply does not address.
    if (outcome === 'captured') return 2;
    throw new Error('usCasualtyVPLoss: unknown outcome "' + outcome + '"');
  }

  // Sums every VP source into one total.
  //   germanActivations: [{vpText}] — every German activated this mission (§2/1 activation award)
  //   germanDefeats:     [{vpText, outcome}] — contributes only the ADDITIONAL conditional award;
  //                      the activation VP for these same Germans is already counted above, so
  //                      counting the base again here would double-pay it.
  //   usCasualties:      [{outcome, wasExfiltrated}]
  //   awards:            [{amount, note}] — flat VP from any other source: a paragraph's award_vp
  //                      op, a mission ending's own bonus. Kept as its own list rather than
  //                      squeezed into germanDefeats with a synthetic vpText, which is what the
  //                      pre-§2/1-fix code did (harmless when defeats paid their base value,
  //                      silently worth 0 once defeats only pay a conditional award).
  //   bonusVP:           flat scalar, equivalent to a single `awards` entry; kept for callers
  //                      that just have one number.
  function computeVPTotal(opts) {
    var gained = (opts.germanActivations || []).reduce(function (sum, a) { return sum + germanActivationVP(a.vpText); }, 0);
    gained += (opts.germanDefeats || []).reduce(function (sum, d) { return sum + germanConditionalVP(d.vpText, d.outcome); }, 0);
    gained += (opts.awards || []).reduce(function (sum, a) { return sum + (a.amount || 0); }, 0);
    gained += opts.bonusVP || 0;
    var lost = (opts.usCasualties || []).reduce(function (sum, c) { return sum + usCasualtyVPLoss(c.outcome, c.wasExfiltrated); }, 0);
    return { gained: gained, lost: lost, total: gained - lost };
  }

  // §15's final step: "if the result is greater than or equal to the mission's requirement, you
  // have won; if less, you have lost."
  function resolveVictory(vpTotal, requirement) {
    return vpTotal >= requirement ? 'won' : 'lost';
  }

  // ---- Mission 1's two specific ending conditions (missions.json's exact victory text) --------
  // Ending 1: "At least one active US soldier is in the building hex T8, at least one US soldier
  // is in the building hexes K13 and L13, and at least one active US soldier is in any hex of
  // the [southeast] heights ... from which he can see all the road hexes on the map. No active
  // Germans can be on the map." Accomplishing it grants +4 VP. Booleans are the caller's to
  // determine (JUDGMENT CALL: computing the exact heights-hex set and verifying LOS to every
  // road hex on the whole map is real terrain analysis this function doesn't attempt — the
  // caller supplies `heightsHexWithFullRoadLOS` however it determines that, e.g. a simplified
  // hardcoded candidate-hex check in the actual Mission 1 game loop).
  function checkEnding1(opts) {
    return !!(opts.t8Occupied && opts.k13Occupied && opts.l13Occupied && opts.heightsHexWithFullRoadLOS && opts.activeGermanCount === 0);
  }

  // Ending 2: "All active US soldiers have exited the map from hex A1 through hex J1
  // (inclusive)." No bonus VP for this one.
  function checkEnding2(allActiveUSExited) {
    return !!allActiveUSExited;
  }

  // ---- Reachable VP ceiling, and scaling a mission's requirement to it ------------------------
  //
  // NOT rulebook content — this exists because of a gap between the printed game and this build.
  //
  // Mission 1 asks for 13 VP. Every VP a player can actually earn comes from German cards
  // (§2/1 activation awards plus conditional awards) and the mission's own ending bonus — no
  // Mission 1 paragraph ever calls `award_vp` (checked: zero hits across all 86 annotated
  // programs). But only seven German identity numbers appear in any annotated activate_german op,
  // and two of those (25, 81) have no transcribed roster card. So the most a flawless
  // playthrough can bank is far below what the printed mission — with its full paragraph book and
  // complete German roster behind it — would have offered. The requirement was inherited from the
  // rulebook; the supply of VP was not. That is the whole reason the game reads as brutally hard:
  // not tuning, not a hidden asymmetry in combat, but a scoring target that outran its own data.
  //
  // Rather than invent German cards or paragraph annotations that don't exist, compute what THIS
  // build can actually yield and scale the target to it, showing both numbers to the player.
  //
  // walkPrograms is deliberately shape-agnostic: paragraph programs nest ops under `then`,
  // `else`, `onSuccess`, `onFail`, and `branches[].then`, and a future annotation pass could add
  // more. Recursing over every array/object value finds activate_german ops wherever they sit,
  // instead of hard-coding today's branch key names and silently under-counting tomorrow's.
  function collectActivatableGermans(programs) {
    var ids = [];
    var seen = {};
    (function walk(node) {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node.op === 'activate_german' && node.ids) {
        node.ids.forEach(function (id) {
          var key = String(id);
          if (!seen[key]) { seen[key] = true; ids.push(key); }
        });
      }
      Object.keys(node).forEach(function (k) { walk(node[k]); });
    })(programs);
    return ids;
  }

  // opts: { programs, cardVPForGermanId(numericId) -> vpText, instanceKeyForGermanId(numericId)
  //         -> string, endingBonus }
  //
  // instanceKeyForGermanId collapses Germans who share one substituted stat card but are distinct
  // soldiers — the caller owns that mapping (mission1demo.js's germanInstanceId), since it's a
  // property of which cards happen to be transcribed, not of the rules.
  //
  // This is an upper bound, and deliberately labelled one: several of these Germans are activated
  // by mutually exclusive paragraph branches, so no single playthrough sees all seven. A ceiling
  // that overstates what one run can do is the safe direction to be wrong in — it never makes the
  // scaled requirement harder than the data supports.
  function computeReachableVP(opts) {
    var byInstance = {};
    collectActivatableGermans(opts.programs).forEach(function (numericId) {
      var key = opts.instanceKeyForGermanId ? opts.instanceKeyForGermanId(numericId) : numericId;
      if (byInstance[key]) return;
      byInstance[key] = opts.cardVPForGermanId(numericId) || '';
    });
    var activation = 0, conditional = 0;
    var germans = Object.keys(byInstance).map(function (key) {
      var vpText = byInstance[key];
      var act = germanActivationVP(vpText);
      // Best case across every outcome the player can actually bring about.
      var cond = ['captured', 'killed', 'incapacitated'].reduce(function (best, outcome) {
        return Math.max(best, germanConditionalVP(vpText, outcome));
      }, 0);
      activation += act;
      conditional += cond;
      return { key: key, vpText: vpText, activation: act, conditional: cond };
    });
    var endingBonus = opts.endingBonus || 0;
    return {
      germans: germans,
      activation: activation,
      conditional: conditional,
      endingBonus: endingBonus,
      ceiling: activation + conditional + endingBonus,
    };
  }

  // A requirement equal to the ceiling can only be met by a perfect maximum run: every German
  // activated, every conditional award earned, the hardest ending achieved, and not one casualty.
  // That isn't a difficult mission, it's a mission with exactly one winning line. `margin` reserves
  // headroom measured in the game's own currency — §15 charges 2 VP per US casualty.
  //
  // The default of 6 (three casualties' worth) is set from MEASURED PLAY, not from taste. The
  // ceiling computeReachableVP returns is a true upper bound but not an attainable one: it counts
  // all seven activatable Germans, and several sit on mutually exclusive paragraph branches, so no
  // single playthrough can meet them all. Thirty automated games (tools/bot/) still put the
  // observed median and maximum at FIVE activations, so the +6 that pays for is the real ceiling
  // on that half of the score.
  //
  // RE-DERIVED 2026-09-20 (v2 task 7) on 60 automated games — the 30 recorded baseline seeds
  // (7000-7029) plus 30 fresh ones (7030-7059), all on the v2 presentation. The previous
  // derivation (2026-09-07) is replaced because its numbers no longer describe this build: v2
  // task 1 took the die animation out of the seeded RNG, so every seed now plays a different
  // (equally valid) game and the old distribution is gone. **The target of 8 survives a third
  // derivation unchanged**, and the reasons are now measured over twice the sample:
  //
  //   * Practical maximum is 10, not the 12 the old text quoted: six games in sixty reach 10 and
  //     none exceeds it. Five German activations (median AND maximum, unchanged across all
  //     re-derivations) pay +6, so 8 cannot be reached without Ending 1's +4. That is the whole
  //     point of the number — it keeps the scoring ending mandatory.
  //   * The distribution is still bimodal, and the dividing line is sharper than before:
  //     casualties, at four. Measured VP by casualty count over the 60 games:
  //
  //       0 -> 8, 10, 10            1 -> 6, 6, 6, 8, 10        2 -> 4, 5, 6, 6, 8, 10, 10, 10
  //       3 -> 4, 4, 4, 4, 6        4 -> -4, -2, -2, 2, 4      5 -> -4, -4, -4, -4, -2
  //       6+ -> -4 down to -12
  //
  //     Three casualties or fewer: never below 4 VP. Four or more: almost never above zero.
  //   * 8 still sits in an empty bin. The observed scores step 6 -> 8 -> 10; not one game in
  //     sixty scored 7 or 9. Win rate by candidate target: 6 -> 25%, 7 -> 15%, 8 -> 15%,
  //     9 -> 10%, 10 -> 10%. Raising to 9 costs a third of the remaining wins and lowering to 6
  //     puts the target within reach of the five activations alone (+6), which is the objection
  //     that ruled out 6 and 7 twice before.
  //
  // Easy mode's 5 (margin 9) is confirmed on the same 60 games: 66% at 5, 65% at 6, 26% at 7.
  // Easy's scores pile up on exactly 6 (24 of 60 games), so 5 leaves the cushion that makes one
  // extra casualty survivable, while 7 would sit above the pile and halve the win rate.
  //
  // Checked, and deliberately not acted on: v2 task 6 made Operations movement cost ONE press
  // instead of one per hex. That is a presentation change — §5/3 still spends one Action per hex
  // and makes a Paragraph Check on each — so it should not move the difficulty, and measurement
  // agrees. The automated player replayed with multi-hex walking (tools/bot/run.py --walk):
  // Normal 4/30 wins either way; Easy 18/30 walking against 20/30 stepping, median VP 6 in both.
  // No target change is warranted by how cheap walking became.
  //
  // Never raises a requirement: a mission whose data comfortably exceeds its target keeps the
  // rulebook number untouched.
  function scaleRequirement(ceiling, rulebookRequirement, margin) {
    var headroom = margin === undefined ? 6 : margin;
    var scaled = Math.max(1, ceiling - headroom);
    if (scaled >= rulebookRequirement) {
      return { requirement: rulebookRequirement, wasScaled: false, ceiling: ceiling, margin: headroom };
    }
    return { requirement: scaled, wasScaled: true, ceiling: ceiling, margin: headroom };
  }

  window.AmbushVictory = {
    parseGermanVP: parseGermanVP,
    collectActivatableGermans: collectActivatableGermans,
    computeReachableVP: computeReachableVP,
    scaleRequirement: scaleRequirement,
    germanActivationVP: germanActivationVP,
    germanConditionalVP: germanConditionalVP,
    usCasualtyVPLoss: usCasualtyVPLoss,
    computeVPTotal: computeVPTotal,
    resolveVictory: resolveVictory,
    checkEnding1: checkEnding1,
    checkEnding2: checkEnding2,
  };
})();

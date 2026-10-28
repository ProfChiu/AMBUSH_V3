/*
 * germanactions.js — §6/8-6/9 German Action Paragraph resolution
 *
 * Pure logic, no DOM, no dice. Turns an annotated German Action Paragraph program plus a snapshot
 * of the current situation into a flat, ordered list of concrete actions for the caller to carry
 * out. The caller (mission1demo.js) supplies the situation and performs the actions; this module
 * decides only WHAT the German does, never how it's shown or resolved.
 *
 * Why a separate module rather than an extension of paragraphinterpreter.js: that interpreter
 * models Operations-phase paragraph effects (event markers, sightings, conditions, VP) and is
 * covered by its own suites. German action paragraphs are a different language — stances, fire
 * modes, target-selection rules, turn-giving — evaluated against live battlefield state at the
 * moment the German acts. Keeping them apart avoids destabilising a well-tested module for a
 * vocabulary it was never meant to carry.
 *
 * §6/8 step 2 on option syntax, which the program format mirrors exactly:
 *   "Many paragraphs include different options. If these options are separated by bullets (•),
 *    consider the soldier's current situation and choose the one option that applies. If these
 *    options are numbered sequentially (1, 2, etc.), choose the FIRST one that applies, even if
 *    later options also apply."
 * Both collapse to the same evaluation here — cases are tested in order, first match wins — which
 * is correct for numbered lists by definition, and correct for bulleted lists because a
 * well-formed bulleted set is mutually exclusive.
 *
 * §6/8 German Movement: a `move` op with no explicit destination resolves to a `move_by_reference`
 * action — the caller (mission1demo.js) chases the actual Movement Reference chain from
 * assets/data/mission_cards_movement.json (docs/32_HANDOFF.md §5), since that lookup depends on
 * live position/terrain/Movement-Points state this module doesn't hold. `classifyMovementReference`
 * below is the one pure piece of that: given a raw cell value, say what kind of reference it is.
 * A move to a NAMED hex ("crawl into hex N-5") is still fully resolved right here, since it needs
 * no Movement Reference at all.
 */
(function () {
  'use strict';

  // ---- situation predicates ---------------------------------------------------
  // `sit` is a plain snapshot supplied by the caller. Every predicate is total: an unknown
  // condition name throws rather than silently evaluating false, so a typo in the annotation
  // data fails loudly in tests instead of quietly changing German behaviour.
  function evaluate(cond, sit) {
    switch (cond.on) {
      case 'targets_in_sight': return matchCount(cond, sit.targetsInSight);
      case 'targets_in_hex': return matchCount(cond, sit.targetsInHex);
      case 'target_within': return sit.targetsWithin(cond.hexes) > 0;
      case 'in_us_sight': return !!sit.inUsSight;
      case 'terrain': return cond.is.indexOf(sit.terrain) !== -1;
      case 'in_activation_hex': return !!sit.inActivationHex;
      case 'germans_same_or_adjacent': return matchCount(cond, sit.germansSameOrAdjacent);
      case 'germans_within_two': return matchCount(cond, sit.germansWithinTwo);
      case 'germans_lost': return matchCount(cond, sit.germansLost);
      case 'us_occupies_hex': return !!sit.usOccupiesHex(cond.hex);
      case 'has_grenade_and_target_in_range': return !!sit.hasGrenade && sit.targetsWithin(cond.hexes || 3) > 0;
      case 'has_grenade': return !!sit.hasGrenade;
      // §7/3 "traversable hexside": one a soldier could actually cross. A wall cannot be crossed
      // at any cost; an aperture can (at +1 MP), so a window or doorway IS traversable. Paragraphs
      // 812 and 833 both turn on this, and it was un-modelled for as long as the map had no
      // hexside data — see docs/53.
      case 'adjacent_traversable_target': return matchCount(cond, sit.adjacentTraversableTargets);
      // 812/833's own exception clause: "If another active German is in the [target's] hex,
      // charge assault to kill instead."
      case 'german_in_adjacent_target_hex': return !!sit.germanInAdjacentTargetHex;
      case 'all': return cond.of.every(function (c) { return evaluate(c, sit); });
      case 'any': return cond.of.some(function (c) { return evaluate(c, sit); });
      case 'not': return !evaluate(cond.of, sit);
      case 'always': return true;
      default: throw new Error('germanactions: unknown condition "' + cond.on + '"');
    }
  }

  // Count matchers are written the way the paragraphs read: "0", "1-2", "3+", "1", "2+".
  function matchCount(cond, actual) {
    var spec = String(cond.count);
    var plus = /^(\d+)\+$/.exec(spec);
    if (plus) return actual >= parseInt(plus[1], 10);
    var range = /^(\d+)-(\d+)$/.exec(spec);
    if (range) return actual >= parseInt(range[1], 10) && actual <= parseInt(range[2], 10);
    if (/^\d+$/.test(spec)) return actual === parseInt(spec, 10);
    throw new Error('germanactions: bad count spec "' + spec + '"');
  }

  // ---- explaining a decision --------------------------------------------------
  // Renders a condition as the clause a player would read: "a US soldier is within 3 hexes",
  // "he is in an open hex". Total in the same way and for the same reason `evaluate` is — an
  // unknown condition throws rather than quietly producing an empty explanation, so a new
  // annotation vocabulary word cannot ship with the reason silently missing from the pop-up.
  //
  // Deliberately describes what the paragraph TESTED, not what the situation was: the two agree
  // by construction (this is only ever called on a case that just evaluated true), and phrasing
  // it as the test keeps it traceable back to the printed paragraph the player is looking at.

  // Count specs are written as the paragraphs read them: "0", "1", "2+", "1-2".
  function countPhrase(spec, singular, plural) {
    var s = String(spec);
    var plus = /^(\d+)\+$/.exec(s);
    if (plus) return plus[1] + ' or more ' + plural;
    var range = /^(\d+)-(\d+)$/.exec(s);
    if (range) return range[1] + '-' + range[2] + ' ' + plural;
    if (s === '0') return 'no ' + plural;
    if (s === '1') return '1 ' + singular;
    return s + ' ' + plural;
  }

  function joinClauses(parts, conjunction) {
    if (parts.length === 1) return parts[0];
    if (parts.length === 2) return parts[0] + ' ' + conjunction + ' ' + parts[1];
    return parts.slice(0, -1).join(', ') + ', ' + conjunction + ' ' + parts[parts.length - 1];
  }

  var TERRAIN_PHRASE = { open: 'an open hex', woods: 'woods', building: 'a building', other: 'other terrain' };

  // "it is not the case that he is in sight of an active US soldier" is technically right and
  // reads like a logic exercise. The predicates actually written under a `not` in the annotation
  // data get a natural negative instead; anything else falls back to the literal form, which is
  // clumsy but never wrong — a new vocabulary word degrades in legibility, not in accuracy.
  function describeNegated(cond) {
    switch (cond.on) {
      case 'in_us_sight': return 'he is not in sight of any active US soldier';
      case 'in_activation_hex': return 'he has left the hex where he was activated';
      case 'terrain': return 'he is not in ' + joinClauses(cond.is.map(function (t) { return TERRAIN_PHRASE[t] || t; }), 'or');
      case 'us_occupies_hex': return 'no US soldier occupies ' + cond.hex;
      case 'target_within': return 'no US soldier is within ' + cond.hexes + ' hexes';
      case 'has_grenade_and_target_in_range':
        return 'he has no grenade, or no US soldier is within ' + (cond.hexes || 3) + ' hexes';
      case 'not': return describeCondition(cond.of); // double negative
      default: return 'it is not the case that ' + describeCondition(cond);
    }
  }

  function describeCondition(cond) {
    switch (cond.on) {
      case 'targets_in_sight': return countPhrase(cond.count, 'US soldier is', 'US soldiers are') + ' in his sight';
      case 'targets_in_hex': return countPhrase(cond.count, 'US soldier is', 'US soldiers are') + ' in his hex';
      case 'target_within': return 'a US soldier is within ' + cond.hexes + ' hexes';
      case 'in_us_sight': return 'he is in sight of an active US soldier';
      case 'terrain': return 'he is in ' + joinClauses(cond.is.map(function (t) { return TERRAIN_PHRASE[t] || t; }), 'or');
      case 'in_activation_hex': return 'he is still in the hex where he was activated';
      case 'germans_same_or_adjacent': return countPhrase(cond.count, 'other German is', 'other Germans are') + ' in his hex or adjacent';
      case 'germans_within_two': return countPhrase(cond.count, 'other German is', 'other Germans are') + ' within 2 hexes';
      case 'germans_lost': return countPhrase(cond.count, 'German has', 'Germans have') + ' been lost';
      case 'us_occupies_hex': return 'a US soldier occupies ' + cond.hex;
      case 'has_grenade_and_target_in_range':
        return 'he has a grenade and a US soldier is within ' + (cond.hexes || 3) + ' hexes';
      case 'has_grenade': return 'he has a grenade';
      case 'adjacent_traversable_target':
        return countPhrase(cond.count, 'US soldier is', 'US soldiers are') +
          ' adjacent through a hexside he could cross';
      case 'german_in_adjacent_target_hex':
        return 'another active German is already in that hex';
      case 'all': return joinClauses(cond.of.map(describeCondition), 'and');
      case 'any': return joinClauses(cond.of.map(describeCondition), 'or');
      case 'not': return describeNegated(cond.of);
      case 'always': return 'no earlier option applied';
      default: throw new Error('germanactions: cannot describe condition "' + cond.on + '"');
    }
  }

  // ---- resolution -------------------------------------------------------------
  // Walks a program, following `goto` between paragraphs ("see 802"), and flattens the branch
  // that applies into a list of concrete actions. maxChain guards against a data cycle.
  function resolve(startParagraph, programs, sit, maxChain) {
    var limit = maxChain || 12;
    var actions = [];
    var visited = [];
    var decisions = [];   // one entry per branch evaluated — see `describeCondition`
    var current = String(startParagraph);

    for (var hops = 0; hops < limit; hops++) {
      var program = programs[current];
      visited.push(current);
      if (!program) {
        actions.push({ action: 'unannotated', paragraph: current });
        break;
      }
      var jump = runOps(program, sit, actions, current, decisions);
      if (!jump) break;
      if (visited.indexOf(jump) !== -1) { actions.push({ action: 'chain_cycle', paragraph: jump }); break; }
      current = jump;
    }
    return { visited: visited, actions: actions, decisions: decisions };
  }

  // Returns a paragraph number to jump to, or null when the program completes in place.
  function runOps(ops, sit, actions, paragraph, decisions) {
    for (var i = 0; i < ops.length; i++) {
      var op = ops[i];
      if (op.op === 'branch') {
        var taken = null, takenIndex = -1;
        for (var c = 0; c < op.cases.length; c++) {
          if (evaluate(op.cases[c], sit)) { taken = op.cases[c]; takenIndex = c; break; }
        }
        // Recorded whether or not a case matched: "no option applied" is itself an explanation,
        // and it is the one a reader is most likely to be puzzled by. `option` is 1-based to
        // match how §6/8's numbered options and the printed bullets are counted.
        if (decisions) {
          decisions.push({
            paragraph: paragraph,
            option: taken ? takenIndex + 1 : null,
            of: op.cases.length,
            // An `always` case is the paragraph's "Otherwise..." — worth flagging separately so
            // the UI can say "the catch-all applies" rather than the tautological "option 2 of 2
            // applies: no earlier option applied".
            catchAll: !!taken && taken.on === 'always',
            because: taken ? describeCondition(taken) : null,
          });
        }
        if (!taken) continue;              // no case applied — fall through to the next op
        if (taken.goto) return String(taken.goto);
        var jump = runOps(taken.then || [], sit, actions, paragraph, decisions);
        if (jump) return jump;
        continue;
      }
      if (op.op === 'goto') return String(op.paragraph);

      // A stance change conditioned on having a free stance change available (§6/7) is dropped
      // rather than forced when none is left — the paragraph says "if free stance change
      // available", so a wounded soldier simply doesn't get it.
      if (op.op === 'stance' && op.ifFreeStanceChange && !sit.freeStanceChange) continue;

      if (op.op === 'move' && !op.toHex) {
        actions.push({ action: 'move_by_reference', paragraph: paragraph, style: op.style || 'quick' });
        continue;
      }
      actions.push(toAction(op, paragraph));
    }
    return null;
  }

  function toAction(op, paragraph) {
    var a = {};
    for (var k in op) if (Object.prototype.hasOwnProperty.call(op, k)) a[k] = op[k];
    a.action = op.op;
    a.paragraph = paragraph;
    delete a.op;
    return a;
  }

  // ---- §6/8 German Movement — classify one Movement Reference cell -----------
  // Raw values come straight from assets/data/mission_cards_movement.json: a printed-style hex
  // coordinate ("N-9", single dash, not zero-padded — the SAME format as an activate_german
  // effect's hex, never the "N-09" cartridge-key format used to look the cell up in the first
  // place), the literal "Exit", a bare paragraph number (§6/8's "movement reference paragraph"),
  // or "NONE" when this hex has no Movement Reference recorded for the current mission/condition.
  // Pure classification only — resolving the hex-coordinate case against live terrain/Movement
  // Points, and reading the Exit/paragraph cases, is the caller's job (mission1demo.js).
  var HEX_ID_RE = /^[A-Z]-\d{1,2}$/;
  function classifyMovementReference(ref) {
    if (!ref || ref === 'NONE') return { type: 'none' };
    if (ref === 'Exit') return { type: 'exit' };
    if (HEX_ID_RE.test(ref)) return { type: 'hex', hex: ref };
    if (/^\d+$/.test(ref)) return { type: 'paragraph', paragraph: ref };
    throw new Error('germanactions: unrecognised Movement Reference "' + ref + '"');
  }

  // ---- Card Equipment text -> weapon_chart.js weapon id ---------------------------------------
  //
  // A German's armament is stated on his card as free text ("Bolt Rifle (Scope); Pistol (Luger)"),
  // not as a weapon id, so something has to map one to the other. This lived in mission1demo.js as
  // `guessGermanWeaponId` and carried four real bugs, all of which changed what Germans actually
  // shoot with:
  //
  //   1. "Bolt Rifle (Scope)" matched the plain `rifle` test first and resolved to `bolt`, so
  //      every sniper in the roster (7 cards, three of them in Mission 1 — GE 25/N, GE 15/L and
  //      GE 9/R) fired an ordinary rifle. The scoped rifle's bands are far longer (short 2-8 vs
  //      2-6, medium 9-18 vs 7-14) with a better damage row. Mission 1's own briefing is about
  //      being driven off by sniper fire, so this one mattered thematically as well as mechanically.
  //   2. A card carrying ONLY a pistol ("Pistol (Luger)" — GE 5/U, GE 7/N) fell through to the
  //      default and was handed a bolt rifle: a far better weapon than the card grants.
  //   3. "No weapon" (GE 42/Q, a scientist) and "Vehicle" (GE 54/Z, GE 55/Y) likewise defaulted to
  //      a bolt rifle, arming men and vehicles the cards say are unarmed.
  //   4. The `smg` test sat AFTER the `machinegun` test, and "submachinegun" contains
  //      "machinegun" — so any submachine gun would have resolved to the crew-served MMG. No
  //      current card spells it that way, so this one never fired in practice, but the ordering
  //      was wrong and is now fixed rather than left as a trap.
  //
  // Returns null for a genuinely unarmed card. Order matters throughout: most specific first.
  // "Light Machinegun" maps to `mmg` because the weapon chart has no separate light-MG row —
  // a documented approximation, not a transcription gap.
  function weaponIdForCard(card) {
    var eq = ((card && card.Equipment) || '').toLowerCase();
    if (!eq) return null;
    if (eq.indexOf('no weapon') !== -1) return null;
    if (eq.indexOf('vehicle') !== -1) return null;          // vehicles are scenery (docs/11 decision #2)
    if (eq.indexOf('rifle') !== -1 && eq.indexOf('scope') !== -1) return 'scope';
    if (eq.indexOf('submachine') !== -1 || eq.indexOf('smg') !== -1) return 'smg'; // before machinegun
    if (eq.indexOf('machine pistol') !== -1) return 'mp';
    if (eq.indexOf('machinegun') !== -1 || eq.indexOf('machine gun') !== -1) return 'mmg';
    if (eq.indexOf('rifle') !== -1) return 'bolt';
    if (eq.indexOf('pistol') !== -1) return 'pistol';
    return null; // unrecognised — tools/test_german_actions.js asserts this never happens for a
                 // real roster card, so a new transcription with odd wording fails loudly there
                 // rather than silently disarming someone mid-mission.
  }

  // §9/4: "A German with a jammed weapon will use his SECOND WEAPON, if he has one; otherwise, he
  // will attempt to unjam his weapon." Cards list armament as free text with the pieces separated
  // by semicolons — "Bolt Rifle (Scope); Pistol (Luger)" — so the second weapon is simply the next
  // clause that names a firearm. Grenades and satchel charges are NOT second weapons for this
  // rule: they are thrown, have their own action (§10), and a German told to FIRE cannot satisfy
  // that by throwing one.
  //
  // Returns null when the card names only one firearm, which is the common case: of Mission 1's
  // eight Germans only GE 25/N, GE 32/S and GE 34/X carry a pistol alongside their main weapon.
  function secondWeaponIdForCard(card) {
    var eq = (card && card.Equipment) || '';
    var seen = [];
    eq.split(';').forEach(function (part) {
      var id = weaponIdForCard({ Equipment: part });
      if (id && seen.indexOf(id) === -1) seen.push(id);
    });
    return seen.length > 1 ? seen[1] : null;
  }

  window.AmbushGermanActions = {
    secondWeaponIdForCard: secondWeaponIdForCard,
    resolve: resolve,
    evaluate: evaluate,
    matchCount: matchCount,
    describeCondition: describeCondition,
    classifyMovementReference: classifyMovementReference,
    weaponIdForCard: weaponIdForCard,
  };
})();

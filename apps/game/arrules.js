/*
 * arrules.js — Phase 8 Action Round rules (docs/22_ACTION_ROUND.md)
 *
 * Pure logic, no DOM. Scope matches the phase brief exactly (docs/11_GAME_BUILD_PHASES.md):
 * AR Track, initiative, awareness, command, panic, giving turns, turn order. Deliberately NOT
 * in scope: simulating what a German soldier actually DOES when his Action Paragraph is read
 * (§6/8-6/9 — "crouch and fire at closest target" needs real targeting and fire resolution,
 * which is Phase 9/combat). What IS in scope here is resolving WHICH paragraph number applies
 * — that's pure card/table lookup, doesn't need combat to exist, and is exercised against real
 * transcribed German card data (assets/data/german_roster.json).
 *
 * Also covers Initiative Determination (resolveAdvantage) and AR Track chart classification
 * (classifyARRoll, against the shared assets/data/ar_track.js) — both single stateless lookups,
 * same shape as resolveGermanActionParagraph. The stateful walk that actually drives a Round
 * through the AR Track using these decisions — apps/game/arscheduler.js — is a separate module
 * (docs/23_ACTION_ROUND_SCHEDULER.md); this file only ever decides outcomes, never sequences them.
 */
(function () {
  'use strict';

  var G = window.AmbushHexGrid;

  // ---- Command (§6/3) --------------------------------------------------------
  // "Add his IN to the IN ratings of all other active US soldiers in his hex. If this sum is
  // five or more, the soldier is in command." Verified against the rulebook's own "Commander
  // Functions" diagram: commander A (IN 3) + D (IN 1) + E (IN 2) = 6, in command; C alone with
  // A = 5, in command; B alone (3 hexes from A) with IN 1 < 5, out of command.
  function isInCommand(soldierIN, othersInHexIN) {
    var sum = soldierIN + (othersInHexIN || []).reduce(function (a, b) { return a + b; }, 0);
    return sum >= 5;
  }

  // A commander's Command Radius is his own hex plus every hex within 2 hexes of it (§6/3).
  // Reuses hexgrid.js's cube-distance calculation — no separate geometry needed.
  function commandRadiusHexIds(commanderHexId) {
    var p = G.parseId(commanderHexId);
    if (!p) return [];
    var out = [];
    G.allHexIds().forEach(function (id) {
      var q = G.parseId(id);
      if (G.distance(p, q) <= 2) out.push(id);
    });
    return out;
  }

  // Assembles the full list of IN ratings that count toward a soldier's command total at
  // `targetHexId`, per §6/3: his own hex's other active soldiers (co-location always counts,
  // commander or not — that's just "another soldier here"), PLUS every *other* active,
  // non-panicked commander's IN whose Command Radius reaches this hex from a *different* hex (a
  // commander physically in the same hex is already covered by co-location, not counted twice).
  // `roster` is [{hexId, IN, isCommander, isActive, panicked}, ...] for every other US soldier
  // (excluding the soldier being evaluated). `panicked` is optional (Task #65,
  // docs/40_PANIC_EFFECTS.md — §13/1: "A panicked commander has no command radius") and, unlike
  // `isActive`, only suppresses the *radius* branch below, not co-location — a panicked
  // commander still counts as "another soldier here" for someone physically standing with him,
  // he just can't project influence into hexes he isn't in. Verified against the rulebook's own
  // "Commander Functions" diagram (§6/3): commander A (IN 3) reaches D and E's hexes and his
  // own; combined with each, D/E/A are in command (>=5); C, alone in a hex within A's radius,
  // reaches 5 combined with A alone; B, three hexes from A (outside the radius) and alone, has
  // only his own IN (<5), out of command.
  function commandContributors(targetHexId, roster) {
    var contributors = [];
    roster.forEach(function (s) {
      if (!s.isActive) return;
      if (s.hexId === targetHexId) {
        contributors.push(s.IN); // co-located — counts regardless of commander/panic status
      } else if (s.isCommander && !s.panicked) {
        var radius = commandRadiusHexIds(s.hexId);
        if (radius.indexOf(targetHexId) !== -1) contributors.push(s.IN);
      }
    });
    return contributors;
  }

  // ---- Initiative Determination (§6/1 step 1) --------------------------------
  // "Roll two dice and reading one as the German result and one as the US result. The side
  // with the higher result has the advantage for this Round. If the results are equal,
  // advantage goes to the Germans." Predetermined-advantage paragraphs (an activate_german
  // program op stating one side has the advantage in Round 1) are out of scope here — that's
  // the paragraph interpreter's job, already handled there.
  function resolveAdvantage(usRoll, germanRoll) {
    return germanRoll >= usRoll ? 'german' : 'US';
  }

  // ---- AR Track roll classification (§6/1 step 2) -----------------------------
  // arTrack: the AR_TRACK chart (assets/data/ar_track.js), keyed by IN 0-5. Given a soldier's
  // IN rating and his die roll, returns which space the roll lands in and whether it's a
  // red-printed number — NOT applying the wounded/command exceptions, which stay
  // resolveMarkerPlacement's job so each function keeps one responsibility.
  function classifyARRoll(arTrack, inRating, roll) {
    var col = arTrack[inRating];
    if (!col) throw new Error('AR Track has no column for IN ' + inRating);
    if (col.panic.indexOf(roll) !== -1) return { space: 'panic', isRed: false };
    if (col.twoTurn.indexOf(roll) !== -1) return { space: '2turn', isRed: col.twoTurnRed.indexOf(roll) !== -1 };
    if (col.oneTurn.indexOf(roll) !== -1) return { space: '1turn', isRed: col.oneTurnRed.indexOf(roll) !== -1 };
    throw new Error('AR Track IN ' + inRating + ' column has no space for roll ' + roll);
  }

  // ---- Panic & AR marker placement (§6/1 AR Marker Placement, §6/4 Panic) ----
  // `space` is whatever the (still-injected, see docs/22) AR Track chart says the soldier's
  // initiative die roll lands on: '2turn' | '1turn' | 'panic' | 'red' (a red-printed number —
  // only meaningful for US soldiers). Returns the actual outcome after applying the wounded and
  // command exceptions §6/1 and §6/4 both spell out.
  function resolveMarkerPlacement(opts) {
    var space = opts.space, wounded = !!opts.wounded, inCommand = !!opts.inCommand;

    if (space === 'red') {
      // "If a US soldier is out of command, and the die roll yields a result printed in red,
      // the soldier panics... If the soldier is in command, he does not panic and receives the
      // indicated number of turns" — the same cell's non-red equivalent, which callers supply.
      if (!inCommand) return { outcome: 'panic' };
      space = opts.spaceIfInCommand || '1turn';
    }

    if (space === 'panic') return { outcome: 'panic' };

    if (space === '2turn') {
      // "A wounded soldier can receive only one turn; if a wounded soldier receives two turns,
      // place his marker in the 1-Turn space instead."
      return wounded ? { outcome: 'turns', turns: 1 } : { outcome: 'turns', turns: 2 };
    }

    if (space === '1turn') return { outcome: 'turns', turns: 1 };

    throw new Error('unknown AR Track space: ' + opts.space);
  }

  // A soldier can be given a turn only from the 1-Turn or Complete space (§6/3) — not 2-Turn,
  // Panic, Unaware, or Inactive. Wounded soldiers can never be given a turn, regardless of space.
  function canReceiveGivenTurn(currentSlot, wounded) {
    if (wounded) return false;
    return currentSlot === '1turn' || currentSlot === 'complete';
  }

  // ---- US Awareness (§6/5) ---------------------------------------------------
  // round: 1, 2, or 3+. Round 1: only soldiers who can see the just-activated German check.
  // Round 2: every still-unaware soldier checks, regardless of location. Round 3+: automatic.
  function awarenessRule(round, canSeeActivatedGerman) {
    if (round >= 3) return 'automatic';
    if (round === 1) return canSeeActivatedGerman ? 'check' : 'remainUnaware';
    return 'check'; // round 2: everyone still unaware checks regardless of sight
  }

  // ---- Event Check dice (§6/1 step 2, resolves the open question from docs/21) ------------
  // "Roll two dice and add the two results together. Locate the sum on the Event column...
  // resolved in the same way as an Event Check during Operations (5/6)." Confirms both the
  // Operations-phase (§5/6) and Rounds-phase (§6/1) Event Check use the same mechanism: sum of
  // two d10 rolls (0-18). The Random Event table has 20 entries (RE-00..RE-19); 19 is only
  // reachable if something other than a plain two-d10 sum is meant for that one edge value —
  // noted, not fabricated an explanation for.
  function rollEventSum(rollDie) {
    return rollDie() + rollDie();
  }

  // ---- German Action Number + card cross-reference (§6/8) --------------------
  // "Roll one die... Use this Action Number when referring to the card." Cross-reference the
  // roll against the card's DIE table to get an Action Paragraph number, using whichever column
  // applies: Self-Preservation (if the German is in or adjacent to an active US soldier —
  // highest precedence, §6/8) > the active Special Reaction column (if one is in effect) > the
  // current Condition's own column. `card` is a real assets/data/german_roster.json entry —
  // `card.table.row_key` is 'DIE', `card.table.columns` include e.g. 'CONDITION 4', 'SPECIAL S'.
  function resolveGermanActionParagraph(card, dieRoll, condition, opts) {
    opts = opts || {};
    if (!card.table) throw new Error('card ' + card['Card ID'] + ' has no action table (group/prose-only card)');

    // Which of the three rules picks the column is the single most opaque thing about German
    // behaviour — the player sees a paragraph number appear and no reason for it. `reason` is
    // returned alongside so the caller can say WHY this column, not just which. It carries the
    // rule that fired and what it displaced; the human-readable sentence is the caller's job,
    // since naming the adjacent US soldier needs board state this module doesn't hold.
    var columnName, reason;
    if (opts.selfPreservationActive) {
      columnName = findColumn(card.table.columns, /^SPECIAL S$/i);
      if (!columnName) throw new Error('card ' + card['Card ID'] + ' has no Self-Preservation (SPECIAL S) column');
      reason = { rule: 'self_preservation', overrides: opts.specialReaction ? 'SPECIAL ' + opts.specialReaction : 'CONDITION ' + condition };
    } else if (opts.specialReaction) {
      columnName = findColumn(card.table.columns, new RegExp('^SPECIAL ' + opts.specialReaction + '$', 'i'));
      if (!columnName) throw new Error('card ' + card['Card ID'] + ' has no SPECIAL ' + opts.specialReaction + ' column');
      reason = { rule: 'special_reaction', letter: opts.specialReaction, overrides: 'CONDITION ' + condition };
    } else {
      columnName = findColumnForCondition(card.table.columns, condition);
      if (!columnName) throw new Error('card ' + card['Card ID'] + ' has no column for Condition ' + condition);
      reason = { rule: 'condition', condition: condition };
    }

    var row = card.table.rows.filter(function (r) { return dieInRange(r[card.table.row_key], dieRoll); })[0];
    if (!row) throw new Error('card ' + card['Card ID'] + ' has no DIE row covering roll ' + dieRoll);
    var value = row.values[columnName];
    if (!value) throw new Error('card ' + card['Card ID'] + ' column ' + columnName + ' row ' + row[card.table.row_key] + ' is blank');
    return { paragraph: value, column: columnName, reason: reason };
  }

  function findColumn(columns, pattern) {
    return columns.filter(function (c) { return pattern.test(c); })[0] || null;
  }

  // A card's DIE row key is either a single digit ("7") or a range ("0-3", "8-9").
  function dieInRange(rangeStr, roll) {
    var m = /^(\d)(?:-(\d))?$/.exec(rangeStr);
    if (!m) return false;
    var lo = parseInt(m[1], 10), hi = m[2] !== undefined ? parseInt(m[2], 10) : lo;
    return roll >= lo && roll <= hi;
  }

  // "CONDITION 4" matches condition 4; "CONDITION 1-2" matches conditions 1 or 2 (a range some
  // cards use to cover multiple Conditions with one column). Reused by resolveGermanActionParagraph.
  function findColumnForCondition(columns, condition) {
    return columns.filter(function (c) {
      var m = /^CONDITION\s+(\d+)(?:-(\d+))?$/i.exec(c);
      if (!m) return false;
      var lo = parseInt(m[1], 10), hi = m[2] !== undefined ? parseInt(m[2], 10) : lo;
      return condition >= lo && condition <= hi;
    })[0] || null;
  }

  window.AmbushActionRound = {
    isInCommand: isInCommand,
    commandRadiusHexIds: commandRadiusHexIds,
    commandContributors: commandContributors,
    resolveAdvantage: resolveAdvantage,
    classifyARRoll: classifyARRoll,
    resolveMarkerPlacement: resolveMarkerPlacement,
    canReceiveGivenTurn: canReceiveGivenTurn,
    awarenessRule: awarenessRule,
    rollEventSum: rollEventSum,
    resolveGermanActionParagraph: resolveGermanActionParagraph,
    findColumnForCondition: findColumnForCondition,
  };
})();

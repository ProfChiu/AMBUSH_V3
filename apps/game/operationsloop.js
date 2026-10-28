/*
 * operationsloop.js — Phase 7 Operations loop (docs/21_OPERATIONS_LOOP.md)
 *
 * Pure logic, no DOM. Owns the real game state §5 describes (Condition in progress, which
 * sightings have occurred, which hexes have an Event marker) and orchestrates the actual
 * Paragraph Check procedure (§5/1) on top of the Phase 6 data (assets/data/mission_cards.json,
 * paragraphs.json, paragraph_programs.js) and the paragraph interpreter (paragraphinterpreter.js).
 * checksrules.js resolves the individual Perception/Activation Checks a paragraph's program calls
 * for; this module is what actually calls them with real ratings instead of a test's scripted
 * stand-in.
 *
 * Depends on: hexgrid.js (cartridge-ID conversion), checksrules.js, paragraphinterpreter.js.
 */
(function () {
  'use strict';

  var G = window.AmbushHexGrid;
  var Checks = window.AmbushChecks;
  var Interp = window.AmbushParagraphInterpreter;

  // ---- Mission-card cell parsing -------------------------------------------
  // A cell is 'NONE', 'EVENT', a bare paragraph number, or a sighting-gated paragraph
  // reference ('s3-600') — see docs/19_DATA_LAYER.md §2.
  function parseCellValue(raw) {
    var v = (raw || '').trim();
    if (!v || v.toUpperCase() === 'NONE') return { type: 'none' };
    if (v.toUpperCase() === 'EVENT') return { type: 'event' };
    var m = /^s(\d)-(\d+)$/i.exec(v);
    if (m) return { type: 'paragraph', paragraph: String(parseInt(m[2], 10)), sighting: m[1] };
    if (/^\d+$/.test(v)) return { type: 'paragraph', paragraph: String(parseInt(v, 10)), sighting: null };
    return { type: 'unknown', raw: v };
  }

  function cellAt(missionCards, mission, condition, cartridgeId) {
    var grid = missionCards[mission] && missionCards[mission][String(condition)];
    if (!grid) throw new Error('no mission-card data for mission ' + mission + ' condition ' + condition);
    return grid[cartridgeId];
  }

  // ---- Game state -----------------------------------------------------------
  // The digital equivalent of the Squad Record's Condition/Sighting tracks and the map's
  // physical Event markers.
  function createGameState() {
    return { condition: 1, sightingsOccurred: {}, eventMarkers: {} };
  }

  // ---- Reading a paragraph (and any chain it leads to) -----------------------
  // §5/4: a paragraph whose own text starts with "[sN]" marks that sighting as occurred the
  // moment it's read — independent of whether a mission-card sN- gate is what led here (a
  // "goto" from elsewhere reads the same paragraph the same way). §5/1: "If successful, see N"
  // means immediately read N next; readParagraphChain follows that chain until it ends or hits
  // a paragraph this session hasn't annotated a program for (Mission 1's own reachable set is
  // fully annotated — assets/data/paragraph_programs.js — but a chain can reference a paragraph
  // outside that set; stopping there is correct, not a bug, and is reported, not swallowed).
  function readParagraphChain(startNumber, paragraphsData, programsData, ctx, state, maxChain) {
    maxChain = maxChain || 25;
    var visited = [];
    var effects = [];
    var current = startNumber;
    var chain = {}; // shared by every paragraph of this chain (paragraphinterpreter.js: indicatedHex)
    for (var i = 0; i < maxChain; i++) {
      var text = paragraphsData[current];
      if (text === undefined) return { visited: visited, effects: effects, stoppedAt: current, reason: 'paragraph-text-missing' };
      var sMatch = /^\[s(\d)\]/.exec(text);
      if (sMatch && !state.sightingsOccurred[sMatch[1]]) state.sightingsOccurred[sMatch[1]] = true;
      visited.push(current);
      // Presentation-only observability hook (optional, no-op if the caller doesn't supply one):
      // lets a UI layer correlate a Check/Event-Marker/etc. side effect fired during this
      // paragraph's program to the paragraph that caused it. No effect on rules behavior.
      if (ctx.onEnterParagraph) ctx.onEnterParagraph(current);
      var program = programsData[current];
      if (program === undefined) return { visited: visited, effects: effects, stoppedAt: current, reason: 'not-annotated' };
      var result = Interp.run(program, ctx, chain);
      effects = effects.concat(result.effects);
      if (result.outcome.type === 'end') return { visited: visited, effects: effects, reason: 'end' };
      current = result.outcome.target;
    }
    return { visited: visited, effects: effects, stoppedAt: current, reason: 'max-chain-exceeded' };
  }

  function germanActivatedIn(effects) {
    return effects.some(function (e) { return e.op === 'activate_german'; });
  }

  // ---- Random Event resolution (§5/6) — shared by Operations' per-hex Event Check
  // (paragraphCheck's 'event' branch) and Rounds' per-Round Event Check (roundEventCheck, §6/1
  // step 2: "This Event Check is resolved in the same way as an Event Check during Operations").
  // opts: { missionCards, mission, condition, paragraphs, programs, ctx, state, rollForEvent }
  function resolveRandomEvent(opts) {
    var index = opts.rollForEvent();
    var reCell = parseCellValue(cellAt(opts.missionCards, opts.mission, opts.condition, 'RE-' + (index < 10 ? '0' + index : index)));
    var chain = null;
    if (reCell.type === 'paragraph' && !(reCell.sighting && opts.state.sightingsOccurred[reCell.sighting])) {
      chain = readParagraphChain(reCell.paragraph, opts.paragraphs, opts.programs, opts.ctx, opts.state);
    }
    return { reIndex: index, chain: chain, germanActivated: chain ? germanActivatedIn(chain.effects) : false };
  }

  // ---- The Paragraph Check procedure (§5/1) ----------------------------------
  // opts: { hexId, mission, missionCards, paragraphs, programs, state, ctx, rollForEvent,
  //         skipEventCheck }
  // rollForEvent() -> the Random Event column index, e.g. AmbushActionRound.rollEventSum(rollDie)
  // (arrules.js) — §6/1's Rounds-phase Event Phase text ("roll two dice and add the two results
  // together... resolved in the same way as an Event Check during Operations, 5/6") resolves what
  // was an open question when this module was first built (docs/18_DATA_LAYER_SPIKE.md): both
  // phases use the same mechanism, sum of two d10 rolls (0-18; RE-19 is only reachable some other
  // way, not explained — noted in docs/22_ACTION_ROUND.md rather than invented). Still injected,
  // not computed here, so this module doesn't need to depend on arrules.js directly.
  function paragraphCheck(opts) {
    var cartridgeId = G.printedIdToCartridgeId(opts.hexId);
    if (!cartridgeId) throw new Error('bad hex id: ' + opts.hexId);

    if (opts.state.eventMarkers[opts.hexId]) {
      return { skipped: 'event-marker-present', hexId: opts.hexId };
    }

    var raw = cellAt(opts.missionCards, opts.mission, opts.state.condition, cartridgeId);
    var cell = parseCellValue(raw);

    if (cell.type === 'none') return { effect: 'none', hexId: opts.hexId };

    if (cell.type === 'paragraph') {
      if (cell.sighting && opts.state.sightingsOccurred[cell.sighting]) {
        return { skipped: 'sighting-already-occurred', hexId: opts.hexId, sighting: cell.sighting };
      }
      var chain = readParagraphChain(cell.paragraph, opts.paragraphs, opts.programs, opts.ctx, opts.state);
      return { effect: 'paragraph', hexId: opts.hexId, chain: chain, germanActivated: germanActivatedIn(chain.effects) };
    }

    if (cell.type === 'event') {
      // §6/7: "Make Paragraph Checks during movement in Rounds just as you do in Operations
      // ignoring, however, any hexes calling for Event Checks, but still placing Event Markers."
      // Same no-roll marker-placement behavior conditionChange() already uses for §5/5.
      if (opts.skipEventCheck) {
        opts.state.eventMarkers[opts.hexId] = true;
        opts.ctx.placeEventMarker(opts.hexId);
        return { effect: 'event-marker-placed-no-roll', hexId: opts.hexId };
      }
      var re = resolveRandomEvent({
        missionCards: opts.missionCards, mission: opts.mission, condition: opts.state.condition,
        paragraphs: opts.paragraphs, programs: opts.programs, ctx: opts.ctx, state: opts.state,
        rollForEvent: opts.rollForEvent,
      });
      opts.state.eventMarkers[opts.hexId] = true; // §5/6: placed regardless of the RE outcome
      opts.ctx.placeEventMarker(opts.hexId);
      return { effect: 'event', hexId: opts.hexId, reIndex: re.reIndex, chain: re.chain, germanActivated: re.germanActivated };
    }

    return { effect: 'unknown-cell', hexId: opts.hexId, raw: raw };
  }

  // ---- Rounds Event Phase (§6/1 step 2) ---------------------------------------
  // "Conduct one Event Check by rolling two dice and adding the two results together... This
  // Event Check is resolved in the same way as an Event Check during Operations (5/6)." Unlike
  // Operations' version, this one isn't tied to any hex — it's once per Round (Round 1 excepted,
  // caller's job to skip), not triggered by a Paragraph Check, so no Event Marker is placed (that
  // concept belongs to the per-hex Operations/Rounds-movement check, not this one).
  // opts: same shape as resolveRandomEvent's (mission, missionCards, condition, paragraphs,
  // programs, ctx, state, rollForEvent).
  function roundEventCheck(opts) {
    var re = resolveRandomEvent(opts);
    return { effect: 'event', reIndex: re.reIndex, chain: re.chain, germanActivated: re.germanActivated };
  }

  // ---- Condition change (§5/5, §6/11) ------------------------------------------
  // Event Checks are NOT rolled here — a cell that says EVENT just gets an Event marker placed,
  // per §5/5's explicit "ignoring Event Checks, and simply placing Event markers in hexes that
  // required the Event Checks." Checks hexes in ascending order.
  //
  // `opts.stopOnActivation` (default true, matching §5/5's original "do not check other hexes"
  // exactly, and every existing caller/test): the Rounds version of this same procedure, §6/11,
  // is explicit that it does NOT stop early — "Conduct Paragraph Checks for all US occupied
  // hexes... All indicated German activations (if any) occur using the procedure in 6/6" — so
  // Task #66 (docs/41_CONDITION_CHANGE_ROUNDS.md) added the flag rather than forking the whole
  // function; the per-hex procedure itself (Event markers not rolled, paragraph chains read,
  // ascending hex order) is identical either way.
  function sortHexIds(hexIds) {
    return hexIds.slice().sort(function (a, b) {
      var pa = G.parseId(a), pb = G.parseId(b);
      return pa.colIdx - pb.colIdx || pa.rowIdx - pb.rowIdx;
    });
  }

  function conditionChange(opts) {
    var stopOnActivation = opts.stopOnActivation !== false;
    opts.state.condition = opts.to;
    opts.state.eventMarkers = {};
    opts.ctx.setCondition(opts.to);

    var log = [];
    var anyActivated = false;
    var ordered = sortHexIds(opts.occupiedHexIds);
    for (var i = 0; i < ordered.length; i++) {
      var hexId = ordered[i];
      if (opts.ctx.onEnterHex) opts.ctx.onEnterHex(hexId); // presentation-only, see onEnterParagraph
      var cartridgeId = G.printedIdToCartridgeId(hexId);
      var raw = cellAt(opts.missionCards, opts.mission, opts.state.condition, cartridgeId);
      var cell = parseCellValue(raw);
      var entry = { hexId: hexId };

      if (cell.type === 'none') {
        entry.effect = 'none';
      } else if (cell.type === 'event') {
        opts.state.eventMarkers[hexId] = true;
        opts.ctx.placeEventMarker(hexId);
        entry.effect = 'event-marker-placed-no-roll';
      } else if (cell.type === 'paragraph') {
        if (cell.sighting && opts.state.sightingsOccurred[cell.sighting]) {
          entry.effect = 'skipped-sighting-occurred';
        } else {
          var chain = readParagraphChain(cell.paragraph, opts.paragraphs, opts.programs, opts.ctx, opts.state);
          entry.effect = 'paragraph';
          entry.chain = chain;
          entry.germanActivated = germanActivatedIn(chain.effects);
        }
      } else {
        entry.effect = 'unknown-cell';
      }

      log.push(entry);
      if (entry.germanActivated) {
        anyActivated = true;
        if (stopOnActivation) return { log: log, roundsCommenced: true };
      }
    }
    return { log: log, roundsCommenced: anyActivated };
  }

  // ---- ctx factory ------------------------------------------------------------
  // Builds a paragraphinterpreter-compatible ctx wired to real state (Condition, sightings) and
  // real check resolution (checksrules.js), from a smaller set of still-genuinely-external
  // dependencies: dice rolls, a soldier roster/LOS query, German activation, and the Phase 9
  // procedure stubs. activationLevelForCondition(state.condition) reads assets/data/missions.json.
  function buildContext(opts) {
    return {
      rollDie: opts.rollDie,
      onEnterHex: opts.onEnterHex || function () {},
      onEnterParagraph: opts.onEnterParagraph || function () {},
      // Same presentation-only observability pattern as onEnterParagraph: opts.onCheckResolved,
      // if supplied, is told (kind, modifier, roll, result) after the real roll/lookup — a UI
      // layer can use this to show the check as its own popup without changing what it resolves to.
      // soldier ({id, pc}, optional): a named soldier rolls against his own PC (pc_check_los);
      // otherwise the soldier whose Paragraph Check is running.
      resolveCheck: function (kind, modifier, soldier) {
        var roll = opts.rollDie();
        var pc = soldier ? soldier.pc : (opts.pcRatingForCheck ? opts.pcRatingForCheck() : opts.defaultPcRating);
        var result = kind === 'activation'
          ? Checks.resolveActivationCheck(opts.activationLevel, modifier, roll)
          : Checks.resolvePerceptionCheck(pc, modifier, roll);
        if (opts.onCheckResolved) opts.onCheckResolved(kind, modifier, roll, result, soldier || null);
        return result;
      },
      hasSighting: function (n) { return !!opts.state.sightingsOccurred[n]; },
      soldiersWhoCanSee: opts.soldiersWhoCanSee,
      isGermanRemovedOnce: opts.isGermanRemovedOnce,
      placeEventMarker: function (hexId) { if (hexId) opts.state.eventMarkers[hexId] = true; opts.onPlaceEventMarker && opts.onPlaceEventMarker(hexId); },
      placeLandmark: opts.onPlaceLandmark || function () {},
      setCondition: opts.onSetCondition || function () {},
      activateGerman: opts.onActivateGerman || function () {},
      commenceRounds: opts.onCommenceRounds || function () {},
      awardVP: opts.onAwardVP || function () {},
      runProcedure: opts.onRunProcedure || function () {},
      moverIs: opts.moverIs || function () { return false; },
      hiddenFire: opts.onHiddenFire || function () {},
    };
  }

  // ---- Contact terms (§6/1 Initiative exception, §6/5, Phase 8c) ------------
  // The Round-1 terms a chain's contact paragraph set, read from its effects, or null when the
  // chain has no `contact` op. awareSoldiers: who "just made his PC check" — the soldiers who
  // succeeded in the chain's last PC check ('mover' when it was the triggering soldier's own
  // roll); empty when the paragraph doesn't make him aware, or no PC check succeeded last.
  // germanTwoTurns: ids of Germans this chain activated with "receives 2 turns this Round".
  function contactTerms(effects) {
    var at = -1;
    effects.forEach(function (e, i) { if (e.op === 'contact') at = i; });
    if (at === -1) return null;
    var c = effects[at];
    var aware = [];
    if (c.checkerAware) {
      for (var i = at - 1; i >= 0; i--) {
        var e = effects[i];
        if (e.op !== 'check' || e.kind !== 'pc') continue;
        if (e.soldier === undefined) { if (e.result === 'success') aware = ['mover']; break; }
        // One pc_check_los rolls a run of consecutive soldier checks; gather the whole run.
        for (var j = i; j >= 0 && effects[j].op === 'check' && effects[j].soldier !== undefined; j--) {
          if (effects[j].result === 'success') aware.unshift(effects[j].soldier);
        }
        break;
      }
    }
    var twoTurns = [];
    effects.forEach(function (e) { if (e.op === 'activate_german' && e.receivesTwoTurns) twoTurns = twoTurns.concat(e.ids); });
    return { advantage: c.advantage, awareSoldiers: aware, awareUsTwoTurns: c.awareUsTwoTurns, germanTwoTurns: twoTurns };
  }

  window.AmbushOperations = {
    parseCellValue: parseCellValue,
    createGameState: createGameState,
    readParagraphChain: readParagraphChain,
    paragraphCheck: paragraphCheck,
    roundEventCheck: roundEventCheck,
    conditionChange: conditionChange,
    buildContext: buildContext,
    contactTerms: contactTerms,
    sortHexIds: sortHexIds,
  };
})();

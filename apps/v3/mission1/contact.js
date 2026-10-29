// mission1/contact.js (7 of 13) — contact terms, German activation, German card, tooltips, inspectors. Stage A cut of mission1.js lines 2489-2880 (docs/REFACTOR_MAP.md 5.4).
// Exports to M1 (9): activateGermansSequentially, afterParagraphChain, estimateHitChanceBreakdown, hitBreakdownHtml,
//       hitBreakdownText, noteContact, pendingContact, resetContactFlow, showSoldierInspector
// Uses from M1:
//   core: CHART, D, FC, GAct, GERMAN_ROSTER, Ops, Sched, V, germanInstanceId, img, paragraphHex, resolveGermanCardId,
//       state, terrainRowFor, terrainRowForTarget, vpRequirement, weaponById
//   present: Cues, d10, fmtSigned, infoPopup, logHeader, rollPopup
//   roster: findSoldier, kitHtml, makeCounter, renderVP, scrollMapTo
//   operations: pendingConditionChange, runConditionChange, runRoundsConditionChange
//   rounds: renderTrack, slotLabel, startActionRound
(function () {
  'use strict';
  var M1 = window.AmbushM1;
  // Exported functions (hoisted, so they are on M1 before any line below runs).
  M1.activateGermansSequentially = activateGermansSequentially; M1.afterParagraphChain = afterParagraphChain;
  M1.estimateHitChanceBreakdown = estimateHitChanceBreakdown; M1.hitBreakdownHtml = hitBreakdownHtml;
  M1.hitBreakdownText = hitBreakdownText; M1.noteContact = noteContact;
  M1.resetContactFlow = resetContactFlow; M1.showSoldierInspector = showSoldierInspector;
  // A real bug found live while testing Task #66: an `activate_german` effect can carry its own
  // `conditionChange` field (e.g. paragraph 289 — "activate Germans 9/15... go to Condition 3"),
  // set via the SAME ctx.setCondition hook a bare set_condition op uses (paragraphinterpreter.js).
  // The old code checked `activateEffects.length` and returned early on any match, so
  // `pendingConditionChange` — already set by that same paragraph's interpretation, moments
  // earlier — was never consumed at the point it was set. It stayed latent (this function is the
  // ONLY place that clears it) until some later, unrelated paragraph resolution happened to reach
  // the check, misattributing an old condition change to the wrong trigger and, if that unrelated
  // chain itself contained another activate_german+conditionChange combo, compounding — the
  // repeated "Condition changes to N" observed live traces to exactly this. Fixed by always
  // checking pendingConditionChange after the activation completes (or immediately if there was
  // none), rather than one branch silently skipping the other — both consequences of the SAME
  // paragraph should apply, not race.
  // ---- Contact terms (Phase 8c) ----------------------------------------------------------
  // A contact paragraph sets Round 1's terms (§6/1 Initiative exception, §6/5): the side with
  // the advantage, who is automatically aware, who gets 2 turns. Kept until Round 1's markers
  // are placed. During a Round they are ignored (§6/6: "Ignore those parts of the paragraph
  // dealing with advantage and US awareness"); a German's own 2 turns still apply there,
  // through insertMidRoundGermans.
  M1.pendingContact = null;
  function noteContact(mover, chain) {
    var terms = M1.Ops.contactTerms(chain.effects || []);
    if (!terms || M1.state.phase === 'round') return;
    terms.paragraph = chain.visited[chain.visited.length - 1];
    terms.awareIds = terms.awareSoldiers.map(function (id) { return id === 'mover' ? mover.id : id; });
    terms.germanIds = terms.germanTwoTurns.map(M1.germanInstanceId);
    M1.pendingContact = terms;
  }
  function afterParagraphChain(chain, next) {
    var activateEffects = chain.effects.filter(function (e) { return e.op === 'activate_german'; });
    function afterActivation() {
      if (M1.pendingConditionChange !== null) {
        var to = M1.pendingConditionChange;
        M1.pendingConditionChange = null;
        // §5/5: "Conditions always change from a lower number to a higher number." A second,
        // real bug found live alongside the one above: a Condition Change scan reads every
        // occupied hex's paragraph SYNCHRONOUSLY inside Ops.conditionChange, before any of those
        // chains are actually presented — so a later hex's set_condition can already be pending
        // by the time an EARLIER hex (in presentation order) finishes its own, unrelated,
        // empty-chain no-op and reaches this check first. That's a real ordering quirk, not
        // itself infinite — but a still-unexplained live repro kept re-requesting Condition 3
        // dozens of times in a row even after the ordering fix above. Rather than chase every
        // possible re-entrant path through paragraph interpretation with certainty, enforce the
        // rule's own invariant directly: a request that isn't actually an increase is a no-op.
        // This is correct per the rule text regardless of mechanism, and makes the recursion
        // structurally finite (Conditions run 1-6, so at most 5 real transitions are ever
        // possible) rather than relying on every caller getting pendingConditionChange's
        // lifecycle exactly right.
        if (to <= M1.state.opsState.condition) { next(); return; }
        // Task #66 (docs/41_CONDITION_CHANGE_ROUNDS.md): §5/5 vs §6/11 are triggered from the
        // same ctx.setCondition hook — this is the one place that already knows whether Rounds
        // are actually in progress (`phase === 'round'`) when the paragraph that requested the
        // change finishes, so it's the natural dispatch point rather than duplicating a phase
        // check at every caller of runParagraphCheck/runGermanParagraph/runEventPhase.
        if (M1.state.phase === 'round') M1.runRoundsConditionChange(to, next);
        else M1.runConditionChange(to, next);
        return;
      }
      next();
    }
    if (activateEffects.length) { activateGermansSequentially(activateEffects, 0, afterActivation); return; }
    afterActivation();
  }

  // Each German revealed gets its own pop-up (matching the "every step is a pop-up" default) and
  // scrolls the map to where it appeared — a German can activate at a fixed paragraph-specified
  // hex far from wherever the squad currently is (e.g. T8, the mission's own objective building,
  // is ~77% across / ~42% down the map from the A1-J1 entry edge), and there was previously no
  // way to know it had appeared off-screen. Real user report: "German troops appear... never do
  // anything... can't see them on map" — the German was correctly placed and correctly had no
  // line of sight to anyone yet, but nothing drew the player's attention to where it was.
  function activateGermansSequentially(effects, i, next, newIds) {
    newIds = newIds || [];
    if (i >= effects.length) {
      // A Move action's per-hex Paragraph Check can activate a German while a Round is already
      // in progress (e.g. moving into a hex whose paragraph triggers activate_german). §6/6: the
      // newly activated German is inserted directly into the CURRENT Round's AR Track (2-Turn
      // space if his paragraph says so, otherwise a fresh placement roll — either way using the
      // Round's own current advantage/disadvantage), with no effect on US awareness, via
      // insertMidRoundGermans below. Calling startActionRound(1) here instead would wipe the
      // in-progress round's AR Track and re-roll initiative for everyone — a real bug, not a
      // simplification. Only reset to Round 1 when we're not already mid-Round (Operations path).
      if (M1.state.phase === 'round') { insertMidRoundGermans(newIds, next); return; }
      M1.startActionRound(1); return;
    }
    var eff = effects[i];
    var ids = (eff.ids || []).slice();
    function revealNext() {
      if (!ids.length) { activateGermansSequentially(effects, i + 1, next, newIds); return; }
      var numericId = ids.shift();
      var cardId = M1.resolveGermanCardId(numericId);
      // Keyed by instance, not by card — see germanInstanceId. Two Germans sharing a substituted
      // card are two soldiers, and "already active" has to mean this one, not his stand-in twin.
      var instanceId = M1.germanInstanceId(numericId);
      if (M1.state.germans[instanceId] && M1.state.germans[instanceId].isActive) { revealNext(); return; } // already active
      // A German already activated once and since removed does not activate a second time: §2/1's
      // Activation VP is paid "regardless of what happens later with that German", so re-running
      // his activation would pay it twice for one soldier.
      if (M1.state.germans[instanceId]) { revealNext(); return; }
      var card = M1.GERMAN_ROSTER[cardId];
      var g = {
        id: instanceId, name: 'German (' + instanceId + ', ' + card.Role + ')', side: 'german', card: card,
        img: M1.img('soldiers/de_soldier_' + (M1.Sched.letterFromGermanCardId(cardId) || 'T') + '_crouching.png'),
        IN: parseInt(card.IN, 10) || 2, PC: parseInt(card.PC, 10) || 2, WS: parseInt(card.WS, 10) || 0,
        mpa: parseInt(card.MPA, 10) || 0,
        // eff.hex ("T-8", "Q-11", ...) is already a PRINTED hex id with a hyphen for readability —
        // confirmed against the paragraph prose itself ("activate German 25 in hex T-8" = map hex
        // T8). It is NOT the cartridge view-sleeve's 0-indexed row encoding, so
        // G.cartridgeIdToPrintedId() must never be applied here — that function silently produces
        // a wrong, off-by-one hex for any double-digit row (e.g. "Q-11" -> "Q12") and null for
        // single-digit rows, since it expects a zero-padded 2-digit cartridge row. REAL BUG, found
        // via a user report and confirmed by cross-referencing every real activate_german hex
        // against the paragraph text that names it.
        weaponId: guessGermanWeaponId(card), hexId: eff.hex ? M1.paragraphHex(eff.hex) : mapAnyHex(),
        stance: eff.stance || 'crouching', isCommander: false, wounded: false, status: 'unharmed', isActive: true,
        letter: M1.Sched.letterFromGermanCardId(cardId), specialReaction: eff.specialReaction || null,
        inventory: { ammoBoxes: new Array(guessGermanGrenadeCount(card)).fill('gren') },
        // Task #69 (docs/43_PREPARE_WEAPON.md): JUDGMENT CALL — a German never gets a scripted
        // "prepare" step anywhere in assets/data/german_action_programs.js, so a German who
        // shows up with a crew weapon (e.g. Light Machinegun) is treated as already having it
        // ready, rather than inventing an unmodelled AI behavior that would otherwise leave him
        // permanently unable to fire it.
        weaponPrepared: true,
        // §6/6: "if the paragraph states that the German receives two turns" — set by 180, 183,
        // 197, 319, 331 and 337 (Phase 8c). Read here when he joins a Round already under way;
        // at a contact, Round 1's placement reads the chain's contact terms instead.
        receivesTwoTurns: !!eff.receivesTwoTurns,
      };
      // Remembered for germanactions.js's `in_activation_hex` condition (paragraph 919 branches
      // on whether the German is still standing where he was activated).
      g.activationHexId = g.hexId;
      M1.state.germans[instanceId] = g;
      newIds.push(cardId);
      M1.logHeader('German activated: ' + g.name + ' at ' + g.hexId + '.');
      M1.Cues.banner('activation', 'German Activated', (card.Role ? card.Role + ' · ' : '') + g.hexId);
      M1.Cues.kranz(Object.keys(M1.state.germans).length > 1 ? 'smug' : 'confident', '<b>Achtung!</b> ' + g.name +
        ' takes his post at <b>' + g.hexId + '</b>. From now on he acts by his own card. He is worth <b>' + M1.V.germanActivationVP(card.VP) +
        ' VP</b> to you for showing himself (&sect;2/1); enjoy them.', g.id);
      presentActivation(g, card, numericId, revealNext);
    }
    revealNext();
  }

  // §6/6, second half: once every German named by this batch of activation effects has been
  // revealed and placed on the map (presentActivation, above), insert each newly-activated one
  // into the CURRENT Round's already-in-progress AR Track — one placement roll popup per German,
  // matching placeMarkersChain's own Initiative Roll popup shape. No effect on US awareness
  // (§6/6): this never touches the Awareness Phase or any soldier's `aware` flag.
  function insertMidRoundGermans(ids, next) {
    function step(idx) {
      if (idx >= ids.length) { M1.renderTrack(); next(); return; }
      var g = M1.state.germans[ids[idx]];
      var entry = { id: g.id, IN: g.IN, hexId: g.hexId, letter: g.letter, isCommander: false, receivesTwoTurns: g.receivesTwoTurns };
      if (g.receivesTwoTurns) {
        var result = M1.Sched.insertMidRoundGerman(M1.state.track, entry, { arTrack: window.AMBUSH_AR_TRACK });
        M1.infoPopup({
          actor: g, title: 'Mid-Round Activation &mdash; AR Track',
          bodyHtml: g.name + ' joins the current Round&rsquo;s Action Round Track in the <b>' + M1.slotLabel(result.slot) + '</b> space (&sect;6/6, receives two turns). No effect on US awareness.',
          logHtml: 'Mid-Round activation for ' + g.name + ': placed directly in ' + M1.slotLabel(result.slot) + ' (two turns).',
        }, function () { step(idx + 1); });
        return;
      }
      var roll = M1.d10();
      var result2 = M1.Sched.insertMidRoundGerman(M1.state.track, entry, { rollDie: function () { return roll; }, arTrack: window.AMBUSH_AR_TRACK });
      M1.rollPopup({
        actor: g, title: 'Mid-Round Activation &mdash; AR Track', kind: 'single', presetValue: roll,
        contextHtml: g.name + ' (IN ' + g.IN + ') joins the current Round&rsquo;s Action Round Track (&sect;6/6). No effect on US awareness.',
        explain: function () {
          return 'Rolls <b>' + roll + '</b> &rarr; ' + (result2.inserted
            ? 'placed in <b>' + M1.slotLabel(result2.slot) + '</b> &mdash; will act later this Round.'
            : 'his slot has already passed this Round &mdash; placed in <b>Complete</b>, acts starting next Round.');
        },
        logText: function () {
          return 'Mid-Round activation for ' + g.name + ': <span class="roll">' + roll + '</span> &rarr; ' + M1.slotLabel(result2.slot) +
            (result2.inserted ? '' : ' (slot already passed)') + '.';
        },
      }, function () { step(idx + 1); });
    }
    step(0);
  }

  // §6/2's activation procedure, one pop-up per step, in the rulebook's own order. Previously all
  // of this happened silently behind a single "German Revealed!" message — the card was never
  // shown, the Activation VP was never awarded at all, and the counter/AR-marker placements were
  // invisible. Real user report: "these steps are not available when I start combat with German
  // troop. I expect to go through all these steps visually."
  function presentActivation(g, card, numericId, done) {
    // Step 1 — "Find Soldier's Card with that identity number and place it in front of you."
    M1.infoPopup({
      actor: g, title: 'German Activated — Card ' + card['Card ID'], variant: 'wide',
      bodyHtml: germanCardHtml(card, numericId),
      logHtml: 'German card <b>' + card['Card ID'] + '</b> (' + card.Role + ') drawn.',
    }, step2);

    // Step 2 — "Add Victory Points the soldier has on his card to your Squad Sheet." §2/1: this
    // is the Activation award, kept "regardless of what happens later with that German."
    function step2() {
      var award = M1.V.germanActivationVP(card.VP);
      M1.state.vpState.germanActivations.push({ cardId: g.id, vpText: card.VP || '' });
      M1.renderVP();
      var totals = M1.V.computeVPTotal(M1.state.vpState);
      var conditional = M1.V.parseGermanVP(card.VP || '').conditional;
      M1.infoPopup({
        actor: g, title: 'Victory Points Awarded',
        bodyHtml: '<b>+' + award + ' VP</b> for activating ' + card['Card ID'] + '. You keep this regardless of what happens to him later (&sect;2/1).' +
          (conditional ? '<br><br>His card also carries a conditional award: <b>+' + conditional.amount + ' VP if ' + conditional.trigger + '</b>.' : '') +
          '<br><br>Squad total is now <b>' + totals.total + ' VP</b> (need ' + M1.vpRequirement() + ').',
        logHtml: 'Activation award: <b>+' + award + ' VP</b> (' + card['Card ID'] + ') &rarr; total ' + totals.total + '.',
      }, step3);
    }

    // Step 3 — "On the map place a Soldier counter with that letter in the Hex listed in the
    // Paragraph to show where the Soldier is." Scrolls there too: an activation hex can be far
    // from the squad, and a counter placed off-screen reads as nothing having happened.
    function step3() {
      M1.makeCounter(g, g.hexId);
      M1.scrollMapTo(g.hexId);
      M1.infoPopup({
        actor: g, title: 'Counter Placed',
        bodyHtml: 'Counter <b>' + (g.letter || '?') + '</b> is placed in hex <b>' + g.hexId + '</b>, ' + g.stance + '. The map has scrolled to show him.',
        logHtml: 'Counter <b>' + (g.letter || '?') + '</b> placed at ' + g.hexId + '.',
      }, step4);
    }

    // Step 4 — "locate the Soldier's Action Round Marker with matching identity letter and place
    // it in the Complete space on the Action Round Track." The marker is chosen by the IN rating
    // printed on his card. Our AR Track is rebuilt from every active German at the start of each
    // Round, so Complete is genuinely where he sits until that placement happens.
    function step4() {
      M1.infoPopup({
        actor: g, title: 'Action Round Marker',
        bodyHtml: 'Action Round marker <b>' + (g.letter || '?') + '</b> (Initiative <b>' + g.IN + '</b>, from his card) goes in the <b>Complete</b> space. ' +
          'He takes no action until markers are placed for the coming Round.',
        logHtml: 'AR marker <b>' + (g.letter || '?') + '</b> (IN ' + g.IN + ') placed in Complete.',
      }, done);
    }
  }

  // The German's card as the player would see it laid out in front of them (§6/2 step 1).
  function germanCardHtml(card, numericId) {
    var rows = [
      ['Identity', card['Card ID'] + (numericId ? ' (number ' + numericId + ')' : '')],
      ['Counter letter', M1.Sched.letterFromGermanCardId(card['Card ID']) || '—'],
      ['Type', card.Role || '—'],
      ['Victory Points', card.VP || '—'],
      ['Initiative (IN)', card.IN], ['Perception (PC)', card.PC],
      ['Weapon Skill (WS)', card.WS], ['Movement (MPA)', card.MPA],
      ['Equipment', card.Equipment || '—'],
    ];
    var html = '<div class="gcard">' + rows.map(function (r) {
      return '<div class="gcard-row"><span>' + r[0] + '</span><b>' + (r[1] === undefined || r[1] === '' ? '—' : r[1]) + '</b></div>';
    }).join('') + '</div>';
    if (card.Notes) html += '<div class="gcard-notes"><span>Notes</span>' + card.Notes + '</div>';
    return html;
  }

  // Glossary hover tooltips — reusable infrastructure, not just the Inspector: pass a stat code
  // (IN/PC/WS/MPA) and get back a <span class="tt" data-tip="..."> that the .tt CSS rule (see
  // mission1.html) turns into a hover/focus tooltip. Text matches the Inspector's original
  // "What these mean" explanation verbatim, now attached to the term itself instead of always
  // being on screen. `isGerman` only changes the IN text (US soldiers additionally use IN for
  // Command reach and squad-gen Perception quality; Germans don't).
  function statTip(code, isGerman) {
    switch (code) {
      case 'IN': return 'How many turns he gets on the Action Round Track and whether he panics' +
        (isGerman ? '' : '; for US soldiers, also Command reach and squad-gen Perception quality') + '.';
      case 'PC': return 'Perception. A Perception Check succeeds on a roll at or under this number.';
      case 'WS': return 'Weapon Skill, added straight into Hit Chance when firing, throwing, clearing a jam, or assaulting.';
      case 'MPA': return 'The most hexes/Movement Points he can spend in one Rounds move (Operations movement is untimed, so this only matters once Rounds start).';
      default: return '';
    }
  }
  function termSpan(label, tip) {
    if (!tip) return '<span>' + label + '</span>';
    return '<span class="tt" tabindex="0" data-tip="' + tip.replace(/"/g, '&quot;') + '">' + label + '</span>';
  }

  // Hit Chance breakdown tooltips — the fire-combat equivalent of statTip, and the direct answer
  // to the user report that started this feature: "Base 4 (med) -3 terrain, -1 WS, -2 snap ->
  // Hit Chance 0" reads as a bug until you can see what each term means. Reused by both the
  // target picker's odds preview (a single plain-text summary, since attr()-based tooltips can't
  // nest HTML) and the Hit Chance & To-Hit roll popup (full version, each term independently
  // hoverable).
  function baseHitTip(band) {
    return 'The starting Hit Chance for this weapon at ' + band + ' range, straight off the Fire Chart before any modifiers.';
  }
  function terrainHitTip() {
    return "How much the target's terrain and stance change your chance to hit -- cover and a lower stance (crouching or prone) make him harder to hit. Same table as the Inspector's stance/exposure numbers.";
  }
  function easyModTip(mod) {
    return mod > 0
      ? 'Easy mode gives your soldiers +1 to Hit Chance. Shown here so the arithmetic still adds up on screen.'
      : 'Easy mode gives German fire -1 to Hit Chance. Shown here so the arithmetic still adds up on screen.';
  }
  function snapHitTip() {
    return 'Firing without aiming first. Faster (you keep the rest of your action) but always -2 to Hit Chance. Aimed fire skips this penalty but costs your whole action.';
  }
  function estimateHitChanceBreakdown(firer, target, fireType) {
    var weapon = M1.weaponById(firer.weaponId);
    var band = M1.FC.resolveRangeBand(weapon, M1.FC.hexDistance(firer.hexId, target.hexId));
    if (!band) return null;
    var baseHit = M1.CHART.BASE_HIT[band];
    var terrainMod = M1.FC.resolveTerrainMod(M1.CHART.FIRE_MODS_TERRAIN, M1.terrainRowForTarget(firer, target), target.stance);
    var otherMods = firer.status === 'wounded' ? [-1] : [];
    // Easy mode's handicap rides in as an ordinary modifier rather than a post-hoc adjustment, so
    // it clamps with everything else (§9/1 step 4) and shows up in the breakdown as its own term.
    var easyMod = M1.D.hitChanceMod(M1.state.difficulty, firer.side);
    if (easyMod) otherMods.push(easyMod);
    var clamped = M1.FC.computeFinalHitChance({ baseHit: baseHit, terrainMod: terrainMod, fireType: fireType, weaponSkill: firer.WS, otherMods: otherMods }).clamped;
    return { baseHit: baseHit, band: band, terrainMod: terrainMod, ws: firer.WS, fireType: fireType, easyMod: easyMod, clamped: clamped };
  }
  function hitBreakdownHtml(b) {
    return termSpan('Base ' + b.baseHit + ' (' + b.band + ')', baseHitTip(b.band)) + ' ' +
      termSpan(M1.fmtSigned(b.terrainMod) + ' terrain', terrainHitTip()) + ', ' +
      termSpan(M1.fmtSigned(b.ws) + ' WS', statTip('WS')) +
      (b.fireType === 'snap' ? ', ' + termSpan('&minus;2 snap', snapHitTip()) : '') +
      (b.easyMod ? ', ' + termSpan(M1.fmtSigned(b.easyMod) + ' easy mode', easyModTip(b.easyMod)) : '') +
      ' &rarr; Hit Chance <b>' + b.clamped + '</b>.';
  }
  function hitBreakdownText(b) {
    return 'Base ' + b.baseHit + ' (' + b.band + ' range) ' + M1.fmtSigned(b.terrainMod) + ' terrain, ' + M1.fmtSigned(b.ws) + ' WS' +
      (b.fireType === 'snap' ? ', -2 snap' : '') + (b.easyMod ? ', ' + M1.fmtSigned(b.easyMod) + ' easy mode' : '') +
      ' -> Hit Chance ' + b.clamped + '.';
  }

  // Soldier Inspector — click any soldier or German counter, in Operations OR Rounds, to see a
  // full plain-language breakdown of what his stats mean, how exposed his current terrain/stance
  // leaves him, and what he's carrying. Read-only, no state change — reuses the exact same
  // .gcard/.gcard-row/.gcard-notes styling germanCardHtml already established, since it's the
  // same "key facts + explanatory notes" shape. Answers a direct user request: "I need more
  // information to make decisions" after finding the game's combat unforgiving.
  function showSoldierInspector(id) {
    var s = M1.findSoldier(id);
    if (!s) return;
    var isGerman = s.side === 'german';
    var terrainRow = M1.CHART.FIRE_MODS_TERRAIN[M1.terrainRowFor(s.hexId)];
    var stances = ['standing', 'crouching', 'prone'];
    var stanceHtml = stances.map(function (st, i) {
      var mod = terrainRow.mods[i];
      var cur = st === s.stance ? ' current' : '';
      return '<div class="stance-cell' + cur + '"><b>' + st + '</b><span>' +
        (mod === null || mod === undefined ? 'n/a' : M1.fmtSigned(mod)) + '</span></div>';
    }).join('');

    var statRows = [
      ['IN', 'Initiative (IN)', s.IN], ['PC', 'Perception (PC)', s.PC],
      ['WS', 'Weapon Skill (WS)', M1.fmtSigned(s.WS)], ['MPA', 'Movement (MPA)', s.mpa],
    ];
    var gcard = '<div class="gcard">' + statRows.map(function (r) {
      return '<div class="gcard-row">' + termSpan(r[1], statTip(r[0], isGerman)) + '<b>' + r[2] + '</b></div>';
    }).join('') + '</div>';

    var terrainNotes = '<div class="gcard-notes"><span>Terrain &amp; exposure &mdash; ' + (terrainRow.loc || 'unknown') + '</span>' +
      'How exposed he is to enemy fire in each stance, right here (higher = easier to hit; his current stance is highlighted).' +
      '<div class="stance-table">' + stanceHtml + '</div></div>';

    var equipNotes = '<div class="gcard-notes"><span>Carrying</span>' + M1.kitHtml(s) + '</div>';

    // solo: a fresh card each time, so clicking him again never stacks a second copy (Wan, 2026-10-25)
    M1.infoPopup({
      actor: s, variant: 'wide', solo: true,
      title: s.name + (s.isCommander ? ' — Commander' : '') + (s.status && s.status !== 'unharmed' ? ' — ' + s.status : ''),
      bodyHtml: gcard + terrainNotes + equipNotes,
      logHtml: s.name + ' inspected.',
    });
  }
  // Delegates to the pure, tested mapping in germanactions.js (see its own comment for the four
  // bugs the old inline version carried). Kept as a named wrapper so the activation code reads the
  // same as before and the mapping has one home.
  function guessGermanWeaponId(card) {
    return M1.GAct.weaponIdForCard(card);
  }
  // Task #63 (docs/35_GRENADE_COMBAT.md): Germans get no full Port Box model (docs/33_PORT_BOX.md
  // — "driven by their cards, not a Squad Record"), but their card's own Equipment text ("Bolt
  // Rifle; 2 Grenades") already states a real grenade count, so a lightweight Ammo-Box-only
  // inventory (just enough for EQ.hasGrenade/expendGrenade — those two functions only ever touch
  // `.ammoBoxes`) is read from it rather than invented.
  function guessGermanGrenadeCount(card) {
    var eq = card.Equipment || '';
    var m = /(\d+)\s*Grenades?/i.exec(eq);
    if (m) return parseInt(m[1], 10);
    return /Grenade/i.test(eq) ? 1 : 0;
  }
  function mapAnyHex() { return 'M10'; }


  // Bug 13: a contact paragraph's Round 1 terms belong to the position that rolled them. A load
  // (applySavedState) drops them, so they are never applied to a Round 1 they did not start.
  function resetContactFlow() { M1.pendingContact = null; }
})();

// mission1/german.js (10 of 13) — German turn, German actions, German movement by reference. Stage A cut of mission1.js lines 4135-4733 (docs/REFACTOR_MAP.md 5.4).
// Exports to M1 (1): germanAutoTurn
// Uses from M1:
//   core: AR, Asl, CW, EQ, FC, G, GAct, GERMAN_ACTION_PROGRAMS, M, MISSION_CARDS_MOVEMENT, PARAGRAPHS, REAL_TERRAIN,
//       Sched, TERRAIN_LABELS, TERRAIN_ROW, crewFireAvailability, crewFiredThisRound, crewWeaponStanceOk,
//       edgeFeatureBetween, isCrewWeapon, losClearBetween, state, unprepareWeaponOnMove, weaponById, weaponUsable
//   present: Cues, FX, d10, fmtSigned, infoPopup, rollPopup
//   info: Info
//   roster: activeGermans, activeUS, counterEls, equipmentName, findSoldier, nameFor, placeEl, renderRoster,
//       renderVP, scrollMapTo, updateCounterVisual
//   operations: pendingConditionChange, runParagraphCheck
//   rounds: driveNext, renderTrack, visibleEnemyTargets
//   verbs: clearJamRoll, estimateHitChance, grenadeCandidates
//   combat: applyCapture, assaultChain, checkEndingConditions, fireChain, grenadeChain
(function () {
  'use strict';
  var M1 = window.AmbushM1;
  // Exported functions (hoisted, so they are on M1 before any line below runs).
  M1.germanAutoTurn = germanAutoTurn;
  // §6/8 step 1: "Cross-reference the current Action Number with the current Condition to obtain
  // a German Action Paragraph number." The lookup was always real; what's new is that the
  // resulting paragraph is now actually READ AND CARRIED OUT (§6/8 step 3) instead of being
  // displayed and discarded while the German unconditionally aim-fired at the best target.
  // opts.ignoreSelfPreservation (Task #73, docs/47_SPECIAL_REACTIONS.md): §6/8 paragraph 816's
  // own instruction — "Ignore the self-preservation Reaction. Roll for a new German Action
  // Number..." — a one-time override for just this re-roll, distinct from (and layered on top
  // of) every other self-preservation trigger below.
  function germanAutoTurn(opts) {
    var g = M1.findSoldier(M1.state.currentActorId);
    var ignoreSelfPreservation = !!(opts && opts.ignoreSelfPreservation);
    // §11/4 / §6/8: the Self-Preservation column applies "whenever the German is in a hex occupied
    // or adjacent to an active US soldier, regardless of LOS". §11/2 (Task #72): a freed former
    // prisoner uses it unconditionally "for the rest of the mission" instead — `g.forcedSelfPreservation`
    // short-circuits the normal proximity check rather than replacing it, so every other German's
    // behavior is unaffected. §6/8 Special Reactions (Task #73): "unless specifically noted...
    // in a paragraph" — some Special Reactions (e.g. paragraph 707's Reaction Y) explicitly say
    // the German ignores self-preservation while that Reaction is in effect; that's
    // `g.specialReactionIgnoresSelfPreservation`, set alongside `g.specialReaction` by
    // set_special_reaction below, and it only suppresses the ordinary proximity trigger, never
    // the forced-forever case above.
    var selfPreservationActive = !ignoreSelfPreservation && (
      !!g.forcedSelfPreservation ||
      (!(g.specialReaction && g.specialReactionIgnoresSelfPreservation) &&
        M1.activeUS().some(function (s) { return M1.FC.hexDistance(g.hexId, s.hexId) <= 1; }))
    );
    // A card only carries columns for the Conditions its scenario expects (GE 33/V, for instance,
    // has CONDITION 4 and SPECIAL S and nothing else). If the mission is in a Condition his card
    // doesn't cover, that's a scenario/data mismatch rather than a rules question — fall back to
    // the nearest Condition column the card DOES have and say so, instead of leaving the German
    // inert with no explanation.
    function lookup(roll) {
      var cond = M1.state.opsState ? M1.state.opsState.condition : 1;
      var opts = { selfPreservationActive: selfPreservationActive, specialReaction: g.specialReaction };
      try { return M1.AR.resolveGermanActionParagraph(g.card, roll, cond, opts); } catch (e) { /* fall through */ }
      var available = ((g.card.table && g.card.table.columns) || [])
        .map(function (c) { return /^CONDITION\s+(\d+)/i.exec(c); })
        .filter(Boolean).map(function (m) { return parseInt(m[1], 10); });
      if (!available.length) return null;
      var nearest = available.reduce(function (best, c) { return Math.abs(c - cond) < Math.abs(best - cond) ? c : best; }, available[0]);
      try {
        var res = M1.AR.resolveGermanActionParagraph(g.card, roll, nearest, opts);
        res.fallbackFrom = cond; res.fallbackTo = nearest;
        return res;
      } catch (e2) { return null; }
    }
    // WHY this column, not just which. arrules.js says which of the three rules fired and what it
    // displaced; naming the US soldier who triggered self-preservation needs the board, so that
    // half is finished here. Without this the player watches a paragraph number appear out of a
    // die roll with no way to tell a Self-Preservation reaction from an ordinary Condition lookup.
    function columnReasonHtml(res) {
      var r = res && res.reason;
      if (!r) return '';
      if (r.rule === 'self_preservation') {
        var why;
        if (g.forcedSelfPreservation) {
          why = 'he was freed after being captured, so he uses Self-Preservation for the rest of the mission (&sect;11/2)';
        } else {
          var near = M1.activeUS().filter(function (s) { return M1.FC.hexDistance(g.hexId, s.hexId) <= 1; });
          why = near.length
            ? M1.nameFor(near[0].id) + ' is ' + (near[0].hexId === g.hexId ? 'in his hex' : 'adjacent') +
              ' at ' + near[0].hexId + (near.length > 1 ? ' (and ' + (near.length - 1) + ' more)' : '') +
              ', regardless of line of sight (&sect;11/4)'
            : 'a US soldier is in or adjacent to his hex (&sect;11/4)';
        }
        return '<br><b>Self-Preservation:</b> ' + why + ', so the <b>SPECIAL S</b> column overrides ' + r.overrides + '.';
      }
      if (r.rule === 'special_reaction') {
        return '<br><b>Special Reaction ' + r.letter + '</b> is in effect, so its column is used instead of ' + r.overrides + ' (&sect;6/8)' +
          (g.specialReactionIgnoresSelfPreservation ? ', and it suppresses self-preservation while it lasts' : '') + '.';
      }
      // On the fallback path `r.condition` is the column the card actually has, NOT the mission's
      // Condition — calling it "the current Condition" there would state something false. The
      // amber note above already names both, so this just stops short of repeating it wrongly.
      if (res.fallbackTo) {
        return '<br>No Self-Preservation trigger and no Special Reaction in effect, so a Condition column applies.';
      }
      return '<br>No Self-Preservation trigger and no Special Reaction in effect, so the mission\u2019s current <b>Condition ' + r.condition + '</b> column applies.';
    }
    function columnReasonText(res) {
      var r = res && res.reason;
      if (!r) return '';
      if (r.rule === 'self_preservation') return ' [Self-Preservation over ' + r.overrides + ']';
      if (r.rule === 'special_reaction') return ' [Special Reaction ' + r.letter + ' over ' + r.overrides + ']';
      return res.fallbackTo ? '' : ' [Condition ' + r.condition + ']'; // the fallback note says it
    }
    M1.rollPopup({
      actor: g, title: 'German Action Number', kind: 'single',
      contextHtml: g.name + ' rolls for his Action Number.',
      explain: function (roll) {
        var res = lookup(roll);
        if (!res) return 'His card has no entry for this roll in the current Condition &mdash; he holds position.';
        return 'Column <b>' + res.column + '</b> &rarr; paragraph <b>' + res.paragraph + '</b>.' +
          (res.fallbackTo ? ' <span style="color:var(--amber);">(card has no Condition ' + res.fallbackFrom + ' column &mdash; using its Condition ' + res.fallbackTo + ' column)</span>' : '') +
          columnReasonHtml(res);
      },
      // v3 Phase 4b: a column forced by Self-Preservation or a Special Reaction is a notable
      // moment; Kranz says the same reason the card line gives.
      fxLanded: function (roll) {
        var res = lookup(roll), r = res && res.reason;
        if (!r || (r.rule !== 'self_preservation' && r.rule !== 'special_reaction')) return;
        var why = columnReasonHtml(res).replace(/^<br>/, '');
        if (r.rule === 'self_preservation') M1.Cues.kranz('alarmed', '<b>Zu nah!</b> ' + g.name + ' reads paragraph ' + res.paragraph + '. ' + why, g.id);
        else M1.Cues.kranz('confident', '<b>Jawohl.</b> ' + g.name + ' reads paragraph ' + res.paragraph + '. ' + why, g.id);
      },
      logText: function (roll) {
        var res = lookup(roll);
        return 'German Action Number for ' + g.name + ': <span class="roll">' + roll + '</span> &rarr; ' +
          (res ? res.paragraph + columnReasonText(res) + (res.fallbackTo ? ' (via Condition ' + res.fallbackTo + ' column)' : '') : 'no card entry');
      },
    }, function (roll) {
      var res = lookup(roll);
      if (!res) {
        M1.infoPopup({ actor: g, title: 'No Orders', bodyHtml: g.name + '’s card has no Action column covering the current Condition, so he has no instructions this turn and holds position.' }, function () { finishGermanTurn(g); });
        return;
      }
      runGermanParagraph(g, res.paragraph);
    });
  }

  // Snapshot of everything germanactions.js's conditions can ask about, read fresh at the moment
  // the German acts (his instructions are evaluated against the situation in front of him).
  function germanSituation(g) {
    var visible = M1.visibleEnemyTargets(g);
    var terrainKey = M1.REAL_TERRAIN[g.hexId];
    var openish = { clear1: 1, clear2: 1, clear3: 1, road: 1, dirt_road: 1, bridge: 1, ford: 1, stream: 1, railroad: 1 };
    var terrain = terrainKey === 'building' || terrainKey === 'second_story' || terrainKey === 'interior' ? 'building'
      : terrainKey === 'woods' ? 'woods'
      : openish[terrainKey] ? 'open' : 'other';
    return {
      targetsInSight: visible.length,
      targetsInHex: M1.activeUS().filter(function (s) { return s.hexId === g.hexId; }).length,
      targetsWithin: function (n) { return M1.activeUS().filter(function (s) { return M1.FC.hexDistance(g.hexId, s.hexId) <= n && M1.losClearBetween(g, s); }).length; },
      inUsSight: M1.activeUS().some(function (s) { return M1.losClearBetween(s, g); }),
      terrain: terrain,
      inActivationHex: g.hexId === g.activationHexId,
      germansSameOrAdjacent: M1.activeGermans().filter(function (o) { return o.id !== g.id && M1.FC.hexDistance(g.hexId, o.hexId) <= 1; }).length,
      germansWithinTwo: M1.activeGermans().filter(function (o) { return o.id !== g.id && M1.FC.hexDistance(g.hexId, o.hexId) <= 2; }).length,
      germansLost: M1.state.vpState.germanDefeats.length,
      usOccupiesHex: function (hex) { return M1.activeUS().some(function (s) { return s.hexId === hex; }); },
      // Task #63 (docs/35_GRENADE_COMBAT.md): real, from the German's own lightweight grenade
      // inventory (see guessGermanGrenadeCount) — no longer hardcoded false.
      hasGrenade: !!(g.inventory && M1.EQ.hasGrenade(g.inventory)),
      // §7/3 "traversable hexside" (paragraph 833 option 2). A wall cannot be crossed at any
      // cost; an aperture can, at +1 MP, so a window or doorway is traversable. Un-modelled until
      // Map A's buildings gave the map any hexsides at all (docs/53) — before that this was the
      // whole reason 833 carried a `bespoke` stub.
      adjacentTraversableTargets: adjacentTraversableUS(g).length,
      germanInAdjacentTargetHex: adjacentTraversableUS(g).some(function (s) {
        return M1.activeGermans().some(function (o) { return o.id !== g.id && o.hexId === s.hexId; });
      }),
      freeStanceChange: !g.wounded, // §6/7: "Wounded soldiers never receive a free stance change."
    };
  }
  // Active US soldiers in a hex adjacent to `g` that he could actually reach — i.e. not walled off.
  function adjacentTraversableUS(g) {
    return M1.activeUS().filter(function (s) {
      if (M1.FC.hexDistance(g.hexId, s.hexId) !== 1) return false;
      return M1.M.hexsideCost(M1.edgeFeatureBetween(g.hexId, s.hexId)) !== Infinity;
    });
  }

  // A German Action Paragraph is shown to the player in full, options and all, and then the German
  // acts — with nothing saying WHICH option applied to him. germanactions.js now records the case
  // it took and renders the test as a clause; this turns that into the line under the paragraph
  // text. Chained paragraphs ("see 802") each contribute their own decision, so they are labelled
  // by paragraph when more than one paragraph was involved.
  function decisionsHtml(resolved) {
    if (!resolved.decisions || !resolved.decisions.length) return '';
    var multi = resolved.visited.length > 1;
    var rows = resolved.decisions.map(function (d) {
      var where = multi ? 'Paragraph ' + d.paragraph + ' &mdash; ' : '';
      if (d.option === null) {
        return '<div>' + where + '<b>no option applied</b> (none of the ' + d.of + ' matched his situation), so he reads on.</div>';
      }
      if (d.catchAll) {
        var earlier = d.of - 1;
        return '<div>' + where + (earlier === 1 ? 'the first option did not match' : 'none of the first ' + earlier + ' options matched') +
          ', so the catch-all <b>option ' + d.option + ' of ' + d.of + '</b> applies.</div>';
      }
      return '<div>' + where + '<b>option ' + d.option + ' of ' + d.of + '</b> applies: ' + d.because + '.</div>';
    });
    return '<div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--panel-border); color:var(--amber);">' +
      '<b>His situation:</b>' + rows.join('') + '</div>';
  }
  function decisionsText(resolved) {
    return (resolved.decisions || []).map(function (d) {
      if (d.option === null) return 'no option applied';
      if (d.catchAll) return 'option ' + d.option + '/' + d.of + ' (catch-all)';
      return 'option ' + d.option + '/' + d.of + ' (' + d.because + ')';
    }).join('; ');
  }
  // v3 Phase 4b: a German reaching for a grenade is a notable moment; Kranz reads out the option
  // of his paragraph that sent him to it (germanactions.js's own clause).
  function kranzOnGrenade(g, paragraphNum, resolved) {
    if (!(resolved.actions || []).some(function (a) { return a.action === 'grenade'; })) return;
    if (!(g.inventory && M1.EQ.hasGrenade(g.inventory))) return;
    var d = (resolved.decisions || []).filter(function (x) { return x.option !== null && x.because; }).pop();
    M1.Cues.kranz('smug', '<b>Granate!</b> ' + g.name + ' throws. ' + (d
      ? 'Paragraph ' + d.paragraph + ', option ' + d.option + ' of ' + d.of + ': ' + d.because + '.'
      : 'Paragraph ' + paragraphNum + ' tells him to.'), g.id);
  }
  function runGermanParagraph(g, paragraphNum) {
    var resolved = M1.GAct.resolve(paragraphNum, M1.GERMAN_ACTION_PROGRAMS, germanSituation(g));
    var text = M1.PARAGRAPHS[String(paragraphNum)];
    var picked = decisionsText(resolved);
    M1.Info.noteReason(g, 'paragraph ' + paragraphNum + (picked ? ' &mdash; ' + picked : ''));
    var fullHtml = (text || '(no text on file)').replace(/¥/g, '&bull;').replace(/_x000B_/g, '<br>') + decisionsHtml(resolved);
    M1.infoPopup({
      actor: g, title: 'Paragraph ' + paragraphNum, variant: 'wide', bodyIsParagraph: true,
      bodyHtml: fullHtml,
      // Resolution cards (Gate 0 answer 1): one line on the card and in the radio log, the
      // paragraph and the option that applied behind the log line's "why".
      cardHtml: 'Reads paragraph <b>' + paragraphNum + '</b>' + (picked ? ' &mdash; ' + picked : '') + '.',
      logDetailHtml: fullHtml,
      fx: function () { kranzOnGrenade(g, paragraphNum, resolved); },
      logHtml: g.name + ' reads paragraph <b>' + paragraphNum + '</b>' + (resolved.visited.length > 1 ? ' (&rarr; ' + resolved.visited.slice(1).join(' &rarr; ') + ')' : '') +
        (picked ? ' &mdash; ' + picked : '') + '.',
    }, function () { performGermanActions(g, resolved.actions, 0); });
  }

  // Carries out the resolved actions in order, one pop-up each, stopping if the mission ends.
  function performGermanActions(g, actions, i) {
    if (M1.state.phase === 'over') return;
    if (i >= actions.length || !g.isActive) { finishGermanTurn(g); return; }
    var a = actions[i];
    var next = function () { performGermanActions(g, actions, i + 1); };

    if (a.action === 'stance') {
      if (g.stance === a.to) { next(); return; }
      g.stance = a.to;
      M1.updateCounterVisual(g);
      M1.infoPopup({ actor: g, title: 'Stance', bodyHtml: g.name + ' goes <b>' + a.to + '</b>.',
        fx: function () { M1.FX.badge(g.hexId, a.to.toUpperCase(), 'neutral'); } }, next);
      return;
    }
    if (a.action === 'fire') {
      // §9/4: "A German with a jammed weapon will use his second weapon, if he has one; otherwise,
      // he will attempt to unjam his weapon. When a German Action Paragraph requires him to fire,
      // he attempts to unjam his weapon instead." Both halves are real now; this used to be a
      // loud stub that fired about twice a game (docs/52's pacing count is what flagged it).
      if (!M1.weaponUsable(g)) {
        var second = !g.usedSecondWeapon && M1.GAct.secondWeaponIdForCard(g.card);
        if (second) {
          // The switch is permanent for the rest of the mission: the jammed primary is not
          // magically un-jammed by drawing a pistol, and `usedSecondWeapon` stops him switching
          // again when the pistol itself jams.
          g.usedSecondWeapon = true;
          var wasJammed = g.weaponJammed, brokenWeapon = M1.weaponById(g.weaponId);
          g.weaponId = second;
          g.weaponJammed = false; g.weaponBroken = false; g.weaponPrepared = true;
          M1.infoPopup({
            actor: g, title: 'Second Weapon',
            bodyHtml: g.name + '\u2019s ' + brokenWeapon.name + ' is ' + (wasJammed ? 'jammed' : 'broken') +
              ', so he draws his ' + M1.equipmentName(second) + ' &mdash; \u00a79/4: "a German with a jammed weapon will use his second weapon, if he has one".',
            logHtml: g.name + ' switches to his ' + M1.equipmentName(second) + ' (&sect;9/4 second weapon).',
            // Re-enter the SAME action index rather than building a one-off chain: the fire
            // branch simply runs again, now with a usable weapon, and the rest of the paragraph's
            // actions still follow.
          }, function () { performGermanActions(g, actions, i); });
          return;
        }
        if (g.weaponJammed && !g.weaponBroken) {
          // "...he attempts to unjam his weapon instead" — the same procedure the player uses,
          // so it goes through the same resolver rather than a German-only copy of it.
          M1.infoPopup({
            actor: g, title: 'Unjam Instead of Fire',
            bodyHtml: g.name + ' is ordered to fire, but his ' + M1.weaponById(g.weaponId).name +
              ' is jammed and he has no second weapon. &sect;9/4: he attempts to unjam it instead.',
            logHtml: g.name + ': ordered to fire with a jammed weapon and no second weapon &mdash; attempts to unjam (&sect;9/4).',
          }, function () { M1.clearJamRoll(g, next); });
          return;
        }
        // Genuinely weaponless: broken, or an unarmed card. §9/4's "acquire a weapon from another
        // German or inactive US soldier in his hex" is the remaining unmodelled branch, and it
        // needs the German-side Pick Up/Exchange action that does not exist. Still a loud stub,
        // but now only for the case that actually has no rule implemented.
        M1.infoPopup({
          actor: g, title: 'No Usable Weapon',
          bodyHtml: g.name + ' would fire, but his weapon is broken and he has no second weapon. &sect;9/4 would have him acquire one from another German or an inactive US soldier in his hex &mdash; the German-side Pick Up/Exchange action is not modelled. Skipped.',
          logHtml: g.name + ': skipped fire &mdash; weapon broken, no second weapon (&sect;9/4 pick-up not modelled).',
        }, next);
        return;
      }
      var targets = M1.visibleEnemyTargets(g);
      if (!targets.length) {
        M1.infoPopup({ actor: g, title: 'No Target', bodyHtml: g.name + ' has no line of sight to any US soldier from ' + g.hexId + ' &mdash; cannot fire.' }, next);
        return;
      }
      // §9/7 (Task A1). A German crewing a machinegun is bound by the same rules a US soldier is:
      // he must be crouching, and alone he can only snap fire. The paragraph may have asked for
      // aimed fire, so this can downgrade it — deliberately, and it says so rather than silently
      // firing the mode the paragraph named.
      if (M1.isCrewWeapon(g.weaponId) && !M1.crewWeaponStanceOk(g)) {
        M1.infoPopup({
          actor: g, title: 'Cannot Fire',
          bodyHtml: g.name + ' is ' + g.stance + ', and a crew weapon can only be fired crouching (&sect;9/7). He holds his fire.',
          logHtml: g.name + ': no fire &mdash; must be crouching to fire the ' + M1.equipmentName(g.weaponId) + ' (&sect;9/7).',
        }, next);
        return;
      }
      germanPickTarget(g, targets, a.target, function (target) {
        var fireType = a.mode === 'snap' ? 'snap' : a.mode === 'aimed' ? 'aimed' : M1.FC.resolveBestFireType(true);
        if (M1.isCrewWeapon(g.weaponId)) {
          var avail = M1.crewFireAvailability(g);
          if (fireType === 'aimed' && !avail.aimed) fireType = 'snap'; // solo crew = snap only
          var fired = M1.crewFiredThisRound(g);
          if (fired.indexOf(g.id) === -1) fired.push(g.id);
          // §9/7: "when two Germans are firing a crew weapon, the German with the higher WS is
          // the firer." With a mate available, the pair's fire resolves with whichever of them
          // has the better Weapon Skill — which can mean the German whose turn it is hands the
          // trigger to his crewmate.
          if (fireType === 'aimed' && avail.mates.length) {
            var mate = avail.mates[0];
            var firerId = M1.CW.resolveGermanCrewFirer(g, mate);
            fired.push(mate.id);
            M1.Sched.completeAction(M1.state.track, mate.id);
            M1.renderTrack();
            var actualFirer = firerId === mate.id ? mate : g;
            M1.infoPopup({
              actor: actualFirer, title: 'Crew Weapon',
              bodyHtml: g.name + ' and ' + mate.name + ' crew the ' + M1.equipmentName(g.weaponId) + ' together, which is what allows aimed fire (&sect;9/7). ' +
                actualFirer.name + ' is the firer &mdash; the higher Weapon Skill of the two (' + M1.fmtSigned(actualFirer.WS) + ').',
              logHtml: g.name + ' + ' + mate.name + ' crew the ' + M1.equipmentName(g.weaponId) + '; ' + actualFirer.name + ' fires (higher WS, &sect;9/7).',
            }, function () { M1.fireChain(actualFirer, target, fireType, next); });
            return;
          }
        }
        M1.fireChain(g, target, fireType, next);
      });
      return;
    }
    if (a.action === 'grenade') {
      // Task #63 (docs/35_GRENADE_COMBAT.md): real now — germanSituation()'s hasGrenade
      // condition already gates most paragraph branches into this action, but a paragraph can
      // still call it unconditionally, so the same "does he actually have one" check applies here.
      if (!(g.inventory && M1.EQ.hasGrenade(g.inventory))) {
        M1.infoPopup({ actor: g, title: 'No Grenade', bodyHtml: g.name + ' would throw a grenade, but has none left.' }, next);
        return;
      }
      var gTargets = M1.grenadeCandidates(g);
      if (!gTargets.length) {
        M1.infoPopup({ actor: g, title: 'No Target', bodyHtml: g.name + ' has no US soldier within grenade range from ' + g.hexId + '.' }, next);
        return;
      }
      germanPickTarget(g, gTargets, a.target, function (target) { M1.grenadeChain(g, target.hexId, next); });
      return;
    }
    if (a.action === 'assault') {
      var inHex = M1.activeUS().filter(function (s) { return s.hexId === g.hexId; });
      // §11/3 Charge Assault: "A soldier who does not begin his turn in the same hex with a target
      // may perform a Move/Charge Assault Action to move into the hex and then assault... movement
      // always comes first." Only paragraph 833's exception clause asks for one, and only against
      // an adjacent target he can actually reach — a walled-off hex is not chargeable.
      if (a.charge && !inHex.length) {
        var reachable = adjacentTraversableUS(g);
        if (!reachable.length) { next(); return; }
        var victim = reachable[0];
        var fromHex = g.hexId;
        if (g.stance !== 'standing') g.stance = 'standing';
        g.hexId = victim.hexId;
        M1.placeEl(M1.counterEls[g.id], g.hexId);
        M1.updateCounterVisual(g);
        M1.unprepareWeaponOnMove(g);
        M1.infoPopup({
          actor: g, title: 'Charge Assault',
          bodyHtml: g.name + ' charges from ' + fromHex + ' into ' + victim.hexId + ' and assaults ' +
            victim.name + ' (&sect;11/3 &mdash; movement first, then the assault, at &minus;3 to hit).',
          logHtml: g.name + ' charge assaults ' + victim.name + ' (' + fromHex + ' &rarr; ' + victim.hexId + ', &sect;11/3).',
        }, function () { M1.assaultChain(g, victim, { capture: false, charge: true }, next); });
        return;
      }
      if (!inHex.length) { next(); return; }
      // §11/1: "A German soldier must assault the US soldier in the most disadvantageous stance."
      var pick = M1.Asl.resolveGermanAssaultTarget
        ? M1.Asl.resolveGermanAssaultTarget(inHex.map(function (s) { return { id: s.id, stance: s.stance, wounded: s.status === 'wounded' }; }), M1.d10)
        : { id: inHex[0].id };
      var defender = inHex.filter(function (s) { return s.id === pick.id; })[0] || inHex[0];
      if (g.stance !== 'standing') { g.stance = 'standing'; M1.updateCounterVisual(g); }
      M1.assaultChain(g, defender, { capture: false, charge: false }, next);
      return;
    }
    if (a.action === 'surrender') {
      M1.infoPopup({ actor: g, title: 'Surrender', bodyHtml: '<b>' + g.name + ' surrenders</b> and is taken prisoner (&sect;11/2).' }, function () {
        M1.applyCapture(g); next();
      });
      return;
    }
    if (a.action === 'remove_from_map') {
      M1.infoPopup({ actor: g, title: 'Withdraws', bodyHtml: g.name + ' is ' + (a.reason || 'out of contact') + ' and leaves the map (&sect;6/8).' },
        function () { germanLeavesMap(g, next); });
      return;
    }
    if (a.action === 'move' && a.toHex) {
      var fromHexId = g.hexId;
      g.hexId = a.toHex;
      if (M1.counterEls[g.id]) M1.placeEl(M1.counterEls[g.id], a.toHex);
      M1.scrollMapTo(a.toHex);
      M1.unprepareWeaponOnMove(g); // Task #69 (docs/43_PREPARE_WEAPON.md)
      M1.infoPopup({ actor: g, title: 'Move', bodyHtml: g.name + ' ' + (a.style === 'crawl' ? 'crawls' : 'moves') + ' ' + fromHexId + ' &rarr; <b>' + a.toHex + '</b>.' }, next);
      return;
    }
    if (a.action === 'move_by_reference') {
      M1.unprepareWeaponOnMove(g); // Task #69 (docs/43_PREPARE_WEAPON.md) — applies once movement begins
      resolveGermanMoveByReference(g, g.mpa || 0, next);
      return;
    }
    if (a.action === 'set_condition') {
      M1.infoPopup({ actor: g, title: 'Condition Change', bodyHtml: 'Paragraph ' + a.paragraph + ' puts <b>Condition ' + a.to + '</b> into effect.' }, function () {
        M1.pendingConditionChange = a.to; next();
      });
      return;
    }
    if (a.action === 'reroll_action_number') {
      M1.infoPopup({ actor: g, title: 'New Action Number', bodyHtml: 'Paragraph ' + a.paragraph + ': ignore the Self-Preservation reaction and roll a new Action Number (&sect;6/8).' }, function () {
        germanAutoTurn({ ignoreSelfPreservation: !!a.ignoreSelfPreservation }); // re-enters the whole turn with a fresh roll
      });
      return;
    }
    // §6/8 Special Reactions (Task #73, docs/47_SPECIAL_REACTIONS.md): "Certain German action
    // paragraphs... call for a Special Reaction to be put into effect... Use the indicated
    // Special Reaction column on his card instead of the current condition column... remains in
    // effect until another paragraph rescinds [it]... whenever a Special Reaction comes into
    // effect, a new German Action Number is rolled... use the Action paragraph indicated by the
    // new Action number and the Special Reaction column for the rest of the turn." Previously
    // only settable once, at activation (`activate_german`'s own `specialReaction` field, task
    // paragraph-interpreter work) — this is the same mechanism becoming reachable mid-mission,
    // from any German action paragraph, not just an activation one. `a.letter` of `null`
    // rescinds it (falls back to the normal Condition column).
    if (a.action === 'set_special_reaction') {
      M1.infoPopup({
        actor: g, title: a.letter ? 'Special Reaction' : 'Special Reaction Rescinded',
        bodyHtml: a.letter
          ? 'Paragraph ' + a.paragraph + ' puts <b>Special Reaction ' + a.letter + '</b> into effect for ' + g.name +
            (a.ignoresSelfPreservation ? ' &mdash; he ignores self-preservation while it remains in effect' : '') + ' (&sect;6/8).'
          : 'Paragraph ' + a.paragraph + ' rescinds ' + g.name + '\'s Special Reaction (&sect;6/8).',
      }, function () {
        g.specialReaction = a.letter || null;
        g.specialReactionIgnoresSelfPreservation = !!a.ignoresSelfPreservation;
        germanAutoTurn(); // "a new German Action Number is rolled ... for the rest of the turn"
      });
      return;
    }
    if (a.action === 'give_turn' || a.action === 'bespoke'
        || a.action === 'unannotated' || a.action === 'chain_cycle') {
      var why = a.action === 'give_turn' ? 'give a turn to another German (&sect;6/3 turn-giving is not modelled for Germans)'
        : a.action === 'unannotated' ? 'follow paragraph ' + a.paragraph + ', which is outside Mission 1\'s annotated German set'
        : a.action === 'chain_cycle' ? 'follow a paragraph chain that loops'
        : a.note || 'an unmodelled detail';
      M1.infoPopup({ actor: g, title: 'Not Modelled', bodyHtml: g.name + ' would ' + why + '. Skipped.', logHtml: g.name + ': skipped &mdash; ' + why + '.' }, next);
      return;
    }
    next();
  }

  // §6/9's targeting rule, quoted: "The target of his fire is the US soldier that is closest to
  // him (in hexes). If two or more targets are equally close, he fires at the easiest target...
  // If there is still a tie, determine the target at random." `easiest` flips the primary key.
  function germanPickTarget(g, targets, rule, cb) {
    if (targets.length === 1) { cb(targets[0]); return; }
    var candidates = targets.map(function (s) {
      return { id: s.id, distance: M1.FC.hexDistance(g.hexId, s.hexId), hitChance: M1.estimateHitChance(g, s, 'aimed') };
    });
    if (rule === 'easiest') {
      candidates.sort(function (a, b) { return b.hitChance - a.hitChance || a.distance - b.distance; });
    }
    var tieRoll = null;
    var picked = rule === 'easiest' ? candidates[0]
      : M1.FC.resolveClosestTarget(candidates, function () { tieRoll = M1.d10(); return tieRoll; });
    var target = targets.filter(function (s) { return s.id === picked.id; })[0];
    if (tieRoll === null) { cb(target); return; }
    M1.rollPopup({
      actor: g, title: 'Target Tie-Break', kind: 'single', presetValue: tieRoll,
      contextHtml: 'Equally close/easy targets — choosing at random.',
      explain: function () { return 'Targets <b>' + target.name + '</b>.'; },
      logText: function () { return g.name + ' target tie-break: <span class="roll">' + tieRoll + '</span> &rarr; ' + target.name + '.'; },
    }, function () { cb(target); });
  }
  // REAL BUG, fixed — a hard game lock, not a cosmetic one. A German can leave the Round in the
  // middle of his own turn: surrendering (§11/2 applyCapture), withdrawing off the map (§6/8
  // germanLeavesMap), or being killed by a reaction. All three call Sched.removeFromRound, which
  // moves his marker to the 'inactive' slot. performGermanActions then reaches its `!g.isActive`
  // guard and calls finishGermanTurn anyway — which asserted that he was still the current actor
  // and THREW ("GE 34/X is in slot inactive, not the current slot 1disadv"). The throw escaped
  // through a dialog callback, so driveNext() never ran: the Round froze with no current actor,
  // nobody else ever acted, and the game was unrecoverable. Three of thirty automated runs wedged
  // this way, each spraying ~600 identical uncaught errors as the surrender dialog re-fired.
  //
  // A German already off the Track has no action left to complete — the removal did that job —
  // so the Round simply moves on to whoever is next.
  function finishGermanTurn(g) {
    if (M1.state.phase === 'over') return;
    if (g.isActive) M1.Sched.completeAction(M1.state.track, g.id);
    M1.renderTrack();
    M1.driveNext();
  }

  // Shared by both ways a German can leave the map: an explicit remove_from_map action
  // (self-preservation/evasive withdrawal) and hitting an "Exit" Movement Reference (&sect;6/8).
  function germanLeavesMap(g, next) {
    g.isActive = false;
    M1.Sched.removeFromRound(M1.state.track, g.id);
    if (M1.counterEls[g.id]) { M1.counterEls[g.id].remove(); delete M1.counterEls[g.id]; }
    M1.renderTrack(); M1.renderRoster(); M1.renderVP();
    M1.checkEndingConditions();
    next();
  }

  // ---------------------------------------------------------------------
  // §6/8 German Movement — chase the Movement Reference chain (assets/data/
  // mission_cards_movement.json, docs/32_HANDOFF.md §5) until the German's MPA runs out.
  //
  // The rulebook's own description of what happens per hex entered (&sect;7/2's continuation,
  // the "German Evasive Movement" example): "If the German movement reference requires the
  // German soldier to enter an open hex, he does so standing... If the hex called for contains
  // another terrain type, he enters the hex in a crouching stance by crawling... If he crawled,
  // his movement is over; if he ran, then he continues moving: read the German movement
  // reference in the newly entered hex." This is the SAME standing (multi-hex, terrain-cost)
  // vs. crouching (single-hex, full MPA regardless of terrain) split movementrules.js already
  // implements for players (M.legalDestinations) — just driven by a dictated destination
  // instead of a player's chosen one, so no pathfinding is needed, only a per-hop cost check.
  // "Open" here is the rulebook's own named terrain category (TERRAIN_ROW's row 0 — the
  // Fire Combat Modifiers Chart's "Open (clear/stream/bridge/road/ford)" bucket), not a new
  // classification invented for this feature.
  function germanMovementRefFor(hexId) {
    var cartridgeId = M1.G.printedIdToCartridgeId(hexId);
    var grid = cartridgeId && M1.MISSION_CARDS_MOVEMENT['1'] && M1.MISSION_CARDS_MOVEMENT['1'][String(M1.state.opsState.condition)];
    return (grid && grid[cartridgeId]) || 'NONE';
  }
  function resolveGermanMoveByReference(g, mpRemaining, onDone) {
    if (M1.state.phase === 'over') { onDone(); return; }
    if (mpRemaining <= 0) {
      M1.infoPopup({ actor: g, title: 'Move', bodyHtml: g.name + ' is out of Movement Points and stops at ' + g.hexId + '.' }, onDone);
      return;
    }
    var kind = M1.GAct.classifyMovementReference(germanMovementRefFor(g.hexId));

    if (kind.type === 'none') {
      M1.infoPopup({
        actor: g, title: 'Move',
        bodyHtml: g.name + ' has no Movement Reference recorded at ' + g.hexId + ' for the current Condition &mdash; he stops here.',
      }, onDone);
      return;
    }
    if (kind.type === 'exit') {
      M1.infoPopup({ actor: g, title: 'Exit', bodyHtml: g.name + ' exits the map from ' + g.hexId + ' (&sect;6/8).' },
        function () { germanLeavesMap(g, onDone); });
      return;
    }
    if (kind.type === 'paragraph') {
      // §6/8: "a movement reference paragraph does not replace the German Action Paragraph...
      // it simply defines a special move or situation within the overall move." Evaluating one
      // of these against live mid-move battlefield state (a different, smaller vocabulary than
      // germanactions.js's — "visible from the doorway," "east of hex row O") isn't modelled;
      // shown in full so the player can see exactly what's being skipped, same convention as
      // every other documented gap (grenades, Give Turn, unannotated paragraphs).
      var text = M1.PARAGRAPHS[kind.paragraph];
      M1.infoPopup({
        actor: g, title: 'Movement Reference Paragraph Not Modelled',
        bodyHtml: 'The Movement Reference at ' + g.hexId + ' is paragraph <b>' + kind.paragraph + '</b>, not a hex. ' +
          'Evaluating a movement reference paragraph against live mid-move battlefield state isn\'t modelled yet.' +
          '<br><br>Its text, for reference:<br>' + (text || '(no text on file)') +
          '<br><br>He holds position at ' + g.hexId + ' instead.',
        logHtml: g.name + ': Movement Reference at ' + g.hexId + ' is paragraph ' + kind.paragraph + ' &mdash; not modelled, holding position.',
      }, onDone);
      return;
    }

    // kind.type === 'hex' — "N-9" etc: printed-style, same format as an activate_german hex,
    // so a plain dash-strip converts it (never G.cartridgeIdToPrintedId, see mission1demo.js's
    // header trap notes — that function expects the zero-padded cartridge-key format instead).
    var destHexId = kind.hex.replace('-', '');
    var terrain = M1.REAL_TERRAIN[destHexId];
    var open = M1.TERRAIN_ROW[terrain] === 0;
    var cost = open ? M1.M.mpCost(terrain) : mpRemaining;
    if (open && cost > mpRemaining) {
      M1.infoPopup({ actor: g, title: 'Move', bodyHtml: g.name + ' lacks the Movement Points to enter ' + destHexId + ' and stops at ' + g.hexId + '.' }, onDone);
      return;
    }
    var fromHexId = g.hexId;
    g.stance = open ? 'standing' : 'crouching';
    g.hexId = destHexId;
    if (M1.counterEls[g.id]) M1.placeEl(M1.counterEls[g.id], destHexId);
    M1.updateCounterVisual(g);
    M1.scrollMapTo(destHexId);
    M1.FX.trail(fromHexId, destHexId);
    var remaining = mpRemaining - cost;
    M1.infoPopup({
      actor: g, title: 'Move',
      bodyHtml: g.name + ' ' + (open ? 'runs' : 'crawls') + ' ' + fromHexId + ' &rarr; <b>' + destHexId + '</b> (' + M1.TERRAIN_LABELS[terrain] + ').',
    }, function () {
      M1.runParagraphCheck(g, function () {
        if (M1.state.phase === 'over') { onDone(); return; }
        if (!open || remaining <= 0) { onDone(); return; } // crawled -> "his movement is over" (§7/4)
        resolveGermanMoveByReference(g, remaining, onDone);
      }, { skipEventCheck: true });
    });
  }
})();

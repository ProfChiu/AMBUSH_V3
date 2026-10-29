'use strict';
// mission1/verbs.js (9 of 13) — the player's verbs: grenade, drag, pick up, command, stance, prepare, fire, assault, jam. Stage A cut of mission1.js lines 3468-4134 (docs/REFACTOR_MAP.md 5.4).
  // ---------------------------------------------------------------------
  // §10 Grenade combat (Task #63, docs/35_GRENADE_COMBAT.md)
  // ---------------------------------------------------------------------
  // §10/1's own "Grenade Inside"/"Grenade Outside" row split — the same interior bucket
  // germanSituation() already uses for its own terrain classification.
  function isInteriorHex(hexId) {
    var t = REAL_TERRAIN[hexId];
    return t === 'building' || t === 'interior' || t === 'second_story';
  }
  function canThrowGrenade(s) { return !!(s && s.inventory && EQ.hasGrenade(s.inventory)); }
  // One entry per distinct enemy-occupied hex within throw range (not per soldier — §10/1
  // targets a hex, and "roll separately for each" soldier present is resolved once a hex is
  // picked). §10/1: "cannot be thrown into the same hex with the throwing soldier" — excluded by
  // construction, since only enemy hexes are ever candidates. Deliberately NOT modelled: throwing
  // at a hex with no known occupant (would need a map hex-picker UI, not a target list) — matches
  // grenaderules.js's own "flag gaps, don't guess a UI for them" convention.
  function grenadeCandidates(s) {
    if (!s || !canThrowGrenade(s)) return [];
    var maxRange = Gr.maxThrowRange('grenade', s.stance);
    if (!maxRange) return []; // prone: 0, matches "cannot throw at all if prone"
    var enemyPool = s.side === 'german' ? activeUS() : activeGermans();
    var seenHex = {}, out = [];
    enemyPool.forEach(function (t) {
      if (seenHex[t.hexId]) return;
      var dist = FC.hexDistance(s.hexId, t.hexId);
      if (dist < 1 || dist > maxRange) return;
      seenHex[t.hexId] = true;
      out.push(t);
    });
    return out;
  }
  // §10/1 step 3: GRENADE_MODS (WS, wounded, not-in-sight) — NOT the Fire Combat Modifiers Chart
  // (no terrain/stance/aimed-snap shifts, per grenaderules.js's own header). Aperture-through-wall
  // deliberately not modelled (grenaderules.js's own documented gap, carried over unchanged).
  function grenadeMods(thrower, targetHexId) {
    var mods = [thrower.WS];
    if (thrower.status === 'wounded') mods.push(-2);
    if (!losClear(thrower.hexId, targetHexId)) mods.push(-3);
    return mods;
  }
  function estimateGrenadeHitChance(thrower, targetHexId) {
    var weapon = weaponById(Gr.weaponIdFor('grenade', isInteriorHex(targetHexId)));
    var band = FC.resolveRangeBand(weapon, FC.hexDistance(thrower.hexId, targetHexId));
    if (!band) return -Infinity;
    return Gr.computeHitChance(CHART.BASE_HIT[band], grenadeMods(thrower, targetHexId)).clamped;
  }
  function activeSoldiersIn(hexId) {
    return activeUS().concat(activeGermans()).filter(function (s) { return s.hexId === hexId; });
  }

  // ---------------------------------------------------------------------
  // §5/3, §6/7, §7/3 Drag Inactive Soldier (Task #59, docs/36_DRAG_INACTIVE_SOLDIER.md) — player-only
  // (Germans never call this action: no `action: 'drag'` op exists anywhere in
  // assets/data/german_action_programs.js).
  // ---------------------------------------------------------------------
  // "Only inactive soldiers may be dragged — never unaware or wounded ones" (docs/16_MOVEMENT.md,
  // confirmed against §5/3/§6/7/§7/3's own text) — `isActive` already means exactly that
  // (incapacitated/killed/captured all set it false; wounded and unaware soldiers stay active).
  function dragCandidates(s) {
    if (!s || s.stance !== 'standing') return []; // "A standing soldier... can drag him"
    if (!(s.inventory && EQ.emptyPortBoxCount(s.inventory, s) > 0)) return []; // "has an empty Port Box"
    return usSoldiers.filter(function (t) { return t.id !== s.id && t.hexId === s.hexId && !t.isActive; });
  }
  // §15's exfiltration exemption, quoted from missions.json's own victory text: "VP loss for an
  // incapacitated US soldier can be avoided by moving him off the map from hex A1 through J1 or,
  // if mission ending 1 is accomplished, by moving him into either building hex."
  //
  // REAL BUG, fixed: victoryrules.js has implemented and unit-tested this exemption since Phase 10
  // (usCasualtyVPLoss's `wasExfiltrated` branch), but nothing ever set the flag — recordCasualty
  // wrote `wasExfiltrated: false` and no other line in the codebase touched it. The exemption was
  // also unreachable by construction: tryExit required `s.isActive`, which an incapacitated
  // soldier never is. So every casualty cost the full 2 VP no matter what the player did with the
  // body, in a mission whose VP budget has no room to spare.
  //
  // Killed soldiers deliberately get no exemption — the rule text only ever names "an
  // incapacitated US soldier", and usCasualtyVPLoss already enforces that on its own side.
  function markExfiltrated(soldier) {
    var record = vpState.usCasualties.filter(function (c) { return c.soldierId === soldier.id; })[0];
    if (record) record.wasExfiltrated = true;
  }
  // Who an exiting soldier can carry off with him. Reuses dragCandidates' own §7/3 prerequisites
  // wholesale (carrier standing, carrier has an empty Port Box, dragged soldier inactive and in
  // the same hex) rather than inventing a second, looser notion of "can pick him up" — carrying a
  // body off the edge is the last step of a drag, not a different action. One at a time, since
  // that's what the single empty Port Box the drag rule requires actually buys you.
  function carryCandidates(s) {
    return dragCandidates(s).filter(function (t) { return t.status === 'incapacitated' && !t.exited; });
  }
  function dragHexCandidates(s) {
    if (!s) return [];
    var start = G.parseId(s.hexId);
    return G.neighbors(start.colIdx, start.rowIdx).map(function (n) { return n.id; }).filter(function (hexId) {
      var terrain = REAL_TERRAIN[hexId];
      return !(terrain && M.isProhibited(terrain));
    });
  }

  // ---------------------------------------------------------------------
  // §5/3/§6/7 Pick Up/Exchange Equipment (Task #68, docs/37_PICKUP_EXCHANGE.md) — player-only,
  // same reasoning as Drag: no `action: 'pickup'`/`'exchange'` op exists anywhere in
  // assets/data/german_action_programs.js.
  //
  // Modelled as a single "take" action rather than a full two-way trade UI: the rulebook's
  // "exchange" is just item-transfer between two soldiers in a hex, and which soldier's turn
  // performs the move doesn't change the reachable end states — if A wants to give X to B, B can
  // just take X from A on B's own turn instead. "Put down" (voluntarily dropping an item with
  // nothing else happening) is deliberately NOT modelled — the one case that actually needs items
  // on the ground (§13/2 wound-loss overflow) already creates them for real (see applyDamage's
  // wound branch); a bare "drop for its own sake" button is low-value and left for later if it's
  // ever actually wanted.
  // ---------------------------------------------------------------------
  function allInHex(hexId) {
    return usSoldiers.filter(function (s) { return s.hexId === hexId; })
      .concat(allGermans().filter(function (g) { return g.hexId === hexId; }));
  }
  // §5/3: "A soldier that is standing or crouching can pick up or put down any portable items in
  // his hex... A soldier that is taking equipment from an inactive soldier must be crouching."
  // Ground items and an ACTIVE soldier's gear need only standing/crouching; an INACTIVE soldier's
  // gear (own casualty, or a dead/incapacitated/captured German — §14: "you can pick up and use
  // most German equipment") needs the taker specifically crouching.
  function pickupOffers(actor) {
    if (!actor || !upright(actor)) return [];
    var hexId = actor.hexId, offers = [];
    (groundItems[hexId] || []).forEach(function (item, idx) {
      offers.push({
        from: 'ground', item: equipmentName(item.id),
        label: equipmentName(item.id) + ' (on the ground)',
        take: function () { return takeGroundItem(actor, hexId, idx); },
      });
    });
    allInHex(hexId).forEach(function (other) {
      if (other.id === actor.id) return;
      // §6/7: exchange is between friends; German equipment comes only off an inactive German (§14).
      if (other.side !== actor.side && other.isActive) return;
      if (!other.isActive && actor.stance !== 'crouching') return;
      var fromWhom = other.name + (other.isActive ? '' : ' (down)') + '’s ';
      if (other.side === 'german') {
        if (other.weaponId) {
          offers.push({ from: other.id, item: equipmentName(other.weaponId), label: fromWhom + equipmentName(other.weaponId), take: function () { return takeGermanWeapon(actor, other); } });
        }
      } else {
        EQ.carriedItemIds(other.inventory).forEach(function (weaponId) {
          offers.push({ from: other.id, item: equipmentName(weaponId), label: fromWhom + equipmentName(weaponId), take: function () { return takeWeaponFromSoldier(actor, other, weaponId); } });
        });
      }
      (other.inventory ? other.inventory.ammoBoxes : []).forEach(function (ammoId, ammoIdx) {
        if (!ammoId) return;
        offers.push({ from: other.id, item: ammoId === 'gren' ? 'Grenade' : 'Clip: ' + equipmentName(ammoId), label: fromWhom + equipmentName(ammoId), take: function () { return takeAmmoFromSoldier(actor, other, ammoIdx); } });
      });
    });
    return offers;
  }
  // If the actor has no personal weapon yet, adopt whatever weapon they just picked up so it's
  // actually usable — matches how squad generation itself assigns weaponId from a stowed item.
  // A soldier who already has one keeps it; picking up a spare doesn't switch weapons mid-fight
  // (that's Prepare Weapon / weapon-switching territory, Task #69, not this one).
  // Task #69 (docs/43_PREPARE_WEAPON.md): a newly adopted crew weapon always starts unprepared —
  // whoever last had it (a dead German, a teammate) isn't handing it over ready-to-fire.
  function afterWeaponPickup(actor, weaponId) {
    if (!actor.weaponId) { actor.weaponId = weaponId; actor.weaponPrepared = false; }
  }
  function takeGroundItem(actor, hexId, idx) {
    var item = groundItems[hexId][idx];
    var ok = item.kind === 'port' ? EQ.stowItem(actor.inventory, actor, item.id, boxesFor(item.id)) : EQ.stowAmmo(actor.inventory, item.id);
    if (ok) {
      groundItems[hexId].splice(idx, 1);
      if (item.kind === 'port') afterWeaponPickup(actor, item.id);
    }
    return ok;
  }
  // §14: picking up a dead German's own weapon — it was never in any Port Box (Germans carry no
  // Port Box model at all, docs/33_PORT_BOX.md), so this synthesizes a single-item transfer
  // straight from his `weaponId` rather than an inventory move. Deliberately NOT modelled: §14's
  // "-1 Weapon Skill for the rest of the game when using a captured weapon" — WS is a single
  // scalar per soldier here, not tracked per-weapon, the same pre-existing simplification
  // ASSAULT_MODS' captured-weapon modifier already flagged as unapplied (assaultOpts's
  // `attackerUsingCapturedWeapon: false`, hardcoded).
  function takeGermanWeapon(actor, german) {
    var ok = EQ.stowItem(actor.inventory, actor, german.weaponId, boxesFor(german.weaponId));
    if (ok) { afterWeaponPickup(actor, german.weaponId); german.weaponId = null; }
    return ok;
  }
  function takeWeaponFromSoldier(actor, other, weaponId) {
    var ok = EQ.stowItem(actor.inventory, actor, weaponId, boxesFor(weaponId));
    if (ok) {
      EQ.dropItem(other.inventory, weaponId);
      if (other.weaponId === weaponId) other.weaponId = null;
      afterWeaponPickup(actor, weaponId);
    }
    return ok;
  }
  // §9/5: "Ammo acquired by a soldier during a mission... can be marked in any empty box" — no
  // type-matching requirement at acquisition time, unlike firing (that's EQ.hasAmmo's job, at the
  // moment of use, not here).
  function takeAmmoFromSoldier(actor, other, ammoIdx) {
    var ammoId = other.inventory.ammoBoxes[ammoIdx];
    var ok = EQ.stowAmmo(actor.inventory, ammoId);
    if (ok) other.inventory.ammoBoxes[ammoIdx] = null;
    return ok;
  }
  // Same row-list dialog shape as chooseTarget, but for synthetic {label, take} offers rather
  // than soldier targets — no image/odds column, just a label per row.
  function chooseOffer(offers, opts, cb) {
    var spec = {
      title: opts.title, variant: 'wide', allowEnter: false, allowEscape: true, escapeButtonId: 'cancel',
      buttons: [{ id: 'cancel', label: 'Cancel' }],
      render: function (ctx) {
        spec.choices = offers.map(function (o) {
          return { text: stripTags(o.label), odds: null, pick: function () { Dialogs.reset(); cb(o); } };
        });
        var html = offers.map(function (o, i) {
          return '<div class="target-row" data-idx="' + i + '"><span class="target-id"><b>' + o.label + '</b></span></div>';
        }).join('');
        ctx.bodyEl.innerHTML = '<div class="step-context">' + opts.prompt + '</div><div class="target-list">' + html + '</div>';
        Array.prototype.forEach.call(ctx.bodyEl.querySelectorAll('.target-row'), function (row) {
          row.addEventListener('click', function () { spec.choices[parseInt(row.dataset.idx, 10)].pick(); });
        });
      },
      onButton: function (id, ctx) { ctx.close(); },
      onClose: function () { if (opts.onCancel) opts.onCancel(); },
    };
    Dialogs.push(spec);
  }
  function doPlayerPickup() {
    var actor = findSoldier(currentActorId);
    var offers = pickupOffers(actor);
    if (!offers.length) { Toasts.show('Nothing to pick up or exchange here.', { kind: 'error' }); return; }
    disableActionButtons();
    chooseOffer(offers, {
      title: 'Pick Up / Exchange Equipment',
      prompt: actor.name + ' can take any of the following from ' + actor.hexId + ':',
      onCancel: function () { showActionPanel(currentActorId); },
    }, function (offer) { resolvePickup(actor, offer); });
  }
  function resolvePickup(actor, offer) {
    var ok = offer.take();
    infoPopup({
      actor: actor, title: 'Pick Up / Exchange Equipment',
      bodyHtml: ok ? actor.name + ' takes ' + offer.label + '.' : actor.name + ' has no room to carry ' + offer.label + '.',
      logHtml: (ok ? actor.name + ' takes ' + offer.label + '.' : actor.name + ' has no room for ' + offer.label + '.'),
    }, function () {
      renderRoster();
      if (phase !== 'over') { Sched.completeAction(track, currentActorId); renderTrack(); driveNext(); }
    });
  }

  // ---------------------------------------------------------------------
  // §6/3 Command and Commanders — Give Turn, and §6/5's commander-makes-aware clause (Task #64,
  // docs/38_GIVE_TURN.md). Player-only: German soldiers are never flagged `isCommander` anywhere
  // in this codebase (assets/data/german_roster.js has no commander field at all, and German
  // spawn code in mission1demo.js hardcodes `isCommander: false`) — so the `give_turn` op that
  // DOES appear in assets/data/german_action_programs.js (3 occurrences) can never legitimately
  // fire regardless of how faithfully its recipient-selection rule strings
  // ('fewest_turns_then_ws', etc.) were implemented; kept as the pre-existing "Not Modelled" stub
  // rather than building real logic for a branch that's structurally unreachable with this data.
  // ---------------------------------------------------------------------
  // §6/3: "Only soldiers occupying the 1-Turn or Complete space can be given a Turn... A wounded
  // soldier can never be given a turn in this way." All already enforced inside
  // Sched.canGiveTurn/AR.canReceiveGivenTurn — this just enumerates who currently passes it.
  function giveTurnCandidates(giver) {
    if (!giver || !giver.isCommander) return [];
    return activeUS().filter(function (t) { return t.id !== giver.id && Sched.canGiveTurn(track, giver.id, t.id).ok; });
  }
  // §6/5: "An aware commander can spend one of his Turns to make an unaware soldier within his
  // Command Radius aware... A wounded soldier can never be made aware in this manner."
  function makeAwareCandidates(giver) {
    if (!giver || !giver.isCommander) return [];
    var radius = AR.commandRadiusHexIds(giver.hexId);
    return activeUS().filter(function (t) { return t.id !== giver.id && !t.aware && !t.wounded && radius.indexOf(t.hexId) !== -1; });
  }
  function doPlayerGiveTurn() {
    var giver = findSoldier(currentActorId);
    var candidates = giveTurnCandidates(giver);
    if (!candidates.length) { Toasts.show('No eligible soldier within Command Radius to give a turn to.', { kind: 'error' }); return; }
    disableActionButtons();
    chooseTarget(giver, candidates, {
      title: 'Give Turn',
      prompt: giver.name + ' can give his turn to any of the following (within his Command Radius, in the 1-Turn or Complete space):',
      onCancel: function () { showActionPanel(currentActorId); },
    }, function (recipient) {
      Sched.giveTurn(track, giver.id, recipient.id);
      infoPopup({
        actor: { left: giver, right: recipient }, title: 'Give Turn',
        bodyHtml: giver.name + ' gives his turn to ' + recipient.name + '.',
        logHtml: giver.name + ' gives his turn to ' + recipient.name + ' (&sect;6/3).',
      }, function () { renderTrack(); driveNext(); });
    });
  }
  function doPlayerMakeAware() {
    var giver = findSoldier(currentActorId);
    var candidates = makeAwareCandidates(giver);
    if (!candidates.length) { Toasts.show('No unaware soldier within Command Radius.', { kind: 'error' }); return; }
    disableActionButtons();
    chooseTarget(giver, candidates, {
      title: 'Make Aware',
      prompt: giver.name + ' can spend his turn to make any of the following aware (within his Command Radius):',
      onCancel: function () { showActionPanel(currentActorId); },
    }, function (recipient) {
      recipient.aware = true;
      Sched.applyBecomesAware(track, recipient.id);
      infoPopup({
        actor: { left: giver, right: recipient }, title: 'Make Aware',
        bodyHtml: giver.name + ' spends his turn to make ' + recipient.name + ' aware.',
        logHtml: recipient.name + ' is now aware (&sect;6/5), made aware by ' + giver.name + '.',
      }, function () {
        updateCounterVisual(recipient);
        if (phase !== 'over') { Sched.completeAction(track, giver.id); renderTrack(); driveNext(); }
      });
    });
  }

  // ---------------------------------------------------------------------
  // §6/7 Free Stance Change (Task #58, docs/39_WOUND_EFFECTS.md). "Wounded soldiers never
  // receive a free stance change" — so this button is simply unavailable to a wounded soldier,
  // not offered at a cost.
  //
  // Deliberately NOT modelled: the rulebook's paid alternative ("A soldier without a free stance
  // change must spend one Movement Point to change stance... a free stance change can be
  // combined with a movement action") — this codebase's Rounds turn economy gives every action
  // (Move, Fire, Assault, ...) the soldier's full fresh MPA for that one self-contained action,
  // with no persistent depleting MP counter a second, separate stance change could spend from
  // (`roundLegalDestinations` computes legal moves from `s.mpa` directly every turn, not from a
  // running `mpRemaining` balance — confirmed by reading the code, not assumed). Modelling "pay
  // 1 MP to change stance a second time" faithfully needs that budget to exist first; treated as
  // a real, bounded, flagged gap rather than guessed at with fragile new state.
  // ---------------------------------------------------------------------
  // §6/7: a stance change is free once per turn for an unwounded soldier, and otherwise costs
  // 1 MP as a Movement Action — it is never simply unavailable to a soldier with MP in hand.
  // Before this took the paid case into account, a wounded soldier could not change stance at
  // all, which is half of what froze the stalemated games (see legalDestinationsWithBudget).
  function stanceChangeIsFree(s) { return !!s && !s.wounded && !s.usedFreeStanceChange; }
  function stanceChangeCandidates(s) {
    if (!s) return [];
    if (!stanceChangeIsFree(s) && s.mpa < standUpCost(s)) return []; // no free change and no MP to buy one
    return ['standing', 'crouching', 'prone'].filter(function (st) { return st !== s.stance; });
  }
  function doPlayerChangeStance() {
    var s = findSoldier(currentActorId);
    var options = stanceChangeCandidates(s);
    if (!options.length) { Toasts.show('No stance change available this turn.', { kind: 'error' }); return; }
    var free = stanceChangeIsFree(s);
    disableActionButtons();
    chooseOffer(options.map(function (st) { return { label: 'Go ' + st, stance: st }; }), {
      title: 'Change Stance',
      prompt: free
        ? s.name + ' can make one free stance change this turn:'
        : s.name + ' has no free stance change' + (s.wounded ? ' (wounded)' : ' left this turn') +
          ', so this costs 1 MP as a Movement Action (&sect;6/7):',
      onCancel: function () { showActionPanel(currentActorId); },
    }, function (offer) {
      s.stance = offer.stance;
      if (free) s.usedFreeStanceChange = true;
      updateCounterVisual(s);
      var how = free ? 'free stance change' : '1 MP, Movement Action';
      infoPopup({
        actor: s, title: 'Change Stance',
        bodyHtml: s.name + ' goes <b>' + offer.stance + '</b> (' + how + ').',
        logHtml: s.name + ' goes ' + offer.stance + ' (' + how + ', &sect;6/7).',
      }, function () {
        if (phase !== 'over') { Sched.completeAction(track, s.id); renderTrack(); driveNext(); }
      });
    });
  }

  // §5/3/§6/7 Prepare Weapon (Task #69, docs/43_PREPARE_WEAPON.md).
  function doPlayerPrepareWeapon() {
    var s = findSoldier(currentActorId);
    if (!canPrepareWeapon(s)) { Toasts.show('Nothing to prepare.', { kind: 'error' }); return; }
    disableActionButtons();
    s.weaponPrepared = true;
    infoPopup({
      actor: s, title: 'Prepare Weapon',
      bodyHtml: s.name + ' prepares the ' + equipmentName(s.weaponId) + '.',
      logHtml: s.name + ' prepares the ' + equipmentName(s.weaponId) + ' (&sect;5/3/&sect;6/7).',
    }, function () {
      if (phase !== 'over') { Sched.completeAction(track, s.id); renderTrack(); driveNext(); }
    });
  }

  function doPlayerFire(fireType) {
    var firer = findSoldier(currentActorId);
    var targets = visibleEnemyTargets(firer);
    if (!targets.length) { Toasts.show('No line of sight to a German.', { kind: 'error' }); return; }
    // §9/7 (Task A1): aimed fire from a crew weapon is two soldiers combining their actions, so
    // the second crewman has to be chosen and has to pay for it — his turn is spent too. Snap
    // fire needs no mate, so it drops straight through to the ordinary path.
    if (isCrewWeapon(firer.weaponId) && fireType === 'aimed') {
      var mates = crewMates(firer);
      if (!mates.length) { Toasts.show('Aimed fire from a crew weapon needs a second crouching soldier in the hex (\u00a79/7).', { kind: 'error' }); return; }
      disableActionButtons();
      chooseOffer(mates.map(function (m) { return { label: m.name + ' (' + m.stance + ', WS ' + fmtSigned(m.WS) + ')', id: m.id }; }), {
        title: 'Combine Actions',
        prompt: firer.name + ' can only aim the ' + equipmentName(firer.weaponId) +
          ' with a second crewman. Whoever helps spends his own turn doing it (&sect;9/7):',
        onCancel: function () { showActionPanel(currentActorId); },
      }, function (offer) {
        var mate = findSoldier(offer.id);
        infoPopup({
          actor: firer, title: 'Crew Weapon',
          bodyHtml: mate.name + ' crews the ' + equipmentName(firer.weaponId) + ' with ' + firer.name +
            '. Two soldiers combining their actions is what makes aimed fire possible (&sect;9/7) &mdash; ' +
            firer.name + ' is the firer, so his Weapon Skill applies, and ' + mate.name + ' spends his turn on it.',
          logHtml: mate.name + ' crews the ' + equipmentName(firer.weaponId) + ' with ' + firer.name + ' (&sect;9/7 combined aimed fire).',
        }, function () {
          crewFiredThisRound(firer).push(mate.id);
          // The mate has spent his action helping. Doing this BEFORE the fire resolves matters:
          // if the fire kills the firer's target and ends the Round, the mate must still be
          // recorded as having acted, not left holding an unspent turn.
          Sched.completeAction(track, mate.id);
          renderTrack();
          continueFire();
        });
      });
      return;
    }
    disableActionButtons();
    continueFire();
    function continueFire() {
    chooseTarget(firer, targets, {
      title: 'Select Target — ' + (fireType === 'aimed' ? 'Aimed Fire' : 'Snap Fire'),
      prompt: firer.name + ' has line of sight to ' + targets.length + (targets.length === 1 ? ' German' : ' Germans') + '. Choose a target.',
      hitChanceFor: function (t) { return estimateHitChance(firer, t, fireType); },
      hitChanceTipFor: function (t) { var b = estimateHitChanceBreakdown(firer, t, fireType); return b ? hitBreakdownText(b) : ''; },
      onCancel: function () { showActionPanel(currentActorId); },
    }, function (target) {
      // Task #70 (docs/44_SNAP_FIRE_COMBO.md): only a snap fire can lead into a combo follow-up
      // (Aimed has none) — fireType is fixed for the lifetime of this call, so branching once
      // here is equivalent to, and simpler than, threading it through fireChain's own callback.
      var onDone = fireType === 'snap'
        ? function () { finishFireStep(firer, function () { completeTurn(firer.id); }); }
        : function () { completeTurn(firer.id); };
      if (isCrewWeapon(firer.weaponId)) {
        var fired = crewFiredThisRound(firer);
        if (fired.indexOf(firer.id) === -1) fired.push(firer.id); // §9/7's two-DISTINCT-soldiers cap
      }
      fireChain(firer, target, fireType, onDone);
    });
    }
  }
  // §10/1 step 1 — Choose the Target. Targets a HEX (one candidate shown per occupied hex in
  // range), not a specific soldier — §10/1 step 5 rolls damage separately for everyone actually
  // in the hex once it's picked (see grenadeChain's damageAtHex).
  function doPlayerGrenade() {
    var thrower = findSoldier(currentActorId);
    var candidates = grenadeCandidates(thrower);
    if (!candidates.length) { Toasts.show('No German within grenade range.', { kind: 'error' }); return; }
    disableActionButtons();
    chooseTarget(thrower, candidates, {
      title: 'Select Target — Throw Grenade',
      prompt: thrower.name + ' can reach ' + candidates.length + ' hex' + (candidates.length === 1 ? '' : 'es') +
        ' with a grenade (range ' + Gr.maxThrowRange('grenade', thrower.stance) + ' while ' + thrower.stance + ').',
      hitChanceFor: function (t) { return estimateGrenadeHitChance(thrower, t.hexId); },
      noteFor: function (t) { return losClear(thrower.hexId, t.hexId) ? '' : 'Not in sight &mdash; &minus;3'; },
      onCancel: function () { showActionPanel(currentActorId); },
    }, function (target) {
      grenadeChain(thrower, target.hexId, function () { if (phase !== 'over') { Sched.completeAction(track, currentActorId); renderTrack(); driveNext(); } });
    });
  }
  // §5/3/§6/7/§7/3 step 1 — choose which inactive soldier (rarely more than one in a hex), then
  // an adjacent destination hex, reusing the same dest-mark click UI the Move action uses.
  function doPlayerDrag() {
    var dragger = findSoldier(currentActorId);
    var candidates = dragCandidates(dragger);
    var destHexes = dragHexCandidates(dragger);
    if (!candidates.length || !destHexes.length) { Toasts.show('No inactive soldier here to drag, or nowhere to drag him.', { kind: 'error' }); return; }
    disableActionButtons();
    function pickDestination(dragged) {
      document.getElementById('cancelMoveBtn').style.display = '';
      clearDestMarks();
      destHexes.forEach(function (hexId) {
        addDestMark(hexId, 'dest-mark cost-1', hexId, function () { performDrag(dragger, dragged, hexId); });
      });
      document.getElementById('status-banner').textContent = dragger.name + ' — choose an adjacent hex to drag ' + dragged.name + ' to, or Cancel.';
    }
    if (candidates.length === 1) { pickDestination(candidates[0]); return; }
    chooseTarget(dragger, candidates, {
      title: 'Select Soldier — Drag',
      prompt: 'Choose which inactive soldier ' + dragger.name + ' drags.',
      onCancel: function () { showActionPanel(currentActorId); },
    }, pickDestination);
  }
  function performDrag(dragger, dragged, destHexId) {
    clearDestMarks();
    document.getElementById('cancelMoveBtn').style.display = 'none';
    var fromHexId = dragger.hexId;
    // §7/3: "expend entire Movement Point Allowance"; §5/3/§6/7: "if the inactive soldier is
    // incapacitated, roll a die for each hex he is dragged; on a result of 0, he dies." (Already
    // killed soldiers get no roll — dragging a body can't kill it twice.)
    var result = M.dragInactiveSoldier({
      draggerStance: dragger.stance, draggerHasEmptyPortBox: true, draggerMPA: dragger.mpa,
      draggedIsIncapacitated: dragged.status === 'incapacitated',
      rollD10: dragged.status === 'incapacitated' ? d10 : undefined,
    });
    dragger.hexId = destHexId;
    dragger.mpRemaining = 0;
    placeEl(counterEls[dragger.id], destHexId);
    scrollMapTo(destHexId);

    function finishDrag() {
      infoPopup({
        actor: dragger, title: 'Drag',
        bodyHtml: dragger.name + ' drags ' + dragged.name + ' from ' + fromHexId + ' to <b>' + destHexId + '</b>.',
      }, function () {
        runParagraphCheck(dragger, function () {
          if (phase !== 'over') { Sched.completeAction(track, dragger.id); renderTrack(); driveNext(); }
        }, { skipEventCheck: true });
      });
    }

    if (result.dragRoll === undefined) {
      dragged.hexId = destHexId;
      if (counterEls[dragged.id]) placeEl(counterEls[dragged.id], destHexId);
      finishDrag();
      return;
    }
    rollPopup({
      actor: dragged, title: 'Drag Roll', kind: 'single', presetValue: result.dragRoll,
      contextHtml: dragged.name + ' is incapacitated &mdash; a result of 0 kills him during the drag.',
      explain: function () { return result.diedFromDrag ? '<b style="color:#e05a4a;">DIES</b>.' : 'Survives &mdash; ' + dragged.name + ' is dragged along.'; },
      logText: function () { return 'Drag roll: <span class="roll">' + result.dragRoll + '</span> &rarr; ' + (result.diedFromDrag ? 'dies.' : 'survives.'); },
    }, function () {
      if (result.diedFromDrag) {
        dragged.status = 'killed';
        // Already counted as a casualty when he was first incapacitated (recordCasualty,
        // applyDamage) — VP loss is identical for incapacitated vs. killed
        // (usCasualtyVPLoss, victoryrules.js), so update the existing record's outcome rather
        // than pushing a second one, which would double-charge the same soldier.
        var existing = vpState.usCasualties.filter(function (c) { return c.soldierId === dragged.id; })[0];
        if (existing) existing.outcome = 'killed'; else recordCasualty(dragged, 'killed');
        updateCounterVisual(dragged);
        logLine(dragged.name + ' dies during the drag.', 'event');
        // A dead body stays where it fell — it isn't moved along with a failed drag.
      } else {
        dragged.hexId = destHexId;
        if (counterEls[dragged.id]) placeEl(counterEls[dragged.id], destHexId);
      }
      finishDrag();
    });
  }
  function doPlayerAssault() {
    var firer = findSoldier(currentActorId);
    var candidates = assaultCandidates(firer);
    if (!candidates.length) { Toasts.show('No German this soldier can reach and assault.', { kind: 'error' }); return; }
    var byId = {};
    candidates.forEach(function (c) { byId[c.german.id] = c; });
    disableActionButtons();

    // §11/1 step 1 — Choose the Target.
    chooseTarget(firer, candidates.map(function (c) { return c.german; }), {
      title: 'Select Target — Assault',
      prompt: firer.name + ' can assault ' + candidates.length + ' Germans. A target in an adjacent hex requires a charge assault (&sect;11/3).',
      hitChanceFor: function (t) { return Asl.computeHitChance(CHART.BASE_HIT.assault, assaultOpts(firer, t, byId[t.id].isCharge)).clamped; },
      noteFor: function (t) {
        var c = byId[t.id];
        return c.isCharge
          ? 'Charge assault &mdash; move in for ' + c.cost + ' MP (of ' + c.budget + ' allowed), <b>&minus;3 to hit</b>'
          : 'Same hex &mdash; no charge penalty';
      },
      onCancel: function () { showActionPanel(currentActorId); },
    }, function (target) { chooseCaptureOrKill(firer, byId[target.id]); });
  }

  // §11/1 step 2 — "A US soldier can attempt to capture or kill a German, at your option (11/2).
  // An assaulting German always assaults to kill." Previously hardcoded to kill, which also made
  // the Assault-to-Capture row of the damage table (and every card's "+N VP if captured"
  // conditional award) permanently unreachable.
  function chooseCaptureOrKill(attacker, candidate) {
    var defender = candidate.german;
    Dialogs.push({
      title: 'Capture or Kill?', variant: 'narrow', allowEnter: true, allowEscape: true, escapeButtonId: 'cancel',
      buttons: [
        { id: 'kill', label: 'Assault to Kill', variant: 'amber' },
        { id: 'capture', label: 'Assault to Capture' },
        { id: 'cancel', label: 'Cancel' },
      ],
      render: function (ctx) {
        ctx.bodyEl.innerHTML = actorRowHtml({ left: attacker, right: defender }) +
          '<div class="step-context">' + attacker.name + ' assaults ' + defender.name + '.<br><br>' +
          'A capture attempt uses the Assault-to-Capture row of the damage table &mdash; more results end without a kill, ' +
          'but a captured German is out of the fight and cannot be freed while a US soldier holds the hex.' +
          (V.parseGermanVP(defender.card.VP || '').conditional ? '<br><br>His card carries a conditional award: <b>' + defender.card.VP + '</b>.' : '') +
          '</div>';
      },
      onButton: function (id, ctx) { ctx.close(id); },
      onClose: function (id) {
        if (id !== 'kill' && id !== 'capture') { showActionPanel(currentActorId); return; }
        startAssault(attacker, candidate, id === 'capture');
      },
    });
  }

  // §11/3: "Movement occurs before assault" — the charge move (and the Paragraph Check every hex
  // entry triggers during Rounds, §5/1) resolves first, then the assault itself.
  function startAssault(attacker, candidate, capture) {
    var defender = candidate.german;
    function resolve() {
      if (phase === 'over') return;
      assaultChain(attacker, defender, { capture: capture, charge: candidate.isCharge }, function () {
        if (phase !== 'over') { Sched.completeAction(track, currentActorId); renderTrack(); driveNext(); }
      });
    }
    if (!candidate.isCharge) { resolve(); return; }
    var fromHexId = attacker.hexId;
    attacker.hexId = defender.hexId;
    placeEl(counterEls[attacker.id], defender.hexId);
    infoPopup({
      actor: attacker, title: 'Charge Assault — Move',
      bodyHtml: attacker.name + ' charges ' + fromHexId + ' &rarr; ' + defender.hexId +
        ' (' + TERRAIN_LABELS[REAL_TERRAIN[defender.hexId]] + '), spending ' + candidate.cost +
        ' of his ' + candidate.budget + ' charge MP.',
    }, function () { runParagraphCheck(attacker, resolve, { skipEventCheck: true }); });
  }
  function disableActionButtons() {
    document.getElementById('moveBtn').disabled = true;
    document.getElementById('fireAimed').disabled = true;
    document.getElementById('fireSnap').disabled = true;
    document.getElementById('assaultBtn').disabled = true;
    document.getElementById('grenadeBtn').disabled = true;
    document.getElementById('dragBtn').disabled = true;
    document.getElementById('giveTurnBtn').disabled = true;
    document.getElementById('makeAwareBtn').disabled = true;
    document.getElementById('changeStanceBtn').disabled = true;
    document.getElementById('prepareWeaponBtn').disabled = true;
    document.getElementById('pickupBtn').disabled = true;
    document.getElementById('clearJamBtn').disabled = true;
    document.getElementById('passTurn').disabled = true;
  }

  // §9/4 "Clearing a Jammed Weapon": one die, cross-referenced against the soldier's Weapon Skill
  // (§14's -1 for a captured weapon doesn't apply — no US soldier can be issued one yet, docs/24
  // §1). Same procedure "regardless of when it is done" (Operations or Rounds), so both callers
  // below share this one resolver; only what happens after (an Action-Round turn vs. nothing to
  // consume) differs.
  function clearJamRoll(s, cb) {
    var weapon = weaponById(s.weaponId);
    rollPopup({
      actor: s, title: 'Clear Jammed Weapon', kind: 'single', 
      contextHtml: 'Weapon: ' + weapon.name + ' &middot; WS ' + fmtSigned(s.WS) + '.',
      explain: function (roll) {
        var res = FC.resolveClearJammedWeapon(s.WS, false, roll, CHART.CLEAR_JAM_CHART).result;
        return res === 'clear' ? '<b style="color:var(--clear)">CLEARED</b> &mdash; the weapon works normally again.'
          : res === 'jam' ? 'Still <b style="color:#e05a4a;">JAMMED</b>.'
          : '<b style="color:#e05a4a;">BROKEN</b> &mdash; unusable for the rest of the game.';
      },
      logText: function (roll) {
        var res = FC.resolveClearJammedWeapon(s.WS, false, roll, CHART.CLEAR_JAM_CHART).result;
        return s.name + ' attempts to clear his jammed ' + weapon.name + ': <span class="roll">' + roll + '</span> &rarr; ' + res.toUpperCase() + '.';
      },
    }, function (roll) {
      var res = FC.resolveClearJammedWeapon(s.WS, false, roll, CHART.CLEAR_JAM_CHART).result;
      if (res === 'clear') s.weaponJammed = false;
      else if (res === 'break') { s.weaponJammed = false; s.weaponBroken = true; }
      cb();
    });
  }
  document.getElementById('clearJamBtn').addEventListener('click', function () {
    var s = findSoldier(currentActorId);
    if (!canClearJam(s)) return;
    disableActionButtons();
    clearJamRoll(s, function () { if (phase !== 'over') { Sched.completeAction(track, currentActorId); renderTrack(); driveNext(); } });
  });

  function estimateHitChance(firer, target, fireType) {
    var b = estimateHitChanceBreakdown(firer, target, fireType);
    return b ? b.clamped : -Infinity;
  }


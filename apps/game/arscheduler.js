/*
 * arscheduler.js — Phase 8 Action Round scheduler (docs/23_ACTION_ROUND_SCHEDULER.md)
 *
 * Pure state machine, no DOM, no dice. Owns the mutable "track" state that walks a single
 * Round through 2-Turn-advantage -> 2-Turn-disadvantage -> 1-Turn-advantage -> 1-Turn-
 * disadvantage (§6/1), including a 2-Turn soldier's marker demoting mid-Round and acting again
 * later in the SAME pass, and commanders dynamically giving turns (§6/3). Decides WHO acts WHEN
 * and in WHAT ORDER; does not resolve what an action actually does (Phase 9/combat) or roll any
 * dice (all rolls/choices are opts the caller supplies, same convention as arrules.js and
 * operationsloop.js). Depends only on apps/game/arrules.js (window.AmbushActionRound) for the
 * actual rules decisions — data (the AR_TRACK chart) is always injected via opts.arTrack, never
 * read off window, so this module has no load-order dependency on assets/data/ar_track.js.
 *
 * Why a single forward pass through the 4 slots is enough to handle 2-Turn demotion: 2-Turn
 * slots always precede their matching 1-Turn slot in SLOT_ORDER, so a soldier demoted mid-pass
 * is always demoted *forward* into a not-yet-processed slot, never backward into one already
 * exhausted. The same is true for giving turns (Complete -> 1-Turn, or 1-Turn -> 2-Turn) EXCEPT
 * the 1-Turn -> 2-Turn promotion, which targets an *earlier* slot — giveTurn explicitly rejects
 * that once the target slot's index is behind the current cursor (see 'slot-already-passed').
 *
 * Also covers combat's effect on a scheduled soldier's marker (§13/2-13/4, added when Phase 9's
 * fire combat needed it — see docs/25_MECHANIC_TEST.md): applyWoundedStatus (loses remaining
 * turns, marker to Complete) and removeFromRound (incapacitated/killed, marker to a new Inactive
 * bucket, out of the Round and out of future ones). Both act on a soldier regardless of whose
 * turn it currently is, since combat damage isn't limited to the current actor.
 */
(function () {
  'use strict';

  var AR = window.AmbushActionRound;

  var SLOT_ORDER = ['2adv', '2disadv', '1adv', '1disadv'];
  var WALK_SLOTS = { '2adv': true, '2disadv': true, '1adv': true, '1disadv': true };

  // ---- Initial AR Marker Placement (§6/1 step 2) ------------------------------
  // opts: {
  //   round, advantageSide: 'US'|'german', arTrack,
  //   roster: [{ id, side:'US'|'german', IN, wounded, isCommander, isActive, hexId, letter,
  //     placement }],
  //     // letter required for side==='german' (used for turn-order tie-break); ignored for US.
  //     // placement (optional): 'unaware' | 'complete' — bypasses the initiative roll entirely
  //     // and places the marker directly in that slot (§6/5 US Awareness, Rounds 1-2 only: a
  //     // still-unaware soldier goes straight to Unaware; a soldier who just passed this
  //     // Round's Awareness Check goes straight to Complete rather than a real turn slot — the
  //     // rulebook's own wording for both triggers, §6/5's Awareness Phase and its "unaware
  //     // soldier who is attacked" case). Omit for normal roll-based placement.
  //     receivesTwoTurns (optional): a contact paragraph's "receives 2 turns this Round" —
  //     §6/1: "If the number of turns is specified, then the procedure above is not
  //     conducted", so no roll: 2-Turn space on his side's half (1-Turn if wounded).
  //   rollDie: function(rosterEntry) -> 0..9, // not called for entries with `placement` set
  //   computeInCommand: optional function(rosterEntry, usRoster) -> bool — overrides the default
  //     (AR.commandContributors + AR.isInCommand against the rest of the active US roster).
  //     Command has no effect on German markers (§6/3: German panic never depends on red
  //     numbers/command, only on landing in the Panic space outright), so it's only computed
  //     for US entries.
  // }
  // Inactive roster entries (isActive === false) are skipped entirely — out of the Round, not
  // merely deferred. Returns a new track object.
  function placeMarkers(opts) {
    var track = {
      round: opts.round || 1,
      advantageSide: opts.advantageSide,
      cursorIndex: 0,
      slots: { '2adv': [], '2disadv': [], '1adv': [], '1disadv': [], panic: [], complete: [], inactive: [], unaware: [] },
      soldiers: {},
    };

    var active = opts.roster.filter(function (s) { return s.isActive; });
    var usRoster = active.filter(function (s) { return s.side === 'US'; });

    active.forEach(function (entry) {
      if (entry.placement) {
        track.soldiers[entry.id] = {
          id: entry.id, side: entry.side, IN: entry.IN, wounded: !!entry.wounded,
          isCommander: !!entry.isCommander, hexId: entry.hexId, letter: entry.letter || null,
          slot: entry.placement, wasTwoTurn: false, actionsDone: 0,
        };
        track.slots[entry.placement].push(entry.id);
        return;
      }
      if (entry.receivesTwoTurns) {
        var two = !entry.wounded;
        var forcedSlot = (two ? '2' : '1') + (entry.side === track.advantageSide ? 'adv' : 'disadv');
        track.soldiers[entry.id] = {
          id: entry.id, side: entry.side, IN: entry.IN, wounded: !!entry.wounded,
          isCommander: !!entry.isCommander, hexId: entry.hexId, letter: entry.letter || null,
          slot: forcedSlot, wasTwoTurn: two, actionsDone: 0,
        };
        track.slots[forcedSlot].push(entry.id);
        return;
      }
      var roll = opts.rollDie(entry);
      var classified = AR.classifyARRoll(opts.arTrack, entry.IN, roll);

      var placementOpts;
      if (entry.side === 'US' && classified.isRed) {
        var inCommand = opts.computeInCommand
          ? opts.computeInCommand(entry, usRoster)
          : AR.isInCommand(entry.IN, AR.commandContributors(entry.hexId, usRoster.filter(function (s) { return s.id !== entry.id; })));
        placementOpts = { space: 'red', wounded: entry.wounded, inCommand: inCommand, spaceIfInCommand: classified.space };
      } else {
        // Red has no effect on German markers (§6/3) — resolve directly off the classified
        // space, ignoring isRed, regardless of what classifyARRoll reported.
        placementOpts = { space: classified.space, wounded: entry.wounded };
      }

      var placement = AR.resolveMarkerPlacement(placementOpts);
      var wasTwoTurn = placement.outcome === 'turns' && placement.turns === 2;
      var slotKey;
      if (placement.outcome === 'panic') {
        slotKey = 'panic';
      } else if (wasTwoTurn) {
        slotKey = entry.side === track.advantageSide ? '2adv' : '2disadv';
      } else {
        slotKey = entry.side === track.advantageSide ? '1adv' : '1disadv';
      }

      track.soldiers[entry.id] = {
        id: entry.id, side: entry.side, IN: entry.IN, wounded: !!entry.wounded,
        isCommander: !!entry.isCommander, hexId: entry.hexId, letter: entry.letter || null,
        slot: slotKey, wasTwoTurn: wasTwoTurn, actionsDone: 0,
      };
      track.slots[slotKey].push(entry.id);
    });

    return track;
  }

  // ---- internal helpers --------------------------------------------------------
  function advanceCursorPastEmptySlots(track) {
    while (track.cursorIndex < SLOT_ORDER.length && track.slots[SLOT_ORDER[track.cursorIndex]].length === 0) {
      track.cursorIndex++;
    }
  }

  // The soldier who would legally act next within `slotKey`'s current occupants — German:
  // alphabetically-first by letter (§6/1, not overridable); US: opts.chooseUS if supplied, else
  // array/insertion order.
  function frontOfSlot(track, slotKey, opts) {
    var occupants = track.slots[slotKey];
    if (!occupants.length) return null;
    var side = track.soldiers[occupants[0]].side;
    if (side === 'german') {
      return occupants.slice().sort(function (a, b) {
        return track.soldiers[a].letter < track.soldiers[b].letter ? -1 : 1;
      })[0];
    }
    if (opts && opts.chooseUS) return opts.chooseUS(occupants.slice(), track);
    return occupants[0];
  }

  function abstractCategory(slotKey) {
    if (slotKey === '2adv' || slotKey === '2disadv') return '2turn';
    if (slotKey === '1adv' || slotKey === '1disadv') return '1turn';
    return slotKey; // 'panic' | 'complete'
  }

  // Shared by completeAction and giveTurn's giver-side movement: "as if he had performed an
  // action" (§6/3) — a 2-Turn soldier's FIRST such call demotes him to the matching 1-Turn half
  // (picked up again later in the same pass); otherwise he's Complete.
  function advanceSoldierAfterAction(track, soldierId) {
    var soldier = track.soldiers[soldierId];
    if (soldier.wasTwoTurn && soldier.actionsDone === 0) {
      soldier.actionsDone = 1;
      var newSlot = soldier.side === track.advantageSide ? '1adv' : '1disadv';
      soldier.slot = newSlot;
      track.slots[newSlot].push(soldierId);
      return newSlot;
    }
    soldier.actionsDone += 1;
    soldier.slot = 'complete';
    track.slots.complete.push(soldierId);
    return 'complete';
  }

  // Throws if soldierId isn't legally allowed to act right now (a caller bug — see file header
  // conventions: structural violations throw, rules-legality questions return {ok:false}).
  function assertCurrentActor(track, soldierId) {
    var soldier = track.soldiers[soldierId];
    if (!soldier) throw new Error('unknown soldier: ' + soldierId);
    advanceCursorPastEmptySlots(track);
    if (track.cursorIndex >= SLOT_ORDER.length) throw new Error('Round is already complete — no one can act');
    var currentSlotKey = SLOT_ORDER[track.cursorIndex];
    if (soldier.slot !== currentSlotKey) {
      throw new Error(soldierId + ' is in slot ' + soldier.slot + ', not the current slot ' + currentSlotKey);
    }
    var front = frontOfSlot(track, currentSlotKey, null);
    if (soldier.side === 'german' && front !== soldierId) {
      throw new Error(soldierId + ' cannot act before ' + front + ' (German turn order is alphabetical by letter, §6/1)');
    }
  }

  // ---- Iteration --------------------------------------------------------------
  // opts: { chooseUS: function(candidateIds, track) -> soldierId } (optional)
  function nextActor(track, opts) {
    advanceCursorPastEmptySlots(track);
    if (track.cursorIndex >= SLOT_ORDER.length) return { done: true };
    var slotKey = SLOT_ORDER[track.cursorIndex];
    var soldierId = frontOfSlot(track, slotKey, opts);
    var soldier = track.soldiers[soldierId];
    return { done: false, soldierId: soldierId, side: soldier.side, slot: slotKey, letter: soldier.letter };
  }

  // Read-only: current occupants of any slot (including 'panic'/'complete'), in the order
  // nextActor would offer them for the four walkable slots (letter-sorted for german slots,
  // insertion order for US ones); 'panic'/'complete' are returned in insertion order.
  function occupantsOf(track, slotKey) {
    var occupants = track.slots[slotKey];
    if (!WALK_SLOTS[slotKey] || !occupants.length) return occupants.slice();
    var side = track.soldiers[occupants[0]].side;
    if (side !== 'german') return occupants.slice();
    return occupants.slice().sort(function (a, b) {
      return track.soldiers[a].letter < track.soldiers[b].letter ? -1 : 1;
    });
  }

  function isRoundComplete(track) {
    advanceCursorPastEmptySlots(track);
    return track.cursorIndex >= SLOT_ORDER.length;
  }

  // ---- Recording a completed action (§6/1 step 3) ------------------------------
  function completeAction(track, soldierId) {
    assertCurrentActor(track, soldierId);
    var soldier = track.soldiers[soldierId];
    var idx = track.slots[soldier.slot].indexOf(soldierId);
    track.slots[soldier.slot].splice(idx, 1);
    var movedTo = advanceSoldierAfterAction(track, soldierId);
    return { soldierId: soldierId, movedTo: movedTo };
  }

  // ---- Giving a turn (§6/3, §6/7) ----------------------------------------------
  // Non-mutating eligibility query. Everything EXCEPT "is it currently giverId's turn" — a UI
  // would only ever surface this while giverId is the current actor, so that check lives only
  // in giveTurn itself, as a throw (structural), not here.
  function canGiveTurn(track, giverId, recipientId) {
    var giver = track.soldiers[giverId], recipient = track.soldiers[recipientId];
    if (!giver) throw new Error('unknown soldier: ' + giverId);
    if (!recipient) throw new Error('unknown soldier: ' + recipientId);

    if (!giver.isCommander) return { ok: false, reason: 'giver-not-commander' };
    if (recipient.side !== giver.side) return { ok: false, reason: 'recipient-not-friendly' };

    var radius = AR.commandRadiusHexIds(giver.hexId);
    if (radius.indexOf(recipient.hexId) === -1) return { ok: false, reason: 'recipient-out-of-radius' };

    var category = abstractCategory(recipient.slot);
    if (!AR.canReceiveGivenTurn(category, recipient.wounded)) return { ok: false, reason: 'recipient-not-eligible' };

    var targetSlot = category === 'complete'
      ? (recipient.side === track.advantageSide ? '1adv' : '1disadv')
      : (recipient.side === track.advantageSide ? '2adv' : '2disadv');

    advanceCursorPastEmptySlots(track);
    var targetIndex = SLOT_ORDER.indexOf(targetSlot);
    if (targetIndex < track.cursorIndex) return { ok: false, reason: 'slot-already-passed', targetSlot: targetSlot };

    return { ok: true, targetSlot: targetSlot };
  }

  // Mutating. Throws if giverId is not the track's current legal actor (same contract as
  // completeAction). On {ok:false} from canGiveTurn, makes NO state change and returns that
  // result unchanged. On success: promotes recipientId into targetSlot and advances giverId's
  // own marker exactly as completeAction would (he's spent his turn giving it away, §6/3).
  function giveTurn(track, giverId, recipientId) {
    assertCurrentActor(track, giverId);
    var check = canGiveTurn(track, giverId, recipientId);
    if (!check.ok) return check;

    var recipient = track.soldiers[recipientId];
    var fromIdx = track.slots[recipient.slot].indexOf(recipientId);
    track.slots[recipient.slot].splice(fromIdx, 1);
    recipient.slot = check.targetSlot;
    track.slots[check.targetSlot].push(recipientId);

    var giverIdx = track.slots[track.soldiers[giverId].slot].indexOf(giverId);
    track.slots[track.soldiers[giverId].slot].splice(giverIdx, 1);
    var giverMovedTo = advanceSoldierAfterAction(track, giverId);

    return { ok: true, recipient: { id: recipientId, movedTo: check.targetSlot }, giver: { id: giverId, movedTo: giverMovedTo } };
  }

  // ---- Combat damage hitting a soldier mid-Round (§13/2-13/4) ------------------
  // Phase 8 deliberately never modeled this — a scheduled soldier being wounded/incapacitated/
  // killed by combat is a Phase 9 event, and the scheduler previously had no entry point for
  // "something outside the normal act-and-advance flow just moved this soldier's marker."
  // Both functions work on a soldier regardless of whose turn it currently is (a wound can land
  // on a soldier who hasn't acted yet this Round), which is why they don't go through
  // assertCurrentActor — that check exists for the *acting* soldier, not an arbitrary casualty.

  // §13/2: "A wounded soldier loses any turns he has remaining in the current Round; move his AR
  // marker to the Complete space." Applies regardless of the soldier's current slot (including
  // Panic — a wound is a more specific, more severe status). A soldier already in Complete
  // (already acted this Round) is a no-op move, but `wounded` is still recorded for future
  // eligibility checks (canGiveTurn/canReceiveGivenTurn already gate on it).
  function applyWoundedStatus(track, soldierId) {
    var soldier = track.soldiers[soldierId];
    if (!soldier) throw new Error('unknown soldier: ' + soldierId);
    soldier.wounded = true;
    if (soldier.slot === 'complete') return { soldierId: soldierId, movedTo: 'complete' };
    var idx = track.slots[soldier.slot].indexOf(soldierId);
    if (idx !== -1) track.slots[soldier.slot].splice(idx, 1);
    soldier.slot = 'complete';
    track.slots.complete.push(soldierId);
    return { soldierId: soldierId, movedTo: 'complete' };
  }

  // §13/1: a Panic result during a Round is "identical to the Panic that can befall a soldier
  // during the Action Sequence... he loses any turns he has remaining in the current Round;
  // move his AR marker to the Panic space." Same shape as applyWoundedStatus, different target
  // slot, and no extra flag to set — abstractCategory/canReceiveGivenTurn already exclude the
  // Panic slot from give-turn eligibility without needing one.
  function applyPanicStatus(track, soldierId) {
    var soldier = track.soldiers[soldierId];
    if (!soldier) throw new Error('unknown soldier: ' + soldierId);
    if (soldier.slot === 'complete') return { soldierId: soldierId, movedTo: 'complete' };
    var idx = track.slots[soldier.slot].indexOf(soldierId);
    if (idx !== -1) track.slots[soldier.slot].splice(idx, 1);
    soldier.slot = 'panic';
    track.slots.panic.push(soldierId);
    return { soldierId: soldierId, movedTo: 'panic' };
  }

  // §6/5 / §11/4: "An unaware soldier who is attacked is automatically aware after the combat is
  // resolved. Place his marker in the Complete space, unless he is killed or incapacitated."
  // Same shape as applyWoundedStatus/applyPanicStatus (works regardless of whose turn it
  // currently is — an attack can land on a soldier who hasn't acted yet), always targeting
  // Complete since a soldier who *just* becomes aware doesn't also get a turn this Round (the
  // same placement the Awareness Phase itself uses for a check that just succeeded).
  function applyBecomesAware(track, soldierId) {
    var soldier = track.soldiers[soldierId];
    if (!soldier) throw new Error('unknown soldier: ' + soldierId);
    if (soldier.slot === 'complete' || soldier.slot === 'inactive') return { soldierId: soldierId, movedTo: soldier.slot };
    var idx = track.slots[soldier.slot].indexOf(soldierId);
    if (idx !== -1) track.slots[soldier.slot].splice(idx, 1);
    soldier.slot = 'complete';
    track.slots.complete.push(soldierId);
    return { soldierId: soldierId, movedTo: 'complete' };
  }

  // §13/3-13/4: an incapacitated or killed soldier "moves his AR marker to the Inactive space"
  // and takes no further part in the mission. Distinct from applyWoundedStatus's Complete —
  // Inactive soldiers are also skipped by any future Round's placeMarkers (isActive: false),
  // whereas a merely-wounded soldier is still placed (capped per §13/2's one-turn rule) next
  // Round. Idempotent if already inactive.
  function removeFromRound(track, soldierId) {
    var soldier = track.soldiers[soldierId];
    if (!soldier) throw new Error('unknown soldier: ' + soldierId);
    if (!track.slots.inactive) track.slots.inactive = [];
    if (soldier.slot === 'inactive') return { soldierId: soldierId, movedTo: 'inactive' };
    var idx = track.slots[soldier.slot].indexOf(soldierId);
    if (idx !== -1) track.slots[soldier.slot].splice(idx, 1);
    soldier.slot = 'inactive';
    track.slots.inactive.push(soldierId);
    return { soldierId: soldierId, movedTo: 'inactive' };
  }

  // ---- Mid-Round German activation (§6/6) --------------------------------------
  // "If activation occurs during a Round... interrupt whatever is happening and place the newly
  // activated German on the map... Ignore those parts of the paragraph dealing with advantage and
  // US awareness." The newly activated German always uses the track's OWN advantageSide, never a
  // fresh roll for that, and never touches US awareness (a mission-loop concern, outside this
  // module entirely). "If the paragraph states that the German receives two turns, place his AR
  // marker in the 2-Turn space... using the current advantage/disadvantage. If [not], roll a new
  // German Action number and place [him]... in the indicated space (again, using the current
  // advantage/disadvantage)."
  //
  // entry: { id, IN, hexId, letter, isCommander (optional — no activation paragraph in the
  //   current data ever targets a commander card, but not assumed here), receivesTwoTurns }
  // opts: { rollDie: function() -> 0..9, arTrack } — rollDie is never called when
  //   entry.receivesTwoTurns is true (that case has no roll at all, per the rule text above).
  //
  // The rulebook has no explicit answer for a German whose rolled/assigned slot has ALREADY been
  // passed by the cursor this Round (e.g. activated while the Round is already down to
  // 1disadv but he rolls a 2-Turn result) — parking him in Complete (present and tracked, but no
  // turn until next Round) rather than inventing a rule to reopen an exhausted slot is the same
  // bounded judgment call canGiveTurn already makes for its own 'slot-already-passed' case.
  // Returns { inserted: true, slot } if he joins the round's remaining action (including 'panic'),
  // or { inserted: false, slot: 'complete' } otherwise.
  function insertMidRoundGerman(track, entry, opts) {
    if (track.soldiers[entry.id]) throw new Error(entry.id + ' is already on this track');

    var targetSlot, wasTwoTurn;
    if (entry.receivesTwoTurns) {
      wasTwoTurn = true;
      targetSlot = track.advantageSide === 'german' ? '2adv' : '2disadv';
    } else {
      var roll = opts.rollDie();
      var classified = AR.classifyARRoll(opts.arTrack, entry.IN, roll);
      // Red has no effect on German markers (§6/3) — same as placeMarkers's German branch.
      var placement = AR.resolveMarkerPlacement({ space: classified.space, wounded: false });
      if (placement.outcome === 'panic') {
        track.soldiers[entry.id] = {
          id: entry.id, side: 'german', IN: entry.IN, wounded: false,
          isCommander: !!entry.isCommander, hexId: entry.hexId, letter: entry.letter || null,
          slot: 'panic', wasTwoTurn: false, actionsDone: 0,
        };
        track.slots.panic.push(entry.id);
        return { inserted: true, slot: 'panic' };
      }
      wasTwoTurn = placement.outcome === 'turns' && placement.turns === 2;
      targetSlot = wasTwoTurn
        ? (track.advantageSide === 'german' ? '2adv' : '2disadv')
        : (track.advantageSide === 'german' ? '1adv' : '1disadv');
    }

    advanceCursorPastEmptySlots(track);
    var targetIndex = SLOT_ORDER.indexOf(targetSlot);
    var inserted = targetIndex >= track.cursorIndex;
    var finalSlot = inserted ? targetSlot : 'complete';

    track.soldiers[entry.id] = {
      id: entry.id, side: 'german', IN: entry.IN, wounded: false,
      isCommander: !!entry.isCommander, hexId: entry.hexId, letter: entry.letter || null,
      slot: finalSlot, wasTwoTurn: inserted && wasTwoTurn, actionsDone: 0,
    };
    track.slots[finalSlot].push(entry.id);
    return { inserted: inserted, slot: finalSlot };
  }

  // "GE 33/V" -> "V" (the AR-marker identity letter, §6/2); "GE 19" (a table-less group card,
  // never gets its own AR marker) -> null.
  function letterFromGermanCardId(cardId) {
    var m = /\/([A-Za-z])$/.exec(cardId || '');
    return m ? m[1] : null;
  }

  window.AmbushARScheduler = {
    SLOT_ORDER: SLOT_ORDER,
    placeMarkers: placeMarkers,
    nextActor: nextActor,
    occupantsOf: occupantsOf,
    isRoundComplete: isRoundComplete,
    completeAction: completeAction,
    canGiveTurn: canGiveTurn,
    giveTurn: giveTurn,
    applyWoundedStatus: applyWoundedStatus,
    applyPanicStatus: applyPanicStatus,
    applyBecomesAware: applyBecomesAware,
    removeFromRound: removeFromRound,
    insertMidRoundGerman: insertMidRoundGerman,
    letterFromGermanCardId: letterFromGermanCardId,
  };
})();

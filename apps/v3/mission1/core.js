'use strict';
// mission1/core.js (1 of 13) — engine and data aliases, constants, terrain/LOS tables, weapon rules, VP target, difficulty. Stage A cut of mission1.js lines 1-22, 25-365 (docs/REFACTOR_MAP.md 5.4).
/*
 * mission1.js — Ambush! Digital v3, Mission 1: the presentation and game flow over v2's rules engine
 *
 * Loaded by apps/v3/index.html after the 19 rules modules (apps/game/*.js) and the data globals
 * (assets/data/*.js). Everything a player sees and does in Mission 1 runs here: squad generation
 * (§4), entry, Operations, contact paragraphs, Action Rounds, the combat suite (fire, grenade,
 * assault, crew weapons, hazards), Port Box / Ammo Box equipment (EQ, §4 and §13/2), saves, and
 * Victory Points against Mission 1's two endings. Every roll is a d10() in a fixed order, shown on
 * a resolution card (Resolve) and on the board (FX, Info). Exposes window.AmbushMission (the shell,
 * stack and lessons) and window.__mission1Debug (tools/bot and the live_*.py drives).
 *
 * JUDGMENT CALLS (2026-08-04/05, "for any questionable rule, make a judgement call... flag them"):
 *  - German card IDs "25" and "81", referenced by real Mission 1 paragraph programs
 *    (assets/data/paragraph_programs.js), do not exist in the 47-card transcribed roster
 *    (assets/data/german_roster.json). They are substituted with GE 33/V
 *    (GERMAN_FALLBACK_CARD_ID), logged every time, never silently.
 *  - Mission 1 Ending 1's "heights ... from which he can see all the road hexes on the map" is
 *    approximated by a hardcoded hex set (HEIGHTS_CANDIDATE_HEXES, the Q19-Y13 elevation line);
 *    occupying one satisfies the condition without a line-of-sight check to every road hex.
 *  - Squad buying is auto-resolved (squadgenrules.js's autoBuySoldiers/autoBuyEquipment): §4 is
 *    rulebook-real, only the choice of what to buy is automated.
 */

  var ASSET = '../../assets/library/';
  function img(path) { return ASSET + path; }

  var UI = window.AmbushUI;
  UI.init('dialogs-root');
  var Toasts = UI.Toasts;
  var Dialogs = UI.Dialogs;
  var FloatDialogs = UI.FloatDialogs;
  // Every dialog presented, for tools/bot/pacing.py via __mission1Debug.dialogLog(). Registered
  // here, before anything can push, so the start screen is counted too.
  var dialogLog = [];
  Dialogs.onPresent(function (spec) {
    if (!spec) return;
    dialogLog.push({ title: spec.title || '', rows: (spec.choices || []).length, modeless: !!spec.modeless,
      phase: document.getElementById('tb-phase').textContent });
  });

  // Floating, minimizable objective reminder — built in Phase 2 (docs/13_MESSAGE_SPEC.md) but
  // never wired into a real screen until now. "Minimize" = its own built-in close (✕), which
  // hides rather than destroys; the topbar button re-shows it with content intact.
  FloatDialogs.create('objectives', { title: 'Objectives', left: '20px', top: '60px' });
  document.getElementById('objectivesBtn').addEventListener('click', function () { FloatDialogs.show('objectives'); });
  document.getElementById('voiceBtn').addEventListener('click', function () {
    M1.voiceMuted = !M1.voiceMuted;
    if (M1.voiceMuted && window.speechSynthesis) window.speechSynthesis.cancel();
    var btn = document.getElementById('voiceBtn');
    btn.innerHTML = M1.voiceMuted ? '&#128263; Voice' : '&#128266; Voice';
    btn.title = 'Voice-over is ' + (M1.voiceMuted ? 'off' : 'on');
    btn.classList.toggle('active', !M1.voiceMuted);
  });

  var G = window.AmbushHexGrid;
  var M = window.AmbushMovement;
  var LOS = window.AmbushLOS;
  var Checks = window.AmbushChecks;
  var AR = window.AmbushActionRound;
  var Sched = window.AmbushARScheduler;
  var FC = window.AmbushFireCombat;
  var Gr = window.AmbushGrenades;
  var Asl = window.AmbushAssault;
  var CW = window.AmbushCrewWeapons;
  var SG = window.AmbushSquadGen;
  var EQ = window.AmbushEquipment;
  var V = window.AmbushVictory;
  var D = window.AmbushDifficulty;
  var Ops = window.AmbushOperations;
  var GAct = window.AmbushGermanActions;

  // Stage B (docs/REFACTOR_MAP.md 5.3): the shared game state, one object. Group A (what the save
  // holds) plus groundItems. Every file reads and writes M1.state.x; save.js serializes it.
  var M1 = window.AmbushM1 = {
    state: {
      phase: 'squadgen',         // squadgen | entry | movement | round | roundEnd | over
      usSoldiers: [],            // populated by squad generation
      germans: {},               // id -> german object, populated as activate_german fires
      opsState: null,
      // germanActivations: §2/1's Activation VP Award, banked the moment a German activates and kept
      // "regardless of what happens later". germanDefeats now contributes only the additive
      // Conditional award. awards: flat VP from paragraphs / ending bonuses. See victoryrules.js.
      vpState: { germanActivations: [], germanDefeats: [], usCasualties: [], awards: [] },
      track: null,
      currentActorId: null,
      roundNum: 0,
      currentGermanIdsThisRound: [],
      entryIndex: 0,
      selectedId: null,
      difficulty: D.NORMAL,
      // Task #68 (docs/37_PICKUP_EXCHANGE.md): items lying in a hex with no soldier currently
      // carrying them: hexId -> array of { id, kind: 'port'|'ammo' }. Populated by wound-loss
      // overflow (§13/2, Task #61).
      groundItems: {}
    }
  };

  var CHART = window.AMBUSH_WEAPON_CHART;
  var SQCHART = window.AMBUSH_SQUAD_GEN;
  var TERRAIN = window.AMBUSH_TERRAIN_A;
  var LOS_DB = window.AMBUSH_LOS_A;
  var GERMAN_ROSTER = window.AMBUSH_GERMAN_ROSTER.soldiers;
  var MISSION = window.AMBUSH_MISSIONS.missions['1'];
  var PARAGRAPHS = window.AMBUSH_PARAGRAPHS.paragraphs;
  var MISSION_CARDS = window.AMBUSH_MISSION_CARDS.mission_cards;
  var MISSION_CARDS_MOVEMENT = window.AMBUSH_MISSION_CARDS_MOVEMENT.mission_cards_movement;
  var PROGRAMS = window.AMBUSH_PARAGRAPH_PROGRAMS;
  var GERMAN_ACTION_PROGRAMS = window.AMBUSH_GERMAN_ACTION_PROGRAMS;

  var TERRAIN_LABELS = {
    clear1: 'Clear', clear2: 'Clear', clear3: 'Clear', cover: 'Cover', brush: 'Brush',
    rough: 'Rough', woods: 'Woods', water: 'Stream', road: 'Road', dirt_road: 'Dirt Road',
    bridge: 'Bridge', ford: 'Ford', building: 'Building', interior: 'Interior',
    second_story: 'Second Story', railroad: 'Railroad', crater: 'Crater', rubble: 'Rubble',
  };
  var TERRAIN_ROW = {
    clear1: 0, clear2: 0, clear3: 0, road: 0, dirt_road: 0, bridge: 0, ford: 0, water: 0,
    cover: 1, brush: 2, rough: 3, rubble: 4, crater: 4, woods: 5,
    building: 7, interior: 7, second_story: 7,
  };
  // The chart splits building interiors into two rows and the difference is large:
  //   row 6  "Interior, aperture NOT adjacent"       [-2, -4, no shot]
  //   row 7  "Interior, aperture adjacent / none"    [-1, -2, -3]
  // A firer standing in the hex immediately across the aperture gets the easier row 7; one
  // shooting from further off, through that same aperture, gets row 6. Which row applies is
  // therefore a fact about the PAIR, not about the target's hex alone.
  var TERRAIN_ROW_INTERIOR_FAR = 6;

  // JUDGMENT CALL — Mission 1 Ending 1's "heights" hex set (see file header).
  var HEIGHTS_CANDIDATE_HEXES = { Q19: true, T17: true, V15: true, X14: true, Y13: true };
  var ENTRY_HEXES = ['A1', 'B1', 'C1', 'D1', 'E1', 'F1', 'G1', 'H1', 'I1', 'J1'];
  var GERMAN_FALLBACK_CARD_ID = 'GE 33/V';

  // ---------------------------------------------------------------------
  // Data prep — same convention as every earlier demo (movementsandboxdemo.js/skirmishdemo.js):
  // two independently loaded real datasets, movement's and LOS's, not unified.
  // ---------------------------------------------------------------------
  var REAL_TERRAIN = {};
  TERRAIN.hexes.forEach(function (h) { REAL_TERRAIN[h.id] = h.terrain_guess; });
  var LOS_TERRAIN = {}, LOS_ELEV = {};
  Object.keys(LOS_DB.hexes).forEach(function (id) {
    LOS_TERRAIN[id] = LOS_DB.hexes[id].terrain;
    LOS_ELEV[id] = LOS_DB.hexes[id].elevation != null ? LOS_DB.hexes[id].elevation : 1;
  });
  var edgeFeatures = LOS.buildEdgeFeatures(LOS_DB.hexes);
  // Same key convention as losrules.buildEdgeFeatures (unordered pair, lexicographic).
  function edgeFeatureBetween(a, b) {
    return edgeFeatures[a < b ? a + '|' + b : b + '|' + a];
  }
  // §8/2's aperture rules are stance-dependent, so any sight question about two SOLDIERS has to
  // pass their stances. `losClear` keeps the plain hex-to-hex signature for the questions that
  // are genuinely about terrain (a paragraph asking whether a hex is observable, a grenade's
  // -3 out-of-sight modifier); `losClearBetween` is the soldier-to-soldier form and is what fire,
  // assault and awareness use. Omitting a stance means 'standing', the most permissive, so a
  // caller that has no soldier can never accidentally get a stricter answer than terrain implies.
  function losClear(fromId, toId, fromStance, toStance) {
    return !LOS.traceLOS({
      fromId: fromId, toId: toId, elevationByHexId: LOS_ELEV, terrainByHexId: LOS_TERRAIN,
      edgeFeatures: edgeFeatures, fromStance: fromStance, toStance: toStance,
    }).blocked;
  }
  function losClearBetween(a, b) {
    return losClear(a.hexId, b.hexId, a.stance, b.stance);
  }
  function terrainRowFor(hexId) {
    var row = TERRAIN_ROW[LOS_TERRAIN[hexId]];
    return row === undefined ? 0 : row;
  }
  // The pair-aware form. Identical to terrainRowFor everywhere except a building interior, where
  // it picks row 6 or row 7 depending on whether the firer is adjacent to the aperture he is
  // shooting through — which, since apertures sit on hexsides, is the same question as "is the
  // firer in a hex bordering the target's building hex".
  function terrainRowForTarget(firer, target) {
    var row = terrainRowFor(target.hexId);
    if (!LOS.BUILDING_TERRAIN[LOS_TERRAIN[target.hexId]]) return row;
    var adjacent = FC.hexDistance(firer.hexId, target.hexId) === 1;
    if (adjacent && edgeFeatureBetween(firer.hexId, target.hexId)) return row; // row 7, at the aperture
    return adjacent ? row : TERRAIN_ROW_INTERIOR_FAR;
  }
  // Paragraph data writes hex ids in the printed, hyphenated form the paragraph prose itself uses
  // ("T-8", "Q-11", "U-9"); the hex grid, terrain and LOS databases all key on the compact form
  // ("T8"). Every `hex` field in assets/data/paragraph_programs.js is hyphenated — checked across
  // all four ops that carry one (activate_german, if_soldiers_can_see, pc_check_los,
  // place_landmark).
  //
  // REAL BUG, fixed: only activate_german converted, inline. if_soldiers_can_see and pc_check_los
  // passed the raw "T-8" straight into losClear, where parseId returned null and the LOS trace
  // threw on null.colIdx — an UNCAUGHT error that aborted the whole paragraph chain mid-flight, so
  // the paragraph's effects never applied. Those two ops gate four of Mission 1's seven German
  // activations (paragraphs 347, 452, 611, 612 → Germans 25, 53, 34, 1 and 81) plus six
  // Perception-check-by-LOS branches, so a large share of the mission's reachable VP was
  // unreachable and a large share of its scripted drama silently never fired. Found by the
  // automated player (tools/bot/) walking into U-9 and tripping the pc_check_los branch.
  function paragraphHex(h) {
    return h ? String(h).replace('-', '') : h;
  }
  function weaponById(id) { return CHART.WEAPON_CHART.find(function (w) { return w.id === id; }); }
  function weaponMaxRange(weapon) { return weapon.long ? weapon.long[1] : 1; }
  // §9/4: "A jammed weapon cannot be used again until the jam is cleared. A broken weapon cannot
  // be used for the remainder of the game." Single-use explosive rounds (ammo:'A') can jam but
  // are never eligible for the Clear Jammed Weapon action (§9/4's own text, and firecombat.js's
  // resolveClearJammedWeapon header) — moot for now since no soldier is ever issued one, but the
  // eligibility check belongs here regardless, per that function's own "caller's job" comment.
  // Task #62 (docs/34_AMMO_DEPLETION.md): §9/5 "a crouching or standing soldier can fire any
  // weapon he possesses if he has at least one clip of ammo for the weapon" — folded into the
  // same usability gate as jammed/broken, since all three are "can this soldier actually fire"
  // conditions. Germans are exempt: "German soldiers do not have Ammo Boxes and do not expend
  // ammo clips when firing... Germans can run out of ammunition as a result of a paragraph" —
  // that paragraph-driven mechanic isn't modelled anywhere in this codebase, so a German is
  // never treated as out of ammo by this general check.
  //
  // Task #69 (docs/43_PREPARE_WEAPON.md): "Personal weapons need not be prepared to fire" — only
  // crew weapons need this gate. Bazookas/satchel charges deliberately excluded: neither is ever
  // purchased, distributed, or pickup-able by any soldier in this build (same "never reachable
  // with current data" status crewweaponrules.js's own header and docs/26/#63's satchel note
  // already flag), so tracking their prepared state would be dead code. mmg is the one
  // realistically reachable case — several German cards carry a Light Machinegun.
  var WEAPONS_REQUIRING_PREPARATION = { mmg: true };
  //
  // §9/7 Crew Weapons (Task A1). crewweaponrules.js has held the rules since Phase 9 and nothing
  // ever called it, so an MMG picked up off a German casualty fired exactly like a rifle. The
  // reachable crew weapon in this build is the MMG — several German cards carry a Light
  // Machinegun, and Pick Up/Exchange Equipment (Task #68) can put one in a US soldier's hands.
  //
  // Bazookas (§9/8) stay unwired on purpose: no bazooka is ever purchased, distributed or
  // pickup-able with the current data, so `bazookaCanSnapFire`/`canPrepareBazooka`/
  // `bazookaSplashWeaponId` would be dead code behind an unreachable branch. That is the same
  // status crewweaponrules.js's own header and the WEAPONS_REQUIRING_PREPARATION note above
  // already record. If a bazooka ever becomes obtainable, wire those three here.
  var CREW_WEAPONS = { mmg: true };
  function isCrewWeapon(weaponId) { return !!CREW_WEAPONS[weaponId]; }
  // The crew-weapon rules are about the WEAPON, but this build has no weapon objects — a weapon
  // is a `weaponId` on a soldier. So the weapon's per-Round state lives on whoever holds it, and
  // travels with it if it is handed on. Reset at the top of each Round, like every other
  // per-Round flag.
  function crewFiredThisRound(s) { return s.crewFiredBy || (s.crewFiredBy = []); }
  // §9/7: "A soldier must be crouching to fire a crew weapon." Applies to both sides.
  function crewWeaponStanceOk(s) { return CW.canFireCrewWeapon(s.stance); }
  // Soldiers who could crew the weapon alongside its holder: same side, same hex, active,
  // crouching, and not already excluded by the two-soldiers-per-Round cap.
  function crewMates(s) {
    if (!isCrewWeapon(s.weaponId)) return [];
    var side = s.side === 'german' ? M1.activeGermans() : M1.activeUS();
    return side.filter(function (o) {
      return o.id !== s.id && o.hexId === s.hexId && CW.canFireCrewWeapon(o.stance)
        && CW.canSoldierJoinCrewWeaponRound(crewFiredThisRound(s), o.id);
    });
  }
  // What §9/7 allows this firer right now. `aimed` needs a second crewman; `snap` never does.
  // The holder himself must also still be under the cap — a third distinct soldier cannot pick
  // the weapon up and fire it in the same Round.
  // §11/2: "A US soldier guarding a captured enemy soldier can perform all Actions normally
  // during Rounds, with the exception of firing a crew weapon." Guard is not a tracked field by
  // design (docs/46) — whoever shares the prisoner's hex is his guard — so this is simply "is
  // there a prisoner in my hex". docs/46 flagged this rule as NOT built *because* crew weapons
  // were never wired; A1 wired them, so it costs one condition now.
  function guardsAPrisoner(s) {
    return s.side !== 'german' && capturedGermansAt(s.hexId).length > 0;
  }
  function crewFireAvailability(s) {
    var mates = crewMates(s);
    var opts = CW.crewFireOptions(1 + mates.length);
    // §11/2. Note this covers the crewmate too, without a second test: a crewmate must be in the
    // holder's own hex, and "guarding" under docs/46's model means being in the prisoner's hex —
    // so holder and mate are always guards together or not at all. Filtering the mates as well
    // would be provably dead code, and it was, so it isn't here.
    var holderMayFire = CW.canSoldierJoinCrewWeaponRound(crewFiredThisRound(s), s.id)
      && !guardsAPrisoner(s);
    return {
      mates: mates,
      snap: holderMayFire && opts.canSnapSolo,
      aimed: holderMayFire && opts.canAimedCombined && mates.length > 0,
    };
  }
  // §6/7/§9/7: "A machinegun that is prepared remains prepared until it is moved" — applies to
  // either side, so both US and German movement paths call this. Returns whether it actually
  // changed anything (for callers that want to say so in a log line).
  function unprepareWeaponOnMove(s) {
    if (WEAPONS_REQUIRING_PREPARATION[s.weaponId] && s.weaponPrepared) { s.weaponPrepared = false; return true; }
    return false;
  }
  function weaponUsable(s) {
    if (s.weaponJammed || s.weaponBroken) return false;
    if (WEAPONS_REQUIRING_PREPARATION[s.weaponId] && !s.weaponPrepared) return false;
    // Germans have no Ammo Boxes (§9/5) so they never run dry, but an unarmed card (GE 42/Q's
    // "No weapon", a vehicle) has nothing to fire — and canFireAt would otherwise look up an
    // undefined weapon and throw on weaponMaxRange.
    if (s.side === 'german') return !!s.weaponId;
    return !!s.weaponId && EQ.hasAmmo(s.inventory, s.weaponId);
  }
  // §5/3, §6/7: "A soldier that is standing or crouching can..." (pick up, prepare a weapon,
  // clear a jam): not prone.
  function upright(s) { return s.stance === 'standing' || s.stance === 'crouching'; }
  function canClearJam(s) {
    return !!s && s.weaponJammed && upright(s) && weaponById(s.weaponId).ammo !== 'A';
  }
  // §5/3/§6/7 (Task #69, docs/43_PREPARE_WEAPON.md): "A standing or crouching soldier can
  // prepare a weapon that requires preparation before it can be fired."
  function canPrepareWeapon(s) {
    return !!s && !!WEAPONS_REQUIRING_PREPARATION[s.weaponId] && !s.weaponPrepared && upright(s);
  }

  // Real card-number -> real Card ID map ("32" -> "GE 32/S"), built from the actual roster.
  var GERMAN_BY_NUMBER = {};
  Object.keys(GERMAN_ROSTER).forEach(function (cardId) {
    var m = /^GE (\d+)/.exec(cardId);
    if (m) GERMAN_BY_NUMBER[m[1]] = cardId;
  });
  function resolveGermanCardId(numericId) {
    if (GERMAN_BY_NUMBER[numericId]) return GERMAN_BY_NUMBER[numericId];
    M1.logLine('<b style="color:#e05a4a;">German card #' + numericId + ' referenced by the paragraph book has no transcribed roster entry — substituting ' + GERMAN_FALLBACK_CARD_ID + ' (judgment call, see file header).</b>', 'event');
    return GERMAN_FALLBACK_CARD_ID;
  }
  // The key a German is actually stored under in `germans`, which is NOT always his card id.
  //
  // REAL BUG, fixed: Mission 1's paragraphs activate seven distinct German identity numbers (1, 9,
  // 15, 25, 34, 53, 81), but two of them — 25 and 81 — have no transcribed roster card, so
  // resolveGermanCardId substitutes the same GE 33/V for both. Keying `germans` by that shared
  // card id collapsed two different soldiers into one counter, with two visible consequences:
  // whichever activated second was silently swallowed by the "already active" check and never
  // appeared (German 25 is Mission 1's most-referenced opponent — eight separate paragraphs
  // activate him), and if the first one had been killed, the second activation instead
  // RESURRECTED him — same key, fresh object, `isActive` back to true, and a second Activation VP
  // award banked for a soldier the player had already been paid for.
  //
  // Substituted Germans are therefore keyed by their paragraph-book identity number, so 25 and 81
  // are two separate soldiers who happen to share one stat card. Germans with a real card of
  // their own are unaffected — their card id is already unique — so no save, test, or existing
  // lookup changes shape. Known cosmetic limit: both instances draw the same counter art, since
  // that comes from the card id (Sched.letterFromGermanCardId); harmless, and the alternative is
  // inventing art for a card the project doesn't have.
  function germanInstanceId(numericId) {
    if (GERMAN_BY_NUMBER[numericId]) return GERMAN_BY_NUMBER[numericId];
    return GERMAN_FALLBACK_CARD_ID + ' #' + numericId;
  }

  // ---------------------------------------------------------------------
  // Victory target (victoryrules.js computeReachableVP/scaleRequirement — read that file's own
  // comment for the full reasoning).
  //
  // Mission 1's printed requirement is 13 VP. Measured against this build's actual data, a
  // flawless maximum run cannot comfortably clear that, because only seven German identity
  // numbers appear in any annotated activate_german op and no paragraph ever awards flat VP —
  // the target was inherited from the rulebook, the VP supply was not. So the requirement is
  // scaled to what is genuinely reachable here, and BOTH numbers are shown to the player rather
  // than quietly swapping one for the other.
  //
  // Computed once at load from real data, so it self-corrects: annotate more activating
  // paragraphs, or transcribe the missing German cards, and the target rises on its own back
  // toward 13 with no code change. ENDING_1_VP_BONUS is Mission 1's own "+4 additional Victory
  // Points" for accomplishing the mission (missions.json victory text), the same 4 awarded in
  // checkEndingConditions.
  var VP_REQUIREMENT_RULEBOOK = 13;
  var ENDING_1_VP_BONUS = 4;
  var vpReachable = V.computeReachableVP({
    programs: PROGRAMS,
    // Deliberately not resolveGermanCardId(): that one writes a "no transcribed roster entry"
    // line to the play log, which belongs to a real in-game activation, not to a bookkeeping
    // sweep that runs before the player has even started.
    cardVPForGermanId: function (numericId) {
      var card = GERMAN_ROSTER[GERMAN_BY_NUMBER[numericId] || GERMAN_FALLBACK_CARD_ID];
      return card ? card.VP : '';
    },
    instanceKeyForGermanId: germanInstanceId,
    endingBonus: ENDING_1_VP_BONUS,
  });
  // Difficulty is chosen on the start screen, after this file has loaded, so the target cannot be
  // a fixed value computed here — it is recomputed whenever the level changes. The reachable
  // CEILING above is difficulty-independent (it is a property of the paragraph data); only the
  // margin below it moves.
  var vpTarget = V.scaleRequirement(vpReachable.ceiling, VP_REQUIREMENT_RULEBOOK, D.vpMargin(M1.state.difficulty));
  function setDifficulty(level) {
    M1.state.difficulty = level;
    vpTarget = V.scaleRequirement(vpReachable.ceiling, VP_REQUIREMENT_RULEBOOK, D.vpMargin(M1.state.difficulty));
    var badge = document.getElementById('tb-difficulty');
    if (badge) badge.textContent = D.label(M1.state.difficulty);
    M1.renderVP();
  }
  function vpRequirement() { return vpTarget.requirement; }
  // One sentence explaining the scaled number wherever it's shown, or '' when nothing was scaled.
  function vpTargetNote() {
    if (!vpTarget.wasScaled) return '';
    return 'The rulebook asks for ' + VP_REQUIREMENT_RULEBOOK + ' VP. This build\'s paragraph data can yield at most ' +
      vpTarget.ceiling + ' VP even on a perfect run (' + vpReachable.germans.length +
      ' activatable Germans, plus ' + ENDING_1_VP_BONUS + ' for Ending 1), so the target is ' +
      vpTarget.requirement + ' — leaving ' + vpTarget.margin + ' VP of headroom, about three casualties\' worth.';
  }


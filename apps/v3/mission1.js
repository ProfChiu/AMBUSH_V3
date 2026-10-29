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
(function () {
  'use strict';

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
    voiceMuted = !voiceMuted;
    if (voiceMuted && window.speechSynthesis) window.speechSynthesis.cancel();
    var btn = document.getElementById('voiceBtn');
    btn.innerHTML = voiceMuted ? '&#128263; Voice' : '&#128266; Voice';
    btn.title = 'Voice-over is ' + (voiceMuted ? 'off' : 'on');
    btn.classList.toggle('active', !voiceMuted);
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
    var side = s.side === 'german' ? activeGermans() : activeUS();
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
  function canClearJam(s) {
    return !!s && s.weaponJammed && (s.stance === 'standing' || s.stance === 'crouching') && weaponById(s.weaponId).ammo !== 'A';
  }
  // §5/3/§6/7 (Task #69, docs/43_PREPARE_WEAPON.md): "A standing or crouching soldier can
  // prepare a weapon that requires preparation before it can be fired."
  function canPrepareWeapon(s) {
    return !!s && !!WEAPONS_REQUIRING_PREPARATION[s.weaponId] && !s.weaponPrepared && (s.stance === 'standing' || s.stance === 'crouching');
  }

  // Real card-number -> real Card ID map ("32" -> "GE 32/S"), built from the actual roster.
  var GERMAN_BY_NUMBER = {};
  Object.keys(GERMAN_ROSTER).forEach(function (cardId) {
    var m = /^GE (\d+)/.exec(cardId);
    if (m) GERMAN_BY_NUMBER[m[1]] = cardId;
  });
  function resolveGermanCardId(numericId) {
    if (GERMAN_BY_NUMBER[numericId]) return GERMAN_BY_NUMBER[numericId];
    logLine('<b style="color:#e05a4a;">German card #' + numericId + ' referenced by the paragraph book has no transcribed roster entry — substituting ' + GERMAN_FALLBACK_CARD_ID + ' (judgment call, see file header).</b>', 'event');
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
  var difficulty = D.NORMAL;
  var vpTarget = V.scaleRequirement(vpReachable.ceiling, VP_REQUIREMENT_RULEBOOK, D.vpMargin(difficulty));
  function setDifficulty(level) {
    difficulty = level;
    vpTarget = V.scaleRequirement(vpReachable.ceiling, VP_REQUIREMENT_RULEBOOK, D.vpMargin(difficulty));
    var badge = document.getElementById('tb-difficulty');
    if (badge) badge.textContent = D.label(difficulty);
    renderVP();
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

  // ---------------------------------------------------------------------
  // Dice
  // ---------------------------------------------------------------------
  // v3 Phase 6: a lesson plays on its own seeded stream (lesson.js), so the dice in Whitaker's
  // words are the dice on the board. Outside a lesson this is null and play is unchanged.
  var lessonRng = null;
  function d10() { return Math.floor((lessonRng || Math.random)() * 10); }
  function d100() { return d10() * 10 + d10(); }
  function pad2(n) { return String(n).padStart(2, '0'); }
  function fmtSigned(n) { return (n >= 0 ? '+' : '') + n; }
  // Tumbling faces only — never a game roll. Drawn from crypto, not Math.random, so the
  // animation consumes nothing from the (seedable) game stream: tick count, skipping, or
  // replacing the animation cannot change any outcome. The game roll is decided by d10()
  // before animateDie is called.
  var faceBuf = new Uint8Array(1);
  function tumbleFace() {
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(faceBuf);
      return faceBuf[0] % 10;
    }
    return (Date.now() + Math.floor(performance.now())) % 10;
  }
  // onFace(face, landed) lets a table strip follow the tumble (Phase 4); it never sees a game roll
  // before the die lands on it.
  function animateDie(el, val, done, tickMs, onFace) {
    el.classList.add('rolling');
    var ticks = 0;
    var iv = setInterval(function () {
      var f = tumbleFace();
      el.textContent = f;
      if (onFace) onFace(f, false);
      if (ticks % 2 === 0) FX.sound('die'); // Phase 5: the rattle, every other face
      if (++ticks >= 8) {
        clearInterval(iv); el.textContent = val; el.classList.remove('rolling');
        FX.sound('land');
        if (onFace) onFace(val, true);
        if (done) done();
      }
    }, tickMs === undefined ? 55 : tickMs);
  }
  // The table row a single die is read against (Phase 4, "dice tray with the table row lit"):
  // ten cells, 0-9, each tinted by what that face means; the tumble flickers across them and the
  // landed face lights. Built from the same engine lookups the result uses, so it cannot disagree.
  function hitStrip(c) {
    var cells = [], hits = 0;
    for (var i = 0; i < 10; i++) {
      var hit = FC.resolveHitRoll(c, i) === 'hit';
      if (hit) hits++;
      cells.push({ label: hit ? 'HIT' : '', tone: hit ? 'hit' : 'miss' });
    }
    return { cells: cells, caption: 'Hit Chance ' + c + ' &mdash; hits on ' + (hits ? '0&ndash;' + (hits - 1) : 'nothing') };
  }
  var STRIP_TONE = { K: 'bad', I: 'bad', W: 'amber', X: 'amber', Z: 'amber', P: 'amber', C: 'amber' };
  function damageStrip(weapon) {
    var cells = [];
    for (var i = 0; i < 10; i++) {
      var code = FC.resolveDamage(weapon, i, CHART.DAMAGE_LEGEND).code;
      cells.push({ label: code === '*' ? '&ndash;' : code, tone: STRIP_TONE[code] || 'miss' });
    }
    return { cells: cells, caption: weapon.name + ' damage row' };
  }
  function stripHtml(strip) {
    return '<div class="res-strip">' + strip.cells.map(function (c, i) {
      return '<span class="rs-cell rs-' + c.tone + '" data-f="' + i + '"><b>' + i + '</b><i>' + c.label + '</i></span>';
    }).join('') + '</div><div class="res-strip-cap">' + strip.caption + '</div>';
  }
  function stripFollow(line) {
    var cells = line.querySelectorAll('.rs-cell');
    if (!cells.length) return null;
    return function (face, landed) {
      Array.prototype.forEach.call(cells, function (c) { c.classList.remove('peek'); });
      var cell = cells[face];
      if (cell) cell.classList.add(landed ? 'lit' : 'peek');
    };
  }
  // The game draw for a roll: the one place a rollPopup's dice are decided, always in the same
  // order (tens then ones; a then b), so the seeded stream matches the recorded baselines.
  function drawRoll(opts) {
    if (opts.kind === 'percentile') {
      var tens = opts.presetValue !== undefined ? Math.floor(opts.presetValue / 10) : d10();
      var ones = opts.presetValue !== undefined ? opts.presetValue % 10 : d10();
      return { value: tens * 10 + ones, faces: [tens, ones] };
    }
    if (opts.kind === 'dual') {
      var a = opts.presetValue ? opts.presetValue.a : d10();
      var b = opts.presetValue ? opts.presetValue.b : d10();
      return { value: { a: a, b: b }, faces: [a, b] };
    }
    var v = opts.presetValue !== undefined ? opts.presetValue : d10();
    return { value: v, faces: [v] };
  }

  // ---------------------------------------------------------------------
  // Voice-over — deferred item from the 2026-08-05 UX pass, built now. Browser-native
  // SpeechSynthesis, no dependency, works offline under file://. Off by default (muted); the
  // topbar toggle flips it. Strips HTML tags via the DOM (no regex) before speaking, and cancels
  // any in-flight utterance first so clicking through popups quickly doesn't queue a backlog.
  // ---------------------------------------------------------------------
  var voiceMuted = true;
  var stripTagsEl = document.createElement('div');
  function stripTags(html) {
    stripTagsEl.innerHTML = html || '';
    return (stripTagsEl.textContent || '').trim();
  }
  function speak(html) {
    if (voiceMuted || !window.speechSynthesis) return;
    var text = stripTags(html);
    if (!text) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
  }

  // ---------------------------------------------------------------------
  // Log
  // ---------------------------------------------------------------------
  function logLine(html, cls) {
    var div = document.createElement('div');
    div.className = 'log-line' + (cls ? ' ' + cls : '');
    div.innerHTML = html;
    var el = document.getElementById('combatlog');
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
    console.log('[Ambush]', div.textContent); // mirrors the play log to devtools/driver capture
  }
  function logHeader(text) { logLine('<b>' + text + '</b>', 'event'); }
  // A radio-log entry with structure (an expander) rather than one line of text — same log, same
  // devtools mirror.
  function logBlock(html, cls) {
    var div = document.createElement('div');
    div.className = 'log-line radio' + (cls ? ' ' + cls : '');
    div.innerHTML = html;
    var el = document.getElementById('combatlog');
    el.appendChild(div);
    el.scrollTop = el.scrollHeight;
    var sum = div.querySelector('summary');
    console.log('[Ambush]', (sum || div).textContent);
  }

  // ---------------------------------------------------------------------
  // Pop-up helpers — identical shape to skirmishchessdemo.js.
  // ---------------------------------------------------------------------
  // A US soldier has no PC/WS until his own Ratings roll resolves, and the Ratings pop-up shows
  // his portrait row BEFORE that happens — so those two stats are genuinely absent for one dialog
  // and were rendering as the literal text "PC undefined WS undefined". Omit what isn't known yet
  // rather than printing a placeholder that reads like a bug.
  function soldierStatLine(s) {
    var parts = ['IN ' + s.IN];
    if (s.side !== 'german' && s.PC !== undefined) parts.push('PC ' + s.PC);
    if (s.WS !== undefined) parts.push('WS ' + fmtSigned(s.WS));
    return parts.join(' ') + ' &middot; ' + s.stance;
  }
  function combatantHtml(s) {
    if (!s) return '';
    return '<div class="combatant"><img src="' + currentImgFor(s) + '"><div class="cname">' + s.name + '</div>' +
      '<div class="cstat">' + soldierStatLine(s) + '</div></div>';
  }
  function actorRowHtml(actor) {
    if (actor && (actor.left || actor.right)) {
      return '<div class="combat-row">' + combatantHtml(actor.left) + '<div class="vs">VS</div>' + combatantHtml(actor.right) + '</div>';
    }
    return '<div class="combat-row">' + combatantHtml(actor) + '</div>';
  }
  // Every non-decision step is a line on a resolution card (Resolve, below). The v1 modal versions
  // of these two helpers — one dialog per step, a "Roll" press for the player's own dice — were
  // the Classic dialogs build, removed 2026-09-21 once Wan no longer needed the comparison. The
  // rules and the order of every d10() are unchanged: Resolve keeps each line in the Dialogs queue.
  // v3 Phase 4b: banners and Major Kranz's cameos (cues.js). Decoration: never a press, never state.
  var Cues = window.AmbushCues || { banner: function () {}, kranz: function () {}, cardClosed: function () {}, cardOpened: function () {} };
  function infoPopup(opts, cb) { Resolve.pushInfo(opts, cb); }
  function rollPopup(opts, cb) { Resolve.pushRoll(opts, cb); }


  // ---------------------------------------------------------------------
  // Resolution cards (v2 tasks 3 and 6; docs/01_PRESENTATION_SPEC.md §3) — the game's only
  // presentation since Classic dialogs was retired (2026-09-21). Every infoPopup and rollPopup
  // becomes a line on a non-modal card near the actor: dice animate and land, the result shows,
  // and the game moves on without a press. Each line is still a Dialogs queue item (modeless), so
  // the order of everything — and therefore every seeded d10() — is exactly the order the v1
  // dialogs used, which is why the recorded baselines still reproduce. Decisions (target, option,
  // Capture/Kill) stay modal. Speed: slow / normal / fast; hold Space or hold the mouse on the
  // map to run to the next decision (Gate 0 answer 3). Speed never changes an outcome.
  // ---------------------------------------------------------------------
  var Resolve = (function () {
    var SPEED_KEY = 'ambush.v2.speed';
    var SPEEDS = { slow: 1.7, normal: 1, fast: 0.4 };
    function stored(key, fallback) { try { return window.localStorage.getItem(key) || fallback; } catch (e) { return fallback; } }
    function store(key, v) { try { window.localStorage.setItem(key, v); } catch (e) { /* private window: per-visit only */ } }
    var speed = stored(SPEED_KEY, 'normal');
    if (!SPEEDS[speed]) speed = 'normal';
    var skipping = false;
    var card = null;      // { el, linesEl, actorKey, lastTitle, open }

    // Task 6: cards cover Operations as well as Action Rounds — the per-step Move pop-up becomes
    // a line on the walking soldier's card, which is what lets a multi-hex walk flow at all.
    function T(ms) { return skipping ? 0 : Math.round(ms * SPEEDS[speed]); }

    // Reading time (Wan, 2026-09-23: "I would like to read them before they disappear"). A line
    // stays long enough to read at ~250 words a minute, never under 1.5 s, capped at 12 s (a long
    // Paragraph is clipped on the card anyway; the full text is in the log). The pointer resting
    // on the card holds the queue. The card has pointer-events:none (the map under it stays
    // clickable), so "on the card" is a rect test against the last known pointer position.
    var pointer = { x: -1, y: -1 };
    document.addEventListener('mousemove', function (e) { pointer.x = e.clientX; pointer.y = e.clientY; }, true);
    // maxMs: a lower cap for one line (Event Check lines use EVENT_READ_MS; Wan, 2026-10-24:
    // "event rolling takes a long time").
    function readMs(html, maxMs) {
      var words = String(html || '').replace(/<[^>]*>|&[#a-z0-9]+;/gi, ' ').split(/\s+/).filter(Boolean).length;
      return Math.min(maxMs || 12000, Math.max(1500, words * 240));
    }
    function hovered() {
      if (!card) return false;
      var r = card.el.getBoundingClientRect();
      return pointer.x >= r.left && pointer.x <= r.right && pointer.y >= r.top && pointer.y <= r.bottom;
    }
    // One timer per line, so the bot (which clamps every timer to 1 ms) keeps its speed. When it
    // runs out with the pointer on the card, the card is held and polled until the pointer
    // leaves. Holding Space (or the mouse on the map) fires the waiting line at once.
    var pendingHold = null;
    function hold(ms, fn) {
      var timer;
      function expire() {
        clearTimeout(timer);
        if (!skipping && hovered()) { card.el.classList.add('held'); timer = setTimeout(expire, 150); return; }
        if (card) card.el.classList.remove('held');
        pendingHold = null;
        fn();
      }
      pendingHold = expire;
      timer = setTimeout(expire, T(ms));
    }
    function startSkipping() { skipping = true; if (pendingHold) pendingHold(); }
    function actorKey(a) { return !a ? '' : a.id || (a.left && a.left.id) || ''; }
    function actorHex(a) { return !a ? null : a.hexId || (a.left && a.left.hexId) || null; }

    function closeCard(now) {
      if (!card) return;
      var old = card; card = null;
      Cues.cardClosed(!!old.finished);
      if (now) { old.el.remove(); return; }
      old.el.classList.add('fading');
      setTimeout(function () { old.el.remove(); }, 400);
    }
    // v3 Phase 3b (Wan, 2026-10-22; replaces punch list 1's Done gate): the turn is handed on at
    // once and the finished card stays up to be read until the player's next decision closes it:
    // a click on the map, a ring verb, a pick or a panel button, or a decision dialog. Done and
    // Enter still close it. The menu strip and its popups (log, squad) leave it up.
    function awaitDone(fn) {
      if (card) { card.finished = true; card.el.classList.add('done'); }
      fn();
    }
    function lingering() { return !!(card && card.finished); }
    function pressDone() { if (!lingering()) return false; closeCard(false); return true; }
    document.addEventListener('mousedown', function (e) {
      if (e.button !== 0 || !lingering() || !e.target.closest) return;
      if (e.target.closest('.res-card, .strip, .popup')) return;
      closeCard(false);
    }, true);
    Dialogs.onPresent(function (spec) { if (spec && !spec.modeless && lingering()) closeCard(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && lingering() && !Dialogs.current) { e.preventDefault(); pressDone(); }
    });
    function lineFor(opts) {
      var key = actorKey(opts.actor);
      // One card per uninterrupted resolution: a new card when a decision or an idle gap closed
      // the last one, or when both the actor and the kind of step change (a new action).
      // A finished card (it showed Done: the player had the board) never takes the next action's lines.
      if (card && (opts.solo || !card.open || card.finished || (key !== card.actorKey && opts.title !== card.lastTitle))) closeCard(!!opts.solo);
      if (!card) {
        var el = document.createElement('div');
        el.className = 'res-card';
        var who = opts.actor && (opts.actor.name || (opts.actor.left && opts.actor.left.name));
        el.innerHTML = '<div class="res-head"></div><div class="res-lines"></div>' +
          '<div class="res-foot"><button type="button" class="btn res-done">Done</button></div>';
        // Done (2026-09-25, Wan: the click that closed the card also selected the next soldier).
        // Once the card is finished it takes the mouse (.done: pointer-events on), so a click on
        // it, or on its Done button, closes it and never reaches the map underneath.
        el.addEventListener('click', function (e) {
          if (!el.classList.contains('done')) return;
          e.stopPropagation(); e.preventDefault();
          if (card && card.el === el) closeCard(false); else el.remove();
        });
        el.querySelector('.res-head').innerHTML = who || opts.title || '';
        // Beside the action, never on it (task 4: the board now shows the result, so the card
        // must not cover the target): clear of the actor, his target and any aimed-at hex, on
        // whichever side has room; below in the top half of the map, above in the bottom half.
        var hex = actorHex(opts.actor);
        var pos = hex ? pctPos(hex) : { left: 50, top: 30 };
        var focus = [hex, opts.actor && opts.actor.right && opts.actor.right.hexId, opts.focusHex].filter(Boolean)
          .map(function (h) { return pctPos(h).left; });
        if (!focus.length) focus = [pos.left];
        var maxX = Math.max.apply(null, focus), minX = Math.min.apply(null, focus), CARD_W = 27;
        var GAP = 5; // a full hex and a half: clears a scatter into the next hex
        if (100 - maxX >= CARD_W + GAP) el.style.left = (maxX + GAP) + '%';
        else if (minX >= CARD_W + GAP) el.style.right = (100 - minX + GAP) + '%';
        else if (pos.left < 58) el.style.left = (pos.left + 3) + '%';
        else el.style.right = (100 - pos.left + 3) + '%';
        if (pos.top < 50) { el.style.top = Math.max(1, pos.top - 3) + '%'; } else { el.style.bottom = Math.max(1, 100 - pos.top - 3) + '%'; }
        // v3: the card is drawn at screen size on the zoomable board, scaled from its anchored corner
        el.style.setProperty('--card-origin', (el.style.left ? 'left' : 'right') + ' ' + (el.style.top ? 'top' : 'bottom'));
        canvas.appendChild(el);
        card = { el: el, linesEl: el.querySelector('.res-lines'), actorKey: key, lastTitle: opts.title, open: true, batch: false };
        Cues.cardOpened(key);
      }
      // Same step, another actor (Initiative, US Awareness): a batch card, headed by the step,
      // each line naming its actor.
      if (key !== card.actorKey && !card.batch) {
        card.batch = true;
        card.el.querySelector('.res-head').innerHTML = opts.title || '';
        Array.prototype.forEach.call(card.linesEl.children, function (l) {
          if (l.dataset.named || !l.dataset.actorName) return;
          l.dataset.named = '1';
          var tEl = l.querySelector('.res-title');
          if (tEl) tEl.innerHTML = l.dataset.actorName + ' &middot; ' + tEl.innerHTML;
        });
      }
      card.lastTitle = opts.title;
      var line = document.createElement('div');
      line.className = 'res-line';
      line.dataset.named = card.batch || key !== card.actorKey ? '1' : '';
      var nm = opts.actor && (opts.actor.name || (opts.actor.left && opts.actor.left.name));
      line.dataset.actorName = nm || '';
      card.linesEl.appendChild(line);
      while (card.linesEl.children.length > 6) card.linesEl.removeChild(card.linesEl.firstChild);
      return line;
    }
    // The line's small title: the step, plus the actor only when the card header does not say it.
    function lineTitle(line, opts) {
      var a = opts.actor, name = a && (a.name || (a.left && a.left.name));
      return (line.dataset.named && name ? name + ' &middot; ' : '') + (opts.title || '');
    }

    function pushInfo(opts, cb) {
      Dialogs.push({
        modeless: true, title: opts.title,
        run: function (ctx) {
          var line = lineFor(opts);
          // cardHtml: a one-line version for the card when the full body belongs in the log
          // (a German's paragraph and reasoning — Gate 0 answer 1).
          var shown = opts.cardHtml || opts.bodyHtml;
          line.innerHTML = '<div class="res-title">' + lineTitle(line, opts) + '</div>' +
            '<div class="res-text' + (opts.bodyIsParagraph && !opts.cardHtml ? ' res-paragraph' : '') + '">' + shown + '</div>';
          radioLog(opts);
          speak(shown);
          runFx(opts.fx);
          hold(readMs(shown, opts.maxReadMs), function () { ctx.close(); });
        },
        onClose: function () { if (cb) cb(); },
      });
    }
    function pushRoll(opts, cb) {
      Dialogs.push({
        modeless: true, title: opts.title,
        run: function (ctx) {
          var line = lineFor(opts);
          var n = opts.kind === 'percentile' || opts.kind === 'dual' ? 2 : 1;
          var dice = '';
          for (var i = 0; i < n; i++) dice += '<span class="res-die">&ndash;</span>';
          line.innerHTML = '<div class="res-title">' + lineTitle(line, opts) + '</div>' +
            (opts.contextHtml ? '<div class="res-context">' + opts.contextHtml + '</div>' : '') +
            '<div class="res-roll">' + dice + '<span class="res-result"></span></div>' +
            (opts.strip && n === 1 ? stripHtml(opts.strip) : '');
          var drawn = drawRoll(opts); // the game roll, decided now — the animation below draws nothing
          var dieEls = line.querySelectorAll('.res-die'), landed = 0, follow = stripFollow(line);
          setTimeout(function () {
            Array.prototype.forEach.call(dieEls, function (el, i) {
              animateDie(el, drawn.faces[i], function () {
                if (++landed < dieEls.length) return;
                var resultHtml = opts.explain(drawn.value);
                line.querySelector('.res-result').innerHTML = resultHtml;
                if (opts.logText) logLine(opts.logText(drawn.value));
                speak(resultHtml);
                runFx(opts.fxLanded, drawn.value);
                hold(readMs(resultHtml, opts.maxReadMs), function () { ctx.close(drawn.value); });
              }, T(45), follow);
            });
          }, T(120));
        },
        onClose: function (result) { if (cb) cb(result); },
      });
    }

    // Board effects are decoration: a failure in one must never stall the queue it rides on, so
    // it is reported (console.error — the live drive counts it) and play goes on.
    function runFx(fn, arg) {
      if (typeof fn !== 'function') return;
      try { fn(arg); } catch (e) { console.error('[Ambush fx]', e); }
    }
    // The radio log (Gate 0 answers 1, 2 and task 4's "clipped card"): a German's paragraph is
    // one line with a "why" expander holding the text and the option that applied; a US
    // Paragraph Check's text is a clipped card, click to read it all. Everything else is the
    // ordinary log line.
    function radioLog(opts) {
      var summary = opts.logHtml || opts.bodyHtml;
      if (opts.logDetailHtml) {
        logBlock('<details class="radio-why"><summary>' + summary + ' <span class="why">why</span></summary>' +
          '<div class="radio-detail">' + opts.logDetailHtml + '</div></details>');
        return;
      }
      if (opts.bodyIsParagraph) {
        logBlock('<details class="radio-para"><summary>' + (opts.title || 'Paragraph') +
          (opts.actor && opts.actor.name ? ' &middot; ' + opts.actor.name : '') + '<span class="radio-clip">' + opts.bodyHtml + '</span></summary>' +
          '<div class="radio-detail">' + opts.bodyHtml + '</div></details>', 'para');
        return;
      }
      logLine(summary);
    }

    // A decision closes the card for appends (the next line starts a fresh card after it); the
    // queue going idle leaves the last card up until the player's next click (2026-09-23: it used
    // to fade after 2.2 s, before it could be read); the next card also replaces it.
    // "Finished" means the queue has stayed idle for a moment: a walk hands one step to the next
    // through a brief idle, and Done must not flicker on between steps.
    var doneTimer = null;
    Dialogs.onPresent(function (spec) {
      document.body.classList.toggle('resolving', !!(spec && spec.modeless));
      if (spec && !spec.modeless && card) card.open = false;
      clearTimeout(doneTimer);
      if (!card) return;
      card.idle = !spec;
      card.el.classList.remove('done');
      if (!spec && card.gate) { card.el.classList.add('done'); return; }
      if (!spec) {
        var c = card;
        doneTimer = setTimeout(function () { if (card === c && c.idle) { c.finished = true; c.el.classList.add('done'); } }, 350);
      }
    });
    // A click anywhere else still closes a finished card, and does what it was aimed at.
    document.addEventListener('pointerdown', function (e) {
      if (card && card.idle && !card.gate && !card.el.contains(e.target)) closeCard(false);
    }, true);

    // Speed and skip controls.
    function setSpeed(s) {
      if (!SPEEDS[s]) return;
      speed = s; store(SPEED_KEY, s);
      document.querySelectorAll('#speedCtl button').forEach(function (b) { b.classList.toggle('active', b.dataset.speed === s); });
    }
    document.querySelectorAll('#speedCtl button').forEach(function (b) {
      b.addEventListener('click', function () { setSpeed(b.dataset.speed); });
    });
    function typing(e) { var t = e.target; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'); }
    document.addEventListener('keydown', function (e) {
      if (e.code === 'Space' && !typing(e)) { startSkipping(); e.preventDefault(); }
    });
    document.addEventListener('keyup', function (e) { if (e.code === 'Space') skipping = false; });
    var vp = document.getElementById('board');
    vp.addEventListener('mousedown', function (e) { if (e.button === 0 && document.body.classList.contains('resolving')) startSkipping(); });
    window.addEventListener('mouseup', function () { skipping = false; });
    window.addEventListener('blur', function () { skipping = false; });
    // Resolution cards are the only presentation (the v1.1/v1.2 chooser was removed in R2).
    document.getElementById('speedCtl').style.display = '';
    var lh = document.getElementById('log-heading'); if (lh) lh.textContent = 'Radio Log';
    document.body.classList.add('cards-mode');
    setSpeed(speed);

    return { pushInfo: pushInfo, pushRoll: pushRoll, setSpeed: setSpeed, T: T,
      awaitDone: awaitDone, lingering: lingering, pressDone: pressDone };
  })();

  // ---------------------------------------------------------------------
  // Board effects (v2 task 4; docs/01_PRESENTATION_SPEC.md §4): the fight happens on the map.
  // Tracers from shooter to target, the landed die floating up at the target, result badges on
  // counters, grenade blasts, move trails, and a camera that follows action only when it is
  // off-screen (Gate 0 task-4 answers). Resolution-card mode only; Classic stays v1. Pure
  // decoration: nothing here is queued, awaited, or reads a die — every call is fire-and-forget
  // from a card line that has already been decided.
  // ---------------------------------------------------------------------
  var FX = (function () {
    var svg = null, badgeCount = {};
    var NS = 'http://www.w3.org/2000/svg';
    function ms(base) { return Math.max(120, Resolve.T(base)); }
    // Phase 5: a cue only when the board is showing results, never while they are skipped
    function sound(name) { if (Resolve.T(100) > 0 && window.AmbushAudio) AmbushAudio.play(name); }
    function layer() {
      if (svg && svg.parentNode) return svg;
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'fx-layer');
      svg.setAttribute('viewBox', '0 0 100 100');
      svg.setAttribute('preserveAspectRatio', 'none');
      canvas.appendChild(svg);
      return svg;
    }
    function at(el, hexId, dx, dy) {
      var p = pctPos(hexId);
      el.style.left = (p.left + (dx || 0)) + '%'; el.style.top = (p.top + (dy || 0)) + '%';
    }
    function later(fn, base) { setTimeout(fn, ms(base)); }
    function fadeOut(el, base) {
      later(function () { el.classList.add('fx-gone'); setTimeout(function () { el.remove(); }, 450); }, base);
    }
    function line(fromHex, toHex, cls) {
      var a = pctPos(fromHex), b = pctPos(toHex);
      var l = document.createElementNS(NS, 'line');
      l.setAttribute('x1', a.left); l.setAttribute('y1', a.top); l.setAttribute('x2', b.left); l.setAttribute('y2', b.top);
      l.setAttribute('class', cls);
      layer().appendChild(l);
      return l;
    }
    // A shot, a throw or an assault: the line appears at once (marching toward the target) and
    // takes its verdict when the roll lands.
    // Phase 5: the shot's sound follows the weapon (weapon_chart ids); a grenade is a throw
    var SHOT = { pistol: 'pistol', smg: 'smg', mp: 'smg', bar: 'mg', mmg: 'mg', baz: 'rocket' };
    function tracer(fromHex, toHex, kind, weaponId) {
      if (!fromHex || !toHex) return { resolve: function () {} };
      var l = line(fromHex, toHex, 'fx-tracer fx-' + (kind || 'fire'));
      if ((kind || 'fire') === 'fire') { flash(fromHex); sound(SHOT[weaponId] || 'rifle'); }
      else if (kind === 'grenade') sound('throw');
      var done = false;
      function finish(result) {
        if (done) return; done = true;
        l.setAttribute('class', 'fx-tracer fx-' + (kind || 'fire') + ' fx-' + result);
        fadeOut(l, result === 'hit' ? 1600 : 1100);
      }
      later(function () { finish('stale'); }, 9000); // never leave a tracer behind a lost verdict
      return { resolve: finish };
    }
    function trail(fromHex, toHex) {
      if (!fromHex || !toHex || fromHex === toHex) return;
      fadeOut(line(fromHex, toHex, 'fx-trail'), 2600);
    }
    function floatDie(hexId, value, tone) {
      if (!hexId) return;
      var el = document.createElement('div');
      el.className = 'fx-die fx-' + (tone || 'neutral');
      el.textContent = value;
      at(el, hexId, 1.6, -1.2);
      el.style.animationDuration = ms(1500) + 'ms';
      canvas.appendChild(el);
      setTimeout(function () { el.remove(); }, ms(1500) + 50);
    }
    // Badges stack upward when several land on one hex in quick succession (a grenade's victims).
    function badge(hexId, text, tone) {
      if (!hexId) return;
      var n = badgeCount[hexId] = (badgeCount[hexId] || 0) + 1;
      var el = document.createElement('div');
      el.className = 'fx-badge fx-' + (tone || 'neutral');
      el.textContent = text;
      at(el, hexId, 0, -2.4 - (n - 1) * 1.7);
      canvas.appendChild(el);
      later(function () {
        el.classList.add('fx-gone');
        setTimeout(function () { el.remove(); badgeCount[hexId] = Math.max(0, (badgeCount[hexId] || 1) - 1); }, 450);
      }, 2600);
    }
    function blast(hexId, dud) {
      if (!hexId) return;
      var el = document.createElement('div');
      el.className = dud ? 'fx-blast fx-dud' : 'fx-blast';
      at(el, hexId);
      canvas.appendChild(el);
      setTimeout(function () { el.remove(); }, 900);
      sound(dud ? 'dud' : 'blast');
      if (!dud) shake();
    }
    // Phase 4 (Medium, Wan 2026-10-22): a muzzle flash at the shooter, a short shake of the map on
    // a hit only (off under reduced motion), and a stamp on the counter when his status changes.
    function still() { return document.body.classList.contains('still'); }
    function flash(hexId) {
      if (!hexId) return;
      var el = document.createElement('div');
      el.className = 'fx-flash';
      at(el, hexId);
      canvas.appendChild(el);
      setTimeout(function () { el.remove(); }, 450);
    }
    var shakeTimer = null;
    function shake() {
      if (still()) return;
      canvas.classList.remove('fx-shake');
      void canvas.offsetWidth; // restart the animation when hits land back to back
      canvas.classList.add('fx-shake');
      clearTimeout(shakeTimer);
      shakeTimer = setTimeout(function () { canvas.classList.remove('fx-shake'); }, 420);
    }
    // sub: a smaller second line; life: how long it stays (ms, default 2800)
    function stamp(hexId, text, tone, sub, life) {
      if (!hexId) return;
      var n = badgeCount[hexId] = (badgeCount[hexId] || 0) + 1;
      var el = document.createElement('div');
      el.className = 'fx-stamp fx-' + (tone || 'bad');
      el.textContent = text;
      if (sub) { var sm = document.createElement('small'); sm.textContent = sub; el.appendChild(sm); }
      at(el, hexId, 0, (n - 1) * 1.4);
      canvas.appendChild(el);
      later(function () {
        el.classList.add('fx-gone');
        setTimeout(function () { el.remove(); badgeCount[hexId] = Math.max(0, (badgeCount[hexId] || 1) - 1); }, 450);
      }, life || 2800);
    }
    // Pan only when something is off-screen, just far enough to show all of `hexes` (v3: the
    // camera is the stage's zoom/pan view, AmbushStage.view, not v2's vertical scroll).
    function ensureVisible(hexes, instant) {
      if (!window.AmbushStage) return;
      var pts = hexes.filter(Boolean).map(function (h) { var p = pctPos(h); return { x: p.left / 100 * G.MAP_WIDTH, y: p.top / 100 * G.MAP_HEIGHT }; });
      if (!pts.length) return;
      // Instant when the player is about to click (a gliding map moves the hex out from under
      // the cursor mid-click); smooth when it is following the action.
      AmbushStage.view.reveal(pts, 120, instant);
    }
    var STATUS_BADGE = { wounded: ['WOUNDED', 'bad'], incapacitated: ['INCAPACITATED', 'bad'], killed: ['KIA', 'bad'],
      panicked: ['PANIC', 'amber'], captured: ['CAPTURED', 'amber'] };
    function status(s) {
      var b = STATUS_BADGE[s.status];
      if (b) stamp(s.hexId, b[0], b[1]);
      if (s.status === 'killed' || s.status === 'incapacitated') sound('kia');
      // v3 Phase 4b: a US soldier killed is a notable moment for the other side
      if (s.status === 'killed' && usSoldiers.indexOf(s) >= 0) {
        Cues.kranz('cheerful', '<b>Ein Amerikaner weniger.</b> ' + nameFor(s.id) + ' is killed at ' + s.hexId + '. His squad-mates cannot bring him back.');
      }
    }
    return { tracer: tracer, trail: trail, floatDie: floatDie, badge: badge, blast: blast, ensureVisible: ensureVisible, status: status,
      flash: flash, shake: shake, stamp: stamp, sound: sound };
  })();

  // ---------------------------------------------------------------------
  // The map as an information surface (v2 task 5; docs/01_PRESENTATION_SPEC.md §4). Cards mode
  // only, like task 4 (Classic stays v1). Read-only by construction: every number here comes from
  // the same pure functions the rules use (legalAdjacentHexIds, roundLegalDestinations, losClear,
  // estimateHitChanceBreakdown, the fire chart's terrain row), and nothing here rolls, mutates game
  // state, or can be clicked — it only answers "what would happen if".
  //
  //   Right-click a hex (a pinned card since 2026-09-25; it was a hover card):
  //                   terrain and cover (what it does to a shot at you there), the move cost from
  //                   the soldier you are acting for, whether entering makes a Paragraph Check,
  //                   and which Germans on the map can see it.
  //   ... a German's hex adds your hit chance on him (aimed / snap), his on you, his stance and weapon,
  //                   and his last stated reason.
  //   Your decision   reachable hexes shaded by cover quality; walls, windows and doors drawn.
  //
  // What it does NOT reveal: what a hex's Paragraph Check would find. The paper player cannot
  // know which hexes hide Germans until he walks in; showing it would change the game.
  // ---------------------------------------------------------------------
  var Info = (function () {
    var NS = 'http://www.w3.org/2000/svg';
    var MW = G.MAP_WIDTH, MH = G.MAP_HEIGHT, R = G.GRID.col_pitch / 1.5; // flat-top: pitch = 1.5 R
    var svg = null, tip = null, lastHex = null, lastReason = {}, hoverRoute = null, lastEnsured = null;
    function layer() {
      if (svg && svg.parentNode) return svg;
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'info-layer');
      svg.setAttribute('viewBox', '0 0 ' + MW + ' ' + MH);
      svg.setAttribute('preserveAspectRatio', 'none');
      canvas.insertBefore(svg, canvas.children[1] || null); // above the map scan, below counters
      return svg;
    }
    function center(hexId) { var p = G.parseId(hexId); return G.hexToPixel(p.colIdx, p.rowIdx); }
    function hexPoints(hexId, shrink) {
      var c = center(hexId), r = R * (shrink || 0.94), pts = [];
      for (var k = 0; k < 6; k++) { var a = Math.PI / 3 * k; pts.push((c.x + r * Math.cos(a)).toFixed(1) + ',' + (c.y + r * Math.sin(a)).toFixed(1)); }
      return pts.join(' ');
    }
    // The shared hexside between two neighbours: perpendicular to the centre line, at its midpoint.
    function sideSegment(a, b) {
      var p = center(a), q = center(b), mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      var dx = q.x - p.x, dy = q.y - p.y, len = Math.sqrt(dx * dx + dy * dy), h = R / 2;
      return { x1: mx - dy / len * h, y1: my + dx / len * h, x2: mx + dy / len * h, y2: my - dx / len * h };
    }
    function coverClass(hexId) {
      var row = terrainRowFor(hexId);
      return row === 0 ? 'cov-open' : row <= 3 ? 'cov-light' : 'cov-good';
    }
    function coverLabel(hexId) {
      var row = terrainRowFor(hexId);
      return row === 0 ? 'no cover' : row <= 3 ? 'light cover' : 'good cover';
    }

    // Who the player is acting for right now, if anyone.
    function viewer() {
      if (phase === 'movement') return selectedSoldier() || null;
      if (phase === 'round') { var a = findSoldier(currentActorId); return a && a.side !== 'german' ? a : null; }
      return null;
    }
    function decisionPending() { return !Dialogs.current; }

    // ---- shading -----------------------------------------------------------------------------
    function clear() { if (svg) svg.innerHTML = ''; }
    function refresh() {
      clear();
      if (!decisionPending()) return;
      var v = viewer();
      if (!v || !v.hexId || v.exited) return;
      // The map is taller than the window: a soldier whose turn it is must be where the player can
      // see and click. Only when he (or his hex) changes — re-scrolling under a poised cursor is
      // how a click ends up on the wrong hex — and instantly, for the same reason.
      var key = v.id + '@' + v.hexId;
      if (key !== lastEnsured) { lastEnsured = key; FX.ensureVisible([v.hexId], true); }
      var reach = [];
      if (phase === 'movement') reach = legalAdjacentHexIds(v);
      else if (document.getElementById('action-sec').style.display !== 'none') {
        reach = Object.keys(roundLegalDestinations(v)).filter(function (h) { return h !== v.hexId; });
      }
      var g = document.createElementNS(NS, 'g');
      reach.forEach(function (h) {
        var poly = document.createElementNS(NS, 'polygon');
        poly.setAttribute('points', hexPoints(h));
        poly.setAttribute('class', 'reach ' + coverClass(h));
        g.appendChild(poly);
      });
      // Walls, windows and doors on every hexside touching the area in play.
      var area = {}; reach.concat([v.hexId]).forEach(function (h) { area[h] = true; });
      var seen = {};
      Object.keys(area).forEach(function (h) {
        var p = G.parseId(h);
        G.neighbors(p.colIdx, p.rowIdx).forEach(function (n) {
          var key = h < n.id ? h + '|' + n.id : n.id + '|' + h;
          if (seen[key]) return; seen[key] = true;
          var f = edgeFeatureBetween(h, n.id);
          if (!f) return;
          var s = sideSegment(h, n.id), l = document.createElementNS(NS, 'line');
          l.setAttribute('x1', s.x1); l.setAttribute('y1', s.y1); l.setAttribute('x2', s.x2); l.setAttribute('y2', s.y2);
          l.setAttribute('class', 'edge edge-' + f);
          g.appendChild(l);
        });
      });
      layer().appendChild(g);
    }

    // ---- hover -------------------------------------------------------------------------------
    // Hit Chance c hits on a roll of 0..c (0 always hits, 9 always misses): (c + 1) in 10.
    function pct(c) { return '<b>' + c + '</b> <span class="ih-dim">(' + (c + 1) * 10 + '%)</span>'; }
    function hexHtml(hexId, v) {
      var enemyHere = activeGermans().some(function (g) { return g.hexId === hexId; });
      var terrain = LOS_TERRAIN[hexId] || REAL_TERRAIN[hexId];
      var label = TERRAIN_LABELS[terrain] || TERRAIN_LABELS[REAL_TERRAIN[hexId]] || terrain || 'unknown';
      var html = '<div class="ih-head"><b>' + hexId + '</b> &middot; ' + label + ' <span class="ih-cov ' + coverClass(hexId) + '">' + coverLabel(hexId) + '</span></div>';
      // What the terrain does to a shot at someone standing here, in the viewer's stance.
      var stance = v ? v.stance : 'standing', row = terrainRowFor(hexId);
      if (FC.canBeFiredAt(CHART.FIRE_MODS_TERRAIN, row, stance)) {
        var mod = FC.resolveTerrainMod(CHART.FIRE_MODS_TERRAIN, row, stance);
        html += '<div>Shots at a ' + stance + ' soldier here: <b>' + fmtSigned(mod) + '</b> to hit (terrain row ' + row + ').</div>';
      } else {
        html += '<div>A ' + stance + ' soldier here cannot be fired at except through his aperture.</div>';
      }
      if (enemyHere) return html; // occupied by the enemy: nobody walks in, nothing more to say
      if (v && hexId !== v.hexId) {
        if (phase === 'movement') {
          var route = hoverRoute;
          html += legalAdjacentHexIds(v).indexOf(hexId) !== -1
            ? '<div>' + v.name + ' can step here.</div>'
            : route ? '<div>Click to walk here: <b>' + route.length + ' hexes</b> <span class="ih-dim">(stops if anything happens)</span></div>'
              : '<div class="ih-dim">No route from ' + v.name + ' &mdash; walls or prohibited ground.</div>';
        } else {
          var d = roundLegalDestinations(v)[hexId];
          html += d ? '<div>Move: <b>' + d.cost + ' MP</b> of ' + v.mpa + (d.standUp ? ' (stands up first)' : '') + '.</div>'
            : '<div class="ih-dim">Beyond ' + v.name + '&rsquo;s ' + v.mpa + ' MP this turn.</div>';
        }
      }
      if (v && hexId === v.hexId) return html + watchersHtml(hexId, stance);
      html += (opsState && opsState.eventMarkers && opsState.eventMarkers[hexId])
        ? '<div class="ih-dim">Event marker: no Paragraph Check here until the Condition changes.</div>'
        : '<div>Entering makes a Paragraph Check.</div>';
      return html + watchersHtml(hexId, stance);
    }
    function watchersHtml(hexId, stance) {
      var watchers = activeGermans().filter(function (g) { return g.hexId && g.hexId !== hexId && losClear(g.hexId, hexId, g.stance, stance); });
      return watchers.length
        ? '<div class="ih-warn">Seen by ' + watchers.map(function (g) { return g.name; }).join(', ') + '.</div>'
        : (activeGermans().length ? '<div class="ih-dim">No German on the map can see it.</div>' : '');
    }
    function germanHtml(g, v) {
      var w = weaponById(g.weaponId);
      var html = '<div class="ih-head"><b>' + g.name + '</b> &middot; ' + g.stance + (w ? ' &middot; ' + w.name : '') + '</div>';
      if (v) {
        if (!weaponUsable(v)) html += '<div class="ih-dim">' + v.name + '&rsquo;s weapon cannot fire now.</div>';
        else if (!canFireAt(v, g)) html += '<div class="ih-dim">' + v.name + ' has no shot at him (sight, range or cover).</div>';
        else {
          var aim = estimateHitChanceBreakdown(v, g, 'aimed'), snap = estimateHitChanceBreakdown(v, g, 'snap');
          html += '<div>' + v.name + ' &rarr; him: aimed ' + pct(aim.clamped) + ', snap ' + pct(snap.clamped) + '</div>';
        }
        if (g.weaponId && weaponUsable(g) && canFireAt(g, v)) {
          html += '<div class="ih-warn">He &rarr; ' + v.name + ': aimed ' + pct(estimateHitChanceBreakdown(g, v, 'aimed').clamped) + '</div>';
        } else html += '<div class="ih-dim">He has no shot at ' + v.name + '.</div>';
      }
      if (lastReason[g.id]) html += '<div class="ih-reason">Last: ' + lastReason[g.id] + '</div>';
      return html;
    }
    function tipEl() {
      if (tip) return tip;
      tip = document.createElement('div');
      tip.id = 'info-tip';
      document.body.appendChild(tip);
      return tip;
    }
    // Hover draws only the walk route; the hex card is pinned on demand (2026-09-25, Wan: "I want
    // to control when it comes up"). A hover card also stayed up whenever the game moved on under a
    // still mouse (the start of the mission, a phase change), because only mouse movement hid it.
    function hide() { lastHex = null; hoverRoute = null; drawRoute(null, null); }
    var pinned = null; // { hex, x, y }: the right-clicked hex and where the card was opened
    function closePin() { pinned = null; if (tip) tip.style.display = 'none'; }
    function renderPin() {
      if (!pinned) return;
      var v = viewer(), hx = pinned.hex, el = tipEl();
      var html = activeGermans().filter(function (g) { return g.hexId === hx; }).map(function (g) { return germanHtml(g, v); }).join('<hr>');
      el.innerHTML = (html ? html + '<hr>' : '') + hexHtml(hx, v) +
        '<div class="ih-dim ih-close">Right-click again or Esc to close.</div>';
      el.style.display = 'block';
      var x = pinned.x + 14, y = pinned.y + 10, w = el.offsetWidth, hgt = el.offsetHeight;
      if (x + w > window.innerWidth - 8) x = pinned.x - w - 14;
      if (y + hgt > window.innerHeight - 8) y = window.innerHeight - hgt - 8;
      el.style.left = Math.max(8, x) + 'px'; el.style.top = Math.max(8, y) + 'px';
    }
    function hexAt(e) {
      var r = canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return null;
      return G.pixelToHex((e.clientX - r.left) / r.width * MW, (e.clientY - r.top) / r.height * MH).id || null;
    }
    // The walk the player would get by clicking, drawn hex to hex (task 6).
    function drawRoute(v, route) {
      var old = svg && svg.querySelector('#route-preview');
      if (old) old.remove();
      if (!v || !route || route.length < 2) return;
      var g = document.createElementNS(NS, 'g');
      g.setAttribute('id', 'route-preview');
      var pts = [v.hexId].concat(route).map(function (h) { var c = center(h); return c.x + ',' + c.y; }).join(' ');
      var line = document.createElementNS(NS, 'polyline');
      line.setAttribute('points', pts);
      line.setAttribute('class', 'route');
      g.appendChild(line);
      var end = center(route[route.length - 1]);
      var dot = document.createElementNS(NS, 'circle');
      dot.setAttribute('cx', end.x); dot.setAttribute('cy', end.y); dot.setAttribute('r', R * 0.3);
      dot.setAttribute('class', 'route-end');
      g.appendChild(dot);
      layer().appendChild(g);
    }
    function onMove(e) {
      if (document.body.classList.contains('resolving') || Dialogs.current) { hide(); return; }
      var hx = hexAt(e);
      if (!hx) { hide(); return; }
      if (hx !== lastHex) {
        lastHex = hx;
        var v = viewer();
        hoverRoute = v && phase === 'movement' && hx !== v.hexId ? operationsRoute(v.hexId, hx) : null;
        drawRoute(v, hoverRoute);
      }
    }
    var vp = document.getElementById('board');
    // Clicking open map in Operations walks there (task 6). Counters and destination markers stop
    // their own clicks, so this only ever sees a click on bare ground.
    // On the viewport, not the canvas: this module is built before `canvas` exists.
    vp.addEventListener('click', function (e) {
      // Only a click on bare map is a walk order. Markers, counters and entry hexes carry their
      // own meaning, and the last entry placement switches the phase inside its own click — that
      // click then bubbled here and marched the soldier off across the map.
      if (e.target !== canvas && !e.target.classList.contains('map-image')) return;
      if (phase !== 'movement' || Dialogs.current || !viewer()) return;
      var r = canvas.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      var hx = G.pixelToHex((e.clientX - r.left) / r.width * MW, (e.clientY - r.top) / r.height * MH).id;
      if (!hx) return;
      hide(); closePin();
      // A click just outside a destination marker still means that hex: do the ordinary one-hex
      // move rather than nothing (or, worse, a walk starting with the same step).
      if (destPicks[hx]) { destPicks[hx](); return; }
      walkRoute(hx);
    });
    vp.addEventListener('mousemove', function (e) { try { onMove(e); } catch (err) { hide(); console.error('[Ambush info]', err); } });
    vp.addEventListener('mouseleave', hide);
    vp.addEventListener('stagemove', function () { hide(); closePin(); });   // v3: the view panned or zoomed
    // Right-click pins a hex's card; right-click the same hex (or Esc) closes it, another hex moves
    // it. A right-DRAG is not a click: it is reserved for panning the map (Wan, 2026-09-25), so
    // anything past a few pixels of movement between press and release inspects nothing. Decided
    // on the button's release: macOS fires contextmenu on the press, before any drag exists, so
    // contextmenu only suppresses the browser's menu.
    var rDown = null;
    // v3: the ring of verbs floats over the selected soldier's hex, outside the map; a right-click
    // on it inspects the hex underneath, as anywhere else on the map. Pointer events, not mouse
    // events: a greyed (disabled) verb gets no mouse events in Chromium.
    var ringEl = document.getElementById('ring');
    document.addEventListener('pointerdown', function (e) {
      if (e.button === 2 && (vp.contains(e.target) || ringEl.contains(e.target))) rDown = { x: e.clientX, y: e.clientY };
    });
    vp.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    ringEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    window.addEventListener('pointerup', function (e) {
      if (e.button !== 2 || !rDown) return;
      var moved = Math.abs(e.clientX - rDown.x) + Math.abs(e.clientY - rDown.y) > 6;
      rDown = null;
      if (moved || (Dialogs.current && !Dialogs.current.modeless)) return;
      var hx = hexAt(e);
      if (!hx || (pinned && pinned.hex === hx)) { closePin(); return; }
      pinned = { hex: hx, x: e.clientX, y: e.clientY };
      try { renderPin(); } catch (err) { closePin(); console.error('[Ambush info]', err); }
    });
    // v3: this Esc is spent on the card; shell.js (registered after) must not also open the pause menu
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pinned) { e.stopImmediatePropagation(); closePin(); } });
    // Any left click closes it: it is a look, not a mode, and a click usually changes what it says.
    document.addEventListener('mousedown', function (e) { if (e.button === 0 && pinned) closePin(); }, true);
    function safeRefresh() {
      try { refresh(); } catch (err) { console.error('[Ambush info]', err); }
      try { renderPin(); } catch (err) { closePin(); console.error('[Ambush info]', err); }
    }
    // A decision closes it (a modal would sit under it); resolution lines keep it, refreshed.
    Dialogs.onPresent(function (spec) { hide(); if (spec && !spec.modeless) closePin(); safeRefresh(); });
    return {
      refresh: safeRefresh,
      noteReason: function (g, html) { lastReason[g.id] = html; },
    };
  })();

  // v3 Phase 7b (chapter 3): a sight line drawn on the map, from the same traceLOS the game asks.
  // Clear runs green end to end; blocked runs red to the hex that stops it, which is ringed. Its
  // own layer, so the hover card's redraws never wipe it. Lessons only.
  var Sight = (function () {
    var NS = 'http://www.w3.org/2000/svg', svg = null;
    function center(hexId) { var p = G.parseId(hexId); return G.hexToPixel(p.colIdx, p.rowIdx); }
    function layer() {
      if (svg && svg.parentNode) return svg;
      svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('id', 'sight-layer');
      svg.setAttribute('viewBox', '0 0 ' + G.MAP_WIDTH + ' ' + G.MAP_HEIGHT);
      svg.setAttribute('preserveAspectRatio', 'none');
      canvas.insertBefore(svg, canvas.children[2] || null); // over the hover layer, under the counters
      return svg;
    }
    function node(tag, attrs) {
      var n = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { n.setAttribute(k, attrs[k]); });
      return n;
    }
    function clear() { if (svg) while (svg.firstChild) svg.removeChild(svg.firstChild); }
    function draw(fromHex, toHex, fromStance, toStance) {
      var r = LOS.traceLOS({ fromId: fromHex, toId: toHex, elevationByHexId: LOS_ELEV, terrainByHexId: LOS_TERRAIN,
        edgeFeatures: edgeFeatures, fromStance: fromStance, toStance: toStance });
      clear();
      var g = layer(), a = center(fromHex), b = center(r.blocked && r.hexId ? r.hexId : toHex);
      var cls = r.blocked ? 'sight blocked' : 'sight clear';
      g.appendChild(node('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, 'class': cls }));
      if (r.blocked && r.hexId) {
        var e = center(toHex);
        g.appendChild(node('line', { x1: b.x, y1: b.y, x2: e.x, y2: e.y, 'class': 'sight beyond' }));
        g.appendChild(node('circle', { cx: b.x, cy: b.y, r: G.GRID.col_pitch / 1.5 * 0.62, 'class': 'sight-block' }));
      }
      g.appendChild(node('circle', { cx: a.x, cy: a.y, r: 14, 'class': cls + ' end' }));
      return r;
    }
    return { draw: draw, clear: clear };
  })();


  // ---------------------------------------------------------------------
  // Map rendering
  // ---------------------------------------------------------------------
  var canvas = document.getElementById('world');
  var counterEls = {};
  var destEls = {};
  var entryEls = {};
  var eventMarkerEls = {};

  function pctPos(hexId) {
    var p = G.parseId(hexId);
    var px = G.hexToPixel(p.colIdx, p.rowIdx);
    return { left: px.pctX, top: px.pctY };
  }
  // A counter that changes hex glides there, lifted off the map (Phase 4, "soldiers walk the path");
  // the camera's follow-when-off-screen is FX.ensureVisible's, unchanged. No glide when results
  // are skipped or reduced motion is on: the counter simply lands.
  function placeEl(el, hexId) {
    var pos = pctPos(hexId), left = pos.left + '%', top = pos.top + '%';
    if (el.classList.contains('counter') && el.style.left && (el.style.left !== left || el.style.top !== top)) glideEl(el);
    el.style.left = left; el.style.top = top;
  }
  function glideEl(el) {
    var d = Resolve.T(420);
    clearTimeout(el._glide);
    if (!d || document.body.classList.contains('still')) { el.style.transition = ''; el.classList.remove('moving'); return; }
    el.style.transition = 'left ' + d + 'ms ease-in-out, top ' + d + 'ms ease-in-out, filter .2s, opacity .2s';
    el.style.setProperty('--glide', d + 'ms');
    el.classList.remove('moving'); void el.offsetWidth; el.classList.add('moving');
    if (window.AmbushAudio) AmbushAudio.steps(d);
    el._glide = setTimeout(function () { el.classList.remove('moving'); el.style.transition = ''; }, d + 40);
  }
  function placeEventMarkerEl(hexId) {
    // §6/1's Rounds Event Check is not tied to any hex, so a paragraph reached that way can call
    // for an Event marker with nowhere to put it. The caller's `hexId || currentHex` fallback
    // then yields null, and placing it threw on parseId(null).colIdx — an uncaught page error,
    // four times in a single automated playthrough. A marker with no hex simply is not placed.
    if (!hexId) return;
    if (eventMarkerEls[hexId]) return; // already marked
    var el = document.createElement('div');
    el.className = 'event-marker';
    placeEl(el, hexId);
    el.title = 'Event marker — ' + hexId;
    canvas.appendChild(el);
    eventMarkerEls[hexId] = el;
  }
  // #map-viewport only scrolls vertically (overflow-x is hidden — the canvas is always full
  // width), so this centers the target hex in the visible vertical band.
  // Follow only when off-screen (task 4); v1's always-re-centre behaviour left with Classic.
  function scrollMapTo(hexId) { FX.ensureVisible([hexId]); }
  function currentImgFor(s) {
    if (s.side === 'german') return s.img;
    return (s.stance === 'crouching' || s.stance === 'prone') ? s.imgCrouch : s.img;
  }
  function updateCounterVisual(s) {
    var el = counterEls[s.id];
    if (!el) return;
    el.classList.toggle('wounded', s.status === 'wounded');
    el.classList.toggle('dead', s.status === 'incapacitated' || s.status === 'killed' || s.status === 'captured');
    var imgEl = el.querySelector('img');
    if (imgEl) imgEl.src = currentImgFor(s);
    // the commander wears a star, so the soldier who can Give Turn and Make aware is found on sight
    if (s.isCommander && !el.querySelector('.cmd-badge')) {
      var star = document.createElement('span');
      star.className = 'cmd-badge'; star.textContent = '★'; star.title = s.name + ', commander (§6/3)';
      el.appendChild(star);
    }
    // Phase 5: a rustle when a living soldier changes stance on screen
    if (el._stance && el._stance !== s.stance && !el.classList.contains('dead')) FX.sound('rustle');
    el._stance = s.stance;
  }
  function highlightActor(id) {
    Object.keys(counterEls).forEach(function (k) { counterEls[k].classList.toggle('active-actor', k === id); });
  }

  // ---------------------------------------------------------------------
  // Roster / state
  // ---------------------------------------------------------------------
  var usSoldiers = [];       // populated by squad generation
  var germans = {};          // id -> german object, populated as activate_german fires
  var phase = 'squadgen';    // squadgen | entry | movement | round | roundEnd | over
  var opsState = null;
  var track = null, currentActorId = null, roundNum = 0;
  // germanActivations: §2/1's Activation VP Award, banked the moment a German activates and kept
  // "regardless of what happens later". germanDefeats now contributes only the additive
  // Conditional award. awards: flat VP from paragraphs / ending bonuses. See victoryrules.js.
  var vpState = { germanActivations: [], germanDefeats: [], usCasualties: [], awards: [] };
  var currentGermanIdsThisRound = [];
  // Task #68 (docs/37_PICKUP_EXCHANGE.md): items lying in a hex with no soldier currently
  // carrying them — hexId -> array of { id, kind: 'port'|'ammo' }. Populated by wound-loss
  // overflow (§13/2, Task #61) rather than left to vanish as it did before this task.
  var groundItems = {};

  function findSoldier(id) {
    if (germans[id]) return germans[id];
    return usSoldiers.filter(function (s) { return s.id === id; })[0];
  }
  function nameFor(id) { return findSoldier(id).name; }
  function activeUS() { return usSoldiers.filter(function (s) { return s.isActive && !s.exited; }); }
  function activeGermans() { return Object.keys(germans).map(function (k) { return germans[k]; }).filter(function (g) { return g.isActive; }); }
  // Task #72 (docs/46_CAPTURED_GERMAN.md): every German ever activated, active or not — a
  // captured German has isActive === false (removeFromRound/§11/2's own Inactive-space mechanic,
  // unchanged from Task #27) but must still be found for the §11/2 escape/freeing check below,
  // which activeGermans() would otherwise skip entirely.
  function allGermans() { return Object.keys(germans).map(function (k) { return germans[k]; }); }

  // Task #61 (docs/33_PORT_BOX.md): equipment display, for live verification that squad
  // generation actually populated real per-soldier Port Boxes / Ammo Boxes rather than the old
  // single-string placeholder.
  function equipmentName(id) {
    var eq = (SQCHART.EQUIPMENT || []).filter(function (e) { return e.id === id; })[0];
    if (eq) return eq.name;
    var w = weaponById(id);
    return w ? w.name : id;
  }
  // Task #68 (docs/37_PICKUP_EXCHANGE.md): Port Box cost for a weapon id. Falls back to a local
  // lookup for the two German-only weapon ids (guessGermanWeaponId's 'mp'/'bolt') that were never
  // added to the shared, trainer-visible EQUIPMENT table — a player never buys them (§4), only
  // ever picks one up off a dead German (§14), so giving them a real purchase-table entry would
  // have let apps/trainer/index.html's squad-generation lesson offer them for sale, which the
  // real Equipment Cost Chart does not.
  var GERMAN_ONLY_WEAPON_BOXES = { mp: 1, bolt: 1 };
  function boxesFor(id) {
    var e = (SQCHART.EQUIPMENT || []).filter(function (x) { return x.id === id; })[0];
    return (e && e.boxes) || GERMAN_ONLY_WEAPON_BOXES[id] || 1;
  }
  function addGroundItem(hexId, id, kind) {
    if (!groundItems[hexId]) groundItems[hexId] = [];
    groundItems[hexId].push({ id: id, kind: kind });
  }
  // What a soldier carries, spelled out (Wan, 2026-10-25: "not knowing what they are carrying
  // causes me to make bad decisions"): the weapon in hand and whether it will fire (ready, jammed,
  // broken, crew weapon not yet prepared), its ranges and the clips left for it; any other
  // weapon carried; grenades; and every Ammo Box, spent ones shown empty (§4, §9/4, §9/5).
  function weaponStateFor(s) {
    if (s.weaponBroken) return { cls: 'bad', text: 'Broken' };
    if (s.weaponJammed) return { cls: 'bad', text: 'Jammed' };
    if (WEAPONS_REQUIRING_PREPARATION[s.weaponId] && !s.weaponPrepared) return { cls: 'warn', text: 'Not prepared' };
    return { cls: 'ok', text: 'Ready' };
  }
  function rangeText(w) {
    if (!w || !w.short) return '';
    var band = function (b) { return b[1] >= 99 ? b[0] + '+' : b[0] === b[1] ? String(b[0]) : b[0] + '–' + b[1]; };
    return 'short ' + band(w.short) + ' · med ' + band(w.med) + ' · long ' + band(w.long) + ' hexes';
  }
  // compact: the weapon, its state, clips and grenades only (the small Selected / Current actor panels).
  // ---- Token strip (Wan, 2026-10-25): the boxed game's weapon tokens, so a soldier's kit reads at a
  // glance. Port Boxes are the large slots (2, or 1 when wounded, §4), the weapon in hand framed;
  // a jammed or broken weapon shows its _jam token. Ammo Boxes are the small tiles (6). The scope,
  // grenade and clip tokens are placeholders (assets/library/weapons/TEMP_TOKENS.md).
  var WEAPON_TOKENS = {
    US: { sar: 'weapon_us_m1', carb: 'weapon_us_carbine', bar: 'weapon_us_bar', smg: 'weapon_us_smg', mmg: 'weapon_us_mmg',
      baz: 'weapon_us_bazooka', pistol: 'weapon_us_pistol45', satch: 'weapon_us_satchel', bolt: 'weapon_de_bolt',
      mp: 'weapon_de_mp', scope: 'weapon_de_scope' },
    german: { bolt: 'weapon_de_bolt', scope: 'weapon_de_scope', mp: 'weapon_de_mp', mmg: 'weapon_de_mmg',
      pistol: 'weapon_de_luger', smg: 'weapon_us_smg', sar: 'weapon_us_m1', carb: 'weapon_us_carbine', bar: 'weapon_us_bar' },
  };
  function weaponToken(s, id, jammed) {
    var side = s.side === 'german' ? 'german' : 'US';
    var name = WEAPON_TOKENS[side][id];
    // a German card's "Light Machinegun" shares the MMG row (germanactions.js) but has its own token
    if (side === 'german' && id === 'mmg' && s.card && /light/i.test(s.card.Equipment || '')) name = 'weapon_de_lmg';
    return name ? img('weapons/' + name + (jammed ? '_jam' : '') + '.png') : null;
  }
  // The game's own instant tooltip (.tt's look, mission.css .tok-tip): what the token is and what it means for him.
  function tokTip(text) { return ' tabindex="0" data-tip="' + String(text).replace(/"/g, '&quot;') + '"'; }
  function tokenStrip(s, compact) {
    var inv = s.inventory || { ammoBoxes: [], portBoxes: [] };
    var st = weaponStateFor(s);
    var weapons = s.weaponId ? [s.weaponId] : [];
    if (s.side !== 'german') {
      (EQ.carriedItemIds(inv) || []).forEach(function (id) { if (weapons.indexOf(id) === -1) weapons.push(id); });
    }
    var html = '<div class="tok-strip' + (compact ? ' compact' : '') + '"><div class="tok-weapons">';
    var ports = (inv.portBoxes || []).slice(0, EQ.portBoxCapacity(s));
    weapons.forEach(function (id) {
      var inHand = id === s.weaponId;
      var src = weaponToken(s, id, inHand && st.cls === 'bad');
      // a weapon as wide as the Port Boxes it fills (the BAR takes two, §4)
      var span = ports.filter(function (p) { return p === id; }).length > 1 ? ' span2' : '';
      var w = weaponById(id);
      var clipsFor = (inv.ammoBoxes || []).filter(function (b) { return b === id; }).length;
      var tip = equipmentName(id) + (inHand ? ': in hand, ' + st.text.toLowerCase() + '.' : ': carried, not in hand.') +
        (w && w.short ? ' Range ' + rangeText(w) + '.' : '') +
        (s.side === 'german' ? '' : ' ' + clipsFor + ' clip' + (clipsFor === 1 ? '' : 's') + ' for it.') +
        (span ? ' Fills two Port Boxes.' : '');
      html += '<span class="tok-slot tok-tip' + span + (inHand ? ' in-hand' : '') + (inHand && st.cls === 'bad' ? ' bad' : '') +
        '"' + tokTip(tip) + '>' +
        (src ? '<img src="' + src + '" alt="">' : '<b>' + equipmentName(id) + '</b>') + '</span>';
    });
    if (s.side !== 'german' && !compact) {
      ports.forEach(function (p) { if (!p) html += '<span class="tok-slot empty tok-tip"' + tokTip('Empty Port Box: room for another weapon.') + '></span>'; });
    }
    html += '</div><div class="tok-boxes">';
    var gIcon = img('weapons/item_grenade_' + (s.side === 'german' ? 'de' : 'us') + '.png');
    if (s.side === 'german') {
      (inv.ammoBoxes || []).filter(function (id) { return id === 'gren'; }).forEach(function () {
        html += '<span class="tok-box tok-tip"' + tokTip('Grenade: one throw.') + '><img src="' + gIcon + '" alt=""></span>';
      });
    } else {
      (inv.ammoBoxes || []).forEach(function (id) {
        if (!id) { html += '<span class="tok-box empty tok-tip"' + tokTip('Empty Ammo Box: spent.') + '></span>'; return; }
        var t = id === 'gren' ? 'Grenade: one throw, from an Ammo Box.'
          : equipmentName(id) + ' clip, in an Ammo Box.' + (id === s.weaponId ? ' Fits his weapon in hand.' : ' Does not fit his weapon in hand.');
        html += '<span class="tok-box tok-tip' + (id === 'gren' ? ' gren' : id === s.weaponId ? '' : ' other') + '"' + tokTip(t) + '>' +
          '<img src="' + (id === 'gren' ? gIcon : img('weapons/item_clip.png')) + '" alt="">' +
          (id === 'gren' ? '' : '<i>' + id.toUpperCase() + '</i>') + '</span>';
      });
    }
    return html + '</div></div>';
  }
  function kitHtml(s, compact) {
    var inv = s.inventory || { ammoBoxes: [], portBoxes: [] };
    var boxes = inv.ammoBoxes || [];
    var w = weaponById(s.weaponId);
    var st = weaponStateFor(s);
    var gren = boxes.filter(function (id) { return id === 'gren'; }).length;
    var html = '<div class="kit' + (compact ? ' compact' : '') + '">' + tokenStrip(s, compact);
    html += '<div class="kit-weapon"><span class="kit-k">In hand</span><b>' + (equipmentName(s.weaponId) || 'unarmed') + '</b>' +
      (s.weaponId ? '<i class="kit-state ' + st.cls + '">' + st.text + '</i>' : '') + '</div>';
    if (w && !compact) html += '<div class="kit-sub">' + rangeText(w) + '</div>';
    if (s.side === 'german') {
      // §9/5: Germans carry no Ammo Boxes and never run out; only their grenades are counted.
      html += '<div class="kit-row"><span class="kit-k">Grenades</span><b>' + gren + '</b></div>';
      if (!compact) html += '<div class="kit-sub">Germans never run out of ammunition (&sect;9/5).</div>';
      return html + '</div>';
    }
    var clips = boxes.filter(function (id) { return id && id === s.weaponId; }).length;
    html += '<div class="kit-row"><span class="kit-k">Clips for it</span><b class="' + (clips ? '' : 'kit-zero') + '">' + clips + '</b>' +
      '<span class="kit-k">Grenades</span><b class="' + (gren ? '' : 'kit-zero') + '">' + gren + '</b></div>';
    if (compact) return html + '</div>';
    var others = (EQ.carriedItemIds(inv) || []).filter(function (id) { return id !== s.weaponId; });
    if (others.length) html += '<div class="kit-row"><span class="kit-k">Also carries</span><b>' + others.map(equipmentName).join(', ') + '</b></div>';
    return html + '</div>';
  }
  function renderRoster() {
    var html = usSoldiers.map(function (s) {
      var state = s.exited ? 'exited' : s.isActive ? (s.status && s.status !== 'unharmed' ? s.status : (s.aware === false ? 'unaware' : '')) : s.status;
      return '<div class="roster-slot' + (s.isActive ? '' : ' dead') + '"><span class="letter">' + s.letter + '</span>' +
        '<img src="' + currentImgFor(s) + '"><div class="roster-main"><div class="roster-name">' + s.name +
        (s.isCommander ? ' <i class="kit-state ok">Commander</i>' : '') + (state ? ' <i class="kit-state warn">' + state + '</i>' : '') +
        '<span class="roster-stats">IN ' + s.IN + ' · PC ' + s.PC + ' · WS ' + fmtSigned(s.WS) + ' · ' + s.stance + (s.hexId ? ' at ' + s.hexId : '') + '</span></div>' +
        kitHtml(s) + '</div></div>';
    }).join('');
    document.getElementById('roster-list').innerHTML = html;
  }
  // What the VP panel last showed — __mission1Debug.board() reports this, not a fresh computation,
  // so automation sees exactly what the player sees.
  var shownVP = { gained: 0, lost: 0, total: 0, need: 0 };
  function renderVP() {
    var totals = V.computeVPTotal(vpState);
    shownVP = { gained: totals.gained, lost: totals.lost, total: totals.total, need: vpRequirement() };
    document.getElementById('vp-gained').textContent = totals.gained;
    document.getElementById('vp-lost').textContent = totals.lost;
    document.getElementById('vp-total').textContent = totals.total;
    document.getElementById('vp-need').textContent = vpRequirement();
    renderObjectivesWindow(totals);
    return totals;
  }
  function renderObjectivesWindow(totals) {
    var body = FloatDialogs.body('objectives');
    if (!body) return;
    body.innerHTML =
      '<h4>Victory</h4><p>Score <b>' + vpRequirement() + ' VP</b> or more to win the mission.</p>' +
      (vpTargetNote() ? '<p style="color:var(--text-label); font-size:12px;">' + vpTargetNote() + '</p>' : '') +
      (D.isEasy(difficulty)
        ? '<h4>Easy Mode</h4><ul style="margin:0 0 12px; padding-left:18px; font-size:12.5px; line-height:1.6;">' +
          D.describe(difficulty).map(function (line) { return '<li>' + line + '</li>'; }).join('') + '</ul>'
        : '') +
      '<h4>Current VP</h4><p class="obj-vp">' + totals.gained + ' gained &minus; ' + totals.lost + ' lost = <b>' + totals.total + '</b></p>' +
      '<h4>Ending 1 — Hold the Ground</h4><p>Occupy the T8 building, K13, and L13, plus a SE-heights hex with line of sight to every road, with no active Germans remaining. Awards a further +4 VP.</p>' +
      '<h4>Ending 2 — Withdraw</h4><p>Every active soldier exits the map via the north edge (A1&ndash;J1).</p>';
  }

  // ---------------------------------------------------------------------
  // §4 Squad Generation — real procedure, auto-buy heuristic for the actual choices (see header)
  // ---------------------------------------------------------------------
  function startSquadGeneration() {
    infoPopup({ title: 'Squad Generation', bodyHtml: 'Rolling to determine your squad\'s quality and equipment (§4).' }, function () {
      rollSquadQuality();
    });
  }
  // Easy mode rolls §4's generation dice twice and keeps the better OUTCOME (difficulty.js
  // chooseBest). Both dice are shown, and the pop-up says which was kept and why — the rule is
  // that Easy never hides a die. Scoring by outcome rather than by the raw number matters here:
  // Squad Points rise with the die, but Weapon Points FALL as the Squad+Weapon sum rises, so the
  // "better" die is the high one in the first case and the low one in the second.
  //
  // `kind: 'dual'` reuses the two-dice tray the Initiative roll already uses; on Normal
  // (squadRolls === 1) the single-die path is unchanged.
  function easyRollPopup(opts, cb) {
    var n = D.squadRolls(difficulty);
    if (n < 2) {
      rollPopup({
        title: opts.title, kind: 'single', contextHtml: opts.contextHtml,
        explain: function (roll) { return opts.explain(roll); },
        logText: function (roll) { return opts.logText(roll); },
      }, function (roll) { cb(roll); });
      return;
    }
    rollPopup({
      title: opts.title + ' (Easy — best of two)', kind: 'dual', diceLabels: ['ROLL 1', 'ROLL 2'],
      contextHtml: opts.contextHtml + '<br>Easy mode rolls twice and keeps the better result.',
      explain: function (rolls) {
        var best = D.chooseBest([rolls.a, rolls.b], opts.valueOf);
        var other = best.index === 0 ? rolls.b : rolls.a;
        return opts.explain(best.roll) + '<br><span style="color:var(--text-label);">Kept the ' +
          (best.index === 0 ? 'first' : 'second') + ' die (' + best.roll + '); the other (' + other +
          ') would have given ' + opts.valueOf(other) + '.</span>';
      },
      logText: function (rolls) {
        var best = D.chooseBest([rolls.a, rolls.b], opts.valueOf);
        return opts.title + ' (easy, best of two): <span class="roll">' + rolls.a + '</span> / <span class="roll">' +
          rolls.b + '</span> &rarr; kept ' + best.roll + '. ' + opts.logText(best.roll);
      },
    }, function (rolls) { cb(D.chooseBest([rolls.a, rolls.b], opts.valueOf).roll); });
  }

  function rollSquadQuality() {
    easyRollPopup({
      title: 'Squad Quality',
      contextHtml: 'Roll one die to determine Squad Points.',
      valueOf: function (roll) { return SG.resolveSquadQuality(SQCHART, roll); },
      explain: function (roll) { return 'Squad Points: <b>' + SG.resolveSquadQuality(SQCHART, roll) + '</b>.'; },
      logText: function (roll) { return 'Squad Quality roll: <span class="roll">' + roll + '</span> &rarr; ' + SG.resolveSquadQuality(SQCHART, roll) + ' Squad Points.'; },
    }, function (roll) {
      rollWeaponQuality(roll, SG.resolveSquadQuality(SQCHART, roll));
    });
  }
  function rollWeaponQuality(squadRoll, sp) {
    easyRollPopup({
      title: 'Weapon Quality',
      contextHtml: 'Roll one die, add it to the Squad Quality roll (' + squadRoll + ').',
      valueOf: function (roll) { return SG.resolveWeaponQuality(SQCHART, squadRoll, roll); },
      explain: function (roll) { return 'Weapon Points: <b>' + SG.resolveWeaponQuality(SQCHART, squadRoll, roll) + '</b>.'; },
      logText: function (roll) { return 'Weapon Quality roll: <span class="roll">' + roll + '</span> (+' + squadRoll + ') &rarr; ' + SG.resolveWeaponQuality(SQCHART, squadRoll, roll) + ' Weapon Points.'; },
    }, function (roll) {
      var wp = SG.resolveWeaponQuality(SQCHART, squadRoll, roll);
      buySquad(sp, wp);
    });
  }
  function buySquad(sp, wp) {
    var bought = SG.autoBuySoldiers(sp, SQCHART);
    var lettered = SG.assignLetters(bought.soldiers.map(function (t, i) {
      return { IN: t.in, isCommander: t.cmdr, mpa: SG.mpaForIN(SQCHART, t.in) };
    }), SQCHART);
    var names = SQCHART.DEFAULT_NAMES.slice();
    lettered.forEach(function (s, i) {
      s.id = 'us' + i;
      s.name = 'Pvt. ' + names[i];
      s.side = 'US';
      s.img = img('soldiers/us_soldier_' + s.letter + '_standing.png');
      s.imgCrouch = img('soldiers/us_soldier_' + s.letter + '_crouching.png');
      s.stance = 'standing';
      s.mpRemaining = s.mpa;
      s.usedFreeStanceChange = false;
      s.wounded = false; s.status = 'unharmed'; s.isActive = true; s.exited = false;
      s.aware = false; // §6/5 US Awareness — reset for real at the start of every fresh Rounds sequence
      s.hexId = null;
      s.weaponId = null; // set for real by distributeEquipment() once Weapon Points resolve below
      // Task #69 (docs/43_PREPARE_WEAPON.md): irrelevant while weaponId is a personal weapon
      // (WEAPONS_REQUIRING_PREPARATION never gates those), but set the real starting state now
      // in case this soldier ever picks up a crew weapon later (Pick Up/Exchange Equipment,
      // Task #68) — a newly acquired one always starts unprepared.
      s.weaponPrepared = false;
    });
    usSoldiers = lettered;

    infoPopup({
      title: 'Squad Assembled', bodyHtml: usSoldiers.length + ' soldiers bought for ' + bought.spentSP + '/' + sp + ' Squad Points: ' +
        usSoldiers.map(function (s) { return s.letter + ' (IN ' + s.IN + (s.isCommander ? ', Commander' : '') + ')'; }).join(', ') + '.',
    }, function () {
      rollRatingsSequentially(0, wp);
    });
  }
  function rollRatingsSequentially(i, wp) {
    if (i >= usSoldiers.length) { buyEquipment(wp); return; }
    var s = usSoldiers[i];
    rollPopup({
      actor: s, title: 'Ratings — ' + s.name, kind: 'single',
      contextHtml: 'Rolling Perception, Weapon Skill, and Driving Skill for ' + s.letter + ' (IN ' + s.IN + ').',
      explain: function (roll) {
        // Each rating takes the better of N rolls on Easy (N == 1 on Normal, so the behaviour is
        // unchanged there). Every roll is named in the text, including the Weapon Skill and
        // Driving Skill dice, which were previously rolled without ever being shown — the
        // standing rule is that the player sees the machinery, and these were part of it.
        function rated(firstRoll, resolve) {
            var rolls = [firstRoll];
            for (var k = 1; k < D.squadRolls(difficulty); k++) rolls.push(d10());
            var best = D.chooseBest(rolls, resolve);
            return { value: best.value, rolls: rolls, kept: best.roll };
        }
        var pc = rated(roll, function (r) { return SG.resolvePC(SQCHART, r, s.IN); });
        var ws = rated(d10(), function (r) { return SG.resolveWS(SQCHART, r, s.IN); });
        var ds = rated(d10(), function (r) { return SG.resolveDS(SQCHART, r, s.IN); });
        s.PC = pc.value; s.WS = ws.value; s.DS = ds.value;
        function shown(label, r) {
          return r.rolls.length > 1
            ? label + ' rolled ' + r.rolls.join(' / ') + ', kept ' + r.kept
            : label + ' rolled ' + r.rolls[0];
        }
        return 'PC <b>' + s.PC + '</b> &middot; WS <b>' + fmtSigned(s.WS) + '</b> &middot; DS <b>' + s.DS +
          '</b> &middot; MPA <b>' + s.mpa + '</b>.' +
          '<br><span style="color:var(--text-label); font-size:12px;">' +
          [shown('PC', pc), shown('WS', ws), shown('DS', ds)].join(' &middot; ') + '</span>';
      },
      logText: function () { return s.letter + ' ' + s.name + ': PC ' + s.PC + ', WS ' + fmtSigned(s.WS) + ', DS ' + s.DS + ', MPA ' + s.mpa + '.'; },
    }, function () { rollRatingsSequentially(i + 1, wp); });
  }
  function buyEquipment(wp) {
    var bought = SG.autoBuyEquipment(wp, usSoldiers.length, SQCHART);
    // Task #61 (docs/33_PORT_BOX.md): assign the aggregate purchase to real per-soldier Port
    // Boxes / Ammo Boxes — this is also where the BAR-to-commander swap actually happens now,
    // via equipmentrules.js's stow/drop rather than just overwriting weaponId.
    SG.distributeEquipment(usSoldiers, bought, SQCHART, EQ);
    infoPopup({
      title: 'Equipment', bodyHtml: 'Spent ' + bought.spentWP + '/' + wp + ' Weapon Points: ' +
        Object.keys(bought.equipment).map(function (id) { return bought.equipment[id] + '&times; ' + id; }).join(', ') + '.',
    }, function () {
      renderRoster();
      startEntryPlacement();
    });
  }

  // ---------------------------------------------------------------------
  // Entry placement — "Your soldiers can enter the map in any hexes on the north edge between
  // A1 and J1 (inclusive)."
  // ---------------------------------------------------------------------
  var entryIndex = 0;
  function startEntryPlacement() {
    phase = 'entry';
    document.getElementById('tb-phase').textContent = 'Entry Placement';
    document.getElementById('roster-sec').style.display = '';
    ENTRY_HEXES.forEach(function (hexId) {
      var el = document.createElement('div');
      el.className = 'entry-hex';
      placeEl(el, hexId);
      el.title = hexId;
      el.addEventListener('click', function (e) { e.stopPropagation(); placeNextSoldier(hexId); });
      canvas.appendChild(el);
      entryEls[hexId] = el;
    });
    promptPlaceSoldier();
  }
  // Directs a real gameplay decision (where to place this soldier), so it gets its own popup —
  // Dialogs' full-screen backdrop already blocks the entry-hex markers underneath while it's open,
  // so no extra click-guard is needed.
  function promptPlaceSoldier() {
    var s = usSoldiers[entryIndex];
    document.getElementById('status-banner').textContent = 'Place ' + s.name + ' on the north edge (A1-J1).';
    infoPopup({ actor: s, title: 'Entry Placement', bodyHtml: 'Place ' + s.name + ' on the north edge (A1&ndash;J1).' });
  }
  function placeNextSoldier(hexId) {
    if (entryIndex >= usSoldiers.length) return;
    var s = usSoldiers[entryIndex];
    s.hexId = hexId;
    var el = document.createElement('div');
    el.className = 'counter';
    // Stable identity for automated play/verification (tools/bot/) — counter DOM order shifts
    // as soldiers exit or are removed, so index-based lookup is not safe. No effect on the game.
    el.dataset.soldierId = s.id;
    placeEl(el, hexId);
    el.innerHTML = '<img src="' + currentImgFor(s) + '">';
    el.addEventListener('click', function (e) {
      e.stopPropagation();
      if (phase === 'movement') {
        // Clicking an already-selected soldier opens the inspector instead of re-selecting him
        // (a no-op otherwise) — still "click on him" per the user's own ask, without turning
        // every ordinary movement-planning click into an interrupting modal.
        if (selectedId === s.id) { showSoldierInspector(s.id); return; }
        selectSoldier(s.id);
        return;
      }
      if (phase === 'round') showSoldierInspector(s.id);
    });
    canvas.appendChild(el);
    counterEls[s.id] = el;
    updateCounterVisual(s);
    logLine(s.name + ' enters the map at ' + hexId + '.');
    entryIndex++;
    if (entryIndex >= usSoldiers.length) {
      Object.keys(entryEls).forEach(function (id) { entryEls[id].remove(); });
      startOperations();
    } else {
      promptPlaceSoldier();
    }
  }

  // ---------------------------------------------------------------------
  // Operations phase — real movement + real Paragraph Check (operationsloop.js) per hex entered.
  // ---------------------------------------------------------------------
  var selectedId = null;
  function selectedSoldier() { return findSoldier(selectedId); }
  // §5/3/§7/1 Group Movement (Task #67, docs/42_GROUP_MOVEMENT.md): "any number of soldiers in
  // the same hex in the same stance can move into an adjacent hex together" — the group that a
  // selected soldier could optionally move together with, including himself.
  function groupAt(s) {
    if (!s) return [];
    return usSoldiers.filter(function (t) { return t.hexId === s.hexId && t.stance === s.stance && t.isActive && !t.exited; });
  }
  // §5/1: "If a group of soldiers enters the same hex, only one Paragraph Check is made. Any
  // Perception Checks required by the paragraph are made by the soldier with the highest PC
  // only." — same rule the existing per-hex PC-selection in Ops.buildContext's
  // defaultPcRating already implements for a single mover; picking the group's highest-PC
  // soldier as that one mover reuses it unchanged rather than teaching runParagraphCheck a new
  // "which soldier" concept.
  function highestPcOf(group) { return group.slice().sort(function (a, b) { return b.PC - a.PC; })[0]; }
  function renderGroupMoveRow() {
    var s = selectedSoldier();
    var group = groupAt(s);
    var row = document.getElementById('groupMoveRow');
    document.getElementById('groupMoveToggle').checked = false; // always opt in fresh per selection
    if (!s || group.length <= 1) { row.style.display = 'none'; return; }
    row.style.display = '';
    document.getElementById('groupMoveCount').textContent = group.length;
  }
  // v3 punch list 3 (Wan, 2026-10-21, feedback/feedback1mov.mov): in Operations the player picks
  // who moves (§5/3: "in any order you choose"). Nobody is pre-selected: after a move or walk
  // (once Done closes its card), when Operations begins, and when a soldier exits, the selection
  // is cleared. lastSelectedId keeps the soldier v2 would have kept selected, for the bot only.
  var lastSelectedId = null;
  function deselect(suggestId) {
    if (suggestId) lastSelectedId = suggestId;
    selectSoldier(null);
  }
  function endOpsMove() {
    if (phase !== 'movement') return;
    var id = selectedId;
    Resolve.awaitDone(function () { if (phase === 'movement' && selectedId === id && !walking) deselect(id); });
    if (id) document.getElementById('status-banner').textContent = nameFor(id) + '’s move is done. Choose who moves next.';
  }
  function selectSoldier(id) {
    if (walking && walking.id !== id) walking = null; // selecting someone else ends the walk
    selectedId = id;
    if (id) lastSelectedId = id;
    if (phase === 'movement') document.getElementById('movement-sec').style.display = id ? '' : 'none';
    Object.keys(counterEls).forEach(function (k) { counterEls[k].classList.toggle('selected', k === id); });
    renderHud();
    renderGroupMoveRow();
    renderBringPrisonerRow();
    renderDestinations();
    Info.refresh();
    renderStatusBanner();
  }
  function clearDestMarks() { Object.keys(destEls).forEach(function (k) { destEls[k].remove(); }); destEls = {}; destPicks = {}; }
  // Every destination marker goes through here, so its pick handler is recorded next to the
  // element: a map click and __mission1Debug.clickHex() run the same function.
  var destPicks = {};
  function addDestMark(hexId, className, title, onPick) {
    var el = document.createElement('div');
    el.className = className;
    placeEl(el, hexId);
    el.title = title;
    el.addEventListener('click', function (e) { e.stopPropagation(); onPick(); });
    canvas.appendChild(el);
    destEls[hexId] = el;
    destPicks[hexId] = onPick;
  }
  function destCostClass(cost) { return 'dest-mark ' + (cost <= 1 ? 'cost-1' : cost === 2 ? 'cost-2' : 'cost-3plus'); }

  function startOperations() {
    phase = 'movement';
    opsState = Ops.createGameState();
    document.getElementById('tb-phase').textContent = 'Operations';
    document.getElementById('movement-sec').style.display = '';
    Cues.banner('ops', 'Operations', 'Move your squad · no turns until contact');
    deselect(usSoldiers[0].id); // sets the status banner too
  }

  // §3/1 + §5/3: "no Game-Turns... without keeping track of Turns, Movement Points, or anything
  // else" during Operations — a soldier just moves one adjacent hex at a time, any number of
  // times, in any order. (MPA/mpRemaining still exist on the soldier object as a real §4 stat for
  // a future Rounds-movement feature, §6/7 — Operations code just never reads them.) Since
  // Operations and Rounds are mutually exclusive (an active German ends Operations immediately),
  // activeGermans() is always empty here, so no enemy-occupied-hex filtering is needed either.
  // Shared by renderDestinations() (what to draw) and renderStatusBanner() (what to say).
  function legalAdjacentHexIds(s) {
    if (!s || s.side === 'german' || s.stance === 'prone') return []; // "Prone soldiers cannot move at all" (§5/3)
    var start = G.parseId(s.hexId);
    var out = [];
    G.neighbors(start.colIdx, start.rowIdx).forEach(function (n) {
      var terrain = REAL_TERRAIN[n.id];
      if (terrain && M.isProhibited(terrain)) return;
      // §7/3: a wall hexside cannot be crossed at all. Operations tracks no Movement Points, so
      // the aperture surcharge has nothing to be charged against here — but "you may not walk
      // through the wall of a building" holds in both phases.
      if (M.hexsideCost(edgeFeatureBetween(s.hexId, n.id)) === Infinity) return;
      out.push(n.id);
    });
    return out;
  }
  // §6/7 Move (Rounds): "expend some or all of soldier's Movement Point Allowance" — unlike
  // Operations (§5/3, no MP tracked), Rounds movement uses the real MPA/terrain-cost pathfinding
  // movementrules.js was built for (M.legalDestinations) but Operations never needed. A Move
  // action is one of the actions a soldier can take on their turn (same tier as Fire/Assault),
  // so the full MPA is available — there's no partial-turn MP carryover to track separately.
  //
  // §6/7 stance and movement, the paid half. "A soldier without a free stance change must spend
  // one Movement Point to change stance, and thus must perform a Movement Action", and §7/3: "A
  // crouching or prone soldier must change stance using a free stance change, if he has one, or
  // by spending a Movement Point, in order to stand and then move." So a prone soldier is NOT
  // immobile — he is a soldier whose Movement Action must open with a stance change. Modelling
  // him as immobile is what produced the stalemates: a wounded soldier never gets a free stance
  // change, so a wounded prone soldier had no legal action at all, forever, and since a Round
  // only ends when no active German remains, the whole mission froze. See docs/49.
  //
  // M.legalDestinations keeps its own "prone cannot move" rule, which is right at its level — it
  // answers "where can a soldier in THIS stance go", and the answer for prone is nowhere. Standing
  // up first is a turn-level concern, so it belongs here, where the free-stance-change state lives.
  //
  // Deliberately NOT modelled: a CROUCHING soldier standing up to move further than his one-hex
  // crawl. It is legal by the same sentence, but it turns every crouching Move into a two-mode
  // choice for a case the crawl already covers, and no stalemate depends on it.
  function standUpCost(s) {
    return M.stanceChangeCost(!!s.usedFreeStanceChange, !!s.wounded);
  }
  function legalDestinationsWithBudget(s, mpaBudget) {
    if (!s || mpaBudget <= 0) return {};
    var occupiedByEnemy = activeGermans().map(function (g) { return g.hexId; });
    if (s.stance !== 'prone') {
      return M.legalDestinations({ startHexId: s.hexId, mpa: mpaBudget, stance: s.stance, terrainByHexId: REAL_TERRAIN, occupiedByEnemy: occupiedByEnemy, edgeFeatures: edgeFeatures });
    }
    // Prone: the Movement Action buys the stance change first, then moves standing on the rest.
    var upfront = standUpCost(s);
    if (upfront > mpaBudget) return {};
    var out = {};
    // Standing up and going no further is a legal Movement Action in its own right — and for a
    // wounded soldier with 2 MPA it is often the only one worth taking. Unused MP are lost (§7/3).
    out[s.hexId] = { cost: upfront, path: [s.hexId], standUp: true };
    var remaining = mpaBudget - upfront;
    if (remaining > 0) {
      var onward = M.legalDestinations({ startHexId: s.hexId, mpa: remaining, stance: 'standing', terrainByHexId: REAL_TERRAIN, occupiedByEnemy: occupiedByEnemy, edgeFeatures: edgeFeatures });
      Object.keys(onward).forEach(function (hexId) {
        out[hexId] = { cost: onward[hexId].cost + upfront, path: onward[hexId].path, standUp: true };
      });
    }
    return out;
  }
  function roundLegalDestinations(s) { return s ? legalDestinationsWithBudget(s, s.mpa) : {}; }

  // ---------------------------------------------------------------------
  // §6/7 Snap Fire Twice / §7/3 Move/Snap Fire (Task #70, docs/44_SNAP_FIRE_COMBO.md).
  //
  // A soldier's turn can be ONE regular action, or — only when the first sub-action is a snap
  // fire, or a move costing at most half his MPA (rounded down) — followed by exactly one more:
  // fire twice, fire-then-move, or move-then-fire. `s.comboStepsUsed` (reset per turn in
  // driveNext) caps it at that one follow-up; `s.comboMoveCostUsed` tracks MP already spent on
  // the movement half of the combo so a fire-then-move follow-up can't exceed the same half-MPA
  // budget a move-then-fire opener would have.
  //
  // Deliberately NOT modelled: "you can split movement so that it occurs both before and after
  // fire" (the errata's own third variant) — a third sub-action in the same turn. Aimed fire
  // never combos with anything (§6/7 lists "Snap Fire Twice"/"Move/Snap Fire" specifically,
  // never an Aimed equivalent), so doPlayerFire('aimed') is untouched by any of this.
  // ---------------------------------------------------------------------
  function comboMoveBudget(s) { return Math.floor(s.mpa / 2) - (s.comboMoveCostUsed || 0); }
  function completeTurn(soldierId) {
    if (phase !== 'over') { Sched.completeAction(track, soldierId); renderTrack(); driveNext(); }
  }
  // Called once a snap fire resolves. Offers a follow-up (another snap fire, or a move within
  // whatever half-MPA budget remains) if this was the turn's first sub-action and something is
  // actually still available; otherwise just ends the turn.
  function finishFireStep(s, onEndTurn) {
    if (phase === 'over' || s.comboStepsUsed > 0) { onEndTurn(); return; }
    var canFireAgain = weaponUsable(s) && visibleEnemyTargets(s).length > 0;
    var moveDests = legalDestinationsWithBudget(s, comboMoveBudget(s));
    var canMove = Object.keys(moveDests).length > 0;
    if (!canFireAgain && !canMove) { onEndTurn(); return; }
    offerComboChoice(s, { fire: canFireAgain, move: canMove, moveDests: moveDests }, onEndTurn);
  }
  // Called once a Move resolves. Only offers a snap-fire follow-up if this was the turn's first
  // sub-action AND the whole move cost at most half the soldier's MPA (rounded down) — a move
  // that used more than that was never combo-eligible to begin with, matching a plain Move.
  function finishMoveStep(s, moveCostSoFar, onEndTurn) {
    var half = Math.floor(s.mpa / 2);
    if (phase === 'over' || s.comboStepsUsed > 0 || moveCostSoFar > half) { onEndTurn(); return; }
    s.comboMoveCostUsed = moveCostSoFar;
    if (!(weaponUsable(s) && visibleEnemyTargets(s).length > 0)) { onEndTurn(); return; }
    offerComboChoice(s, { fire: true, move: false, moveDests: {} }, onEndTurn);
  }
  function offerComboChoice(s, avail, onEndTurn) {
    var offers = [];
    if (avail.fire) offers.push({ label: 'Fire &mdash; Snap (again)', kind: 'fire' });
    if (avail.move) offers.push({ label: 'Move (up to ' + comboMoveBudget(s) + ' MP left)', kind: 'move', dests: avail.moveDests });
    offers.push({ label: 'End Turn', kind: 'end' });
    chooseOffer(offers, {
      title: 'Combo Action',
      prompt: s.name + ' can take one more action this turn (&sect;6/7/&sect;7/3):',
      onCancel: onEndTurn,
    }, function (offer) {
      s.comboStepsUsed = 1;
      if (offer.kind === 'end') { onEndTurn(); return; }
      if (offer.kind === 'fire') {
        var targets = visibleEnemyTargets(s);
        chooseTarget(s, targets, {
          title: 'Select Target — Snap Fire',
          prompt: s.name + ' has line of sight to ' + targets.length + (targets.length === 1 ? ' German' : ' Germans') + '. Choose a target.',
          hitChanceFor: function (t) { return estimateHitChance(s, t, 'snap'); },
          hitChanceTipFor: function (t) { var b = estimateHitChanceBreakdown(s, t, 'snap'); return b ? hitBreakdownText(b) : ''; },
          onCancel: onEndTurn,
        }, function (target) {
          fireChain(s, target, 'snap', function () { finishFireStep(s, onEndTurn); });
        });
        return;
      }
      showComboMoveDestinations(s, offer.dests, onEndTurn);
    });
  }
  var pendingCancelAction = null; // set while a combo-move destination picker is open
  function showComboMoveDestinations(s, dests, onEndTurn) {
    pendingCancelAction = onEndTurn;
    document.getElementById('cancelMoveBtn').style.display = '';
    clearDestMarks();
    Object.keys(dests).forEach(function (hexId) {
      addDestMark(hexId, destCostClass(dests[hexId].cost), hexId + ' (' + dests[hexId].cost + ' MP)',
        function () { doRoundMove(s, dests[hexId].path, dests[hexId].cost, onEndTurn); });
    });
    document.getElementById('status-banner').textContent = s.name + ' — combo move, choose a destination (up to ' + comboMoveBudget(s) + ' MP), or Cancel.';
  }
  function renderDestinations() {
    clearDestMarks();
    if (phase !== 'movement') return;
    var s = selectedSoldier();
    if (!s) return;
    legalAdjacentHexIds(s).forEach(function (hexId) {
      addDestMark(hexId, 'dest-mark', hexId, function () { doMove(hexId, endOpsMove); });
    });
  }
  // Narrates the same state renderDestinations() just drew — live, not a one-time static string.
  function renderStatusBanner() {
    if (phase !== 'movement') return;
    var banner = document.getElementById('status-banner');
    var s = selectedSoldier();
    if (!s) { banner.textContent = 'Select a soldier to move.'; return; }
    banner.textContent = legalAdjacentHexIds(s).length
      ? s.name + ' selected — click any hex to walk there (he stops if anything happens), or choose another action.'
      : s.name + ' cannot move — change stance or select another soldier.';
  }

  // §5/3 Operations movement is one hex per Action and tracks no Movement Points, so a walk to a
  // distant hex is just that action repeated: the wall-aware route below is the same breadth-first
  // search the automated player has always borrowed (operationsNextStepForTesting), returning the
  // whole path instead of only its first step. Prohibited terrain and wall hexsides are excluded
  // by the game's own rules (M.isProhibited, M.hexsideCost === Infinity).
  function operationsRoute(fromHexId, goalHexId) {
    if (!fromHexId || !goalHexId || fromHexId === goalHexId) return null;
    var seen = {}, queue = [[fromHexId, []]];
    seen[fromHexId] = true;
    while (queue.length) {
      var entry = queue.shift(), hexId = entry[0], path = entry[1];
      var parsed = G.parseId(hexId);
      if (!parsed) continue;
      var nbrs = G.neighbors(parsed.colIdx, parsed.rowIdx);
      for (var i = 0; i < nbrs.length; i++) {
        var nid = nbrs[i].id;
        if (seen[nid]) continue;
        var terrain = REAL_TERRAIN[nid];
        if (terrain && M.isProhibited(terrain)) continue;
        if (M.hexsideCost(edgeFeatureBetween(hexId, nid)) === Infinity) continue; // wall
        var next = path.concat([nid]);
        if (nid === goalHexId) return next;
        seen[nid] = true;
        queue.push([nid, next]);
      }
    }
    return null;
  }

  // A multi-hex Operations move: step the route one hex at a time, each step the ordinary
  // single-hex move with its own Paragraph Check, and stop the moment anything happens — a
  // paragraph with an effect, an event, an activation, Rounds commencing, the mission ending, or
  // the soldier becoming unable to move. Quiet hexes just go by. (§5/3 is unchanged: this is the
  // same action repeated, not a new kind of move.)
  var walking = null;
  // A walk is only live while its own soldier is still the selected one in Operations: anything
  // that ends the phase, the selection or the soldier ends it (a continuation that never arrives —
  // Rounds commencing inside a Paragraph Check, say — must not leave the map unclickable).
  function walkLive() { return !!walking && phase === 'movement' && selectedId === walking.id; }
  function walkRoute(goalHexId) {
    if (walking && !walkLive()) walking = null;
    var s = selectedSoldier();
    if (walking || !s || phase !== 'movement') return false;

    var route = operationsRoute(s.hexId, goalHexId);
    if (!route || !route.length) return false;
    if (route.length === 1) { doMove(route[0], endOpsMove); return true; }
    walking = { id: s.id, route: route, i: 0, goal: goalHexId };
    logLine(s.name + ' sets off for <b>' + goalHexId + '</b> (' + route.length + ' hexes).');
    stepWalk();
    return true;
  }
  function stopWalk(why) {
    if (!walking) return;
    var s = findSoldier(walking.id);
    if (why && s) logLine(s.name + ' stops at ' + s.hexId + ' &mdash; ' + why + '.');
    walking = null;
    if (phase === 'movement') { renderDestinations(); renderStatusBanner(); Info.refresh(); }
  }
  function stepWalk() {
    if (!walking) return;
    var s = findSoldier(walking.id);
    if (phase !== 'movement') { walking = null; return; }          // Rounds began, or the mission ended
    if (!s || !s.isActive || s.exited) { stopWalk('he can no longer move'); return; }
    if (selectedId !== walking.id) { stopWalk('another soldier was selected'); return; }
    var next = walking.route[walking.i];
    if (legalAdjacentHexIds(s).indexOf(next) === -1) { stopWalk('the way is blocked'); return; }
    walking.i++;
    doMove(next, function (quiet) {
      if (!walking) return;
      if (!quiet) { stopWalk('something happened here'); endOpsMove(); return; }
      if (walking.i >= walking.route.length) { stopWalk(null); endOpsMove(); return; }
      stepWalk();
    });
  }

  // One hex per Action (§5/3), so this is now a single step — no path/MP budget to walk. The
  // counter's own CSS transition (left/top .35s ease) provides the glide.
  //
  // §5/3 Group Movement (Task #67): when the "Move as group" checkbox is on, every soldier
  // `groupAt` returns moves together and the whole move shares ONE Paragraph Check — not the
  // rule's default (a lone soldier moving is already "a group of one" and always was), an
  // explicit opt-in the player chooses per move via `groupMoveRow`.
  // §5/3 "Move Captured German" (Task #72, docs/46_CAPTURED_GERMAN.md): every OTHER hex-content
  // change on a move (soldier positions) already existed; a captured German never moves on his
  // own, so bringing him along is an explicit opt-in via `bringPrisonerRow`, same pattern as
  // Group Move's opt-in checkbox — defaulting off, since leaving him behind (§11/2's "voluntary
  // release") is a legitimate, common choice, not an oversight to guard against.
  function capturedGermansAt(hexId) {
    return allGermans().filter(function (g) { return g.status === 'captured' && g.hexId === hexId; });
  }
  function renderBringPrisonerRow() {
    var s = selectedSoldier();
    var row = document.getElementById('bringPrisonerRow');
    document.getElementById('bringPrisonerToggle').checked = false; // always opt in fresh per selection
    if (!s || !capturedGermansAt(s.hexId).length) { row.style.display = 'none'; return; }
    row.style.display = '';
  }
  function doMove(hexId, onSettled) {
    clearDestMarks();
    var s = selectedSoldier();
    var asGroup = document.getElementById('groupMoveToggle').checked;
    var group = asGroup ? groupAt(s) : [s];
    var fromHexId = s.hexId;
    var bringPrisoners = document.getElementById('bringPrisonerToggle').checked;
    var prisoners = bringPrisoners ? capturedGermansAt(fromHexId) : [];
    group.forEach(function (t) {
      t.hexId = hexId;
      placeEl(counterEls[t.id], hexId);
    });
    prisoners.forEach(function (g) {
      g.hexId = hexId;
      var el = counterEls[g.id]; if (el) placeEl(el, hexId);
    });
    renderHud();
    var mover = group.length > 1 ? highestPcOf(group) : s;
    var names = group.map(function (t) { return t.name; }).join(', ');
    infoPopup({
      actor: mover, title: group.length > 1 ? 'Group Move' : 'Move',
      bodyHtml: (group.length > 1
        ? names + ' move together ' + fromHexId + ' &rarr; ' + hexId + ' (' + TERRAIN_LABELS[REAL_TERRAIN[hexId]] + ') &mdash; one Paragraph Check for the group (&sect;5/3).'
        : s.name + ' moves ' + fromHexId + ' &rarr; ' + hexId + ' (' + TERRAIN_LABELS[REAL_TERRAIN[hexId]] + ').') +
        (prisoners.length ? '<br>' + prisoners.map(function (g) { return g.name; }).join(', ') + ' (captured) comes along under guard (&sect;11/2).' : ''),
    }, function () {
      checkCapturedGermanEscapes(); // §11/2: anyone left behind unguarded is freed right now
      if (phase !== 'movement') { if (onSettled) onSettled(false); return; } // freeing a German can immediately commence Rounds
      runParagraphCheck(mover, function () {
        // REAL BUG, fixed: checkEndingConditions() was called only when a German left the map,
        // when damage was applied, on a capture, and when a US soldier exited — never after an
        // ordinary move. Ending 1 requires four specific hexes occupied AND no active Germans,
        // and the natural way to reach that is to clear the Germans first and then walk into
        // position. That last arrival is an ordinary move, so the condition was satisfied and
        // never noticed: the +4 VP scoring ending was effectively unreachable, which also
        // silently invalidated the reachable-VP ceiling the victory target is scaled from.
        // Found by the automated player (tools/bot/) walking onto T8 and finding nothing happened.
        checkEndingConditions();
        if (phase === 'movement') { renderGroupMoveRow(); renderBringPrisonerRow(); renderDestinations(); renderStatusBanner(); }
        // quiet = the hex produced nothing the player must see: the walk may go on.
        if (onSettled) onSettled(phase === 'movement' && lastCheckQuiet);
      });
    });
  }

  function renderHud() {
    var s = selectedSoldier();
    if (!s) return;
    document.getElementById('mc-img').src = currentImgFor(s);
    document.getElementById('mc-name').textContent = s.name;
    document.getElementById('mc-stats').innerHTML = 'IN:' + s.IN + ' PC:' + s.PC + ' WS:' + fmtSigned(s.WS) + ' \u00b7 at ' + s.hexId + ' \u00b7 ' + s.stance + kitHtml(s, true);
    document.getElementById('mc-mp').innerHTML = '<span style="color:var(--text-label);">MPA</span> <b>' + s.mpa + '</b> <span style="color:var(--text-label);font-size:10px;">(Rounds only — Operations tracks no MP, &sect;5/3)</span>';
    ['standing', 'crouching', 'prone'].forEach(function (st) { document.getElementById('stance-' + st).classList.toggle('active', s.stance === st); });
    var exitBtn = document.getElementById('exitMapBtn');
    exitBtn.disabled = !canExit(s);
    exitBtn.title = canExit(s) ? s.name + ' can leave the map from ' + s.hexId + '.' : 'Only from a north-edge entry hex (A1–J1).';
    var jamBtn = document.getElementById('clearJamOpsBtn');
    jamBtn.disabled = !canClearJam(s);
    jamBtn.title = s.weaponJammed ? (canClearJam(s) ? s.name + '\'s weapon is jammed — attempt to clear it (§9/4).' : 'Must be standing or crouching to clear a jam.') : 'No jammed weapon to clear.';
  }
  // A stance change is a finished action, and it reads as one: the stance stamps onto his counter
  // with what it allows, the ring closes, and the move markers fade in only after (Wan, 2026-10-23).
  // The state is final at once (renderDestinations runs now); only the showing waits.
  var STANCE_SAYS = { standing: '', crouching: 'crawl 1 hex', prone: 'cannot move' };
  var stanceBeatTimer = null;
  function stanceBeat(s) {
    FX.stamp(s.hexId, s.stance, 'amber', STANCE_SAYS[s.stance], 1400);
    document.body.classList.add('stance-beat');
    clearTimeout(stanceBeatTimer);
    stanceBeatTimer = setTimeout(function () { document.body.classList.remove('stance-beat'); }, 650);
  }
  // §5/3: "A soldier can change his stance" — no MP cost during Operations (that's §6/7's
  // Action-Round-only "one free change, extra costs 1 MP" mechanic). Always free here.
  ['standing', 'crouching', 'prone'].forEach(function (st) {
    document.getElementById('stance-' + st).addEventListener('click', function () {
      if (phase !== 'movement') return;
      var s = selectedSoldier();
      if (!s || s.stance === st) return;
      s.stance = st;
      logLine(s.name + ' changes stance to ' + st + '.');
      updateCounterVisual(s);
      renderHud(); renderGroupMoveRow(); renderDestinations(); renderStatusBanner();
      stanceBeat(s);
    });
  });
  // §5/3: Clear Jammed Weapon during Operations — untimed like every other Operations action
  // (no Turns/MP tracked, so nothing is "spent"), unlike the Rounds version which consumes the
  // soldier's Action for the Round.
  document.getElementById('clearJamOpsBtn').addEventListener('click', function () {
    if (phase !== 'movement') return;
    var s = selectedSoldier();
    if (!canClearJam(s)) return;
    document.getElementById('clearJamOpsBtn').disabled = true;
    clearJamRoll(s, function () { renderHud(); renderStatusBanner(); });
  });

  // A condition change requested by the paragraph interpreter (ctx.setCondition) mid-chain —
  // applied AFTER the current chain's pop-ups finish, per §5/5: "after completing the
  // instructions called for in the paragraph... replace the current Mission Card."
  var pendingConditionChange = null;

  // §5 step-by-step visibility: Perception/Activation Checks, Event Marker placement, Landmark
  // placement, VP awards, and named procedures all fire synchronously inside
  // Ops.paragraphCheck/readParagraphChain/conditionChange (paragraphinterpreter.js calls
  // ctx.resolveCheck/placeEventMarker/placeLandmark/awardVP/runProcedure directly, mid-computation
  // — there's no natural place to pause for a pop-up). Reused trick: the real roll/effect happens
  // for real, immediately (never faked or deferred) — only the POP-UP explaining it is queued and
  // replayed afterward, same as placeMarkersChain's AR Track rolls and the German target
  // tie-break. Each queued step is tagged with the hex and paragraph that produced it (via the
  // onEnterHex/onEnterParagraph observability hooks, operationsloop.js) so presentParagraphChain
  // can interleave it with the right paragraph's text instead of dumping everything at the end.
  var pendingSteps = [];
  var currentHex = null;
  var currentParagraph = null;

  // ctx.resolveCheck's Perception Check needs a real soldier's PC, but a Condition Change scan
  // (§5/5) walks EVERY occupied hex, potentially several different soldiers, with one shared ctx
  // — operationsloop.js's ctx model doesn't expose which hex is currently being checked back to
  // the caller. JUDGMENT CALL: use the given soldier's PC for the whole scan pass rather than
  // deriving a per-hex PC, documented in docs/31_VICTORY.md.
  function buildOpsCtx(pcSoldier) {
    return Ops.buildContext({
      rollDie: d10,
      activationLevel: MISSION.activation_by_condition[String(opsState.condition)],
      defaultPcRating: pcSoldier.PC,
      state: opsState,
      // paragraphHex: the incoming id comes straight from a paragraph's `hex` field, so it is
      // hyphenated ("T-8") and must be normalised before it reaches the LOS database.
      // {id, pc}: each soldier in sight rolls his own PC check (Phase 8c; it was the mover's PC).
      soldiersWhoCanSee: function (hexId) { var h = paragraphHex(hexId); return activeUS().filter(function (s) { return losClear(s.hexId, h, s.stance); }).map(function (s) { return { id: s.id, pc: s.PC }; }); },
      isGermanRemovedOnce: function (numericId) { var g = germans[germanInstanceId(numericId)]; return !!(g && !g.isActive); },
      onEnterHex: function (hexId) { currentHex = hexId; currentParagraph = null; },
      onEnterParagraph: function (num) { currentParagraph = num; },
      onCheckResolved: function (kind, modifier, roll, result, soldier) {
        pendingSteps.push({ type: 'check', hex: currentHex, paragraph: currentParagraph, kind: kind, modifier: modifier, roll: roll, result: result, soldierId: soldier ? soldier.id : null });
      },
      // 608 ("see 290 if in clear") and 195 (on or under the bridge) ask where the soldier
      // whose check is running stands. The engine has no under-the-bridge position, so a
      // soldier is never "under" one; a hex is a bridge when the LOS data notes a crossing.
      moverIs: function (test) {
        var h = pcSoldier.hexId;
        if (test === 'in_clear') return /^clear/.test(LOS_TERRAIN[h] || '');
        if (test === 'on_bridge') return /bridge/i.test((LOS_DB.hexes[h] || {}).notes || '');
        return false;
      },
      onHiddenFire: function (spec) { pendingSteps.push({ type: 'hidden_fire', hex: currentHex, paragraph: currentParagraph, spec: spec }); },
      // A "place_event_marker"/"place_landmark" op with no explicit hex in its paragraph data
      // means "this hex" (the one whose Paragraph Check is running) — fall back to currentHex.
      onPlaceEventMarker: function (hexId) { pendingSteps.push({ type: 'event_marker', hex: currentHex, paragraph: currentParagraph, hexId: hexId || currentHex }); },
      onPlaceLandmark: function (hexId) { pendingSteps.push({ type: 'landmark', hex: currentHex, paragraph: currentParagraph, hexId: paragraphHex(hexId) || currentHex }); },
      onSetCondition: function (to) { pendingConditionChange = to; },
      onAwardVP: function (amount, note) { pendingSteps.push({ type: 'award_vp', hex: currentHex, paragraph: currentParagraph, amount: amount, note: note }); },
      onRunProcedure: function (name) { pendingSteps.push({ type: 'run_procedure', hex: currentHex, paragraph: currentParagraph, name: name }); },
    });
  }

  // ---- The real Paragraph Check (§5/1) --------------------------------------------
  // Set by every Paragraph Check: did that hex have nothing to say? (task 6's walk stop test)
  var lastCheckQuiet = true;
  function runParagraphCheck(mover, next, opts) {
    opts = opts || {};
    pendingSteps = []; currentHex = mover.hexId; currentParagraph = null;
    var ctx = buildOpsCtx(mover);
    var result = Ops.paragraphCheck({
      hexId: mover.hexId, mission: '1', missionCards: MISSION_CARDS, paragraphs: PARAGRAPHS,
      programs: PROGRAMS, state: opsState, ctx: ctx, skipEventCheck: !!opts.skipEventCheck,
      rollForEvent: function () {
        var a = d10(), b = d10();
        pendingSteps.push({ type: 'event_roll', hex: mover.hexId, paragraph: null, a: a, b: b, sum: a + b });
        return a + b;
      },
    });

    lastCheckQuiet = result.effect === 'none' || !!result.skipped;
    // v3 Phase 8b: a hex whose sighting has already happened says so (show the machinery); the
    // walk does not stop for it
    if (result.skipped === 'sighting-already-occurred') {
      logLine(mover.hexId + ': sighting s' + result.sighting + ' has already happened, so its paragraph is crossed off (&sect;5/4).');
    }
    if (lastCheckQuiet) { next(); return; }
    presentParagraphChain(mover, result.chain, mover.hexId, next);
  }

  // ---- Condition Change scan shared by §5/5 (Operations) and §6/11 (Rounds) — same per-hex
  // procedure, ascending hex order, each entry's paragraph chain shown and folded in through the
  // ordinary presentParagraphChain/afterParagraphChain pipeline (which already runs §6/6's
  // mid-Round German-activation procedure for any activate_german effect it finds, whether we're
  // mid-Round or not — no separate activation handling needed here). The two callers below differ
  // only in whether the scan stops at the first activation and what happens once it's done.
  function runConditionChangeScan(to, stopOnActivation, onFinish) {
    logHeader('Condition changes to ' + to + '.');
    Cues.banner('condition', 'Condition ' + to, 'The Germans are more alert', 'alert');
    Cues.kranz('stern', '<b>Alarm!</b> Condition ' + to + '. Unless something closer forces his hand, every one of my men now reads the <b>Condition ' + to +
      '</b> column of his card (' + (phase === 'round' ? '&sect;6/11' : '&sect;5/5') + ').');
    var pcSoldier = activeUS()[0];
    if (!pcSoldier) { onFinish(); return; }
    pendingSteps = []; currentHex = null; currentParagraph = null;
    var ctx = buildOpsCtx(pcSoldier);
    var occupiedHexIds = activeUS().map(function (s) { return s.hexId; });
    // Both §5/5 and §6/11 clear all Event markers when the Condition changes — the on-map
    // markers follow.
    Object.keys(eventMarkerEls).forEach(function (id) { eventMarkerEls[id].remove(); });
    eventMarkerEls = {};
    var result = Ops.conditionChange({ to: to, occupiedHexIds: occupiedHexIds, mission: '1', missionCards: MISSION_CARDS, paragraphs: PARAGRAPHS, programs: PROGRAMS, state: opsState, ctx: ctx, stopOnActivation: stopOnActivation });

    var entries = result.log; // every hex's outcome, not just ones with a paragraph chain — a
    // bare Event-marker-placed-no-roll entry (§5/5's own text) is still shown via pendingSteps.
    var i = 0;
    function showNextEntry() {
      if (i >= entries.length) { onFinish(); return; }
      var entry = entries[i]; i++;
      var mover = activeUS().filter(function (s) { return s.hexId === entry.hexId; })[0] || pcSoldier;
      presentParagraphChain(mover, entry.chain, entry.hexId, showNextEntry);
    }
    showNextEntry();
  }
  // §5/5: paragraph checks for every occupied hex, ascending order, stopping the instant a
  // German activates ("do not check other hexes"). Only ever entered from Operations (phase
  // 'movement'), so a resulting activation starts a fresh Round 1.
  function runConditionChange(to, next) {
    runConditionChangeScan(to, true, function () {
      if (activeGermans().length && phase === 'movement') { startActionRound(1); return; }
      next();
    });
  }
  // §6/11: "Conduct Paragraph Checks for all US occupied hexes... All indicated German
  // activations (if any) occur using the procedure in 6/6... Once all Paragraph Checks and
  // activations are dealt with, return to the Round in progress." Unlike §5/5, does NOT stop at
  // the first activation, and never starts a fresh Round — the Round already in progress simply
  // resumes (`next` returns control to wherever the triggering paragraph chain was — a German's
  // own turn, a US soldier's Round move, or the Event Phase).
  function runRoundsConditionChange(to, next) {
    runConditionChangeScan(to, false, next);
  }

  // Merges the paragraph-text steps (chain.visited) with the queued pendingSteps tagged to this
  // hex, in presentation order: any hex-level steps with no paragraph yet (paragraph: null — e.g.
  // the leading Event Check roll, or a bare marker placement) first, then each paragraph's text
  // followed immediately by the steps its own program produced.
  function buildStepPlan(visited, hexId) {
    var plan = [];
    pendingSteps.filter(function (s) { return s.hex === hexId && s.paragraph === null; }).forEach(function (s) { plan.push(s); });
    visited.forEach(function (num) {
      plan.push({ type: 'paragraph_text', num: num });
      pendingSteps.filter(function (s) { return s.hex === hexId && s.paragraph === num; }).forEach(function (s) { plan.push(s); });
    });
    return plan;
  }

  // A Random Event's paragraph (the plan opens with an Event Check roll; a hex gives a paragraph
  // or an event, never both, §5/1) shows one line on the card and keeps the full text in the
  // radio log, like a German's paragraph. The steps it produces still show on the card.
  var EVENT_READ_MS = 4000;
  function eventLine(num, text) {
    var plain = stripTags(String(text || '').replace(/_x000B_/g, ' ').replace(/¥/g, '')).replace(/\s+/g, ' ').trim();
    var first = (/^.*?[.!?:](?=\s|$)/.exec(plain) || [plain])[0];
    var words = first.split(' ');
    if (words.length > 18) first = words.slice(0, 18).join(' ') + '&hellip;';
    return 'Paragraph <b>' + num + '</b>: ' + first + ' <span class="why">(full text in the log)</span>';
  }
  function presentParagraphChain(mover, chain, hexId, next) {
    chain = chain || { visited: [], effects: [] };
    var plan = buildStepPlan(chain.visited, hexId);
    var fromEvent = plan.some(function (s) { return s.type === 'event_roll'; });
    var i = 0;
    function showNext() {
      if (i >= plan.length) { noteContact(mover, chain); afterParagraphChain(chain, next); return; }
      var step = plan[i]; i++;
      if (step.type === 'paragraph_text') {
        var text = PARAGRAPHS[step.num];
        infoPopup({
          actor: mover, title: 'Paragraph ' + step.num, variant: 'wide', bodyIsParagraph: true,
          bodyHtml: text || '(no text on file)', logHtml: 'Paragraph <b>' + step.num + '</b> read.',
          cardHtml: fromEvent ? eventLine(step.num, text) : undefined, maxReadMs: fromEvent ? EVENT_READ_MS : undefined,
        }, showNext);
        return;
      }
      presentStep(mover, step, showNext);
    }
    showNext();
  }

  // One popup per queued side-effect step, replaying the already-decided real roll where there
  // is one (kind: 'single' with presetValue — same trick as placeMarkersChain).
  function presentStep(mover, step, cb) {
    if (step.type === 'check') {
      var label = step.kind === 'activation' ? 'Activation Check' : 'Perception Check';
      var roller = (step.soldierId && findSoldier(step.soldierId)) || mover;
      var rating = step.kind === 'activation' ? MISSION.activation_by_condition[String(opsState.condition)] : roller.PC;
      if (step.soldierId) label += ' — ' + roller.name;
      rollPopup({
        actor: roller, title: label, kind: 'single', presetValue: step.roll,
        contextHtml: label + (step.modifier ? ' (' + fmtSigned(step.modifier) + ')' : '') + ' — rating ' + rating + '.',
        explain: function () { return 'Rolls <b>' + step.roll + '</b> &rarr; <b>' + step.result.toUpperCase() + '</b>.'; },
        logText: function () { return label + ': <span class="roll">' + step.roll + '</span> &rarr; ' + step.result + '.'; },
      }, cb);
      return;
    }
    if (step.type === 'event_roll') {
      var reIndex = pad2(step.sum);
      rollPopup({
        actor: mover, title: 'Event Check', kind: 'dual', diceLabels: ['D1', 'D2'], presetValue: { a: step.a, b: step.b }, maxReadMs: EVENT_READ_MS,
        contextHtml: 'Roll two dice and add them together (&sect;5/6).',
        explain: function () { return 'Sum <b>' + step.sum + '</b> &rarr; Random Event <b>RE-' + reIndex + '</b>.'; },
        logText: function () { return 'Event Check: <span class="roll">' + step.a + ' + ' + step.b + '</span> &rarr; RE-' + reIndex + '.'; },
      }, cb);
      return;
    }
    if (step.type === 'event_marker') {
      // No hex: the paragraph was reached by the Rounds Event Check (§6/1), which belongs to the
      // Round rather than to any hex, so there is no square to mark. Say so plainly instead of
      // announcing a marker "placed at null".
      if (!step.hexId) {
        infoPopup({ actor: mover, title: 'Event Marker', maxReadMs: EVENT_READ_MS, bodyHtml: 'This paragraph calls for an Event marker, but it was reached by the Round&rsquo;s own Event Check rather than by entering a hex (&sect;6/1) &mdash; there is no hex to mark, so none is placed.' }, cb);
        return;
      }
      placeEventMarkerEl(step.hexId);
      infoPopup({ actor: mover, title: 'Event Marker', maxReadMs: EVENT_READ_MS, bodyHtml: 'An Event marker is placed at ' + step.hexId + '. No further Paragraph or Event Checks are made there until the Condition changes.' }, cb);
      return;
    }
    if (step.type === 'landmark') {
      // Same hexless case as the Event marker above.
      infoPopup({
        actor: mover, title: 'Landmark',
        bodyHtml: step.hexId
          ? 'A landmark is placed at ' + step.hexId + '.'
          : 'This paragraph calls for a landmark, but it was reached by the Round&rsquo;s own Event Check rather than by entering a hex (&sect;6/1) &mdash; there is no hex to place it in.',
      }, cb);
      return;
    }
    if (step.type === 'award_vp') {
      vpState.awards.push({ amount: step.amount, note: step.note || 'paragraph award' });
      renderVP();
      infoPopup({ actor: mover, title: 'Victory Points', bodyHtml: 'This paragraph awards <b>+' + step.amount + ' VP</b>' + (step.note ? ' (' + step.note + ')' : '') + '.' }, cb);
      return;
    }
    if (step.type === 'hidden_fire') { hiddenFireChain(mover, step.spec, cb); return; }
    if (step.type === 'run_procedure') {
      infoPopup({ actor: mover, title: 'Procedure', bodyHtml: 'Procedure triggered: <b>' + step.name + '</b>.' }, cb);
      return;
    }
    cb();
  }

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
  var pendingContact = null;
  function noteContact(mover, chain) {
    var terms = Ops.contactTerms(chain.effects || []);
    if (!terms || phase === 'round') return;
    terms.paragraph = chain.visited[chain.visited.length - 1];
    terms.awareIds = terms.awareSoldiers.map(function (id) { return id === 'mover' ? mover.id : id; });
    terms.germanIds = terms.germanTwoTurns.map(germanInstanceId);
    pendingContact = terms;
  }
  function afterParagraphChain(chain, next) {
    var activateEffects = chain.effects.filter(function (e) { return e.op === 'activate_german'; });
    function afterActivation() {
      if (pendingConditionChange !== null) {
        var to = pendingConditionChange;
        pendingConditionChange = null;
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
        if (to <= opsState.condition) { next(); return; }
        // Task #66 (docs/41_CONDITION_CHANGE_ROUNDS.md): §5/5 vs §6/11 are triggered from the
        // same ctx.setCondition hook — this is the one place that already knows whether Rounds
        // are actually in progress (`phase === 'round'`) when the paragraph that requested the
        // change finishes, so it's the natural dispatch point rather than duplicating a phase
        // check at every caller of runParagraphCheck/runGermanParagraph/runEventPhase.
        if (phase === 'round') runRoundsConditionChange(to, next);
        else runConditionChange(to, next);
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
      if (phase === 'round') { insertMidRoundGermans(newIds, next); return; }
      startActionRound(1); return;
    }
    var eff = effects[i];
    var ids = (eff.ids || []).slice();
    function revealNext() {
      if (!ids.length) { activateGermansSequentially(effects, i + 1, next, newIds); return; }
      var numericId = ids.shift();
      var cardId = resolveGermanCardId(numericId);
      // Keyed by instance, not by card — see germanInstanceId. Two Germans sharing a substituted
      // card are two soldiers, and "already active" has to mean this one, not his stand-in twin.
      var instanceId = germanInstanceId(numericId);
      if (germans[instanceId] && germans[instanceId].isActive) { revealNext(); return; } // already active
      // A German already activated once and since removed does not activate a second time: §2/1's
      // Activation VP is paid "regardless of what happens later with that German", so re-running
      // his activation would pay it twice for one soldier.
      if (germans[instanceId]) { revealNext(); return; }
      var card = GERMAN_ROSTER[cardId];
      var g = {
        id: instanceId, name: 'German (' + instanceId + ', ' + card.Role + ')', side: 'german', card: card,
        img: img('soldiers/de_soldier_' + (Sched.letterFromGermanCardId(cardId) || 'T') + '_crouching.png'),
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
        weaponId: guessGermanWeaponId(card), hexId: eff.hex ? paragraphHex(eff.hex) : mapAnyHex(),
        stance: eff.stance || 'crouching', isCommander: false, wounded: false, status: 'unharmed', isActive: true,
        letter: Sched.letterFromGermanCardId(cardId), specialReaction: eff.specialReaction || null,
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
      germans[instanceId] = g;
      newIds.push(cardId);
      logHeader('German activated: ' + g.name + ' at ' + g.hexId + '.');
      Cues.banner('activation', 'German Activated', (card.Role ? card.Role + ' · ' : '') + g.hexId);
      Cues.kranz(Object.keys(germans).length > 1 ? 'smug' : 'confident', '<b>Achtung!</b> ' + g.name +
        ' takes his post at <b>' + g.hexId + '</b>. From now on he acts by his own card. He is worth <b>' + V.germanActivationVP(card.VP) +
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
      if (idx >= ids.length) { renderTrack(); next(); return; }
      var g = germans[ids[idx]];
      var entry = { id: g.id, IN: g.IN, hexId: g.hexId, letter: g.letter, isCommander: false, receivesTwoTurns: g.receivesTwoTurns };
      if (g.receivesTwoTurns) {
        var result = Sched.insertMidRoundGerman(track, entry, { arTrack: window.AMBUSH_AR_TRACK });
        infoPopup({
          actor: g, title: 'Mid-Round Activation &mdash; AR Track',
          bodyHtml: g.name + ' joins the current Round&rsquo;s Action Round Track in the <b>' + slotLabel(result.slot) + '</b> space (&sect;6/6, receives two turns). No effect on US awareness.',
          logHtml: 'Mid-Round activation for ' + g.name + ': placed directly in ' + slotLabel(result.slot) + ' (two turns).',
        }, function () { step(idx + 1); });
        return;
      }
      var roll = d10();
      var result2 = Sched.insertMidRoundGerman(track, entry, { rollDie: function () { return roll; }, arTrack: window.AMBUSH_AR_TRACK });
      rollPopup({
        actor: g, title: 'Mid-Round Activation &mdash; AR Track', kind: 'single', presetValue: roll,
        contextHtml: g.name + ' (IN ' + g.IN + ') joins the current Round&rsquo;s Action Round Track (&sect;6/6). No effect on US awareness.',
        explain: function () {
          return 'Rolls <b>' + roll + '</b> &rarr; ' + (result2.inserted
            ? 'placed in <b>' + slotLabel(result2.slot) + '</b> &mdash; will act later this Round.'
            : 'his slot has already passed this Round &mdash; placed in <b>Complete</b>, acts starting next Round.');
        },
        logText: function () {
          return 'Mid-Round activation for ' + g.name + ': <span class="roll">' + roll + '</span> &rarr; ' + slotLabel(result2.slot) +
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
    infoPopup({
      actor: g, title: 'German Activated — Card ' + card['Card ID'], variant: 'wide',
      bodyHtml: germanCardHtml(card, numericId),
      logHtml: 'German card <b>' + card['Card ID'] + '</b> (' + card.Role + ') drawn.',
    }, step2);

    // Step 2 — "Add Victory Points the soldier has on his card to your Squad Sheet." §2/1: this
    // is the Activation award, kept "regardless of what happens later with that German."
    function step2() {
      var award = V.germanActivationVP(card.VP);
      vpState.germanActivations.push({ cardId: g.id, vpText: card.VP || '' });
      renderVP();
      var totals = V.computeVPTotal(vpState);
      var conditional = V.parseGermanVP(card.VP || '').conditional;
      infoPopup({
        actor: g, title: 'Victory Points Awarded',
        bodyHtml: '<b>+' + award + ' VP</b> for activating ' + card['Card ID'] + '. You keep this regardless of what happens to him later (&sect;2/1).' +
          (conditional ? '<br><br>His card also carries a conditional award: <b>+' + conditional.amount + ' VP if ' + conditional.trigger + '</b>.' : '') +
          '<br><br>Squad total is now <b>' + totals.total + ' VP</b> (need ' + vpRequirement() + ').',
        logHtml: 'Activation award: <b>+' + award + ' VP</b> (' + card['Card ID'] + ') &rarr; total ' + totals.total + '.',
      }, step3);
    }

    // Step 3 — "On the map place a Soldier counter with that letter in the Hex listed in the
    // Paragraph to show where the Soldier is." Scrolls there too: an activation hex can be far
    // from the squad, and a counter placed off-screen reads as nothing having happened.
    function step3() {
      var el = document.createElement('div');
      el.className = 'counter enemy';
      el.dataset.soldierId = g.id;
      placeEl(el, g.hexId);
      el.innerHTML = '<img src="' + currentImgFor(g) + '">';
      el.addEventListener('click', function (e) { e.stopPropagation(); showSoldierInspector(g.id); });
      canvas.appendChild(el);
      counterEls[g.id] = el;
      scrollMapTo(g.hexId);
      infoPopup({
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
      infoPopup({
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
      ['Counter letter', Sched.letterFromGermanCardId(card['Card ID']) || '—'],
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
    var weapon = weaponById(firer.weaponId);
    var band = FC.resolveRangeBand(weapon, FC.hexDistance(firer.hexId, target.hexId));
    if (!band) return null;
    var baseHit = CHART.BASE_HIT[band];
    var terrainMod = FC.resolveTerrainMod(CHART.FIRE_MODS_TERRAIN, terrainRowForTarget(firer, target), target.stance);
    var otherMods = firer.status === 'wounded' ? [-1] : [];
    // Easy mode's handicap rides in as an ordinary modifier rather than a post-hoc adjustment, so
    // it clamps with everything else (§9/1 step 4) and shows up in the breakdown as its own term.
    var easyMod = D.hitChanceMod(difficulty, firer.side);
    if (easyMod) otherMods.push(easyMod);
    var clamped = FC.computeFinalHitChance({ baseHit: baseHit, terrainMod: terrainMod, fireType: fireType, weaponSkill: firer.WS, otherMods: otherMods }).clamped;
    return { baseHit: baseHit, band: band, terrainMod: terrainMod, ws: firer.WS, fireType: fireType, easyMod: easyMod, clamped: clamped };
  }
  function hitBreakdownHtml(b) {
    return termSpan('Base ' + b.baseHit + ' (' + b.band + ')', baseHitTip(b.band)) + ' ' +
      termSpan(fmtSigned(b.terrainMod) + ' terrain', terrainHitTip()) + ', ' +
      termSpan(fmtSigned(b.ws) + ' WS', statTip('WS')) +
      (b.fireType === 'snap' ? ', ' + termSpan('&minus;2 snap', snapHitTip()) : '') +
      (b.easyMod ? ', ' + termSpan(fmtSigned(b.easyMod) + ' easy mode', easyModTip(b.easyMod)) : '') +
      ' &rarr; Hit Chance <b>' + b.clamped + '</b>.';
  }
  function hitBreakdownText(b) {
    return 'Base ' + b.baseHit + ' (' + b.band + ' range) ' + fmtSigned(b.terrainMod) + ' terrain, ' + fmtSigned(b.ws) + ' WS' +
      (b.fireType === 'snap' ? ', -2 snap' : '') + (b.easyMod ? ', ' + fmtSigned(b.easyMod) + ' easy mode' : '') +
      ' -> Hit Chance ' + b.clamped + '.';
  }

  // Soldier Inspector — click any soldier or German counter, in Operations OR Rounds, to see a
  // full plain-language breakdown of what his stats mean, how exposed his current terrain/stance
  // leaves him, and what he's carrying. Read-only, no state change — reuses the exact same
  // .gcard/.gcard-row/.gcard-notes styling germanCardHtml already established, since it's the
  // same "key facts + explanatory notes" shape. Answers a direct user request: "I need more
  // information to make decisions" after finding the game's combat unforgiving.
  function showSoldierInspector(id) {
    var s = findSoldier(id);
    if (!s) return;
    var isGerman = s.side === 'german';
    var terrainRow = CHART.FIRE_MODS_TERRAIN[terrainRowFor(s.hexId)];
    var stances = ['standing', 'crouching', 'prone'];
    var stanceHtml = stances.map(function (st, i) {
      var mod = terrainRow.mods[i];
      var cur = st === s.stance ? ' current' : '';
      return '<div class="stance-cell' + cur + '"><b>' + st + '</b><span>' +
        (mod === null || mod === undefined ? 'n/a' : fmtSigned(mod)) + '</span></div>';
    }).join('');

    var statRows = [
      ['IN', 'Initiative (IN)', s.IN], ['PC', 'Perception (PC)', s.PC],
      ['WS', 'Weapon Skill (WS)', fmtSigned(s.WS)], ['MPA', 'Movement (MPA)', s.mpa],
    ];
    var gcard = '<div class="gcard">' + statRows.map(function (r) {
      return '<div class="gcard-row">' + termSpan(r[1], statTip(r[0], isGerman)) + '<b>' + r[2] + '</b></div>';
    }).join('') + '</div>';

    var terrainNotes = '<div class="gcard-notes"><span>Terrain &amp; exposure &mdash; ' + (terrainRow.loc || 'unknown') + '</span>' +
      'How exposed he is to enemy fire in each stance, right here (higher = easier to hit; his current stance is highlighted).' +
      '<div class="stance-table">' + stanceHtml + '</div></div>';

    var equipNotes = '<div class="gcard-notes"><span>Carrying</span>' + kitHtml(s) + '</div>';

    // solo: a fresh card each time, so clicking him again never stacks a second copy (Wan, 2026-10-25)
    infoPopup({
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
    return GAct.weaponIdForCard(card);
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

  // ---------------------------------------------------------------------
  // Action Round
  // ---------------------------------------------------------------------
  function startActionRound(n) {
    walking = null; // a walk interrupted by Rounds commencing is over, and its continuation
    phase = 'round';
    roundNum = n;
    // §9/7's "a maximum of two soldiers can fire a single crew weapon in one Round" is a per-Round
    // cap, so it is cleared here with the Round, not per turn.
    usSoldiers.forEach(function (s) { s.crewFiredBy = []; });
    Object.keys(germans).forEach(function (k) { germans[k].crewFiredBy = []; });
    document.getElementById('tb-phase').textContent = 'Action Round ' + n;
    if (n === 1) Cues.banner('phase', 'Contact!', 'Action Round 1', 'alert'); else Cues.banner('phase', 'Action Round ' + n);
    document.getElementById('status-banner').textContent = 'Contact! Action Round in progress.';
    document.getElementById('status-banner').className = '';
    document.getElementById('movement-sec').style.display = 'none';
    document.getElementById('round-sec').style.display = 'none';
    clearDestMarks();

    // §6/5: "When Rounds end and you return to Operations, all US soldiers are again considered
    // unaware." startActionRound(1) is called exactly once per fresh Rounds sequence (never
    // again while already mid-Round — see activateGermansSequentially's own comment), so it's
    // the one safe place to reset everyone for real.
    if (n === 1) usSoldiers.forEach(function (s) { s.aware = false; });
    // "The US soldier who just made his PC check is automatically aware" (289, 312, 316, 333,
    // 602, 606): aware before the Awareness Phase, so he skips its check and is placed normally.
    if (n === 1 && pendingContact) {
      pendingContact.awareIds.forEach(function (id) {
        var s = findSoldier(id);
        if (!s || !s.isActive) return;
        s.aware = true;
        logLine(s.name + ' made the PC check and is automatically aware (paragraph ' + pendingContact.paragraph + ').');
      });
    }

    infoPopup({ title: 'Round ' + n, bodyHtml: 'Round ' + n + ' begins.' + (n <= 2 ? ' Determining US Awareness.' : '') }, function () {
      runAwarenessPhase(n, function () { runEventPhase(n, function () { rollInitiativeAdvantage(n); }); });
    });
  }

  // ---------------------------------------------------------------------
  // §6/1 step 2 Rounds Event Phase — "Not conducted in Round 1." One Event Check per Round,
  // resolved "in the same way as an Event Check during Operations (5/6)" — same RE-column
  // mechanism, reused via Ops.roundEventCheck. Unlike Operations' per-hex version, this isn't
  // tied to any soldier's move, so there's no natural "mover" for the resulting pop-ups' actor
  // portrait or for a `check` op's default PC rating — reuses activeUS()[0] as the stand-in,
  // the same judgment call runConditionChange already makes for its own per-hex PC Checks
  // (operationsloop.js's ctx has no concept of "whose PC" for a check with no specific soldier).
  // Reuses the exact same pendingSteps/presentParagraphChain display pipeline as every other
  // paragraph-driven pop-up chain — event_roll shows first (queued below, matching
  // runParagraphCheck's own rollForEvent), then the resulting paragraph and its effects, if any.
  function runEventPhase(n, next) {
    if (n === 1) { next(); return; } // "Not conducted in Round 1"
    var mover = activeUS()[0];
    if (!mover) { next(); return; } // no active US soldier left — the mission has surely ended by now
    pendingSteps = []; currentHex = null; currentParagraph = null;
    var ctx = buildOpsCtx(mover);
    var result = Ops.roundEventCheck({
      mission: '1', missionCards: MISSION_CARDS, condition: opsState.condition, paragraphs: PARAGRAPHS,
      programs: PROGRAMS, state: opsState, ctx: ctx,
      rollForEvent: function () {
        var a = d10(), b = d10();
        pendingSteps.push({ type: 'event_roll', hex: null, paragraph: null, a: a, b: b, sum: a + b });
        return a + b;
      },
    });
    presentParagraphChain(mover, result.chain, null, next);
  }

  // ---------------------------------------------------------------------
  // §6/1 step 1 / §6/5 US Soldier Awareness — Rounds 1 and 2 only; automatic from Round 3.
  // ---------------------------------------------------------------------
  function runAwarenessPhase(n, next) {
    if (n > 2) {
      // "Round 3 and after, all active US soldiers are automatically aware, regardless of their
      // location" — no check, no Awareness Phase step at all (§6/1 step 1 is "Rounds 1 and 2
      // only"), so unlike the Round 1/2 checks below, this grants a full normal turn this Round,
      // not the Complete-only placement a just-passed check gets.
      var awakened = activeUS().filter(function (s) { return !s.aware; });
      awakened.forEach(function (s) { s.aware = true; });
      if (!awakened.length) { next(); return; }
      infoPopup({
        title: 'US Awareness', bodyHtml: awakened.map(function (s) { return s.name; }).join(', ') +
          (awakened.length > 1 ? ' are' : ' is') + ' automatically aware from Round 3 onward (&sect;6/5).',
      }, next);
      return;
    }
    var candidates;
    if (n === 1) {
      // "each active US soldier that can see the German just activated" — at this exact moment
      // activeGermans() IS the just-activated batch, since startActionRound(1) only ever runs
      // once, at the true start of a fresh Rounds sequence (no other German can be active yet).
      // A paragraph activating more than one German at once isn't addressed by the rule text
      // (which assumes one) — checked against seeing ANY of them, the natural reading.
      var justActivated = activeGermans();
      candidates = activeUS().filter(function (s) { return !s.aware && justActivated.some(function (g) { return losClearBetween(s, g); }); });
    } else {
      // Round 2: "each active US soldier ON THE MAP that is not yet aware", regardless of LOS.
      candidates = activeUS().filter(function (s) { return !s.aware; });
    }
    runAwarenessChecks(candidates, 0, next);
  }
  function runAwarenessChecks(list, i, next) {
    if (i >= list.length) { next(); return; }
    var s = list[i];
    rollPopup({
      actor: s, title: 'US Awareness Check', kind: 'single',
      contextHtml: s.name + ' (PC ' + s.PC + ') checks for awareness of the German activation (&sect;6/5).',
      explain: function (roll) { return Checks.resolvePerceptionCheck(s.PC, 0, roll) === 'success' ? '<b style="color:var(--clear)">AWARE</b>.' : 'Still <b>unaware</b>.'; },
      logText: function (roll) { var ok = Checks.resolvePerceptionCheck(s.PC, 0, roll) === 'success'; return 'Awareness check for ' + s.name + ': <span class="roll">' + roll + '</span> vs PC ' + s.PC + ' &rarr; ' + (ok ? 'AWARE' : 'unaware') + '.'; },
    }, function (roll) {
      // Placed straight in Complete by placeMarkersChain below, not given a normal turn slot —
      // the rulebook places a just-passed Awareness Check's soldier in Complete directly (same
      // wording used for the "unaware soldier who is attacked" case, wakeUpUnawareInHex).
      if (Checks.resolvePerceptionCheck(s.PC, 0, roll) === 'success') { s.aware = true; s.justBecameAware = true; }
      runAwarenessChecks(list, i + 1, next);
    });
  }
  // §6/5 / §11/4: an unaware US soldier who is attacked (even a miss) becomes aware once the
  // attack resolves — every soldier in the target hex, not just the one actually targeted.
  // Called only for German-initiated fire/assault; US soldiers firing at Germans never affects
  // US awareness (Germans have no such state — they're aware the instant they're activated).
  function wakeUpUnawareInHex(hexId) {
    activeUS().filter(function (s) { return s.hexId === hexId && !s.aware; }).forEach(function (s) {
      s.aware = true;
      if (phase === 'round') Sched.applyBecomesAware(track, s.id);
      logLine(s.name + ' is now aware (&sect;6/5).');
    });
  }
  function rollInitiativeAdvantage(n) {
    // §6/1: "The paragraph that activates the Germans and initiates Rounds may state that one
    // side or the other has the advantage in the first Round... although you still roll."
    var fixed = n === 1 && pendingContact && pendingContact.advantage ? pendingContact : null;
    function sideOf(rolls) {
      if (fixed) return fixed.advantage;
      return AR.resolveAdvantage(rolls.a, rolls.b) === 'german' ? 'german' : 'US';
    }
    rollPopup({
      title: 'Initiative — Round ' + n, kind: 'dual', diceLabels: ['US', 'GERMAN'],
      contextHtml: fixed
        ? 'Paragraph ' + fixed.paragraph + ' gives the <b>' + fixed.advantage.toUpperCase() + '</b> side the advantage this Round. The dice are still rolled (&sect;6/1).'
        : 'US rolls one die, the German side rolls one die. Higher roll has the advantage; ties go to the German.',
      explain: function (rolls) {
        return 'US <b>' + rolls.a + '</b> vs German <b>' + rolls.b + '</b> &rarr; advantage <b>' + sideOf(rolls).toUpperCase() + '</b>' +
          (fixed ? ' (paragraph ' + fixed.paragraph + ')' : '') + '.';
      },
      logText: function (rolls) {
        return 'Round ' + n + ' Initiative: US ' + rolls.a + ', German ' + rolls.b + ' &rarr; advantage ' + sideOf(rolls).toUpperCase() +
          (fixed ? ' (set by paragraph ' + fixed.paragraph + ')' : '') + '.';
      },
    }, function (rolls) {
      placeMarkersChain(n, sideOf(rolls));
    });
  }
  function placeMarkersChain(n, advantageSide) {
    document.getElementById('track-sec').style.display = 'none';
    var contact = n === 1 ? pendingContact : null;
    pendingContact = null;
    // §6/5: a still-unaware soldier skips initiative placement entirely (Unaware slot); a
    // soldier whose Awareness Check just succeeded this Round (runAwarenessChecks) also skips
    // it, landing straight in Complete rather than a real turn — see placeMarkers' `placement`
    // doc comment in arscheduler.js. Both were already narrated by the Awareness Phase's own
    // pop-ups, so neither gets a redundant Initiative Roll pop-up below.
    var roster = activeUS().map(function (s) {
      // §13/1 (docs/40_PANIC_EFFECTS.md, Task #65): "A panicked commander has no command
      // radius" — read by AR.commandContributors' own panicked-aware radius check.
      var entry = { id: s.id, side: 'US', IN: s.IN, wounded: s.wounded, isCommander: s.isCommander, isActive: true, hexId: s.hexId, letter: null, panicked: s.status === 'panicked' };
      if (!s.aware) entry.placement = 'unaware';
      else if (s.justBecameAware) { entry.placement = 'complete'; s.justBecameAware = false; }
      // "All aware US soldiers, that do not panic, receive 2 turns this Round" (289, 312, 333).
      else if (contact && contact.awareUsTwoTurns && s.status !== 'panicked') entry.receivesTwoTurns = true;
      return entry;
    });
    var gList = activeGermans();
    currentGermanIdsThisRound = gList.map(function (g) { return g.id; });
    gList.forEach(function (g) {
      roster.push({ id: g.id, side: 'german', IN: g.IN, wounded: g.wounded, isCommander: false, isActive: true, hexId: g.hexId, letter: g.letter,
        receivesTwoTurns: !!(contact && contact.germanIds.indexOf(g.id) !== -1) });
    });

    var rollsById = {}, classifyById = {};
    roster.forEach(function (entry) {
      if (entry.placement || entry.receivesTwoTurns) return;
      var r = d10();
      rollsById[entry.id] = r;
      classifyById[entry.id] = AR.classifyARRoll(window.AMBUSH_AR_TRACK, entry.IN, r);
    });
    track = Sched.placeMarkers({ round: n, advantageSide: advantageSide, arTrack: window.AMBUSH_AR_TRACK, roster: roster, rollDie: function (entry) { return rollsById[entry.id]; } });

    roster.forEach(function (entry) {
      if (entry.receivesTwoTurns) logLine(findSoldier(entry.id).name + ' receives ' + (entry.wounded ? 'one turn (wounded)' : '2 turns') + ' this Round, no roll (paragraph ' + contact.paragraph + ').');
    });
    var queue = roster.filter(function (entry) { return !entry.placement && !entry.receivesTwoTurns; });
    function nextEntry() {
      if (!queue.length) { document.getElementById('track-sec').style.display = ''; renderTrack(); afterPlacement(n); return; }
      var entry = queue.shift();
      var soldier = findSoldier(entry.id);
      var roll = rollsById[entry.id], cls = classifyById[entry.id];
      rollPopup({
        actor: soldier, title: 'Initiative Roll', kind: 'single', presetValue: roll,
        contextHtml: soldier.name + ' (IN ' + entry.IN + ') rolls for the AR Track.',
        explain: function () { var slot = track.soldiers[entry.id].slot; return 'Rolls <b>' + roll + '</b> &rarr; placed in <b>' + slotLabel(slot) + '</b>.'; },
        logText: function () { var slot = track.soldiers[entry.id].slot; return 'Initiative for ' + soldier.name + ': <span class="roll">' + roll + '</span> &rarr; ' + slotLabel(slot) + '.'; },
      }, function () { nextEntry(); });
    }
    nextEntry();
  }
  // The contact paragraph's "Go to Condition N" waits in pendingConditionChange, because the
  // Germans' activation hands straight to Round 1 (activateGermansSequentially). Applied once
  // Round 1's markers are down, as a change during Rounds (§6/11), so the first German turn
  // already reads the new Condition's column (docs/PARAGRAPH_DATA_GAPS.md §4, Phase 8c).
  function afterPlacement(n) {
    if (n === 1 && pendingConditionChange !== null) {
      var to = pendingConditionChange;
      pendingConditionChange = null;
      if (to > opsState.condition) { runRoundsConditionChange(to, driveNext); return; }
    }
    driveNext();
  }
  function slotLabel(key) {
    return { '2adv': '2-Turn (adv)', '2disadv': '2-Turn (disadv)', '1adv': '1-Turn (adv)', '1disadv': '1-Turn (disadv)', panic: 'Panic', complete: 'Complete', inactive: 'Inactive', unaware: 'Unaware' }[key];
  }
  function occStr(ids) {
    if (!ids.length) return '<span style="color:var(--text-label);">&mdash;</span>';
    return ids.map(function (id) { var s = findSoldier(id); return '<span' + (s.side === 'german' ? ' class="g"' : '') + '>' + s.name.split(' ').pop() + '</span>'; }).join(', ');
  }
  function renderTrack() {
    var cur = Sched.isRoundComplete(track) ? { done: true } : Sched.nextActor(track);
    var html = '';
    ['unaware', '2adv', '2disadv', '1adv', '1disadv', 'panic', 'complete'].forEach(function (key) {
      var occ = Sched.occupantsOf(track, key);
      var isCurrent = !cur.done && key === cur.slot;
      html += '<div class="ar-slot' + (isCurrent ? ' current' : '') + '"><span class="label">' + slotLabel(key) + '</span><span class="occ">' + occStr(occ) + '</span></div>';
    });
    document.getElementById('ar-track').innerHTML = html;
  }
  // v3 Phase 3b (Wan, 2026-10-22): the next turn starts at once; the finished card stays up until
  // the player's next decision closes it (Resolve.awaitDone).
  function driveNext() {
    if (phase !== 'round') return;
    document.getElementById('action-sec').style.display = 'none';
    highlightActor(null);
    Resolve.awaitDone(driveNextNow);
  }
  // §6/1: "If more than one US soldier occupies a space, you can have them go in any order you
  // wish." The scheduler takes the player's pick through its chooseUS hook; v2 always took the
  // first. While the player chooses, those counters glow and the soldier panel lists them.
  var picking = null;
  function driveNextNow() {
    if (phase !== 'round' || picking) return;
    if (Sched.isRoundComplete(track)) { endRound(); return; }
    var na = Sched.nextActor(track);
    if (na.done) { endRound(); return; }
    var occ = na.side === 'german' ? [] : Sched.occupantsOf(track, na.slot);
    if (occ.length > 1) { offerPick(occ); return; }
    beginTurn(na);
  }
  function offerPick(ids) {
    picking = { ids: ids };
    currentActorId = null;
    renderTrack();
    highlightActor(null);
    document.getElementById('action-sec').style.display = 'none';
    ids.forEach(function (id) { if (counterEls[id]) counterEls[id].classList.add('eligible'); });
    document.getElementById('pick-list').innerHTML = ids.map(function (id) {
      var s = findSoldier(id);
      return '<button class="btn pick" data-pick="' + id + '"><img src="' + currentImgFor(s) + '" alt="">' + s.name +
        '<small>' + s.hexId + ' &middot; ' + s.stance + (s.status !== 'unharmed' ? ' &middot; ' + s.status : '') + '</small></button>';
    }).join('');
    document.getElementById('pick-sec').style.display = '';
    document.getElementById('status-banner').textContent = 'Choose who goes next: ' + ids.length + ' soldiers share this space (§6/1).';
    FX.ensureVisible(ids.map(function (id) { return findSoldier(id).hexId; }), true);
  }
  function pickActor(id) {
    if (!picking || picking.ids.indexOf(id) === -1) return false;
    picking.ids.forEach(function (k) { if (counterEls[k]) counterEls[k].classList.remove('eligible'); });
    picking = null;
    document.getElementById('pick-sec').style.display = 'none';
    document.getElementById('status-banner').textContent = 'Contact! Action Round in progress.';
    beginTurn(Sched.nextActor(track, { chooseUS: function () { return id; } }));
    return true;
  }
  document.getElementById('pick-list').addEventListener('click', function (e) {
    var b = e.target.closest('[data-pick]');
    if (b) pickActor(b.dataset.pick);
  });
  canvas.addEventListener('click', function (e) {
    var c = picking && e.target.closest('.counter.eligible');
    if (!c) return;
    e.stopPropagation();
    pickActor(c.dataset.soldierId);
  }, true);
  function beginTurn(na) {
    currentActorId = na.soldierId;
    renderTrack();
    highlightActor(currentActorId);
    if (na.side === 'german') { document.getElementById('action-sec').style.display = 'none'; setTimeout(germanAutoTurn, 500); }
    else {
      // §6/7: "an unwounded soldier can, at any point during his turn, make one free stance
      // change" — a fresh opportunity every turn, not a once-per-Round resource. Reset here
      // (a genuinely new turn beginning), not inside showActionPanel, which also re-renders
      // mid-turn after a cancelled Move/Fire/etc. without that being a new turn.
      var s = findSoldier(currentActorId);
      s.usedFreeStanceChange = false;
      // Task #70 (docs/44_SNAP_FIRE_COMBO.md): a fresh combo opportunity every turn, same
      // reasoning as usedFreeStanceChange above.
      s.comboStepsUsed = 0;
      s.comboMoveCostUsed = 0;
      showActionPanel(currentActorId);
    }
  }
  function canFireAt(firer, target) {
    if (!target.isActive || !losClearBetween(firer, target)) return false;
    if (FC.hexDistance(firer.hexId, target.hexId) > weaponMaxRange(weaponById(firer.weaponId))) return false;
    // §8/2 / the chart's one impossible cell: a prone soldier inside a building, shot at from a
    // hex that is not one of his apertures, cannot be hit at all.
    return FC.canBeFiredAt(CHART.FIRE_MODS_TERRAIN, terrainRowForTarget(firer, target), target.stance);
  }
  function visibleEnemyTargets(firer) {
    return (firer.side === 'german' ? activeUS() : activeGermans()).filter(function (t) { return canFireAt(firer, t); });
  }
  // v3 (Phase 3, ring menu): a greyed verb says why, in the rules' words, from the same tests that
  // greyed it above. Presentation only: the reason is written to the button's data-why; nothing
  // here decides whether the verb is legal.
  function explainVerbs(s, targets, canFire, crew, crewOk) {
    function why(id, text) {
      var b = document.getElementById(id);
      if (b.disabled) b.dataset.why = text; else delete b.dataset.why;
    }
    why('moveBtn', 'No hex he can reach with the MP he has left (§6/7).');
    why('fireAimed', fireWhy('aimed'));
    why('fireSnap', fireWhy('snap'));
    function fireWhy(kind) {
      if (!canFire) return s.weaponBroken ? 'His weapon is broken (§9/4).' : s.weaponJammed ? 'His weapon is jammed: clear it first (§9/4).' :
        (WEAPONS_REQUIRING_PREPARATION[s.weaponId] && !s.weaponPrepared) ? 'His weapon must be prepared before it fires (§6/7).' :
        !s.weaponId ? 'He has no weapon.' : 'He is out of ammunition (§9/5).';
      if (!targets.length) return 'No German in line of sight and in range (§8).';
      if (!crewOk) return 'A crew weapon is fired crouching (§9/7).';
      if (crew && kind === 'aimed' && !crew.aimed) return 'Alone on a crew weapon he can only snap fire (§9/7).';
      if (crew && !crew.snap) return 'Two soldiers have already crewed this weapon this Round (§9/7).';
      return 'Not available now.';
    }
    why('assaultBtn', s.stance !== 'standing' ? 'The attacking soldier must be standing (§11/1).' : 'No German in his hex or in an adjacent hex he can charge into (§11/1, §11/3).');
    why('grenadeBtn', 'No grenade, or no hex in throwing range he can see (§10/1).');
    why('dragBtn', 'No inactive soldier in his hex to drag, or nowhere to drag him (§6/7).');
    why('giveTurnBtn', !s.isCommander ? 'Only a commander can give a Turn (§6/3).' : 'No soldier on the 1-Turn or Complete space can take one (§6/3).');
    why('makeAwareBtn', !s.isCommander ? 'Only a commander can make a soldier aware (§6/5).' : 'No unaware, unwounded soldier within his Command Radius (§6/5).');
    why('changeStanceBtn', 'His free change is used and he has no MP to pay for another (§6/7).');
    why('prepareWeaponBtn', !WEAPONS_REQUIRING_PREPARATION[s.weaponId] ? 'His weapon needs no preparation.' :
      s.weaponPrepared ? 'His weapon is already prepared.' : 'He must be standing or crouching to prepare it (§6/7).');
    why('pickupBtn', 'Nothing in his hex to pick up or exchange (§14).');
    why('clearJamBtn', !s.weaponJammed ? 'His weapon is not jammed.' : 'He must be standing or crouching to clear a jam (§9/4).');
  }
  function showActionPanel(id) {
    var s = findSoldier(id);
    clearDestMarks();
    document.getElementById('cancelMoveBtn').style.display = 'none';
    document.getElementById('act-img').src = currentImgFor(s);
    document.getElementById('act-name').textContent = s.name;
    document.getElementById('act-stats').innerHTML = 'IN:' + s.IN + ' WS:' + fmtSigned(s.WS) + ' \u00b7 ' + s.stance + ' at ' + s.hexId + (s.status !== 'unharmed' ? ' \u00b7 ' + s.status : '') + kitHtml(s, true);
    var targets = visibleEnemyTargets(s);
    var canFire = weaponUsable(s);
    document.getElementById('moveBtn').disabled = !Object.keys(roundLegalDestinations(s)).length;
    // §9/7 (Task A1): a crew weapon needs a crouching firer, is snap-only when he crews it alone,
    // and only offers aimed fire when a second crouching soldier in the hex can combine actions.
    var crew = isCrewWeapon(s.weaponId) ? crewFireAvailability(s) : null;
    var crewOk = !crew || crewWeaponStanceOk(s);
    document.getElementById('fireAimed').disabled = !targets.length || !canFire || !crewOk || (crew && !crew.aimed);
    document.getElementById('fireSnap').disabled = !targets.length || !canFire || !crewOk || (crew && !crew.snap);
    // §11/1 + §11/3 reachability, not a bare adjacency test — see assaultCandidates().
    document.getElementById('assaultBtn').disabled = !assaultCandidates(s).length;
    document.getElementById('grenadeBtn').disabled = !grenadeCandidates(s).length;
    document.getElementById('dragBtn').disabled = !dragCandidates(s).length || !dragHexCandidates(s).length;
    document.getElementById('giveTurnBtn').disabled = !giveTurnCandidates(s).length;
    document.getElementById('makeAwareBtn').disabled = !makeAwareCandidates(s).length;
    document.getElementById('changeStanceBtn').disabled = !stanceChangeCandidates(s).length;
    document.getElementById('prepareWeaponBtn').disabled = !canPrepareWeapon(s);
    document.getElementById('pickupBtn').disabled = !pickupOffers(s).length;
    document.getElementById('clearJamBtn').disabled = !canClearJam(s);
    document.getElementById('passTurn').disabled = false;
    explainVerbs(s, targets, canFire, crew, crewOk);
    document.getElementById('action-sec').style.display = '';
    Info.refresh(); // task 5: shade this soldier's reachable hexes now that it is his decision
    if (!targets.length) logLine(nameFor(id) + ' has no line of sight to any German this turn.');
    else if (!canFire) logLine(nameFor(id) + '\'s weapon is ' + (s.weaponBroken ? 'broken' : s.weaponJammed ? 'jammed' : 'out of ammo') + ' and cannot fire.');
    else if (crew && !crewWeaponStanceOk(s)) logLine(nameFor(id) + ' must be crouching to fire the ' + equipmentName(s.weaponId) + ' (&sect;9/7).');
    else if (crew && guardsAPrisoner(s)) logLine(nameFor(id) + ' is guarding a prisoner and so cannot fire a crew weapon (&sect;11/2).');
    else if (crew && !crew.snap) logLine(nameFor(id) + ' cannot fire the ' + equipmentName(s.weaponId) + ' again this Round &mdash; two soldiers have already crewed it (&sect;9/7).');
    else if (crew && !crew.aimed) logLine(nameFor(id) + ' crews the ' + equipmentName(s.weaponId) + ' alone, so it can only snap fire (&sect;9/7).');
  }
  document.getElementById('moveBtn').addEventListener('click', function () {
    var s = findSoldier(currentActorId);
    var dests = roundLegalDestinations(s);
    if (!Object.keys(dests).length) return;
    disableActionButtons();
    pendingCancelAction = null; // this is a fresh, non-combo Move — default cancel behavior
    document.getElementById('cancelMoveBtn').style.display = '';
    clearDestMarks();
    Object.keys(dests).forEach(function (hexId) {
      addDestMark(hexId, destCostClass(dests[hexId].cost), hexId + ' (' + dests[hexId].cost + ' MP)',
        function () { doRoundMove(s, dests[hexId].path, dests[hexId].cost, function () { completeTurn(s.id); }); });
    });
    document.getElementById('status-banner').textContent = s.name + ' — choose a destination (up to ' + s.mpa + ' MP' +
      (s.stance === 'prone' ? ', ' + (standUpCost(s) === 0 ? 'standing up free first' : standUpCost(s) + ' of them to stand up first') : '') + '), or Cancel.';
  });
  document.getElementById('cancelMoveBtn').addEventListener('click', function () {
    if (pendingCancelAction) { var fn = pendingCancelAction; pendingCancelAction = null; fn(); return; }
    document.getElementById('status-banner').textContent = 'Contact! Action Round in progress.';
    showActionPanel(currentActorId);
  });
  document.getElementById('fireAimed').addEventListener('click', function () { doPlayerFire('aimed'); });
  document.getElementById('fireSnap').addEventListener('click', function () { doPlayerFire('snap'); });
  document.getElementById('assaultBtn').addEventListener('click', function () { doPlayerAssault(); });
  document.getElementById('grenadeBtn').addEventListener('click', function () { doPlayerGrenade(); });
  document.getElementById('dragBtn').addEventListener('click', function () { doPlayerDrag(); });
  document.getElementById('giveTurnBtn').addEventListener('click', function () { doPlayerGiveTurn(); });
  document.getElementById('makeAwareBtn').addEventListener('click', function () { doPlayerMakeAware(); });
  document.getElementById('changeStanceBtn').addEventListener('click', function () { doPlayerChangeStance(); });
  document.getElementById('prepareWeaponBtn').addEventListener('click', function () { doPlayerPrepareWeapon(); });
  document.getElementById('pickupBtn').addEventListener('click', function () { doPlayerPickup(); });
  document.getElementById('passTurn').addEventListener('click', function () {
    var actor = findSoldier(currentActorId);
    infoPopup({ actor: actor, title: 'Pass', bodyHtml: actor.name + ' passes.' }, function () { Sched.completeAction(track, currentActorId); renderTrack(); driveNext(); });
  });
  // §6/7 Move: walk the chosen path one hex at a time, same real Paragraph Check every hex-entry
  // gets in Operations (§5/1's "made during Rounds in this same manner"), except Event Checks are
  // skipped (Event Markers are still placed) — the skipEventCheck flag on runParagraphCheck.
  // `totalCost`/`onEndTurn` (Task #70, docs/44_SNAP_FIRE_COMBO.md): every caller now routes
  // completion through finishMoveStep rather than completing the turn directly, so a
  // combo-eligible move (≤ half MPA, first sub-action this turn) can offer a snap-fire follow-up
  // instead of always ending the turn immediately.
  function doRoundMove(mover, path, totalCost, onEndTurn) {
    clearDestMarks();
    pendingCancelAction = null;
    document.getElementById('cancelMoveBtn').style.display = 'none';
    var steps = path.slice(1); // path[0] is the start hex
    var i = 0;
    // §6/7/§7/3: a prone soldier's Movement Action opens by standing up — free if his free stance
    // change is still available, otherwise 1 MP, which legalDestinationsWithBudget has already
    // charged against this move's cost. Announced as its own pop-up because it is the step that
    // makes the rest of the move legal, and because on a wounded soldier it is what the MP went on.
    function standUpThen(next) {
      if (mover.stance !== 'prone') { next(); return; }
      var free = standUpCost(mover) === 0;
      mover.stance = 'standing';
      if (free) mover.usedFreeStanceChange = true;
      updateCounterVisual(mover);
      var how = free ? 'using his free stance change' : 'spending 1 MP';
      infoPopup({
        actor: mover, title: 'Stand Up',
        bodyHtml: mover.name + ' stands up, ' + how + '.' +
          (free ? '' : ' Wounded soldiers never receive a free stance change (&sect;6/7).'),
        logHtml: mover.name + ' stands up (' + how + ', &sect;6/7).',
      }, next);
    }
    function stepNext() {
      if (phase !== 'round' || currentActorId !== mover.id) return;
      // Same gap as doMove's (see its comment): a Rounds move can be the step that completes
      // Ending 1's four-hex requirement, so the condition has to be re-tested once the move is
      // done. Placed after the path is exhausted rather than per hex — the ending is about where
      // the soldier ends up, and endMission() mid-path would leave stepNext half-run.
      if (i >= steps.length) {
        checkEndingConditions();
        if (phase !== 'round') return;
        finishMoveStep(mover, totalCost, onEndTurn);
        return;
      }
      var hexId = steps[i]; i++;
      var fromHexId = mover.hexId;
      mover.hexId = hexId;
      placeEl(counterEls[mover.id], hexId);
      // Task #69 (docs/43_PREPARE_WEAPON.md). No-op for anyone but a crew-weapon carrier.
      var unprepared = unprepareWeaponOnMove(mover);
      infoPopup({
        actor: mover, title: 'Move',
        bodyHtml: mover.name + ' moves ' + fromHexId + ' &rarr; ' + hexId + ' (' + TERRAIN_LABELS[REAL_TERRAIN[hexId]] + ').' +
          (unprepared ? ' The ' + equipmentName(mover.weaponId) + ' is no longer prepared.' : ''),
        fx: function () { FX.trail(fromHexId, hexId); FX.ensureVisible([hexId]); },
      }, function () { runParagraphCheck(mover, stepNext, { skipEventCheck: true }); });
    }
    standUpThen(stepNext);
  }

  // §9/1 step 1 ("Select Target, check LOS, determine if Aimed or Snap fire") and §11/1 ("Can
  // only attack 1 soldier. US chooses any") both make target selection the PLAYER's decision.
  // Previously the engine silently took `targets[0]` — whatever order the germans{} object
  // happened to enumerate in — so choosing "Fire" also chose who you shot at. This prompts
  // instead, showing the real numbers the choice turns on: range, the target's terrain/stance
  // cover, and the hit chance computed by the same functions that will resolve the shot, so the
  // odds shown can never disagree with the odds rolled against.
  //
  // A single legal target is not a decision — it goes straight through with no extra click.
  function chooseTarget(actor, targets, opts, cb) {
    // Auto-picking a lone candidate is fine for pure logistics (drag/give-turn/pick-up), but for
    // anything showing hit chance the player explicitly wants to SEE that number before
    // committing — a real user report ("I need more information to make decisions") — even when
    // there's only one soldier to shoot at, which is the common case this was silently skipping.
    if (targets.length === 1 && !opts.hitChanceFor) { cb(targets[0]); return; }
    var spec = {
      title: opts.title, variant: 'wide', allowEnter: false, allowEscape: true, escapeButtonId: 'cancel',
      buttons: [{ id: 'cancel', label: 'Cancel' }],
      render: function (ctx) {
        // spec.choices is the same list as the rows, as data: what __mission1Debug.pendingDecision
        // reports and choose(i) picks, so automation never reads the row markup.
        spec.choices = [];
        var html = targets.map(function (t, i) {
          var dist = FC.hexDistance(actor.hexId, t.hexId);
          var note = opts.noteFor ? opts.noteFor(t) : '';
          var odds = opts.hitChanceFor ? opts.hitChanceFor(t) : null;
          var distText = dist === 0 ? 'same hex' : dist + ' hex' + (dist === 1 ? '' : 'es');
          var oddsNum = odds === null ? null : parseInt(stripTags(String(odds)), 10);
          // 2026-09-23 (Wan: "this dialog box is formatted badly"): the breakdown used to be a
          // focusable tooltip on the odds box. The dialog focuses its first focusable element, so
          // it opened already showing, and inside the scrolling list it grew both scrollbars. It
          // is decision information, so it is now a plain line under the target's details, and
          // the odds read as a percentage (every picker caller resolves with resolveHitRoll:
          // Hit Chance c hits on 0..c, so (c + 1) in 10), with the raw chance beneath.
          var why = opts.hitChanceTipFor ? opts.hitChanceTipFor(t) : '';
          var oddsHtml = isNaN(oddsNum) || oddsNum === null ? String(odds)
            : Math.max(0, Math.min(100, (oddsNum + 1) * 10)) + '%';
          spec.choices.push({
            text: stripTags(t.name + ' ' + t.hexId + ' &middot; ' + (TERRAIN_LABELS[REAL_TERRAIN[t.hexId]] || 'unknown') +
              ' &middot; ' + t.stance + ' &middot; ' + distText + (note ? ' ' + note : '')),
            odds: isNaN(oddsNum) ? null : oddsNum,
            pick: function () { Dialogs.reset(); cb(t); }, // close without firing onClose — a real pick is not a cancel
          });
          return '<div class="target-row" data-idx="' + i + '">' +
            '<img src="' + currentImgFor(t) + '">' +
            '<span class="target-id"><b>' + t.name + '</b><span class="target-meta">' + t.hexId +
              ' &middot; ' + (TERRAIN_LABELS[REAL_TERRAIN[t.hexId]] || 'unknown') + ' &middot; ' + t.stance +
              ' &middot; ' + distText + '</span>' +
              (note ? '<span class="target-note">' + note + '</span>' : '') +
              (why ? '<span class="target-why">' + why.replace('->', '&rarr;') + '</span>' : '') + '</span>' +
            (opts.hitChanceFor ? '<span class="target-odds">' + oddsHtml + '<span>' + (opts.oddsLabel || 'to hit') +
              (isNaN(oddsNum) || oddsNum === null ? '' : ' &middot; chance ' + oddsNum) + '</span></span>' : '') + '</div>';
        }).join('');
        ctx.bodyEl.innerHTML = '<div class="step-context">' + opts.prompt + '</div><div class="target-list">' + html + '</div>';
        Array.prototype.forEach.call(ctx.bodyEl.querySelectorAll('.target-row'), function (row) {
          row.addEventListener('click', function () { spec.choices[parseInt(row.dataset.idx, 10)].pick(); });
        });
      },
      onButton: function (id, ctx) { ctx.close(); },
      onClose: function () { if (opts.onCancel) opts.onCancel(); }, // Cancel/Escape only
    };
    Dialogs.push(spec);
  }
  // Shared by the target picker and assaultChain's own resolution so the two can never drift.
  function assaultOpts(attacker, defender, isCharge) {
    return {
      attackerWS: attacker.WS, defenderWS: defender.WS,
      defenderPanicked: defender.status === 'panicked', defenderWounded: defender.status === 'wounded',
      // §11/4: "A US soldier who is unaware when assaulted cannot use his WS to modify the
      // German assault." Germans have no awareness state (aware the instant they're activated),
      // so this only ever applies to a US defender.
      defenderUnaware: defender.side !== 'german' && !defender.aware,
      isChargeAssault: !!isCharge,
      attackerWounded: attacker.status === 'wounded', attackerUsingCapturedWeapon: false,
    };
  }

  // §11/1: "the attacking soldier must be standing and must occupy the SAME hex as the soldier he
  // is assaulting. If the attacker is not in the same hex ... he must perform a Move/Charge
  // Assault Action (11/3) in order to enter the defender's hex and assault him."
  // §11/3: that move may spend "only half his Movement Point Allowance, rounded down" — so an
  // adjacent German in expensive terrain can be genuinely unreachable this turn — and the assault
  // then takes "an additional -3 modifier to the Base Hit Chance."
  //
  // Previously the Assault button just took `hexDistance <= 1` and always resolved as a plain
  // same-hex assault: the move into the hex never happened, the half-MPA limit was never checked,
  // and isChargeAssault was hardcoded false so the -3 never applied.
  function assaultCandidates(s) {
    if (!s || s.stance !== 'standing') return []; // §11/1: "the attacking soldier must be standing"
    var budget = Asl.chargeAssaultMaxMP(s.mpa);
    var out = [];
    activeGermans().forEach(function (g) {
      var dist = FC.hexDistance(s.hexId, g.hexId);
      if (dist === 0) { out.push({ german: g, isCharge: false, cost: 0, budget: budget }); return; }
      if (dist !== 1) return;
      var terrain = REAL_TERRAIN[g.hexId];
      if (terrain && M.isProhibited(terrain)) return;
      var cost = M.mpCost(terrain);
      if (cost > budget) return; // can't reach him on half MPA — not a legal target this turn
      out.push({ german: g, isCharge: true, cost: cost, budget: budget });
    });
    return out;
  }

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
      .concat(Object.keys(germans).map(function (id) { return germans[id]; }).filter(function (g) { return g.hexId === hexId; }));
  }
  // §5/3: "A soldier that is standing or crouching can pick up or put down any portable items in
  // his hex... A soldier that is taking equipment from an inactive soldier must be crouching."
  // Ground items and an ACTIVE soldier's gear need only standing/crouching; an INACTIVE soldier's
  // gear (own casualty, or a dead/incapacitated/captured German — §14: "you can pick up and use
  // most German equipment") needs the taker specifically crouching.
  function pickupOffers(actor) {
    if (!actor || (actor.stance !== 'standing' && actor.stance !== 'crouching')) return [];
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

  // §6/8 step 1: "Cross-reference the current Action Number with the current Condition to obtain
  // a German Action Paragraph number." The lookup was always real; what's new is that the
  // resulting paragraph is now actually READ AND CARRIED OUT (§6/8 step 3) instead of being
  // displayed and discarded while the German unconditionally aim-fired at the best target.
  // opts.ignoreSelfPreservation (Task #73, docs/47_SPECIAL_REACTIONS.md): §6/8 paragraph 816's
  // own instruction — "Ignore the self-preservation Reaction. Roll for a new German Action
  // Number..." — a one-time override for just this re-roll, distinct from (and layered on top
  // of) every other self-preservation trigger below.
  function germanAutoTurn(opts) {
    var g = findSoldier(currentActorId);
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
        activeUS().some(function (s) { return FC.hexDistance(g.hexId, s.hexId) <= 1; }))
    );
    // A card only carries columns for the Conditions its scenario expects (GE 33/V, for instance,
    // has CONDITION 4 and SPECIAL S and nothing else). If the mission is in a Condition his card
    // doesn't cover, that's a scenario/data mismatch rather than a rules question — fall back to
    // the nearest Condition column the card DOES have and say so, instead of leaving the German
    // inert with no explanation.
    function lookup(roll) {
      var cond = opsState ? opsState.condition : 1;
      var opts = { selfPreservationActive: selfPreservationActive, specialReaction: g.specialReaction };
      try { return AR.resolveGermanActionParagraph(g.card, roll, cond, opts); } catch (e) { /* fall through */ }
      var available = ((g.card.table && g.card.table.columns) || [])
        .map(function (c) { return /^CONDITION\s+(\d+)/i.exec(c); })
        .filter(Boolean).map(function (m) { return parseInt(m[1], 10); });
      if (!available.length) return null;
      var nearest = available.reduce(function (best, c) { return Math.abs(c - cond) < Math.abs(best - cond) ? c : best; }, available[0]);
      try {
        var res = AR.resolveGermanActionParagraph(g.card, roll, nearest, opts);
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
          var near = activeUS().filter(function (s) { return FC.hexDistance(g.hexId, s.hexId) <= 1; });
          why = near.length
            ? nameFor(near[0].id) + ' is ' + (near[0].hexId === g.hexId ? 'in his hex' : 'adjacent') +
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
    rollPopup({
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
        if (r.rule === 'self_preservation') Cues.kranz('alarmed', '<b>Zu nah!</b> ' + g.name + ' reads paragraph ' + res.paragraph + '. ' + why, g.id);
        else Cues.kranz('confident', '<b>Jawohl.</b> ' + g.name + ' reads paragraph ' + res.paragraph + '. ' + why, g.id);
      },
      logText: function (roll) {
        var res = lookup(roll);
        return 'German Action Number for ' + g.name + ': <span class="roll">' + roll + '</span> &rarr; ' +
          (res ? res.paragraph + columnReasonText(res) + (res.fallbackTo ? ' (via Condition ' + res.fallbackTo + ' column)' : '') : 'no card entry');
      },
    }, function (roll) {
      var res = lookup(roll);
      if (!res) {
        infoPopup({ actor: g, title: 'No Orders', bodyHtml: g.name + '’s card has no Action column covering the current Condition, so he has no instructions this turn and holds position.' }, function () { finishGermanTurn(g); });
        return;
      }
      runGermanParagraph(g, res.paragraph);
    });
  }

  // Snapshot of everything germanactions.js's conditions can ask about, read fresh at the moment
  // the German acts (his instructions are evaluated against the situation in front of him).
  function germanSituation(g) {
    var visible = visibleEnemyTargets(g);
    var terrainKey = REAL_TERRAIN[g.hexId];
    var openish = { clear1: 1, clear2: 1, clear3: 1, road: 1, dirt_road: 1, bridge: 1, ford: 1, stream: 1, railroad: 1 };
    var terrain = terrainKey === 'building' || terrainKey === 'second_story' || terrainKey === 'interior' ? 'building'
      : terrainKey === 'woods' ? 'woods'
      : openish[terrainKey] ? 'open' : 'other';
    return {
      targetsInSight: visible.length,
      targetsInHex: activeUS().filter(function (s) { return s.hexId === g.hexId; }).length,
      targetsWithin: function (n) { return activeUS().filter(function (s) { return FC.hexDistance(g.hexId, s.hexId) <= n && losClearBetween(g, s); }).length; },
      inUsSight: activeUS().some(function (s) { return losClearBetween(s, g); }),
      terrain: terrain,
      inActivationHex: g.hexId === g.activationHexId,
      germansSameOrAdjacent: activeGermans().filter(function (o) { return o.id !== g.id && FC.hexDistance(g.hexId, o.hexId) <= 1; }).length,
      germansWithinTwo: activeGermans().filter(function (o) { return o.id !== g.id && FC.hexDistance(g.hexId, o.hexId) <= 2; }).length,
      germansLost: vpState.germanDefeats.length,
      usOccupiesHex: function (hex) { return activeUS().some(function (s) { return s.hexId === hex; }); },
      // Task #63 (docs/35_GRENADE_COMBAT.md): real, from the German's own lightweight grenade
      // inventory (see guessGermanGrenadeCount) — no longer hardcoded false.
      hasGrenade: !!(g.inventory && EQ.hasGrenade(g.inventory)),
      // §7/3 "traversable hexside" (paragraph 833 option 2). A wall cannot be crossed at any
      // cost; an aperture can, at +1 MP, so a window or doorway is traversable. Un-modelled until
      // Map A's buildings gave the map any hexsides at all (docs/53) — before that this was the
      // whole reason 833 carried a `bespoke` stub.
      adjacentTraversableTargets: adjacentTraversableUS(g).length,
      germanInAdjacentTargetHex: adjacentTraversableUS(g).some(function (s) {
        return activeGermans().some(function (o) { return o.id !== g.id && o.hexId === s.hexId; });
      }),
      freeStanceChange: !g.wounded, // §6/7: "Wounded soldiers never receive a free stance change."
    };
  }
  // Active US soldiers in a hex adjacent to `g` that he could actually reach — i.e. not walled off.
  function adjacentTraversableUS(g) {
    return activeUS().filter(function (s) {
      if (FC.hexDistance(g.hexId, s.hexId) !== 1) return false;
      return M.hexsideCost(edgeFeatureBetween(g.hexId, s.hexId)) !== Infinity;
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
    if (!(g.inventory && EQ.hasGrenade(g.inventory))) return;
    var d = (resolved.decisions || []).filter(function (x) { return x.option !== null && x.because; }).pop();
    Cues.kranz('smug', '<b>Granate!</b> ' + g.name + ' throws. ' + (d
      ? 'Paragraph ' + d.paragraph + ', option ' + d.option + ' of ' + d.of + ': ' + d.because + '.'
      : 'Paragraph ' + paragraphNum + ' tells him to.'), g.id);
  }
  function runGermanParagraph(g, paragraphNum) {
    var resolved = GAct.resolve(paragraphNum, GERMAN_ACTION_PROGRAMS, germanSituation(g));
    var text = PARAGRAPHS[String(paragraphNum)];
    var picked = decisionsText(resolved);
    Info.noteReason(g, 'paragraph ' + paragraphNum + (picked ? ' &mdash; ' + picked : ''));
    var fullHtml = (text || '(no text on file)').replace(/¥/g, '&bull;').replace(/_x000B_/g, '<br>') + decisionsHtml(resolved);
    infoPopup({
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
    if (phase === 'over') return;
    if (i >= actions.length || !g.isActive) { finishGermanTurn(g); return; }
    var a = actions[i];
    var next = function () { performGermanActions(g, actions, i + 1); };

    if (a.action === 'stance') {
      if (g.stance === a.to) { next(); return; }
      g.stance = a.to;
      updateCounterVisual(g);
      infoPopup({ actor: g, title: 'Stance', bodyHtml: g.name + ' goes <b>' + a.to + '</b>.',
        fx: function () { FX.badge(g.hexId, a.to.toUpperCase(), 'neutral'); } }, next);
      return;
    }
    if (a.action === 'fire') {
      // §9/4: "A German with a jammed weapon will use his second weapon, if he has one; otherwise,
      // he will attempt to unjam his weapon. When a German Action Paragraph requires him to fire,
      // he attempts to unjam his weapon instead." Both halves are real now; this used to be a
      // loud stub that fired about twice a game (docs/52's pacing count is what flagged it).
      if (!weaponUsable(g)) {
        var second = !g.usedSecondWeapon && GAct.secondWeaponIdForCard(g.card);
        if (second) {
          // The switch is permanent for the rest of the mission: the jammed primary is not
          // magically un-jammed by drawing a pistol, and `usedSecondWeapon` stops him switching
          // again when the pistol itself jams.
          g.usedSecondWeapon = true;
          var wasJammed = g.weaponJammed, brokenWeapon = weaponById(g.weaponId);
          g.weaponId = second;
          g.weaponJammed = false; g.weaponBroken = false; g.weaponPrepared = true;
          infoPopup({
            actor: g, title: 'Second Weapon',
            bodyHtml: g.name + '\u2019s ' + brokenWeapon.name + ' is ' + (wasJammed ? 'jammed' : 'broken') +
              ', so he draws his ' + equipmentName(second) + ' &mdash; \u00a79/4: "a German with a jammed weapon will use his second weapon, if he has one".',
            logHtml: g.name + ' switches to his ' + equipmentName(second) + ' (&sect;9/4 second weapon).',
            // Re-enter the SAME action index rather than building a one-off chain: the fire
            // branch simply runs again, now with a usable weapon, and the rest of the paragraph's
            // actions still follow.
          }, function () { performGermanActions(g, actions, i); });
          return;
        }
        if (g.weaponJammed && !g.weaponBroken) {
          // "...he attempts to unjam his weapon instead" — the same procedure the player uses,
          // so it goes through the same resolver rather than a German-only copy of it.
          infoPopup({
            actor: g, title: 'Unjam Instead of Fire',
            bodyHtml: g.name + ' is ordered to fire, but his ' + weaponById(g.weaponId).name +
              ' is jammed and he has no second weapon. &sect;9/4: he attempts to unjam it instead.',
            logHtml: g.name + ': ordered to fire with a jammed weapon and no second weapon &mdash; attempts to unjam (&sect;9/4).',
          }, function () { clearJamRoll(g, next); });
          return;
        }
        // Genuinely weaponless: broken, or an unarmed card. §9/4's "acquire a weapon from another
        // German or inactive US soldier in his hex" is the remaining unmodelled branch, and it
        // needs the German-side Pick Up/Exchange action that does not exist. Still a loud stub,
        // but now only for the case that actually has no rule implemented.
        infoPopup({
          actor: g, title: 'No Usable Weapon',
          bodyHtml: g.name + ' would fire, but his weapon is broken and he has no second weapon. &sect;9/4 would have him acquire one from another German or an inactive US soldier in his hex &mdash; the German-side Pick Up/Exchange action is not modelled. Skipped.',
          logHtml: g.name + ': skipped fire &mdash; weapon broken, no second weapon (&sect;9/4 pick-up not modelled).',
        }, next);
        return;
      }
      var targets = visibleEnemyTargets(g);
      if (!targets.length) {
        infoPopup({ actor: g, title: 'No Target', bodyHtml: g.name + ' has no line of sight to any US soldier from ' + g.hexId + ' &mdash; cannot fire.' }, next);
        return;
      }
      // §9/7 (Task A1). A German crewing a machinegun is bound by the same rules a US soldier is:
      // he must be crouching, and alone he can only snap fire. The paragraph may have asked for
      // aimed fire, so this can downgrade it — deliberately, and it says so rather than silently
      // firing the mode the paragraph named.
      if (isCrewWeapon(g.weaponId) && !crewWeaponStanceOk(g)) {
        infoPopup({
          actor: g, title: 'Cannot Fire',
          bodyHtml: g.name + ' is ' + g.stance + ', and a crew weapon can only be fired crouching (&sect;9/7). He holds his fire.',
          logHtml: g.name + ': no fire &mdash; must be crouching to fire the ' + equipmentName(g.weaponId) + ' (&sect;9/7).',
        }, next);
        return;
      }
      germanPickTarget(g, targets, a.target, function (target) {
        var fireType = a.mode === 'snap' ? 'snap' : a.mode === 'aimed' ? 'aimed' : FC.resolveBestFireType(true);
        if (isCrewWeapon(g.weaponId)) {
          var avail = crewFireAvailability(g);
          if (fireType === 'aimed' && !avail.aimed) fireType = 'snap'; // solo crew = snap only
          var fired = crewFiredThisRound(g);
          if (fired.indexOf(g.id) === -1) fired.push(g.id);
          // §9/7: "when two Germans are firing a crew weapon, the German with the higher WS is
          // the firer." With a mate available, the pair's fire resolves with whichever of them
          // has the better Weapon Skill — which can mean the German whose turn it is hands the
          // trigger to his crewmate.
          if (fireType === 'aimed' && avail.mates.length) {
            var mate = avail.mates[0];
            var firerId = CW.resolveGermanCrewFirer(g, mate);
            fired.push(mate.id);
            Sched.completeAction(track, mate.id);
            renderTrack();
            var actualFirer = firerId === mate.id ? mate : g;
            infoPopup({
              actor: actualFirer, title: 'Crew Weapon',
              bodyHtml: g.name + ' and ' + mate.name + ' crew the ' + equipmentName(g.weaponId) + ' together, which is what allows aimed fire (&sect;9/7). ' +
                actualFirer.name + ' is the firer &mdash; the higher Weapon Skill of the two (' + fmtSigned(actualFirer.WS) + ').',
              logHtml: g.name + ' + ' + mate.name + ' crew the ' + equipmentName(g.weaponId) + '; ' + actualFirer.name + ' fires (higher WS, &sect;9/7).',
            }, function () { fireChain(actualFirer, target, fireType, next); });
            return;
          }
        }
        fireChain(g, target, fireType, next);
      });
      return;
    }
    if (a.action === 'grenade') {
      // Task #63 (docs/35_GRENADE_COMBAT.md): real now — germanSituation()'s hasGrenade
      // condition already gates most paragraph branches into this action, but a paragraph can
      // still call it unconditionally, so the same "does he actually have one" check applies here.
      if (!(g.inventory && EQ.hasGrenade(g.inventory))) {
        infoPopup({ actor: g, title: 'No Grenade', bodyHtml: g.name + ' would throw a grenade, but has none left.' }, next);
        return;
      }
      var gTargets = grenadeCandidates(g);
      if (!gTargets.length) {
        infoPopup({ actor: g, title: 'No Target', bodyHtml: g.name + ' has no US soldier within grenade range from ' + g.hexId + '.' }, next);
        return;
      }
      germanPickTarget(g, gTargets, a.target, function (target) { grenadeChain(g, target.hexId, next); });
      return;
    }
    if (a.action === 'assault') {
      var inHex = activeUS().filter(function (s) { return s.hexId === g.hexId; });
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
        placeEl(counterEls[g.id], g.hexId);
        updateCounterVisual(g);
        unprepareWeaponOnMove(g);
        infoPopup({
          actor: g, title: 'Charge Assault',
          bodyHtml: g.name + ' charges from ' + fromHex + ' into ' + victim.hexId + ' and assaults ' +
            victim.name + ' (&sect;11/3 &mdash; movement first, then the assault, at &minus;3 to hit).',
          logHtml: g.name + ' charge assaults ' + victim.name + ' (' + fromHex + ' &rarr; ' + victim.hexId + ', &sect;11/3).',
        }, function () { assaultChain(g, victim, { capture: false, charge: true }, next); });
        return;
      }
      if (!inHex.length) { next(); return; }
      // §11/1: "A German soldier must assault the US soldier in the most disadvantageous stance."
      var pick = Asl.resolveGermanAssaultTarget
        ? Asl.resolveGermanAssaultTarget(inHex.map(function (s) { return { id: s.id, stance: s.stance, wounded: s.status === 'wounded' }; }), d10)
        : { id: inHex[0].id };
      var defender = inHex.filter(function (s) { return s.id === pick.id; })[0] || inHex[0];
      if (g.stance !== 'standing') { g.stance = 'standing'; updateCounterVisual(g); }
      assaultChain(g, defender, { capture: false, charge: false }, next);
      return;
    }
    if (a.action === 'surrender') {
      infoPopup({ actor: g, title: 'Surrender', bodyHtml: '<b>' + g.name + ' surrenders</b> and is taken prisoner (&sect;11/2).' }, function () {
        applyCapture(g); next();
      });
      return;
    }
    if (a.action === 'remove_from_map') {
      infoPopup({ actor: g, title: 'Withdraws', bodyHtml: g.name + ' is ' + (a.reason || 'out of contact') + ' and leaves the map (&sect;6/8).' },
        function () { germanLeavesMap(g, next); });
      return;
    }
    if (a.action === 'move' && a.toHex) {
      var fromHexId = g.hexId;
      g.hexId = a.toHex;
      if (counterEls[g.id]) placeEl(counterEls[g.id], a.toHex);
      scrollMapTo(a.toHex);
      unprepareWeaponOnMove(g); // Task #69 (docs/43_PREPARE_WEAPON.md)
      infoPopup({ actor: g, title: 'Move', bodyHtml: g.name + ' ' + (a.style === 'crawl' ? 'crawls' : 'moves') + ' ' + fromHexId + ' &rarr; <b>' + a.toHex + '</b>.' }, next);
      return;
    }
    if (a.action === 'move_by_reference') {
      unprepareWeaponOnMove(g); // Task #69 (docs/43_PREPARE_WEAPON.md) — applies once movement begins
      resolveGermanMoveByReference(g, g.mpa || 0, next);
      return;
    }
    if (a.action === 'set_condition') {
      infoPopup({ actor: g, title: 'Condition Change', bodyHtml: 'Paragraph ' + a.paragraph + ' puts <b>Condition ' + a.to + '</b> into effect.' }, function () {
        pendingConditionChange = a.to; next();
      });
      return;
    }
    if (a.action === 'reroll_action_number') {
      infoPopup({ actor: g, title: 'New Action Number', bodyHtml: 'Paragraph ' + a.paragraph + ': ignore the Self-Preservation reaction and roll a new Action Number (&sect;6/8).' }, function () {
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
      infoPopup({
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
      infoPopup({ actor: g, title: 'Not Modelled', bodyHtml: g.name + ' would ' + why + '. Skipped.', logHtml: g.name + ': skipped &mdash; ' + why + '.' }, next);
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
      return { id: s.id, distance: FC.hexDistance(g.hexId, s.hexId), hitChance: estimateHitChance(g, s, 'aimed') };
    });
    if (rule === 'easiest') {
      candidates.sort(function (a, b) { return b.hitChance - a.hitChance || a.distance - b.distance; });
    }
    var tieRoll = null;
    var picked = rule === 'easiest' ? candidates[0]
      : FC.resolveClosestTarget(candidates, function () { tieRoll = d10(); return tieRoll; });
    var target = targets.filter(function (s) { return s.id === picked.id; })[0];
    if (tieRoll === null) { cb(target); return; }
    rollPopup({
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
    if (phase === 'over') return;
    if (g.isActive) Sched.completeAction(track, g.id);
    renderTrack();
    driveNext();
  }

  // Shared by both ways a German can leave the map: an explicit remove_from_map action
  // (self-preservation/evasive withdrawal) and hitting an "Exit" Movement Reference (&sect;6/8).
  function germanLeavesMap(g, next) {
    g.isActive = false;
    Sched.removeFromRound(track, g.id);
    if (counterEls[g.id]) { counterEls[g.id].remove(); delete counterEls[g.id]; }
    renderTrack(); renderRoster(); renderVP();
    checkEndingConditions();
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
    var cartridgeId = G.printedIdToCartridgeId(hexId);
    var grid = cartridgeId && MISSION_CARDS_MOVEMENT['1'] && MISSION_CARDS_MOVEMENT['1'][String(opsState.condition)];
    return (grid && grid[cartridgeId]) || 'NONE';
  }
  function resolveGermanMoveByReference(g, mpRemaining, onDone) {
    if (phase === 'over') { onDone(); return; }
    if (mpRemaining <= 0) {
      infoPopup({ actor: g, title: 'Move', bodyHtml: g.name + ' is out of Movement Points and stops at ' + g.hexId + '.' }, onDone);
      return;
    }
    var kind = GAct.classifyMovementReference(germanMovementRefFor(g.hexId));

    if (kind.type === 'none') {
      infoPopup({
        actor: g, title: 'Move',
        bodyHtml: g.name + ' has no Movement Reference recorded at ' + g.hexId + ' for the current Condition &mdash; he stops here.',
      }, onDone);
      return;
    }
    if (kind.type === 'exit') {
      infoPopup({ actor: g, title: 'Exit', bodyHtml: g.name + ' exits the map from ' + g.hexId + ' (&sect;6/8).' },
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
      var text = PARAGRAPHS[kind.paragraph];
      infoPopup({
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
    var terrain = REAL_TERRAIN[destHexId];
    var open = TERRAIN_ROW[terrain] === 0;
    var cost = open ? M.mpCost(terrain) : mpRemaining;
    if (open && cost > mpRemaining) {
      infoPopup({ actor: g, title: 'Move', bodyHtml: g.name + ' lacks the Movement Points to enter ' + destHexId + ' and stops at ' + g.hexId + '.' }, onDone);
      return;
    }
    var fromHexId = g.hexId;
    g.stance = open ? 'standing' : 'crouching';
    g.hexId = destHexId;
    if (counterEls[g.id]) placeEl(counterEls[g.id], destHexId);
    updateCounterVisual(g);
    scrollMapTo(destHexId);
    FX.trail(fromHexId, destHexId);
    var remaining = mpRemaining - cost;
    infoPopup({
      actor: g, title: 'Move',
      bodyHtml: g.name + ' ' + (open ? 'runs' : 'crawls') + ' ' + fromHexId + ' &rarr; <b>' + destHexId + '</b> (' + TERRAIN_LABELS[terrain] + ').',
    }, function () {
      runParagraphCheck(g, function () {
        if (phase === 'over') { onDone(); return; }
        if (!open || remaining <= 0) { onDone(); return; } // crawled -> "his movement is over" (§7/4)
        resolveGermanMoveByReference(g, remaining, onDone);
      }, { skipEventCheck: true });
    });
  }

  // ---------------------------------------------------------------------
  // §9/1 Fire Combat Procedure
  // ---------------------------------------------------------------------
  function fireChain(firer, target, fireType, onDone) {
    var weapon = weaponById(firer.weaponId);
    var range = FC.hexDistance(firer.hexId, target.hexId);
    var band = FC.resolveRangeBand(weapon, range);
    // §6/5/§11/4: "Even an attempted attack... makes all US soldiers in the target hex aware" —
    // triggers on the attempt itself, not the outcome, and fire has no hit-chance modifier keyed
    // to awareness (unlike assault's WS-negation), so it's safe to fire this immediately.
    if (firer.side === 'german') wakeUpUnawareInHex(target.hexId);
    var tracer = { resolve: function () {} }; // board effect (task 4); set when the card shows the shot

    infoPopup({ actor: { left: firer, right: target }, title: 'Fire — ' + (fireType === 'aimed' ? 'Aimed' : 'Snap'),
      bodyHtml: firer.name + ' fires (' + fireType + ') at ' + target.name + ' — range ' + range + ' (' + band + ').',
      fx: function () { FX.ensureVisible([firer.hexId, target.hexId]); tracer = FX.tracer(firer.hexId, target.hexId, 'fire', weapon && weapon.id); } }, jamStep);

    function jamStep() {
      rollPopup({ actor: { left: firer, right: target }, title: 'Jam Check', kind: 'percentile', variant: 'wide', 
        contextHtml: 'Weapon: ' + weapon.name + '.',
        explain: function (roll) { var jam = FC.resolveJamCheck(weapon, fireType, roll); return jam.jammed ? '<b style="color:#e05a4a;">JAMMED</b> &mdash; stays jammed until cleared (&sect;9/4).' : 'No jam.'; },
        logText: function (roll) { var jam = FC.resolveJamCheck(weapon, fireType, roll); return 'Jam check: <span class="roll">' + pad2(roll) + '</span> vs &le;' + pad2(jam.threshold) + ' &rarr; ' + (jam.jammed ? '<b>JAMMED</b>.' : 'no jam.'); },
        fxLanded: function (roll) { if (FC.resolveJamCheck(weapon, fireType, roll).jammed) { tracer.resolve('jam'); FX.badge(firer.hexId, 'JAMMED', 'bad'); } },
      }, function (roll) { if (FC.resolveJamCheck(weapon, fireType, roll).jammed) { firer.weaponJammed = true; onDone(); return; } hitStep(); });
    }
    function hitStep() {
      var b = estimateHitChanceBreakdown(firer, target, fireType);
      var breakdown = hitBreakdownHtml(b);
      rollPopup({ actor: { left: firer, right: target }, title: 'Hit Chance & To-Hit', kind: 'single', variant: 'wide', contextHtml: breakdown, strip: hitStrip(b.clamped),
        explain: function (roll) { var hit = FC.resolveHitRoll(b.clamped, roll) === 'hit'; return hit ? '<b style="color:var(--clear)">HIT</b>.' : 'Miss.'; },
        logText: function (roll) { var hit = FC.resolveHitRoll(b.clamped, roll) === 'hit'; return 'To-hit: <span class="roll">' + roll + '</span> &rarr; ' + (hit ? '<b>HIT</b>' : 'miss') + '.'; },
        fxLanded: function (roll) {
          var hit = FC.resolveHitRoll(b.clamped, roll) === 'hit';
          tracer.resolve(hit ? 'hit' : 'miss');
          FX.floatDie(target.hexId, roll, hit ? 'hit' : 'miss');
          FX.sound(hit ? 'hit' : 'miss');
          if (hit) FX.shake(); else FX.badge(target.hexId, 'MISS', 'neutral');
        },
      }, function (roll) { if (FC.resolveHitRoll(b.clamped, roll) === 'hit') damageStep(); else ammoStep(); });
    }
    function damageStep() {
      rollPopup({ actor: { left: firer, right: target }, title: 'Damage', kind: 'single', variant: 'wide', contextHtml: 'Damage roll on the ' + weapon.name + ' row.', strip: damageStrip(weapon),
        explain: function (roll) {
          var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND);
          var ns = FC.escalateDamageResult(target.status, displayCode(target, dmg.code));
          return '<b>' + dmg.code + ' = ' + dmg.label + '</b> &mdash; ' + target.name + ' is now <b>' + ns.toUpperCase() + '</b>.' +
            fieldDressNote(target, dmg.code);
        },
        logText: function (roll) { var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND); return 'Damage: <span class="roll">' + roll + '</span> &rarr; <b>' + dmg.code + ' = ' + dmg.label + '</b>.'; },
        fxLanded: function (roll) { FX.floatDie(target.hexId, roll, 'bad'); },
      }, function (roll) {
        var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND);
        applyDamage(target, D.consumeFieldDressing(difficulty, target, dmg.code), 'killed');
        if (phase === 'over') { onDone(); return; }
        ammoStep();
      });
    }
    // Task #62 (docs/34_AMMO_DEPLETION.md): §9/5 "German soldiers do not have Ammo Boxes and do
    // not expend ammo clips when firing" — the Ammo Check itself doesn't apply to them at all,
    // not just its consequence, so a German firer skips this step entirely.
    function ammoStep() {
      if (firer.side === 'german') { onDone(); return; }
      rollPopup({ actor: firer, title: 'Ammo Check', kind: 'percentile', contextHtml: 'Weapon: ' + weapon.name + '.',
        explain: function (roll) { var ammo = FC.resolveAmmoExpenditure(weapon, roll); return ammo.expended ? 'Clip spent.' : 'Clip not used up.'; },
        logText: function (roll) { var ammo = FC.resolveAmmoExpenditure(weapon, roll); return 'Ammo: <span class="roll">' + pad2(roll) + '</span> &rarr; ' + (ammo.expended ? 'clip spent.' : 'not used up.'); },
        fxLanded: function (roll) { if (FC.resolveAmmoExpenditure(weapon, roll).expended) FX.badge(firer.hexId, 'CLIP SPENT', 'neutral'); },
      }, function (roll) {
        var ammo = FC.resolveAmmoExpenditure(weapon, roll);
        if (ammo.expended) { EQ.expendAmmo(firer.inventory, firer.weaponId); renderRoster(); }
        onDone();
      });
    }
  }

  // "One soldier is fired upon by a hidden rifleman" (paragraphs 20, 23): one fire with the
  // paragraph's own features at the soldier who triggered it. No German counter, no line to
  // trace, no Ammo Check (§9/5: Germans expend none); terrain is the target's own hex, read as
  // from a distance. Rounds do not commence.
  function hiddenFireChain(target, spec, onDone) {
    var weapon = weaponById(spec.weaponId);
    var row = LOS.BUILDING_TERRAIN[LOS_TERRAIN[target.hexId]] ? TERRAIN_ROW_INTERIOR_FAR : terrainRowFor(target.hexId);
    if (!target.isActive) { onDone(); return; }
    if (!FC.canBeFiredAt(CHART.FIRE_MODS_TERRAIN, row, target.stance)) {
      infoPopup({ actor: target, title: 'Hidden rifleman', bodyHtml: 'A shot cracks out of nowhere, but ' + target.name + ' cannot be fired at where he lies.' }, onDone);
      return;
    }
    var easyMod = D.hitChanceMod(difficulty, 'german');
    var b = {
      baseHit: CHART.BASE_HIT[spec.range], band: spec.range, terrainMod: FC.resolveTerrainMod(CHART.FIRE_MODS_TERRAIN, row, target.stance),
      ws: spec.weaponSkill, fireType: spec.fireType, easyMod: easyMod,
    };
    b.clamped = FC.computeFinalHitChance({ baseHit: b.baseHit, terrainMod: b.terrainMod, fireType: b.fireType, weaponSkill: b.ws, otherMods: easyMod ? [easyMod] : [] }).clamped;
    infoPopup({ actor: target, title: 'Hidden rifleman',
      bodyHtml: target.name + ' is fired upon by a hidden rifleman: ' + spec.fireType + ', ' + spec.range + ' range, ' + weapon.name + ', Weapon Skill ' + spec.weaponSkill + '.' }, jamStep);
    function jamStep() {
      rollPopup({ actor: target, title: 'Jam Check', kind: 'percentile', variant: 'wide', contextHtml: 'Weapon: ' + weapon.name + '.',
        explain: function (roll) { return FC.resolveJamCheck(weapon, spec.fireType, roll).jammed ? '<b style="color:#e05a4a;">JAMMED</b> &mdash; the shot never comes.' : 'No jam.'; },
        logText: function (roll) { var jam = FC.resolveJamCheck(weapon, spec.fireType, roll); return 'Hidden rifleman, jam check: <span class="roll">' + pad2(roll) + '</span> vs &le;' + pad2(jam.threshold) + ' &rarr; ' + (jam.jammed ? '<b>JAMMED</b>.' : 'no jam.'); },
      }, function (roll) { if (FC.resolveJamCheck(weapon, spec.fireType, roll).jammed) { onDone(); return; } hitStep(); });
    }
    function hitStep() {
      rollPopup({ actor: target, title: 'Hit Chance & To-Hit', kind: 'single', variant: 'wide', contextHtml: hitBreakdownHtml(b), strip: hitStrip(b.clamped),
        explain: function (roll) { return FC.resolveHitRoll(b.clamped, roll) === 'hit' ? '<b style="color:var(--clear)">HIT</b>.' : 'Miss.'; },
        logText: function (roll) { return 'Hidden rifleman, to-hit: <span class="roll">' + roll + '</span> &rarr; ' + (FC.resolveHitRoll(b.clamped, roll) === 'hit' ? '<b>HIT</b>' : 'miss') + '.'; },
        fxLanded: function (roll) {
          var hit = FC.resolveHitRoll(b.clamped, roll) === 'hit';
          FX.floatDie(target.hexId, roll, hit ? 'hit' : 'miss');
          FX.sound(hit ? 'hit' : 'miss');
          if (hit) FX.shake(); else FX.badge(target.hexId, 'MISS', 'neutral');
        },
      }, function (roll) { if (FC.resolveHitRoll(b.clamped, roll) === 'hit') damageStep(); else onDone(); });
    }
    function damageStep() {
      rollPopup({ actor: target, title: 'Damage', kind: 'single', variant: 'wide', contextHtml: 'Damage roll on the ' + weapon.name + ' row.', strip: damageStrip(weapon),
        explain: function (roll) {
          var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND);
          var ns = FC.escalateDamageResult(target.status, displayCode(target, dmg.code));
          return '<b>' + dmg.code + ' = ' + dmg.label + '</b> &mdash; ' + target.name + ' is now <b>' + ns.toUpperCase() + '</b>.' + fieldDressNote(target, dmg.code);
        },
        logText: function (roll) { var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND); return 'Hidden rifleman, damage: <span class="roll">' + roll + '</span> &rarr; <b>' + dmg.code + ' = ' + dmg.label + '</b>.'; },
        fxLanded: function (roll) { FX.floatDie(target.hexId, roll, 'bad'); },
      }, function (roll) {
        var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND);
        applyDamage(target, D.consumeFieldDressing(difficulty, target, dmg.code), 'killed');
        onDone();
      });
    }
  }

  // ---------------------------------------------------------------------
  // §10 Grenade combat (Task #63, docs/35_GRENADE_COMBAT.md)
  //
  // Deliberately NOT modelled, matching grenaderules.js's own documented gaps plus one new one
  // found while wiring this: the §10/2 Grenade Strike PC Check (every aware soldier in the
  // struck hex gets an out-of-turn reaction — toss it back out, or fall prone). The pure
  // resolver (`Gr.resolveStrikeReaction`) already exists; giving it a caller means interrupting
  // the normal turn flow for soldiers who aren't the current actor, a genuinely separate feature
  // from "can a grenade be thrown and do damage," left for a future session rather than bolted on
  // here as a partial/untested version.
  // ---------------------------------------------------------------------
  function grenadeChain(thrower, targetHexId, onDone) {
    var range = FC.hexDistance(thrower.hexId, targetHexId);
    var band = FC.resolveRangeBand(weaponById(Gr.weaponIdFor('grenade', isInteriorHex(targetHexId))), range);
    var mods = grenadeMods(thrower, targetHexId);
    var baseHit = CHART.BASE_HIT[band];
    // Gr.computeHitChance takes a flat list of modifiers, so Easy mode's is just another entry.
    var easyMod = D.hitChanceMod(difficulty, thrower.side);
    if (easyMod) mods = mods.concat([easyMod]);
    var hitChance = Gr.computeHitChance(baseHit, mods);
    // §11/4/§6/5's "even an attempted attack wakes the hex" rule, already applied the same way
    // to fire and assault attempts — a thrown grenade is no different.
    if (thrower.side === 'german') wakeUpUnawareInHex(targetHexId);

    // §10 preamble: "When a soldier throws a grenade, cross off one of his ammo boxes containing
    // a grenade" — unconditional on the throw itself, not on the outcome (weapon.ammo === 'A' on
    // grout/grin is exactly this "always certain" case, docs/26_GRENADES.md), so it happens right
    // here rather than at the end the way a personal weapon's probabilistic ammo check does.
    if (thrower.inventory) {
      EQ.expendGrenade(thrower.inventory);
      if (thrower.side !== 'german') renderRoster();
    }

    var arc = { resolve: function () {} };
    infoPopup({ actor: thrower, title: 'Throw Grenade', focusHex: targetHexId, bodyHtml: thrower.name + ' throws a grenade at ' + targetHexId + ' — range ' + range + ' (' + band + ').',
      fx: function () { FX.ensureVisible([thrower.hexId, targetHexId]); arc = FX.tracer(thrower.hexId, targetHexId, 'grenade'); } }, hitStep);

    function hitStep() {
      var parts = ['Base ' + baseHit + ' (' + band + ')', fmtSigned(thrower.WS) + ' WS'];
      if (thrower.status === 'wounded') parts.push('&minus;2 wounded');
      if (mods.indexOf(-3) !== -1) parts.push('&minus;3 not in sight');
      if (easyMod) parts.push(fmtSigned(easyMod) + ' easy mode');
      var breakdown = parts.join(' ') + ' &rarr; Hit Chance <b>' + hitChance.clamped + '</b>.';
      rollPopup({ actor: thrower, title: 'Grenade Throw', kind: 'single', contextHtml: breakdown, strip: hitStrip(hitChance.clamped),
        explain: function (roll) { return FC.resolveHitRoll(hitChance.clamped, roll) === 'hit' ? '<b style="color:var(--clear)">LANDS</b> in ' + targetHexId + '.' : 'Missed &mdash; scatters.'; },
        logText: function (roll) { return 'Grenade throw: <span class="roll">' + roll + '</span> &rarr; ' + (FC.resolveHitRoll(hitChance.clamped, roll) === 'hit' ? 'lands in ' + targetHexId + '.' : 'scatters.'); },
        fxLanded: function (roll) {
          var hit = FC.resolveHitRoll(hitChance.clamped, roll) === 'hit';
          arc.resolve(hit ? 'hit' : 'miss');
          FX.floatDie(targetHexId, roll, hit ? 'hit' : 'miss');
        },
      }, function (roll) {
        if (FC.resolveHitRoll(hitChance.clamped, roll) === 'hit') resolveLanding(targetHexId);
        else scatterStep();
      });
    }
    function scatterStep() {
      rollPopup({ actor: thrower, title: 'Grenade Scatter', kind: 'single', contextHtml: 'Missed the target hex &mdash; rolling to see where it actually lands (&sect;10/3).',
        explain: function (roll) { return 'Lands in <b>' + Gr.resolveScatter(thrower.hexId, targetHexId, roll).hexId + '</b>.'; },
        logText: function (roll) { return 'Scatter: <span class="roll">' + roll + '</span> &rarr; lands in ' + Gr.resolveScatter(thrower.hexId, targetHexId, roll).hexId + '.'; },
        fxLanded: function (roll) { var land = Gr.resolveScatter(thrower.hexId, targetHexId, roll).hexId; FX.trail(targetHexId, land); FX.ensureVisible([land]); },
      }, function (roll) { resolveLanding(Gr.resolveScatter(thrower.hexId, targetHexId, roll).hexId); });
    }
    function resolveLanding(landHexId) {
      rollPopup({ actor: thrower, title: 'Dud Check', kind: 'percentile', contextHtml: 'Grenade landed in ' + landHexId + '.',
        explain: function (roll) { return Gr.resolveDudCheck(roll).dud ? '<b>DUD</b> &mdash; no effect.' : 'Explodes!'; },
        logText: function (roll) { return 'Dud check: <span class="roll">' + pad2(roll) + '</span> &rarr; ' + (Gr.resolveDudCheck(roll).dud ? 'dud.' : 'explodes.'); },
        fxLanded: function (roll) {
          var dud = Gr.resolveDudCheck(roll).dud;
          FX.blast(landHexId, dud);
          FX.badge(landHexId, dud ? 'DUD' : 'BOOM', dud ? 'neutral' : 'bad');
        },
      }, function (roll) {
        if (Gr.resolveDudCheck(roll).dud) { onDone(); return; }
        var landWeapon = weaponById(Gr.weaponIdFor('grenade', isInteriorHex(landHexId)));
        damageEach(activeSoldiersIn(landHexId), 0, landWeapon);
      });
    }
    // §10/1 step 5: "All soldiers in a hex in which a grenade... explodes suffer damage. Roll
    // separately for each." Friendly, enemy, or both — activeSoldiersIn() doesn't filter by side.
    function damageEach(occupants, i, landWeapon) {
      if (i >= occupants.length) { onDone(); return; }
      var victim = occupants[i];
      rollPopup({ actor: victim, title: 'Grenade Damage — ' + victim.name, kind: 'single', contextHtml: 'Damage roll on the ' + landWeapon.name + ' row.', strip: damageStrip(landWeapon),
        explain: function (roll) {
          var dmg = FC.resolveDamage(landWeapon, roll, CHART.DAMAGE_LEGEND);
          var code = dmg.code === 'X' ? FC.resolveXCode(victim.stance === 'prone') : dmg.code;
          var ns = FC.escalateDamageResult(victim.status, displayCode(victim, code));
          return '<b>' + dmg.code + ' = ' + dmg.label + '</b> &mdash; ' + victim.name + ' is now <b>' + ns.toUpperCase() + '</b>.' +
            fieldDressNote(victim, code);
        },
        logText: function (roll) { var dmg = FC.resolveDamage(landWeapon, roll, CHART.DAMAGE_LEGEND); return 'Grenade damage (' + victim.name + '): <span class="roll">' + roll + '</span> &rarr; <b>' + dmg.code + '</b>.'; },
        fxLanded: function (roll) { FX.floatDie(victim.hexId, roll, 'bad'); },
      }, function (roll) {
        var dmg = FC.resolveDamage(landWeapon, roll, CHART.DAMAGE_LEGEND);
        var code = dmg.code === 'X' ? FC.resolveXCode(victim.stance === 'prone') : dmg.code;
        applyDamage(victim, D.consumeFieldDressing(difficulty, victim, code), 'grenade');
        if (phase === 'over') { onDone(); return; }
        damageEach(occupants, i + 1, landWeapon);
      });
    }
  }

  // ---------------------------------------------------------------------
  // §11 Assault
  // ---------------------------------------------------------------------
  function assaultChain(attacker, defender, opts, onDone) {
    var chooseCapture = !!opts.capture, isCharge = !!opts.charge;
    var weaponId = chooseCapture ? 'asltc' : 'asltk';
    var weapon = weaponById(weaponId);
    var lunge = { resolve: function () {} }; // board effect (task 4); declared before the card can show
    infoPopup({
      actor: { left: attacker, right: defender },
      title: isCharge ? 'Charge Assault' : 'Assault',
      bodyHtml: attacker.name + (isCharge ? ' charge assaults ' : ' assaults ') + defender.name + (chooseCapture ? ' (to capture)' : ' (to kill)') + '.',
      fx: function () { FX.ensureVisible([attacker.hexId, defender.hexId]); lunge = FX.tracer(attacker.hexId, defender.hexId, 'assault'); FX.badge(attacker.hexId, isCharge ? 'CHARGE' : 'ASSAULT', 'amber'); },
    }, hitStep);

    function hitStep() {
      var mods = assaultOpts(attacker, defender, isCharge);
      // §11/4: "makes all US soldiers in the target hex aware" — computed from `mods` (the
      // defender's PRE-attack awareness) first, since an unaware defender's WS is negated for
      // THIS assault regardless of the fact that the attack itself is what wakes him up.
      if (attacker.side === 'german') wakeUpUnawareInHex(defender.hexId);
      var hitChance = Asl.computeHitChance(CHART.BASE_HIT.assault, mods);
      // assaultrules.js clamps before Easy mode's modifier exists, so it is applied and re-clamped
      // here rather than by teaching that tested module about a non-rulebook concept.
      var easyMod = D.hitChanceMod(difficulty, attacker.side);
      if (easyMod) hitChance = D.applyHitMod(hitChance, easyMod);
      // Spell out every §11/4 modifier that actually applied, so the number is auditable.
      var parts = ['Base ' + CHART.BASE_HIT.assault, fmtSigned(attacker.WS) + ' attacker WS'];
      if ((mods.defenderWS || 0) >= 1 && !mods.defenderPanicked && !mods.defenderWounded) parts.push('&minus;' + mods.defenderWS + ' defender WS');
      if (isCharge) parts.push('&minus;3 charge assault');
      if (mods.attackerWounded) parts.push('&minus;2 attacker wounded');
      if (easyMod) parts.push(fmtSigned(easyMod) + ' easy mode');
      var breakdown = parts.join(' ') + ' &rarr; Hit Chance <b>' + hitChance.clamped + '</b>.';
      rollPopup({ actor: { left: attacker, right: defender }, title: 'Assault Hit Chance', kind: 'single', variant: 'wide', contextHtml: breakdown, strip: hitStrip(hitChance.clamped),
        explain: function (roll) { return FC.resolveHitRoll(hitChance.clamped, roll) === 'hit' ? '<b style="color:var(--clear)">HIT</b>.' : 'Miss.'; },
        logText: function (roll) { return 'Assault to-hit: <span class="roll">' + roll + '</span> &rarr; ' + (FC.resolveHitRoll(hitChance.clamped, roll) === 'hit' ? '<b>HIT</b>' : 'miss') + '.'; },
        fxLanded: function (roll) {
          var hit = FC.resolveHitRoll(hitChance.clamped, roll) === 'hit';
          lunge.resolve(hit ? 'hit' : 'miss');
          FX.floatDie(defender.hexId, roll, hit ? 'hit' : 'miss');
          FX.sound(hit ? 'hit' : 'miss');
          if (hit) FX.shake(); else FX.badge(defender.hexId, 'MISS', 'neutral');
        },
      }, function (roll) { if (FC.resolveHitRoll(hitChance.clamped, roll) === 'hit') damageStep(); else onDone(); });
    }
    function damageStep() {
      rollPopup({ actor: { left: attacker, right: defender }, title: 'Assault Damage', kind: 'single', variant: 'wide', contextHtml: 'Damage roll on the ' + weapon.name + ' row.', strip: damageStrip(weapon),
        explain: function (roll) {
          var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND);
          var code = dmg.code === 'Z' ? FC.resolveZCode(defender.status === 'panicked' || defender.status === 'wounded') : dmg.code;
          if (code === 'C') return '<b>CAPTURED</b> &mdash; ' + defender.name + ' is taken prisoner.';
          // '*' = "No effect" (DAMAGE_LEGEND) — a real Assault Table result (e.g. Assault-to-Kill
          // roll 0), not a P/W/I/K code escalateDamageResult understands. Found live while
          // verifying Task #62: an unguarded call here crashed the page on this roll.
          if (code === '*') return '<b>No effect.</b>';
          var ns = FC.escalateDamageResult(defender.status, displayCode(defender, code));
          return '<b>' + code + ' = ' + CHART.DAMAGE_LEGEND[code] + '</b> &mdash; ' + defender.name + ' is now <b>' + ns.toUpperCase() + '</b>.' +
            fieldDressNote(defender, code);
        },
        logText: function (roll) { var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND); return 'Assault damage: <span class="roll">' + roll + '</span> &rarr; <b>' + dmg.code + '</b>.'; },
        fxLanded: function (roll) {
          FX.floatDie(defender.hexId, roll, 'bad');
          var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND);
          var code = dmg.code === 'Z' ? FC.resolveZCode(defender.status === 'panicked' || defender.status === 'wounded') : dmg.code;
          if (code === '*') FX.badge(defender.hexId, 'NO EFFECT', 'neutral');
        },
      }, function (roll) {
        var dmg = FC.resolveDamage(weapon, roll, CHART.DAMAGE_LEGEND);
        var code = dmg.code === 'Z' ? FC.resolveZCode(defender.status === 'panicked' || defender.status === 'wounded') : dmg.code;
        if (code === 'C') applyCapture(defender);
        else if (code !== '*') applyDamage(defender, D.consumeFieldDressing(difficulty, defender, code), 'captured');
        onDone();
      });
    }
  }

  // Easy mode's field dressing, as the damage pop-ups need it. `explain` runs BEFORE the result is
  // applied and has to announce exactly what the commit will do, so the question (does it apply?)
  // is asked without mutating and the allowance is only spent on commit — see difficulty.js.
  function fieldDressNote(target, code) {
    return D.fieldDressingApplies(difficulty, target, code)
      ? '<br><br><b style="color:var(--clear);">Field dressing (easy mode)</b> &mdash; ' + target.name +
        ' is <b>INCAPACITATED</b> instead of killed. This is his one second chance; he is still out of ' +
        'the fight and still costs 2 VP unless you carry him off the map (&sect;15).'
      : '';
  }
  // The code that will actually be applied, for display purposes only. Never mutates.
  function displayCode(target, code) {
    return D.fieldDressingApplies(difficulty, target, code) ? 'I' : code;
  }

  // ---------------------------------------------------------------------
  // Damage application, shared by fire and assault
  // ---------------------------------------------------------------------
  function applyDamage(target, code, outcomeLabel) {
    var before = target.status;
    var newStatus = FC.escalateDamageResult(target.status, code);
    target.status = newStatus;
    if (newStatus !== before) FX.status(target); else FX.badge(target.hexId, 'NO EFFECT', 'neutral');
    // The AR Track only exists while a Round is in progress; `track` is null in Operations. Every
    // Sched call below therefore has to be conditional. Nothing inflicts damage during Operations
    // today — the one candidate, the minefield procedure, is displayed but never resolved — so
    // this is a latent crash rather than a live one, but it is exactly the sort of thing a future
    // §12 hazard would trip over on its first run.
    if (newStatus === 'incapacitated' || newStatus === 'killed') {
      target.isActive = false;
      if (track) Sched.removeFromRound(track, target.id);
      recordCasualty(target, newStatus === 'killed' ? 'killed' : 'incapacitated');
      updateCounterVisual(target); renderTrack(); renderRoster(); renderVP();
      checkEndingConditions();
      if (target.side === 'german') return;
      if (!activeUS().length) { endMission('all-us-down'); return; }
    } else if (newStatus === 'wounded') {
      target.wounded = true; target.stance = 'prone';
      if (track) Sched.applyWoundedStatus(track, target.id);
      // §13/2 (docs/39_WOUND_EFFECTS.md, Task #58): "A wounded soldier has his Movement Point
      // Allowance reduced to 2 for the rest of the mission." Permanent, not just this Round —
      // roundLegalDestinations/dragCandidates/etc. all read s.mpa directly, so this one
      // assignment is the single source of truth for every consumer.
      target.mpa = 2;
      // §13/2 (docs/33_PORT_BOX.md): "A wounded soldier's Port Box total is reduced to one... he
      // must immediately drop the contents of one Port Box." Only the Port-Box-specific clause
      // belongs to the inventory model itself.
      if (target.side === 'US' && target.inventory) {
        var dropped = EQ.applyWoundPortBoxLoss(target, target.inventory);
        dropped.droppedItemIds.forEach(function (id) {
          // Task #68 (docs/37_PICKUP_EXCHANGE.md): actually lands in the hex now, pickup-able by
          // Pick Up/Exchange Equipment — previously just logged and vanished (docs/33's own gap).
          addGroundItem(target.hexId, id, 'port');
          logLine(target.name + ' drops ' + equipmentName(id) + ' (wounded, Port Box reduced to one).', 'event');
        });
      }
      updateCounterVisual(target); renderTrack();
    } else if (newStatus === 'panicked') {
      if (track) Sched.applyPanicStatus(track, target.id);
      renderTrack();
    }
  }
  function applyCapture(target) {
    target.status = 'captured';
    FX.status(target);
    target.stance = 'prone';
    target.isActive = false;
    Sched.removeFromRound(track, target.id);
    recordCasualty(target, 'captured');
    updateCounterVisual(target); renderTrack(); renderRoster(); renderVP();
    checkEndingConditions();
  }
  // §11/2 second half (Task #72, docs/46_CAPTURED_GERMAN.md): "During Operations, if a captured
  // German is ever in a hex without an active US soldier, he is immediately free... commence
  // Rounds, if not already in progress. He receives turns normally beginning the next Action
  // Round. ... automatically aware of him. If there are no US soldiers in sight at the beginning
  // of the Round, the German soldier is removed from the map permanently (he ran away). Use the
  // Self-preservation column ... for the rest of the mission." "You cannot ... in any way
  // intentionally harm them. However, you can voluntarily leave them in a hex alone. The captive
  // is then considered free..." — this single scan covers both the accidental and the voluntary
  // case identically; there is no separate "voluntary release" code path because the rule's own
  // trigger (no active US soldier present) is the same either way. "Guard" is never tracked as
  // its own field — whichever active US soldier(s) currently share the captured German's hex are
  // implicitly guarding him; there is no explicit "change guard" mechanic to model as a result.
  // Scoped to Operations only, matching the rule's own words — capture only ever happens via
  // Assault (a Rounds-only action, §11/1), so a captured German can only ever be left unguarded
  // once Rounds has already ended and control has returned to Operations.
  function checkCapturedGermanEscapes() {
    if (phase !== 'movement') return;
    allGermans().filter(function (g) { return g.status === 'captured'; }).forEach(function (g) {
      var guarded = activeUS().some(function (s) { return s.hexId === g.hexId; });
      if (!guarded) freeGerman(g);
    });
  }
  function freeGerman(g) {
    g.status = 'unharmed';
    // "for the rest of the mission" — a permanent flag, not just "while adjacent to a US
    // soldier" like the normal Self-Preservation trigger (arrules.js's own proximity check,
    // still applied normally for every OTHER German); this one simply always wins for him.
    g.forcedSelfPreservation = true;
    var seen = activeUS().some(function (s) { return losClearBetween(g, s); });
    if (!seen) {
      g.isActive = false;
      var el = counterEls[g.id]; if (el) { el.remove(); delete counterEls[g.id]; }
      logHeader(g.name + ' is left unguarded with no US soldier in sight &mdash; he flees the map for good (&sect;11/2).');
      renderRoster();
      return;
    }
    g.isActive = true;
    logHeader(g.name + ' is left unguarded &mdash; he is free! All US soldiers are now aware of him (&sect;11/2).');
    activeUS().forEach(function (s) { s.aware = true; });
    renderRoster();
    startActionRound(1);
  }
  function recordCasualty(soldier, outcome) {
    if (soldier.side === 'german') {
      vpState.germanDefeats.push({ vpText: soldier.card.VP || '+1 VP', outcome: outcome });
      logLine(soldier.name + ' is out of the fight (' + outcome + ').', 'event');
    } else {
      vpState.usCasualties.push({ soldierId: soldier.id, outcome: outcome, wasExfiltrated: false });
      logLine(soldier.name + ' is a casualty (' + outcome + ').', 'event');
    }
  }

  // ---------------------------------------------------------------------
  // Round bookkeeping
  // ---------------------------------------------------------------------
  // §13/1 (Task #65, docs/40_PANIC_EFFECTS.md): "A panicked soldier falls prone at the end of
  // the Round, if not already prone." Keyed off `status` (set the moment a damage/assault result
  // panics someone), not the AR Track slot — a soldier already in Complete when panicked stays
  // there per the marker-placement exception (arscheduler.js's applyPanicStatus), but he still
  // falls prone at Round-end regardless of which slot his marker sits in. Applies to both sides:
  // a German can be panicked by the same 'P' damage code a US soldier can.
  function fallPronePanickedSoldiers() {
    activeUS().concat(activeGermans()).forEach(function (s) {
      if (s.status === 'panicked' && s.stance !== 'prone') {
        s.stance = 'prone';
        updateCounterVisual(s);
        logLine(s.name + ' falls prone (panicked, &sect;13/1).', 'event');
      }
    });
  }
  function endRound() {
    document.getElementById('action-sec').style.display = 'none';
    fallPronePanickedSoldiers();
    Cues.banner('round', 'Round ' + roundNum + ' Complete');
    infoPopup({ title: 'Round ' + roundNum + ' Complete', bodyHtml: 'Round ' + roundNum + ' complete.' }, function () {
      if (!activeGermans().length) {
        // All Germans down or captured — back to Operations, matching §6's Rounds-end rule.
        phase = 'movement';
        document.getElementById('tb-phase').textContent = 'Operations';
        document.getElementById('status-banner').textContent = 'No active Germans — back to Operations.';
        Cues.banner('ops', 'Operations', 'No active Germans');
        document.getElementById('track-sec').style.display = 'none';
        document.getElementById('movement-sec').style.display = '';
        // §11/2 (Task #72): a captured German whose captor didn't survive/stay in his hex through
        // the rest of the Round is immediately unguarded the moment Operations resumes.
        checkCapturedGermanEscapes();
        if (phase === 'movement') deselect(activeUS().length ? activeUS()[0].id : null);
        return;
      }
      document.getElementById('round-sec').style.display = '';
      document.getElementById('tb-phase').textContent = 'Round ' + roundNum + ' complete';
      document.getElementById('status-banner').textContent = 'Round complete. Continue the fight.';
    });
  }
  document.getElementById('newRoundBtn').addEventListener('click', function () {
    document.getElementById('round-sec').style.display = 'none';
    startActionRound(roundNum + 1);
  });

  // ---------------------------------------------------------------------
  // Exit the map (available on any of the entry hexes during movement)
  //
  // Mission 1's Ending 2 is "All active US soldiers have exited the map from hex A1 through hex
  // J1 (inclusive)" — one of only two ways the mission can end. This was reachable ONLY from the
  // console (window.__mission1Debug.tryExit) with no button anywhere, so half the mission's
  // endings could not be played. The button lives in the Operations panel because exiting is
  // movement off the map edge, and Operations is where free movement happens (§5).
  // ---------------------------------------------------------------------
  function canExit(s) {
    return !!s && phase === 'movement' && !s.exited && s.isActive && ENTRY_HEXES.indexOf(s.hexId) !== -1;
  }
  function tryExit(s) {
    if (!s || s.exited || !s.isActive) return;
    if (ENTRY_HEXES.indexOf(s.hexId) === -1) { Toasts.show('Must be on the north edge (A1-J1) to exit.', { kind: 'error' }); return; }
    // §15: an incapacitated soldier in this hex can be carried off with him, avoiding that
    // casualty's 2 VP loss. chooseTarget auto-picks a lone candidate without a dialog, which is
    // the right behavior here — carrying costs the player nothing and saves 2 VP, so there is no
    // real decision to interrupt him for until there's more than one body to choose between.
    var carryable = carryCandidates(s);
    if (!carryable.length) { finishExit(s, null); return; }
    chooseTarget(s, carryable, {
      title: 'Carry Off the Map',
      prompt: s.name + ' can carry one incapacitated soldier off the map with him — that soldier\'s 2 VP loss is then avoided (&sect;15). Cancel to leave them behind.',
      onCancel: function () { finishExit(s, null); },
    }, function (picked) { finishExit(s, picked); });
  }
  function finishExit(s, carried) {
    var remaining = activeUS().filter(function (o) { return o.id !== s.id; }).length;
    infoPopup({
      actor: s, title: 'Exit Map',
      bodyHtml: s.name + ' leaves the map at ' + s.hexId + '.' +
        (carried ? ' He carries <b>' + carried.name + '</b> (incapacitated) off with him &mdash; no VP lost for that casualty (&sect;15).' : '') +
        (remaining ? ' <span style="color:var(--text-label);">' + remaining + ' soldier' + (remaining === 1 ? '' : 's') + ' still on the map.</span>'
                   : ' <b>That is the last active soldier — the mission ends here (Ending 2).</b>'),
      logHtml: s.name + ' exits the map at ' + s.hexId + (carried ? ', carrying ' + carried.name + ' off (VP loss avoided)' : '') + '.',
    }, function () {
      s.exited = true;
      var el = counterEls[s.id]; if (el) { el.remove(); delete counterEls[s.id]; }
      if (carried) {
        carried.exited = true;
        markExfiltrated(carried);
        var cel = counterEls[carried.id]; if (cel) { cel.remove(); delete counterEls[carried.id]; }
      }
      renderRoster();
      renderVP(); // an exfiltrated casualty changes the VP total the moment he's off the map
      checkEndingConditions();
      if (phase === 'over') return;
      checkCapturedGermanEscapes(); // §11/2: exiting can leave a captured German unguarded
      if (phase !== 'movement') return; // freeing a German can immediately commence Rounds
      var left = activeUS();
      if (left.length) deselect(left[0].id);
      else { clearDestMarks(); renderStatusBanner(); }
    });
  }
  document.getElementById('exitMapBtn').addEventListener('click', function () {
    if (phase !== 'movement') return;
    tryExit(selectedSoldier());
  });

  // ---------------------------------------------------------------------
  // Victory — Mission 1's two real ending conditions
  // ---------------------------------------------------------------------
  function checkEndingConditions() {
    if (phase === 'over') return;
    var allExited = activeUS().every(function (s) { return s.exited; }) && usSoldiers.some(function (s) { return s.isActive; });
    if (V.checkEnding2(allExited)) { endMission('ending2'); return; }

    var t8 = activeUS().some(function (s) { return !s.exited && s.hexId === 'T8'; });
    var k13 = activeUS().some(function (s) { return !s.exited && s.hexId === 'K13'; });
    var l13 = activeUS().some(function (s) { return !s.exited && s.hexId === 'L13'; });
    var heights = activeUS().some(function (s) { return !s.exited && HEIGHTS_CANDIDATE_HEXES[s.hexId]; });
    if (V.checkEnding1({ t8Occupied: t8, k13Occupied: k13, l13Occupied: l13, heightsHexWithFullRoadLOS: heights, activeGermanCount: activeGermans().length })) {
      vpState.awards.push({ amount: 4, note: 'Ending 1 — Hold the Ground' });
      // §15's second exfiltration clause: "or, if mission ending 1 is accomplished, by moving him
      // into either building hex." JUDGMENT CALL on "either": the same victory paragraph calls T8
      // "the building hex" (singular) and K13/L13 "the building hexes" (a pair), so "either"
      // reads as that pair, not as a three-way choice including T8. Flagged rather than silently
      // assumed — if a future reading says T8 counts too, this is the one line to change.
      usSoldiers.filter(function (s) {
        return !s.exited && s.status === 'incapacitated' && (s.hexId === 'K13' || s.hexId === 'L13');
      }).forEach(markExfiltrated);
      endMission('ending1');
    }
  }

  function endMission(reason) {
    phase = 'over';
    document.getElementById('action-sec').style.display = 'none';
    document.getElementById('round-sec').style.display = 'none';
    document.getElementById('movement-sec').style.display = 'none';
    clearDestMarks();
    var totals = renderVP();
    var result = V.resolveVictory(totals.total, vpRequirement());
    Cues.banner('end', result === 'won' ? 'Mission Accomplished' : 'Mission Failed', totals.total + ' VP · need ' + vpRequirement(), result === 'won' ? 'won' : 'lost');
    Cues.kranz(result === 'won' ? 'frustrated' : 'smug', result === 'won'
      ? '<b>Verdammt.</b> ' + totals.total + ' VP against the ' + vpRequirement() + ' you needed. The ground is yours, for today.'
      : '<b>Zu wenig.</b> ' + totals.total + ' VP, and you needed ' + vpRequirement() + '. This ground stays ours.');
    infoPopup({
      title: result === 'won' ? 'Mission Accomplished' : 'Mission Failed',
      bodyHtml: 'Ending: ' + reason + '. Final VP: ' + totals.gained + ' gained &minus; ' + totals.lost + ' lost = <b>' + totals.total + '</b> (need ' + vpRequirement() + '). Result: <b>' + result.toUpperCase() + '</b>.' +
        (vpTargetNote() ? '<br><br><span style="color:var(--text-label); font-size:12px;">' + vpTargetNote() + '</span>' : ''),
    }, function () {
      var banner = document.getElementById('status-banner');
      banner.className = result === 'won' ? 'win' : 'lose';
      banner.textContent = result === 'won' ? 'MISSION WON (' + totals.total + ' VP)' : 'MISSION LOST (' + totals.total + ' VP)';
      document.getElementById('tb-phase').textContent = result === 'won' ? 'Won' : 'Lost';
      logHeader('MISSION ' + result.toUpperCase() + ' — ' + totals.total + ' VP (' + reason + ').');
    });
  }

  // ---------------------------------------------------------------------
  // Save / Load — localStorage for a quick same-browser save, plus export/import to a JSON
  // file for portability (same "no server, client-side file only" constraint as Download Log).
  //
  // Every module-level piece of real game state (usSoldiers, germans, opsState, vpState, track,
  // etc.) is plain JSON-safe data — no DOM nodes or functions live on these objects — so a
  // straight JSON.stringify/parse round-trip is enough for the DATA. The DOM (counters, entry
  // markers, Event marker overlays, which HUD sections are visible) is never serialized; it's
  // rebuilt fresh from the restored data by applySavedState(), the same way startOperations()/
  // startActionRound()/etc. build it fresh from scratch today.
  //
  // Saving is only allowed at a genuinely quiescent moment — no popup open, and not mid-way
  // through picking a Move destination (an uncommitted UI selection, not real state) — because
  // the game is a step-by-step popup chain (pendingSteps/currentHex/currentParagraph) with no
  // well-defined "resume" point mid-chain. Every point where the player is actually waiting to
  // choose something (soldier selection, an entry hex, an Action Round's action panel) already
  // has no popup open, so this isn't a real restriction on normal play.
  // Multiple slots, most-recent-last, capped at MAX_SAVES — saveGame() evicts the oldest (index 0)
  // once the cap is exceeded. Each entry IS a serializeState() snapshot (it already carries its
  // own savedAt/version), so there's no separate metadata wrapper to keep in sync.
  var SAVE_LIST_KEY = 'ambush-mission1-saves-v1';
  var MAX_SAVES = 10;
  // Any queue item, modal or a resolution-card line: mid-chain is never a safe save point.
  function popupOpen() { return !!Dialogs.current; }
  function isSafeToSave() {
    if (popupOpen()) return false;
    if (phase === 'squadgen' || phase === 'over') return false;
    if (phase === 'round' && document.getElementById('cancelMoveBtn').style.display !== 'none') return false; // mid Move destination-pick
    return true;
  }
  function serializeState() {
    return {
      version: 1, savedAt: Date.now(), phase: phase, difficulty: difficulty,
      usSoldiers: usSoldiers, germans: germans, opsState: opsState, vpState: vpState,
      track: track, currentActorId: currentActorId, roundNum: roundNum,
      currentGermanIdsThisRound: currentGermanIdsThisRound, entryIndex: entryIndex, selectedId: selectedId,
    };
  }
  function loadSaveList() {
    try { var raw = localStorage.getItem(SAVE_LIST_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }
  function describeSave(state) {
    var totals = V.computeVPTotal(state.vpState);
    var where = state.phase === 'entry' ? 'Entry placement'
      : state.phase === 'movement' ? 'Operations'
      : state.phase === 'round' ? 'Action Round ' + (state.roundNum || '?')
      : state.phase;
    return where + ' &middot; ' + totals.total + ' VP';
  }
  function saveGame() {
    if (!isSafeToSave()) { Toasts.show('Can\'t save mid-step — finish the current action first.'); return false; }
    var list = loadSaveList();
    list.push(serializeState());
    while (list.length > MAX_SAVES) list.shift(); // oldest first in, oldest first evicted
    try {
      localStorage.setItem(SAVE_LIST_KEY, JSON.stringify(list));
      Toasts.show('Game saved (' + list.length + '/' + MAX_SAVES + ').', { kind: 'success' });
      return true;
    } catch (e) { Toasts.show('Save failed: ' + e.message); return false; }
  }
  function applySavedState(data) {
    // A fresh page load auto-starts Squad Generation (its first popup can already be open by the
    // time the player clicks Load instead of playing through it) — force-close it so its callback
    // chain can never fire afterward and act on the state we're about to replace.
    Dialogs.reset();
    Object.keys(counterEls).forEach(function (k) { counterEls[k].remove(); }); counterEls = {};
    clearDestMarks();
    Object.keys(entryEls).forEach(function (k) { entryEls[k].remove(); }); entryEls = {};
    Object.keys(eventMarkerEls).forEach(function (k) { eventMarkerEls[k].remove(); }); eventMarkerEls = {};

    usSoldiers = data.usSoldiers; germans = data.germans; phase = data.phase;
    // `aware` (§6/5) postdates this field's introduction — a save written before it has none, so
    // default to already-aware rather than false: the concept didn't exist yet at save time, and
    // those soldiers were already acting normally, not sitting immobile.
    usSoldiers.forEach(function (s) { if (s.aware === undefined) s.aware = true; });
    // Saves written before Easy mode existed carry no difficulty; they were all played on the
    // rulebook settings, so Normal is the correct default rather than a guess.
    setDifficulty(data.difficulty === D.EASY ? D.EASY : D.NORMAL);
    opsState = data.opsState; vpState = data.vpState; track = data.track;
    // germanActivations/awards postdate the §2/1 VP fix — a save written before it has neither,
    // so default them rather than letting computeVPTotal reduce over undefined.
    vpState.germanActivations = vpState.germanActivations || [];
    vpState.awards = vpState.awards || [];
    vpState.germanDefeats = vpState.germanDefeats || [];
    vpState.usCasualties = vpState.usCasualties || [];
    currentActorId = data.currentActorId; roundNum = data.roundNum || 0;
    currentGermanIdsThisRound = data.currentGermanIdsThisRound || [];
    entryIndex = data.entryIndex || 0; selectedId = data.selectedId || null;

    usSoldiers.forEach(function (s) {
      if (s.exited || !s.hexId) return;
      var el = document.createElement('div');
      el.className = 'counter';
      el.dataset.soldierId = s.id;
      placeEl(el, s.hexId);
      el.innerHTML = '<img src="' + currentImgFor(s) + '">';
      el.addEventListener('click', function (e) {
        e.stopPropagation();
        if (phase === 'movement') {
        // Clicking an already-selected soldier opens the inspector instead of re-selecting him
        // (a no-op otherwise) — still "click on him" per the user's own ask, without turning
        // every ordinary movement-planning click into an interrupting modal.
        if (selectedId === s.id) { showSoldierInspector(s.id); return; }
        selectSoldier(s.id);
        return;
      }
        if (phase === 'round') showSoldierInspector(s.id);
      });
      canvas.appendChild(el);
      counterEls[s.id] = el;
      updateCounterVisual(s);
    });
    Object.keys(germans).forEach(function (cardId) {
      var g = germans[cardId];
      var el = document.createElement('div');
      el.className = 'counter enemy';
      el.dataset.soldierId = g.id;
      placeEl(el, g.hexId);
      el.innerHTML = '<img src="' + currentImgFor(g) + '">';
      el.addEventListener('click', function (e) { e.stopPropagation(); showSoldierInspector(g.id); });
      canvas.appendChild(el);
      counterEls[g.id] = el;
      updateCounterVisual(g);
    });
    Object.keys(opsState.eventMarkers || {}).forEach(function (hexId) { placeEventMarkerEl(hexId); });

    renderRoster();
    renderVP();

    document.getElementById('roster-sec').style.display = '';
    document.getElementById('movement-sec').style.display = 'none';
    document.getElementById('action-sec').style.display = 'none';
    document.getElementById('track-sec').style.display = 'none';
    document.getElementById('round-sec').style.display = 'none';
    document.getElementById('cancelMoveBtn').style.display = 'none';

    if (phase === 'entry') {
      document.getElementById('tb-phase').textContent = 'Entry Placement';
      ENTRY_HEXES.forEach(function (hexId) {
        var el = document.createElement('div');
        el.className = 'entry-hex';
        placeEl(el, hexId);
        el.title = hexId;
        el.addEventListener('click', function (e) { e.stopPropagation(); placeNextSoldier(hexId); });
        canvas.appendChild(el);
        entryEls[hexId] = el;
      });
      promptPlaceSoldier();
    } else if (phase === 'movement') {
      document.getElementById('tb-phase').textContent = 'Operations';
      document.getElementById('movement-sec').style.display = '';
      if (activeUS().length) selectSoldier(selectedId && findSoldier(selectedId) ? selectedId : activeUS()[0].id);
    } else if (phase === 'round') {
      document.getElementById('tb-phase').textContent = 'Round ' + roundNum;
      document.getElementById('track-sec').style.display = '';
      if (Sched.isRoundComplete(track)) {
        renderTrack();
        document.getElementById('round-sec').style.display = '';
        document.getElementById('tb-phase').textContent = 'Round ' + roundNum + ' complete';
        document.getElementById('status-banner').textContent = 'Round complete. Continue the fight.';
      } else {
        document.getElementById('status-banner').textContent = 'Contact! Action Round in progress.';
        driveNext();
      }
    }
    logHeader('Game loaded' + (data.savedAt ? ' (saved ' + new Date(data.savedAt).toLocaleString() + ')' : '') + '.');
  }
  // Lets the player pick which of the (up to MAX_SAVES) saved games to resume, newest first,
  // each row showing when it was saved and a short "where you were" descriptor.
  // onCancel: optional — called if the player backs out without loading anything. The mid-game
  // "Load" button leaves onCancel unset (there's already a live game underneath to fall back to);
  // the startup dialog passes one so Cancel returns to the start-screen choice instead of leaving
  // the game un-started with nothing on screen.
  function openLoadDialog(onCancel) {
    var list = loadSaveList();
    if (!list.length) { Toasts.show('No saved games found.'); if (onCancel) onCancel(); return; }
    Dialogs.push({
      title: 'Load Game', variant: 'wide', allowEnter: false, allowEscape: true, escapeButtonId: 'cancel',
      buttons: [{ id: 'cancel', label: 'Cancel' }],
      render: function (ctx) {
        var rows = list.slice().reverse(); // newest first
        var html = rows.map(function (state, i) {
          var idx = list.length - 1 - i;
          return '<div class="save-row" data-idx="' + idx + '">' +
            '<span class="save-ts">' + new Date(state.savedAt).toLocaleString() + '</span>' +
            '<span class="save-desc">' + describeSave(state) + '</span></div>';
        }).join('');
        ctx.bodyEl.innerHTML = '<div class="save-list">' + html + '</div>';
        Array.prototype.forEach.call(ctx.bodyEl.querySelectorAll('.save-row'), function (row) {
          row.addEventListener('click', function () { applySavedState(list[parseInt(row.dataset.idx, 10)]); });
        });
      },
      onButton: function (id, ctx) { ctx.close(); },
      onClose: function () { if (onCancel) onCancel(); }, // fires on Cancel/Escape only — a real
      // row pick goes through applySavedState()'s Dialogs.reset(), which bypasses onClose entirely.
    });
  }
  document.getElementById('saveGameBtn').addEventListener('click', saveGame);
  document.getElementById('loadGameBtn').addEventListener('click', function () { openLoadDialog(); });

  // ---------------------------------------------------------------------
  // Start screen — shown once, on page load, instead of jumping straight into Squad Generation.
  // ---------------------------------------------------------------------
  function startGameFlow() {
    var saves = loadSaveList();
    Dialogs.push({
      title: 'Ambush! Digital — Mission 1', variant: 'narrow', allowEnter: true, allowEscape: false,
      buttons: [
        { id: 'normal', label: 'Start — Normal', variant: 'amber' },
        { id: 'easy', label: 'Start — Easy' },
        { id: 'load', label: 'Load Game', disabled: !saves.length },
      ],
      render: function (ctx) {
        // Spell out exactly what Easy changes before the player picks. The mode is a set of
        // stated, visible adjustments, not a vague "easier" — so it is described up front and
        // repeated in the Objectives window for the rest of the mission.
        ctx.bodyEl.innerHTML = '<div class="step-context">' +
          '<b>Normal</b> &mdash; ' + D.settings(D.NORMAL).blurb +
          ' Victory target <b>' + V.scaleRequirement(vpReachable.ceiling, VP_REQUIREMENT_RULEBOOK, D.vpMargin(D.NORMAL)).requirement + ' VP</b>.' +
          '<br><br><b>Easy</b> &mdash; ' + D.settings(D.EASY).blurb +
          ' Victory target <b>' + V.scaleRequirement(vpReachable.ceiling, VP_REQUIREMENT_RULEBOOK, D.vpMargin(D.EASY)).requirement + ' VP</b>.' +
          '<ul style="text-align:left; margin:8px 0 0; padding-left:20px; line-height:1.6;">' +
          D.describe(D.EASY).map(function (line) { return '<li>' + line + '</li>'; }).join('') +
          '</ul><br>' +
          (saves.length ? saves.length + ' saved game' + (saves.length === 1 ? '' : 's') + ' available.' : 'No saved games found.') +
          '</div>';
      },
      onButton: function (id, ctx) { ctx.close(id); },
      onClose: function (id) {
        if (id === 'load') { openLoadDialog(function () { startGameFlow(); }); return; }
        setDifficulty(id === 'easy' ? D.EASY : D.NORMAL);
        startSquadGeneration();
      },
    });
  }
  document.getElementById('exportSaveBtn').addEventListener('click', function () {
    if (!isSafeToSave()) { Toasts.show('Can\'t save mid-step — finish the current action first.'); return; }
    var blob = new Blob([JSON.stringify(serializeState(), null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ambush-mission1-save-' + Date.now() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  document.getElementById('importSaveBtn').addEventListener('click', function () { document.getElementById('importSaveFile').click(); });
  document.getElementById('importSaveFile').addEventListener('change', function (e) {
    var file = e.target.files[0];
    e.target.value = ''; // allow re-importing the same filename later
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (err) { Toasts.show('That file is not a valid save.'); return; }
      applySavedState(data);
    };
    reader.readAsText(file);
  });

  // Debugging aid — dumps the visible play log plus a full state snapshot to a downloadable
  // .txt file. No server to persist to (this is a static file:// app), so a client-side download
  // is the whole mechanism.
  document.getElementById('downloadLogBtn').addEventListener('click', function () {
    var lines = Array.prototype.map.call(document.querySelectorAll('#combatlog .log-line'), function (el) { return el.textContent; });
    var text = 'Ambush! Digital — Mission 1 play log — ' + new Date().toISOString() + '\n\n' +
      lines.join('\n') + '\n\n---- state dump ----\n' + JSON.stringify(window.__mission1Debug.state(), null, 2) + '\n';
    var blob = new Blob([text], { type: 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'ambush-mission1-log-' + Date.now() + '.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });
  document.getElementById('resetBtn').addEventListener('click', function () { location.reload(); });
  // ---------------------------------------------------------------------
  // Automation seam (v2 task 2, docs/02_HANDOFF.md). tools/bot/ plays ONLY through these five
  // calls plus select(); it never reads or clicks the page's markup. When the presentation
  // rewrite changes the DOM, it keeps these answering the same shapes and the bot, pacing.py and
  // autopsy.py keep working unchanged — that is the contract. Every action runs the same
  // handler a player's click runs.
  //
  //   pendingDecision()  the open dialog as data, or null when the board is waiting:
  //                      { kind:'dialog', title, text, phase, buttons:[{id,label,disabled}],
  //                        rows:[{idx,text,odds}] }
  //   choose(i)          pick row i of the open dialog
  //   press(id)          a dialog button while a dialog is open, otherwise a board verb (VERBS);
  //                      false when it is not available (disabled, as a click would be)
  //   clickHex(hexId)    the decision the map is offering at that hex: an entry hex during
  //                      placement, otherwise a destination marker (move, combo move, drag)
  //   select(soldierId)  Operations: make this soldier the one the panel acts for
  //   board()            the state the player can see: phase, soldiers, Germans, VP panel,
  //                      offered destinations/entry hexes, and verbs {name: enabled}
  //   dialogLog()        every dialog presented so far: { title, rows, modeless, phase } (pacing.py)
  //   setPresentation()  kept for old callers: always 'cards', the only presentation;
  //                      pendingDecision() answers { kind:'resolving' } while a card line plays
  // ---------------------------------------------------------------------
  // Verb name -> [panel section, button]. Names are the contract; element ids are this page's.
  var VERBS = {
    'stance:standing': ['movement-sec', 'stance-standing'], 'stance:crouching': ['movement-sec', 'stance-crouching'],
    'stance:prone': ['movement-sec', 'stance-prone'], exitMap: ['movement-sec', 'exitMapBtn'],
    clearJamOps: ['movement-sec', 'clearJamOpsBtn'],
    move: ['action-sec', 'moveBtn'], fireAimed: ['action-sec', 'fireAimed'], fireSnap: ['action-sec', 'fireSnap'],
    assault: ['action-sec', 'assaultBtn'], grenade: ['action-sec', 'grenadeBtn'], drag: ['action-sec', 'dragBtn'],
    giveTurn: ['action-sec', 'giveTurnBtn'], makeAware: ['action-sec', 'makeAwareBtn'],
    changeStance: ['action-sec', 'changeStanceBtn'], prepareWeapon: ['action-sec', 'prepareWeaponBtn'],
    pickup: ['action-sec', 'pickupBtn'], clearJam: ['action-sec', 'clearJamBtn'], pass: ['action-sec', 'passTurn'],
    cancelMove: ['action-sec', 'cancelMoveBtn'],
    newRound: ['round-sec', 'newRoundBtn'],
  };
  function verbsOffered() {
    var out = {};
    Object.keys(VERBS).forEach(function (name) {
      var sec = document.getElementById(VERBS[name][0]), btn = document.getElementById(VERBS[name][1]);
      if (!sec || !btn || sec.style.display === 'none') return;
      if (name === 'cancelMove' && btn.style.display === 'none') return;
      out[name] = !btn.disabled;
    });
    return out;
  }
  var automation = {
    pendingDecision: function () {
      var spec = Dialogs.current;
      if (!spec) return null;
      // A resolution-card line is resolving, not asking: nothing to decide yet, but the board
      // is not waiting for the player either.
      if (spec.modeless) return { kind: 'resolving', title: spec.title || '' };
      return {
        kind: 'dialog', title: spec.title || '', text: Dialogs.bodyText(),
        phase: document.getElementById('tb-phase').textContent,
        buttons: (spec.buttons || []).map(function (b) { return { id: b.id, label: b.label, disabled: !!b.disabled }; }),
        rows: (spec.choices || []).map(function (c, i) { return { idx: i, text: c.text, odds: c.odds }; }),
      };
    },
    choose: function (i) {
      var spec = Dialogs.current;
      if (!spec || !spec.choices || !spec.choices[i]) throw new Error('choose(' + i + '): no such row in the open dialog');
      spec.choices[i].pick();
      return true;
    },
    press: function (id) {
      if (Dialogs.current) return Dialogs.press(id);
      if (id === 'resultDone') return Resolve.pressDone();
      var v = VERBS[id];
      if (!v) throw new Error('press(' + id + '): no dialog is open and that is not a verb');
      var btn = document.getElementById(v[1]);
      if (btn.disabled) return false;
      btn.click(); // the button's own handler — same code path as the player's click
      return true;
    },
    clickHex: function (hexId) {
      if (phase === 'entry' && entryEls[hexId]) { placeNextSoldier(hexId); return true; }
      if (destPicks[hexId]) { destPicks[hexId](); return true; }
      // Task 6: in Operations any hex with a wall-aware route is a destination — the soldier
      // walks it and stops when something happens.
      if (phase === 'movement' && selectedSoldier() && walkRoute(hexId)) return true;
      throw new Error('clickHex(' + hexId + '): the map offers no decision there');
    },
    pickActor: function (soldierId) { return pickActor(soldierId); },
    select: function (soldierId) {
      if (phase !== 'movement' || !counterEls[soldierId] || !findSoldier(soldierId)) return false;
      if (selectedId !== soldierId) selectSoldier(soldierId);
      return true;
    },
    board: function () {
      var shownSel = selectedId && counterEls[selectedId] && counterEls[selectedId].classList.contains('selected') ? selectedId : null;
      return {
        phase: phase, roundNum: roundNum, condition: opsState ? opsState.condition : null,
        currentActorId: currentActorId, selectedId: shownSel, lastSelectedId: lastSelectedId,
        us: usSoldiers.map(function (s) {
          return { id: s.id, letter: s.letter, hexId: s.hexId, stance: s.stance, status: s.status,
            isActive: !!s.isActive, exited: !!s.exited, aware: !!s.aware, mpa: s.mpa,
            weaponId: s.weaponId, PC: s.PC, WS: s.WS, IN: s.IN,
            jammed: !!s.weaponJammed, broken: !!s.weaponBroken };
        }),
        germans: Object.keys(germans).map(function (k) {
          var g = germans[k];
          return { id: g.id, hexId: g.hexId, status: g.status, isActive: !!g.isActive, role: g.card.Role };
        }),
        vp: { gained: shownVP.gained, lost: shownVP.lost, total: shownVP.total, need: shownVP.need },
        casualties: vpState.usCasualties, activations: vpState.germanActivations.length,
        dests: Object.keys(destPicks),
        entryHexes: phase === 'entry' ? Object.keys(entryEls) : [],
        verbs: verbsOffered(),
        // v3: the soldiers the player may pick (§6/1)
        pickable: picking ? picking.ids.slice() : [],
        presentation: 'cards',
        banner: document.getElementById('status-banner').textContent || '',
      };
    },
    dialogLog: function () { return dialogLog.slice(); },
    setPresentation: function () { return 'cards'; },
  };

  // The console seam for tools/: the automation calls above, plus the hooks tools/bot and
  // tools/repro_save.py use (R2 removed the 36 *ForTesting hooks nothing called). Each drives the
  // same production function a player's action runs.
  window.__mission1Debug = {
    pendingDecision: automation.pendingDecision, choose: automation.choose, press: automation.press,
    clickHex: automation.clickHex, select: automation.select, pickActor: automation.pickActor, board: automation.board,
    dialogLog: automation.dialogLog, setPresentation: automation.setPresentation,
    tryExit: function () { var s = selectedSoldier(); if (s) tryExit(s); },
    // currentActorId matters as much as the track itself for anything driving a Round from
    // outside: the AR Track says whose turn it SHOULD be, this says whose turn the game is
    // actually presenting. Its absence silently broke the automated player (tools/bot/), which
    // read undefined and so could never identify the acting soldier — reducing every Rounds turn
    // to "fire or pass" and freezing 27 of 30 test games in an endless firefight.
    state: function () { return { phase: phase, usSoldiers: usSoldiers, germans: germans, vpState: vpState, opsState: opsState, track: track, roundNum: roundNum, currentActorId: currentActorId }; },
    // Passes hexId straight through as eff.hex, the same shape a real activate_german effect
    // uses — exercises the exact production code path instead of spawning at a placeholder and
    // patching the position afterward, which raced against the reveal pop-up/scroll once
    // activateGermansSequentially stopped being fully synchronous.
    spawnGermanForTesting: function (cardId, hexId) {
      activateGermansSequentially([{ ids: [cardId.replace(/^GE /, '').replace(/\/.*/, '')], hex: hexId, stance: 'crouching' }], 0, function () {});
    },
    saveGame: saveGame,
    listSaves: loadSaveList,
    loadSaveAtIndex: function (i) { var list = loadSaveList(); if (list[i] !== undefined) applySavedState(list[i]); },
    isSafeToSave: isSafeToSave,
    // Console-only verification hook for §13/2's Port Box loss on wound (task 61) — drives the
    // real applyDamage('W') path directly, since reaching a specific soldier's wound naturally
    // depends on random fire-combat outcomes.
    applyWoundForTesting: function (soldierId) { var s = findSoldier(soldierId); if (s) applyDamage(s, 'W', 'test'); },
    groundItemsForTesting: function () { return groundItems; },
    // Wall-aware Operations pathfinding, exposed for the automated player. The bot steps toward a
    // goal by picking whichever adjacent hex is nearest by raw hex distance, which walks it
    // straight into a building wall and oscillates for ever — K12 and L12 are both "closer to
    // K13" than each other, and neither can actually reach it. Rather than teach the bot the
    // wall rules (a second, driftable copy of them), this hands it the game's own answer.
    // Returns the next hex to step to, or null if the goal is unreachable.
    operationsNextStepForTesting: function (fromHexId, goalHexId) {
      var route = operationsRoute(fromHexId, goalHexId); // same search, now shared with the walk
      return route && route.length ? route[0] : null;
    },
  };

  renderVP(); // populates the Objectives float window body even if it's opened before any game starts
  // v3: the mission card on the shell's mission select picks the difficulty (brief, Phase 2), so
  // the shell starts the mission; v2's start dialog (startGameFlow) is not shown.
  window.AmbushMission = {
    start: function (level) {
      setDifficulty(level === 'easy' ? D.EASY : D.NORMAL);
      startSquadGeneration();
    },
    // v3 punch list 2 (stack.js): everything in one hex, what each token carries, and what the
    // player may do from there: pick/select a soldier, or (in a Round) have the current actor take
    // an item, the same Pick Up / Exchange code as v2's button (§5/3, §6/7).
    stack: function (hexId) {
      var actor = phase === 'round' && currentActorId && !picking ? findSoldier(currentActorId) : null;
      if (actor && actor.side === 'german') actor = null;
      var pickupBtn = document.getElementById('pickupBtn');
      var canTake = !!actor && actor.hexId === hexId && !pickupBtn.disabled && !Dialogs.current &&
        document.getElementById('action-sec').style.display !== 'none';
      var offers = canTake ? pickupOffers(actor) : [];
      function gear(t) {
        if (t.side === 'german') return t.weaponId ? [equipmentName(t.weaponId)] : [];
        if (!t.inventory) return [];
        // an Ammo Box holds a clip for a weapon, or a grenade
        return EQ.carriedItemIds(t.inventory).map(equipmentName)
          .concat(t.inventory.ammoBoxes.filter(Boolean).map(function (id) { return id === 'gren' ? 'Grenade' : 'Clip: ' + equipmentName(id); }));
      }
      return {
        hexId: hexId,
        actor: actor ? { id: actor.id, name: actor.name, here: actor.hexId === hexId } : null,
        takeWhy: !actor ? '' : actor.hexId !== hexId ? actor.name + ' is not in this hex.' :
          canTake ? '' : (actor.stance !== 'standing' && actor.stance !== 'crouching') ? 'He must be standing or crouching (§6/7).' :
          (actor.stance === 'standing' && allInHex(hexId).some(function (t) { return t.id !== actor.id && !t.isActive; }))
            ? 'Taking equipment from an inactive soldier needs him crouching (§6/7).' :
          allInHex(hexId).some(function (t) { return t.side !== actor.side && t.isActive && t.weaponId; })
            ? 'A German keeps his weapon until he is killed, incapacitated or captured (§6/7, §14).' : 'Nothing here he can take.',
        tokens: allInHex(hexId).filter(function (t) { return !t.exited && (t.side !== 'german' || counterEls[t.id]); }).map(function (t) {
          var act = phase === 'movement' && t.side !== 'german' && t.isActive ? 'select' :
            picking && picking.ids.indexOf(t.id) !== -1 ? 'pick' : '';
          return { id: t.id, name: t.name, letter: t.letter, side: t.side, stance: t.stance, status: t.status,
            isActive: !!t.isActive, img: currentImgFor(t), gear: gear(t), act: act,
            current: t.id === currentActorId, selected: t.id === selectedId };
        }),
        ground: (groundItems[hexId] || []).map(function (it) { return equipmentName(it.id); }),
        offers: offers.map(function (o, i) { return { idx: i, from: o.from, item: o.item, label: stripTags(o.label) }; }),
      };
    },
    hexOf: function (id) { var t = findSoldier(id); return t ? t.hexId : null; },
    actOn: function (id) {
      if (picking) return pickActor(id);
      if (phase === 'movement' && counterEls[id] && findSoldier(id).side !== 'german') { selectSoldier(id); return true; }
      return false;
    },
    take: function (idx) {
      var actor = findSoldier(currentActorId), st = this.stack(actor.hexId);
      if (!st.offers[idx]) return false;
      disableActionButtons();
      resolvePickup(actor, pickupOffers(actor)[idx]);
      return true;
    },
    // v2's own start dialog (Normal / Easy / Load): index.html?play=ask, so the bot picks the level
    // exactly as it does on v2's page
    ask: function () { startGameFlow(); },
    // v3 Phase 6 (lesson.js): a lesson opens on a saved position (a fixture, the same shape a save
    // has) and rolls from its own seeded stream; the bot's seam reads the board while it runs.
    lesson: {
      load: function (data, rng) {
        lessonRng = rng || null;
        applySavedState(JSON.parse(JSON.stringify(data)));
        // v3 opens Operations with nobody selected (punch list 3); a load selects the first soldier
        if (phase === 'movement') deselect();
      },
      board: automation.board, pending: automation.pendingDecision,
      // the German side, revealed the way a paragraph's activate_german effect reveals it
      activate: function (cardId, hexId, stance) {
        activateGermansSequentially([{ ids: [String(cardId)], hex: hexId, stance: stance || 'crouching' }], 0, function () {});
      },
      // Phase 7b (chapter 3): what the map says about a hex, from the functions the game itself
      // asks (the movement chart, the fire chart's terrain row, traceLOS), so a puzzle's answer
      // and its refusal are the engine's, never a copy. soldierId: whose move and stance; targetId:
      // whom he would look at from there.
      facts: function (hexId, soldierId, targetId) {
        var s = soldierId ? findSoldier(soldierId) : null, t = targetId ? findSoldier(targetId) : null;
        var terrain = REAL_TERRAIN[hexId], row = terrainRowFor(hexId), mod = {};
        ['standing', 'crouching', 'prone'].forEach(function (st) {
          mod[st] = FC.canBeFiredAt(CHART.FIRE_MODS_TERRAIN, row, st) ? FC.resolveTerrainMod(CHART.FIRE_MODS_TERRAIN, row, st) : null;
        });
        var d = s && phase === 'round' ? roundLegalDestinations(s)[hexId] : null;
        var out = { hex: hexId, terrain: terrain, label: TERRAIN_LABELS[terrain] || terrain || 'unknown',
          mp: M.mpCost(terrain), reach: d ? d.cost : null, mpa: s ? s.mpa : null, row: row, mod: mod,
          cover: row === 0 ? 'no cover' : row <= 3 ? 'light cover' : 'good cover',
          adjacent: !!(s && FC.hexDistance(s.hexId, hexId) === 1) };
        // Phase 8b (chapter 5): the hex's cell on the mission card, read by the engine's own parser
        var cid = G.printedIdToCartridgeId(hexId), grid = opsState && MISSION_CARDS['1'][String(opsState.condition)];
        var raw = cid && grid ? grid[cid] : null, cell = Ops.parseCellValue(raw);
        out.cell = { raw: raw, type: cell.type, paragraph: cell.paragraph || null, sighting: cell.sighting || null,
          occurred: !!(cell.sighting && opsState.sightingsOccurred[cell.sighting]), marker: !!(opsState && opsState.eventMarkers[hexId]) };
        if (t) {
          var r = LOS.traceLOS({ fromId: hexId, toId: t.hexId, elevationByHexId: LOS_ELEV, terrainByHexId: LOS_TERRAIN,
            edgeFeatures: edgeFeatures, fromStance: s ? s.stance : 'standing', toStance: t.stance });
          var bt = r.hexId ? REAL_TERRAIN[r.hexId] : null;
          out.los = { clear: !r.blocked, block: r.hexId || null, blockLabel: bt ? (TERRAIN_LABELS[bt] || bt) : null,
            reason: r.reason || null, path: r.path || [], range: FC.hexDistance(hexId, t.hexId) };
        }
        return out;
      },
      sight: function (fromHex, toHex, fromStance, toStance) { return Sight.draw(fromHex, toHex, fromStance, toStance); },
      unsight: function () { Sight.clear(); },
    },
  };
})();

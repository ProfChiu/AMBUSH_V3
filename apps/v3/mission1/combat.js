'use strict';
// mission1/combat.js (11 of 13) — fire, hidden fire, grenade and assault chains, damage, capture, round end, exit, victory. Stage A cut of mission1.js lines 4734-5323 (docs/REFACTOR_MAP.md 5.4).
  // ---------------------------------------------------------------------
  // One to-hit card (docs/REFACTOR_MAP.md 4.3 item 1): one d10, read once per roll the same way
  // by the card's result line, the log, the board effect and what follows.
  //   o.actor, o.title, o.variant, o.contextHtml: the rollPopup's own fields. o.strip defaults to
  //     hitStrip(o.chance).
  //   o.chance: the Hit Chance; a roll is 'hit' or 'miss' by FC.resolveHitRoll.
  //   o.text {hit, miss}: the card's result line (default "HIT." / "Miss.").
  //   o.log: the log line's label ("To-hit"); o.logWords {hit, miss} (default HIT / miss). The line
  //     reads "<log>: <roll> → <word>."
  //   o.fx {hex, mark, loud}: when the die lands, mark() (the tracer / arc / lunge, read then)
  //     resolves, the die floats over hex, and a loud one sounds and shakes or badges MISS.
  //   o.result(roll): an outcome key in place of hit / miss (clear jam's clear / jam / break). Then
  //     onHit(key) is the one continuation and onMiss is left out.
  // ---------------------------------------------------------------------
  var HIT_TEXT = { hit: '<b style="color:var(--clear)">HIT</b>.', miss: 'Miss.' };
  var HIT_WORDS = { hit: '<b>HIT</b>', miss: 'miss' };
  function toHitCard(o, onHit, onMiss) {
    var result = o.result || function (roll) { return FC.resolveHitRoll(o.chance, roll) === 'hit' ? 'hit' : 'miss'; };
    var text = o.text || HIT_TEXT, words = o.logWords || HIT_WORDS, fx = o.fx;
    rollPopup({ actor: o.actor, title: o.title, kind: 'single', variant: o.variant, contextHtml: o.contextHtml,
      strip: o.strip !== undefined ? o.strip : o.result ? undefined : hitStrip(o.chance),
      explain: function (roll) { return text[result(roll)]; },
      logText: function (roll) { return o.log + ': <span class="roll">' + roll + '</span> &rarr; ' + words[result(roll)] + '.'; },
      fxLanded: fx && function (roll) {
        var hit = result(roll) === 'hit';
        if (fx.mark) fx.mark().resolve(hit ? 'hit' : 'miss');
        FX.floatDie(fx.hex, roll, hit ? 'hit' : 'miss');
        if (fx.loud) { FX.sound(hit ? 'hit' : 'miss'); if (hit) FX.shake(); else FX.badge(fx.hex, 'MISS', 'neutral'); }
      },
    }, function (roll) {
      var r = result(roll);
      if (!onMiss) onHit(r); else if (r === 'hit') onHit(); else onMiss();
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
      toHitCard({ actor: { left: firer, right: target }, title: 'Hit Chance & To-Hit', variant: 'wide', contextHtml: breakdown,
        chance: b.clamped, log: 'To-hit',
        fx: { hex: target.hexId, mark: function () { return tracer; }, loud: true },
      }, damageStep, ammoStep);
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
      toHitCard({ actor: target, title: 'Hit Chance & To-Hit', variant: 'wide', contextHtml: hitBreakdownHtml(b),
        chance: b.clamped, log: 'Hidden rifleman, to-hit', fx: { hex: target.hexId, loud: true },
      }, damageStep, onDone);
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


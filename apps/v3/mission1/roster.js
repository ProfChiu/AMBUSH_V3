// mission1/roster.js (4 of 13) — map rendering, counters, game state vars, finders, kit and tokens, roster/VP render. Stage A cut of mission1.js lines 1306-1581 (docs/REFACTOR_MAP.md 5.4).
// Exports to M1 (25): activeGermans, activeUS, addGroundItem, allGermans, boxesFor, canvas, counterEls,
//   currentImgFor, destEls, entryEls, equipmentName, eventMarkerEls, findSoldier, highlightActor, kitHtml,
//   makeCounter, nameFor, pctPos, placeEl, placeEventMarkerEl, renderRoster, renderVP, scrollMapTo, shownVP,
//   updateCounterVisual
// Uses from M1:
//   core: state
//   present: FX, Resolve, fmtSigned
//   contact: showSoldierInspector
// Still global (their files are not wrapped yet):
//   core: D, EQ, FloatDialogs, G, SQCHART, V, WEAPONS_REQUIRING_PREPARATION, img, vpRequirement, vpTargetNote,
//   weaponById
//   operations: selectSoldier
(function () {
  'use strict';
  var M1 = window.AmbushM1;
  // Exported functions (hoisted, so they are on M1 before any line below runs).
  M1.activeGermans = activeGermans; M1.activeUS = activeUS; M1.addGroundItem = addGroundItem;
  M1.allGermans = allGermans; M1.boxesFor = boxesFor; M1.currentImgFor = currentImgFor;
  M1.equipmentName = equipmentName; M1.findSoldier = findSoldier; M1.highlightActor = highlightActor;
  M1.kitHtml = kitHtml; M1.makeCounter = makeCounter; M1.nameFor = nameFor; M1.pctPos = pctPos;
  M1.placeEl = placeEl; M1.placeEventMarkerEl = placeEventMarkerEl; M1.renderRoster = renderRoster;
  M1.renderVP = renderVP; M1.scrollMapTo = scrollMapTo; M1.updateCounterVisual = updateCounterVisual;
  // ---------------------------------------------------------------------
  // Map rendering
  // ---------------------------------------------------------------------
  var canvas = M1.canvas = document.getElementById('world');
  M1.counterEls = {};
  M1.destEls = {};
  M1.entryEls = {};
  M1.eventMarkerEls = {};

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
    var d = M1.Resolve.T(420);
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
    if (M1.eventMarkerEls[hexId]) return; // already marked
    var el = document.createElement('div');
    el.className = 'event-marker';
    placeEl(el, hexId);
    el.title = 'Event marker — ' + hexId;
    canvas.appendChild(el);
    M1.eventMarkerEls[hexId] = el;
  }
  // #map-viewport only scrolls vertically (overflow-x is hidden — the canvas is always full
  // width), so this centers the target hex in the visible vertical band.
  // Follow only when off-screen (task 4); v1's always-re-centre behaviour left with Classic.
  function scrollMapTo(hexId) { M1.FX.ensureVisible([hexId]); }
  // The scan, the star, the tints and the counter itself come from counters.js (AmbushCounters).
  function currentImgFor(s) { return AmbushCounters.srcFor(s); }
  // A click on a counter: a German opens the inspector; a US soldier is selected in Operations
  // (a click on the one already selected opens the inspector) and inspected in a Round.
  function counterClick(s) {
    if (s.side === 'german') { M1.showSoldierInspector(s.id); return; }
    if (M1.state.phase === 'movement') {
      // Clicking an already-selected soldier opens the inspector instead of re-selecting him
      // (a no-op otherwise) — still "click on him" per the user's own ask, without turning
      // every ordinary movement-planning click into an interrupting modal.
      if (M1.state.selectedId === s.id) { M1.showSoldierInspector(s.id); return; }
      selectSoldier(s.id);
      return;
    }
    if (M1.state.phase === 'round') M1.showSoldierInspector(s.id);
  }
  // Build a soldier's counter, place it in hexId and put it on the map (US entry, German
  // activation, both on load). The caller runs updateCounterVisual where it always has.
  function makeCounter(s, hexId) {
    var el = AmbushCounters.make(s, counterClick);
    placeEl(el, hexId);
    canvas.appendChild(el);
    M1.counterEls[s.id] = el;
    return el;
  }
  // Phase 5: a rustle when a living soldier changes stance on screen
  function stanceRustle() { M1.FX.sound('rustle'); }
  function updateCounterVisual(s) {
    var el = M1.counterEls[s.id];
    if (!el) return;
    AmbushCounters.update(el, s, stanceRustle);
  }
  function highlightActor(id) {
    Object.keys(M1.counterEls).forEach(function (k) { M1.counterEls[k].classList.toggle('active-actor', k === id); });
  }

  // ---------------------------------------------------------------------
  // Roster / state
  // ---------------------------------------------------------------------
  // The game state (usSoldiers, germans, phase, ...) lives on M1.state (core.js, Stage B).

  function findSoldier(id) {
    if (M1.state.germans[id]) return M1.state.germans[id];
    return M1.state.usSoldiers.filter(function (s) { return s.id === id; })[0];
  }
  function nameFor(id) { return findSoldier(id).name; }
  function activeUS() { return M1.state.usSoldiers.filter(function (s) { return s.isActive && !s.exited; }); }
  function activeGermans() { return allGermans().filter(function (g) { return g.isActive; }); }
  // Task #72 (docs/46_CAPTURED_GERMAN.md): every German ever activated, active or not — a
  // captured German has isActive === false (removeFromRound/§11/2's own Inactive-space mechanic,
  // unchanged from Task #27) but must still be found for the §11/2 escape/freeing check below,
  // which activeGermans() would otherwise skip entirely.
  function allGermans() { return Object.keys(M1.state.germans).map(function (k) { return M1.state.germans[k]; }); }
  // Out of the fight: incapacitated, killed or captured (wounded and panicked soldiers are not).
  function isOut(s) { return s.status === 'incapacitated' || s.status === 'killed' || s.status === 'captured'; }

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
    if (!M1.state.groundItems[hexId]) M1.state.groundItems[hexId] = [];
    M1.state.groundItems[hexId].push({ id: id, kind: kind });
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
    var html = M1.state.usSoldiers.map(function (s) {
      var state = s.exited ? 'exited' : s.isActive ? (s.status && s.status !== 'unharmed' ? s.status : (s.aware === false ? 'unaware' : '')) : s.status;
      return '<div class="roster-slot' + (s.isActive ? '' : ' dead') + '"><span class="letter">' + s.letter + '</span>' +
        '<img src="' + currentImgFor(s) + '"><div class="roster-main"><div class="roster-name">' + s.name +
        (s.isCommander ? ' <i class="kit-state ok">Commander</i>' : '') + (state ? ' <i class="kit-state warn">' + state + '</i>' : '') +
        '<span class="roster-stats">IN ' + s.IN + ' · PC ' + s.PC + ' · WS ' + M1.fmtSigned(s.WS) + ' · ' + s.stance + (s.hexId ? ' at ' + s.hexId : '') + '</span></div>' +
        kitHtml(s) + '</div></div>';
    }).join('');
    document.getElementById('roster-list').innerHTML = html;
  }
  // What the VP panel last showed — __mission1Debug.board() reports this, not a fresh computation,
  // so automation sees exactly what the player sees.
  M1.shownVP = { gained: 0, lost: 0, total: 0, need: 0 };
  function renderVP() {
    var totals = V.computeVPTotal(M1.state.vpState);
    M1.shownVP = { gained: totals.gained, lost: totals.lost, total: totals.total, need: vpRequirement() };
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
      (D.isEasy(M1.state.difficulty)
        ? '<h4>Easy Mode</h4><ul style="margin:0 0 12px; padding-left:18px; font-size:12.5px; line-height:1.6;">' +
          D.describe(M1.state.difficulty).map(function (line) { return '<li>' + line + '</li>'; }).join('') + '</ul>'
        : '') +
      '<h4>Current VP</h4><p class="obj-vp">' + totals.gained + ' gained &minus; ' + totals.lost + ' lost = <b>' + totals.total + '</b></p>' +
      '<h4>Ending 1 — Hold the Ground</h4><p>Occupy the T8 building, K13, and L13, plus a SE-heights hex with line of sight to every road, with no active Germans remaining. Awards a further +4 VP.</p>' +
      '<h4>Ending 2 — Withdraw</h4><p>Every active soldier exits the map via the north edge (A1&ndash;J1).</p>';
  }
})();

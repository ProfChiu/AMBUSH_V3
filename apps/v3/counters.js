/*
 * Ambush! v3 — soldier counters. Presentation only: no rules, no engine state, no FX or audio.
 * The one counter builder: mission1 (roster.js makeCounter / updateCounterVisual) and
 * counter_test.html both build through it (docs/REFACTOR_MAP.md 4.2, 5.6).
 *
 * AmbushCounters.make(s, onClick) builds a counter element: class `counter` (+ `enemy` for a
 * German), data-soldier-id, one <img> child. onClick(s, e), when given, runs on a click after
 * stopPropagation. The caller places it, appends it, then calls update.
 * AmbushCounters.update(el, s, onStance) keeps it in step with the soldier: `wounded` tint,
 * `dead` when out of the fight, the scan, the commander's star (once), and onStance(s) when a
 * living soldier's stance changed since the last update (mission1 plays the rustle there).
 * Scans: a US soldier crouching or prone shows his crouching scan; a German always shows s.img,
 * whatever his stance (mission1 gives every German his crouching scan, contact.js). A soldier is any object with
 * { id, side: 'US'|'us'|'german', letter, stance, status } and, in mission1, img / imgCrouch.
 */
(function () {
  'use strict';

  var LIB = '../../assets/library/';
  // Y and Z have no scan in soldiers/; v2 draws them from fallback/ the same way.
  var FALLBACK = { Y: true, Z: true };
  var OUT = { incapacitated: true, killed: true, captured: true };

  function low(s) { return (s.stance === 'crouching' || s.stance === 'prone'); }

  // The library scan for a soldier with no img of his own (counter_test.html).
  function scanFor(s) {
    var de = s.side === 'german';
    var pose = de || low(s) ? 'crouching' : 'standing';
    var dir = de && FALLBACK[s.letter] ? 'fallback/' : 'soldiers/';
    return LIB + dir + (de ? 'de' : 'us') + '_soldier_' + s.letter + '_' + pose + '.png';
  }

  function srcFor(s) {
    if (!s.img) return scanFor(s);
    if (s.side === 'german') return s.img;
    return low(s) ? s.imgCrouch : s.img;
  }

  function update(el, s, onStance) {
    el.classList.toggle('wounded', s.status === 'wounded');
    el.classList.toggle('dead', !!OUT[s.status]);
    var imgEl = el.querySelector('img');
    if (imgEl) imgEl.src = srcFor(s);
    // the commander wears a star, so the soldier who can Give Turn and Make aware is found on sight
    if (s.isCommander && !el.querySelector('.cmd-badge')) {
      var star = document.createElement('span');
      star.className = 'cmd-badge'; star.textContent = '★'; star.title = s.name + ', commander (§6/3)';
      el.appendChild(star);
    }
    // a living soldier changed stance on screen
    if (el._stance && el._stance !== s.stance && !el.classList.contains('dead') && onStance) onStance(s);
    el._stance = s.stance;
  }

  function make(s, onClick) {
    var el = document.createElement('div');
    el.className = 'counter' + (s.side === 'german' ? ' enemy' : '');
    // Stable identity for automated play/verification (tools/bot/): counter DOM order shifts
    // as soldiers exit or are removed, so index-based lookup is not safe.
    el.dataset.soldierId = s.id;
    var img = document.createElement('img');
    img.setAttribute('src', srcFor(s));
    el.appendChild(img);
    if (onClick) el.addEventListener('click', function (e) { e.stopPropagation(); onClick(s, e); });
    return el;
  }

  window.AmbushCounters = { make: make, update: update, scanFor: scanFor, srcFor: srcFor };
})();

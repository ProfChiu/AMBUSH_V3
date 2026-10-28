/*
 * Ambush! v3 — soldier counters (Phase 1). Presentation only: no rules, no engine state.
 *
 * AmbushCounters.make(soldier) builds a counter element; AmbushCounters.update(el, soldier) keeps
 * it in step with the soldier's stance and status, the way v2's updateCounterVisual does
 * (apps/game/mission1demo.js): crouching or prone shows the crouching scan, wounded tints,
 * incapacitated / killed / captured fades to grey. A soldier here is any object with
 * { id, side: 'us'|'german', letter, stance, status }.
 */
(function () {
  'use strict';

  var LIB = '../../assets/library/';
  // Y and Z have no scan in soldiers/; v2 draws them from fallback/ the same way.
  var FALLBACK = { Y: true, Z: true };
  var OUT = { incapacitated: true, killed: true, captured: true };

  function scanFor(s) {
    var side = s.side === 'german' ? 'de' : 'us';
    var pose = (s.stance === 'crouching' || s.stance === 'prone') ? 'crouching' : 'standing';
    var dir = side === 'de' && FALLBACK[s.letter] ? 'fallback/' : 'soldiers/';
    return LIB + dir + side + '_soldier_' + s.letter + '_' + pose + '.png';
  }

  function update(el, s) {
    el.classList.toggle('wounded', s.status === 'wounded');
    el.classList.toggle('dead', !!OUT[s.status]);
    var img = el.querySelector('img');
    var src = scanFor(s);
    if (img.getAttribute('src') !== src) img.setAttribute('src', src);
  }

  function make(s) {
    var el = document.createElement('div');
    el.className = 'counter' + (s.side === 'german' ? ' de' : '');
    el.dataset.soldierId = s.id;
    var img = document.createElement('img');
    img.alt = s.letter;
    img.draggable = false;
    el.appendChild(img);
    update(el, s);
    return el;
  }

  window.AmbushCounters = { make: make, update: update, scanFor: scanFor };
})();

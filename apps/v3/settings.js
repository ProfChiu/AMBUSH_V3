/*
 * Ambush! v3 — player settings. Presentation only; nothing here reaches the rules.
 * Remembered per browser (localStorage, wrapped: a private window or blocked storage just means
 * the defaults each visit). Reduced motion defaults to the OS setting.
 *
 *   AmbushSettings.get(key) / set(key, value) / all() / onChange(fn(key, value, all)) / reset()
 */
(function () {
  'use strict';

  var KEY = 'ambush_v3_settings';
  var osStill = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var DEFAULTS = { master: 80, music: 60, sfx: 80, speed: 'normal', reducedMotion: osStill, grid: false };
  var SPEEDS = ['slow', 'normal', 'fast'];   // v2's result pacing

  function load() {
    var out = {}, k, saved = null;
    for (k in DEFAULTS) out[k] = DEFAULTS[k];
    try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { saved = null; }
    if (saved && typeof saved === 'object') for (k in DEFAULTS) if (k in saved && typeof saved[k] === typeof DEFAULTS[k]) out[k] = saved[k];
    if (SPEEDS.indexOf(out.speed) < 0) out.speed = DEFAULTS.speed;
    return out;
  }
  var cur = load(), listeners = [];

  function save() { try { localStorage.setItem(KEY, JSON.stringify(cur)); } catch (e) { /* storage unavailable */ } }
  function set(k, v) {
    if (!(k in DEFAULTS) || cur[k] === v) return;
    cur[k] = v; save();
    listeners.forEach(function (fn) { fn(k, v, cur); });
  }

  window.AmbushSettings = {
    get: function (k) { return cur[k]; },
    set: set,
    all: function () { return cur; },
    onChange: function (fn) { listeners.push(fn); },
    reset: function () { for (var k in DEFAULTS) set(k, DEFAULTS[k]); },
    SPEEDS: SPEEDS,
  };
})();

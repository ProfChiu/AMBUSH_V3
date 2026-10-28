/*
 * Ambush! v3 — the audio engine. Presentation only.
 *
 * Three buses (music -> duck, sfx -> master -> speakers) on Web Audio, volumes from AmbushSettings.
 * Every cue is synthesized (Phase 5, Wan 2026-10-22: synth only for now). When CC0 files come,
 * a cue's recipe is swapped for a file; the call sites never change.
 *
 *   AmbushAudio.play('click' | 'confirm' | 'refuse' | 'open' | 'close' | 'zoom' | 'banner')
 *   AmbushAudio.play('rifle' | 'pistol' | 'smg' | 'mg' | 'rocket' | 'throw' | 'blast' | 'dud' |
 *                    'hit' | 'miss' | 'kia' | 'die' | 'land' | 'step' | 'rustle', {at: sec})
 *   AmbushAudio.steps(ms)                    footsteps spread over a glide
 *   AmbushAudio.music('title' | 'mission' | null)
 *
 * The context starts on the first press (browsers keep audio locked until a gesture).
 */
(function () {
  'use strict';

  var S = window.AmbushSettings;
  var ctx = null, bus = {}, track = null, wanted = null;

  function vol(k) { return (S ? S.get(k) : 80) / 100; }
  function applyVolumes() {
    if (!ctx) return;
    var t = ctx.currentTime;
    bus.master.gain.setTargetAtTime(vol('master'), t, 0.03);
    bus.music.gain.setTargetAtTime(vol('music') * 0.5, t, 0.03);
    bus.sfx.gain.setTargetAtTime(vol('sfx'), t, 0.03);
  }
  function start() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    // a gentle limiter, so a blast over a burst over the music never clips
    bus.limit = ctx.createDynamicsCompressor();
    bus.limit.threshold.value = -6; bus.limit.knee.value = 6; bus.limit.ratio.value = 12;
    bus.limit.attack.value = 0.003; bus.limit.release.value = 0.15;
    bus.limit.connect(ctx.destination);
    bus.master = ctx.createGain(); bus.master.connect(bus.limit);
    bus.duck = ctx.createGain(); bus.duck.connect(bus.master);
    bus.music = ctx.createGain(); bus.music.connect(bus.duck);
    bus.sfx = ctx.createGain(); bus.sfx.connect(bus.master);
    applyVolumes();
    if (wanted) music(wanted);
  }
  ['pointerdown', 'keydown'].forEach(function (ev) { window.addEventListener(ev, start, { capture: true }); });
  if (S) S.onChange(function (k) { if (k === 'master' || k === 'music' || k === 'sfx') applyVolumes(); });

  // A placeholder cue is a list of parts. A tone: [freq, startSec, durSec, type, gain].
  // A noise burst (Phase 5, Wan 2026-10-22: synth only for now): {n: filterType, f: freqHz,
  // f2: sweep-to Hz, q, at, dur, g, atk: attack sec}. Gunfire, blasts, steps and rustle are
  // filtered noise; a low tone under a shot or blast gives it weight.
  function shot(f, g, at) { return [{ n: 'bandpass', f: f, q: 0.9, at: at || 0, dur: 0.16, g: g }, [95, at || 0, 0.12, 'sine', g * 0.8]]; }
  function burst(n, gap, f, g) { var p = []; for (var i = 0; i < n; i++) p = p.concat(shot(f, g * (1 - i * 0.06), i * gap)); return p; }
  var CUES = {
    click:   [[880, 0, 0.05, 'square', 0.08]],
    confirm: [[660, 0, 0.07, 'triangle', 0.25], [990, 0.07, 0.1, 'triangle', 0.22]],
    refuse:  [[180, 0, 0.16, 'sawtooth', 0.12], [150, 0.09, 0.16, 'sawtooth', 0.1]],
    open:    [[520, 0, 0.08, 'sine', 0.22], [780, 0.05, 0.1, 'sine', 0.16]],
    close:   [[780, 0, 0.07, 'sine', 0.16], [520, 0.05, 0.09, 'sine', 0.14]],
    zoom:    [[440, 0, 0.06, 'sine', 0.12]],
    banner:  [[392, 0, 0.22, 'triangle', 0.22], [523, 0.12, 0.3, 'triangle', 0.2], [659, 0.24, 0.4, 'triangle', 0.18]],
    // combat
    rifle:   shot(1300, 0.7),
    pistol:  [{ n: 'bandpass', f: 1900, q: 1.1, at: 0, dur: 0.1, g: 0.5 }, [140, 0, 0.07, 'sine', 0.3]],
    smg:     burst(4, 0.075, 1600, 0.45),
    mg:      burst(7, 0.06, 1100, 0.55),
    rocket:  [{ n: 'bandpass', f: 500, f2: 2400, q: 0.7, at: 0, dur: 0.5, g: 0.5, atk: 0.12 }, [70, 0, 0.3, 'sine', 0.4]],
    throw:   [{ n: 'bandpass', f: 450, f2: 1500, q: 1.2, at: 0, dur: 0.32, g: 0.22, atk: 0.12 }],
    blast:   [{ n: 'lowpass', f: 900, f2: 120, q: 0.5, at: 0, dur: 1.1, g: 0.95 }, [55, 0, 0.7, 'sine', 0.8], [38, 0.04, 0.9, 'sine', 0.6]],
    dud:     [[120, 0, 0.1, 'sine', 0.35], { n: 'lowpass', f: 600, q: 0.7, at: 0, dur: 0.08, g: 0.2 }],
    hit:     [{ n: 'lowpass', f: 380, q: 0.8, at: 0, dur: 0.14, g: 0.6 }, [80, 0, 0.12, 'sine', 0.45]],
    miss:    [{ n: 'bandpass', f: 3200, f2: 1300, q: 4, at: 0, dur: 0.18, g: 0.18, atk: 0.06 }],
    kia:     [[98, 0, 0.5, 'triangle', 0.25], [73, 0.18, 0.7, 'triangle', 0.22]],
    die:     [{ n: 'highpass', f: 2200, q: 0.7, at: 0, dur: 0.025, g: 0.12 }],
    land:    [[900, 0, 0.06, 'triangle', 0.2], [1350, 0, 0.04, 'triangle', 0.08]],
    // movement
    step:    [{ n: 'lowpass', f: 520, q: 0.9, at: 0, dur: 0.07, g: 0.22 }],
    rustle:  [{ n: 'highpass', f: 1800, q: 0.5, at: 0, dur: 0.28, g: 0.1, atk: 0.08 }],
  };
  // Combat cues duck the music (Wan 2026-10-22): it dips to 60% and recovers over ~0.6 s.
  var DUCK = { rifle: 1, pistol: 1, smg: 1, mg: 1, rocket: 1, blast: 1, hit: 1 };
  // Small per-play variation so repeats do not sound mechanical. Drawn from crypto, never
  // Math.random: the bot seeds Math.random, and a sound must not consume the game's stream.
  var vBuf = new Uint8Array(1);
  function vary(spread) {
    if (!window.crypto || !window.crypto.getRandomValues) return 1;
    window.crypto.getRandomValues(vBuf);
    return 1 + (vBuf[0] / 255 - 0.5) * 2 * spread;
  }
  var noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    var n = ctx.sampleRate, b = ctx.createBuffer(1, n, n), d = b.getChannelData(0), x = 22222;
    for (var i = 0; i < n; i++) { x = (x * 1103515245 + 12345) & 0x7fffffff; d[i] = x / 0x3fffffff - 1; } // fixed LCG: same noise every time
    return (noiseBuf = b);
  }
  function tone(f, at, dur, type, g, out) {
    var o = ctx.createOscillator(), a = ctx.createGain(), t = ctx.currentTime + at;
    o.type = type; o.frequency.value = f;
    a.gain.setValueAtTime(0.0001, t);
    a.gain.exponentialRampToValueAtTime(g, t + 0.01);
    a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(a); a.connect(out); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(p, pitch, out) {
    var s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), a = ctx.createGain(), t = ctx.currentTime + p.at;
    s.buffer = noise(); s.loop = true;
    fl.type = p.n; fl.Q.value = p.q || 1; fl.frequency.setValueAtTime(p.f * pitch, t);
    if (p.f2) fl.frequency.exponentialRampToValueAtTime(p.f2 * pitch, t + p.dur);
    a.gain.setValueAtTime(0.0001, t);
    a.gain.exponentialRampToValueAtTime(p.g, t + (p.atk || 0.004));
    a.gain.exponentialRampToValueAtTime(0.0001, t + p.dur);
    s.connect(fl); fl.connect(a); a.connect(out);
    s.start(t, (vBuf[0] / 255) * 0.5); s.stop(t + p.dur + 0.05);
  }
  function duck(at) {
    var t = ctx.currentTime + (at || 0);
    bus.duck.gain.cancelScheduledValues(ctx.currentTime);
    bus.duck.gain.setTargetAtTime(0.6, t, 0.02);
    bus.duck.gain.setTargetAtTime(1, t + 0.35, 0.25);
  }
  // opts.at delays the cue (sec); used to space footsteps along a glide
  function play(name, opts) {
    if (!ctx || ctx.state !== 'running' || !CUES[name]) return;
    var pitch = vary(0.06), at = (opts && opts.at) || 0;
    CUES[name].forEach(function (c) {
      if (Array.isArray(c)) tone(c[0] * pitch, c[1] + at, c[2], c[3], c[4], bus.sfx);
      else hiss({ n: c.n, f: c.f, f2: c.f2, q: c.q, at: c.at + at, dur: c.dur, g: c.g * vary(0.12), atk: c.atk }, pitch, bus.sfx);
    });
    if (DUCK[name]) duck(at);
  }
  // Footsteps across a glide of `ms`: one every ~150 ms, at least two
  function steps(ms) {
    if (!ctx) return;
    var n = Math.max(2, Math.round(ms / 150));
    for (var i = 0; i < n; i++) play('step', { at: i * ms / 1000 / n });
  }

  // placeholder music: a slow, quiet two-chord pad per track
  var TRACKS = { title: [[110, 164.8, 220], [98, 146.8, 196]], mission: [[87.3, 130.8, 174.6], [82.4, 123.5, 164.8]] };
  function music(name) {
    wanted = name || null;
    if (!ctx) return;
    if (track) {
      var old = track; track = null;
      old.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
      clearInterval(old.timer);
      setTimeout(function () { old.oscs.forEach(function (o) { o.stop(); }); old.gain.disconnect(); }, 1500);
    }
    if (!name || !TRACKS[name]) return;
    var g = ctx.createGain(); g.gain.value = 0.0001; g.connect(bus.music);
    var chords = TRACKS[name], i = 0;
    var oscs = chords[0].map(function (f) {
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(g); o.start(); return o;
    });
    g.gain.setTargetAtTime(0.06, ctx.currentTime, 1.2);
    var timer = setInterval(function () {
      i = (i + 1) % chords.length;
      oscs.forEach(function (o, k) { o.frequency.setTargetAtTime(chords[i][k], ctx.currentTime, 0.8); });
    }, 6000);
    track = { gain: g, oscs: oscs, timer: timer };
  }

  window.AmbushAudio = {
    play: play, music: music, steps: steps,
    state: function () { return ctx ? ctx.state : 'locked'; },
    cues: Object.keys(CUES),
  };
})();

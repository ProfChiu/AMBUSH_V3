#!/usr/bin/env python3
"""R4 Step 4 proof: the counters' DOM, before and after a change.

Plays one seeded bot game (tools/bot) and, after every bot action, records the outerHTML of every
`.counter` on the map (DOM order) plus how many stance rustles have sounded. After the game it
loads three of the game's saves (first, middle, last) and records the counters again, so the
load-time build sites are covered too.

    python3 tools/check_counters.py --seed 7000 --out before.json
    python3 tools/check_counters.py --seed 7000 --out after.json --against before.json

With --against, prints "check_counters IDENTICAL (n snapshots)" or the first differing snapshot;
exit 0/1.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'bot'))
from game import Session  # noqa: E402
from policy import Policy  # noqa: E402

SNAP_JS = r"""() => {
  if (window.__rustles === undefined) {
    window.__rustles = 0;
    var FX = window.AmbushM1.FX;  // present.js exports FX and calls speak through M1 (R6), so both can be wrapped here
    var orig = FX.sound;
    FX.sound = function (n) { if (n === 'rustle') window.__rustles++; return orig.apply(this, arguments); };
    // --events: the board effects and spoken card results, in order (R4 Step 5's toHitCard proof)
    window.__events = [];
    ['floatDie', 'sound', 'shake', 'badge'].forEach(function (k) {
      var f = FX[k];
      FX[k] = function () { window.__events.push(k + ' ' + JSON.stringify(Array.prototype.slice.call(arguments))); return f.apply(this, arguments); };
    });
    var sp = window.AmbushM1.speak;
    window.AmbushM1.speak = function (h) { window.__events.push('speak ' + h); return sp.apply(this, arguments); };
  }
  var els = Array.prototype.slice.call(document.querySelectorAll('.counter'));
  if (els.some(function (e) { return e.classList.contains('moving'); })) return null;
  // stack badges (stack.js) and the glide (roster.js glideEl) are timers, not the counter build
  return { rustles: window.__rustles, counters: els.map(function (e) {
    return e.outerHTML.replace(/<span class="stack-badge">[^<]*<\/span>/g, '')
      .replace(/ moving"/g, '"').replace(/ ?transition: [^;]*;/g, '');
  }) };
}"""


def snap(page):
    for _ in range(60):
        r = page.evaluate(SNAP_JS)
        if r is not None:
            return r
        time.sleep(0.05)
    return page.evaluate(SNAP_JS.replace("return null;", ""))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=7000)
    ap.add_argument('--difficulty', default='normal')
    ap.add_argument('--out', required=True)
    ap.add_argument('--against')
    a = ap.parse_args()
    snaps = []
    policy = Policy(a.difficulty)
    with Session(a.seed) as s:
        page = s._page.page
        acts = 0
        while True:
            s.tick()
            s.settle(policy)
            board = s.board()
            if board['phase'] == 'over':
                break
            pre = snap(page)
            if acts % 15 == 0 and page.evaluate("() => window.__mission1Debug.isSafeToSave()"):
                page.evaluate("() => window.__mission1Debug.saveGame()")
            did = policy.act(s, board)
            if did is not None:
                acts += 1
                s.log('act', did)
                snaps.append({'act': did, **pre})
            else:
                time.sleep(0.08)
            time.sleep(0.02)
        events = page.evaluate("() => window.__events")
        log = page.evaluate("() => Array.from(document.querySelectorAll('#combatlog .log-line')).map(e => e.innerHTML)")
        saves_raw = page.evaluate("() => localStorage.getItem('ambush.v3.saves')")
        errors = list(s.errors)
    # The saves a game writes depend on when the page was quiet, so the load half replays the
    # baseline's saves (--against) when given: each in a fresh page, loaded at once.
    if a.against:
        saves_raw = json.loads(Path(a.against).read_text())['saves_raw']
    n = len(json.loads(saves_raw or '[]'))
    for i in range(n):
        with Session(a.seed) as s:
            page = s._page.page
            page.evaluate("(v) => localStorage.setItem('ambush.v3.saves', v)", saves_raw)
            page.evaluate("(i) => window.__mission1Debug.loadSaveAtIndex(i)", i)
            time.sleep(0.5)
            snaps.append({'load': i, **snap(page)})
            errors += list(s.errors)
    Path(a.out).write_text(json.dumps({'errors': errors, 'events': events, 'log': log, 'saves_raw': saves_raw, 'snaps': snaps}, indent=0))
    print(f'{len(snaps)} snapshots, {n} saves, {len(errors)} console errors -> {a.out}')
    if a.against:
        refall = json.loads(Path(a.against).read_text())
        ref = refall['snaps']
        for k, mine in (('events', events), ('log', log)):
            other = refall.get(k)
            if other is not None and other != mine:
                i = next((j for j, (x, y) in enumerate(zip(other, mine)) if x != y), min(len(other), len(mine)))
                print(f'check_counters DIFFER in {k} at {i} ({len(other)} vs {len(mine)}):\n  before {other[i:i+3]}\n  after  {mine[i:i+3]}')
                return 1
        if len(ref) != len(snaps):
            print(f'check_counters DIFFER: {len(ref)} vs {len(snaps)} snapshots')
        for i, (x, y) in enumerate(zip(ref, snaps)):
            if x != y:
                print(f'check_counters DIFFER at snapshot {i}:\n  before {json.dumps(x)[:1500]}\n  after  {json.dumps(y)[:1500]}')
                return 1
        if len(ref) != len(snaps) or errors:
            return 1
        print(f'check_counters IDENTICAL ({len(snaps)} snapshots, {len(events)} fx/speech events, {len(log)} log lines)')
    return 0


if __name__ == '__main__':
    sys.exit(main())

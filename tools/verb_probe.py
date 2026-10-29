#!/usr/bin/env python3
"""R7 Step 10 proof: what the board offers, and why it refuses, at every bot decision.

Plays one seeded bot game (tools/bot) per difficulty and, before every bot action, records
  - verbsOffered() (board().verbs, what the bot reads),
  - every verb button's disabled state and data-why (and title, which ring.js falls back to),
  - the stack panel's takeWhy and offer count at the acting soldier's hex (AmbushMission.stack).

    python3 tools/verb_probe.py --out base.json                  # seed 7000, normal + easy
    python3 tools/verb_probe.py --out after.json --against base.json

With --against prints "verb_probe IDENTICAL (...)" or the first differing snapshot; exit 0/1.
--diff A B compares two recorded files without playing.

The ring (ring.js) is not recorded: it redraws from these same buttons (disabled, data-why) on its
own timer, so two runs of unchanged code catch it at different moments. The buttons are its source.
"""
import argparse
import json
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'bot'))
from game import Session  # noqa: E402
from policy import Policy  # noqa: E402

# Every button seams.js's VERBS names (the bot's contract), listed here so the probe does not
# depend on the code it checks.
BUTTONS = ['stance-standing', 'stance-crouching', 'stance-prone', 'exitMapBtn', 'clearJamOpsBtn',
           'moveBtn', 'fireAimed', 'fireSnap', 'assaultBtn', 'grenadeBtn', 'dragBtn', 'giveTurnBtn',
           'makeAwareBtn', 'changeStanceBtn', 'prepareWeaponBtn', 'pickupBtn', 'clearJamBtn', 'passTurn',
           'cancelMoveBtn', 'newRoundBtn']

SNAP_JS = r"""(ids) => {
  var dbg = window.__mission1Debug, b = dbg.board();
  var out = { phase: b.phase, actor: b.currentActorId, verbs: b.verbs, buttons: {} };
  ids.forEach(function (id) {
    var e = document.getElementById(id);
    if (!e) return;
    out.buttons[id] = [!!e.disabled, e.dataset.why === undefined ? null : e.dataset.why, e.title || ''];
  });
  var st = dbg.state(), a = null;
  (st.usSoldiers || []).forEach(function (s) { if (s.id === st.currentActorId) a = s; });
  if (a && a.hexId && window.AmbushMission && window.AmbushMission.stack) {
    var k = window.AmbushMission.stack(a.hexId);
    out.stack = { takeWhy: k.takeWhy, offers: k.offers.length };
  }
  return out;
}"""


def play(seed, difficulty):
    snaps = []
    policy = Policy(difficulty)
    with Session(seed) as s:
        page = s._page.page
        while True:
            s.tick()
            s.settle(policy)
            board = s.board()
            if board['phase'] == 'over':
                break
            pre = page.evaluate(SNAP_JS, BUTTONS)
            did = policy.act(s, board)
            if did is not None:
                s.log('act', did)
                snaps.append({'act': did, **pre})
            else:
                time.sleep(0.08)
            time.sleep(0.02)
        errors = list(s.errors)
    return snaps, errors


def compare(ref, rec, diffs):
    for d in diffs:
        x, y = ref[d]['snaps'], rec[d]['snaps']
        for i, (p, q) in enumerate(zip(x, y)):
            if p != q:
                print(f'verb_probe DIFFER {d} at decision {i}:\n  before {json.dumps(p)[:1500]}\n  after  {json.dumps(q)[:1500]}')
                return 1
        if len(x) != len(y):
            print(f'verb_probe DIFFER {d}: {len(x)} vs {len(y)} decisions')
            return 1
    print('verb_probe IDENTICAL (' + ', '.join(f'{d} {len(rec[d]["snaps"])}' for d in diffs) + ' decisions)')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=7000)
    ap.add_argument('--difficulty', choices=['normal', 'easy', 'both'], default='both')
    ap.add_argument('--out')
    ap.add_argument('--against')
    ap.add_argument('--diff', nargs=2, metavar=('A', 'B'))
    a = ap.parse_args()
    if a.diff:
        ref, rec = (json.loads(Path(f).read_text()) for f in a.diff)
        return compare(ref, rec, [d for d in ('normal', 'easy') if d in ref and d in rec])
    if not a.out:
        ap.error('--out is required')
    diffs = ['normal', 'easy'] if a.difficulty == 'both' else [a.difficulty]
    rec = {}
    for d in diffs:
        snaps, errors = play(a.seed, d)
        rec[d] = {'snaps': snaps, 'errors': errors}
        print(f'{d}: {len(snaps)} decisions, {len(errors)} console errors')
    Path(a.out).write_text(json.dumps(rec, indent=0))
    bad = any(rec[d]['errors'] for d in diffs)
    if not a.against:
        return 1 if bad else 0
    if bad:
        print('verb_probe: console errors')
        return 1
    return compare(json.loads(Path(a.against).read_text()), rec, diffs)


if __name__ == '__main__':
    sys.exit(main())

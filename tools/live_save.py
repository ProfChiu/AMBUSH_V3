"""Live save/load checks for Mission 1 (docs/REFACTOR_MAP.md 6.3 Step 7; bugs 12 and 13).
Grew from tools/repro_save.py (R1), whose checks it flips from "bug present" to "fixed".

  python3 tools/live_save.py [--seed 7000] [--headed]

Drives v3's page with the bot (tools/bot: seeded dice, policy) and the page's test hooks
(__mission1Debug.saveGame / listSaves / loadSaveAtIndex / applyWoundForTesting /
groundItemsForTesting / spawnGermanForTesting / state). loadSaveAtIndex runs applySavedState, the
same function a Load-dialog row runs.

Bug 12, ground items (Step 7): a soldier wounded in a Round drops a Port Box item (§13/2); then
  - the save written after the drop is version 2 and holds groundItems;
  - loading the save from BEFORE the drop in the same page leaves nothing on the ground and the
    item once, in his Port Boxes (no leftover, no duplicate);
  - reload the page, load the post-drop save: the item is on the ground in its hex and not also in
    his Port Boxes;
  - a version-1 save (no groundItems field) still loads, with an empty ground, even right after a
    position that had items on the ground.
Bug 13, in-flight state (Step 7): load the last Operations save while a contact paragraph's Round 1
  pop-up is open, then start a fresh Round 1 with no contact paragraph: none of the abandoned
  paragraph's terms are applied to it.
Every part asserts 0 console errors. Prints "  ok ..." / "  FAIL ..." lines; exit 0 when all pass.
"""
import argparse
import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / 'bot'))
os.environ.setdefault('AMBUSH_PAGE', 'v3')
from game import Session  # noqa: E402
from policy import Policy  # noqa: E402

SAVE_KEY = 'ambush-mission1-saves-v1'
fails = []


def check(ok, what):
    print(('  ok   ' if ok else '  FAIL ') + what)
    if not ok:
        fails.append(what)


class Stop(Exception):
    pass


def dbg(s, expr, arg=None):
    return s._page.page.evaluate('(a) => { const D = window.__mission1Debug; return (' + expr + '); }', arg)


def play_until(s, policy, want, limit=3000):
    """Bot loop (run.py's) until want(board) is true at a quiet point (no dialog open)."""
    for _ in range(limit):
        s.tick()
        s.settle(policy)
        b = s.board()
        if b['phase'] == 'over':
            return None
        if want(b):
            return b
        if policy.act(s, b) is None:
            time.sleep(0.08)
        time.sleep(0.02)
    return None


def reload(s):
    s._page.page.reload()
    s._page.page.wait_for_timeout(1200)


def in_kit(st, sid, item):
    """Is the item in his Port Boxes (a big item fills more than one box; the dropped item is a
    Port item, and its ammunition, which shares the id, stays in the Ammo Boxes)."""
    sold = next(u for u in st['usSoldiers'] if u['id'] == sid)
    return item in ((sold.get('inventory') or {}).get('portBoxes') or [])


def ground_count(ground, item):
    return sum(1 for items in ground.values() for it in items if it['id'] == item)


def part_ground(seed, headed):
    print(f'== Bug 12: ground items (seed {seed})')
    with Session(seed, headless=not headed, max_steps=20000, max_seconds=600) as s:
        pol = Policy('normal')
        b = play_until(s, pol, lambda b: b['phase'] == 'round' and dbg(s, 'D.isSafeToSave()'))
        check(bool(b), 'reached a quiet Action Round')
        if not b:
            return
        dbg(s, 'localStorage.clear()')
        check(dbg(s, 'D.saveGame()'), 'save before the drop')
        st = dbg(s, 'D.state()')
        cand = [u for u in st['usSoldiers'] if u.get('inventory') and u.get('hexId') and not u.get('wounded')
                and u.get('isActive', True) and not u.get('exited')]
        who, ground = None, {}
        for u in cand:
            dbg(s, 'D.applyWoundForTesting(a)', u['id'])
            s.settle(pol)
            ground = dbg(s, 'D.groundItemsForTesting()')
            if any(ground.values()):
                who = u
                break
        check(bool(who), 'a wounded soldier dropped an item on the ground')
        if not who:
            return
        hexid = next(h for h, items in ground.items() if items)
        item = ground[hexid][0]['id']
        check(ground[hexid][0]['kind'] == 'port', 'the dropped item is a Port item')
        print(f'  {who["id"]} wounded in {hexid}: drops {item}')
        check(dbg(s, 'D.saveGame()'), 'save after the drop')
        saves = dbg(s, 'D.listSaves()')
        post = saves[-1]
        check(post.get('version') == 2, 'the save is version 2 (got %r)' % post.get('version'))
        check(ground_count(post.get('groundItems') or {}, item) == 1, 'the save holds the item on the ground')

        # same page: load the pre-drop save
        dbg(s, 'D.loadSaveAtIndex(0)')
        s._page.page.wait_for_timeout(300)
        g = dbg(s, 'D.groundItemsForTesting()')
        st = dbg(s, 'D.state()')
        check(not any(g.values()), 'pre-drop save, same page: nothing left on the ground (%s)' % json.dumps(g))
        check(in_kit(st, who['id'], item) and ground_count(g, item) == 0,
              'pre-drop save, same page: %s in his boxes only (no duplicate)' % item)

        # reload, load the post-drop save
        reload(s)
        n = len(dbg(s, 'D.listSaves()'))
        dbg(s, 'D.loadSaveAtIndex(a)', n - 1)
        s._page.page.wait_for_timeout(300)
        g = dbg(s, 'D.groundItemsForTesting()')
        st = dbg(s, 'D.state()')
        check(ground_count({hexid: g.get(hexid) or []}, item) == 1,
              'reload + load post-drop save: %s on the ground in %s' % (item, hexid))
        check(not in_kit(st, who['id'], item) and ground_count(g, item) == 1,
              'reload + load post-drop save: %s not duplicated (in boxes %s, on ground %d)'
              % (item, in_kit(st, who['id'], item), ground_count(g, item)))
        check(st['phase'] == 'round', 'reload + load post-drop save: back in the Round')

        # a version-1 save: no groundItems field. Loaded right after a position with an item down.
        v1 = dict(post)
        v1.pop('groundItems', None)
        v1['version'] = 1
        v1['savedAt'] = post['savedAt'] + 1
        dbg(s, 'localStorage.setItem(a.k, JSON.stringify(a.list))', {'k': SAVE_KEY, 'list': saves + [v1]})
        dbg(s, 'D.loadSaveAtIndex(a)', len(saves))
        s._page.page.wait_for_timeout(300)
        g = dbg(s, 'D.groundItemsForTesting()')
        st = dbg(s, 'D.state()')
        check(st['phase'] == 'round' and st['roundNum'] == post['roundNum'],
              'a version-1 save loads (phase %s, Round %s)' % (st['phase'], st['roundNum']))
        check(not any(g.values()), 'a version-1 save loads with an empty ground')
        check(not s.errors, 'bug 12 part: zero console errors' + ('' if not s.errors else ': ' + ' | '.join(s.errors[:3])))


def part_contact(seeds, headed):
    for seed in seeds:
        print(f'== Bug 13: load during a contact pop-up (seed {seed})')
        with Session(seed, headless=not headed, max_steps=20000, max_seconds=900) as s:
            pol = Policy('normal')
            dbg(s, 'localStorage.clear()')
            logs = []
            s._page.page.on('console', lambda m: logs.append(m.text) if m.text.startswith('[Ambush]') else None)
            trigger = 'is automatically aware (paragraph'
            orig_dialog = s.dialog
            state = {'armed': False}

            def dialog():
                if state['armed'] and any(trigger in l for l in logs):
                    state['armed'] = False
                    raise Stop()
                return orig_dialog()
            s.dialog = dialog
            last_save, hit = None, False
            for _ in range(4000):
                try:
                    s.tick()
                    s.settle(pol)
                except Stop:
                    hit = True
                    break
                b = s.board()
                if b['phase'] == 'over' or any(trigger in l for l in logs):
                    break
                if b['phase'] == 'movement' and dbg(s, 'D.isSafeToSave()'):
                    if dbg(s, 'D.saveGame()'):
                        last_save = len(dbg(s, 'D.listSaves()')) - 1
                        state['armed'] = True
                if pol.act(s, b) is None:
                    time.sleep(0.08)
                time.sleep(0.02)
            s.dialog = orig_dialog
            if not hit or last_save is None:
                print('  no contact with an auto-aware soldier after an Operations save; next seed')
                continue
            check(bool(dbg(s, 'D.pendingDecision()')), 'a contact pop-up is open, Round 1 not yet rolled')
            dbg(s, 'D.loadSaveAtIndex(a)', last_save)
            s._page.page.wait_for_timeout(400)
            st = dbg(s, 'D.state()')
            check(st['phase'] == 'movement' and st['roundNum'] == 0, 'loaded the last Operations save')
            mark = len(logs)
            dbg(s, 'D.spawnGermanForTesting(a, "K5")', '9')
            rolled = False
            for _ in range(600):
                s.tick()
                s.settle(pol)
                if any('Round 1 Initiative' in l for l in logs[mark:]):
                    rolled = True
                    break
                time.sleep(0.02)
            check(rolled, 'a fresh Round 1 (German activated with no paragraph) rolls Initiative')
            stale = [l.split('\n')[0][:120] for l in logs[mark:] if '(paragraph' in l or '(set by paragraph' in l]
            check(not stale, 'no term of the abandoned paragraph is applied to it' + ('' if not stale else ': ' + ' | '.join(stale[:3])))
            check(not s.errors, 'bug 13 part: zero console errors' + ('' if not s.errors else ': ' + ' | '.join(s.errors[:3])))
            return
    check(False, 'bug 13 part: no seed reached a contact with an auto-aware soldier')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=7000)
    ap.add_argument('--seeds13', default='7000,7001,7002,7003,7004,7005,7006,7007')
    ap.add_argument('--headed', action='store_true')
    ap.add_argument('--only', choices=['ground', 'contact'])
    a = ap.parse_args()
    if a.only in (None, 'ground'):
        part_ground(a.seed, a.headed)
    if a.only in (None, 'contact'):
        part_contact([int(x) for x in a.seeds13.split(',')], a.headed)
    print('%d failed' % len(fails) if fails else 'all checks passed')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

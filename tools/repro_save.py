"""Reproduce REFACTOR_MAP bugs 12 and 13 (save/load) live in Chromium. Step 0 of the refactor;
grows into tools/live_save.py in Step 7, where these checks flip from "bug present" to "fixed".

  AMBUSH_PAGE=v3 python3 tools/repro_save.py [--seed 7000] [--headed]

Drives v3's page with the bot (tools/bot: seeded dice, policy) and the page's own test hooks
(__mission1Debug.saveGame / loadSaveAtIndex / applyWoundForTesting / groundItemsForTesting /
spawnGermanForTesting). loadSaveAtIndex runs applySavedState, the same function a Load-dialog row
click runs.

Bug 12, ground items: wound a soldier so he drops a Port Box item (§13/2), then
  (a) load a save made BEFORE the drop, in the same page: the item is still on the ground AND
      back in his kit (leak / duplicate);
  (b) save after the drop, reload the page, load that save: the item is gone from the world.
Bug 13, in-flight state: play until a contact paragraph sets Round 1's terms (pendingContact),
  load the last Operations save while Round 1 is being set up, then start a fresh Round 1 with no
  contact paragraph (a German activated by the test hook): the abandoned paragraph's terms
  (advantage, auto-aware) are applied to it.

Prints PRESENT / ABSENT per bug. Exit 0 when the run completed (whatever it found), 2 if it could
not reach the needed state.
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


def bug12(seed, headed):
    print(f'== Bug 12: ground items (seed {seed})')
    out = {}
    with Session(seed, headless=not headed, max_steps=20000, max_seconds=600) as s:
        pol = Policy('normal')
        # An Action Round at a quiet point: applyWoundForTesting calls renderTrack, which needs a
        # track (in Operations the hook itself throws; no real wound happens outside a Round).
        b = play_until(s, pol, lambda b: b['phase'] == 'round' and dbg(s, 'D.isSafeToSave()'))
        if not b:
            print('  could not reach a quiet Action Round'); return None
        print(f'  quiet point: Round {b["roundNum"]}')
        dbg(s, 'localStorage.clear()')
        assert dbg(s, 'D.saveGame()')
        st = dbg(s, 'D.state()')
        # A soldier with a Port Box item to drop.
        cand = [u for u in st['usSoldiers'] if u.get('inventory') and u.get('hexId') and not u.get('wounded')
                and u.get('isActive', True) and not u.get('exited')]
        dropped_by, ground = None, {}
        for u in cand:
            dbg(s, 'D.applyWoundForTesting(a)', u['id'])
            s.settle(pol)
            ground = dbg(s, 'D.groundItemsForTesting()')
            if any(ground.values()):
                dropped_by = u
                break
        if not dropped_by:
            print('  no soldier dropped an item on a wound'); return None
        hexid = next(h for h, items in ground.items() if items)
        item = ground[hexid][0]['id']
        print(f'  {dropped_by["id"]} wounded in {hexid}: drops {item}; ground = {json.dumps(ground)}')
        assert dbg(s, 'D.saveGame()'), 'save after the drop refused'
        saves = dbg(s, 'D.listSaves()')
        out['saved_keys_have_ground'] = any('ground' in k.lower() for k in saves[-1].keys())
        print(f'  save after drop: keys = {sorted(saves[-1].keys())}')
        print(f'    -> groundItems in the save: {out["saved_keys_have_ground"]}')

        # (a) same page: load the save made BEFORE the drop.
        dbg(s, 'D.loadSaveAtIndex(0)')
        s._page.page.wait_for_timeout(300)
        ground_a = dbg(s, 'D.groundItemsForTesting()')
        st_a = dbg(s, 'D.state()')
        sold = next(u for u in st_a['usSoldiers'] if u['id'] == dropped_by['id'])
        in_kit = item in ((sold.get('inventory') or {}).get('portBoxes') or [])
        out['leak'] = any(ground_a.values())
        print(f'  (a) load pre-drop save in same page: ground = {json.dumps(ground_a)}; '
              f'{item} back in his Port Boxes: {in_kit}; wounded: {sold.get("wounded")}')
        out['duplicate'] = out['leak'] and in_kit

        # (b) reload the page, load the post-drop save.
        s._page.page.reload()
        s._page.page.wait_for_timeout(1200)
        n = len(dbg(s, 'D.listSaves()'))
        dbg(s, 'D.loadSaveAtIndex(a)', n - 1)
        s._page.page.wait_for_timeout(300)
        ground_b = dbg(s, 'D.groundItemsForTesting()')
        st_b = dbg(s, 'D.state()')
        sold = next(u for u in st_b['usSoldiers'] if u['id'] == dropped_by['id'])
        in_kit_b = item in ((sold.get('inventory') or {}).get('portBoxes') or [])
        out['lost'] = not any(ground_b.values()) and not in_kit_b
        print(f'  (b) reload page, load post-drop save: phase {st_b["phase"]}; ground = {json.dumps(ground_b)}; '
              f'{item} in his Port Boxes: {in_kit_b} ({(sold.get("inventory") or {}).get("portBoxes")}); wounded: {sold.get("wounded")}')
        out['errors'] = list(s.errors)
        print(f'  console errors: {len(s.errors)}')
    return out


def bug13(seed, headed):
    print(f'== Bug 13: pendingContact survives a load (seed {seed})')
    with Session(seed, headless=not headed, max_steps=20000, max_seconds=900) as s:
        pol = Policy('normal')
        dbg(s, 'localStorage.clear()')
        logs = []
        s._page.page.on('console', lambda m: logs.append(m.text) if m.text.startswith('[Ambush]') else None)
        # Rolls resolve without a press in v3, so the moment is found in the play log (logLine
        # mirrors to the console): startActionRound(1) logs "made the PC check and is
        # automatically aware (paragraph N)" after noteContact set pendingContact and before
        # placeMarkersChain consumes it. Stop there, inside settle(), as a player clicking Load
        # while the Round 1 pop-up is up would.
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
            print('  no contact with an auto-aware soldier after an Operations save in this seed')
            return None
        contact = [l for l in logs if 'Paragraph ' in l][-1].split('\n')[0][:140]
        print(f'  contact chain: {contact}')
        print(f'  log: {next(l for l in logs if trigger in l)}')
        open_d = dbg(s, 'D.pendingDecision()')
        print(f'  open dialog at that moment: {(open_d or {}).get("title")!r}; '
              f'Initiative logged yet: {any("Round 1 Initiative" in l for l in logs)}')
        dbg(s, 'D.loadSaveAtIndex(a)', last_save)
        s._page.page.wait_for_timeout(400)
        st = dbg(s, 'D.state()')
        print(f'  loaded the last Operations save (#{last_save}): phase {st["phase"]}, round {st["roundNum"]}, '
              f'active Germans {sum(1 for g in st["germans"].values() if g.get("isActive"))}')
        mark = len(logs)
        # A fresh Round 1 with no contact paragraph: a German activated by the test hook (the
        # production activateGermansSequentially; in Operations it starts Round 1).
        dbg(s, 'D.spawnGermanForTesting(a, "K5")', '9')
        for _ in range(600):
            s.tick()
            s.settle(pol)
            if any('Round 1 Initiative' in l for l in logs[mark:]):
                break
            time.sleep(0.02)
        after = [l for l in logs[mark:] if 'aragraph' in l or 'Initiative' in l or 'German activated' in l]
        print('  log after the load, up to Round 1 Initiative:')
        for l in after[:8]:
            print('    ' + l.split('\n')[0][:150])
        stale = [l for l in logs[mark:] if '(paragraph' in l or '(set by paragraph' in l]
        print(f'    -> lines applying the abandoned paragraph\'s terms: {len(stale)}')
        print(f'  console errors: {len(s.errors)}')
        return {'stale': bool(stale), 'lines': stale, 'errors': list(s.errors)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=7000)
    ap.add_argument('--seeds13', default='7000,7001,7002,7003,7004,7005,7006,7007')
    ap.add_argument('--headed', action='store_true')
    ap.add_argument('--only', choices=['12', '13'])
    a = ap.parse_args()
    r12 = r13 = None
    if a.only != '13':
        r12 = bug12(a.seed, a.headed)
    if a.only != '12':
        for sd in [int(x) for x in a.seeds13.split(',')]:
            r13 = bug13(sd, a.headed)
            if r13:
                break
    print('== Summary')
    if r12:
        print(f'  bug 12: groundItems saved={r12["saved_keys_have_ground"]}  leak-on-load={r12["leak"]} '
              f'duplicate={r12["duplicate"]}  lost-after-reload={r12["lost"]}  -> '
              + ('PRESENT' if (r12['leak'] or r12['lost']) else 'ABSENT'))
    else:
        print('  bug 12: not reached')
    if r13:
        print(f'  bug 13: stale contact terms applied={r13["stale"]}  -> ' + ('PRESENT' if r13['stale'] else 'ABSENT'))
    else:
        print('  bug 13: not reached')
    return 0 if (r12 and r13) else 2


if __name__ == '__main__':
    sys.exit(main())

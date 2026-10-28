#!/usr/bin/env python3
"""autopsy.py — why does a stalemated game refuse to end?

A batch tells you 27 of 30 games never finish. It does not tell you whose fault that is, and the
answer decides what to fix:

  * every US turn offering nothing but "Pass"        -> the GAME has no legal action to give
  * a Move button sitting enabled and unused         -> the BOT is playing badly
  * fire available but at a hopeless hit chance      -> reachable, just futile

So this plays to the freeze point, then watches a stretch of turns and records, for each one, who
was acting, what state he was in, and exactly which actions the game offered him. Read-only: it
drives the real game through __mission1Debug and changes nothing.

    python3 tools/bot/autopsy.py --seeds 7000 7001 7002 --workers 4
"""
import argparse
import json
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from game import Session, StuckError, BudgetExceeded  # noqa: E402
from policy import Policy  # noqa: E402

from policy import ROUND_VERBS  # noqa: E402

ACTION_BUTTONS = tuple(v for v in ROUND_VERBS if v != 'cancelMove')


def autopsy(seed, settle_polls=400, watch_turns=60, max_seconds=260):
    out = {'seed': seed, 'reached_freeze': False, 'turns': [], 'error': None,
           'final': None, 'rounds': 0}
    policy = Policy()
    started = time.time()
    try:
        with Session(seed, max_steps=200000, max_seconds=max_seconds, trace=False) as s:
            stale, last = 0, None
            watching = False
            seen_turns = 0
            while True:
                s.settle(policy)
                board = s.board()
                if board['phase'] == 'over':
                    break
                marker = (board['activations'], len(board['casualties']),
                          sum(1 for g in board['germans'] if g['isActive']))
                if board['roundNum'] > 1 and marker == last:
                    stale += 1
                else:
                    stale, last = 0, marker

                if not watching and stale > settle_polls:
                    watching = True
                    out['reached_freeze'] = True
                    out['rounds'] = board['roundNum']
                    live = [g for g in board['germans'] if g['isActive']]
                    d = {}
                    for g in live:
                        dd = s.distances([u['hexId'] for u in board['us']
                                          if u['isActive'] and not u['exited']], g['hexId'])
                        d[g['id']] = min(dd.values()) if dd else None
                    out['final'] = {
                        'vp': board['vp'],
                        'us': [{k: u[k] for k in ('id', 'hexId', 'stance', 'status', 'isActive',
                                                  'exited', 'mpa', 'weaponId', 'jammed')}
                               for u in board['us']],
                        'germans': [{'id': g['id'], 'hexId': g['hexId'], 'role': g['role'],
                                     'nearest_us_hexes': d.get(g['id'])} for g in live],
                    }

                # Record what the game offered this actor, before the policy answers.
                if watching and board['phase'] == 'round' and any(v in board['verbs'] for v in ACTION_BUTTONS):
                    actor = next((u for u in board['us'] if u['id'] == board['currentActorId']), None)
                    if actor:
                        enabled = [b for b in ACTION_BUTTONS if board['verbs'].get(b)]
                        out['turns'].append({
                            'round': board['roundNum'], 'id': actor['id'],
                            'stance': actor['stance'], 'status': actor['status'],
                            'enabled': enabled,
                        })
                        seen_turns += 1
                        if seen_turns >= watch_turns:
                            break

                if policy.act(s, board) is None:
                    time.sleep(0.05)
                if time.time() - started > max_seconds:
                    break
    except (StuckError, BudgetExceeded) as e:
        out['error'] = f'{type(e).__name__}: {e}'
    except Exception as e:
        out['error'] = f'{type(e).__name__}: {e}'
    out['seconds'] = round(time.time() - started, 1)
    return out


def classify(run):
    """Whose fault is this freeze?"""
    turns = run['turns']
    if not turns:
        return 'no turns observed'
    only_pass = sum(1 for t in turns if t['enabled'] in ([], ['pass']))
    could_move = sum(1 for t in turns if 'move' in t['enabled'])
    could_fire = sum(1 for t in turns if 'fireAimed' in t['enabled'] or 'fireSnap' in t['enabled'])
    could_stand = sum(1 for t in turns if 'changeStance' in t['enabled'])
    if could_fire:
        return 'GAME OFFERED FIRE (reachable, bot chose otherwise or missed)'
    if could_move:
        return 'GAME OFFERED MOVE (bot failed to close)'
    if could_stand:
        return 'only stance change offered (could stand, then move next turn)'
    if only_pass == len(turns):
        return 'NO LEGAL ACTION — pass only'
    return 'mixed'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seeds', type=int, nargs='+', required=True)
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--json', help='write full per-seed detail here')
    args = ap.parse_args()

    rows = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(autopsy, s): s for s in args.seeds}
        for i, f in enumerate(as_completed(futs), 1):
            r = f.result()
            rows.append(r)
            print(f'[{i}/{len(args.seeds)}] seed {r["seed"]} '
                  f'round {r["rounds"]} turns {len(r["turns"])} {r["seconds"]}s', flush=True)

    print('\n' + '=' * 86)
    print(f'{"seed":>6} {"round":>6} {"turns":>6}  {"verdict":<52}')
    print('-' * 86)
    verdicts = Counter()
    for r in sorted(rows, key=lambda x: x['seed']):
        v = classify(r)
        verdicts[v] += 1
        print(f'{r["seed"]:>6} {r["rounds"]:>6} {len(r["turns"]):>6}  {v:<52}')

    print('\nverdicts:')
    for v, n in verdicts.most_common():
        print(f'  {n:>3}  {v}')

    # What state were the soldiers actually in when nothing could be done?
    stances, statuses, enabled_sets = Counter(), Counter(), Counter()
    for r in rows:
        for t in r['turns']:
            stances[t['stance']] += 1
            statuses[t['status']] += 1
            enabled_sets[','.join(t['enabled']) or '(nothing)'] += 1
    print(f'\nacting soldier stance across {sum(stances.values())} observed turns: {dict(stances)}')
    print(f'acting soldier status: {dict(statuses)}')
    print('\nmost common action sets offered:')
    for combo, n in enabled_sets.most_common(6):
        print(f'  {n:>4}  {combo}')

    # Where the surviving Germans were, and how far away.
    print('\nsurviving Germans at freeze:')
    gd = Counter()
    for r in rows:
        for g in (r['final'] or {}).get('germans', []):
            gd[(g['role'], g['nearest_us_hexes'])] += 1
    for (role, dist), n in gd.most_common(8):
        print(f'  {n:>3}  {role:<18} nearest US soldier {dist} hexes away')

    if args.json:
        Path(args.json).write_text(json.dumps(rows, indent=1))
        print(f'\nfull detail -> {args.json}')


if __name__ == '__main__':
    sys.exit(main())

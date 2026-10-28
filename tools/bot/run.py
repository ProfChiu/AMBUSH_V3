#!/usr/bin/env python3
"""run.py — play Mission 1 automatically, once or in a seeded batch.

    python3 tools/bot/run.py --seed 12345 --headed        # watch one game
    python3 tools/bot/run.py --seeds 30 --workers 4       # a batch, parallel
    python3 tools/bot/run.py --seed 4417 --trace out.json # reproduce and dump the decisions

Every run is fully determined by its seed (Math.random is replaced before the page loads and the
policy has no randomness of its own), so any interesting run — a crash, a freak win, a wedge —
replays exactly from the seed printed in the summary.
"""
import argparse
import json
import statistics
import sys
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from game import Session, StuckError, BudgetExceeded  # noqa: E402
from policy import Policy  # noqa: E402


def play(seed, headless=True, max_steps=4000, max_seconds=600, keep_trace=False,
         difficulty='normal', walk=False):
    """Play one full game. Always returns a result dict — failures are data, not exceptions."""
    result = {
        'seed': seed, 'outcome': None, 'vp': None, 'need': None, 'result': None,
        'rounds': 0, 'activations': 0, 'casualties': 0, 'exited': 0, 'steps': 0,
        'seconds': 0.0, 'console_errors': [], 'error': None, 'trace': None,
    }
    started = time.time()
    policy = Policy(difficulty, walk=walk)
    holder = {}
    try:
        with Session(seed, headless=headless, max_steps=max_steps,
                     max_seconds=max_seconds, trace=True) as s:
            holder['s'] = s
            idle = 0
            # Stalemate watch. Rounds end ONLY when no active German remains (endRound), and
            # Ending 2 needs the Operations phase, so a fight that cannot be finished cannot be
            # left either. That is reachable in real play: §6/7 denies a wounded soldier the free
            # stance change, a panicked soldier falls prone at end of Round, and a prone soldier
            # cannot move at all — so a wounded, prone squad with the last German out of range is
            # frozen for ever. Recorded as its own outcome rather than mislabelled a harness bug.
            last_progress = (0, 0, 0)
            stale_rounds = 0
            while True:
                s.tick()
                s.settle(policy)
                board = s.board()
                if board['phase'] == 'over':
                    break
                marker = (board['activations'], len(board['casualties']),
                          sum(1 for g in board['germans'] if g['isActive']))
                if board['roundNum'] > 1 and marker == last_progress:
                    stale_rounds += 1
                    if stale_rounds > 900:
                        result.update(
                            outcome='stalemate', vp=board['vp']['total'], need=board['vp']['need'],
                            rounds=board['roundNum'], activations=board['activations'],
                            casualties=len(board['casualties']),
                            exited=sum(1 for u in board['us'] if u['exited']), result='lost')
                        raise StuckError(
                            f'stalemate: Round {board["roundNum"]} with '
                            f'{marker[2]} German(s) still active and nothing able to change')
                else:
                    stale_rounds = 0
                    last_progress = marker
                did = policy.act(s, board)
                if did is None:
                    idle += 1
                    # Give the UI a beat: a just-clicked action may still be opening its dialog.
                    time.sleep(0.08)
                    if idle > 25:
                        raise StuckError(f'no legal action for 25 polls in phase {board["phase"]}')
                else:
                    idle = 0
                    s.log('act', did)
                time.sleep(0.02)

            final = s.board()
            result.update(
                outcome='finished',
                vp=final['vp']['total'], need=final['vp']['need'],
                rounds=final['roundNum'], activations=final['activations'],
                casualties=len(final['casualties']),
                exited=sum(1 for u in final['us'] if u['exited']),
                result='won' if final['vp']['total'] >= final['vp']['need'] else 'lost',
                banner=final['banner'],
            )
            result['console_errors'] = list(s.errors)
            result['steps'] = s.steps
            if keep_trace:
                result['trace'] = s.trace
    except (StuckError, BudgetExceeded) as e:
        if result['outcome'] != 'stalemate':
            result['outcome'] = type(e).__name__
        result['error'] = str(e)
    except Exception as e:  # a genuine crash: the interesting case
        result['outcome'] = 'crash'
        result['error'] = f'{type(e).__name__}: {e}'
        result['traceback'] = traceback.format_exc()[-2000:]
    finally:
        # The trace matters most on the runs that did NOT finish — a wedge or a crash is only
        # diagnosable from what the bot was doing at the time. Capture it however the run ended.
        sess = holder.get('s')
        if sess is not None:
            result['steps'] = sess.steps
            result['console_errors'] = list(sess.errors)
            if keep_trace:
                result['trace'] = sess.trace
            if result['outcome'] != 'finished' and sess.trace:
                result['tail'] = sess.trace[-25:]
    result['seconds'] = round(time.time() - started, 1)
    return result


def summarise(rows):
    done = [r for r in rows if r['outcome'] == 'finished']
    print()
    print(f'{"seed":>8} {"outcome":<16} {"VP":>4} {"need":>5} {"res":<5} {"rnds":>5} '
          f'{"act":>4} {"cas":>4} {"exit":>5} {"errs":>5} {"secs":>6}')
    print('-' * 78)
    for r in sorted(rows, key=lambda x: x['seed']):
        print(f'{r["seed"]:>8} {str(r["outcome"]):<16} {str(r["vp"] if r["vp"] is not None else "-"):>4} '
              f'{str(r["need"] or "-"):>5} {str(r["result"] or "-"):<5} {r["rounds"]:>5} '
              f'{r["activations"]:>4} {r["casualties"]:>4} {r["exited"]:>5} '
              f'{len(r["console_errors"]):>5} {r["seconds"]:>6}')

    print()
    print(f'runs: {len(rows)}   finished: {len(done)}   '
          f'crashed: {sum(1 for r in rows if r["outcome"] == "crash")}   '
          f'stalemate: {sum(1 for r in rows if r["outcome"] == "stalemate")}   '
          f'stuck: {sum(1 for r in rows if r["outcome"] == "StuckError")}   '
          f'over budget: {sum(1 for r in rows if r["outcome"] == "BudgetExceeded")}')
    if done:
        vps = [r['vp'] for r in done]
        wins = [r for r in done if r['result'] == 'won']
        need = done[0]['need']
        print(f'VP: min {min(vps)}  median {statistics.median(vps)}  '
              f'mean {statistics.mean(vps):.1f}  max {max(vps)}   (target {need})')
        print(f'wins: {len(wins)}/{len(done)} = {100 * len(wins) / len(done):.0f}%')
        print(f'German activations: median {statistics.median([r["activations"] for r in done])}   '
              f'casualties: median {statistics.median([r["casualties"] for r in done])}')
    bad = [r for r in rows if r['outcome'] != 'finished' or r['console_errors']]
    if bad:
        print()
        print('reproduce:')
        for r in bad:
            why = r['error'] or f'{len(r["console_errors"])} console error(s)'
            print(f'  python3 tools/bot/run.py --seed {r["seed"]} --headed    # {why}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, help='play exactly this seed')
    ap.add_argument('--seeds', type=int, default=0, help='play N seeds starting at --seed-base')
    ap.add_argument('--seed-base', type=int, default=1000)
    ap.add_argument('--workers', type=int, default=1)
    ap.add_argument('--headed', action='store_true', help='show the browser (single runs)')
    ap.add_argument('--max-steps', type=int, default=4000)
    ap.add_argument('--max-seconds', type=int, default=600)
    ap.add_argument('--trace', help='write the decision trace of a single run to this path')
    ap.add_argument('--jsonl', help='append every run result to this file')
    ap.add_argument('--difficulty', default='normal', choices=['normal', 'easy'],
                    help='which start-screen difficulty to play')
    ap.add_argument('--walk', action='store_true',
                    help='use task 6 multi-hex Operations walks (changes play, so not the baseline)')
    args = ap.parse_args()

    if args.seeds:
        seeds = [args.seed_base + i for i in range(args.seeds)]
    elif args.seed is not None:
        seeds = [args.seed]
    else:
        ap.error('give --seed or --seeds')

    rows = []
    t0 = time.time()
    if len(seeds) == 1:
        rows.append(play(seeds[0], headless=not args.headed, max_steps=args.max_steps,
                         max_seconds=args.max_seconds, keep_trace=bool(args.trace),
                         difficulty=args.difficulty, walk=args.walk))
        if args.trace and rows[0].get('trace'):
            Path(args.trace).write_text(json.dumps(rows[0]['trace'], indent=1))
            print(f'trace -> {args.trace} ({len(rows[0]["trace"])} entries)')
    else:
        with ProcessPoolExecutor(max_workers=args.workers) as pool:
            futures = {pool.submit(play, s, True, args.max_steps, args.max_seconds, False,
                                   args.difficulty, args.walk): s for s in seeds}
            for i, fut in enumerate(as_completed(futures), 1):
                r = fut.result()
                rows.append(r)
                print(f'[{i}/{len(seeds)}] seed {r["seed"]:>6}  {r["outcome"]:<16} '
                      f'VP {r["vp"]}  {r["seconds"]}s', flush=True)

    for r in rows:
        r.pop('trace', None)
    if args.jsonl:
        with open(args.jsonl, 'a') as f:
            for r in rows:
                f.write(json.dumps(r) + '\n')

    summarise(rows)
    print(f'\nwall clock: {time.time() - t0:.0f}s')
    return 0


if __name__ == '__main__':
    sys.exit(main())

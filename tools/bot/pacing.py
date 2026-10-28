#!/usr/bin/env python3
"""pacing.py — how much clicking does a game of Mission 1 actually cost the player?

The bot answers "does it hold together" and "is it winnable". It cannot answer the question the
project's own standing caveat keeps raising: whether Round 4 drags, whether the popup-per-step
chain still pleases on the third firefight. That is a judgement only a person makes — but the
COUNTABLE half of it is countable, and this measures it.

Every dialog the page presents is recorded from inside the page (__mission1Debug.dialogLog(), so
nothing is missed between Python polls), tagged with the phase and Round it appeared in, and classified as:

  * decision  — the dialog asked the player to choose between rows (target, option, stance, ...)
  * ack       — the dialog told the player something and wanted one press to continue

The ratio of the two is the pacing signal inside Action Rounds, where the player's choices really
are made in dialogs (pick a target, pick an option, pick a stance).

**Read the Operations numbers differently.** Operations shows zero `decision` dialogs, and that is
an artefact of the instrument, NOT a finding that the phase is agency-free: movement there is
chosen by clicking a destination hex on the map, which is not a dialog and so is invisible here.
Treat Operations' count as "dialogs the player must dismiss", not as "clicks with no agency", and
do not compute an acks-per-choice ratio for it — the denominator is missing, not zero.

For the same reason the longest-unbroken-`ack`-run figure is only meaningful within an Action
Round. Across Operations it spans many map clicks and overstates the tedium.

    python3 tools/bot/pacing.py --seeds 5 --seed-base 7000

**The headline number** (Gate 0 answer 7, 2026-09-19) is PRESSES PER REAL DECISION, counted from the
bot's own presses through the automation seam: every dialog press and every board action, divided
by the decisions among them (dialog row choices, dialogs offering two or more real buttons, and
board actions except Start Next Round / Cancel move). 1.0 means the player never presses just to
acknowledge. The dialog-count tables below it are the secondary, descriptive view.
"""
import argparse
import json
import statistics
import sys
import time
from collections import Counter
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from game import Session, StuckError, BudgetExceeded  # noqa: E402
from policy import Policy  # noqa: E402

# The page records every dialog it presents (__mission1Debug.dialogLog(): title, row count, phase),
# from inside Dialogs.present, so nothing is missed between Python polls and nothing depends on
# the page's markup. One entry per dialog PRESENTED — including each dialog in a queued chain.
#
# Instrument change (v2 task 2, 2026-09-19): until then this counted backdrop open->close
# transitions with a MutationObserver. A queued chain (the next dialog presented without the
# backdrop ever closing) counted as ONE dialog, so the old figures undercount. Compare only with
# numbers measured by this version; the re-measured v1-presentation baseline is in PROGRESS.md.


def events_from_log(log):
    return [{'title': e['title'], 'phase': e['phase'],
             'kind': 'decision' if e['rows'] > 0 else 'ack', 'rows': e['rows']}
            for e in log if not e.get('modeless')]  # resolution-card lines are not dialogs


def play(seed, difficulty='normal', max_seconds=250):
    policy = Policy(difficulty)
    out = {'seed': seed, 'events': [], 'presses': [], 'outcome': None, 'rounds': 0, 'error': None}
    with Session(seed, max_steps=20000, max_seconds=max_seconds, trace=False) as s:
        try:
            while True:
                s.settle(policy)
                b = s.board()
                if b['phase'] == 'over':
                    out['outcome'] = 'finished'
                    out['rounds'] = b['roundNum']
                    break
                if policy.act(s, b) is None:
                    time.sleep(0.02)
        except (StuckError, BudgetExceeded) as e:
            out['outcome'] = type(e).__name__
            out['rounds'] = s.board().get('roundNum', 0)
        except Exception as e:  # noqa: BLE001 - reported, not swallowed
            out['error'] = f'{type(e).__name__}: {e}'
        out['presses'] = list(s.presses)
        out['events'] = events_from_log(s._page.page.evaluate('() => window.__mission1Debug.dialogLog()'))
    return out


def summarise(run):
    ev = run['events']
    phases = {}
    for e in ev:
        phases.setdefault(e['phase'] or '(none)', []).append(e)
    # longest unbroken run of ack dialogs, and where it happened
    longest, cur, where, cur_where = 0, 0, '', ''
    for e in ev:
        if e['kind'] == 'ack':
            cur += 1
            cur_where = e['phase']
            if cur > longest:
                longest, where = cur, cur_where
        else:
            cur = 0
    acks = sum(1 for e in ev if e['kind'] == 'ack')
    decisions = len(ev) - acks
    # ack/decision split per broad phase — the click-through-vs-engagement signal
    broad = {}
    for e in ev:
        ph = e['phase'] or '(start)'
        key = ('Operations' if ph.startswith('Operations')
               else 'Action Round' if ph.startswith('Action Round') else ph.strip() or '(start)')
        d = broad.setdefault(key, {'ack': 0, 'decision': 0})
        d[e['kind']] += 1
    # THE measure (Gate 0 answer 7): every press / real decisions. 1.0 means no acknowledgements.
    pr = run['presses']
    n_dec = sum(1 for k, _ in pr if k == 'decision')
    by_phase = {}
    for k, ph in pr:
        d = by_phase.setdefault(ph or '(start)', {'presses': 0, 'decisions': 0})
        d['presses'] += 1
        d['decisions'] += k == 'decision'
    return {
        'presses': len(pr), 'press_decisions': n_dec,
        'presses_per_decision': round(len(pr) / n_dec, 2) if n_dec else None,
        'press_phases': by_phase,
        'seed': run['seed'], 'outcome': run['outcome'], 'rounds': run['rounds'],
        'broad': broad,
        'dialogs': len(ev), 'acks': acks, 'decisions': decisions,
        'acks_per_decision': round(acks / decisions, 1) if decisions else None,
        'longest_ack_run': longest, 'longest_ack_run_in': where,
        'per_phase': {k: len(v) for k, v in sorted(phases.items())},
        'titles': Counter(e['title'] for e in ev),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seeds', type=int, default=5)
    ap.add_argument('--seed-base', type=int, default=7000)
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--difficulty', default='normal', choices=['normal', 'easy'])
    ap.add_argument('--json', help='write the full per-seed detail here')
    args = ap.parse_args()

    seeds = [args.seed_base + i for i in range(args.seeds)]
    rows = []
    with ProcessPoolExecutor(max_workers=args.workers) as pool:
        futs = {pool.submit(play, s, args.difficulty, 250): s for s in seeds}
        for i, f in enumerate(as_completed(futs), 1):
            r = f.result()
            rows.append(summarise(r))
            print(f'[{i}/{len(seeds)}] seed {r["seed"]} {r["outcome"]} '
                  f'{len(r["events"])} dialogs', flush=True)

    rows.sort(key=lambda r: r['seed'])
    print('\n' + '=' * 86)
    print('PRESSES PER REAL DECISION (the v2 measure; 1.0 = no acknowledgement presses)')
    print(f'{"seed":>6} {"presses":>8} {"decisions":>10} {"per decision":>13}   Action Rounds only')
    for r in rows:
        ar = r['press_phases'].get('Action Round', {'presses': 0, 'decisions': 0})
        ar_ratio = f'{ar["presses"] / ar["decisions"]:.2f}' if ar['decisions'] else 'n/a'
        print(f'{r["seed"]:>6} {r["presses"]:>8} {r["press_decisions"]:>10} '
              f'{str(r["presses_per_decision"]):>13}   {ar_ratio}')
    ppd = [r['presses_per_decision'] for r in rows if r['presses_per_decision']]
    if ppd:
        print(f'median presses per decision: {statistics.median(ppd):.2f}')
    print('\n' + '=' * 86)
    print(f'{"seed":>6} {"outcome":>10} {"rnds":>5} {"dialogs":>8} {"acks":>6} {"choices":>8} '
          f'{"acks/choice":>12} {"longest run":>12}')
    print('-' * 86)
    for r in rows:
        print(f'{r["seed"]:>6} {str(r["outcome"]):>10} {r["rounds"]:>5} {r["dialogs"]:>8} '
              f'{r["acks"]:>6} {r["decisions"]:>8} {str(r["acks_per_decision"]):>12} '
              f'{r["longest_ack_run"]:>12}')

    dialogs = [r['dialogs'] for r in rows]
    runs = [r['longest_ack_run'] for r in rows]
    ratios = [r['acks_per_decision'] for r in rows if r['acks_per_decision'] is not None]
    print(f'\ndialogs per game   median {statistics.median(dialogs):.0f}  '
          f'min {min(dialogs)}  max {max(dialogs)}')
    if ratios:
        print(f'acks per decision  median {statistics.median(ratios):.1f}   '
              f'(whole-game figure; see the Operations caveat in this file\'s docstring)')
    print(f'longest unbroken ack run  median {statistics.median(runs):.0f}  '
          f'max {max(runs)} (in {max(rows, key=lambda r: r["longest_ack_run"])["longest_ack_run_in"]})'
          '  — only meaningful within an Action Round')

    # The split that actually reads cleanly: dialogs the player dismisses, per phase.
    broad = {}
    for r in rows:
        for k, v in r['broad'].items():
            d = broad.setdefault(k, {'ack': 0, 'decision': 0})
            d['ack'] += v['ack']; d['decision'] += v['decision']
    print('\nper phase, pooled across all games:')
    print(f'  {"phase":<16}{"acks":>7}{"dialog choices":>16}{"acks per choice":>18}')
    for k, v in sorted(broad.items(), key=lambda x: -(x[1]['ack'] + x[1]['decision'])):
        ratio = f'{v["ack"] / v["decision"]:.1f}' if v['decision'] else 'n/a (map clicks)'
        print(f'  {k:<16}{v["ack"]:>7}{v["decision"]:>16}{ratio:>18}')

    combined = Counter()
    for r in rows:
        combined.update(r['titles'])
    print('\nmost frequent dialogs across all games:')
    for title, n in combined.most_common(12):
        print(f'  {n:>5}  {title}')

    if args.json:
        Path(args.json).write_text(json.dumps(
            [{k: (dict(v) if isinstance(v, Counter) else v) for k, v in r.items()} for r in rows],
            indent=1))
        print(f'\nfull detail -> {args.json}')


if __name__ == '__main__':
    sys.exit(main())

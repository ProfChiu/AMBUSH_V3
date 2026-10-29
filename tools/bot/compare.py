#!/usr/bin/env python3
"""compare.py — is a bot run identical to a baseline? (refactor proof, docs/REFACTOR_MAP.md 6.1)

    python3 tools/bot/compare.py BASE.jsonl NEW.jsonl            # run records, one per seed
    python3 tools/bot/compare.py BASE.jsonl NEW.jsonl --seeds 7000-7005
    python3 tools/bot/compare.py --trace BASE.json NEW.json      # two `run.py --trace` files

Run records: every field is compared except `seconds` (wall clock) and `steps`. `steps` counts the
harness's own polling loops and jitters run to run on unchanged code (tools/bot/baselines/README.md;
measured again at refactor Step 0: 30/30 seeds differed in steps only, by -6..+80); --with-steps
compares it too. The decision trace (--trace) is the strong same-game check instead. A seed present in one file and
not the other is a difference. With --seeds, only that range is compared (both files must hold it).
If a file holds a seed twice (run.py --jsonl appends), the last record wins.

Traces: each entry is {step, t, kind, detail}. `t` (wall clock) is always ignored; `step` (the
harness's own loop counter) is ignored unless --keep-step. Entries are compared in order, and the
first differing entry is shown with its index.

Exit code: 0 identical, 1 different, 2 usage / unreadable file.
"""
import argparse
import json
import sys

IGNORED = {'seconds', 'steps'}


def load_jsonl(path):
    recs = {}
    with open(path) as f:
        for n, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
            except ValueError as e:
                raise ValueError(f'{path}:{n}: not JSON ({e})')
            recs[r['seed']] = r
    return recs


def seed_range(spec):
    if '-' in spec:
        a, b = spec.split('-', 1)
        return set(range(int(a), int(b) + 1))
    return {int(s) for s in spec.split(',')}


def compare_runs(base_path, new_path, seeds=None, ignored=IGNORED):
    base, new = load_jsonl(base_path), load_jsonl(new_path)
    if seeds is not None:
        missing = [s for s in sorted(seeds) if s not in base or s not in new]
        if missing:
            print(f'DIFFERENT: seeds missing from a file: {missing}')
            return 1
        base = {s: base[s] for s in seeds}
        new = {s: new[s] for s in seeds}
    diffs = []
    for seed in sorted(set(base) | set(new)):
        if seed not in base:
            diffs.append((seed, ['(only in NEW)']))
            continue
        if seed not in new:
            diffs.append((seed, ['(only in BASE)']))
            continue
        a, b = base[seed], new[seed]
        fields = []
        for k in sorted((set(a) | set(b)) - ignored):
            if a.get(k) != b.get(k):
                fields.append(f'{k}: {json.dumps(a.get(k))} -> {json.dumps(b.get(k))}')
        if fields:
            diffs.append((seed, fields))
    n = len(set(base) | set(new))
    if not diffs:
        print(f'IDENTICAL: {n} seeds ({min(base)}-{max(base)}), every field but {"/".join(sorted(ignored))}')
        return 0
    print(f'DIFFERENT: {len(diffs)} of {n} seeds')
    for seed, fields in diffs:
        print(f'  seed {seed}:')
        for f in fields:
            print(f'    {f}')
    return 1


def norm_trace(entries, keep_step):
    out = []
    for e in entries:
        e = dict(e)
        e.pop('t', None)
        if not keep_step:
            e.pop('step', None)
        out.append(json.dumps(e, sort_keys=True))
    return out


def compare_traces(base_path, new_path, keep_step=False):
    with open(base_path) as f:
        a = norm_trace(json.load(f), keep_step)
    with open(new_path) as f:
        b = norm_trace(json.load(f), keep_step)
    for i, (x, y) in enumerate(zip(a, b)):
        if x != y:
            print(f'DIFFERENT: first difference at entry {i} (of {len(a)} / {len(b)})')
            print(f'  BASE: {x[:400]}')
            print(f'  NEW:  {y[:400]}')
            return 1
    if len(a) != len(b):
        i = min(len(a), len(b))
        longer = 'BASE' if len(a) > len(b) else 'NEW'
        extra = (a if len(a) > len(b) else b)[i]
        print(f'DIFFERENT: same first {i} entries, then {longer} goes on ({len(a)} / {len(b)})')
        print(f'  {longer}: {extra[:400]}')
        return 1
    print(f'IDENTICAL: {len(a)} trace entries' + ('' if keep_step else ' (t and step ignored)'))
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('base')
    ap.add_argument('new')
    ap.add_argument('--trace', action='store_true', help='compare two run.py --trace files')
    ap.add_argument('--keep-step', action='store_true', help='traces: also compare the step counter')
    ap.add_argument('--with-steps', action='store_true', help='runs: also compare steps (jitters)')
    ap.add_argument('--seeds', help='runs: only these seeds, e.g. 7000-7005 or 7000,7003')
    args = ap.parse_args()
    try:
        if args.trace:
            return compare_traces(args.base, args.new, args.keep_step)
        return compare_runs(args.base, args.new, seed_range(args.seeds) if args.seeds else None,
                            {'seconds'} if args.with_steps else IGNORED)
    except (OSError, KeyError, ValueError) as e:
        print(f'ERROR: {e}')
        return 2


if __name__ == '__main__':
    sys.exit(main())

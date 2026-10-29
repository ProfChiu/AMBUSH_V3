#!/bin/bash
# T1 quick proof for the refactor (docs/REFACTOR_MAP.md 6.1), ~4-6 min:
#   node --check on apps/v3/*.js and apps/v3/mission1/*.js; the 17 engine suites;
#   bot parity seeds 7000-7005, Normal and Easy, against the v3_* baselines (tools/bot/compare.py);
#   the seed-7000 decision trace, both difficulties, against tools/bot/baselines/refactor/.
# Usage: bash tools/t1.sh [--keep]     (run from anywhere; --keep keeps the work dir)
# Prints one summary line "T1 PASS ..." or "T1 FAIL: <parts>"; exit 0 on PASS, 1 on FAIL.
cd "$(dirname "$0")/.." || exit 2
export AMBUSH_PAGE=v3
W=$(mktemp -d "${TMPDIR:-/tmp}/ambush_t1.XXXXXX")
B=tools/bot/baselines
R=$B/refactor
T0=$(date +%s)
FAIL=()

# 1. syntax
n=0
for f in apps/v3/*.js apps/v3/mission1/*.js; do
  [ -f "$f" ] || continue
  n=$((n+1))
  node --check "$f" 2>>"$W/check.log" || FAIL+=("node --check $f")
done
echo "node --check: $n files"

# 2. engine suites
ns=0
for t in tools/test_*.js; do
  ns=$((ns+1))
  node "$t" >"$W/suite_$(basename "$t" .js).log" 2>&1 || FAIL+=("suite $(basename "$t")")
done
echo "suites: $ns run"

# 3+4. parity 7000-7005 and the seed-7000 traces, both difficulties (4 browsers at a time)
for d in normal easy; do
  python3 tools/bot/run.py --seeds 6 --seed-base 7000 --workers 3 --difficulty $d \
      --jsonl "$W/par_$d.jsonl" >"$W/par_$d.log" 2>&1 &
  p1=$!
  python3 tools/bot/run.py --seed 7000 --difficulty $d --trace "$W/trace_$d.json" \
      >"$W/trace_$d.log" 2>&1 &
  p2=$!
  wait $p1 $p2
  python3 tools/bot/compare.py $B/v3_${d}_seeds_7000-7029.jsonl "$W/par_$d.jsonl" --seeds 7000-7005 \
      >"$W/cmp_$d.txt" 2>&1 || FAIL+=("parity $d: $(head -1 "$W/cmp_$d.txt")")
  python3 tools/bot/compare.py --trace $R/trace_${d}_7000.json "$W/trace_$d.json" \
      >"$W/cmpt_$d.txt" 2>&1 || FAIL+=("trace $d: $(head -1 "$W/cmpt_$d.txt")")
  echo "parity $d: $(head -1 "$W/cmp_$d.txt") | trace $d: $(head -1 "$W/cmpt_$d.txt")"
done

S=$(( $(date +%s) - T0 ))
if [ ${#FAIL[@]} -eq 0 ]; then
  echo "T1 PASS: $n files checked, $ns suites, parity 6+6 identical, traces identical (${S}s)"
  [ "$1" = "--keep" ] && echo "work dir: $W" || rm -rf "$W"
  exit 0
fi
echo "T1 FAIL (${S}s): $(printf '%s; ' "${FAIL[@]}") work dir: $W"
exit 1

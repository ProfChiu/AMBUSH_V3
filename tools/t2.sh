#!/bin/bash
# T2 full proof for the refactor (docs/REFACTOR_MAP.md 6.1), ~20-25 min:
#   T1 (tools/t1.sh); bot parity 30/30 Normal and 30/30 Easy against the v3_* baselines;
#   the five tools/live_*.py (each asserts 0 console errors); the engine check.
# Engine check: the 19 rules modules in apps/game/ must match the Step 0 manifest
# (tools/bot/baselines/refactor/engine.sha256). apps/game differs from v2 by design since Phase 8c
# in three files (arscheduler, paragraphinterpreter, operationsloop); the other 16 are also
# cmp'd against ../AMBUSH_V2/apps/game/ as a second check.
# Usage: bash tools/t2.sh [--keep]
# Prints one summary line "T2 PASS ..." or "T2 FAIL: <parts>"; exit 0 on PASS, 1 on FAIL.
cd "$(dirname "$0")/.." || exit 2
export AMBUSH_PAGE=v3
W=$(mktemp -d "${TMPDIR:-/tmp}/ambush_t2.XXXXXX")
B=tools/bot/baselines
R=$B/refactor
T0=$(date +%s)
FAIL=()

bash tools/t1.sh >"$W/t1.log" 2>&1 || FAIL+=("$(grep "^T1 " "$W/t1.log")")
grep "^T1 " "$W/t1.log"

for d in normal easy; do
  python3 tools/bot/run.py --seeds 30 --seed-base 7000 --workers 4 --difficulty $d \
      --jsonl "$W/par30_$d.jsonl" >"$W/par30_$d.log" 2>&1
  python3 tools/bot/compare.py $B/v3_${d}_seeds_7000-7029.jsonl "$W/par30_$d.jsonl" \
      >"$W/cmp30_$d.txt" 2>&1 || FAIL+=("parity30 $d: $(head -1 "$W/cmp30_$d.txt")")
  echo "parity 30 $d: $(head -1 "$W/cmp30_$d.txt")"
done

for f in tools/live_*.py; do
  python3 "$f" >"$W/$(basename "$f" .py).log" 2>&1 || FAIL+=("$(basename "$f")")
  echo "$(basename "$f"): $(grep -c '^  ok ' "$W/$(basename "$f" .py).log") ok, $(grep -c '^  FAIL' "$W/$(basename "$f" .py).log") fail"
done

shasum -a 256 -c $R/engine.sha256 >"$W/engine.txt" 2>&1 || FAIL+=("engine manifest: $(grep -v ': OK' "$W/engine.txt" | head -3 | tr '\n' ' ')")
nv=0
for f in hexgrid movementrules losrules checksrules arrules firecombat grenaderules assaultrules \
         crewweaponrules hazardrules penetrationrules equipmentrules squadgenrules victoryrules \
         difficulty germanactions; do
  nv=$((nv+1))
  cmp -s apps/game/$f.js ../AMBUSH_V2/apps/game/$f.js || FAIL+=("engine $f.js differs from v2")
done
echo "engine: $(grep -c ': OK' "$W/engine.txt")/19 match manifest; $nv cmp'd with v2"

S=$(( $(date +%s) - T0 ))
if [ ${#FAIL[@]} -eq 0 ]; then
  echo "T2 PASS: T1 + parity 30/30 + 30/30 identical, 5 live drives pass, engine unchanged (${S}s)"
  [ "$1" = "--keep" ] && echo "work dir: $W" || rm -rf "$W"
  exit 0
fi
echo "T2 FAIL (${S}s): $(printf '%s; ' "${FAIL[@]}") work dir: $W"
exit 1

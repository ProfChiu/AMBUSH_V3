#!/usr/bin/env python3
"""patch_mission_cards.py — Phase 8c errata for Mission 1's mission-card cells.

The ToolBox spreadsheet (reference/Ambush!_ToolBoxV4.xlsm, not in this folder) carries 11
Mission 1 cells with a missing or stray dash, which the engine's parseCellValue reads as
'unknown', so the hex is silent. Each fix is cross-checked against a neighbouring Condition of
the same hex: Condition 3's row matches Condition 4's cell by cell except for the dash, and
the Condition 1/2 strays differ from their twin only by the stray character.

Rewrites assets/data/mission_cards.json and .js in place and records the fixes under
"corrections_applied". Idempotent: a cell already corrected is left alone.
  python3 tools/patch_mission_cards.py
"""
import json
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')
JSON_PATH = os.path.join(ROOT, 'assets/data/mission_cards.json')
JS_PATH = os.path.join(ROOT, 'assets/data/mission_cards.js')

# (mission, condition, cell, was, now, cross-check)
FIXES = [
    ('1', '1', 'E-12', '-186', '186', 'Condition 2 E-12 = 186'),
    ('1', '2', 'V-04', 'NONE-', 'NONE', 'Conditions 1 and 4 V-04 = NONE'),
    ('1', '3', 'E-11', 'S1186', 's1-186', 'Condition 4 E-11 = S1-186'),
    ('1', '3', 'H-05', 'S1190', 's1-190', 'Condition 4 H-05 = S1-190'),
    ('1', '3', 'H-11', 'S1190', 's1-190', 'Condition 4 H-11 = S1-190'),
    ('1', '3', 'I-04', 'S1299', 's1-299', 'Condition 4 I-04 = S1-299'),
    ('1', '3', 'I-05', 'S1190', 's1-190', 'Condition 4 I-05 = S1-190'),
    ('1', '3', 'J-05', 'S1190', 's1-190', 'Condition 4 J-05 = S1-190'),
    ('1', '3', 'K-04', 'S1179', 's1-179', 'Condition 4 K-04 = S1-179'),
    ('1', '3', 'L-04', 'S1179', 's1-179', 'Condition 4 L-04 = S1-179'),
    ('1', '3', 'M-04', 'S1195', 's1-195', 'Condition 4 M-04 = S1-195'),
]

with open(JSON_PATH) as f:
    data = json.load(f)
cards = data['mission_cards']
log = data.setdefault('corrections_applied', [])
changed = 0
for mission, cond, cell, was, now, why in FIXES:
    cur = cards[mission][cond][cell]
    if cur == now:
        continue
    if cur != was:
        raise SystemExit('M%s C%s %s is %r, expected %r' % (mission, cond, cell, cur, was))
    cards[mission][cond][cell] = now
    log.append({'mission': mission, 'condition': cond, 'cell': cell, 'was': was, 'now': now,
                'cross_check': why, 'by': 'tools/patch_mission_cards.py (Phase 8c, 2026-10-25)'})
    changed += 1

body = json.dumps(data, indent=1, ensure_ascii=False)
with open(JSON_PATH, 'w') as f:
    f.write(body)
with open(JS_PATH) as f:
    header = f.readline()
with open(JS_PATH, 'w') as f:
    f.write(header)
    f.write('window.AMBUSH_MISSION_CARDS = ' + body + ';\n')
print('%d cell(s) corrected, %d already correct' % (changed, len(FIXES) - changed))

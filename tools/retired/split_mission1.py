#!/usr/bin/env python3
"""R3 Step 3 (docs/REFACTOR_MAP.md 5.3 Stage A): cut apps/v3/mission1.js into 13 plain scripts.

Reads mission1.js as it stood at commit 689a433 (git show), so the cut is reproducible after the
file is gone. Code moves byte for byte, in original line order. Only the IIFE's three wrapper lines
go: line 23 `(function () {`, line 24 `  'use strict';` and line 5872 `})();`. Each output file gets
two added lines: `'use strict';` (the IIFE's directive, now per script) and a one-line header
comment. tools/check_split.py strips exactly those two lines and compares the rest to the source.

Usage: python3 tools/split_mission1.py        (run from anywhere)
"""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_REV = '689a433'
SRC_PATH = 'apps/v3/mission1.js'
OUT = ROOT / 'apps/v3/mission1'

WRAPPER = {23: '(function () {', 24: "  'use strict';", 5872: '})();'}

# (file, [(first, last), ...] 1-based inclusive line ranges of the source, description).
# Boundaries are the section-marker comments of the 689a433 file; the section-to-file
# assignment is REFACTOR_MAP 5.4's.
FILES = [
    ('core', [(1, 22), (25, 365)], 'engine and data aliases, constants, terrain/LOS tables, weapon rules, VP target, difficulty'),
    ('present', [(366, 979)], 'dice, voice, log, pop-up helpers, Resolve, FX'),
    ('info', [(980, 1305)], 'Info (the map as information surface), Sight'),
    ('roster', [(1306, 1581)], 'map rendering, counters, game state vars, finders, kit and tokens, roster/VP render'),
    ('setup', [(1582, 1795)], 'section 4 squad generation, entry placement'),
    ('operations', [(1796, 2488)], 'selection, destinations, combo moves, walking, HUD, Paragraph Check, step chain'),
    ('contact', [(2489, 2880)], 'contact terms, German activation, German card, tooltips, inspectors'),
    ('rounds', [(2881, 3467)], 'Action Round start, events, awareness, initiative, track, turns, action panel'),
    ('verbs', [(3468, 4134)], "the player's verbs: grenade, drag, pick up, command, stance, prepare, fire, assault, jam"),
    ('german', [(4135, 4733)], 'German turn, German actions, German movement by reference'),
    ('combat', [(4734, 5323)], 'fire, hidden fire, grenade and assault chains, damage, capture, round end, exit, victory'),
    ('save', [(5324, 5603)], 'save/load, start screen, game flow'),
    ('seams', [(5604, 5871)], 'VERBS, verbsOffered, __mission1Debug, AmbushMission'),
]
ORDER = [f for f, _, _ in FILES]


def source_lines():
    text = subprocess.run(['git', 'show', SRC_REV + ':' + SRC_PATH], cwd=ROOT, check=True,
                          capture_output=True, text=True).stdout
    lines = text.splitlines(keepends=True)
    assert len(lines) == 5872, len(lines)
    for n, want in WRAPPER.items():
        assert lines[n - 1].rstrip('\n') == want, (n, lines[n - 1])
    return lines


def header(i, name, ranges, desc):
    span = ', '.join('%d-%d' % r for r in ranges)
    return ("'use strict';\n",
            '// mission1/%s.js (%d of 13) — %s. Stage A cut of mission1.js lines %s (docs/REFACTOR_MAP.md 5.4).\n'
            % (name, i + 1, desc, span))


def main():
    lines = source_lines()
    # every source line is either a wrapper line or in exactly one range, in order
    covered = []
    for _, ranges, _ in FILES:
        for a, b in ranges:
            covered.extend(range(a, b + 1))
    assert covered == [n for n in range(1, 5873) if n not in WRAPPER], 'ranges do not tile the source'
    OUT.mkdir(exist_ok=True)
    for i, (name, ranges, desc) in enumerate(FILES):
        body = ''.join(''.join(lines[a - 1:b]) for a, b in ranges)
        path = OUT / (name + '.js')
        path.write_text(''.join(header(i, name, ranges, desc)) + body, encoding='utf-8')
        print('%-11s %5d lines  (%s)' % (name + '.js', body.count('\n'), ', '.join('%d-%d' % r for r in ranges)))


if __name__ == '__main__':
    main()

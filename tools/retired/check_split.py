#!/usr/bin/env python3
"""R3 Step 3 proof: the 13 files in apps/v3/mission1/ hold mission1.js's IIFE body byte for byte.

Strips each file's first two lines (`'use strict';` and the one-line header that
tools/split_mission1.py adds), concatenates the files in load order, and compares the result to
`git show 689a433:apps/v3/mission1.js` with only the IIFE's wrapper lines (23, 24, 5872) removed.
Also checks that index.html loads the 13 files in that order, once each, and no longer loads
mission1.js. Prints one line, "check_split PASS ..." or "check_split FAIL: ..."; exit 0/1.
"""
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORDER = ['core', 'present', 'info', 'roster', 'setup', 'operations', 'contact', 'rounds', 'verbs',
         'german', 'combat', 'save', 'seams']
WRAPPER = (23, 24, 5872)


def main():
    src = subprocess.run(['git', 'show', '689a433:apps/v3/mission1.js'], cwd=ROOT, check=True,
                         capture_output=True, text=True).stdout.splitlines(keepends=True)
    want = ''.join(l for n, l in enumerate(src, 1) if n not in WRAPPER)
    parts, fails = [], []
    for name in ORDER:
        lines = (ROOT / 'apps/v3/mission1' / (name + '.js')).read_text(encoding='utf-8').splitlines(keepends=True)
        if lines[0] != "'use strict';\n" or not lines[1].startswith('// mission1/%s.js ' % name):
            fails.append('%s.js header' % name)
        parts.append(''.join(lines[2:]))
    got = ''.join(parts)
    if got != want:
        g, w = got.splitlines(), want.splitlines()
        k = next((i for i, (a, b) in enumerate(zip(g, w)) if a != b), min(len(g), len(w)))
        fails.append('body differs at concatenated line %d (got %d lines, want %d)' % (k + 1, len(g), len(w)))
    html = (ROOT / 'apps/v3/index.html').read_text(encoding='utf-8')
    srcs = re.findall(r'<script src="([^"]+)"', html)
    m1 = [s for s in srcs if s.startswith('mission1/')]
    if m1 != ['mission1/%s.js' % n for n in ORDER]:
        fails.append('index.html order: %s' % m1)
    if any(s.endswith('mission1.js') for s in srcs):
        fails.append('index.html still loads mission1.js')
    if fails:
        print('check_split FAIL: ' + '; '.join(fails))
        sys.exit(1)
    print('check_split PASS: 13 files, %d body lines identical to 689a433 mission1.js minus the IIFE wrapper'
          % len(want.splitlines()))


if __name__ == '__main__':
    main()

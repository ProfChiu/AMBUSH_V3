#!/usr/bin/env python3
"""R6 Step 9 (Stage C) proof: apps/v3/mission1/ puts exactly three names on window.

Since Stage C (docs/REFACTOR_MAP.md 5.3) each of the 13 files is an IIFE that shares through
window.AmbushM1 (tools/exports.py). This loads apps/v3/index.html in Chromium twice, with and
without the 13 files, and checks:
  1. every file is wrapped: no top-level `function` / `var` of a mission1 file is left on window
     (the R3 listing, 2-space-indented declarations of an unwrapped file, must be empty);
  2. the page's globals minus a blank page's and minus the other scripts' are exactly
     AmbushM1 (core.js), AmbushMission and __mission1Debug (seams.js), plus __v3stack, which
     stack.js sets only once AmbushMission exists (so it is absent from the page without mission1/);
  3. none of those is a browser global or another script's global;
  4. no console error or page error on load.
Prints one line, "check_globals PASS ..." or "check_globals FAIL: ..."; exit 0/1.
(History: 345 top-level names on window after R3's Stage A cut; R6 took them to 0.)
"""
import pathlib
import re
import sys
import tempfile

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
V3 = ROOT / 'apps/v3'
ASSIGNED = {'AmbushMission', '__mission1Debug', 'AmbushM1'}  # window.X = ..., not declarations (AmbushM1: Stage B, R5)
ASSIGNED |= {'__v3stack'}  # stack.js sets it only once AmbushMission exists, so it is absent from (2)


def split_top(s):
    """Split one line's declarator list on commas outside brackets and strings."""
    out, depth, cur, q = [], 0, '', None
    for ch in s:
        if q:
            cur += ch
            if ch == q:
                q = None
            continue
        if ch in '\'"`':
            q = ch
        elif ch in '([{':
            depth += 1
        elif ch in ')]}':
            depth -= 1
        elif ch == ',' and depth == 0:
            out.append(cur)
            cur = ''
            continue
        cur += ch
    out.append(cur)
    return out


def declared_names():
    names = {}
    for f in sorted(V3.glob('mission1/*.js')):
        text = f.read_text(encoding='utf-8')
        if re.search(r'^\(function \(\) \{$', text, re.M):
            continue  # Stage C (R6): a wrapped file declares nothing on window; it exports through M1
        for line in text.splitlines():
            m = re.match(r'^  function ([A-Za-z_$][\w$]*)', line)
            if m:
                names.setdefault(m.group(1), []).append(f.name)
                continue
            m = re.match(r'^  var (.*)$', line)
            if not m:
                continue
            body = re.sub(r'\s*//[^\'"]*$', '', m.group(1)).rstrip()  # trailing comment
            decls = split_top(body[:-1]) if body.endswith(';') else [body]  # one-line list, or a multi-line one
            for d in decls:
                n = re.match(r'\s*([A-Za-z_$][\w$]*)', d)
                if n:
                    names.setdefault(n.group(1), []).append(f.name)
    return names


def page_globals(br, html_path):
    p = br.new_page()
    errs = []
    p.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.goto(html_path.as_uri())
    p.wait_for_timeout(2500)
    keys = set(p.evaluate('Object.getOwnPropertyNames(window)'))
    p.close()
    return keys, errs


def main():
    names = declared_names()
    fails = []
    dup = {n: fs for n, fs in names.items() if len(fs) > 1}
    if dup:
        fails.append('declared twice: %s' % dup)
    html = (V3 / 'index.html').read_text(encoding='utf-8')
    without = re.sub(r'<script src="mission1/[a-z]+\.js"></script>\n', '', html)
    with sync_playwright() as pw:
        br = pw.chromium.launch()
        p = br.new_page()
        p.goto('about:blank')
        blank = set(p.evaluate('Object.getOwnPropertyNames(window)'))
        p.close()
        full, errs = page_globals(br, V3 / 'index.html')
        tmp = V3 / ('_check_globals_%s.html' % next(tempfile._get_candidate_names()))
        try:
            tmp.write_text(without, encoding='utf-8')
            others, _ = page_globals(br, tmp)
        finally:
            tmp.unlink()
        br.close()
    others -= blank
    hit_b = sorted(set(names) & blank)
    hit_o = sorted(set(names) & others)
    if hit_b:
        fails.append('browser globals: %s' % hit_b)
    if hit_o:
        fails.append('other scripts\' globals: %s' % hit_o)
    mine = full - blank - others
    if names:
        fails.append('unwrapped files still declare on window: %s' % sorted(names))
    if mine != ASSIGNED:
        fails.append('mission1/ globals are %s, expected exactly %s' % (sorted(mine), sorted(ASSIGNED)))
    hit = sorted(ASSIGNED & (blank | others))
    if hit:
        fails.append('collides with a browser or other-script global: %s' % hit)
    if errs:
        fails.append('console errors: %s' % errs[:3])
    if fails:
        print('check_globals FAIL: ' + '; '.join(fails))
        sys.exit(1)
    print('check_globals PASS: window holds exactly %s from mission1/ (+ __v3stack, stack.js); none a browser '
          'global (%d) or another script\'s (%d); 0 console errors' % (', '.join(sorted(ASSIGNED - {'__v3stack'})),
                                                                     len(blank), len(others)))


if __name__ == '__main__':
    main()

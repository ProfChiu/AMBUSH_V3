#!/usr/bin/env python3
"""R6 Step 9 (Stage C, docs/REFACTOR_MAP.md 5.3): what each apps/v3/mission1/ file puts on M1.

A file's exports are its top-level names that something outside the file uses:
  - another mission1 file (a bare reference that leaves that file's scopes, or `M1.name`), found by
    a real scope analysis (tools/exports_scope.js: acorn + an ES5 scope model), so a local that
    happens to share a name is never counted;
  - the rest of the page and the tools: index.html, apps/v3/*.js, assets/data/lesson*.js and every
    tools/**/*.py (evaluated JS strings) are searched for `window.name` / `window['name']`, and the
    page's other scripts for bare references (exports_scope.js `ext`). EXTERNAL lists the names
    found that way (all in check_counters.py), which go through M1 even inside their own file.
An exported var that is reassigned anywhere (its own file or another) becomes a property on M1
(`M1.x = init`, every reference `M1.x`), so nobody reads a stale copy; any other exported var is
exported as the reference itself (`var x = M1.x = init`); functions are `M1.f = f`, hoisted to the
top of the file's IIFE.

Usage:
  python3 tools/exports.py                 per file: exports, mutable ones, load-time reads
  python3 tools/exports.py --wrap <file>   namespace that file (IIFE, exports, callers -> M1.x)
  python3 tools/exports.py --headers       rewrite each wrapped file's Exports/Uses header lines
  python3 tools/exports.py --check         exit 1 unless: no file has a bare reference to a wrapped
                                           file's name, every M1.x read is written by some file,
                                           and every load-time M1.x read is set by an earlier file
"""
import json
import pathlib
import re
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
DIR = ROOT / 'apps/v3/mission1'
HELPER = ROOT / 'tools/exports_scope.js'
# Read from outside through M1, and patched there (so their own file calls them through M1 too).
EXTERNAL = {'speak': 'tools/check_counters.py records card speech by wrapping M1.speak',
            'FX': 'tools/check_counters.py wraps M1.FX.floatDie/sound/shake/badge'}


def scan():
    return json.loads(subprocess.check_output(['node', str(HELPER), 'scan']))


def owners(sc):
    own = {}
    for f in sc['order']:
        for n in sc['files'][f]['decls']:
            if n != 'M1':  # each wrapped file's own `var M1 = window.AmbushM1`
                own[n] = f
    for f in sc['order']:  # a mutable that became an M1 property: the file that sets it at load time
        for r in sc['files'][f]['m1']:
            if r['write'] and r['load'] and r['prop'] != 'state':
                own.setdefault(r['prop'], f)
    return own


def external_reads(names):
    """window.name reads in the page's other files and the tools (EXTERNAL is the reviewed result)."""
    hits = {}
    srcs = [ROOT / 'apps/v3/index.html'] + sorted((ROOT / 'apps/v3').glob('*.js')) + \
        sorted((ROOT / 'assets/data').glob('lesson*.js')) + sorted((ROOT / 'tools').rglob('*.py'))
    for p in srcs:
        t = p.read_text(encoding='utf-8', errors='ignore')
        for m in re.finditer(r'window(?:\.([A-Za-z_$][\w$]*)|\[[\'"]([\w$]+)[\'"]\])', t):
            n = m.group(1) or m.group(2)
            if n in names:
                hits.setdefault(n, set()).add(p.relative_to(ROOT).as_posix())
    return hits


def plan(sc, f):
    own = owners(sc)
    mine = sc['files'][f]['decls']
    users = {}
    for g in sc['order']:
        if g == f:
            continue
        for r in sc['files'][g]['through']:
            if own.get(r['name']) == f:
                users.setdefault(r['name'], set()).add(g)
        for r in sc['files'][g]['m1']:
            if r['prop'] in mine:
                users.setdefault(r['prop'], set()).add(g)
    ext = external_reads(set(mine))
    for n in ext:
        if n not in EXTERNAL:
            sys.exit('exports: %s is read off window by %s; review and add it to EXTERNAL' % (n, sorted(ext[n])))
    for n in EXTERNAL:
        if n in mine:
            users.setdefault(n, set()).add('(tools)')
    exports = sorted(users)
    mutable = []
    for n in exports:
        if mine[n]['kind'] != 'var':
            continue
        cross_w = any(r['name'] == n and r['write'] for g in sc['order'] if g != f
                      for r in sc['files'][g]['through'])
        if mine[n]['writes'] or cross_w:
            mutable.append(n)
    inside = [n for n in EXTERNAL if n in mine and mine[n]['kind'] == 'function']
    return {'exports': exports, 'mutable': mutable, 'viaM1Inside': inside, 'users': {n: sorted(users[n]) for n in exports}}


def report(sc):
    for f in sc['order']:
        p = plan(sc, f)
        fn = [n for n in p['exports'] if sc['files'][f]['decls'][n]['kind'] == 'function']
        print('%-11s %s  exports %3d (functions %d, vars %d, mutable %d)%s' % (
            f, 'wrapped' if sc['files'][f]['wrapped'] else '       ', len(p['exports']), len(fn),
            len(p['exports']) - len(fn), len(p['mutable']), ('  mutable: ' + ', '.join(p['mutable'])) if p['mutable'] else ''))


def wrap(f):
    sc = scan()
    if sc['files'][f]['wrapped']:
        sys.exit('%s is already wrapped' % f)
    p = plan(sc, f)
    with tempfile.NamedTemporaryFile('w', suffix='.json', delete=False) as t:
        json.dump(p, t)
    subprocess.check_call(['node', str(HELPER), 'wrap', f, t.name])
    pathlib.Path(t.name).unlink()
    print('wrapped %s: %d exports (%d mutable -> M1 properties: %s)' % (
        f, len(p['exports']), len(p['mutable']), ', '.join(p['mutable']) or '-'))
    headers()


def wrap_lines(prefix, items, width=118):
    out, line = [], prefix
    for i, it in enumerate(items):
        piece = it + (',' if i < len(items) - 1 else '')
        if len(line) + 1 + len(piece) > width and line.strip() not in ('//',):
            out.append(line.rstrip())
            line = '//       '
        line = line + ('' if line.endswith(' ') else ' ') + piece
    out.append(line.rstrip())
    return out


def headers():
    """Each wrapped file: line 1 the description, then what it exports to M1 and what it uses."""
    sc = scan()
    own = owners(sc)
    for f in sc['order']:
        F = sc['files'][f]
        if not F['wrapped']:
            continue
        path = DIR / (f + '.js')
        lines = path.read_text(encoding='utf-8').split('\n')
        i = lines.index('(function () {')
        exports = sorted(set(r['prop'] for g in sc['order'] for r in sc['files'][g]['m1']
                             if r['write'] and own.get(r['prop']) == f)
                         | set(n for n in plan(sc, f)['exports']))
        uses = {}
        for r in F['m1']:
            o = own.get(r['prop'])
            if r['prop'] == 'state':
                uses.setdefault('core', set()).add('state')
            elif o and o != f:
                uses.setdefault(o, set()).add(r['prop'])
        bare = {}
        for r in F['through']:
            o = own.get(r['name'])
            if o and o != f:
                bare.setdefault(o, set()).add(r['name'])
        head = [lines[0]]
        head += wrap_lines('// Exports to M1 (%d):' % len(exports), exports) if exports else ['// Exports to M1: nothing.']
        if re.search(r'^  var M1 = window\.AmbushM1 = \{', '\n'.join(lines), re.M):
            head.append('// Creates window.AmbushM1 (M1, holding M1.state); every other file reads it as `var M1`.')
        doors = re.findall(r'^  window\.(AmbushMission|__mission1Debug) = ', '\n'.join(lines), re.M)
        if doors:
            head.append('// Puts on window: %s (the shell, lessons, bot and live drives read these).' % ', '.join(doors))
        if uses:
            head.append('// Uses from M1:')
            for o in sc['order']:
                if o in uses:
                    head += wrap_lines('//   %s:' % o, sorted(uses[o]))
        if bare:
            head.append('// Still global (their files are not wrapped yet):')
            for o in sc['order']:
                if o in bare:
                    head += wrap_lines('//   %s:' % o, sorted(bare[o]))
        path.write_text('\n'.join(head + lines[i:]), encoding='utf-8')


def check():
    sc = scan()
    own = owners(sc)
    order = sc['order']
    fails = []
    setter = {}  # prop -> files that write M1.prop at load time
    for f in order:
        for r in sc['files'][f]['m1']:
            if r['write'] and r['load']:
                setter.setdefault(r['prop'], []).append(f)
    written = set(r['prop'] for f in order for r in sc['files'][f]['m1'] if r['write'])
    for f in order:
        F = sc['files'][f]
        # a bare reference to a wrapped file's name no longer finds it on window
        bare = sorted(set(r['name'] for r in F['through'] if r['name'] in own and own[r['name']] != f
                          and sc['files'][own[r['name']]]['wrapped']))
        if bare:
            fails.append('%s: bare references to wrapped files\' names %s' % (f, bare))
        for r in F['m1']:
            if r['write'] or r['prop'] == 'state':
                continue
            if r['prop'] not in written:
                fails.append('%s:%d reads M1.%s, which no file writes' % (f, r['line'], r['prop']))
            elif r['load']:
                src = setter.get(r['prop'], [])
                if not any(order.index(s) < order.index(f) or s == f for s in src):
                    fails.append('%s:%d reads M1.%s at load time before any file sets it' % (f, r['line'], r['prop']))
    if fails:
        print('exports check FAIL:\n  ' + '\n  '.join(fails))
        sys.exit(1)
    nw = sum(1 for f in order if sc['files'][f]['wrapped'])
    print('exports check PASS: %d/13 files wrapped, no bare reference to their names, every M1.x read is '
          'written, load-time reads set by an earlier file' % nw)


if __name__ == '__main__':
    a = sys.argv[1:]
    if not a:
        report(scan())
    elif a[0] == '--wrap':
        wrap(a[1])
    elif a[0] == '--headers':
        headers()
    elif a[0] == '--check':
        check()
    else:
        sys.exit(__doc__)

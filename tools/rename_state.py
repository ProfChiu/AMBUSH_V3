#!/usr/bin/env python3
"""R5 Step 6 (Stage B, docs/REFACTOR_MAP.md 5.3): move mission1's 13 shared state vars onto M1.state.

Token-aware rename over apps/v3/mission1/*.js: every identifier token that is one of NAMES becomes
`M1.state.<name>`, except
  - inside strings, comments and regex literals;
  - a property access (`s.phase`: previous token is `.`);
  - an object-literal key (`{ phase: ... }` / `, phase: ...`: previous token `{` or `,`, next `:`).
Shadowing is refused, not guessed: if any function parameter, `var`, `catch` binding or function
name inside the files is one of NAMES (other than the 13 top-level declarations removed here), the
script stops and names it, so a local `phase` is never rewritten by accident.
The declarations (roster.js's block, operations.js `var selectedId`, setup.js `var entryIndex`,
core.js `var difficulty`) are removed first, by exact text match, and their initial values move
into the M1 object that core.js creates right after the engine aliases (D must exist first).

Usage: python3 tools/rename_state.py [--check]
  --check: write nothing; list every bare reference left; exit 1 if any.
"""
import os, re, sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'apps', 'v3', 'mission1')
NAMES = ['phase', 'usSoldiers', 'germans', 'opsState', 'vpState', 'track', 'currentActorId', 'roundNum',
         'currentGermanIdsThisRound', 'entryIndex', 'selectedId', 'difficulty', 'groundItems']

ROSTER_BLOCK = """  var usSoldiers = [];       // populated by squad generation
  var germans = {};          // id -> german object, populated as activate_german fires
  var phase = 'squadgen';    // squadgen | entry | movement | round | roundEnd | over
  var opsState = null;
  var track = null, currentActorId = null, roundNum = 0;
  // germanActivations: §2/1's Activation VP Award, banked the moment a German activates and kept
  // "regardless of what happens later". germanDefeats now contributes only the additive
  // Conditional award. awards: flat VP from paragraphs / ending bonuses. See victoryrules.js.
  var vpState = { germanActivations: [], germanDefeats: [], usCasualties: [], awards: [] };
  var currentGermanIdsThisRound = [];
  // Task #68 (docs/37_PICKUP_EXCHANGE.md): items lying in a hex with no soldier currently
  // carrying them — hexId -> array of { id, kind: 'port'|'ammo' }. Populated by wound-loss
  // overflow (§13/2, Task #61) rather than left to vanish as it did before this task.
  var groundItems = {};
"""
DECLS = {
    'roster.js': [(ROSTER_BLOCK, "  // The game state (usSoldiers, germans, phase, ...) lives on M1.state (core.js, Stage B).\n")],
    'operations.js': [("  var selectedId = null;\n", '')],
    'setup.js': [("  var entryIndex = 0;\n", '')],
    'core.js': [("  var difficulty = D.NORMAL;\n", '')],
}

M1_BLOCK = """
  // Stage B (docs/REFACTOR_MAP.md 5.3): the shared game state, one object. Group A (what the save
  // holds) plus groundItems. Every file reads and writes M1.state.x; save.js serializes it.
  var M1 = window.AmbushM1 = {
    state: {
      phase: 'squadgen',         // squadgen | entry | movement | round | roundEnd | over
      usSoldiers: [],            // populated by squad generation
      germans: {},               // id -> german object, populated as activate_german fires
      opsState: null,
      // germanActivations: §2/1's Activation VP Award, banked the moment a German activates and kept
      // "regardless of what happens later". germanDefeats now contributes only the additive
      // Conditional award. awards: flat VP from paragraphs / ending bonuses. See victoryrules.js.
      vpState: { germanActivations: [], germanDefeats: [], usCasualties: [], awards: [] },
      track: null,
      currentActorId: null,
      roundNum: 0,
      currentGermanIdsThisRound: [],
      entryIndex: 0,
      selectedId: null,
      difficulty: D.NORMAL,
      // Task #68 (docs/37_PICKUP_EXCHANGE.md): items lying in a hex with no soldier currently
      // carrying them: hexId -> array of { id, kind: 'port'|'ammo' }. Populated by wound-loss
      // overflow (§13/2, Task #61).
      groundItems: {}
    }
  };
"""
M1_ANCHOR = "  var GAct = window.AmbushGermanActions;\n"

ID_START = re.compile(r'[A-Za-z_$]')
ID_CHAR = re.compile(r'[A-Za-z0-9_$]')
REGEX_KW = ('return', 'typeof', 'case', 'in', 'of', 'new', 'delete', 'void', 'throw')


def tokens(src):
    """Yield (kind, start, end). kinds: id, num, str, com, re, ws, punct."""
    i, n = 0, len(src)
    prev_sig = None
    while i < n:
        c = src[i]
        if c in ' \t\r\n':
            j = i
            while j < n and src[j] in ' \t\r\n':
                j += 1
            yield ('ws', i, j); i = j; continue
        if src.startswith('//', i):
            j = src.find('\n', i); j = n if j < 0 else j
            yield ('com', i, j); i = j; continue
        if src.startswith('/*', i):
            j = src.find('*/', i + 2) + 2
            yield ('com', i, j); i = j; continue
        if c in '\'"`':
            j = i + 1
            while src[j] != c:
                if c == '`' and src.startswith('${', j):
                    raise SystemExit('template interpolation at offset %d: not handled' % j)
                j += 2 if src[j] == '\\' else 1
            j += 1
            yield ('str', i, j); prev_sig = ('str', src[i:j]); i = j; continue
        if c == '/':
            regex_ok = prev_sig is None or (prev_sig[0] == 'punct' and prev_sig[1] not in (')', ']', '}')) \
                or (prev_sig[0] == 'id' and prev_sig[1] in REGEX_KW)
            if regex_ok:
                j = i + 1; cls = False
                while True:
                    ch = src[j]
                    if ch == '\\': j += 2; continue
                    if ch == '[': cls = True
                    elif ch == ']': cls = False
                    elif ch == '/' and not cls: break
                    elif ch == '\n': raise SystemExit('regex scan ran into a newline at offset %d' % i)
                    j += 1
                j += 1
                while j < n and ID_CHAR.match(src[j]):
                    j += 1
                yield ('re', i, j); prev_sig = ('re', src[i:j]); i = j; continue
        if ID_START.match(c):
            j = i + 1
            while j < n and ID_CHAR.match(src[j]):
                j += 1
            yield ('id', i, j); prev_sig = ('id', src[i:j]); i = j; continue
        if c.isdigit():
            j = i + 1
            while j < n and (src[j].isalnum() or src[j] == '.'):
                j += 1
            yield ('num', i, j); prev_sig = ('num', src[i:j]); i = j; continue
        yield ('punct', i, i + 1); prev_sig = ('punct', c); i += 1


def sig_tokens(src):
    return [(k, a, b, src[a:b]) for (k, a, b) in tokens(src) if k not in ('ws', 'com')]


def bindings(fn, src):
    """Every binding of a NAME: var/let/const declarators, function names and params, catch params."""
    sig = sig_tokens(src)
    out = []
    k = 0
    while k < len(sig):
        kind, a, b, t = sig[k]
        if kind == 'id' and t in ('var', 'let', 'const'):
            # walk declarators at depth 0 until ';' (or a token that ends the statement)
            depth, expect_name, m = 0, True, k + 1
            while m < len(sig):
                tt = sig[m][3]
                if depth == 0 and tt == ';':
                    break
                if tt in '([{': depth += 1
                elif tt in ')]}':
                    if depth == 0: break
                    depth -= 1
                if depth == 0 and expect_name and sig[m][0] == 'id':
                    if tt in NAMES: out.append((fn, src.count('\n', 0, sig[m][1]) + 1, 'var ' + tt))
                    expect_name = False
                elif depth == 0 and tt == ',':
                    expect_name = True
                m += 1
        elif kind == 'id' and t == 'function':
            m = k + 1
            if sig[m][0] == 'id':
                if sig[m][3] in NAMES: out.append((fn, src.count('\n', 0, sig[m][1]) + 1, 'function ' + sig[m][3]))
                m += 1
            assert sig[m][3] == '(', (fn, src[a:a + 60])
            m += 1
            while sig[m][3] != ')':
                if sig[m][0] == 'id' and sig[m][3] in NAMES:
                    out.append((fn, src.count('\n', 0, sig[m][1]) + 1, 'param ' + sig[m][3]))
                m += 1
        elif kind == 'id' and t == 'catch' and k + 2 < len(sig) and sig[k + 1][3] == '(':
            if sig[k + 2][3] in NAMES:
                out.append((fn, src.count('\n', 0, sig[k + 2][1]) + 1, 'catch ' + sig[k + 2][3]))
        elif t == '=>':
            raise SystemExit('%s: arrow function, not handled' % fn)
        k += 1
    return out


def bare_refs(src):
    sig = sig_tokens(src)
    out = []
    for k, (kind, a, b, t) in enumerate(sig):
        if kind != 'id' or t not in NAMES:
            continue
        prev = sig[k - 1][3] if k else ''
        nxt = sig[k + 1][3] if k + 1 < len(sig) else ''
        if prev == '.':
            continue
        if prev in ('{', ',') and nxt == ':':
            continue
        if prev in ('{', ',') and nxt in (',', '}'):
            raise SystemExit('shorthand property at offset %d: %r' % (a, src[a - 20:b + 20]))
        out.append((a, b))
    return out


def files():
    return sorted(f for f in os.listdir(ROOT) if f.endswith('.js'))


def main():
    check = '--check' in sys.argv
    srcs = {fn: open(os.path.join(ROOT, fn), encoding='utf-8').read() for fn in files()}
    if not check:
        for fn, reps in DECLS.items():
            for old, new in reps:
                assert srcs[fn].count(old) == 1, (fn, old[:60])
                srcs[fn] = srcs[fn].replace(old, new)
        assert srcs['core.js'].count(M1_ANCHOR) == 1
        srcs['core.js'] = srcs['core.js'].replace(M1_ANCHOR, M1_ANCHOR + M1_BLOCK)
    # shadowing: after the 13 declarations are gone, no binding of a NAME may remain
    shadows = [b for fn in files() for b in bindings(fn, srcs[fn])]
    if check:
        shadows = [s for s in shadows if not s[2].startswith('var ')] + \
                  [s for s in shadows if s[2].startswith('var ')]
    if shadows:
        for s in shadows:
            print('%s:%d binding %s' % s)
        if not check:
            raise SystemExit('a NAME is bound locally: rename refused (fix by hand first)')
    total, left = 0, 0
    for fn in files():
        src = srcs[fn]
        refs = bare_refs(src)
        if check:
            # M1's own keys are object-literal keys, skipped above
            for a, b in refs:
                print('%s:%d bare %s' % (fn, src.count('\n', 0, a) + 1, src[a:b]))
            left += len(refs)
            continue
        for a, b in reversed(refs):
            src = src[:a] + 'M1.state.' + src[a:b] + src[b:]
        total += len(refs)
        open(os.path.join(ROOT, fn), 'w', encoding='utf-8').write(src)
        print('%-14s %3d renamed' % (fn, len(refs)))
    if check:
        print('bindings of a moved name: %d; bare references left: %d' % (len(shadows), left))
        sys.exit(1 if (left or shadows) else 0)
    print('total %d' % total)


if __name__ == '__main__':
    main()

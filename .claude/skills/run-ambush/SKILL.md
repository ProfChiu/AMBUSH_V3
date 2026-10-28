---
name: run-ambush
description: Run, open, and drive Ambush! Digital v2's pages (apps/game/ — Mission 1, movement sandbox, LOS sandbox, hex inspector). Use when asked to start, open, run, screenshot, or interact with any of these pages, or to click a specific hex on the map.
---

Every page is static HTML/JS with no build step and no dev server — every page is a plain
file opened directly via `file://`. There is one shared driver for all of them:
`.claude/skills/run-ambush/driver.py`, a small Playwright wrapper with a `click_hex(id)`
helper for pages that use the hex grid.

All paths below are relative to the repo root (this directory's great-grandparent).

## Prerequisites

```bash
pip install playwright
playwright install chromium
```

(Both were already present on this machine when this skill was written — verified by
importing `playwright` and launching Chromium directly, not by running the install commands
fresh. If a clean machine reports `ModuleNotFoundError: playwright` or a browser-download
error, run the two lines above.)

No other setup. No `npm install`, no build, no server to start — every page below is opened
straight from disk.

## Run (agent path)

Use the driver as a library for anything beyond a single click:

```python
import sys
sys.path.insert(0, '.claude/skills/run-ambush')
from driver import AmbushPage

with AmbushPage() as p:                       # headless=True by default
    p.open('apps/game/lossandbox.html')        # any repo-relative .html path
    p.click_hex('L9')                           # hex-grid pages only, see table below
    p.click_hex('P12')
    p.screenshot('/tmp/los.png')
    assert p.errors == [], p.errors             # console/page errors caught from first paint
```

Or as a one-shot CLI smoke check:

```bash
python3 .claude/skills/run-ambush/driver.py apps/game/lossandbox.html \
    --click-hex L9 --click-hex P12 --screenshot /tmp/los.png
# prints "console/page errors: [...]" and exits 1 if any were caught
```

`AmbushPage` methods: `.open(path)`, `.click_hex(id)` (hex-grid pages), `.click(selector)`
(any CSS selector — Playwright's strict mode errors if it matches more than one element, see
Gotchas), `.text(selector)`, `.screenshot(path)`, `.errors` (list, checked from page load
onward).

**Pages and a verified representative interaction for each** (all run this session, headless,
zero console errors in every case):

| Page | Uses `click_hex`? | Verified interaction |
|---|---|---|
| `apps/game/lossandbox.html` | yes | `click_hex('L9')` (sighter) → `click_hex('P12')` (target) → `#target-card` shows the CLEAR/BLOCKED verdict |
| `apps/game/movementsandbox.html` | yes (`.counter` too) | `click('.counter >> nth=0')` selects Soldier A → `#tb-selected` reads "Soldier A" |
| `apps/game/hexinspector.html` | yes | `click_hex('J5')` → `#selected hex` panel (`.mini-card` in the HUD) updates to J5's terrain detail |

## Run (human path)

Just open the file in a browser — `open apps/game/lossandbox.html` (macOS) or double-click it
in Finder/Explorer. Everything works offline, no server needed. Not useful headless/in CI;
that's what the driver above is for.

## Test

Two Node regression suites (no npm/package.json — just run them with `node` directly):

```bash
node tools/test_movement.js   # 41/41 passing
node tools/test_los.js        # 14/14 passing
```

Plus the Python asset-library integrity check:

```bash
python3 tools/verify_assets.py
```

As run this session: 1 known warning (German Y/Z counters, fallback art) plus 1 failure —
`orphan file not in index: .DS_Store` — a stray macOS Finder file at the repo root, unrelated
to any asset work, pre-dating this skill. `rm .DS_Store` clears it if it bothers you; it
regenerates on its own from normal Finder use and isn't worth chasing.

---

## Gotchas

- **`click_hex` needs `window.AmbushHexGrid` on the page.** Only pages that load
  `hexgrid.js` have it — `lossandbox.html`, `movementsandbox.html`, `hexinspector.html`. `mission1.html` also loads it. A page without it throws
  `Cannot read properties of undefined (reading 'parseId')` on `click_hex`.
- **`.click(selector)` errors if the selector matches more than one element** (Playwright
  strict mode — it refuses to guess). `movementsandbox.html`'s `.counter` class matches all 3
  soldiers + the enemy counter; use `.click('.counter >> nth=0')` for Soldier A specifically,
  or a more specific selector.
- **`hexinspector.html` loads a ~164KB terrain JSON via a synchronous `<script>` tag.** The
  default 300ms post-`open()` wait was enough in every run this session, but if `click_hex`
  ever throws that same `parseId`-of-undefined error on this page specifically, it's a slow
  load, not a real bug — pass a longer `wait_ms` to `open()`.
- **Files are opened via `file://`, not served.** `fetch()`/`XHR` to a relative path from
  page-evaluated JS does *not* work under `file://` (blocked as cross-origin) even though
  `<script src="...">` tags load same-directory files just fine. If you need to check a JSON
  data file loaded via `<script>`, read the resulting `window.AMBUSH_*` global instead of
  trying to `fetch()` it from the page.
- **Die rolls animate before showing their result** — `animateDie` runs an 8-tick, 55ms-per-tick
  animation (~440ms) before the landed value is written. A `click()` wait of 200ms reads the DOM
  mid-animation; pass `wait_ms=600` or more when the interaction rolls a die. (The animation no
  longer draws from the seeded RNG since v2 task 1, but it still takes this long on screen.)

## Troubleshooting

- **`playwright._impl._errors.Error: Executable doesn't exist`**: browsers not downloaded —
  run `playwright install chromium`.
- **A page's driven interaction has no visible effect and `.errors` is empty**: before
  suspecting an app bug, suspect timing first — check whether the interaction has an
  animation or transition in the way (see the die-roll gotcha above). Bump `wait_ms` and re-check before concluding anything's actually broken.

## v2 notes

- The trainer, dialog harness and main-screen mockup pages stayed in `../AMBUSH/` (frozen v1).
- `tools/bot/` drives `apps/game/mission1.html` with this driver; see `docs/02_HANDOFF.md` for the
  selector contract the presentation rewrite must keep or replace.

"""game.py — a driveable, seeded, headless Mission 1 session.

Wraps the run-ambush Playwright driver with the three things automated play needs and the
skill's own driver deliberately does not have:

  * SEEDED DICE. `Math.random` appears exactly once in the whole Mission 1 code path
    (`d10()`, apps/game/mission1demo.js) and the die animation does not use it (its tumbling
    faces come from crypto.getRandomValues since v2 task 1), so replacing
    Math.random before the page scripts load makes every game-relevant roll reproducible with
    no production change whatsoever. Same seed, same game.
  * THE AUTOMATION SEAM. Everything is seen and done through window.__mission1Debug
    (pendingDecision / choose / press / clickHex / select / board), never the DOM.
  * A DIALOG ROUTER. The game is a chain of pop-ups; most just need "Continue", but several
    ask a real question (which target, which soldier to carry, whether to take a second
    action). A pump that clicks the first enabled button silently answers those questions
    with whatever happens to be first. The router recognises the asking dialogs and hands the
    decision to the policy.
  * SAFETY RAILS. Step and wall-clock caps, plus stuck-detection, so one wedged run cannot eat
    a whole batch.

The policy (tools/bot/policy.py) decides WHAT to do; this module knows only how to see the
board and how to act on it.
"""
import json
import os
import re
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / '.claude' / 'skills' / 'run-ambush'))
from driver import AmbushPage  # noqa: E402

# mulberry32 — small, fast, and good enough for dice. Installed via add_init_script so it is in
# place before mission1demo.js runs its first roll.
SEED_JS = """
(() => {
  let s = %d >>> 0;
  Math.random = function () {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();
"""

# Timer clamp: the single biggest cost in an automated run is waiting for animations nobody is
# watching. animateDie spins a die on an 8-tick, 55ms interval (~440ms per roll), rollPopup waits
# 220ms before throwing, and driveNext waits 500ms before a German acts. Across the hundreds of
# rolls in one mission that is minutes of pure delay.
#
# DETERMINISM IS PRESERVED: since v2 task 1 (2026-09-19) animateDie's tumbling faces come from
# crypto.getRandomValues, not Math.random, so the animation consumes no seeded draws at all. The
# seeded stream is exactly the game's d10() rolls; clamping delays, changing the tick count, or
# removing the animation cannot change an outcome. Only wall-clock changes. The
# app has exactly one setInterval (animateDie) and four setTimeouts, none of which race each other:
# every flow here is one dialog at a time, so shortening the delays cannot reorder anything.
# tools/bot/README.md records the check that confirms this empirically.
SPEED_JS = """
(() => {
  const si = window.setInterval, st = window.setTimeout;
  window.setInterval = function (fn, d, ...a) { return si(fn, Math.min(d || 0, 1), ...a); };
  window.setTimeout = function (fn, d, ...a) { return st(fn, Math.min(d || 0, 1), ...a); };
})();
"""

# The page's automation seam (apps/game/mission1demo.js, "Automation seam"): the bot sees and acts
# ONLY through window.__mission1Debug, never through the page's markup, so the presentation
# rewrite can change any DOM without touching this file. One evaluate() round-trip per look.
PENDING_JS = "() => window.__mission1Debug.pendingDecision()"
BOARD_JS = "() => window.__mission1Debug.board()"


# Which page to drive. AMBUSH_PAGE=v3 plays v3's stage (apps/v3/index.html, Phase 3), which shows
# v2's start dialog when opened with ?play=ask, so the policy picks the level the same way. The
# environment variable reaches run.py's worker processes, pacing.py and autopsy.py alike.
PAGE = {'v2': 'apps/game/mission1.html', 'v3': 'apps/v3/index.html?play=ask'}[os.environ.get('AMBUSH_PAGE', 'v2')]


# Board verbs that acknowledge rather than decide.
# resultDone: v3's Done on a finished card, which holds the next turn (punch list, 2026-10-21)
ACK_VERBS = {'newRound', 'cancelMove', 'resultDone'}
BOARD_PHASES = {'entry': 'Entry Placement', 'movement': 'Operations', 'round': 'Action Round'}


def broad_phase(label):
    """The page's phase label ('Action Round 3', 'Round 2 complete', ...) -> a pacing bucket."""
    if label.startswith('Action Round'):
        return 'Action Round'
    if label.startswith('Operations'):
        return 'Operations'
    return label.strip() or '(start)'


class StuckError(RuntimeError):
    """The session stopped making progress — no dialog and no legal action."""


class BudgetExceeded(RuntimeError):
    """The run hit its step or wall-clock cap."""


class Session:
    def __init__(self, seed, headless=True, max_steps=4000, max_seconds=600, trace=True,
                 fast=True):
        self.seed = seed
        self.max_steps = max_steps
        self.max_seconds = max_seconds
        self.steps = 0
        self.started = time.time()
        self.trace = [] if trace else None
        self._seen_errors = 0
        # Every press the bot makes, classified for pacing.py's presses-per-decision measure
        # (Gate 0 answer 7): [(kind, broad_phase)], kind 'decision' or 'ack'.
        self.presses = []
        self._board_phase = ''
        self._page = AmbushPage(headless=headless)
        self._page.page.add_init_script(SEED_JS % seed)
        if fast:
            self._page.page.add_init_script(SPEED_JS)

    # -- lifecycle ------------------------------------------------------------
    def __enter__(self):
        self._page.__enter__()
        self._page.open(PAGE, wait_ms=700)
        return self

    def __exit__(self, *exc):
        return self._page.__exit__(*exc)

    @property
    def errors(self):
        return self._page.errors

    def log(self, kind, detail):
        if self.trace is not None:
            self.trace.append({'step': self.steps, 't': round(time.time() - self.started, 1),
                               'kind': kind, 'detail': detail})

    def tick(self):
        # Correlate console/page errors to the action that produced them: without this an error
        # is just a count at the end of the run, with no way back to what caused it.
        if len(self._page.errors) > self._seen_errors:
            for msg in self._page.errors[self._seen_errors:]:
                self.log('ERROR', msg)
            self._seen_errors = len(self._page.errors)
        self.steps += 1
        if self.steps > self.max_steps:
            raise BudgetExceeded(f'step cap {self.max_steps} exceeded')
        if time.time() - self.started > self.max_seconds:
            raise BudgetExceeded(f'time cap {self.max_seconds}s exceeded')

    # -- seeing ---------------------------------------------------------------
    def dialog(self):
        """The open dialog as data ({title, text, buttons, rows}), or None."""
        return self._page.page.evaluate(PENDING_JS)

    def board(self):
        b = self._page.page.evaluate(BOARD_JS)
        self._board_phase = BOARD_PHASES.get(b['phase'], b['phase'])
        return b

    # -- acting (all through the seam; each runs the same handler a player's click runs) --------
    def _call(self, method, arg):
        return self._page.page.evaluate(
            "([m, a]) => window.__mission1Debug[m](a)", [method, arg])

    def press(self, btn_or_verb):
        """A board verb ('move', 'exitMap', ...). Dialog buttons go through press_dialog."""
        self.presses.append(('ack' if btn_or_verb in ACK_VERBS else 'decision', self._board_phase))
        return self._call('press', btn_or_verb)

    def press_dialog(self, dialog, btn_id):
        # A dialog press is a decision only when the dialog offered a real alternative: two or more
        # enabled buttons besides Cancel (start screen difficulty, Capture or Kill). A lone
        # Continue / Roll / OK is an acknowledgement.
        live = [b for b in dialog['buttons'] if not b['disabled'] and b['id'] != 'cancel']
        self.presses.append(('decision' if len(live) >= 2 else 'ack', broad_phase(dialog.get('phase', ''))))
        return self._call('press', btn_id)

    def choose(self, idx, dialog=None):
        self.presses.append(('decision', broad_phase((dialog or {}).get('phase', ''))))
        return self._call('choose', idx)

    def pick_actor(self, soldier_id):
        """v3, §6/1: choose which US soldier sharing the current track space goes next."""
        self.presses.append(('decision', self._board_phase))
        return self._call('pickActor', soldier_id)

    def select(self, soldier_id):
        self.presses.append(('decision', self._board_phase))
        return self._call('select', soldier_id)

    def click_hex(self, hex_id):
        """Entry placement or a destination marker — whatever the map is offering at that hex."""
        self.presses.append(('decision', self._board_phase))
        return self._call('clickHex', hex_id)

    def operations_next_step(self, from_hex, goal_hex):
        """The next hex to step to on a wall-aware route to `goal_hex`, or None if unreachable.

        Borrowed from the page rather than reimplemented here, for the same reason `distances` is:
        the wall and aperture rules live in the game, and a second copy in the bot would drift
        from them silently.
        """
        if not from_hex or not goal_hex or from_hex == goal_hex:
            return None
        return self._page.page.evaluate(
            "([a, b]) => window.__mission1Debug.operationsNextStepForTesting(a, b)",
            [from_hex, goal_hex])

    def screenshot(self, path):
        self._page.screenshot(path)

    # Hex distance is real coordinate maths (axial conversion off the printed labels), so it is
    # borrowed from the page's own AmbushHexGrid rather than reimplemented here where it could
    # drift from the game's answer. Batched: one round-trip per decision, not one per candidate.
    def distances(self, hex_ids, goal):
        if not hex_ids:
            return {}
        pairs = self._page.page.evaluate(
            """([hexes, goal]) => {
                 const G = window.AmbushHexGrid;
                 const g = G.parseId(goal);
                 if (!g) return [];
                 return hexes.map((h) => {
                   const p = G.parseId(h);
                   return [h, p ? G.distance(p, g) : 999];
                 });
               }""", [hex_ids, goal])
        return {h: d for h, d in pairs}

    # -- the dialog loop ------------------------------------------------------
    def settle(self, policy, limit=600):
        """Advance dialogs until the board is waiting on a map/panel action (or the game ends).

        Returns the number of dialogs handled. Any dialog offering real choices is routed to
        the policy rather than answered by clicking whatever is first.
        """
        handled = 0
        spins = 0
        # `limit` caps real dialog handling only; waiting (a card line playing, dice still
        # rolling) does not count against it, or a real-speed run trips it on one long chain.
        while spins < limit:
            spins += 1
            self.tick()
            d = self.dialog()
            if not d:
                return handled
            if d['kind'] == 'resolving':
                # A resolution-card line is playing: waiting, not deciding — never charged to the
                # step budget (same reasoning as the mid-animation roll dialog below).
                self.steps -= 1
                spins -= 1
                time.sleep(0.005)
                continue
            handled += 1
            if d['rows']:
                idx = policy.choose_row(d, self.board())
                self.log('choose', {'title': d['title'], 'pick': idx,
                                    'of': [r['text'][:60] for r in d['rows']]})
                if idx is None:
                    cancel = next((b for b in d['buttons'] if b['id'] == 'cancel' and not b['disabled']), None)
                    if cancel:
                        self.press_dialog(d, 'cancel')
                        continue
                    idx = 0
                self.choose(idx, d)
                continue
            live = [b for b in d['buttons'] if not b['disabled']]
            if not live:
                # A roll dialog mid-animation: its button re-enables once the dice land. This is
                # waiting, not deciding, so it must not be charged against the step budget —
                # doing so let the cap fire mid-game while the bot was still progressing fine.
                self.steps -= 1
                spins -= 1
                time.sleep(0.01)
                handled -= 1
                continue
            pick = policy.choose_button(d, live)
            self.log('dialog', {'title': d['title'], 'press': pick})
            self.press_dialog(d, pick)
        raise StuckError(f'dialog loop exceeded {limit} iterations')

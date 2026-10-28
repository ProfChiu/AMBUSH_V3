# AMBUSH_V3 — project directives

Ambush! Digital, version 3: Mission 1 finished to the standard of a modern digital game, on v2's
rules engine. The folder rules in `../CLAUDE.md` and the global rules in `__SCAD/_CLAUDE/CLAUDE.md`
still apply, except where noted here.

## Session start — read these, in this order
1. `PROGRESS.md`. Its newest "Next" is the default starting point.
2. `docs/00_V3_BRIEF.md`: every Gate 0 decision and the phase table.
3. `docs/v2_reference/02_HANDOFF.md` for the engine seam, the bot and the traps (until v3 has its own).
   Its commands run unchanged from this folder: the code, tools and assets are v2's, copied.
4. `../PhantomFury/` is the reference for zoom, the Director tutorial, HUD and animation. Read its
   code to lift patterns; never edit it.

## Binding
- The engine (19 rules modules copied from v2) stays byte-identical unless a rule is wrong. No DOM
  in rules files; every action and refusal cites its rule.
- Visible dice; show the machinery (Kranz voices the German `reason` fields).
- A press is asked for a decision, never for an acknowledgement. Results resolve on the board.
- Bot parity 30/30 (Normal + Easy) before any presentation change counts as done.
- Plain `<script src>`, no modules, no `fetch()`. Opens from `file://`.
- `assets/data/grenade_scatter.js` loads before `grenaderules.js`.
- **Canvas override:** the map fills the window and the HUD floats over it (Wan, 2026-10-20). The
  folder's fixed 1920x1080 rule does not apply here.
- Interview with `AskUserQuestion` before a phase; no file edits without the go-ahead. Punch lists
  one item at a time.

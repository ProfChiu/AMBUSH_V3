# HANDOFF_V3 — the Mission 1 controller after the refactor (R1-R7, 2026-10-29)

`docs/v2_reference/02_HANDOFF.md` still covers the engine seam, the bot and v2's traps. This page covers
what the refactor changed: where the controller lives now and how to prove a change. The full record is
`docs/REFACTOR_MAP.md` (§6.6 holds each session's results).

## Files: `apps/v3/mission1/`

The old 5,872-line `mission1.js` is 13 plain scripts, loaded by `index.html` in this order (core first,
seams last). Each is `(function () { 'use strict'; var M1 = window.AmbushM1; … })();`.

| # | File | What it holds |
|---:|---|---|
| 1 | `core.js` | engine and data aliases (`M1.G`, `M1.FC`, `M1.CHART`, …), constants, terrain/LOS tables, weapon rules, VP target, difficulty. **Creates `M1`**, so it must stay first. |
| 2 | `present.js` | dice, voice (`M1.speak`), log, pop-up helpers, `Resolve`, `FX` |
| 3 | `info.js` | `Info` (the map as information surface), `Sight` |
| 4 | `roster.js` | map rendering, counters (`makeCounter`, `counterClick`), finders, kit and tokens, roster/VP |
| 5 | `setup.js` | §4 squad generation, entry placement |
| 6 | `operations.js` | selection, destinations, combo moves, walking, HUD, Paragraph Check, step chain |
| 7 | `contact.js` | contact terms, German activation, German card, tooltips, inspectors |
| 8 | `rounds.js` | Action Round: events, awareness, initiative, track, turns, the action panel (`showActionPanel`) |
| 9 | `verbs.js` | the player's verbs, and **`M1.verbs(s)`**: every Round verb's `{ok, why, cite}` (R7) |
| 10 | `german.js` | German turn, actions, movement by reference |
| 11 | `combat.js` | fire, hidden fire, grenade, assault chains (`toHitCard`), damage, capture, round end, victory |
| 12 | `save.js` | save/load, start screen, game flow |
| 13 | `seams.js` | `VERBS`, `verbsOffered`, `__mission1Debug`, `AmbushMission` |

Styles: `apps/v3/mission.css` holds v2's lifted in-play styles; `apps/v3/hud.css` (R7) the v3 layout: floating
panels, the ring, world space, stacks, kit and tokens. `index.html` loads `hud.css` right after `mission.css`, so the
cascade is the one the single file had.

Each file's header lists `Exports to M1` and `Uses from M1` by owner file. **Do not edit headers by hand:**
`python3 tools/exports.py --headers` regenerates them, `--check` proves every `M1.x` read is written somewhere
and every load-time read is set by an earlier file. Run both after any change that adds or removes an export.

## `M1`, `M1.state`, the globals

- **`M1 = window.AmbushM1`.** A file exports a function as `M1.f = f;` in the block at the top of its IIFE
  (hoisted); a var shared by reference as `var x = M1.x = init`; a var other files reassign lives only as
  `M1.x` (17 of them: `M1.pendingContact`, `M1.picking`, `M1.counterEls`, …).
- **`M1.state`** holds the 13 game-state vars the save writes: `phase, currentActorId, track, usSoldiers,
  opsState, vpState, difficulty, selectedId, germans, roundNum, groundItems, entryIndex, currentGermanIds`.
  Replace its fields, never the object (`seams.js` hands out `M1.state.groundItems` by reference).
- **Three globals** come from `mission1/`: `AmbushM1`, `AmbushMission` (lesson, director, stack, ring, shell)
  and `__mission1Debug` (the bot and the live drives). `stack.js` adds `__v3stack`. `tools/check_globals.py`
  asserts exactly these.
- **Legality has one source:** `M1.verbs(s[, only])` decides each Round verb and words its refusal; the
  action-panel buttons (`disabled`, `data-why`) are drawn from it, the ring reads those buttons, the bot reads
  them through `verbsOffered()`, and the stack panel's `takeWhy` is `verbs(s, 'pickup').pickup.stackWhy`.
  A new verb goes into `M1.VERB_BUTTONS` and the rules table in `verbs()`; seams.js's `VERBS` follows.

## Saves

`version: 2` saves carry `groundItems`; a `version: 1` save still loads, with an empty ground. Key
`ambush.v3.saves` (speed: `ambush.v3.speed`). On first open `save.js` copies v2's `ambush-mission1-saves-v1`
in once (writing the v3 key marks it done); v2's key is never written. `applySavedState` calls
`Dialogs.reset()` then `M1.resetOperationsFlow()`, `M1.resetContactFlow()`, `M1.resetRoundFlow()`.

## Proof tools (run from the project folder)

| Command | What | Time |
|---|---|---:|
| `bash tools/t1.sh` | `node --check` all v3 scripts, 17 engine suites, bot parity seeds 7000-7005 both difficulties, seed-7000 decision traces | ~3 min |
| `bash tools/t2.sh` | T1 + parity 30/30 Normal and Easy + every `tools/live_*.py` + engine sha256 manifest | ~19 min |
| `python3 tools/live_save.py` | 30 save checks: ground items (bug 12), load mid-contact (bug 13), keys and import | ~1 min |
| `python3 tools/verb_probe.py --out x.json --against tools/bot/baselines/refactor/verbs_7000.json` | verbsOffered, every verb button's disabled/data-why, the stack's takeWhy, at each bot decision of seed 7000 (both difficulties) | ~4 min |
| `python3 tools/check_counters.py --seed 7000 --out a.json [--against b.json]` | every counter's DOM, fx/speech events, play log, saves loaded fresh | ~3 min |
| `python3 tools/check_globals.py` | the page's globals are exactly the three above | <1 min |
| `python3 tools/exports.py --check` / `--headers` | the M1 export table is consistent / regenerate headers | <1 s |
| `python3 tools/live_map.py` | the map drive (one of the live drives T2 runs) | ~1 min |

Run T1/T2 in the background; a change that is not a pure move needs T2 green before it counts.

## Gotchas (from REFACTOR_MAP §6.6)

- **`steps` is not a game field.** It counts the harness's polling loops and jitters run to run.
  `compare.py` ignores `seconds` and `steps`; "same decisions" is proven by the trace diff (`act`/`choose`/
  `dialog` in order, `t` and `step` ignored).
- **The engine is not byte-identical to v2:** Phase 8c changed `arscheduler.js`, `paragraphinterpreter.js`,
  `operationsloop.js`. T2 checks the 19 modules against `tools/bot/baselines/refactor/engine.sha256` and
  `cmp`s the other 16 against v2.
- **`core.js` must load first** (it creates `M1`); `assets/data/grenade_scatter.js` before `grenaderules.js`.
- **BAR ammo shares the id `bar`** in the Ammo Boxes: "in his kit" means the Port Boxes.
- **`applyWoundForTesting` throws in Operations** (`renderTrack` on a null track); wound inside a Round.
- **The ring redraws on its own timer**, so what `__v3ring.verbs()` shows at a given instant jitters; probe
  the buttons it reads instead (verb_probe does).
- **A load mid-card** can still let a pending `Resolve` continuation or `FX` timer fire: their timers are not
  reset by `applySavedState`. Never reproduced.
- No bot seed reaches hidden fire (paragraphs 20/23), and seed 7000 clears a jam only once or twice; a change
  to those chains needs a driven check (see R4 in §6.6).
- `tools/retired/` holds proof tools for steps that are done (`split_mission1.py`, `check_split.py`, `rename_state.py`); they check the tree as it was then.

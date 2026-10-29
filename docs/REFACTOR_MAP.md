# REFACTOR_MAP — apps/v3 presentation code review

Scope: `apps/v3/` only (presentation). The 19 rules modules in `apps/game/` stay byte-identical; `tools/`
is used only to run the checks. Phases (agreed 2026-10-25): 0 baseline · 1 inventory · 2 seams ·
3 shared state · 4 duplication and dead code · 5 split plan · 6 step order and proof · 7 write-up.

Status: Phases 1-6 done (2026-10-25). Phase 7 write-up done (2026-10-28): `docs/refactor_writeup.html`,
published at https://claude.ai/artifact/9Af9q8R2LXkY8WRjt8ARBa (updated again in R7). Phase 0 (baseline run) not yet run.

---

## Phase 1 — Inventory

### 1.1 Files

| File | Lines | Owns | Global it exposes | Used by |
|---|---:|---|---|---|
| `mission1.js` | 6,176 | The whole Mission 1 controller: v2's `apps/game/mission1demo.js` (5,491 lines) re-pointed to v3's stage, plus v3 additions (diff: 810 added lines, 125 removed) | `AmbushMission`, `__mission1Debug` | shell, stack, lesson, director, tools/bot |
| `lessons.js` | 897 | Lesson data: words, asked moves, look-at targets (Basic Training and chapters 1-6) | `AmbushLessons`, `AmbushChapters` | lesson, director, shell |
| `director.js` | 428 | Lesson staging: camera, spotlight, Whitaker bubble, pointer (from PhantomFury) | `AmbushDirector` | lesson |
| `lesson.js` | 283 | Lesson runner: seeded dice, gates the player's clicks | `AmbushLesson` | shell, mission1 |
| `index.html` | 278 | DOM for every screen (title, mission select, learn, game HUD, popups) and the script load order | — | — |
| `shell.js` | 264 | Title, mission select, settings screen, game stage, the `?play=` entry used by the bot | `AmbushStage` | mission1 (`view.reveal`), ring, lesson, director |
| `audio.js` | 171 | Web Audio buses and synthesized cues | `AmbushAudio` | cues, shell, stack, mission1 |
| `counter_test.html` | 174 | Stand-alone test page for `counters.js` + `board.js` | — | nobody (manual) |
| `board.js` | 161 | Map view: four zoom levels and pan, one transform (from PhantomFury) | `AmbushBoard` | shell |
| `stack.js` | 149 | ×N badge and the stack panel for a hex with several tokens | (none) | — |
| `ring.js` | 141 | Moves the verb buttons into a ring around the selected counter, every frame | (none) | — |
| `cues.js` | 116 | The merged banner and Major Kranz's cameos | `AmbushCues` | mission1 (with a do-nothing stub if missing) |
| `counters.js` | 46 | Counter element builder `make/update` | `AmbushCounters` | **only `counter_test.html`**; the game draws counters with mission1.js's own `updateCounterVisual` |
| `settings.js` | 41 | Player settings in localStorage | `AmbushSettings` | audio, shell |
| `mission.css` | 520 | v2's in-play styles (dialogs scoped to `#dialogs-root`) + v3 layout, ring, world space, stacks, kit, tokens | | |
| `theme.css` | 166 | Shell look, colour tokens | | |
| `lesson.css` | 163 | Chapter list, spotlight, bubble | | |
| `counters.css` | 50 | Counter look and states | | |

From outside `apps/v3`, the page also loads `../game/ambushdialogs.js` (406 lines). It is v2's dialog engine,
presentation code that lives with the engine files. `mission1.js` takes `Toasts`, `Dialogs` and `FloatDialogs` from it.

**Load order** (`index.html` 230-276): 19 engine modules (with `grenade_scatter.js` before
`grenaderules.js`) → 13 data files → settings → audio → cues → board → counters → ambushdialogs →
**mission1** → shell → ring → stack → lessons → lesson → director. `mission1.js` runs its IIFE at load,
before `shell.js` exists, so it reaches `AmbushStage` lazily (`window.AmbushStage` checks at call time).

### 1.2 `mission1.js`, section by section

One IIFE, 248 top-level functions, 46 top-level mutable or constant `var`s. Line ranges come from its own
section rules.

| Lines | Size | Section | What it does |
|---|---:|---|---|
| 1-120 | 120 | Header, imports, constants | v2 header (partly stale, see 1.4); aliases for the 18 engine globals and 13 data globals; terrain labels and rows; heights hexes; entry hexes; dialog log for the bot |
| 121-320 | 200 | Data prep, weapon helpers | REAL_TERRAIN/LOS_TERRAIN, edge features, LOS wrappers, terrain row for a shot, weapon lookup, crew weapons, prepare/jam/usable, German card ID resolution |
| 321-373 | 53 | Victory target, difficulty | `setDifficulty`, VP requirement |
| 374-465 | 92 | Dice | `d10/d100`, the lesson's seeded stream, die tumble, hit and damage strips |
| 466-485 | 20 | Voice-over | `speak` (browser speech synthesis) |
| 486-511 | 26 | Log | `logLine/Header/Block` |
| 512-557 | 46 | Pop-up helpers | stat lines, actor rows, dice tray, `infoPopup/rollPopup`, `Cues` stub |
| 558-895 | 338 | Resolution cards | `PRESENTATIONS` (the build chooser) and the `Resolve` module (~300 lines) |
| 896-1051 | 156 | Board effects | `FX` module: muzzle flash, shake, stamps, sound, camera reveal |
| 1052-1378 | 327 | Map as information surface | `Info` module (~270) and `Sight` |
| 1379-1454 | 76 | Map rendering | counter elements, place/glide, event markers, `updateCounterVisual`, highlight |
| 1455-1653 | 199 | Roster / state, kit | the game state vars; finders; equipment names, boxes, ground items; weapon tokens and token strip; `kitHtml`; roster, VP, objectives render |
| 1654-1803 | 150 | §4 Squad Generation | quality rolls, buy squad, ratings, buy equipment |
| 1804-1867 | 64 | Entry placement | |
| 1868-2020 | 153 | Operations: selection and destinations | select/deselect, group move, destination marks, legal destinations |
| 2021-2375 | 355 | Combo moves, walking, HUD | §6/7 combo, `walkRoute/stepWalk`, `doMove`, `renderHud`, stance beat, `buildOpsCtx` |
| 2376-2576 | 201 | Paragraph Check, Condition Change, step chain | `runParagraphCheck`, condition-change scans, `presentParagraphChain/presentStep` |
| 2577-2955 | 379 | Contact, German activation, inspectors | contact terms, `activateGermansSequentially`, mid-round Germans, `presentActivation`, German card, tooltips, hit breakdown, soldier inspector, German weapon guesses |
| 2956-2995 | 40 | Action Round start | |
| 2996-3024 | 29 | §6/1 Event phase | |
| 3025-3544 | 520 | Awareness, initiative, track, turns, action panel | awareness checks, initiative, marker placement, track render, `driveNext`, pick actor, `beginTurn`, targets, `explainVerbs`, `showActionPanel`, round move, `chooseTarget`, assault candidates |
| 3545-3594 | 50 | §10 Grenade candidates and odds | |
| 3595-3641 | 47 | Drag candidates | |
| 3642-3790 | 149 | Pick Up / Exchange | offers, take from ground / German / soldier |
| 3791-3855 | 65 | §6/3 Command | give turn, make aware |
| 3856-4219 | 364 | Player verbs | stance, prepare, fire, grenade, drag, assault, capture-or-kill, clear jam, hit odds |
| 4220-4719 | 500 | German turn | `germanAutoTurn` (111), situation, decisions text, Kranz lines, `performGermanActions` (**232, the longest function**), target pick, finish, leave map |
| 4720-4810 | 91 | §6/8 German movement by reference | |
| 4811-4939 | 129 | §9/1 Fire chain, hidden fire | |
| 4940-5042 | 103 | §10 Grenade chain | |
| 5043-5133 | 91 | §11 Assault chain | |
| 5134-5242 | 109 | Damage, capture, casualties | `applyDamage`, capture, escapes, `recordCasualty` |
| 5243-5289 | 47 | Round bookkeeping | panic prone, `endRound` |
| 5290-5349 | 60 | Exit the map | |
| 5350-5400 | 51 | Victory / end mission | |
| 5401-5601 | 201 | Save / Load | serialize, list, `applySavedState` (107), load dialog |
| 5602-5719 | 118 | Start screen, build choice, game flow | |
| 5720-5843 | 124 | Automation seam | `VERBS` table, `verbsOffered` |
| 5844-6070 | 227 | `__mission1Debug` | ~50 entries, 39 of them `*ForTesting` hooks for the suites and the bot |
| 6071-6176 | 106 | `AmbushMission` | v3 API: `start, stack, hexOf, actOn, take, ask, lesson` |

**What the file holds, by kind** (approximate): presentation modules (Resolve, FX, Info, dice
visuals, pop-ups, kit) ~1,300; phase flow, from squad generation to victory, ~2,700; German side ~800;
combat chains ~430; save/load ~200; bot and test seams ~350.

**Longest functions:** `performGermanActions` 232 · `germanAutoTurn` 111 · `applySavedState` 107 ·
`grenadeChain` 91 · `assaultChain` 72 · `activateGermansSequentially` 71 · `fireChain` 70 ·
`resolveGermanMoveByReference` 69 · `doPlayerFire` 60.

### 1.3 How the files reach each other (detail in Phase 2)

- `shell.js` → `AmbushMission.start/ask`; `AmbushBoard.create`; settings and audio.
- `lesson.js` → `AmbushMission.lesson/hexOf`, `__mission1Debug.select`, `AmbushStage.view`.
- `director.js` → `AmbushMission.lesson/hexOf`, `AmbushStage.view`.
- `stack.js` → `AmbushMission.stack`, audio. `ring.js` → `AmbushStage.view`; it reaches mission1's
  buttons through the DOM ids, not through an API.
- `mission1.js` → `AmbushCues`, `AmbushAudio` (`play`, `steps`), `AmbushStage.view.reveal`.
- tools/bot → `__mission1Debug` (game.py, pacing.py, policy.py, autopsy.py) and the `VERBS` names.

### 1.4 Flags raised in the inventory (worked in later phases)

1. **`counters.js` is not used by the game.** `index.html` loads it, but only `counter_test.html` calls
   `AmbushCounters`. mission1.js draws counters with its own `updateCounterVisual`. Phase 4 decides:
   adopt it or drop it.
2. **The header of `mission1.js` is stale.** It still says "No Port Box/Ammo Box inventory model exists".
   The kit and token strip (2026-10-25) now show boxes. It also names the file `mission1demo.js` and v2's page.
3. **`ambushdialogs.js` is presentation code in `apps/game/`.** v3 loads it from v2's engine folder.
   Should v3 own a copy? Decided in Phase 2/5. The engine must stay byte-identical, but this file is not a rules module.
4. **`mission1.js` mixes three layers in one closure:** visuals (Resolve, FX, Info), flow and orchestration
   of the rules engine, and bot and test seams. Phase 3 measures how much state they share.
5. **`__mission1Debug` is big** (227 lines, 39 test hooks) and ships in the page. Phase 4/5 decides
   whether it gets its own file.
6. **`mission.css` holds two lineages:** v2's lifted styles and v3's layout. They are marked inside the file
   but kept in one file of 520 lines.

---

## Phase 2 — Seams

Five seams cross into or out of `mission1.js`. For each: what crosses it, how, and what a split must keep.

### 2.1 Engine seam (mission1.js → 19 rules modules + 13 data globals)

- **How:** plain calls on 16 aliases (`G, M, LOS, Checks, AR, Sched, FC, Gr, Asl, CW, SG, EQ, V, D, Ops, GAct`),
  about 300 call sites. The heaviest: `FC` (fire combat, ~90), `Sched` (AR scheduler, ~40), `D` (difficulty, ~40).
  The engine returns records; the page applies them to its own soldier objects.
- **Unused aliases:** `Hz` (AmbushHazards) and `Interp` (AmbushParagraphInterpreter) are imported and never called.
  `Interp` is reached through `Ops` (operationsloop.js:73). Hazards and penetration are reached only inside other
  modules. The script tags stay; the two aliases are dead.
- **Dice:** one source, `d10()` at mission1.js:380: `(lessonRng || Math.random)`. The bot seeds `Math.random`
  before the page loads (game.py:40); a lesson sets `lessonRng`. Animations draw from `crypto` and audio from an
  unseeded stream on purpose, so neither consumes the game's stream. **Any split must keep exactly one d10 and must
  not add a roll anywhere** (parity depends on the roll order).
- **Rules logic that lives in the page, not the engine.** The engine has no `legalActions`. Legality is assembled in
  mission1.js from engine predicates plus page-side rules:
  - weapon gates (`weaponUsable`, `canClearJam`, `canPrepareWeapon`, `WEAPONS_REQUIRING_PREPARATION`,
    `CREW_WEAPONS`, `crewFireAvailability`, `guardsAPrisoner`), lines 184-292;
  - movement and stance (`comboMoveBudget`, `standUpCost`, `stanceChangeIsFree`, `legalAdjacentHexIds`,
    `roundLegalDestinations`), `canExit`, `canThrowGrenade`, `grenadeMods`, `canFireAt`, the candidate lists for drag,
    pickup, give turn and make aware;
  - German choices (`germanPickTarget`, `germanAutoTurn`, `performGermanActions`), lines 4220-4719.
  These are cited (§) and tested by parity, but they are rules outside the 19 modules. The refactor moves them as
  they are. Promoting them into the engine is a separate decision, because the engine is to stay byte-identical.
- **Refusal text is written twice, by hand, in the page:**
  1. `explainVerbs` (3282-3310) writes `data-why` on each disabled button. Its strings are re-derived, not taken
     from the predicate that disabled the button, so the two can drift (e.g. `fireWhy` re-tests jam, broken, prepared
     and ammo in its own order).
  2. `AmbushMission.stack().takeWhy` (6096-6102) re-states the Pick Up rules as a chain of strings, apart from
     `pickupOffers`.
  The split should pair each predicate with its reason (one function returns `{ ok, why, cite }`), which is the
  folder's refusal rule.

### 2.2 Presentation pacing seam (logic ↔ Resolve / FX / pop-ups)

- **The game flow is written in continuation style through the presentation.** A roll is
  `rollPopup(opts, function () { …next step… })`, and `rollPopup`/`infoPopup` (554-555) push onto `Resolve`'s
  queue. The resolution card decides when the next step of the rules runs.
- Counted in the logic regions: the combat chains (4811-5242) make ~86 engine calls and ~60 presentation calls
  (`FX` 34, `rollPopup` 13, `renderRoster` 6…) and touch the DOM directly 0 times. The German turn (4220-4719): 22
  engine calls, `infoPopup` 19, direct DOM 0. Squad generation and save/load the same shape.
- **So the cheap clean cut is by section, not by layer:** combat, German turn, squad generation and save/load
  already reach the screen only through `rollPopup`, `infoPopup`, `FX`, `render*` and `updateCounterVisual`. They can
  move to their own files once those few functions are reachable from a shared namespace. A true logic/presentation
  split (an event stream the view plays back) would change the pacing code everywhere; it is out of scope for a
  refactor that must keep parity identical.
- Regions that do touch the DOM directly, and so stay with the view: Operations movement and HUD (2021-2375,
  19 DOM sites), the Round's action panel (3025-3544, 51), player verbs (3856-4219, 18). mission1.js has 224 DOM
  sites in all.

### 2.3 Bot seam (tools/bot → `__mission1Debug`)

- **The live contract is small:** `pendingDecision, board, choose, press, clickHex, select, pickActor, dialogLog`
  (game.py, pacing.py, policy.py, autopsy.py), plus `operationsNextStepForTesting` (game.py:211). `setPresentation`
  is documented in the seam header.
- **The other 38 `*ForTesting` hooks have no caller** in v3's `tools/`. They are named only in `docs/v1_reference/`
  (v1's live checks). Phase 4 confirms and proposes removing them or moving them to a test-only file.
- **Legality reaches the bot through the DOM.** `verbsOffered` (5755) reads each verb's button `disabled` and its
  section's `display`; `press` clicks the button. The bot "never reads the markup", but the page's markup is the
  source of the verb list. A split must keep the `VERBS` ids (`moveBtn`, `fireAimed`, …) and the section ids, or
  change `verbsOffered` in the same step.
- `board()` and `pendingDecision()` read `#tb-phase`'s text and `Dialogs.current`.

### 2.4 Lesson seam (lesson.js, director.js → `AmbushMission.lesson`)

- **API:** `lesson.load(fixture, rng)` (via `applySavedState`), `board`, `pending` (aliases of the bot seam),
  `activate`, `facts`, `sight/unsight`; plus `hexOf`, and `__mission1Debug.select`. `facts()` (6147-6171) asks the
  engine's own functions (movement chart, terrain row, `traceLOS`, the mission card parser), so a lesson's
  answers are the engine's. This is the model to follow.
- **Click gating is by DOM selector:** a capture-phase listener on `document` (lesson.js:275) classifies a click by
  `.counter[data-soldier-id]`, `#ring button` id, `#dialogs-root .target-row[data-idx]`, `button[data-btn-id]`,
  `#board` + `pixelToHex`. These selectors are a contract with mission1.js, ring.js and ambushdialogs.js.
- The lesson's fixtures are saves, so `applySavedState` is a lesson seam as well as save/load. Its 107 lines must
  stay one function, or move whole.

### 2.5 v3 helper seams (shell, ring, stack, cues, audio, board)

- **shell.js** → `AmbushMission.start/ask`. Stage view `AmbushStage.view` (`reveal`, `toWorld`) is used by
  mission1 (FX camera), ring, lesson, director. mission1 loads before shell, so it reads `window.AmbushStage` at call
  time. Keep that, or load shell first.
- **ring.js** owns no verbs: it moves mission1's buttons into `#ring` and lays them out each frame. It reads
  `#hud-soldier`, `#pick-sec`, `#cancelMoveBtn`, and whether a dialog, stack panel or scrim is open (by class).
- **stack.js** → `AmbushMission.stack/actOn/take`. `stack()` reads `#pickupBtn.disabled` and `#action-sec`'s
  display to decide if a take is legal (DOM as legality again, as in 2.3).
- **cues.js** is reached through `Cues` with a do-nothing stub (mission1.js:553); **audio** through
  `window.AmbushAudio` guards (`play`, `steps`). Both one-way, no state back. Clean.
- **board.js** is created by shell; mission1 reaches it only through `AmbushStage.view`. Clean.
- **ambushdialogs.js** is loaded from `apps/game/` and is byte-identical to v2's copy. It is the dialog engine
  behind `Dialogs.current`, which both the bot seam and the lesson gate read. It is presentation, not a rules
  module, so v3 may own a copy (`apps/v3/dialogs.js`) without touching the engine. Decided in Phase 5.

### 2.6 What a split must keep (the seam rules for Phase 5)

1. One `d10()`, the same roll order. No new rolls, no reordered `rollPopup` chains.
2. `window.AmbushMission` and `window.__mission1Debug`: same names, same shapes (the 9 live members at least).
3. The DOM ids and selectors in 2.3-2.5: `VERBS` buttons and sections, `#tb-phase`, `.counter[data-soldier-id]`,
   `#ring`, `#dialogs-root` rows and buttons, `#stack-panel`, `#hud-soldier`, `#pick-sec`.
4. Load order: engine → data → helpers → controller → shell → ring/stack → lessons → lesson → director. Any new
   controller file loads where mission1.js does, in dependency order, with one global.
5. `applySavedState` stays the single way to put a position on the board (saves and lesson fixtures).

### 2.7 Flags added in Phase 2

7. **Legality is read from the DOM** by the bot (`verbsOffered`) and by stack.js (`#pickupBtn.disabled`). One
   `verbs(s) → {name: {ok, why, cite}}` function would serve the buttons, the ring, the stack panel and the bot.
8. **Refusal reasons are written apart from the predicates** (`explainVerbs`, `takeWhy`), so they can disagree.
9. **38 of 39 test hooks are unused** by v3's tools.
10. **`Hz` and `Interp` aliases are dead.**
11. **Page-side rules** (weapon gates, German target choice, combo budgets) live outside the engine. They move as
    they are. Promoting them is a separate question for Wan.

---

## Phase 3 — Shared state

Method: every top-level `var` in `mission1.js`'s closure, with the sections (Phase 1 table, grouped to 28) whose lines
write it (assign, `push/splice`, field set) and read it. Made by a regex scan, so the counts are approximate: a
local of the same name can add a false hit. The groupings below are checked by hand.

### 3.1 Why it matters for a split

Everything in `mission1.js` shares one closure today. Plain `<script>` files cannot share a closure, so every
variable touched by two future files has to move onto one shared object, passed explicitly or as a global. The
fewer of these, the cleaner the cut.

### 3.2 The state, in five groups

**A. Saved game state.** `serializeState` writes these, `applySavedState` reads them back.

| Var | Written in | Read in (sections) | Note |
|---|---|---|---|
| `phase` | entry, ops, AR start, round end, save/load | **17** | the hub: nearly every section branches on it |
| `usSoldiers` | squadgen, save/load | 10 | soldiers are mutated through their fields, see 3.3 |
| `germans` | activation, AR start, save/load | 6 | |
| `opsState` | ops start, save/load | 10 | condition, sightings, event markers |
| `track`, `currentActorId`, `roundNum` | AR turns, save/load (+ bot seam writes `currentActorId`) | 10 / 7 / 3 | |
| `vpState` | save/load; mutated in place by contact, combat, verbs | 10 | |
| `currentGermanIdsThisRound`, `entryIndex`, `selectedId`, `difficulty` | 1-2 each | 1-6 | |

**B. Game state that is NOT saved** (see 3.4, flags 12-13)

| Var | Written in | Read in | Note |
|---|---|---|---|
| `groundItems` | roster/kit (`addGroundItem`), pickup (`splice`) | pickup, stack panel, debug | **not in the save, not cleared on load** |
| `pendingContact` | contact (2590) | AR start, Round 1 initiative (2982-3113) | consumed at Round 1 |
| `pendingConditionChange` | ops, contact, AR, German | contact, AR | |
| `lastSelectedId`, `shownVP` | ops, roster | debug | view-ish |

**C. In-flight flow state** (live only while a chain runs, all within one or two sections):
`pendingSteps`, `currentHex`, `currentParagraph`, `lastCheckQuiet` (ops ↔ paragraph check), `walking`,
`pendingCancelAction`, `stanceBeatTimer` (ops / AR panel), `picking` (AR turns, read by the bot seam and
`AmbushMission`), `destPicks` (ops, read by Info and the bot). None are reset by `applySavedState`.

**D. View handles:** `canvas`, `counterEls`, `destEls`, `pathEls`, `entryEls`, `eventMarkerEls`, `faceBuf`,
`stripTagsEl`, `voiceMuted`. `counterEls` is read in **10** sections, including the German turn (4) and combat (1),
which use it to ask "is this German on the map" (e.g. `stack()` filters Germans by `counterEls[t.id]`). That is
game state read off a view handle.

**E. Fixed after load:** terrain and LOS tables (`REAL_TERRAIN` read in 8 sections, `LOS_TERRAIN`, `LOS_ELEV`,
`edgeFeatures`), constants, `vpReachable`, `vpTarget` (from `setDifficulty`). Read-only, so safe to share.

**Seam state:** `dialogLog` (bot pacing), `lessonRng` (written only by `AmbushMission.lesson.load`), `automation`.

The three inner modules keep their own state privately and share none: `Resolve` (card, skipping, hold timers),
`FX` (svg, shake timer), `Info` (svg, tip, pinned hex). They are already the shape a split file should have.

### 3.3 Soldier objects: the real shared state

Soldiers and Germans are plain objects, and their fields are written all over the file. (Scan of
`s./t./g./target./firer./actor./…` field assignments; other variable names are missed, so these are lower bounds.)

| Field | Sections that write it |
|---|---|
| `stance` | squadgen, ops, player verbs, **German (4)**, combat (2), round end: 6 |
| `weaponPrepared` | weapon helpers, squadgen, player verbs, German, debug: 5 |
| `hexId` | squadgen, entry, ops, player verbs, German: 5 |
| `aware` | squadgen, AR (5), combat, save/load: 4 |
| `weaponId`, `weaponJammed` | squadgen/verbs/German/combat/debug: 4 each |
| `isActive`, `weaponBroken`, `usedFreeStanceChange` | 3 each |
| `status`, `wounded`, `mpRemaining`, `exited`, `comboMoveCostUsed`, `comboStepsUsed`, `crewFiredBy` | 2 each |

The engine computes and the page writes these fields; no module owns a soldier. That's fine for a refactor (the
objects are shared by reference and the save already captures them). But "who may change a soldier" is the
question to settle before any later engine work. Out of scope here.

### 3.4 Bugs and risks found

12. **Ground items are lost on save/load, and leak across loads.** `groundItems` (1471) is not in `serializeState`
    (5431) and `applySavedState` neither restores nor clears it. A save → reload page → load drops every item lying on
    the map (dropped by wound overflow, §13/2). A load or lesson fixture in the same page keeps the previous
    position's items in their hexes. Confirmed by reading; not yet reproduced live.
13. **In-flight state is not reset on load** (`pendingContact`, `pendingConditionChange`, `pendingSteps`, `walking`,
    `picking`, `destPicks`, `lastCheckQuiet`). `Dialogs.reset()` stops the pop-up chains, but these variables keep
    their values. Harmless if no load can happen with them set. `isSafeToSave` guards saving, not loading. The one to
    check first is `pendingContact`: it is set at contact and consumed at Round 1. Not reproduced; Phase 0/6 should
    test a load right after a contact.
14. **`counterEls` doubles as "this German is on the map".** Game logic reads a DOM map. A split that moves
    rendering away from the German turn must give it a real flag, or keep `counterEls` on the shared object.

### 3.5 What this means for the split (input to Phase 5)

- A single shared object, e.g. `var M1 = window.AmbushM1 = { state: {…group A + groundItems…}, view: {…group D…} }`,
  created first by the controller. Every split file reads `M1.state.phase`, not a closure `phase`. Group A plus
  `groundItems` is exactly what save/load should serialize, so one object fixes flag 12 by construction.
- Group C stays private to the file that owns its chain: paragraph check (`pendingSteps`, `currentHex`,
  `currentParagraph`, `lastCheckQuiet`), ops movement (`walking`, `stanceBeatTimer`, `destPicks`), AR turns
  (`picking`, `pendingCancelAction`). Each file exposes one `reset()` for `applySavedState` to call (fixes flag 13).
- Group E goes into a `m1_data.js` (terrain tables, constants), loaded first and read-only.
- `Resolve`, `FX`, `Info` move out whole. They need only the dice and terrain helpers and the soldier finders.
- Renaming every closure read of `phase` (≈110 lines), `track`, `usSoldiers`… to `M1.state.x` is the largest
  mechanical edit of the refactor. It must land as its own step, proven by parity, before any file is split.

---

## Phase 4 — Duplication and dead code

Method: a reference count for every function, debug hook, CSS class/id and `index.html` id across `apps/v3` and
`ambushdialogs.js` (and `tools/` for the hooks). Each hit was then checked by reading, because names built at run time
(`'edge-' + f`, `'pop-' + name`) give false "dead" results. Line counts are approximate.

### 4.1 Dead code (safe to remove; nothing in the game, tools or lessons reaches it)

| What | Where | ~Lines | Evidence |
|---|---|---:|---|
| 43 unused debug hooks: all `*ForTesting` except `operationsNextStepForTesting`, plus `saveGame, listSaves, loadSaveAtIndex, openLoadDialog, isSafeToSave, startGameFlow` | `__mission1Debug`, 5844-6070 | ~190 | 0 hits in `tools/`, the v3 files, lessons; named only in `docs/v1_reference/`. Live members: `pendingDecision, board, choose, press, clickHex, select, pickActor, dialogLog, setPresentation, tryExit, state, operationsNextStepForTesting` |
| The A/B presentation chooser. Classic dialogs were retired 2026-09-21, and `PRESENTATIONS` has one entry, so `Resolve.active()` is always true | `PRESENTATIONS`, `presentationById` (568-590), `choosePresentation` (5608-5635), `#presentationBtn`, `#build-label`, `UI_KEY`, 16 `on()` guards in FX/Info, `Resolve.active()` tests at 672, 1405, 2116, 3196, 5800 | ~70 | the chooser shows only when `PRESENTATIONS.length > 1`; `known()` maps any stored mode to `cards` |
| `diceTrayHtml` | 536-553 | 18 | no caller (v1's pop-up dice tray) |
| `pathEls`, `clearPathMarks`, `.path-mark` | 1385, 1939, mission.css:30 | 4 | `pathEls` is never filled |
| `Hz`, `Interp` aliases | 75, 81 | 2 | never called (Phase 2) |
| Unused CSS: `.result-line`, `.paragraph-body` (v1/v2 dialogs), `.kit-boxes`, `.kit-box` (the text kit, replaced by the token strip on 2026-10-25) | mission.css 103-106, 487-490 | 8 | no class written anywhere |
| `#log-sec` id | index.html | 1 | id unused (the element stays; only the id is dead) |

About **290 lines** in all, nearly all in `mission1.js`. Removing them changes no roll and no seam the tools use, so
parity must come out identical. It should be the refactor's first step.

### 4.2 Code with one user that is not the game

- **`counters.js`** (46) + `.palette-vassal`: used only by `counter_test.html`. It is **not a drop-in** for
  mission1's counters: it gives Germans a crouching scan when they crouch, while mission1 always shows a German's
  `s.img`; it has no commander star and no stance-change rustle. Two choices: (a) make it the one counter builder
  (4.3 item 2) and settle the German scan, or (b) move it and `counter_test.html` to `tools/` as a test page and stop
  loading it in `index.html`. **Wan's call.**
- **`apps/game/mission1demo.js`, `mission1.html` and the sandboxes** are v2's pages carried into v3. Out of scope
  (not `apps/v3`). Listed so nobody refactors the wrong copy.

### 4.3 Duplication (fold into one place)

1. **The to-hit roll card is written five times.** `fireChain`, `hiddenFireChain`, `grenadeChain`, `assaultChain`
   and the jam/clear rolls each build a `rollPopup` spec whose `explain`, `logText`, `fxLanded` and continuation each
   re-test `FC.resolveHitRoll(x, roll) === 'hit'`. That makes 17 copies of the test and 13 `fxLanded` blocks of the same
   float-die / sound / shake-or-badge shape. One `toHitCard({ chance, actor, title, strip, hitText, missText,
   fx }, onHit, onMiss)` keeps each chain's words and removes the copies. Roll order is unchanged (one `d10` per card).
2. **Counters are built in four places:** US at entry (1836-1856) and on load (5491-5512), with the same 11-line
   click handler (diffed: identical); Germans at activation (2779-2786) and on load (5516-5524), identical. One
   `makeCounter(s)` (or `counters.js`, see 4.2) removes three copies, and a later change to counter clicks can no longer
   miss one of them.
3. **Legality and its reason are computed twice** (Phase 2, flags 7-8): `showActionPanel` decides `disabled`,
   `explainVerbs` re-derives the `why` text, `stack().takeWhy` re-states Pick Up. One `verbs(s) → {name: {ok, why, cite}}`.
4. **"Standing or crouching"** is tested inline 10 times (prepare, clear jam, pick up, take, …). One `upright(s)`
   with its §6/7 cite.
5. **"Out of the fight"** (`incapacitated | killed | captured`): inline in mission1.js and as `OUT` in counters.js.
   One `isOut(s)`.
6. **Finders:** `Object.keys(germans).map(…)` is inlined 4 times beside `allGermans()`, and `usSoldiers.filter(…)`
   6 times beside `activeUS()`/`groupAt()`. `allInHex` rebuilds `allGermans()` inline. Small; fold while moving.
7. **Kept on purpose:** `hitBreakdownHtml/Text` and `decisionsHtml/Text` are HTML and plain-text twins for the
   card and the log/tooltip. They read the same record, so they cannot disagree on numbers. Leave them.

### 4.4 Other findings

15. **v3 shares v2's localStorage keys:** `ambush-mission1-saves-v1` (saves) and `ambush.v2.presentation/speed`.
    Under `file://`, Chrome gives all local files one origin, so v2's and v3's save lists are the same list, and a v3
    save (with fields v2 lacks) can be loaded into v2 and the other way round. v3's own keys use two other styles
    (`ambush.v3.lessons.done`, `ambush_v3_settings`). Proposal: `ambush.v3.saves` and `ambush.v3.speed`, with a
    one-time import of old saves offered or not (**Wan's call**). Not reproduced; by reading.
16. **Stale comments:** mission1.js's header (Phase 1 flag 2), the "v2 task N" and "Task #NN" references (fine as
    history), and `stack()`'s comment still speaking of "v2's button". Header rewrite is part of the split.

### 4.5 Order these enter the refactor (input to Phase 6)

1. Remove the dead code in 4.1 (one step; parity identical).
2. Fold 4.3 items 4-6 (small helpers; parity identical).
3. `makeCounter` (4.3 item 2), after Wan decides 4.2.
4. `toHitCard` (4.3 item 1), chain by chain, parity after each.
5. `verbs()` with reasons (4.3 item 3). This touches the bot seam (`verbsOffered`), so it comes last and must keep
   its output identical.

---

## Phase 5 — Split plan

### 5.1 Decisions (Wan, 2026-10-25)

- Split `mission1.js` **by section, about 12 files** (13 below).
- **`counters.js` becomes the one counter builder.** It takes mission1's behaviour: a German shows `s.img`, the
  commander star, the stance-change rustle.
- **Saves get v3's own key** (`ambush.v3.saves`); the shared v1/v2 list is imported once.
- **Bug 12 (ground items) is fixed by the refactor**, through the shared state object.

### 5.2 What a split costs: measured

With the 13 files below, **236 of the 351 top-level names** in mission1.js are used outside the file that would
define them. `seams` and `rounds` each use ~96 foreign names, `operations` 73; `core` is used for 86 names by the rest.
A closure cannot span files, so these 236 names need a shared scope. Two checks make the cheap route safe:

- **Nothing at load time calls forward.** The only statements that run at load are listener registrations (their
  callbacks run later), data prep from the data globals, the `Resolve`/`FX`/`Info` set-up (internal calls only), and one
  `renderVP()` at the very end (6068). So if the files load **in the original line order**, every name is defined
  before load-time code runs. Listeners also register in the same order, which matters for the `keydown` and
  `pointerdown` handlers that stop propagation.
- **No collisions.** None of the 351 names is a browser global (`name`, `status`, `open`, `top`, `event`, …) or a
  top-level name in the engine and data files.

### 5.3 How: three stages, each proven by parity

**Stage A — cut, no renames.** Each file is a plain script with `'use strict'` and **no IIFE**, so its top-level
`function`s and `var`s land in the one shared global scope, exactly as they share the closure today. The code moves
byte for byte; only the IIFE's first and last lines go. Parity must be identical, because the code and the order are
unchanged. Cost: ~350 names on `window` until Stage C.

**Stage B — state onto one object.**
`var M1 = window.AmbushM1 = { state: { phase, usSoldiers, germans, opsState, vpState, track, currentActorId, roundNum,
currentGermanIdsThisRound, entryIndex, selectedId, difficulty, groundItems } }`, created in `core.js`. Each read and
write of those 13 vars becomes `M1.state.x`; `phase` alone is ~110 lines. `serializeState` writes `M1.state`, and
`applySavedState` reads it back. **That fixes bug 12** (ground items saved and restored). Each file that owns chain
state (group C, Phase 3) gets a `reset()` that `applySavedState` calls. **That fixes bug 13.** The save keeps reading
`version: 1` saves (no `groundItems` field means empty), so old saves still load. Parity identical. A new live check
covers save → reload → load with an item on the ground.

**Stage C — namespace, file by file.** Wrap one file in an IIFE and put the names other files use on `AmbushM1`
(`M1.fireChain`). Callers change to `M1.fireChain(…)`, resolved at call time, so the load order no longer has to
carry the dependency. Leaf files go first (`info`, `present`, `roster`), `core` last. At the end `window` holds
`AmbushM1`, `AmbushMission` and `__mission1Debug` only, and each file's header lists what it exports and uses.
Parity after each file.

### 5.4 The files (`apps/v3/mission1/`, in load order)

Sizes are after Phase 4's dead code is removed; "uses" and "used for" count the names crossing the file's edge.

| # | File | From lines | ~Lines | Holds | Used for / uses |
|---|---|---|---:|---|---|
| 1 | `core.js` | 1-373 | 370 | engine and data aliases, constants, terrain/LOS tables, weapon and crew-weapon rules, VP target, difficulty, `UI.init`, objectives and voice buttons, `M1.state` (Stage B) | ~70 / 3 |
| 2 | `present.js` | 374-1051 | 590 | dice and strips, voice, log, pop-up helpers, `Resolve`, `FX` | ~20 / 14 |
| 3 | `info.js` | 1052-1378 | 325 | `Info` (the map as information surface), `Sight` | 2 / 32 |
| 4 | `roster.js` | 1379-1653 | 275 | map rendering, counters (via `counters.js`), finders, kit and token strip, roster/VP/objectives render | 35 / 15 |
| 5 | `setup.js` | 1654-1867 | 215 | §4 squad generation, entry placement | 4 / 25 |
| 6 | `operations.js` | 1868-2576 | 705 | selection, destinations, combo moves, walking, HUD, Paragraph Check, Condition Change, step chain | 33 / 73 |
| 7 | `contact.js` | 2577-2955 | 380 | contact terms, German activation, German card, tooltips, hit breakdown, inspector | 8 / 43 |
| 8 | `rounds.js` | 2956-3544 | 590 | Action Round start, events, awareness, initiative, track, turn driving, action panel, round move, target choice | 16 / 96 |
| 9 | `verbs.js` | 3545-4219 | 675 | grenade, drag, pick up, command, stance, prepare, fire, assault, clear jam (the player's verbs) | 28 / 64 |
| 10 | `german.js` | 4220-4810 | 590 | German turn, German actions, German movement by reference | 3 / 60 |
| 11 | `combat.js` | 4811-5400 | 590 | fire, hidden fire, grenade and assault chains, damage, capture, round end, exit, victory | 12 / 61 |
| 12 | `save.js` | 5401-5719 | 290 | save/load (new key + import), start screen, game flow | 6 / 48 |
| 13 | `seams.js` | 5720-end | 290 | `VERBS`, `verbsOffered`, `automation`, `__mission1Debug` (live members only), `AmbushMission` | 0 / 96 |

`combat.js` keeps round end, exit and victory (5243-5400) because Stage A keeps line order. They can move to
`rounds.js` in Stage C, when order stops mattering.

### 5.5 index.html load order (Stage A onward)

engine (19, unchanged) → data (13, unchanged) → `settings, audio, cues, board, counters` → `../game/ambushdialogs.js`
→ **`mission1/core, present, info, roster, setup, operations, contact, rounds, verbs, german, combat, save, seams`**
→ `shell, ring, stack, lessons, lesson, director`. No file in `tools/` names `mission1.js` (checked), so the bot, the suites and the
live checks need no change.

### 5.6 The other moves

- **`counters.js` as the builder:** `AmbushCounters.make(s, onClick)` and `update(el, s)` take mission1's rules: a
  German always shows `s.img`, the commander star, the rustle through an `onStance` hook so `counters.js` stays free of
  FX. `roster.js` calls it from the four sites in Phase 4.3 item 2. `counter_test.html` keeps working on the same API.
- **Saves:** `ambush.v3.saves` and `ambush.v3.speed`. On first open, if `ambush.v3.saves` is missing, copy
  `ambush-mission1-saves-v1` into it once, and leave the old key alone for v2. The presentation key goes with the chooser.
- **`ambushdialogs.js` stays loaded from `apps/game/`.** It is byte-identical to v2's and v3 doesn't change it. Copy it
  into v3 only on the day v3 needs to edit it.
- **`mission.css`:** split at its line 327 into `mission.css` (v2's lifted styles) and `hud.css` (v3 layout, ring,
  world space, stacks, kit, tokens). Optional; a pure move.
- **Not moving:** the 19 rules modules. The page-side rules (weapon gates, German target choice, combo budgets) stay
  in `core.js` and `german.js` as they are (Phase 2, flag 11).

### 5.7 Done means

`mission1.js` gone; 13 files, none over ~700 lines; three globals; one `d10`; `AmbushMission` and the live members of
`__mission1Debug` unchanged; the bot, lessons and live checks unchanged; parity identical to
baselines after every stage; bugs 12 and 13 fixed and covered by a live check.

---

## Phase 6 — Step order and proof

### 6.1 The proof, in two tiers

The 17 `tools/test_*.js` suites test the **engine**, which the refactor doesn't touch, so they guard only against an
accidental engine edit. The real proof for presentation code is bot parity, decision traces and the live drives.

| Tier | What | ~Time |
|---|---|---:|
| **T1 quick** (after every step and sub-step) | `node --check` on each changed file; the 17 suites; parity on seeds 7000-7005, Normal and Easy (`AMBUSH_PAGE=v3 python3 tools/bot/run.py --seeds 6 --seed-base 7000 [--difficulty easy] --jsonl …`) compared with `tools/bot/baselines/v3_*`; a **trace diff** of seed 7000 on both difficulties (`--seed 7000 --trace …`) against the Step 0 traces | 4 min |
| **T2 full** (end of each stage, and before a session stops) | T1, plus parity 30/30 Normal and 30/30 Easy (`--seeds 30 --seed-base 7000 --workers 4`), plus the five `live_*.py` with 0 console errors | 20 min |

"Identical" means every field of each run record is equal except `seconds`: `outcome, vp, need, result, rounds,
activations, casualties, exited, steps, console_errors, error, banner`. `steps` equal is the strong part, since the
bot made the same number of decisions. A trace diff catches a game that drifts mid-way and ends on the same totals.

### 6.2 No git: the safety net

`AMBUSH_V3` is not a git repository; it lives in Dropbox. Before Step 1 the refactor needs a way back.
**Recommended:** `git init` in `AMBUSH_V3` (local only, no remote), one commit per step after its proof passes. A
failed step is then `git checkout` away, and each step's diff can be read. **Alternative:** copy `apps/v3/` into
`_refactor_snapshots/step_N/` before each step. **Decided (Wan, 2026-10-25): git.** `git init` done; the first commit (the current, pre-refactor code) is part of Step 0.

### 6.3 Steps

| Step | Change (map ref) | Risk | Proof |
|---|---|---|---|
| **0 — Baseline** (Phase 0) | Write `tools/bot/compare.py` (two jsonl files → identical / differing seeds and fields). Run T2 on the current code and confirm it matches `v3_*` baselines. Record trace baselines for seed 7000, both difficulties. Reproduce bugs 12 and 13 live and record what happens. Set up the safety net (6.2). | none (no game code changes) | T2 green on current code |
| **1 — Dead code** (4.1) | Remove the 43 unused hooks, the presentation chooser (keep `setPresentation` as a no-op that returns `'cards'`, a live member), the `on()` / `Resolve.active()` guards, `diceTrayHtml`, `pathEls`, `Hz`/`Interp`, 4 dead CSS classes; rewrite the stale header | low; the chooser sits inside `Resolve`'s set-up | T1, then T2 |
| **2 — Small helpers** (4.3 items 4-6) | `upright(s)`, `isOut(s)`, inline finders → `allGermans()`/`activeUS()` | low | T1 |
| **3 — Stage A cut** (5.3, 5.4) | Move the code byte for byte into the 13 files; drop the IIFE; update `index.html` (5.5). One script does the cut from line ranges, so nothing is retyped. | medium: load order. Checked in Phase 5 | `node --check` per file; T2; also a scripted check that the 13 files concatenated equal the old body |
| **4 — counters.js builder** (4.3 item 2, 5.6) | `AmbushCounters.make/update` with mission1's behaviour; 4 sites call it | low-medium: German scan, star, rustle | T1; `live_map.py`; one screenshot (US, German, commander, crouched, dead); `counter_test.html` opens |
| **5 — toHitCard** (4.3 item 1) | One builder; fire → hidden fire → grenade → assault → jam, **one chain per sub-step** | medium: card wording and `fxLanded` timing | T1 + trace diff after each chain; T2 after the last |
| **6 — Stage B state** (5.3) | `M1.state` holds the 13 vars; a scripted rename of each read and write (~110 lines for `phase`) | medium-high: a missed rename leaves a stale global | T2; plus a grep that no bare reference to a moved var remains |
| **7 — Save fixes** (bugs 12, 13) | `groundItems` in the save; a `reset()` per file with chain state, called by `applySavedState`; `version: 2` saves, still reading `version: 1` | medium: changes save behaviour, by design | T2; **new `tools/live_save.py`**: drop an item, save, reload, load, item still there; load during a contact, no stale state; a v1 save still loads |
| **8 — Save key** (5.6) | `ambush.v3.saves` / `ambush.v3.speed`; one-time import from `ambush-mission1-saves-v1` | low | `live_save.py` extended: a seeded old-key save appears once, v2's key untouched |
| **9 — Stage C namespace** (5.3) | Wrap each file in an IIFE and export through `AmbushM1`; callers change to `M1.x()`. Order: info, present, roster, setup, contact, save, german, combat, verbs, operations, rounds, seams, core | medium per file, low each time | T1 after each file; T2 at the end; a live check that `window` has just the three globals from `apps/v3/mission1/` |
| **10 — verbs() with reasons** (4.3 item 3, flags 7-8) | One `verbs(s) → {name: {ok, why, cite}}` feeds the buttons, `data-why`, the ring, `stack()` and `verbsOffered` | **high**: touches the bot seam | T2; plus a probe that records `verbsOffered()` and every `data-why` at each bot decision of seed 7000 and must match the Step 0 record (any intended wording change listed and approved) |
| **11 — Tidy** (5.6) | `mission.css` → `mission.css` + `hud.css` (optional); file headers list exports and uses; a v3 `HANDOFF` section for the new layout | low | T1; `live_map.py` |

Steps 1-3 are the core. After Step 3 the file is split, parity is proven and the rest is clean-up. Steps 4-11 can
pause anywhere, because each leaves the game complete.

### 6.4 Sessions (one phase per session, CLAUDE.md)

| Session | Steps | Ends with |
|---|---|---|
| R1 | 0 (baseline, compare.py, safety net, bug repro) | T2 on current code, report |
| R2 | 1, 2 | T2 |
| R3 | 3 (the cut) | T2 |
| R4 | 4, 5 | T2 |
| R5 | 6, 7, 8 (state and saves) | T2 + `live_save.py` |
| R6 | 9 (namespace) | T2 + globals check |
| R7 | 10, 11 | T2 + verb probe; Phase 7 write-up updated |

Phase 8d (chapter 6) waits until R3 at least. After R3 its lesson code lands in the new files rather than in a
6,000-line one.

### 6.5 Stop rules

- If a step's T1 shows any difference, stop. Don't patch forward: roll back (6.2), find the cause, redo the step.
- An intended behaviour change (Steps 7, 8 and any wording in 10) is listed before the step and approved by Wan. After
  it, re-record the baselines it changes, and only those.
- No engine file (the 19 rules modules) changes in any step. T2 checks them against the Step 0 sha256 manifest (6.6; three differ from v2 since Phase 8c).

### 6.6 Step 0 results (R1, 2026-10-29)

On commit `2ce0ebe`, no game code changed. **T2 green.**

| Check | Result | Time |
|---|---|---:|
| `node --check` apps/v3/*.js (12 files) | pass | <1 s |
| 17 engine suites | 17/17, 3,099 checks, 0 failed | 5 s |
| Parity Normal, seeds 7000-7029 | IDENTICAL to `v3_normal_seeds_7000-7029.jsonl` (30/30, 0 console errors) | 269 s |
| Parity Easy, seeds 7000-7029 | IDENTICAL to `v3_easy_seeds_7000-7029.jsonl` (30/30, 0 console errors) | 305 s |
| Seed-7000 traces, both difficulties | recorded twice, identical (Normal 282 entries, Easy 408) | 40 s |
| Five `live_*.py` | chapters 55, drills 55, germans 36, lesson 39, map 47 checks ok; 0 fail; 0 console errors | ~6 min (derived) |
| Engine | 19/19 match `tools/bot/baselines/refactor/engine.sha256`; 16/19 byte-identical to v2 | <1 s |
| **`tools/t1.sh`** | PASS | **186 s** |
| **`tools/t2.sh`** (T1 + 30/30 + 30/30 + live + engine) | PASS | **1,112 s (18.5 min)** |

**Two corrections to 6.1 and 6.5, found here.**
- **`steps` is not a game field.** It counts the harness's polling loops and jitters run to run on unchanged code
  (`tools/bot/baselines/README.md` already said so). Against the baselines all 30 seeds differed in `steps` only
  (Normal +4..+80, Easy -6..+66), and two simultaneous trace runs of seed 7000 diverge in `step` at entry 17 with the
  same decision. So `compare.py` ignores `seconds` and `steps` (`--with-steps` to include it), and "the bot made the
  same decisions" is proven by the **trace diff** instead: every `act` / `choose` / `dialog` entry in order, with `t` and
  `step` ignored. Every game field matched 30/30 on both difficulties, so the v3 baselines were not re-recorded.
- **The engine is not byte-identical to v2.** Phase 8c changed `arscheduler.js`, `paragraphinterpreter.js` and
  `operationsloop.js` by design (PROGRESS 2026-10-25). T2's engine check is therefore a sha256 manifest of the 19
  modules taken at Step 0, plus `cmp` against v2 for the other 16.

**Bug 12 reproduced live** (`tools/repro_save.py`, seed 7000). In Round 1, `applyWoundForTesting(us0)` wounds Pvt. Mercer
in I2 and he drops his BAR (§13/2): `groundItems = {I2: [bar]}`, his Port Boxes `[null, null]`. Then:
- The save written after the drop has no `groundItems` key (keys: currentActorId, currentGermanIdsThisRound,
  difficulty, entryIndex, germans, opsState, phase, roundNum, savedAt, selectedId, track, usSoldiers, version, vpState).
- **Leak / duplicate:** loading the save made *before* the drop, in the same page, leaves the BAR on the ground in I2
  *and* back in his Port Boxes. Two BARs.
- **Lost:** reload the page, load the post-drop save: ground `{}`, his Port Boxes `[null, null]`. The BAR is gone.
- 0 console errors. Side note: `applyWoundForTesting` throws in Operations (`renderTrack` → `Sched.isRoundComplete` on
  a null `track`); a hook limitation (no real wound happens outside a Round), so the repro wounds inside a Round.

**Bug 13 reproduced live** (seed 7000). The bot saves at each quiet Operations point. Contact paragraph 312 ("US
advantage. The US soldier who just made his PC check is automatically aware") sets `pendingContact`; the play log shows
"Pvt. Mercer made the PC check and is automatically aware (paragraph 312)". At that moment, with the "US Awareness
Check" pop-up open and no Initiative rolled yet, the last Operations save is loaded (`loadSaveAtIndex`, which runs
`applySavedState`, the same as a Load-dialog row). Phase is back to Operations, Round 0, no active Germans. Then German 9
is activated at K5 with no paragraph (`spawnGermanForTesting`, the production `activateGermansSequentially`), which
starts a fresh Round 1. Its log:

    German activated: German (GE 9/R, Soldier) at K5.
    Pvt. Mercer made the PC check and is automatically aware (paragraph 312).
    Round 1 Initiative: US 4, German 7 → advantage US (set by paragraph 312).
    Pvt. Mercer receives 2 turns this Round, no roll (paragraph 312).

The abandoned paragraph's three terms (auto-aware, fixed advantage against a German 7, 2 turns without a roll) are
applied to a Round it never started. 0 console errors. In ordinary play a later contact paragraph *with* terms overwrites
`pendingContact` and hides the bug; a Round 1 started any other way (a chain without a `contact` op, an Event marker)
shows it. Not tested: whether the Load *button* is reachable while a pop-up is open (the repro calls the hook).

**Files added in Step 0.** `tools/bot/compare.py`; `tools/t1.sh`, `tools/t2.sh`; `tools/repro_save.py` (becomes
`live_save.py` in Step 7, its checks flipping from "present" to "fixed"); `tools/bot/baselines/refactor/`
(`trace_{normal,easy}_7000.json` + their run records, `engine.sha256`).

**R2 results (2026-10-29): Steps 1-2, T2 green after each** (Step 1 1,088 s, Step 2 1,078 s; parity 30/30 + 30/30
identical, traces identical, 5 live drives pass, engine unchanged). `mission1.js` 6,176 → 5,868 (Step 1) → 5,872 lines.
- **Step 1** (`af91b5b`, -378 / +59 lines over 3 files): 36 debug hooks; the presentation chooser (`PRESENTATIONS`,
  `presentationById`, `choosePresentation`, `#presentationBtn`, `#build-label`, `UI_KEY`, `Resolve.setMode/active/
  mode/forced/lastPlayed`, `startGameFlow`'s `skipChooser`); 15 `on()` guards in FX/Info and 4 `Resolve.active()`
  tests (the else-branch banner text went with them); `diceTrayHtml`; `pathEls`/`clearPathMarks`/`.path-mark`;
  `Hz`/`Interp`; `.result-line`, `.paragraph-body`, `.kit-boxes`, `.kit-box`; the `#log-sec` id. Header rewritten.
- **Kept on purpose:** 7 hooks the 4.1 table called dead are used by `tools/repro_save.py` (added in R1):
  `spawnGermanForTesting, saveGame, listSaves, loadSaveAtIndex, isSafeToSave, applyWoundForTesting,
  groundItemsForTesting`. `setPresentation()` returns `'cards'`; `board().presentation` is the literal `'cards'`. The
  set-up still shows `#speedCtl`, titles the log "Radio Log" and adds `body.cards-mode` (0 CSS users; harmless).
  `startGameFlow` stays (`AmbushMission.ask` uses it). `localStorage` `ambush.v2.presentation` is no longer written.
- **Step 2:** `upright(s)` (4 sites: canClearJam, canPrepareWeapon, pickupOffers, `stack().takeWhy`); `isOut(s)` (1
  site, the counter's `dead` class); `allGermans()` in activeGermans, allInHex, the Round's crewFiredBy reset and
  `board().germans`; `activeUS()` in groupAt. **Left as they are (not exactly equal):** `stance !== 'prone'` tests
  (differ if `stance` were unset); `counters.js`'s `OUT` (another file, Step 4); the German counter loop on load
  (Step 4); `usSoldiers.filter` in findSoldier, the inactive-mates finder and Ending 1 (different predicates).
- **For R3:** §5.4's line ranges are stale; re-derive them from section markers on the current file.

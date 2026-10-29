# PROGRESS — Ambush! Digital v3

> New here? Read `CLAUDE.md`, then `docs/00_V3_BRIEF.md`. v2 is frozen in `../AMBUSH_V2/`.

## 2026-10-29 (rule change: no more one-task-at-a-time)
- Accomplished: global `__SCAD/_CLAUDE/CLAUDE.md` "Session scope" rewritten: a request for several tasks/phases/items runs them all
  in one go, verifying each, no stop between them; AMBUSH_V3 and AMBUSH_V2 punch-list rules changed to match.
- Decisions (Wan): permanent for every project; replaces the 2026-10-02 one-phase-per-session rule and the auto-run exception.
- Next: unchanged: Wan approves R1-R7, then the refactor sessions (now runnable back to back).

## 2026-10-28 (code review Phase 7: write-up)
- Accomplished: "Ambush v3 Refactor Plan", https://claude.ai/artifact/9Af9q8R2LXkY8WRjt8ARBa (source `docs/refactor_writeup.html`):
  a decision page for approving R1-R7: the ask, the to-scale before/after file strip, 13-file table, findings (bugs 12, 13, 15,
  dead code, duplication, DOM legality), stages A/B/C, the session track with risk per step, T1/T2 proof and the stop rules.
- Decisions (Wan): audience is Wan approving R1-R7, as a visual page; REFACTOR_MAP.md stays the source of record.
- Next: Wan reads the page and approves (or amends) R1-R7; then R1 (Step 0: compare.py, T2 baseline, seed-7000 traces, live
  repro of bugs 12 and 13) in a fresh session.

## 2026-10-28 (git snapshot, console check)
- Accomplished: .gitignore added (.DS_Store, local Claude settings, __pycache__); everything committed as 80af2ba (amended from 7870346 to author ProfChiu), the pre-refactor
  snapshot on master. Console checked: p1-p2 signed off, p3-p8c built and awaiting sign-off, p8d (Chapter 6) and p9 planned.
- Decisions: 8d waits for the refactor (after R3), so the console's "next" is not the real next step; refactor sessions not yet
  added to the console (needs Wan's go-ahead to write its database).
- Open: this entry and the
  Phase 6 note are uncommitted.
- Next: code review Phase 7 (artifact of REFACTOR_MAP.md), then R1 (Step 0: compare.py, T2 baseline, seed-7000 traces, live repro
  of bugs 12 and 13) in a fresh session.

## 2026-10-25 (code review Phase 6: step order and proof)
- Accomplished: docs/REFACTOR_MAP.md Phase 6: proof tiers (T1 quick ~4 min: checks, suites, 6-seed parity, trace diff; T2 full
  ~20 min: 30/30 both difficulties + five live drives), 12 steps (0 baseline + compare.py, 1 dead code, 2 helpers, 3 the cut,
  4 counters, 5 toHitCard, 6 state object, 7 save fixes + live_save.py, 8 save key, 9 namespace, 10 verbs with reasons, 11 tidy)
  in 7 sessions R1-R7, with stop rules (any diff: roll back, don't patch forward).
- Found: AMBUSH_V3 has no git, so a rollback needs git init (recommended) or folder snapshots; there is no compare script for parity.
- Next: Phase 7 (write-up: artifact of the map), then R1 (Step 0 baseline) in a fresh session; Wan chose git: repo initialised and first commit 7870346 (pre-refactor snapshot) made 2026-10-25.

## 2026-10-25 (code review Phase 5: split plan)
- Accomplished: docs/REFACTOR_MAP.md Phase 5: mission1.js into 13 files under apps/v3/mission1/ (core, present, info, roster, setup,
  operations, contact, rounds, verbs, german, combat, save, seams), in three stages: A cut with no renames (shared global scope, original
  line order), B state onto M1.state (fixes ground items and load resets), C namespace file by file down to three globals.
- Measured: 236 of 351 top-level names cross files; load-time code never calls forward; no name collides with a browser or engine global.
- Decisions (Wan): ~12 files by section; counters.js becomes the one builder (with mission1's German scan, star, rustle); v3 saves on
  ambush.v3.saves with a one-time import of the shared list; bug 12 fixed by the refactor.
- Next: Phase 6 (step order and proof), fresh session.

## 2026-10-25 (code review Phase 4: duplication and dead code)
- Accomplished: docs/REFACTOR_MAP.md Phase 4: dead code (~290 lines: 43 unused debug hooks, the one-entry A/B presentation
  chooser and its 16 guards, diceTrayHtml, never-filled pathEls, Hz/Interp, 4 dead CSS classes), duplication to fold (to-hit card
  x5 with 17 copies of the hit test, counter built in 4 places, legality+reason twice, small inline tests), and the order to do them.
- Found: v3 shares v2's localStorage save key under file:// (same save list); counters.js is not a drop-in for the game's counters.
- Open for Wan: counters.js (adopt as the one builder, or move to tools/); new v3 save key and whether old saves are imported;
  the ground-items bug (Phase 3) now or in the refactor.
- Next: Phase 5 (split plan), fresh session.

## 2026-10-25 (code review Phase 3: shared state)
- Accomplished: docs/REFACTOR_MAP.md Phase 3: every top-level var of mission1.js in five groups (saved, unsaved game state,
  in-flight flow, view handles, fixed tables) with the sections that read/write it; soldier fields written from 2-6 sections each.
- Found (bugs, by reading, not yet reproduced live): groundItems is neither saved nor cleared on load (items on the map vanish after
  save/reload; leak into a later load or lesson); in-flight vars (pendingContact etc.) not reset on load; counterEls used as
  "German is on the map". `phase` is read in 17 of 28 sections.
- Decisions (mine, for Phase 5): one shared state object holding exactly what the save serializes; chain state stays private to its
  file with a reset(); Resolve/FX/Info move out whole; the closure-to-shared rename is its own parity-proven step.
- Next: Phase 4 (duplication and dead code), fresh session; Wan decides whether bug 12 (ground items) is fixed now or in the refactor.

## 2026-10-25 (code review Phase 2: seams)
- Accomplished: docs/REFACTOR_MAP.md Phase 2: the five seams (engine, presentation pacing, bot, lesson, v3 helpers), what crosses
  each and what a split must keep (one d10, same roll order, both window objects, the DOM ids the bot/lesson/ring read, load order).
- Found: flow runs in continuation style through rollPopup/infoPopup, so the clean cut is by section (combat, German turn, squad gen,
  save/load touch the DOM 0 times), not logic vs view; legality reaches the bot and stack panel through button `disabled`; refusal
  text (explainVerbs, takeWhy) is written apart from the predicates; 38 of 39 *ForTesting hooks unused; Hz/Interp aliases dead.
- Open question for Wan: page-side rules (weapon gates, German target choice) move as they are; promoting them is separate.
- Next: Phase 3 (shared state), fresh session; Phase 0 baseline before any refactor step.

## 2026-10-25 (code review Phase 1: inventory)
- Accomplished: review phases laid out (0 baseline, 1 inventory, 2 seams, 3 shared state, 4 duplication/dead code, 5 split plan,
  6 step order + proof, 7 write-up). Phase 1 written to docs/REFACTOR_MAP.md: every apps/v3 file (role, global, users, load order)
  and mission1.js in 41 sections with line ranges, longest functions, cross-file calls.
- Found: counters.js is loaded but unused by the game; mission1.js header is stale (says no box model); ambushdialogs.js is
  presentation living in apps/game; __mission1Debug is 227 lines in the page. No code changed.
- Decisions (Wan): start at Phase 1; Phase 0 (baseline run) not yet done.
- Next: Phase 2 (seams), fresh session; run Phase 0's baseline before any refactor step.

## 2026-10-25 (token tooltips; engine question; code review set up)
- Accomplished: every equipment token has an instant tooltip (the game's .tt look, left-anchored so the panel's first slot is not cut
  off; Tab reaches them too): weapon in hand/carried with state, ranges and clips; a clip says whether it fits the weapon in hand;
  grenade; empty Port/Ammo Box. Checked live on the Current actor panel, the soldier card and the Squad panel.
- Discussed (Wan asked): an established JS engine (Phaser, PixiJS, boardgame.io, Godot). Set aside: the complexity is the rules and a
  6,000-line mission1.js, not rendering; a port would rebuild the bot seam, live checks and baselines for the same game. Instead: refactor.
- Decisions (Wan): code review first, as a refactor map (structure, seams, duplication, dead code, shared state, split into plain
  <script> files, step order proven by parity); scope apps/v3 presentation only; run it in a fresh session.
- Next: /clear, then the console's Copy prompt (code review -> docs/REFACTOR_MAP.md + artifact). Phase 8d waits for the refactor plan.

## 2026-10-25 (punch item: weapon tokens in the kit)
- Accomplished: the kit now shows the boxed game's weapon tokens (assets/library/weapons/) on the Current actor / Selected soldier
  panel, the soldier card and the Squad panel: Port Box slots (weapon in hand framed amber; jammed/broken shows its _jam token, red; a
  2-box weapon like the BAR spans both; empty boxes dashed), then the 6 Ammo Box tiles (clip with its weapon, grenade, empty). Germans:
  weapon + one tile per grenade. Khaki slots so dark art reads on the dark panel. Text lines stay below for the exact numbers.
- Temp tokens (`tools/make_temp_tokens.py`, list in assets/library/weapons/TEMP_TOKENS.md): scoped Kar98k (+jam), US and German
  grenade, ammo clip. Final names already, so the real art drops in with no code change. Also docs/weapon_icons.csv (Wan's art list).
- Decisions (Wan): use the existing tokens, temp art for the gaps, build now. Mine: slots follow the rules' boxes (2 Port, 6 Ammo).
- Checks: node --check; 17/17 suites; all five live_*.py pass; parity v3 30/30 Normal + 30/30 Easy, all identical to baselines, 0 errors.
- Next: Wan looks at r26 (and r18-r25); final art for the five temp tokens; then Phase 8d (chapter 6), fresh session.

## 2026-10-25 (punch item: contrast and equipment)
- Accomplished: HUD text greys lifted to >= 7:1 on the see-through panel over the map (ink-3/text-label were 4.2:1; ink-2 raised to keep
  three steps), hard-coded dim greys replaced, smallest labels 9-10px -> 11px, panel .93 -> .96. Kit shown everywhere: Selected soldier /
  Current actor (weapon + Ready/Jammed/Broken/Not prepared, clips for it, grenades; zero in red), the soldier card (plus ranges and every
  Ammo Box, spent ones empty; Germans: weapon, ranges, grenades, no ammo per §9/5), and the Squad panel (every soldier's kit and status).
- Fixed: clicking a soldier again stacked a second copy of his card (lineFor appended same-actor lines); an inspection now opens a fresh card.
- Decisions (Wan): whole HUD; kit on the card and in the Squad panel; do it now. Mine: aim 7:1 rather than 4.5 (small capitals read dim).
- Checks: node --check; 17/17 suites; parity on v3 30/30 Normal + 30/30 Easy, every game identical to the 8c baselines, 0 errors; all five
  live_*.py pass; screenshots of the panels, both inspector cards and the Squad panel checked.
- Next: Wan looks at r24-r25; then Phase 8d (chapter 6) from the console's Copy prompt, fresh session.

## 2026-10-25 (Phase 8c: Mission 1 paragraph data fixed)
- Accomplished: all gaps in docs/PARAGRAPH_DATA_GAPS.md closed (new `tools/audit_paragraphs.js`: 107 reachable, 0 missing, 0 bad
  cells, 0 bespoke). 21 programs written, 11 cells fixed (`tools/patch_mission_cards.py`), and contact paragraphs now set Round 1
  (advantage, the PC-checker aware, 2 turns without a roll); 608's clear branch; a contact's Condition change lands before the first German
  turn; hidden-rifleman fire (20, 23). Bug found: soldiers checking by line of sight all rolled on the mover's PC.
- Decisions (Wan): all four groups; errata booklet, else ToolBox text flagged (the booklet on file lacks 181-199, 291-348, 450+, 600+);
  re-record baselines and re-fit chapters; ch 4 gets Event markers on J5/K6 (J5 now always wakes 9 and 15). Mine: 197/606's "indicated hex"
  = the hex the checks were made against; 195 has no bridge at M5, so nothing happens there; seeds found by node search so quoted dice stay.
- Checks: node --check; 17/17 suites; bot on v3 30/30 Normal + 30/30 Easy, 0 errors, reproduced 30/30 (new tools/bot/baselines/v3_*;
  Normal 4->5 wins, Easy 20->22); all five live_*.py pass, 0 console errors. apps/game now differs from v2 by design; v2 page not bot-driven.
- Wan's new punch item (2026-10-25, screenshot): text contrast too low (the selected-soldier card's stats line for Pvt. Ruiz), and each
  soldier's equipment should be easy to see, since not knowing his kit leads to bad decisions. Not started.
  Interviewed (Wan): contrast = whole HUD to WCAG AA 4.5:1, layout unchanged; equipment on the soldier card (weapon ready/jammed,
  each ammo box, carried kit) and in a squad roster panel (all soldiers' weapon, grenades, ammo at once); next session.
  Second screenshot (Wan): dim grey labels on the Current Actor card and the hex/soldier card ("INITIATIVE (IN)", "TERRAIN &
  EXPOSURE", "CARRYING", the stats line); that card also renders its name/stats/terrain block twice (Kowalski at E3), a bug to fix.
- Next: the contrast and equipment punch item (interview first), then Phase 8d (chapter 6) from the console's Copy prompt; Wan plays r18-r23.

## 2026-10-24 (Phase 8b: chapter 5, The Germans and the paragraph book)
- Accomplished: Ch 5 on `roundFour`, seed 51, watch-and-predict: the mission card (entries read from the engine), paragraph 343's
  s-flag lines, Ruiz's walk waking an Officer X (337 [s5]) so O3 is crossed off, each German's card shown in the bubble (column
  marked), S's Special S column and "Zu nah!", the Sniper's 808. The radio log now says when a hex is crossed off by a sighting.
- Found: Mission 1's paragraph data (from v2) has gaps: 18 reachable paragraphs with no program, 11 unparseable cells, 14 contact
  paragraphs' advantage/awareness/2-turn text unmodeled. Listed in `docs/PARAGRAPH_DATA_GAPS.md`.
- Decisions (Wan): 5 and 6 in scope; ch 5 watch-and-predict, all three topics; build around the gaps; ch 6 deferred until the
  data fix (its contact Round is where the gaps bite). Mine: Ruiz's route reaches only programmed paragraphs; runner beats take maxMs.
- Checks: node --check; 17/17 suites; apps/game identical to v2; parity 30/30 Normal + 30/30 Easy (v3), 0 errors; new
  `tools/live_germans.py` all pass; live_lesson / live_chapters (counts updated) / live_map / live_drills pass; 0 console errors.
- Next: Wan plays chapter 5 (console r18-r20); Phase 8c (paragraph data fix) via the console's Copy prompt, then 8d (chapter 6).

## 2026-10-24 (Phase 8a: chapter 4, Drills)
- Accomplished: Ch 4 "Drills" on fixture `roundFour`, seed 41, all four drills done with the player's own clicks: Kowalski walks I5->L6
  (the one hex beside the Sniper in reach, a map puzzle), Ruiz fires aimed (HC 0, miss 8), Baker throws a grenade (HC 4: lands, dud 07,
  damage 8 = I), Kowalski's 2nd turn charge-assaults the Sniper (HC 4: hit 3, damage 3, wounded) after the player's Capture/Kill call.
  Four Hit Chance questions (aimed 2 vs snap 0, the 0 floor, grenade ignores cover, assault 7+1-1-3).
- Decisions (Wan): 8a = chapter 4 only; all four drills; roundFour. Mine: an assault needs a soldier who starts his turn beside the German
  (a half-MP move offers only snap after it), so Kowalski walks on turn 1 and assaults on turn 2; aimed vs snap is a question, since every
  rifle shot here is at the 0 floor. Runner: `row`/`button` steps (target row, dialog button); the ring hides during map puzzles (fixes 7b's item).
- Checks: node --check; 17/17 suites; apps/game identical to v2; parity 30/30 Normal + 30/30 Easy (v3), 0 errors; new `tools/live_drills.py`
  55/55; live_lesson / live_chapters (chapter counts updated) / live_map pass; 0 console errors. Kill branch checked by direct drive only.
- Next: Wan plays chapter 4 (console r15-r17); then Phase 8b (chapters 5-6) via the console's Copy prompt, fresh session.

## 2026-10-24 (punch item: Event Check pacing)
- Accomplished: Event Checks move faster. A Random Event's paragraph shows as one line on the card ("Paragraph 12: If
  any US soldier is carrying a grenade, ...") and the full text is under its radio-log entry. The roll, paragraph and
  Event-marker lines each hold 4 s at most (it was up to 12 s). Wan also asked for strategy (cover/stance table, sight lines, spacing).
- Decisions (Wan): fixes a + b; c (merging roll and result into one card) not done. Mine: `readMs` takes an optional
  cap (`opts.maxReadMs`); "came from an event" = the paragraph plan opens with an `event_roll` (§5/1: a hex gives a paragraph or an event, never both).
- Checks: node --check; 17/17 suites; parity 30/30 Normal + 30/30 Easy on v3 (AMBUSH_PAGE=v3; same VP as v2);
  live_lesson / live_chapters / live_map all pass, 0 console errors; event line checked on all 20 Mission 1 event paragraphs.
  Not driven live: an Event Check at Normal speed (the bot clamps timers). Console review r14 added.
- Next: Wan plays r14; Phase 8 (chapters 4-6) in a fresh session.

## 2026-10-23 (Phase 7b: chapter 3, The map)
- Accomplished: Ch 3 "The map" on new fixture `roundThree` (seed 7001 bot, Round 3, Kowalski's turn at H1; lesson seed 31):
  hex tour (clear/cover/woods/stream: MP and to-hit), five map-click puzzles (2-MP hex beside him, farthest south on 4 MP,
  the hex blocking his line, a hex in reach that sees the Sniper, best cover in reach), then you move him H1->H3 and call
  his snap shot (5 -4 +1 -2 = Hit Chance 0; the board rolls a miss, 7). Sight lines are drawn: green, or red to a ringed block.
- Decisions (Wan): map clicks; new mid-Round capture; draw the sight line; ~5 minutes. Mine: answers and refusals come from
  `AmbushMission.lesson.facts` (movement chart, fire chart, traceLOS), never copied numbers; a game dialog stays hidden
  while a lesson question is open (`body.lesson-asking`); runner gains hex sets/tests, `wrongHex`, `look`, `sight`, `play {hex}`.
- Checks: node --check; 17/17 suites; apps/game identical to v2; parity 30/30 Normal + 30/30 Easy, 0 errors; new
  `tools/live_map.py` all pass; live_lesson.py + live_chapters.py all pass (chapter-count assertions updated); 0 console errors.
- Watch: sight line is thin at Map zoom; ring stays open during map puzzles; reduced-motion not driven.
- Next: Wan plays chapter 3 (console reviews r11-r13); then Phase 8 (chapters 4-6) via the console's Copy prompt, fresh session.

## 2026-10-23 (project console artifact)
- Accomplished: "Ambush v3 Console", https://claude.ai/artifact/8ywCFFA921Xr6TLm45abdr (source `console/index.html`):
  next job for a fresh session with a Copy-prompt button, waiting-on-Wan list, phase board 1-9 with a report per phase
  (built / checks / not checked yet), review queue (Looks right / Needs fixes + note). Seeded from this log.
- Decisions (Wan): next-up + phase board + review queue (no separate punch list); built before 7b; Up Front Console's
  structure, restyled. Mine: phases 3-7a marked "Waiting for you" (built, no recorded sign-off); 10 review items.
- Upkeep: each session reads the console first (Needs-fixes notes come before the phase) and at the end updates the
  phase, adds review items and rewrites meta/next. PROGRESS.md stays the append-only log.
- Next: Wan works through the review queue; then Phase 7b via the console's Copy prompt, in a fresh session.

## 2026-10-23 (punch item: Map-zoom width)
- Accomplished: at the furthest zoom (Map), the map's left and right edges now line up with the edges of the title/menu
  row's box (Wan's screenshot). It was 90% of the window wide; now it is the title row's measured width.
- Decisions: `board.js` `fitWidth` can now be a function; `shell.js` returns the title row's width / board width,
  so the map keeps matching it after a resize. Sector/Squad/Close are unchanged.
- Checks: node --check; live at 1487/1920/1280 wide: the edges match to the pixel, 0 console errors; parity 30/30 Normal
  + 30/30 Easy; live_lesson.py all pass.
- Next: unchanged: Wan plays chapters 1-2, then Phase 7b (chapter 3, the map) in a fresh session.

## 2026-10-23 (Phase 7a: chapters 1 and 2)
- Accomplished: Ch 1 "Watch a fight under way" (fixture `roundFour`, seed 21): Whitaker plays Round 4 through the bot
  seam while the player predicts 4 things (who goes first, which roll hits, who orders the space, which German acts);
  Ch 2 "The soldier and his card": card tour (weapon/stance/status added), roster table, find-the-soldier puzzles
  (WS, PC, commander) with refusals by name, prone/stand in the ring. Runner gains `ask`, `play`, multi/`point` selects.
- Decisions (Wan): Basic Training stays chapter 0; Ch 1 watch + predict; Ch 2 tour + puzzles; split 7a (ch 1-2) / 7b (ch 3,
  all four puzzle kinds: LOS, terrain cost, cover, hex tour). Mine: a wrong prediction is explained, never refused.
- Fixed: `?lesson=` and `?learn=1` raced lessons.js loading (deep link threw; chapter list could be empty).
- Checks: node --check; 17/17 suites; apps/game identical to v2; parity 30/30 Normal + 30/30 Easy, 0 errors;
  `tools/live_chapters.py` all pass (quoted dice 2/3/4/3/9 match), `live_lesson.py` all pass, 0 console errors.
- Watch: the bubble's big counter shows standing on "Down, and stuck" (he is prone). Kranz does not speak for a plain German shot.
- Next: Wan plays chapters 1-2; then Phase 7b (chapter 3, the map) in a fresh session.
- Punch item (Wan: "problem knowing who is the captain"): the commander's counter now wears a gold star (Wan picked badge
  only; panel label, Command Radius tint and greyed-verb pointer offered, not taken). Parity 30/30 + 30/30, 0 errors.
- Punch item (Wan: a stance change needs closure before the next command): in Operations, Stand/Crouch/Prone now stamps
  the stance and what it allows on the counter ("CROUCHING · crawl 1 hex", "PRONE · cannot move"), closes the ring, and
  the move markers fade in 0.65 s later; he stays selected. Rounds' Stance action unchanged. Suites 17/17, parity
  30/30 + 30/30, both live lesson checks pass, 0 errors. Not yet seen by Wan; reduced-motion not driven.
- Task added (Wan): "I like the width of the title row." Change the map margin rule so that at the lowest zoom level
  (Map) the map's left and right edges sit flush with the edges of the top title/menu row's box. Not started.
- Next (Wan, "do that"): fresh session -> Phase 7b, chapter 3 "The map" (LOS checks, terrain costs, cover/fire
  modifiers, hex tour; likely a new mid-Round fixture for terrain costs); short interview first. The map-margin task
  above can go first or alongside, as Wan prefers.

## 2026-10-23 (Phase 6: tutorial Director + Basic Training proof lesson)
- Accomplished: PF's Director ported (`apps/v3/director.js`: camera glide on fixed levels, spotlight + pointer, Whitaker's
  bubble fixed bottom centre, steps that tick, refusals in words, Why?, Back/look-back, debrief); `lesson.js` runner gates
  the player's clicks (counter / hex / ring verb) before mission1.js sees them; Title -> Learn to play -> chapter list
  (ticks per browser); proof lesson **Basic Training** (Kowalski H1->H2->H3 into contact, Kranz cuts in via cues.js).
- Decisions (Wan): Director + proof lesson this phase; bubble fixed bottom centre; chapter list entry; Kranz via 4b cues.
  Mine: v2's engine is not on FW.tutorial's contract, so lessons gate clicks instead; lessons open on a captured save
  (`assets/data/lesson_fixtures.js`, seed 7001 at first Operations) with a seeded d10 (`lessonRng`, null outside lessons).
- Checks: node --check; 17/17 suites; apps/game identical to v2; parity 30/30 Normal + 30/30 Easy, 0 errors;
  `python3 tools/live_lesson.py` 38/38 (wrong soldier / wrong hex / pre-Next clicks refused, dice 295 & 185->316 as quoted,
  Kranz, Back, tick), 0 console errors. Reduced-motion not driven live. Whitaker's 10 portraits cover all poses.
- Next: Wan plays Basic Training to judge the feel; then Phase 7 (chapters 1-3) after its interview, in a fresh session.

## 2026-10-22 (Phase 5: audio, synthesized)
- Accomplished: 15 new synthesized cues in `apps/v3/audio.js` (rifle / pistol / SMG / MG / bazooka shots by
  weapon id, grenade throw, blast, dud, hit, miss whiz, KIA, dice rattle + land, footsteps along the glide,
  stance rustle); music ducks to 60% under shots and blasts; a limiter on master; Settings "Test" plays
  shot, MG burst and blast over the music. Hooks live in v3's FX layer and are silent while results are skipped.
- Decisions (Wan): synth only for now (CC0 files later swap a cue's recipe, not its call sites); scope UI +
  combat + movement (no ambience/music change); duck music under SFX. Variation draws from crypto, never Math.random.
- Checks: node --check; 17/17 suites; parity 30/30 Normal + 30/30 Easy, 0 errors; live drive seed 7001 real
  speed (10-min cap): context running, all 22 cues play without error, 16 rifle, 13 miss, 4 hit, 1 blast,
  2 KIA, 13 glides with steps, 10 rustles, 0 console errors. Not heard by a person yet.
- Watch: dice rattle is ~1 tick/sec over a game (637 ticks); may want it quieter or once per roll.
- Next: Wan listens to judge the mix (and 4b if not yet played); then Phase 6 (tutorial Director port) after its interview, in a fresh session.

## 2026-10-22 (Phase 4b: banners, screen transitions, Kranz cameos)
- Accomplished: one merged banner for Mission / Operations / Contact! / Action Round n / Round complete /
  Condition n / German activated / Mission Accomplished-Failed (cues arriving while it is up join its
  subtitle, e.g. "3 Germans activated"); screens fade + slide, the map fades up from black; Major Kranz
  (face + bubble, docked right of the Selected Soldier panel) voices activation, Condition change,
  Self-Preservation / Special Reaction column, German grenade (the paragraph option's own clause), US KIA, mission end.
- Decisions (Wan): all four banner kinds; Kranz at notable moments only, English with German flavour,
  cite kept; she leaves on the next decision (or another German acting after her reading time). New `apps/v3/cues.js`.
- Checks: node --check; 17/17 suites; apps/game identical to v2; parity 30/30 Normal + 30/30 Easy, 0 errors;
  live drive seed 7001 real speed (hit its 25-min cap at Round 14): 33 banners, 11 Kranz lines, 0 console errors.
  Reduced-motion and the title -> mission-select transition not driven live.
- Watch: Self-Preservation fired Kranz 5 times in 14 Rounds (same Officer adjacent); may want once per German per contact.
- Next: Wan plays to judge 4b; then Phase 5 (audio) after its interview, in a fresh session.

## 2026-10-22 (Phase 4a: board action — walk glide, fire/hit, dice strip)
- Accomplished: counters now glide hex to hex, lifted off the map (they used to jump; the "CSS glide"
  comment was stale); muzzle flash at the shooter; map shake on a hit or blast only; status stamp
  (WOUNDED / KIA / PANIC ...) slams onto the counter; to-hit and damage rolls (fire, grenade, assault)
  carry a 0-9 table strip in the result card that the tumble flickers across and the landed face lights.
- Decisions (Wan): split Phase 4 (4a board action now, 4b transitions/banners/Kranz next); camera
  follows off-screen only (unchanged); Medium hit FX; dice stay in the result card. Reduced motion
  or skip: no glide, shake or stamp animation. Strips are built from the engine's own lookups.
- Checks: node --check; 17/17 suites; apps/game identical to v2; parity 30/30 Normal + 30/30 Easy,
  0 errors; live drive seed 7001 real speed: 12 strips, 10 flashes, 5 shakes, 3 stamps, 24 glides, 0 errors.
  Reduced-motion mode not driven live.
- Next: Wan plays a round to judge 4a's feel; then Phase 4b (title/turn/phase banners, screen
  transitions, Kranz cameos voicing the German reasons) after its interview, in a fresh session.

## 2026-10-22 (Phase 3b: next decision closes the card; inspect checked; Phase 3 gates met)
- Accomplished: the turn now hands on at once; the finished result card stays up to read until the
  next decision closes it (map click, ring verb, pick, panel button, decision dialog; Done/Enter still
  work; menu strip + popups leave it). Pacing 1.59 -> **1.05** presses/decision (v2 1.07; 5 seeds).
- Inspect fixes: Esc on a pinned hex card also opened the pause menu (fixed); right-click on the ring
  (incl. a greyed verb, which gets no mouse events) now inspects the hex under it (pointer events).
- Checks: parity 30/30 Normal + 30/30 Easy, 0 errors; 17/17 suites; apps/game identical to v2; live
  drive 19/19 (card lingers with ring at full opacity, map click closes it; pin/Esc/right-drag at all 4 zooms).
- Decisions (Wan): next decision closes the card (replaces punch list 1's Done gate); inspect verify+fix only.
- Next: Wan plays a round to feel the lingering card; then Phase 4 (animation) in a fresh session.

## 2026-10-22 (Dropbox resolved; Easy parity confirmed)
- Accomplished: 0 placeholder (dataless) files left in v3 and v2; `apps/game` identical to v2;
  Easy parity 30/30, 0 errors, with the active-German fix in (Normal was 30/30 on 2026-10-21).
- Next: Phase 3b (right-click inspect check, pacing re-measure) after its interview, in a fresh session.

## 2026-10-21 (Dropbox placeholders found; active-German take fixed)
- Found: the "empty reads" are Dropbox online-only placeholders (`ls -lO` shows `dataless`): 136 files
  in v3, 154 in v2, incl. `tools/bot/baselines/easy_seeds_7000-7029.jsonl`, sprites and AR markers.
  They read as 0 bytes even unsandboxed. The 5 apps/game "diffs" are placeholders, not edits.
  Wan to mark AMBUSH_V3 + AMBUSH_V2 "Make available offline" in Finder.
- Fixed (Wan: fix the rule): v3's `pickupOffers` no longer offers an active German's weapon (§6/7
  exchange is between friends; §14 German gear only from inactive Germans); the stack panel says why.
  v3 controller only; `apps/game` (v2 parity reference) untouched.
- Checks: node --check; 17/17 suites; Normal parity 30/30, 0 errors; scripted check: active German
  0 offers, downed German + crouching US offers his MP. **Easy parity not run** (baseline is a placeholder).
- Next: once files are local, `find . -flags +dataless | wc -l` = 0, re-diff apps/game vs v2, Easy
  parity 30/30; then Phase 3b (inspect check, pacing re-measure) after its interview.

## 2026-10-21 (Phase 3 punch list 3: Operations, you choose who moves; session wrap)
- Accomplished: Wan's recording (`feedback/feedback1mov.mov`, Operations) showed Mercer pre-selected,
  his ring popping over the result card, and still selected with the walk line live after Done. Now in
  Operations nobody is pre-selected (start, after a Round, after an exit); a move or walk ends on Done,
  with ring, walk line and map clicks held meanwhile (status line says so); after Done nobody is selected,
  you click a soldier (§5/3 "in any order you choose"). Done also blocks stray map clicks in Rounds.
- Bot: board() reports lastSelectedId; the policy round-robins on it (same choices, same dice).
- Checks: parity Normal 30/30, 0 errors; 4-seed spot check matched; real-click re-enactment of the
  recording passes. **Easy NOT confirmed:** the first batch crashed 27/30 at page load (Page.goto
  30 s timeout, likely the Google Fonts request; the 3 that loaded matched); a rerun was still running
  at wrap-up and was stopped (see below). Suites and engine identity not re-confirmed at wrap-up.
- At wrap-up Dropbox's CloudStorage returned intermittent EMPTY reads (sha1 da39a3... on random files,
  both v2 and v3 apps/game, sizes on disk identical): `diff -rq apps/game ../AMBUSH_V2/apps/game`
  reported false differences, and this likely caused the Easy page-load crashes. No engine file was
  edited. Next session: re-diff and rerun suites + both parity batches once reads are stable.
- Open: v2's pickupOffers offers an ACTIVE German's weapon (decision pending); page load depends on
  Google Fonts (consider local fonts so drives can't hang); the item 2 stack panel is otherwise done.
- Next: rerun Easy parity first (`AMBUSH_PAGE=v3 python3 tools/bot/run.py --seeds 30 --seed-base 7000
  --difficulty easy ...`, compare with baselines/easy_seeds_7000-7029.jsonl); then Wan's decision on the
  active-German take; then Phase 3b (inspect check, pacing re-measure) in a fresh session.

## 2026-10-21 (Phase 3 punch list 2: stacked hexes)
- Accomplished: a hex holding 2+ tokens shows a "xN" badge; clicking its counter opens the stack panel
  (`apps/v3/stack.js`): every token with stance, status and gear (clips and grenades named), a button to
  pick him (§6/1) or select him (Operations), and in a Round "Take <item>" for the current actor: v2's
  Pick Up / Exchange code (§6/7), so it uses his turn and waits for Done. Refusals say why (e.g. taking
  from an inactive soldier needs him crouching). Esc / click elsewhere closes it.
- Checks: parity 30/30 Normal + 30/30 Easy, 0 errors; 17/17 suites; apps/game identical to v2; live
  drive: real click opens panel (Ops + Round), Esc closes without the pause menu, a natural Take
  (seed 7000, K13: Lindqvist takes the sniper's scoped rifle) logs and hands the turn on.
- Decisions (Wan): badge + click opens; pick + gear per token; Take only, as v2; Rounds only.
- Found, not fixed: v2's pickupOffers offers an ACTIVE German's weapon to a soldier in his hex
  (only inactive ones are checked); likely a rules bug. Status banner can go stale (v2).
- Next: Wan decides on the active-German take; Exchange in Operations (§5/3) and give/put down are
  later items; then 3b (inspect check, pacing re-measure) in a fresh session.

## 2026-10-21 (Phase 3 punch list 1: Done holds the turn; you choose who goes)
- Accomplished: Wan's report: the next turn started under the Done click and the game chose the soldier.
  Now every turn handover waits for Done on the result card (no ring meanwhile; Enter also works), and
  when US soldiers share an AR track space they glow on the map and are listed in the soldier panel;
  you click one (§6/1 "any order you wish", via the scheduler's existing chooseUS hook; engine untouched).
- Checks: parity 30/30 Normal + 30/30 Easy, 0 errors (bot presses Done and picks v2's default soldier);
  17/17 suites; apps/game identical to v2; real-mouse drive: Done closes its card, clicking a glowing
  non-default counter gives him the turn.
- Decisions (Wan): Done waits even when there is no choice (an ack press, accepted over the brief's
  decision-only rule); choose on map + panel; stacked-hex panel is a separate item.
- Next: punch list 2: clicking a stacked hex opens a panel of every token there, to pick who acts and
  to start Exchange Weapon (§14). Then 3b (inspect check, pacing re-measure: Done adds acks).

## 2026-10-21 (Phase 3a: Mission 1 plays on the v3 stage; awaiting Wan's look)
- Accomplished: v2's controller copied to `apps/v3/mission1.js` and re-pointed at the stage (camera =
  board.js `reveal`, game starts from the mission card); floating HUD (status/VP/AR track top right,
  soldier card bottom left; log, squad, save/load/restart in strip popups); **ring menu** (`ring.js`)
  of v2's own verb buttons around the selected soldier/actor, greyed verbs explain why with a rule cite.
- Checks: parity 30/30 Normal + 30/30 Easy on the v3 page (`AMBUSH_PAGE=v3`), 0 console errors;
  17/17 suites; `apps/game` byte-identical to v2; live drives of title→game, Operations, Action Round.
- Decisions: copy & re-skin (Wan); `ambushdialogs.js` loaded unchanged from apps/game; quit reloads.
- Open: pause menu doesn't pause resolution; ring can overlap a result card; inspect + pacing not re-measured.
- Next: Wan reviews; then Phase 3b (right-click inspect check, pacing ~1.0, punch list) in a fresh session.

## 2026-10-21 (Phase 2 signed off; zoom-out cap)
- Accomplished: Wan signed off the shell. Map, the furthest zoom, is now the map at 90% of the
  window's width (5% margin each side), so the player cannot zoom out past it; the rest of the map
  is a vertical pan away. The mission opens on the map's top edge, below the strip (the squad's
  entry edge). Checked at 1440x900, 1920x1080@2x and 1100x900; shell drive 21/21, 0 errors.
- Decisions: "5% margin" read as 5% on each side, the folder's title-safe convention (Wan's ask).
- Next: Phase 3, Mission 1 on the new stage, in a fresh session.

## 2026-10-21 (Phase 2: scaffold + shell built; awaiting Wan's look)
- Accomplished: Wan signed off the counters (Print colours; wounded now tints the figure only).
  Built `apps/v3/index.html`: title (Whitaker + Kranz, Play / How to play refused with its reason
  / Settings), mission select (Mission 1 with Normal/Easy, Missions 2-8 locked "Not in this release"),
  game stage (map fills the window under a floating menu strip: zoom Map/Sector/Squad/Close, Log,
  Squad, Settings, Menu; mission banner; Esc pause menu), Settings popup (master/music/SFX, game
  speed, reduced motion, hex grid; remembered per browser). New: `board.js` (shared zoom/pan, the
  counter test uses it too), `audio.js` (3 buses, synthesized placeholder cues + music), `settings.js`,
  `shell.js`, `theme.css`. The page loads v2's 19 rules modules + data from `apps/game/`.
- Checks: live drive 21/21, 0 console errors; counter test 0 errors; 17/17 suites; `apps/game`
  byte-identical to v2 (diff), so parity stands at this session's 30/30 + 30/30.
- Decisions: difficulty is chosen on the mission card (Wan); engine stays in `apps/game/` and v3
  loads it from there (one copy, the bot's parity reference); Log and Squad popups are placeholders.
- Next: Wan reviews the shell; then Phase 3, Mission 1 on the new stage (fresh session).

## 2026-10-21 (Phase 1: counter art test built; awaiting Wan's look)
- Accomplished: bot parity run in this folder, 30/30 Normal + 30/30 Easy, every seed matching the
  baselines, 0 console errors. Built `apps/v3/counters.js` + `counters.css` (square Vassal-style
  counter over the original scan; v2's states and badges) and `apps/v3/counter_test.html`: 24
  soldiers x 8 rows (standing, crouching, prone, wounded, out, selected, acting, result badges) on
  Map A, map fills the window, four zoom levels (wheel/1-4/+-), drag pan, Print/Vassal colours, hex
  grid overlay. Live Chromium drive (DPR 1 + 2): 192 counters, 0 broken images, 0 errors; 17/17 suites.
- Decisions: no pixelizing, original scans scaled dynamically (Wan); square counters per the Vassal
  screenshot, which is a reference for the counter's look only; all status follows v2 (Wan).
  Brief decisions 5, 6, 7 and Phase 1 revised. Map stays `map_a_tactical.png` (grid fits it).
- Open for Wan: Print vs Vassal colours; v2's wounded tint turns the whole square orange; prone
  and crouching share one scan (as in v2).
- Next: Wan signs off the counter look; then Phase 2, scaffold + shell.

## 2026-10-21 (brief signed off)
- Wan signed off `docs/00_V3_BRIEF.md`. The folder `CLAUDE.md` now names AMBUSH_V3 as Ambush's
  current version (v2 frozen) and lists its map-first canvas exception alongside PhantomFury's.
- Next: Phase 1, the counter pipeline + art test. Run bot parity in this folder first.

## 2026-10-20 (Gate 0 interview; no code)
- Accomplished: reviewed PhantomFury (four-level zoom, menu strip + popups, Director tutorial,
  ~30 animations, dark HUD) and the WW2 character set; ran a five-round interview; wrote the brief.
- Decisions: new folder on v2's engine, v2 frozen; map fills the window; Mission 1 polished; counters
  = pixelized scans + procedural backing with full stats; Whitaker guides, Kranz voices the
  Germans; fixed zoom levels; ring menu; PF chess-order tutorial; CC0 audio; PF dark HUD.
- Copied from v2 (identical, verified by diff): `apps/` (engine + v2 pages, still the parity
  reference), `assets/`, `source/`, `tools/` (17 suites, bot, baselines), `.claude/skills/run-ambush`,
  `docs/v1_reference/`; v2 docs moved to `docs/v2_reference/`. Whitaker + Kranz art copied to
  `assets/characters/`. In this folder: 17/17 suites green, `verify_assets.py` OK (1 known warning).
  Bot parity not yet run here.
- Next: Wan signs off `docs/00_V3_BRIEF.md`; then Phase 1, the counter pipeline + art test.

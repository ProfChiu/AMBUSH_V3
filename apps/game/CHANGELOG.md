# Changelog — Ambush! Digital v2 (the playable game)

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow SemVer.
v2 numbering starts at 1.0.0. The v1 history (0.1.0 → 0.6.0) is in `../../../AMBUSH/apps/game/CHANGELOG.md`.

## [Unreleased] — 1.0.0-dev

### Changed
- **v3 Phase 8c: Mission 1 paragraph data completed** (2026-10-25, in AMBUSH_V3; v2 itself stays
  frozen). The 21 paragraphs the chains reached with no program are written; the 11 mission-card
  cells that did not parse are corrected (`tools/patch_mission_cards.py`); and the contact
  paragraphs' advantage, automatic awareness and 2 turns are modeled. New ops (`contact`,
  `if_mover`, `hidden_fire`, `receivesTwoTurns`, hex `'indicated'`) are in paragraphinterpreter.js,
  `contactTerms` is in operationsloop.js, and arscheduler.js places a 2-turn entry without a roll.
  Fixed: `pc_check_los` rolled every soldier on the mover's PC. All of it is optional on `ctx`, so
  this page (mission1demo.js) runs unchanged and keeps the old behaviour where it supplies none.
  See `../../docs/PARAGRAPH_DATA_GAPS.md`.
- **Finished cards show Done** (2026-09-25, Wan: the click that closed a card also selected the next
  soldier — the card ignored the mouse, so the click fell through to the map). When the card has
  stopped updating (queue idle 350 ms, so a walk's step-to-step handoff never flashes it) it shows
  a green edge and a Done button and takes the mouse: clicking it or Done closes it and nothing
  underneath. A click elsewhere still closes it and does what it was aimed at. A finished card
  never takes the next action's lines. Parity 30/30 Normal + Easy.
- **Hex information on demand** (2026-09-25, Wan: "I want to control when it comes up"). The hover
  card is gone; right-click a hex to pin its card (cover, shot modifier, move/walk cost, Paragraph
  Check, who can see it, and any German there with hit chances both ways). Right-click the same hex
  or Esc closes it, another hex moves it, any left click closes it; it refreshes as the game moves
  on and closes when a decision opens. Hover still previews the walk route. Fixes the hover card
  that stayed on screen when the game moved on under a still mouse (e.g. the mission starting). A
  right-drag opens nothing (reserved for panning); the choice is made on the button's release
  because macOS fires `contextmenu` on the press. Hold-to-skip now answers the left button only.
- **Target picker reformatted** (2026-09-24, Wan: "this dialog box is formatted badly"). The hit
  breakdown was a focusable tooltip on the odds box; the dialog focused it on open, so it showed at
  once and, inside the scrolling list, grew both scrollbars. It is now a plain line under each
  target, and the odds read as a percentage with the raw chance beneath ("20% · to hit · chance 1").
  Focus lands on Cancel. Prompt says "1 German", not "1 Germans". Also fixed the literal
  "&middot;" in the Current Actor and soldier-card stat lines (textContent with an HTML entity).
  Parity 30/30 Normal and Easy.
- **Resolution cards stay long enough to read** (2026-09-23, Wan's playtest: "the feedback pop up
  moves by really quick"). Each line now stays for its reading time (~250 words a minute, 1.5 s
  minimum, 12 s cap) instead of a flat 0.65 s / 1.6 s; resting the pointer on the card holds play
  (the card shows PAUSED); the last card stays up until the next click instead of fading after
  2.2 s. Holding Space or the mouse on the map still fast-forwards, and now cuts a waiting line short at once.
  Timing only: parity 30/30 Normal, 30/30 Easy, walk 30/30 (7003 re-run after a load-time glitch).
- **Victory targets re-derived** (v2 task 7, 2026-09-20) on 60 games: Normal 8 / Easy 5 unchanged;
  `victoryrules.js`'s justification rewritten with the measured distribution (its old numbers
  described the pre-task-1 RNG stream). Multi-hex walking measured not to change difficulty.
- **Die animation no longer consumes game dice** (v2 task 1, 2026-09-19). `animateDie`'s tumbling
  faces come from `crypto.getRandomValues`; the game roll is one `d10()` drawn before the
  animation starts. Presentation changes (tick count, delays, skipping the animation) are now
  outcome-neutral. Bot baselines re-recorded (Normal 4/30, Easy 20/30) and reproduced 30/30.

### Removed
- **Classic dialogs (v1.1)** (2026-09-21, Wan: no longer needed). The v1 modal step-by-step
  presentation, its "Roll" press for the player's own dice, v1's re-centring map scroll, and the
  bot's `--ui` flag. The build table, chooser and title line stay for future A/B builds; with one
  build the chooser is skipped. Baselines (played in Classic) still reproduce unchanged.

### Added
- **Presentation builds are chosen, not toggled** (2026-09-20): a two-column chooser before the
  mission describes **v1.2 Resolution cards** and **v1.1 Classic dialogs** and gives each its own
  button; the chosen build is named under the title for the whole session, and `Presentation…` in
  the HUD reopens the chooser mid-mission. The top-bar toggle and the decorative note are gone.
  `PRESENTATIONS` in `mission1demo.js` drives chooser, title and versioning, so a future A/B
  variant is one entry. Removed because it caused a real misread: the old button showed the
  *current* mode, so "Classic dialogs" looked like the way into classic while actually leaving it.
- **Multi-hex Operations moves** (v2 task 6, 2026-09-19): cards mode now covers Operations, which
  removes the per-step Move pop-up; click any hex with a wall-aware route and the soldier walks it,
  stopping when something happens; hover previews the route. Presses per real decision 5.29 → 1.08,
  dialogs per game 702 → 40, Move dialogs 558 → 0. Fixed three input bugs found in the live mouse
  pass: the last entry placement's click bubbling into a walk order, the follow camera scrolling
  under a poised cursor, and a walk interrupted by Rounds leaving the map refusing later walks.
- **Bot walking mode** (`tools/bot/run.py --walk`, 2026-09-20): plays Operations with those
  multi-hex walks instead of one step per turn. Not a baseline — it measures whether cheap walking
  shifts the difficulty (it does not).
- **The map as an information surface** (v2 task 5, 2026-09-19; cards mode): hex and German hover
  tooltips (cover, terrain modifier, move cost, Paragraph Check due, German LOS, hit chances both
  ways with real percentages, last reason); reachable hexes shaded by cover with walls, windows
  and doors drawn. Read-only; outcome parity 30/30 in both modes.
- **Fire and movement on the board** (v2 task 4, 2026-09-19; cards mode): tracers, floating dice,
  result badges, grenade blasts, move trails, follow-when-off-screen camera; radio log with German
  "why" expanders and clipped Paragraph cards; resolution card placed clear of the action. Outcome
  parity 30/30 in both modes.
- **Resolution cards for Action Rounds** (v2 task 3 prototype, 2026-09-19): HUD toggle
  Resolution cards / Classic dialogs, speed Slow / Normal / Fast, hold Space (or the mouse on the
  map) to run to the next decision. Roll and info steps become lines on a non-modal card beside
  the actor, in the same queue order as the dialogs; decisions stay modal. `Dialogs` supports
  modeless items; `drawRoll` is the single game draw for both presentations. Outcome parity 30/30
  in both modes; Action Round presses per decision 5.3–8.4 → 1.07–1.19.
- **Automation seam** (v2 task 2, 2026-09-19): `window.__mission1Debug` gains `pendingDecision`,
  `choose`, `press`, `clickHex`, `select`, `board`, `dialogLog`. `tools/bot/` (run, pacing,
  autopsy) now uses only these. Row pickers publish their rows as `spec.choices`; destination
  markers go through one `addDestMark` helper; `AmbushUI.Dialogs` gains `press`, `bodyText`,
  `onPresent`. Batch parity with task-1 baselines 30/30 on both difficulties.
- Forked from v1 **0.6.0** (2026-09-18). Rules modules, data and assets carried over unchanged;
  `mission1.html` / `mission1demo.js` / `ambushdialogs.js` carried over as the running baseline
  that the presentation rewrite replaces. See `docs/00_V2_BRIEF.md`.

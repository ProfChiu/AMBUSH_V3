# 02 — Hand-off (2026-09-18, opening v2)

Operational: how to run, where the seam is, what to do in what order, what will cost an hour if
rediscovered. The narrative is `PROGRESS.md`; the case for v2 is `00_V2_BRIEF.md`; the target is
`01_PRESENTATION_SPEC.md`.

## 1. Run everything

**To play (not test):** double-click `PLAY Ambush v2.command` in the project root — it opens this
folder's `apps/game/mission1.html`, which then asks which build to play.

**Classic dialogs (v1.1) was retired 2026-09-21** (Wan: "no longer needed"). Its modal bodies of
`infoPopup` / `rollPopup`, the manual-roll ("Roll" press) plumbing, v1's re-centring scroll and the
bot's `--ui` flag are gone; every step is a card line. The recorded baselines were played in
Classic and still reproduce 30/30 — the two presentations were proven to draw the same dice in the
same order, so nothing needed re-recording. v1's behaviour remains inspectable in `../AMBUSH/`.

**Presentation builds are a first-class, extensible choice** (Wan, 2026-09-20; one build since
2026-09-21, so the chooser and the *Presentation…* button stay hidden until a second is added). `PRESENTATIONS` in
`mission1demo.js` lists them — today only **v1.2 Resolution cards** (v1.1 Classic dialogs was removed) — and
drives both the two-column chooser shown before the mission and the version line under the title
(`#build-label`), so a screenshot always names its build. Adding an A/B variant is one more entry
there plus its branch in whatever it changes. The chooser is skipped when `?ui=cards|classic` or
`window.__AMBUSH_UI` is set (launcher, bot); `Presentation…` in the HUD reopens it mid-mission.
The old top-bar toggle is gone: it showed the *current* mode, which read as the action, so clicking
"Classic dialogs" appeared to select classic while actually leaving it. That mislabel is what sent
Wan back into v1-style play for a whole session.

```bash
for f in tools/test_*.js; do node "$f" >/dev/null || echo "FAIL: $f"; done   # 17 suites, all green
python3 tools/verify_assets.py                       # OK - 1 warning (German Y/Z fallback art), 0 failures
python3 tools/bot/run.py --seeds 30 --seed-base 7000 --workers 4 --jsonl /tmp/after.jsonl
python3 tools/bot/pacing.py --seeds 6 --seed-base 7000 --workers 3
python3 tools/bot/autopsy.py --seeds 7002             # why a game froze
python3 .claude/skills/run-ambush/driver.py apps/game/mission1.html --screenshot /tmp/m1.png
```

State after task 1 (2026-09-19): 17/17 suites, asset check clean, live drive zero console
errors, baselines re-recorded (Normal 4/30 wins, Easy 20/30) and reproduced 30/30 on every game
field by a second run — see `tools/bot/baselines/README.md`. Diff game fields, not `steps`.

State after task 2 (2026-09-19): the bot, `pacing.py` and `autopsy.py` drive the page only through
`window.__mission1Debug` (table in `tools/bot/README.md`); the batch on the API reproduces the task-1
baselines 30/30 on both difficulties. **Keep that API answering when the DOM changes** — it is the
seam that lets tasks 3–6 prove bot parity.

**Pacing baseline, re-measured (v1 presentation, seeds 7000–7005, `pacing.py` on `dialogLog()`):**
702 dialogs per game (median), 16.1 acks per dialog choice (15.2 inside Action Rounds). The "2.4"
in `00_V2_BRIEF.md` / `CLAUDE.md` came from the old DOM observer, which merged every queued chain
of dialogs into one: on seed 7003 it saw 133 dialogs where 560 were presented (same 36 choices).
Counting the bot's board actions as decisions too (149 on seed 7003) gives 2.8 acks per decision.
Compare task-3 numbers against these, not against 2.4.

State after task 3 build (2026-09-19): **resolution cards** for Action Rounds, behind the HUD toggle
("Resolution cards" / "Classic dialogs", remembered per browser; default cards). In card mode
`infoPopup`/`rollPopup` push *modeless* items into the same `Dialogs` FIFO — shown as lines on a
card beside the actor, no backdrop, no press — so event order and every seeded roll are exactly
classic's. Decisions stay modal. Slow / Normal / Fast; hold Space or hold the mouse on the map to
run to the next decision. The bot takes `--ui classic|cards` (default classic, the baselines' mode).
Parity: 30/30 both difficulties in **both** modes. Presses per decision (`pacing.py`, seeds
7000–7005): Action Rounds 5.3–8.4 → **1.07–1.19**; whole game 5.29 → 1.57 (Operations is still v1
until tasks 4/6). The remaining Round acks are "Start Next Round", one per Round.

State after task 4 build (2026-09-19; cards mode only, Classic stays v1 — Wan): `FX` in
`mission1demo.js` draws tracers (fire, grenade arc, assault lunge) that take their verdict when the
roll lands, floating dice at the target, result badges (MISS, JAMMED, WOUNDED, KIA, PANIC, BOOM,
DUD, stance...), grenade blasts, move trails for both sides, and a camera that scrolls only when
the action is off-screen. Hooks are `fx` / `fxLanded` options on `infoPopup` / `rollPopup`, run
only by the card line — decoration never gates the queue or reads a die. Radio log: a German's
paragraph is one line with a **why** expander (text + the option that applied); a US Paragraph
Check is a clipped card, click to expand; in cards mode the log keeps 230 px (v1 let the Action
Round buttons squeeze it to nothing). The card now sits clear of actor, target and aimed-at hex.

State after task 5 build (2026-09-19; cards mode, Operations and Rounds): `Info` in
`mission1demo.js`. Hover a hex: terrain and cover class, the fire-chart terrain modifier for a
soldier in the viewer's stance there, move cost (Rounds MP / Operations one-step), whether entering
makes a Paragraph Check (Event marker suppresses it), which Germans on the map can see it. Hover a
German: your aimed/snap Hit Chance on him and his on you, with the real probability ((c+1)×10%),
stance, weapon, last paragraph and option. On your decision: reachable hexes shaded red/amber/green
by cover row; walls, windows, doors, crests drawn on the hexsides in play (geometry checked against
true corners on all 1,338 neighbour pairs, worst 0.7 map px). Read-only by construction — the same
pure functions the rules use; nothing rolls or mutates. **Deliberately not shown: what a hex's
Paragraph Check would find** (the paper player cannot know where Germans hide until he walks in).

State after task 6 build (2026-09-19): **cards mode now covers Operations as well as Rounds** —
that is what removes the Move pop-up. Click any hex with a wall-aware route and the soldier walks
it hex by hex, each step the ordinary §5/3 move with its own Paragraph Check, stopping the moment
anything happens (a paragraph with an effect, an event, an activation, Rounds commencing, the way
blocked, another soldier selected). `operationsRoute` is the search the bot's
`operationsNextStepForTesting` already used, now returning the whole path; hovering previews the
route and its length. **Measured (seeds 7000–7005): presses per real decision 5.29 → 1.08**
(Action Rounds 1.07–1.17), dialogs per game 702 → 40, **Move dialogs 558 → 0**, and every dialog
left is a real choice (target, Capture or Kill, Combo Action, stance, start screen). Parity 30/30
in both modes, both difficulties.

**Two bugs the live mouse pass caught that API parity could not** (this is why the three-way
verification rule exists): (1) the last entry placement switches the phase inside its own click,
and that click then bubbled to the new walk handler and marched the soldier across the map — only
a click on bare map is a walk order now, and the entry markers stop their own clicks; (2) bringing
the acting soldier into view on every refresh smooth-scrolled the map out from under a poised
cursor, so clicks landed on the wrong hex — it now scrolls only when the actor changes, instantly.
A third, found while giving the bot a walking mode for task 7: a walk interrupted by Rounds
commencing left `walking` set for ever, and every later walk order was silently refused — the map
would have stopped responding to walk clicks for the rest of the mission.

State after task 7 (2026-09-20): **Normal 8 / Easy 5 stand, re-derived on 60 games** (seeds
7000-7029 + fresh 7030-7059, both recorded in `tools/bot/baselines/`). Normal: max observed 10,
scores step 6 → 8 → 10 with nothing at 7 or 9, casualties split the field at four, win rate 25% at
a target of 6, 15% at 8, 10% at 9. Five activations (+6) still cannot reach 8 without Ending 1's
+4, which is the reason the number exists. Easy: 66% at 5, 65% at 6, 26% at 7, with 24 of 60 games
landing on exactly 6. The full reasoning is in `victoryrules.js`'s `scaleRequirement` header, which
was rewritten because its old numbers described the pre-task-1 RNG stream. **Task 6 did not change
the difficulty**: replayed with multi-hex walking (`run.py --walk`), Normal is 4/30 either way and
Easy 18/30 against 20/30 — walking costs fewer presses, not fewer Actions (§5/3 is unchanged).

State after task 8 (2026-09-20): **brief only, nothing built** — `docs/03_CAMPAIGN_BRIEF.md`. It
reads §16 in full (CP awards, spending with the Initiative table, replacements, recovery), inventories
what the engine already has, and prices three versions. The finding that shapes it: all eight
missions have card/briefing/victory data compiled, but **missions 2-5 are on Map B, which has no
terrain or LOS database** (Map A's equivalent took a pipeline run plus a hand-correction pass);
missions 6-8 are on Map A and are blocked only on their own scenario rules (and probably §17
vehicles). Recommendation in the brief: squad persistence on Mission 1 first, and only then more
missions — the presentation is still unplayed.

## 2. The seam

**Rules (DOM-free, unchanged, loaded in this order by `mission1.html`):**
`hexgrid movementrules losrules checksrules arrules arscheduler firecombat` →
`assets/data/grenade_scatter.js` → `grenaderules assaultrules crewweaponrules hazardrules
penetrationrules equipmentrules squadgenrules victoryrules difficulty germanactions
paragraphinterpreter operationsloop`. Each exports one `window.X`; tests load them with
`global.window = {}` + `require`. `grenaderules.js` captures `AMBUSH_GRENADE_SCATTER` at top
level, so that data file must precede it; every other data file loads after the rules.

**Data (13 JS globals):** `AMBUSH_TERRAIN_A, AMBUSH_LOS_A, AMBUSH_AR_TRACK, AMBUSH_WEAPON_CHART,
AMBUSH_SQUAD_GEN, AMBUSH_GERMAN_ROSTER, AMBUSH_MISSIONS, AMBUSH_PARAGRAPHS, AMBUSH_MISSION_CARDS,
AMBUSH_MISSION_CARDS_MOVEMENT, AMBUSH_PARAGRAPH_PROGRAMS, AMBUSH_GERMAN_ACTION_PROGRAMS,
AMBUSH_GRENADE_SCATTER`.

**Presentation (to be replaced):** `ambushdialogs.js` (374 lines, `window.AmbushUI.Dialogs`)
and `mission1demo.js` (4,546 lines: the whole flow — squad generation, entry placement,
Operations, activation, Action Rounds, fire/grenade/assault chains, German resolution, save/load,
voice, `window.__mission1Debug`). The `d10()` in `mission1demo.js` is the **only**
`Math.random` in the game path; the bot seeds it via `add_init_script`.

Much of `mission1demo.js` is *orchestration* (which rule to call next, what state to carry),
not presentation. Expect to keep that orchestration and swap the rendering calls; do not assume
the whole file goes.

## 3. Task table (in order; each is one session-sized item, with a check-in between)

| # | Task | Why first | Done when |
|---|---|---|---|
| 1 | ✅ *Done 2026-09-19.* **Decouple `animateDie` from the seeded RNG.** Tumbling faces use a separate, unseeded source; the game roll is one `d10()` draw. Then re-record `tools/bot/baselines/` (both difficulties) once. | Every presentation change after this is provably outcome-neutral. | New baselines recorded; a second run reproduces them 30/30. |
| 2 | ✅ *Done 2026-09-19.* **Bot contract.** Add a `window.__mission1Debug` action API (`pendingDecision()`, `choose(i)`, `press(id)`, `clickHex(id)`, `board()`), switch `tools/bot/game.py` and `pacing.py` to it. | The rewrite can change any DOM without breaking the proof tools. | Bot batch on the API reproduces the task-1 baselines. |
| 3 | ✅ *Done 2026-09-19 (Wan: "this works well").* **Prototype one Action Round** in the resolution-card style (§3 of the spec): one card per action, sub-rolls in sequence, batched Initiative, speed control. Keep everything else v1. | Proves the feel before committing; `pacing.py` gives the number. | Wan plays it; presses per decision measured. |
| 4 | 🔶 *Built 2026-09-19; awaiting Wan's look. Wan played 4–6 on 2026-09-23: punch list in §3c.* **Fire and movement on the board**: tracers, floating dice, badges, German moves animated, radio log with Paragraph cards. | Recommendation 2. | Live drive zero errors; bot parity. |
| 5 | 🔶 *Built 2026-09-19; Wan reviews with task 4. Wan played 4–6 on 2026-09-23: punch list in §3c.* **Hover information layer**: hex cost/cover/LOS, German hit %, reachable-hex shading. | Recommendation 3. | Same. |
| 6 | 🔶 *Built 2026-09-19; Wan reviews with 4 and 5. Wan played 4–6 on 2026-09-23: punch list in §3c.* **Multi-hex Operations moves** on the engine's wall-aware route; stop only on events. | Recommendation 4; kills the `Move` popup. | `Move` dialogs → 0; bot parity. |
| 7 | ✅ *Done 2026-09-20 — targets unchanged; justification re-derived on 60 games.* **Re-derive victory targets** (Normal 8 / Easy 5) with a 30-seed batch on the new presentation; keep `victoryrules.js`'s justification text honest. | The bot's play may shift once walking is cheap. | Numbers and reasoning in the changelog. |
| 8 | 📄 *Brief written 2026-09-20 (`docs/03_CAMPAIGN_BRIEF.md`); build waits on Wan's answers.* **Campaign layer** (rulebook campaign rules: persistence, recovery, experience). | Recommendation 5. | Its own brief first. |

## 3b. Proposed, not built: map zoom and right-drag pan (feasibility study, 2026-09-22)

Wan asked whether the player could zoom and scroll the map with a right-button drag. A spike
injected into a test browser (no product change; script in the session scratchpad, rebuilt easily
from the notes below) says **yes, cheaply**:

- Everything on the map — counters, destination marks, entry hexes, info shading, tracers, badges,
  resolution cards — is positioned in percentages inside `#map-canvas`, so widening the canvas
  scales it all. Measured at 1x and 2x: every counter within **0.02 px** of its hex centre.
- Zoom anchored at the cursor (keep the map point under the pointer fixed) drifted **0.2 px**.
- Hover tooltips and a real left-click on a destination marker hit the right hex at 2x.
- Right-drag moved the view (300, 200) px and changed nothing in the game; no dialog, no walk.
- The scan is 5336 px wide against ~1250 px displayed, so it stays sharp to roughly 4x.

What a build would need (estimate: one session, outcome-neutral, no rules touched):
1. Right-drag pan on `#map-viewport` (suppress the context menu there only); overflow-x on when
   zoomed. Trackpad two-finger scroll then pans both axes for free.
2. Zoom by Ctrl/Cmd + wheel and trackpad pinch (both arrive as `wheel` with `ctrlKey`; must
   `preventDefault` so the browser does not zoom the whole page), anchored at the cursor; small
   `+ / − / Fit` control in a map corner (not the top bar); keys `+`, `−`, `0`. Range 1x–3x.
3. **Fix before shipping**: hold-mouse-to-skip listens to every button, so a right-drag during a
   card would fast-forward it — restrict to the left button.
4. **Fix before shipping**: the follow camera (`FX.ensureVisible`) is vertical-only; at zoom it
   must bring off-screen action into view horizontally too.
5. Judgment to confirm with Wan: the folder rule "scale the stage, never the scan" was written for
   kit projects and is about aspect ratio; zoom preserves the scan's aspect exactly.

## 3c. Playtest punch list (Wan, 2026-09-23), one item at a time

| # | Feedback | Decision (Wan) | State |
|---|---|---|---|
| 1 | Result cards vanish before they can be read | Reading-time pacing, pointer on the card holds, last card stays until next click | ✅ 2026-09-23 |
| 3 | Target dialog badly formatted (breakdown tooltip overflowing into scrollbars) | Breakdown as a plain line, odds as %, no focusable tooltip | ✅ 2026-09-24 |
| 2 | Hex info on hover is unwanted; inspect on demand (also: the hover card stuck on screen at mission start) | Right-click a hex pins its card; Esc / right-click closes | ✅ 2026-09-25. Right-click = inspect, right-drag = pan (Wan) |
| 5 | Zoom with the mouse wheel (Wan, 2026-09-25) | **Plain wheel zooms** (at the cursor), **right-drag pans**; see §3b for the two required fixes (hold-to-skip already left-button only) | Next |
| 1b | Click closing a finished card also selected the next soldier (fell through to the map) | Done button on a finished card; the card takes the click | ✅ 2026-09-25 |
| 6 | Easy mode: assault target picker shows odds without the +1 the roll gets | (found by Claude, not yet decided) | Open |
| 4 | Action buttons too far from the soldier | Ring menu of verbs around the selected soldier; greyed verbs explain on hover | Waiting |

## 4. Traps

- ~~**`animateDie` consumes RNG**~~ — fixed by task 1 (2026-09-19): tumbling faces use
  `crypto.getRandomValues`; the seeded stream is game rolls only. Baselines re-recorded.
- **Playwright's own `.click()` stalls** on this dialog-heavy page (actionability wait). The bot
  uses native `element.click()` via `page.evaluate`. Keep doing that.
- **`verify_assets.py` reports `.DS_Store` as an orphan** when Finder has touched the folder. Not
  a failure of anything; `rm .DS_Store` clears it.
- **`asset_index.json` is documented as the only asset lookup**, but `mission1demo.js:35`
  composes counter paths by hand from `../../assets/library/`. Either is fine for the rewrite;
  do not "fix" one to match the other without checking the 218 art hashes still verify.
- **The rejected direction** (v1 `docs/archive/09_UI_RESTRUCTURE_SPEC.md`: an index page plus
  paged briefing dialogs) was built and reverted the same day in the trainer. v2's on-board
  presentation is not that, but a fresh session may drift toward "more, prettier dialogs". Don't.
- **Data regeneration lives in v1.** The compilers read `../AMBUSH/reference/*.xlsm` and the card
  photos; run them there and copy `assets/data/` here. Re-running the paragraph compiler destroys
  the hand-added §613 placeholder (v1 `docs/32_HANDOFF.md`, Task 74a note).
- **`Ambush_Cards_Alternative_Set_Up_version_1.pdf` is a variant deck.** Photographs are authority
  (v1 `docs/54`).
- **Wrong-project input.** This folder and `../AMBUSH/` look alike. A screenshot of the trainer or
  of a v1 sandbox page belongs to v1; ask before diagnosing.

## 5. Open engine items (unchanged, low priority for v2)

- 19 German cards (GE 62–66, 72, 73, 82–93) exist on no photographed sheet; ~23 suspect
  transcriptions await one-at-a-time adjudication. Zero Mission 1 impact. Needs a photo, not code.
- Movement Reference *Paragraphs* (4 of Mission 1 Condition 4's 45 references) show a "Not
  Modelled" card and hold position. Small DSL needed if ever.
- `victoryrules.js`'s target of 8 was re-derived after the buildings (bimodal distribution);
  task 7 re-derives it again after the rewrite.

# 00 — v2 Brief: why the rewrite, and what it is for

Written 2026-09-18 at the version gate. The founding document for v2. Decisions here were taken
with Wan in that session and are not re-litigated; the open questions at the end are.

## 1. The verdict

Wan played Mission 1 and reported: *functionally close to complete, but not fun; too far from a
modern implementation of a single-player hex wargame.*

## 2. The evidence

One seeded bot game (seed 7003, Normal, 7 Rounds, won with 8 VP) recorded every dialog it opened:

| Dialog | Count |
|---|---|
| **All dialogs** | **815** |
| Initiative Roll | 108 |
| Move | 113 |
| Jam Check | 41 |
| Hit Chance & To-Hit | 39 |
| Stance | 34 |
| Ammo Check | 28 |
| Dud Check | 27 |
| Grenade Throw / Scatter | 43 |

What that means at the table:

- **One aimed shot costs five presses.** Select Target → Fire → Jam Check → Hit Chance → Ammo
  Check, each its own modal. By the third firefight the chain is friction, not rhythm.
- **Every Round opens with a wall of Initiative popups**, one per soldier and German, about ten
  in a row, almost all of them showing a roll that changes nothing the player can act on.
- **The map is never where the game happens.** Nearly every event blacks out the board behind a
  modal. A German firing at you is a card with two portraits, not a tracer onto your hex.
- **Operations is one popup per hex.** Click hex, dismiss `Move`, dismiss the Paragraph Check,
  repeat. `Move` is the most frequent dialog in the game.
- **The optimal strategy is not a fun one.** The bot's own notes: almost every VP is an
  Activation award banked the moment a German is revealed, and reveals come from Paragraph
  Checks on entering hexes, so *walk widely and survive* beats *fight*. Players feel this.
- The 2026-08-04 "chess-like popup per step" default fixed the earlier problem (moves rushing
  past in an instant log) and overshot into *acknowledge everything*. v1 `docs/52_PACING.md`
  measured 2.4 acknowledgements per real decision in Action Rounds.

## 3. What is not wrong

- The **rules engine**: 19 DOM-free modules, every action citing its rule, 17 suites, a seeded
  bot with 30 recorded baselines, buildings, crew weapons, the full German decision transparency.
- The **data**: paragraphs, mission cards, German roster, terrain and LOS for Map A, all compiled
  from source with provenance and a 172-check verifier (in v1).
- The **art**: original map and cards, remastered counters.
- The split is clean: no test touches `mission1demo.js`; the bot drives the page from outside.

## 4. Recommendations, in priority order

1. **One resolution card per action; presses only for decisions.** A shot is one card in which
   Jam, To-Hit, Ammo animate in sequence. Failures highlight; successes scroll by. Initiative is
   one table with all dice rolling at once. Auto-advance with a speed setting and hold-to-skip.
   Cheapest change, biggest effect. Target: presses per real decision ≈ 1.0 (from 2.4).
2. **Resolve on the board, not over it.** Fire draws a line from shooter to target; die faces
   float at the target hex; the result lands as a badge on the counter. German moves animate hex
   to hex. Paragraph text goes to a side "radio" panel, not a blocking modal. Popups remain for
   choices only: target, stance, assault, equipment.
3. **Make the map an information surface.** Hover a hex in Operations: movement cost, cover row,
   which known Germans can see it. Hover a German: hit chance from the selected soldier.
   Selected soldier: reachable hexes shaded by cover. This is what removes "losing feels arbitrary".
4. **Multi-hex Operations moves.** Click a destination; the soldier walks the route; the game
   stops only when a Paragraph Check produces something. No `Move` popup on quiet hexes.
5. **Later: the campaign layer.** Named soldiers who survive, heal and gain experience across
   missions is Ambush!'s real replay hook and is unbuilt. Not before 1–4.

Two constraints on all of it: **every roll stays visible** (the player can see each die and its
table lookup — what changes is that no press is needed to see it), and **the engine stays
byte-identical** so the bot can prove outcomes did not change.

## 5. Decisions taken at the gate (2026-09-18)

| Question | Decision |
|---|---|
| Where does v2 live | Sibling folder `AMBUSH_V2/`; `AMBUSH/` frozen at 0.6.0 |
| Source material (630 MB) | Referenced in v1 by path; only `source/converted/` copied |
| UI base | Ambush's own code; presentation rewrite only; not the `_FRAMEWORK` kit |
| v1 docs | Engine specs copied read-only to `docs/v1_reference/`; UX-era docs left behind |

## 6. Open questions for Gate 0 (interview Wan before building)

1. **German reasoning on screen:** always shown (v1 behaviour, "show the machinery") or one line
   plus a "why" expander on the German's card?
2. **Paragraph text:** side panel that accumulates like a radio log, or a brief non-blocking card
   that the player can pin?
3. **Auto-advance default speed**, and whether "hold to skip" or "click anywhere to skip".
4. **Victory targets:** re-derive Normal 8 / Easy 5 after the rewrite (the bot's play style may
   change once Operations moves are cheap), or keep until a human playtest?
5. **Sandboxes:** keep `hexinspector` / `lossandbox` / `movementsandbox` as shipped dev pages, or
   fold their hover information into the game and drop them?
6. **Scope of Mission 1 only** vs. the campaign layer's prerequisites (soldier persistence,
   between-mission recovery) being designed into the state model now.

### Gate 0 answers (Wan, 2026-09-19)

1. **German reasoning:** one radio-log line per German action, full reasoning behind a "why"
   expander.
2. **Paragraph text:** a card in the radio log; a popup only when the paragraph asks for a choice.
3. **Speed:** slow / normal / fast in the HUD, default normal; hold Space (or click-and-hold) skips
   to the next decision. No click-anywhere skip.
4. **Victory targets:** keep Normal 8 / Easy 5 until task 6 lands; re-derive from a 30-seed batch in
   task 7.
5. **Sandboxes:** keep as unlisted dev pages; the hover layer (task 5) reuses their logic.
6. **Scope:** Mission 1 only; the campaign layer gets its own brief (task 8).
7. **Pacing metric** (new): **presses per real decision**, where presses are every dialog press
   plus every board action, and decisions are dialog choices plus board actions. v1 measures
   **5.3** (median of seeds 7000–7005; each of the player's own rolls is two presses, Roll then
   Continue); target ≈ 1.0, i.e. no acknowledgement presses. The "2.4" above was the old
   observer's undercount (see `02_HANDOFF.md`, state after task 2).
8. **Task 3 prototype lives behind a HUD toggle** in `mission1.html` ("Classic dialogs" /
   "Resolution cards"), so the same Round can be A/B'd; bot parity is checked in both modes.

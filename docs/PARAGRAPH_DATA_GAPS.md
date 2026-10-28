# Mission 1 paragraph data: gaps found 2026-10-24 (Phase 8b)

## Status: closed in Phase 8c (2026-10-25)

`node tools/audit_paragraphs.js` re-measures everything below and exits 1 on any gap. After the
fix: 107 reachable paragraphs, 0 missing programs, 0 unparseable cells, 0 `bespoke` ops.

- **§1:** all 18 written, plus 180, 319 and 327, which only became reachable once 288, 291 and
  332 had programs. 7, 10, 13, 293, 314 and 342 are told, with nothing to resolve. 20 and 23 are
  a hidden rifleman's fire (`hidden_fire`). 197 and 606 activate "in indicated hex", read as the
  hex the PC checks were made against (341: R-2; 450: M-10).
- **§2:** the 11 cells were corrected by `tools/patch_mission_cards.py`. Each was cross-checked
  against the same hex under a neighbouring Condition, and each fix is recorded under
  `corrections_applied` in the data.
- **§3:** a `contact` op carries the advantage, `checkerAware` ("the US soldier who just made his
  PC check is automatically aware") and `awareUsTwoTurns`. `receivesTwoTurns` on
  `activate_german` covers "German N receives 2 turns". Round 1 still rolls the initiative dice
  (§6/1); the paragraph decides the side. 2-turn soldiers skip their AR roll, and a wounded one
  gets one turn. Mid-Round activations ignore advantage and awareness (§6/6).
- **§4:** 608 item 2 is an `if_mover` in_clear branch. A contact's "Go to Condition N" now applies
  once Round 1's markers are placed (§6/11), so the first German turn reads the new column. The
  ¶316 lesson wording is re-checked (see PROGRESS).
- **Found while fixing:** `pc_check_los` rolled every soldier in sight on the *mover's* PC, and
  the page passed bare ids, so the log never named who succeeded. Each soldier now rolls on his
  own PC (§5/1).
- **195** (on or under the bridge) is an `if_mover` too. Its only cell is M5 (Conditions 3–4),
  where the map has no bridge, so neither branch applies there and nothing happens.

### Text not yet checked against the errata booklet

`source/converted/Ambush_Paragraph_Booklet_Pages_with_Errata_v1.md` holds only paragraphs 0–36,
133–180 and 251–290. Programs for 181–199, 291–348, 450–456 and 600–615 rest on the ToolBox text
(`assets/data/paragraphs.js`). Of the reachable paragraphs the booklet does hold, three differ:
11 (wording only), 28 ("hex 012" is an OCR slip for O-12), and 180, whose booklet line stops at a
page break before "...receive 2 turns this Round. Go to Condition 3." Re-run the audit once the
missing booklet pages are on file.

## Original findings (2026-10-24)

Found while building tutorial chapters 5-6. All of it is inherited from v2's data, copied unchanged
(`assets/data/paragraph_programs.js`, `assets/data/mission_cards.js`). Wan's call (2026-10-24):
build around it, fix it in its own session, then build chapter 6 on the corrected data.

How it was measured: every paragraph reachable from a Mission 1 mission-card cell (all four
Conditions) by following `goto` ops, checked for a program; every cell checked with the engine's
own `AmbushOperations.parseCellValue`.

## 1. Reachable paragraphs with no program (18 of 104)

The chain stops at them silently: nothing is logged, nothing happens. `missing <- reached from`:

`7<-329  10<-28  13<-30  20<-184  23<-325  188<-318  194<-603  197<-450  288<-299  291<-182
293<-600  310<-179  313<-182  314<-292  332<-318  338<-455  342<-604  606<-450`

Example: J5 (Condition 3, `S1-179`). 179 is an Activation Check; success -> 288, failure -> 310.
288 and 310 are PC checks whose both outcomes activate Germans 9 and 15 at K13 ([s1], ¶289 or
¶324). The game reads 179 and stops, so a walk through J5 never wakes them. Chapter 4's walk
(I5 -> J5 -> K6 -> L6) crosses J5 and K6 (`S1-299`, whose 0-3 branch reaches 288).

## 2. Mission-card cells that do not parse (11)

`parseCellValue` wants `s<N>-<para>`; these have the dash missing or misplaced, so they read as
`unknown` and the hex is silent: `S1190` x4, `S1179` x2, `S1186`, `S1299`, `S1195`, `-186`, `NONE-`.
Under Condition 3 that covers I5, I6, J6, H6, K5, L5, M5 (among others).

## 3. Contact paragraphs whose advantage / awareness / 2-turn text is not modeled (14)

`183 187 289 294 297 298 312 316 324 331 333 334 337 602`: each carries a `bespoke` note. The
paragraph's "US/German advantage", "the soldier who just made his PC check is automatically aware"
and "receives 2 turns this Round" are replaced by the ordinary rolls. Seen live (opsStart):
¶312 "US advantage" -> initiative rolled German (seeds 62, 68); seed 69: Ruiz made the PC check
and was placed unaware. This is what stopped chapter 6 (opsStart into contact, through Round 1).

## 4. Smaller notes

- 608 line 2 ("see 290 if in clear; 326 otherwise") is a `bespoke` no-op; line 1 fits whenever
  s2 and s6 have both happened, so chapter 5 never reaches it.
- Round 1 after contact: the first German turn logs "via Condition 2 column" although the contact
  paragraph says "Go to Condition 3" (the change is applied after the activation finishes). Same
  card column (CONDITION 2-3), so no wrong result; only the log note.
- Basic Training's words for ¶316 say "US advantage" and that the soldier becomes aware; ¶316 also
  activates German 34 at M5. Re-check those words against the board after the fix.

## Fixing it changes the game

Bot parity is recorded against v2 (`tools/bot/baselines/`). Any fix that draws a different number
of `d10()` rolls or wakes a German where none woke before invalidates the baselines: re-record,
then re-check every chapter's quoted dice (live_lesson, live_chapters, live_map, live_drills,
live_germans).

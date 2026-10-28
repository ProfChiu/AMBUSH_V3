# 18 — Phase 6 sizing spike: data layer + paragraph interpreter

**Date:** 2026-08-01
**Purpose:** `docs/11_GAME_BUILD_PHASES.md`'s standing risk section requires this before committing to
a Phase 6 estimate — parse Mission 1's reachable paragraph set, hand-annotate a sample, size the
interpreter honestly. This is a spike: it produces findings and open questions, not shipped code.
Nothing here is wired into the app.

---

## 1. File formats — good news, more tractable than they look

All seven `.TAB` files (`assets/data/*.TAB`) are old (dated Dec 2000) delimited-text exports, **not**
opaque binary, even though `file` reports `AMBSOLDIERCARDRECORDS.TAB` and `AMBTABLERECORDS.TAB` as
"data" — that's `file`'s heuristic getting confused by embedded ASCII control characters, not a real
binary format. Every file uses the same convention:

- Records separated by `\r` (CR only — classic pre-OS X Mac line ending, consistent with the 2000 file
  date).
- Fields within a record separated by `\t`.
- Two extra separators appear *inside* fields for structured sub-content: `\x0b` (vertical tab) breaks
  a paragraph's text into its constituent sentences/clauses; `\x1d` (group separator) breaks a
  soldier-card or table-record field into repeating sub-items (e.g. a soldier's per-condition equipment
  list).
- **Encoding is Mac OS Roman**, not plain ASCII — `AMBMISSIONS.TAB`, `AMBPARAGRAPHS.TAB`, and
  `AMBSOLDIERCARDS.TAB` all contain high-bit characters (e.g. "Fallschirmjäger") that `tr`/plain-ASCII
  tools choke on. Decoding with `mac_roman` fixed every case tried.

Confirmed record counts: `AMBPARAGRAPHS.TAB` — **827** (matches the count already cited in
`docs/11_GAME_BUILD_PHASES.md`), 2 duplicate paragraph numbers (not yet investigated — flag for the
real parser). `AMBMISSIONS.TAB` — 45 mission briefings, spanning the base game **and every published
expansion** (Battle Hymn, Fallschirmjäger, Leatherneck, Move Out!, Purple Heart, Silver Star, and one
apparent fan/community entry "WayneC.Close") — confirms the locked scope (Mission 1 only) is a small
slice of what this data actually covers, which is good: no temptation to over-build.

**Conclusion: writing straightforward `TAB → JSON` parsers for all seven files is low-risk, mechanical
work.** That part of Phase 6 doesn't need its own spike.

---

## 2. Mission 1 confirmed, and it lines up with what's already built

`AMBMISSIONS.TAB` record `("Ambush!", 1)` is **"Bloody St. Mick"**, Map A, matching the locked Phase
scope exactly. Its briefing text is intact and usable as-is: entry hexes (north edge, A-1 to J-1),
victory conditions naming hexes **T-8** and **K-13/L-13** — the two Stone Buildings the LOS phase
already identified near T9 and L12/L13 (`assets/data/los/README.md`). No surprises, real cross-
confirmation that the terrain/LOS work and this mission data agree with each other.

---

## 3. `AMBMISSIONCARDS.TAB` schema (per-hex paragraph/event assignment)

5,200 records total: `id, mission#, condition#, hex-id, paragraph# (direct, sparse), type, note`.

- `hex-id` uses the known 25×20=500-slot `.TAB` ID space (`A-00`…`Y-19`), consistent with
  `hexgrid.js`'s documented `.TAB`↔printed-label mapping gap.
- `type` is either `NONE`, `EVENT`, blank, or a sighting code `s0`–`s9` — sighting codes cross-
  reference paragraphs whose text starts with a matching `[sN]` tag in `AMBPARAGRAPHS.TAB`.
- `paragraph#` is a direct paragraph reference, present on a minority of rows (sparse).

**Computed reachable-paragraph set for Mission 1** (direct refs ∪ sighting-tag matches, `EVENT` rows
counted separately since their mechanism isn't yet understood — see open question below):

| | direct refs | sighting types present | via sighting tags | EVENT-flagged hexes | total (direct ∪ sighting) |
|---|---|---|---|---|---|
| "group 1" | 33 | s3, s4, s9 | 41 | 19 | **72** |
| "group 2" | 47 | s1, s2, s3, s4, s8, s9 | 94 | 80 | **136** |

That's roughly **9–16% of the full 827-paragraph pool**, just for Mission 1 — small enough that hand-
annotating all of it (not just a sample) is realistic once the group ambiguity below is resolved.

---

## 4. Two real open questions — not guessed at, need a decision or more source material

**a. Every Mission 1 hex has *two* mission-card rows, and they're not duplicates.** Each hex ID appears
twice under mission 1 (e.g. two records both literally for hex `A-00`), distinguished only by a second
number embedded in the row's own generated ID (`Ambush!_1_1_A-00` vs `Ambush!_2_1_A-00`) that has no
corresponding column of its own. **363 of 520 hexes have different data between the two** — this isn't
redundant export noise, it's a real second dimension the schema doesn't label. Best guesses (unverified):
two physical mission-card panels, a First-Entry-vs-Every-Entry split, or a Condition-A/B split. No
physical mission-card scan exists in `source/` to cross-check against (checked — only MP3/M4A audio
files under `source/assets/Audio/`, no card images). **Needs either the physical rulebook/mission-card
insert or a decision from the user on which group to treat as authoritative** (or whether both matter
and the schema needs a real second field).

**b. The `EVENT` type's actual mechanism is unclear.** The rules (`AMBTABLES.TAB`'s Action Round
Sequence entry, already transcribed) say the Event Phase rolls two dice and looks up the sum on
*"the Event column of the Mission Card"* — implying one small, fixed sum(2–12)→paragraph table per
mission. But Mission 1 has 19–80 hexes flagged `type=EVENT` (far more than 11 dice-sum buckets), so
per-hex `EVENT` flags and the Event-Phase die-roll table are evidently two different things, and the
relationship between them isn't yet known from the data alone.

**c. (minor, not blocking) A hex-ID prefix beyond the standard `A`–`Y` columns exists**: `RE-00`
through `RE-19`, 20 extra rows per mission, with real paragraph references (e.g. `RE-08` → paragraph
348, tagged `s9`). Doesn't fit the confirmed 25-column Map A grid — worth understanding before the
real parser ships (could be a Map B reference bleeding into this export, an off-map staging zone, or
something else). Caught only because grouping hex IDs by first-letter silently merged `RE-*` into `R`;
the real parser needs to key on the full alphabetic prefix, not a single character.

---

## 5. Hand-annotated sample (20 of Mission 1's directly-referenced paragraphs) — what the interpreter
   actually needs to express

Full text pulled and read for paragraphs 000, 001, 002, 003, 004, 005, 011, 012, 016, 024, 025, 026,
029, 100, 101, 102, 103, 105, 106, 107 (`assets/data/AMBPARAGRAPHS.TAB`, decoded). Patterns found,
roughly by frequency:

1. **Pure flavor text, no logic** (e.g. 002 "Soldier sees barrel of rain water...") — just display.
   Common; the Phase 2 dialog system already handles this exactly as-is.
2. **Straight forward-reference** ("If successful, see 007.") — simplest conditional shape, a
   success/fail branch to another paragraph number.
3. **Inline dice-range tables** ("Roll one die: 0-8: No effect... 9: Conduct a PC check (-2). If
   successful, see 150.") — a small enumerated table embedded in prose, needs pattern extraction (die
   ranges aren't formatted consistently — compare paragraph 100's "0-8 / 9" to 105's three-way
   "0-2 / 3-8 / 9" split).
4. **Checks with numeric modifiers** ("Conduct Activation Check (+3)", "PC check (-1)") — depends on
   the PC Check / Activation Check subsystems, which are **Phase 7 work, not built yet**. The
   interpreter can't actually execute these paragraphs until Phase 7 exists; it can only parse and
   stage them now.
5. **References to whole procedures defined elsewhere** ("Conduct the minefield procedure," "Conduct
   the boobytrap procedure") — these are **Phase 9 (combat) subsystems**, also not built yet. Same
   staging-only situation.
6. **Mission-conditional + event-history state** ("Mission 2 only: If s2 has not occurred, go to
   148.") — needs a "has sighting/event N already triggered this game" flag, a small but real piece of
   session state nothing currently tracks.
7. **Spatial/targeting logic** ("One soldier, with the highest PC, that can see hex U-9 must conduct a
   PC check.") — needs LOS (have it — Phase 5!) plus a "highest-attribute soldier among candidates"
   selection rule. The one place this spike found a direct, positive dependency on work already done.
8. **Bespoke one-off mechanics** (paragraph 011's artillery strike: an intentionally non-standard way
   of reading two d10 rolls as a hex coordinate) — can't be generalized, needs to be hand-coded as its
   own case regardless of how good the general-purpose DSL is.

**Conclusion:** the interpreter isn't one parsing problem, it's a **thin DSL over subsystems that
mostly don't exist yet.** Categories 1–3 and 6 are buildable now (display, branching, dice tables,
event-history state). Categories 4–5 need Phase 7 and Phase 9 to exist as callable primitives before
Mission 1's paragraphs can actually run end-to-end, even once parsed. Category 8 means "fully generic
DSL, zero hand-coded cases" isn't a realistic goal — budget for a handful of one-offs regardless of
design quality.

---

## 6. Recommendation

Don't commit to a full Phase 6 build yet — two real open questions (§4a, §4b) block correctly building
`AMBMISSIONCARDS.TAB`'s parser and the Event mechanism, and they need source material or a user
decision this spike couldn't resolve on its own. Suggested next steps, in order:

1. Resolve §4a and §4b — check whether the physical rulebook/mission-card insert (or box contents,
   `source/pdf/`, `source/assets/`) has anything not yet indexed here, or ask the user directly.
2. Once resolved, build the seven `TAB → JSON` parsers (low-risk, per §1).
3. Hand-annotate Mission 1's full reachable set (72–136 paragraphs depending on §4a's resolution, not
   just a sample — the set is small enough) against categories 1–8 above, and only *then* size the
   actual interpreter DSL with real numbers instead of estimates.
4. Treat categories 4–5's paragraphs as legitimately blocked on Phase 7/9, not a Phase 6 defect — stage
   them (parsed, tagged, not executable) rather than force an early combat/checks implementation to
   unblock a handful of paragraphs.

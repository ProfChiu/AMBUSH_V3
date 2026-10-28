# 20 — Paragraph interpreter (Phase 6, part 2)

**Date:** 2026-08-01
**Phase:** 6 — Data layer (`docs/11_GAME_BUILD_PHASES.md`) — **engine + full Mission-1 annotation
done and verified.** This closes the "standing risk" the phase doc flagged (the paragraph
interpreter, called out as the single largest unknown in the whole build).
**Follows:** `docs/19_DATA_LAYER.md` (paragraphs/missions/mission-cards/German roster all built) and
`docs/18_DATA_LAYER_SPIKE.md` §5, which categorized what a real interpreter needs before any code
was written.

**Deliverables:** `apps/game/paragraphinterpreter.js` (the engine), `assets/data/paragraph_programs.js`
(hand-annotated, all 71 of Mission 1's real reachable paragraphs), `tools/test_paragraph_interpreter.js`
(1522/1522 passing).

---

## 1. What this is, and isn't

A paragraph's prose (`assets/data/paragraphs.json`) stays the source of truth for what the player
sees — §5/1's "book stays hidden except what a triggered paragraph reveals" means display and
execution are separate concerns. This module only does the latter: given a hand-annotated
**program** (a short instruction list) for a paragraph, it executes the mechanical parts — branches,
checks, state changes — and reports what happened.

It does **not** parse prose automatically. The spike concluded a fully generic NLP-style extractor
wasn't realistic (paragraph 11's artillery strike alone has a bespoke, non-standard dice-reading
convention no generalized parser would infer), and that budgeting for hand-annotation plus a handful
of one-off cases was the honest path. That's what got built: a small DSL plus a runtime, then the
actual annotation work — not a parser that tries to read the rulebook for you.

---

## 2. The engine (`apps/game/paragraphinterpreter.js`)

Pure logic, no DOM, depends on nothing directly — every external fact (dice rolls, check results,
sighting history, who can see a hex, German removal state) comes through an injected `ctx` object,
same convention as `movementrules.js`'s injectable `rollD10`. This is what lets the interpreter be
built and tested now even though real PC/Activation Check resolution (Phase 7) and the minefield/
boobytrap procedures (Phase 9) don't exist yet — `ctx.resolveCheck()` and `ctx.runProcedure()` are
called and logged, not computed here; a test (or eventually the real engine) supplies what they
return.

**Instruction set**, one op per real pattern found in Mission 1's actual paragraphs (not designed
in the abstract): `goto`, `roll_die` (branch by die-range), `check` (PC/Activation, branch on
success/fail), `pc_check_los` (the "soldier with highest PC that can see hex X" and "every soldier
in sight of hex X" patterns — the one place this genuinely depends on Phase 5's LOS work),
`if_sighting` (single or multi-sighting, occurred/not-occurred, any/all), `if_german_removed_once`
(§7/4 evasive movement), `if_soldiers_can_see` (existence-only gate, with an `else` for paragraph
612's hex-fallback), `place_event_marker`, `place_landmark`, `set_condition`, `activate_german`,
`award_vp`, `run_procedure`, and `bespoke` (a logged, non-throwing escape hatch for the genuine
one-offs — see §4).

`run()` returns `{ effects, outcome }`: `effects` is an ordered log of every `ctx` call made (so a
test — or a future UI — can see exactly what happened without re-deriving it), `outcome` is either
`{type:'goto', target}` or `{type:'end'}`.

---

## 3. Annotation (`assets/data/paragraph_programs.js`) — all 71 real reachable paragraphs

Computed Mission 1's reachable set fresh from the verified `mission_cards.json` across **all 4
conditions** (not just Condition 1): 72 paragraph numbers, of which 613 doesn't exist in
`paragraphs.json` — a real gap in the printed booklet's own numbering (paragraph-book games
routinely skip numbers on purpose, to keep a player from inferring anything from which numbers are
"missing"), not a bug in the extraction. All other 71 are annotated, hand-written against the actual
paragraph text every time — cross-checked, not guessed. §5/1's "choose the first [numbered option]
that applies" rule is what `if_sighting` sequences implement for the numbered-list paragraphs
(198, 199, 343, 344, 608, 609).

**A real rules judgment call, made explicitly, not silently:** every German-activation paragraph is
annotated with `commenceRounds:true` regardless of whether that specific paragraph's own text says
"Commence Rounds" (some, like 452, don't say it explicitly). §6's own text says activating a German
always starts Rounds — the general rule wins over one paragraph's incidental phrasing.

---

## 4. Documented gaps — not glossed over

- **11, 12** have a check/random effect but no paragraph branch to encode (nothing to route to) —
  empty program, correct as written, not "not yet annotated."
- **90** ("place landmarks... north and northwest of your position") has no fixed hex; a real UI
  needs to ask the player which hexes, not guess.
- **195** ("if soldier on bridge... if soldier under bridge...") depends on the triggering soldier's
  position relative to a specific terrain feature — a fact this DSL has no access to. `bespoke`.
- **328, 453** have effects conditional on mission-end state or a future hex-entry — not "what
  happens when this paragraph is read," out of scope for a per-paragraph interpreter.
- **608 item 2** ("see 290 if in Clear terrain, see 326 otherwise") needs a terrain lookup at the
  triggering soldier's own hex. `bespoke`, verified by test to log without throwing rather than
  silently picking one of the two targets.

None of these are silently wrong — every one is either an empty program that's correct as-is, or a
`bespoke` marker a test explicitly checks doesn't crash the rest of the paragraph around it.

---

## 5. Verification (`tools/test_paragraph_interpreter.js`) — 1522/1522 passing

Two layers. **Structural:** every one of the 71 programs is run across all 10 die values and both
"always succeed"/"always fail" check outcomes (1420 runs), confirming every branch in every program
executes without throwing — this is what actually exercises every `roll_die` range and every nested
`check` branch, not just the ones a hand-picked example happens to hit. **Targeted, against the real
text:** paragraph 24's Event-marker-then-PC-check with no fail clause, 26/341's highest-PC-vs-every-
soldier LOS distinction (341 checks all 3 candidate soldiers even after the first success, since the
rule is "every soldier... must make a PC check," not "stop at the first success"), 198's numbered-
list precedence (both-occurred must beat either-alone), 336/601's nested check+bidirectional-sighting
branch, 611's full German-activation side-effect set (hex, stance, Special Reaction, Commence Rounds,
Condition change), 612's hex-fallback, 346's evasive-removal gate, and 608's bespoke clause logging
instead of throwing.

---

## 6. Next

Phase 6 is now functionally complete: all four datasets plus the interpreter engine and a fully
annotated Mission 1. What's left before this can actually run a mission: Phase 7 (Operations loop —
real PC/Activation Checks, Conditions, sightings tracking feeding `ctx` for real) and Phase 9
(combat, including the minefield/boobytrap procedures `run_procedure` currently just logs). No
interactive sandbox for the interpreter yet either — worth building once Phase 7 exists to wire
`ctx.resolveCheck` to something real, rather than a sandbox that can only ever fake it.

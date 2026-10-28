# 21 — Operations loop (Phase 7)

**Date:** 2026-08-01
**Phase:** 7 — Operations loop (`docs/11_GAME_BUILD_PHASES.md`) — **checks + Paragraph Check
procedure + Condition Change built and verified.** No interactive sandbox yet.
**Follows:** `docs/20_PARAGRAPH_INTERPRETER.md` — the interpreter's `ctx.resolveCheck`,
`ctx.hasSighting`, etc. were stubs a test scripted by hand; this phase is what wires them to real
Perception/Activation Check math and real Condition/sighting state.

**Deliverables:** `apps/game/checksrules.js`, `apps/game/operationsloop.js`,
`tools/test_operations_loop.js` (31/31 passing).

---

## 1. Checks (`apps/game/checksrules.js`)

One rule, used for both Perception and Activation Checks — confirmed from two places in the
rulebook that turned out to describe the identical mechanic: roll one die (0-9); success if the
roll is ≤ the rating (PC, or the current Condition's Activation Level) plus any modifier; a roll of
0 always succeeds and a roll of 9 always fails regardless of modifiers.

Worth noting how §5/8's text was recovered: the MD conversion of the rulebook PDF split this
section's continuous prose across a two-column page-layout artifact — the heading "5/8 Activation
Checks" was immediately followed by "# 6. Action Rounds" with the actual rule text picking back up
50 lines later. Read both halves and reassembled them rather than treating the truncated first half
as the whole rule (that pattern won it a citation in `checksrules.js`'s own comment, in case anyone
else re-reads that section and thinks it just stops there).

---

## 2. The Operations loop (`apps/game/operationsloop.js`)

Owns the real state §5 describes — Condition in progress, which sightings have occurred, which
hexes have an Event marker — and orchestrates §5/1's Paragraph Check procedure on top of Phase 6's
data and the paragraph interpreter.

**`paragraphCheck(hexId, ...)`:**
1. If the hex already has an Event marker, skip entirely — no lookup, no roll (§5/3).
2. Otherwise look up the hex's cell in the current mission/Condition's grid. `NONE` → nothing.
   A sighting-gated cell (`s3-600`) whose sighting has already occurred → ignored (§5/1). Otherwise
   the target paragraph is read.
3. `EVENT` → roll for a Random Event index (0-19) and look up that RE-column entry the same way —
   itself `NONE`, a paragraph, or sighting-gated. An Event marker is placed **regardless of the RE
   outcome** (§5/6), which the tests check directly (a "no effect" RE roll still marks the hex, so a
   later entry into the same hex is correctly skipped).
4. Reading a paragraph follows its `goto` chain automatically (`readParagraphChain`) — "if
   successful, see N" means immediately read N next, not wait for another player action — and, at
   each paragraph in the chain, marks any sighting that paragraph's own text is tagged with
   (`[s9] Trailing smoke...`), independent of whatever sighting gate (if any) led there. That's a
   real distinction the tests exercise directly: the mission-card's `sN-` gate and a paragraph's own
   `[sN]` tag are two different mechanisms that happen to often, but not always, agree.

**`conditionChange(to, occupiedHexIds, ...)`** implements §5/5 exactly, including the part that's
easy to get wrong by analogy with the normal Paragraph Check: Event Checks are **not rolled** here
— a cell that says `EVENT` just gets a marker placed, nothing more, per the rule's own explicit
"ignoring Event Checks, and simply placing Event markers in hexes that required the Event Checks."
Hexes are visited in ascending order (lowest hex first), and the sweep stops at the first hex whose
check activates a German (§5/5: "do not check other hexes occupied by US soldiers").

**What's still genuinely open, by design, not oversight:** exactly how two physical dice map to the
Random Event column's 20 entries was flagged unresolved in the sizing spike
(`docs/18_DATA_LAYER_SPIKE.md`) and still is — `rollForEvent()` is injected rather than computed
here, same reasoning as the interpreter's injected `resolveCheck`. The engine's structure doesn't
need that question answered to be built and tested; only a real dice-roll UI does.

---

## 3. Verification (`tools/test_operations_loop.js`) — 31/31 passing

`checksrules.js` checked against both rulebook worked examples (§5/7's PC-reduced-by-2 example,
§5/8's paragraph 136 Activation-Check-(-1) example) plus the 0-always-succeeds/9-always-fails edge
cases. `operationsloop.js` checked against real Mission 1/Condition 1 cells, not synthetic data:
`A1` (`NONE`), `A3` (paragraph 24 — confirms the chain stops correctly at an unannotated downstream
target, `13`, rather than silently treating that as an error), `A8` (`EVENT`, including the
already-marked skip case and confirming no event roll happens once skipped), `F4` (`s3-600`
sighting-gated, both the "not yet occurred" and "already occurred → ignored" paths), and `RE-12`
(`s9-453`, confirming the own-paragraph-tag sighting mark). Paragraph 611's full German-activation
chain (hex, stance, Special Reaction, Commence Rounds, Condition change) is exercised end-to-end
through `readParagraphChain` directly. `conditionChange` is checked for hex ordering, the
no-roll-on-EVENT behavior, and the early-stop-on-activation rule (via a minimal forced fixture,
since finding a naturally-occurring 2-hex early-stop case in the real data wasn't necessary to prove
the rule).

---

## 4. Next

The Operations loop can now run a real Paragraph Check end to end, but nothing yet drives it from
an actual squad on the map — there's no soldier roster with live PC ratings feeding
`pcRatingForCheck`, no real LOS-backed `soldiersWhoCanSee` (Phase 5's LOS engine exists and could be
wired in directly), and the minefield/boobytrap procedures (`run_procedure`) are still Phase 9
stubs. An interactive sandbox (mirroring `movementsandbox.html`/`lossandbox.html`) is a reasonable
next step once there's a real roster to drive it with, rather than one that can only ever fake the
checks it resolves.

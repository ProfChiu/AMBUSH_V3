# 48 — Difficulty, and the automated player

Sessions of 2026-08-20 through 2026-08-22. **Read this before touching Mission 1's balance, the
victory target, or the German roster data.** `PROGRESS.md` is the narrative; this is the operational
picture, superseding `docs/32_HANDOFF.md` (whose 20-task list is complete).

---

## 1. Start here

```bash
for f in tools/test_*.js; do node "$f" >/dev/null || echo "FAIL: $f"; done   # 18 suites
python3 tools/verify_reference_data.py     # 162 checks
python3 tools/verify_assets.py             # 1 known WARN + the .DS_Store FAIL, both expected
python3 tools/bot/run.py --seed 12345 --headed                                # watch a game
python3 tools/bot/run.py --seeds 30 --seed-base 7000 --workers 4 --jsonl /tmp/x.jsonl
```

Baselines to diff against live in `tools/bot/baselines/`. No build step; every page opens from disk.

---

## 2. The headline: Mission 1 was unwinnable

Not "hard" — **arithmetically unwinnable**. The requirement was 13 VP inherited from the rulebook,
and the reachable ceiling was 12. Every VP in the mission comes from German cards plus the ending
bonus (no Mission 1 paragraph calls `award_vp`), and only seven German identity numbers appear in
any annotated `activate_german` op.

The victory target is therefore no longer a constant. `victoryrules.js` computes the reachable
ceiling from the paragraph data (`computeReachableVP`) and sets the target a margin below it
(`scaleRequirement`). Both numbers are shown to the player. **Annotate more activating paragraphs
and the target rises on its own** — that is the intended maintenance path, not a manual edit.

Current: ceiling 14, **Normal target 8, Easy target 5**.

The margin of 6 is not taste. Measured across 30 games: five activations pay +6, Ending 1 pays +4,
each casualty costs −2. A target of 10 demanded all five activations *and* Ending 1 *and* zero
casualties — one casualty made the mission unwinnable while you were still playing it. 6 and 7 are
reachable on activations alone, which makes the scoring ending pointless. 8 is the only value that
keeps the objective the point while tolerating one casualty.

---

## 3. Bugs fixed, and why the unit suites missed all of them

Every one lived in the seams *between* modules that the suites each test correctly in isolation.
Four were found by the automated player on its first outing.

| Bug | Effect |
|---|---|
| `checkEndingConditions()` never called after an ordinary move | **Ending 1 unreachable** — the +4 scoring ending |
| `finishGermanTurn` asserted on a German already off the AR Track | **Hard lock**: surrender/withdraw/death mid-turn froze the Round for ever |
| `if_soldiers_can_see` / `pc_check_los` passed hyphenated hexes (`"T-8"`) to LOS | **Four of seven German activations could never fire**; the paragraph chain threw and aborted silently |
| Hexless Event marker from the §6/1 Rounds Event Check | Page crash on `parseId(null)` |
| Squad auto-buy bought redundant commanders as filler | Four-man squads instead of six to eight |
| §15 exfiltration exemption never wired | Implemented and unit-tested, unreachable from the game |
| Germans 25 and 81 shared one instance key | One never appeared; a dead one could be re-activated for duplicate VP |
| `"Bolt Rifle (Scope)"` matched the plain-rifle test first | Every sniper fired an ordinary rifle |
| GE 34/X transcription | IN 3 → 4; Condition 2 / DIE 0-1 865 → 965 |

---

## 4. German roster data

`assets/data/german_roster.json` is compiled from hand-typed CSVs. Sheets A1/A2 cover card numbers
1-22 and 32-61; **`reference/character_vehicle_cards_A3/`** is new, for cards transcribed
individually (currently GE 25/N and GE 81/P, both needed by Mission 1).

**`source/pdf/AmbushCards.pdf` contains all 75 German cards**, and
`Ambush_Cards_Alternative_Set_Up_version_1.pdf` has one card per page.

> **CORRECTED 2026-09-07 (`docs/54_CARD_AUDIT.md`): the sentence that used to stand here — "they
> agree with each other and with the physical cards" — is WRONG, and acting on it costs you data
> integrity.** The alternative set-up PDF is a VARIANT deck. GE 15/L DIE 0-3 Condition 4 reads 916
> on the original photographed sheet and 915 in that PDF. Use the photographs as the authority and
> the PDF only to cross-check.

Also corrected: the sheets cover **A2 = cards 1-31** and **A1 = cards 32-61**, not "1-22 and 32-61".
Nine cards were sitting untranscribed on a photograph already in the repo because of that.
19 cards remain absent from the roster (GE 62-66, 72, 73, 82-93), with no trustworthy source here.

**An audit found discrepancies on 24 of 48 transcribed cards. Only GE 34/X is fixed.** Do not
mass-correct from text extraction — the multi-column layout scrambles block order (proved: a German
card's "stats" line came through carrying a `DS` field). Render the one-card-per-page PDF and read
the image; that method is proven.

Regenerate the roster **alone**, never via the compiler's `__main__`, which also rewrites
`paragraphs.json` and has previously destroyed the hand-added paragraph 613 placeholder:

```python
import sys; sys.path.insert(0, 'tools')
import compile_reference_data as C, json
roster = C.extract_german_roster()
C.write_json_and_js("german_roster", {"soldiers": roster},
    json.load(open('assets/data/german_roster.json'))['note'],
    source="reference/character_vehicle_cards_A1/, .../_A2/, .../_A3/")
```

---

## 5. Easy mode

`apps/game/difficulty.js`, pure and tested (`tools/test_difficulty.js`, 32 checks). Picked on the
start screen, shown in the topbar, described before choosing and again in the Objectives window,
and saved with the game.

The governing constraint is the project's own rule: **Easy never hides a die.** Best-of-two rolls
show both dice; the ±1 handicap prints as its own breakdown term; field dressing announces itself.

Note that `chooseBest` scores by **outcome, not by the die**. Squad Points rise with the roll but
Weapon Points *fall* as the squad+weapon sum rises, so a naive "keep the higher die" would make
Easy mode worse than Normal on that roll. Confirmed live: a run kept a 1 over a 6 and gained 5 WP.

---

## 6. What is still open, in priority order

1. ~~**The stalemates.**~~ **FIXED, session 63 — see `docs/49_PAID_STANCE_CHANGE.md`.** It was the
   same bug as item #6 below. §6/7's *paid* stance change was never implemented, so a wounded
   soldier (who never gets a free one) who was also prone (who cannot move) had no legal action for
   the rest of the mission. `autopsy.py` on all six seeds returned "NO LEGAL ACTION — pass only" on
   360 of 360 observed turns, every one of them a wounded, prone soldier. All 30 seeds now finish on
   both difficulties, with median VP and casualties essentially unchanged.

   Worth keeping from the old entry: the warning that the obvious theory had been *refuted* was
   itself the trap. That refutation was real but belonged to the 27 games frozen by a harness bug,
   whose soldiers were healthy and standing. The six that survived that fix had a different cause,
   and for them the obvious theory was right. Run the autopsy — don't reason from the last
   autopsy's answer either.

2. ~~**German-decision transparency.**~~ **DONE, session 63 (`docs/50_GERMAN_DECISION_TRANSPARENCY.md`).**
   Both halves of the decision now explain themselves: which of the three rules picked the Action
   column (naming the US soldier who triggered Self-Preservation, and what the column displaced),
   and which option within the paragraph applied and why. Display-only — all 30 baseline seeds
   produce identical outcomes.

3. **The suspect card transcriptions — PARTLY DONE, session 63f (`docs/54_CARD_AUDIT.md`).**
   Two real errors found and fixed in cards this list called verified: **GE 33/V IN 2 -> 1** and
   **GE 53/S DIE 0-2 Condition 4 836 -> 838**, both in Mission 1. The claim above that "its seven
   cards are all verified" was false, and a check in `verify_reference_data.py` asserting GE 33/V's
   wrong IN "match[ing] the photo" was itself the misreading.

   The remaining candidates are listed by `tools/parse_cards_pdf.py --verify` (46 field diffs
   across 48 cards) but **each must be adjudicated against the photographed sheet**, not applied in
   bulk — see item 4's warning. Start with GE 46/N, GE 37/P and GE 44/T, whose diffs are on stats
   rather than paragraph numbers.

4. **The missing German cards — PARTLY DONE, session 63f.** Eight added (**GE 23/S, 24/P, 26/X,
   27/M, 28/U, 29/U, 30/R, 31/L**), read off `character_vehicle_card_Sheet_A2.jpg`, which carries
   cards **1-31** — this document's claim that the sheets cover "1-22 and 32-61" is what left nine
   of them sitting unread on a photograph the project already had. Roster 49 -> 57.

   **19 remain: GE 62-66, 72, 73, 82-93.** They are on neither photographed sheet, and the only
   source for them here is `Ambush_Cards_Alternative_Set_Up_version_1.pdf`.

   > **Do not use that PDF as authority.** §4 above says it agrees with the physical cards. It does
   > not — it is a VARIANT deck. Confirmed case: GE 15/L DIE 0-3 Condition 4 is **916** on the
   > original sheet and **915** in the PDF. A correction applied from it had to be reverted. The
   > PDF is fine for flagging candidates and for cross-checking a reading; it must never settle
   > one. Finishing this item needs a photograph of the remaining sheet(s) — a sourcing problem,
   > not a transcription one.

5. ~~**Crew weapons.**~~ **DONE, session 63 (Task A1, `docs/51_CREW_WEAPONS_WIRED.md`).** §9/7 is
   live on both sides: the crouching requirement, snap-only solo fire, two-soldier combined aimed
   fire, the two-distinct-soldiers-per-Round cap, and `resolveGermanCrewFirer` for a German pair.
   GE 32/S — one of Mission 1's own seven Germans — carries a Medium Machinegun, so this was
   reachable in ordinary play, not just via pickup. §9/8 bazookas stay unwired (no bazooka is
   obtainable with the current data). §9/9 is blocked by item 7 below.

6. ~~**§6/7 paid stance change.**~~ **DONE, session 63 (`docs/49_PAID_STANCE_CHANGE.md`).** It was
   the stalemate cause after all — the note here that it was not is what item #1 above corrects.
   Reconciled with `movementrules.js` by leaving that module alone: its "prone cannot move" is
   correct at its level, and the stand-up-first step belongs in the demo layer, where the
   free-stance-change state lives. Its tested `stanceChangeCost` did the arithmetic, having sat
   uncalled since it was written.

7. ~~**Map A's two buildings are missing from the terrain data.**~~ **DONE, session 63d
   (`docs/53_BUILDINGS.md`).** Both buildings are now real: a Stone Building at K13+L13 and a Wooden
   Building at T8, with wall/window/door hexsides, §8/2 line of sight in full (stance-dependent
   apertures included), wall-aware movement at the chart's own costs, and the fire table's two
   interior rows split correctly. This mattered more than a terrain gap sounds: Mission 1's +4 VP
   ending is *occupy the buildings*, and Germans activate inside them, so both sides had been
   fighting over three hexes the engine thought were open ground. Bot wins 13% → 33% on Normal.

---

## 7. Standing caveat on all measurements

The automated player is **competent, not expert** — its numbers are a floor. A low win rate means
"this is hard", never "this is impossible". And it cannot tell you whether the game is *enjoyable*:
whether Round 4 drags, whether losing feels instructive or arbitrary, whether the popup-per-step
chain still pleases on the third firefight. **No batch substitutes for Wan playing a mission.**

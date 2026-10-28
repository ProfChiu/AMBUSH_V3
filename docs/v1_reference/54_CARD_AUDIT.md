# 54 — The German card audit, and the source that cannot be trusted

Session 63f. Addresses `docs/48` items 3 (23 suspect transcriptions) and 4 (27 missing cards).
Both are partly closed, and the reason the rest is *not* closed is the important part of this
document.

---

## 1. The trap: "Alternative Set Up version 1" is a VARIANT deck

`docs/48` §4 states that `source/pdf/AmbushCards.pdf` and
`Ambush_Cards_Alternative_Set_Up_version_1.pdf` "agree with each other and with the physical
cards". **They do not.**

The alternative PDF is a superb-looking source — one card per page, a clean text layer, no OCR
needed, and it contains exactly the 49 cards already in the roster plus the 27 listed as missing,
which makes it look like the complete original set. It parses cleanly
(`tools/parse_cards_pdf.py`). It is also, in places, **different data**:

| Card | Original photographed sheet | Alternative PDF |
|---|---|---|
| GE 15/L, DIE 0-3, Condition 4 | **916** | 915 |
| GE 33/V, role banner | Veteran Infantry | Veteran Infantry |
| GE 34/X, VP | +1 VP (+2 VP if captured) | +1 VP |

I applied the GE 15/L "correction" before checking the photograph, and had to revert it. The
photographed sheets are the authority; the alternative PDF is corroboration only, useful for
catching a misreading but never for overruling one.

**Rule going forward: a card is only changed on the evidence of
`reference/character_vehicle_card_Sheet_A1.jpg` / `_A2.jpg`, read at zoom.** The PDF may be used
to flag a candidate, never to settle it.

## 2. Two real errors found and fixed — in cards `docs/48` called verified

`docs/48` §6 item 3 says "No Mission 1 impact — its seven cards are all verified." That was not
true. Both of these were read off the original sheet A1:

| Card | Field | Was | Is | Effect |
|---|---|---|---|---|
| **GE 33/V** | IN | 2 | **1** | Initiative rating — changes AR Track placement every Round he is on the map |
| **GE 53/S** | DIE 0-2, Condition 4 | 836 | **838** | A different Action Paragraph in Condition 4 |

Both Germans appear in Mission 1. `tools/verify_reference_data.py` contained a check asserting
GE 33/V's IN was 2 "match[ing] the photo" — that check was itself the misreading, and is corrected.

## 3. Eight missing cards added

`reference/character_vehicle_card_Sheet_A2.jpg` carries cards **1-31**, but only 1-22 had ever been
transcribed. `docs/48` describes the sheets as covering "1-22 and 32-61", which is why nine cards
sat in plain sight on a photograph the project already had.

Added, each read directly off that sheet: **GE 23/S, 24/P, 26/X, 27/M, 28/U, 29/U, 30/R, 31/L.**
(GE 25/N was already present via the A3 folder — and, usefully, my reading of it off the photograph
reproduced the existing entry exactly, which is what gave confidence in the method.)

All eight were then diffed against an independent parse of the alternative PDF. **All eight agree
on every stat and every table cell.** Two sources, two methods, no disagreement.

Roster: **49 → 57 cards.**

## 4. What is still open, and why

**19 cards remain unadded: GE 62-66, 72, 73, and 82-93.** These are not on either photographed
sheet. The only source in the repository for them is the alternative PDF — which §1 establishes
cannot be trusted to be the original data. Adding them would import an unknown number of variant
values into the roster under the appearance of authority.

**This needs a photograph of the remaining card sheet(s), or the physical cards.** It is a
sourcing problem, not a transcription problem, and no amount of care with the files on hand will
solve it.

**The "23 suspect transcriptions" are not yet individually resolved.** The parse-vs-roster diff
flags 46 field differences across the 48 previously-transcribed cards, but §1 means every one of
those is a *candidate*, not a finding — each has to be adjudicated against the photograph, as the
three in §2 were (two upheld, one reverted). The tooling to do that now exists
(`tools/parse_cards_pdf.py --verify` produces the candidate list); the work is one card at a time
with the sheet open.

Cards worth doing first, because the diff is on a stat rather than a paragraph number and stats
affect every turn: **GE 46/N** (four stat diffs), **GE 37/P** (four), **GE 44/T** (IN).

## 5. Verification

- `verify_reference_data.py` 161 → **172 checks, all passing**, including per-card spot-checks on
  the eight additions and the corrected GE 33/V assertion.
- 17 JS suites green; every roster card still maps to a real weapon id.
- The eight new cards agree between photograph and PDF on every field.

# 50 — German decision transparency

Session 63. Closes open item #2 of `docs/48_DIFFICULTY_AND_AUTOMATED_TESTING.md` ("Rolls are shown,
but *why* a given Action column was used is not").

---

## 1. The problem

A German's turn is driven by two decisions, and the player could see the result of both and the
reason for neither.

1. **Which Action column** the die roll is read against — Self-Preservation, a Special Reaction, or
   the mission's current Condition. The pop-up named the column (`Column SPECIAL S`) but never why
   *that* column. A Self-Preservation reaction and an ordinary Condition lookup were indistinguishable.
2. **Which option within the paragraph** applied. This is the more opaque of the two in practice:
   the player is shown the paragraph in full — four bullets, all of them plausible — and then simply
   watches the German act, with nothing connecting the action to the option that produced it.

Both are now explained, in the pop-up and in the combat log.

## 2. Column: why this column

`arrules.js`'s `resolveGermanActionParagraph` returns a `reason` alongside `paragraph`/`column`:

| `reason.rule` | fields | means |
|---|---|---|
| `self_preservation` | `overrides` | §11/4 — a US soldier is in or adjacent to his hex, or §11/2's freed prisoner uses it for the rest of the mission |
| `special_reaction` | `letter`, `overrides` | §6/8 — a Reaction is in effect and its column replaces the Condition one |
| `condition` | `condition` | the ordinary lookup — neither of the above fired |

`overrides` names what was displaced, which matters in the one case where naming only the winning
column would hide half the decision: Self-Preservation outranking a Special Reaction reports
`overrides: 'SPECIAL B'`, not the Condition.

The module stops there deliberately. Naming *which* US soldier triggered the proximity test needs
the board, so `mission1demo.js` finishes the sentence:

> Column **SPECIAL S** → paragraph **816**.
> **Self-Preservation:** Pvt. Baker is adjacent at M4, regardless of line of sight (§11/4), so the
> **SPECIAL S** column overrides CONDITION 3.

**One trap worth knowing.** On the card-has-no-column fallback path, `reason.condition` is the
column the card actually *has*, not the mission's Condition — the demo layer looks up the nearest
available column and re-resolves against it. Calling that "the mission's current Condition" in the
sentence would state something false, so the fallback case prints the shorter form and lets the
existing amber note name both numbers. The log line drops its `[Condition N]` tag there for the
same reason, rather than printing `[Condition 2] (via Condition 2 column)`.

## 3. Paragraph: which option applied

`germanactions.js`'s `resolve()` now returns `decisions` alongside `visited`/`actions` — one entry
per branch evaluated, carrying the paragraph, the 1-based option index, how many options there
were, whether it was the catch-all, and a rendered clause:

```js
{ paragraph: '808', option: 2, of: 3, catchAll: false,
  because: '1-2 US soldiers are in his sight' }
```

Recorded whether or not a case matched — "no option applied" is itself an explanation, and the one
a reader is most likely to be puzzled by. The index is 1-based to match how §6/8's numbered options
and the printed bullets are counted.

`describeCondition` renders a condition as the clause a player would read. It is **total in the
same way and for the same reason `evaluate` is**: an unknown condition throws rather than quietly
producing an empty explanation, so a new annotation vocabulary word cannot ship with the reason
silently missing from the pop-up. A test walks every branch case in the real annotation data (80 of
them, covering 13 condition kinds) and asserts each renders non-empty.

Two phrasing decisions, both made after reading the real output rather than in advance:

- **Natural negations.** `{on: 'not', of: {on: 'in_us_sight'}}` first rendered as *"it is not the
  case that he is in sight of an active US soldier"* — accurate, and reads like a logic exercise.
  The predicates actually written under a `not` get a natural negative (*"he is not in sight of any
  active US soldier"*); anything else falls back to the literal form, which is clumsy but never
  wrong. A new vocabulary word degrades in legibility, not in accuracy.
- **The catch-all.** An `always` case rendered as *"option 2 of 2 applies: no earlier option
  applied"* — a tautology. `catchAll` flags it so the UI can say *"the first option did not match,
  so the catch-all option 2 of 2 applies"* instead.

It describes what the paragraph **tested**, not what the situation was. The two agree by
construction — this is only ever called on a case that just evaluated true — and phrasing it as the
test keeps it traceable back to the printed paragraph the player is looking at.

## 4. What it looks like

Under the paragraph text, in amber:

> *If no active target in sight, crouch. If 1 or 2 active targets in sight, crouch and conduct best
> fire at easiest target. Fall prone after fire if free stance change available. If three or more
> active targets in sight, fall prone.*
>
> **His situation:**
> option 2 of 3 applies: 1-2 US soldiers are in his sight.

And in the log, where it is greppable across a whole game:

```
German Action Number for German (GE 34/X, Officer): 2 → 816 [Self-Preservation over CONDITION 3]
German (GE 34/X, Officer) reads paragraph 816.
Paragraph 816: ignore the Self-Preservation reaction and roll a new Action Number (§6/8).
German Action Number for German (GE 34/X, Officer): 7 → 835 [Condition 3]
German (GE 34/X, Officer) reads paragraph 835 — option 1/2 (1 or more other Germans are within 2 hexes).
```

That excerpt is worth keeping as a worked example: it shows §6/8 paragraph 816's re-roll correctly
*dropping* Self-Preservation on the second roll. Before this change, confirming that behaviour meant
reading the source; now it is legible in the log.

## 5. Verification

- 17 JS suites green; `test_german_actions.js` 82 → 90 checks, `test_action_round.js` 46 → 52.
- `verify_reference_data.py` 162/162.
- 30-seed batch: **every seed's outcome, VP and round count is byte-for-byte identical to the
  session-63 baseline**, which is the proof that this is display-only.
- Rendering confirmed in a live game rather than assumed: 53 paragraph bodies rendered across seed
  7013, 13 of them carrying an explanation (the other 40 are paragraphs with no branch, which
  correctly show nothing), plus the Self-Preservation and fallback sentences read off real pop-ups.

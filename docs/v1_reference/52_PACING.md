# 52 — What a game of Mission 1 costs the player

Session 63, Task A3. The project's standing caveat says no batch substitutes for Wan playing a
mission, and that remains true. But the caveat's own examples — *"whether Round 4 drags, whether the
popup-per-step chain still pleases on the third firefight"* — have a countable half, and it had
never been counted. `tools/bot/pacing.py` counts it.

**This does not replace the playtest. It tells you where to look during it.**

---

## 1. The instrument

Every dialog the page opens is recorded from inside the page by a MutationObserver, tagged with the
phase it appeared in, and classified as a **decision** (it offered choice rows) or an **ack** (it
told you something and wanted one press).

**One trap, hit and fixed.** The first version keyed each event on the dialog's body text, and
`animateDie` rewrites that body about eight times per die while the face tumbles. A single Jam Check
logged as a dozen dialogs, and the first run reported **2,000–7,000 dialogs per game** and "130 acks
per decision". Both were nonsense. Counting the backdrop's open→close transition instead gives
98–273. If a pacing number ever looks like an order of magnitude too much, suspect the die
animation before believing it.

**One limitation, stated rather than papered over.** Operations reports **zero decision dialogs**,
and that is a property of the instrument, not the phase: movement there is chosen by clicking a
destination hex on the map, which is not a dialog. Read Operations' figure as "dialogs the player
must dismiss", never as "clicks with no agency", and do not take an acks-per-choice ratio for it —
the denominator is missing, not zero. The same caveat makes the longest-unbroken-ack-run figure
meaningful only *within* an Action Round.

## 2. What it found (6 seeds, 7000–7005, Normal)

**Re-measured 2026-09-07, after Map A's buildings went in (`docs/53`).** That change altered 21 of
30 games, so the first set of numbers — taken the day before — no longer described the game. Both
are kept below, because the direction of the change is itself the finding.

```
  seed    outcome  rnds  dialogs   acks  choices   longest ack run
  7000   finished     9      117     96       21                33
  7001   finished     8      111     92       19                53
  7002   finished     9      124     98       26                33
  7003   finished     7      156    126       30                29
  7004   finished    25      237    177       60                20
  7005   finished     5      116     99       17                26

  dialogs per game: median 120 (111–237)
```

| phase | acks | dialog choices | acks per choice |
|---|---|---|---|
| Action Round | 412 | 173 | **2.4** |
| Operations | 229 | 0 | n/a (map clicks) |
| Entry Placement | 47 | 0 | n/a (map clicks) |

**Load per individual Action Round, pooled:**

```
R1  31    R2  35    R3  71    R4  64    R5  75    R6  61    R7  46    R8  36    R9  28    R10+ ~10
```

**Most frequent dialogs:** Move 245 · Ammo Check 98 · Initiative Roll 87 · Stance 77 ·
Entry Placement 47 · Event Marker 36 · Dud Check 25.

### Before and after the buildings

| | before (63c) | after (63d) |
|---|---|---|
| dialogs per game, median | 142 | **120** |
| acks per in-dialog choice, Action Rounds | 1.8 | **2.4** |
| longest unbroken ack run, median | 48 | **31** |
| Operations dialogs (pooled) | 320 | **229** |
| `Move` dialogs (pooled) | 286 | **245** |

**The game got shorter to click through, and slightly less interactive per click.** Both follow from
the same cause. Buildings block line of sight, so fewer Germans are visible at any moment, so there
are fewer target-selection dialogs — that is the acks-per-choice rise from 1.8 to 2.4. And the bot's
new wall-aware routing walks more directly, which cut `Move` pop-ups and nearly a third off the
Operations load. The longest unbroken click-through run dropped from 48 to 31.

## 3. How to read it

- **Action Rounds remain the interactive part**, at 2.4 acknowledgements per real in-dialog choice.
  That is worse than before but still a decision roughly every third pop-up.
- **"Does Round 4 drag?" — the peak moved and broadened.** It was Rounds 3–4 (76/74); it is now
  Rounds 3–5 (71/64/75), with a longer tail. Firefights last longer because the defenders have
  cover, which is the intended consequence of `docs/53` rather than a pacing regression — but it
  means the busiest stretch of the mission is now three Rounds, not two.
- **`Move` is still the single most frequent dialog in the game** by a wide margin, and still the
  highest-leverage one to reconsider.
- **`Not Modelled` appeared 11 times** across 6 games — the §9/4 stub for a German whose weapon is
  jammed or broken (no second-weapon inventory, no AI-driven Clear Jammed Weapon). It is a
  deliberate loud stub rather than a silent skip, but at ~2 per game it is now frequent enough to be
  worth a look.
- **Caveat on the bot as a proxy, unchanged:** it walks widely to trigger Paragraph Checks, so its
  `Move` count is an upper bound on a human's. The phase split and the per-Round shape are more
  trustworthy than the absolute totals.

## 4. The playtest that still has to happen

Run a full mission yourself. The numbers above say where to point your attention:

1. **Rounds 3–5.** The measured peak, and it broadened when the buildings went in (it was 3–4).
   Three busy Rounds in a row: does that read as the climax, or as admin?
2. **The `Move` pop-up.** You will see it more than any other dialog. Does the per-hex Paragraph
   Check still land by the twentieth one?
3. **`Ammo Check` (98) and `Dud Check` (25).** High-frequency, low-information. Do they earn a
   press each, or should they fold into the fire result?
4. **The third firefight specifically** — the caveat's own words. First is novel; by the third, the
   pop-up chain is either rhythm or friction.
5. **Losing.** Median VP is now **−1** against a target of 8, so you will probably lose. Does it
   read as instructive or arbitrary? Nothing measurable answers this, and it is the most important
   one.
6. **Whether the buildings feel worth fighting for.** New since `docs/53`. Ending 1 is "hold the
   two buildings", the Germans start inside them, and both sides now get real cover there. Does
   digging them out feel like the point of the mission?

Reproduce with:

```bash
python3 tools/bot/pacing.py --seeds 6 --seed-base 7000 --workers 3
```

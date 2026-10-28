# Baselines

## v3 baselines after Phase 8c (2026-10-25)

`v3_normal_seeds_7000-7029.jsonl` and `v3_easy_seeds_7000-7029.jsonl` were recorded on the v3 page
(`AMBUSH_PAGE=v3`) after the Mission 1 paragraph data was completed (`docs/PARAGRAPH_DATA_GAPS.md`).
They are now the comparison point for v3. The v2-era files below stay as v2's record, and v3 no
longer matches them by design: contact paragraphs now set the Round 1 advantage, awareness and
2 turns, the chains that used to stop silently now run, and every seed plays a different game.

| File | Finished | Stalemate | Wins | Median VP | Console errors |
|---|---|---|---|---|---|
| `v3_normal_seeds_7000-7029.jsonl` | 30/30 | 0 | 5 (17%) | -6.0 | 0 |
| `v3_easy_seeds_7000-7029.jsonl` | 30/30 | 0 | 22 (73%) | 6.0 | 0 |

Against the v2-era files: Normal went from 4 wins (median -8) to 5 (median -6), and Easy from 20 to
22 (median 6 both). A second run reproduced every game field 30/30 on both difficulties.

Recorded results for seeds **7000–7029**, one JSON object per game. These are the comparison point
for any future change: re-run the same seeds and diff, rather than arguing about whether something
helped.

```bash
python3 tools/bot/run.py --seeds 30 --seed-base 7000 --workers 4 \
    --max-steps 20000 --max-seconds 300 --jsonl /tmp/after.jsonl
python3 tools/bot/run.py --seeds 30 --seed-base 7000 --workers 4 --difficulty easy \
    --max-steps 20000 --max-seconds 300 --jsonl /tmp/after_easy.jsonl
```

| File | Recorded | Finished | Stalemate | Wins | Median VP | Target |
|---|---|---|---|---|---|---|
| `normal_seeds_7000-7029.jsonl` | 2026-09-19 | 30/30 | 0 | 4 (13%) | -8.0 | 8 |
| `easy_seeds_7000-7029.jsonl` | 2026-09-19 | 30/30 | 0 | 20 (67%) | 6.0 | 5 |

**Re-recorded 2026-09-19 (v2 task 1)** after `animateDie` stopped drawing from the seeded stream.
Every seed now plays a different (equally valid) game, so these are a fresh sample, not a
regression against the old ones. Reproduction check: a second run matched on every game field
(outcome, vp, result, rounds, activations, casualties, exited, banner) 30/30 on both difficulties.
**`steps` is not reproducible and never was a game field** — it counts the harness's own polling
loops and jitters by a few with timing; diff game fields only. The replaced files are in `archive/`
as `*_pre-task1_animrng.jsonl`. Note for anyone comparing: the replaced Normal file itself held
10/30 wins and median VP -4, not the 4 / 3.0 the table claimed (the Easy file held 18, not 19), so
the old table had drifted from its file; n = 30 is noisy either way, and task 7 re-derives targets.

Earlier: re-recorded in session 63 after the §6/7 paid stance change (`docs/49_PAID_STANCE_CHANGE.md`)
removed the stalemate class. **Every game now finishes.** If a future run reports `stalemate` at
all, that is a new regression, not the known one.

Medians above are over all 30 games, not only the finished ones — with nothing left unfinished
those are now the same set anyway, but the older numbers quoted a finished-only median and the two
are not comparable.

## The task-7 sample and the walking variant (2026-09-20)

`*_seeds_7030-7059.jsonl` are thirty FRESH seeds recorded for the victory-target re-derivation, so
the targets rest on 60 games rather than 30. A sample, not a regression baseline — diff against the
7000-7029 files. Pooled over all 60: Normal 15% wins (median VP -4, max 10), Easy 67% (median 6).
The derivation and its conclusion live in `apps/game/victoryrules.js` (scaleRequirement's header).

`walk_*_seeds_7000-7029.jsonl` are the same 30 seeds played with `--walk` (task 6's multi-hex
Operations move). Also not a baseline: walking changes which hexes get entered, so outcomes differ
by design. They exist to show that how cheap walking became does NOT move the difficulty — Normal
4/30 wins either way, Easy 18/30 walking against 20/30 stepping, median VP 6 in both.

## The archived baselines, and the trap in them

`archive/` holds the 2026-08-22 recordings the above replaced. Read
`normal_seeds_7000-7029_2026-08-22_need10.jsonl` with care: it was recorded when the victory target
was **10**, before session 62 lowered it to 8, so its `result` field labels games won/lost against
the wrong number and its win rate cannot be compared to anything current. Its `vp` values are fine —
rescore them yourself against the current target. The Easy archive was recorded at `need: 5` and
needs no such correction.

That is the general hazard with a stored baseline: it captures the *scoring rules* of its day along
with the dice. Check `need` before trusting a `result`.

**A seed only reproduces against the same game code.** Two things in particular invalidate a diff:

- Any change to game logic that draws a different number of `d10()` rolls. (Since v2 task 1 the die
  *animation* draws nothing from the seeded stream, so presentation changes are safe.)
- Any change to how many dice a roll makes, including the Easy-mode best-of-two path.

If either changes, re-record rather than trusting a diff.

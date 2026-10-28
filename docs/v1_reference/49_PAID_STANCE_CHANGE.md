# 49 — The paid stance change (§6/7), and the stalemates it was causing

Session 63. Closes open item #1 (the stalemates) and open item #6 (§6/7 paid stance change) from
`docs/48_DIFFICULTY_AND_AUTOMATED_TESTING.md`. They turned out to be the same bug.

---

## 1. The symptom

Six of thirty Normal games (two of thirty on Easy) ran to Round 294–492 and never ended. `endRound`
returns to Operations only when no active German remains, and Ending 2 (withdrawal) is an
Operations action — so a fight that cannot be finished also cannot be left. The game was not
crashed or hung; it was legally stuck, cycling turns that could change nothing.

## 2. The diagnosis

`tools/bot/autopsy.py` on all six seeds, watching 60 turns past the freeze point:

```
  seed  round  turns  verdict
  7002    202     60  NO LEGAL ACTION — pass only
  7006    177     60  NO LEGAL ACTION — pass only
  7013    116     60  NO LEGAL ACTION — pass only
  7014    121     60  NO LEGAL ACTION — pass only
  7016    136     60  NO LEGAL ACTION — pass only
  7018    120     60  NO LEGAL ACTION — pass only

acting soldier stance across 360 observed turns: {'prone': 360}
acting soldier status:                           {'wounded': 360}
most common action sets offered:            360  passTurn
```

Unanimous, across every observed turn of every seed: the squad had been ground down to one to three
survivors, **all of them wounded and prone**, with the last Germans 9–11 hexes away. The only
button the game offered was Pass.

**Note for the record:** the README's standing warning was that this exact theory — wounded → no
free stance change → prone → cannot move → frozen — had been *refuted* by an earlier autopsy. That
refutation was real but belonged to a different cohort: the 27 games it examined were frozen by a
harness bug (the bot could not read `currentActorId`), and their soldiers were healthy and standing.
The six games that survived that fix have a different cause, and for them the theory is correct.
The lesson holds either way: run the autopsy, don't reason from the last autopsy's answer.

## 3. The rule that was missing

Two rulebook passages, both unambiguous:

> **§6/7 Free Stance Change.** An unwounded soldier can, at any point during his turn, make one free
> stance change […] Wounded soldiers never receive a free stance change. **A soldier without a free
> stance change must spend one Movement Point to change stance, and thus must perform a Movement
> Action.**

> **§7/3.** A crouching or prone soldier must change stance using a free stance change, if he has
> one, **or by spending a Movement Point, in order to stand and then move**.

So a prone soldier is *not* immobile. He is a soldier whose Movement Action must open with a stance
change. The implementation modelled only the free half of that rule, and both halves of the exit
were therefore closed:

| Where | What it did | Why that froze the game |
|---|---|---|
| `stanceChangeCandidates` | `if (s.wounded) return []` | A wounded soldier could never change stance at all |
| `legalDestinationsWithBudget` | `if (s.stance === 'prone') return {}` | A prone soldier could never move at all |

A wounded prone soldier hit both, so he had no legal action for the rest of the mission.

## 4. The fix

All in `apps/game/mission1demo.js`. `movementrules.js` is untouched — it already exports a correct,
tested `stanceChangeCost(usedFreeChangeAlready, wounded)` that was simply never called, and its own
"prone cannot move" rule is right at its level: it answers *"where can a soldier in this stance
go"*, and for prone the answer is nowhere. Standing up first is a turn-level concern, so it lives
in the demo layer where the free-stance-change state does.

1. **`standUpCost(s)`** — delegates to `M.stanceChangeCost`. 0 if the free change is still
   available, otherwise 1 MP.
2. **`legalDestinationsWithBudget`** — a prone soldier's Movement Action now buys the stance change
   out of the same MP budget and then paths as standing on the remainder. Every returned
   destination's `cost` includes the stand-up, so the existing half-MPA combo check
   (`finishMoveStep`) stays correct with no change. Standing up and going no further is included as
   a destination on the soldier's own hex — a legal Movement Action in its own right, and for a
   wounded soldier with 2 MPA often the only one worth taking.
3. **`doRoundMove`** — opens with `standUpThen()`, which sets the stance, consumes the free change
   only when it was actually free, and announces it in its own pop-up, naming which of the two it
   was and, for a wounded soldier, why he had no free one.
4. **`stanceChangeCandidates` / `doPlayerChangeStance`** — now offer the paid change too, with the
   prompt and the log line stating "1 MP, Movement Action" rather than "free stance change".

**Deliberately not modelled:** a *crouching* soldier standing up to move further than his one-hex
crawl. Legal by the same sentence, but it turns every crouching Move into a two-mode choice for a
case the crawl already covers, and no stalemate depends on it. Recorded here so the omission is a
decision rather than an oversight.

`tools/bot/policy.py` also reordered: Move now stands a soldier up *and* advances in one turn, so
the bot prefers it over spending a whole turn standing. The stand-up branch remains as the fallback
for a prone soldier Move cannot help (no goal, or no MP left after standing).

## 5. Result

Same 30 seeds, before and after. Both batches rescored at the current target of 8, because the
recorded Normal baseline predates the target change (it was written with `need: 10`, so its own
won/lost labels are not comparable — see the baselines README).

| | finished | stalemate | wins@8 | median VP | median casualties | median rounds |
|---|---|---|---|---|---|---|
| before | 24/30 | **6** | 5/30 (17%) | 0.5 | 3.5 | 11 |
| after | **30/30** | **0** | 4/30 (13%) | 3.0 | 3.0 | 7 |

The six stalemates collapse from hundreds of rounds to single digits: 492→7, 480→10, 362→10,
294→10, 366→6, 328→7.

Easy, whose baseline *is* current (`need: 5`) and so compares directly: stalemates 2→0, 30/30
finished, median VP 6.0 and median casualties 2.0 both unchanged, wins 21/30→19/30.

**Difficulty is essentially unmoved; the unfinishable-game class is gone.** The one-game win-count
drop on each difficulty is the two-to-six former stalemates resolving as finished losses — they
were already losses, they just now admit it. At n=30 a single game is well inside noise.

Verified: 17 JS suites green, `verify_reference_data.py` 162/162, 60 bot games with 0 crashes and
0 console errors, and the "Stand Up" pop-up confirmed firing in a decision trace of seed 7002.

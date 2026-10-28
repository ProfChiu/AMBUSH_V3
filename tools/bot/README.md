# tools/bot — the automated player

Plays Mission 1 end to end in a headless browser, with seeded dice, so games are reproducible and
can be run in bulk. Built to answer two questions the 17 unit suites cannot: **does the game hold
together over a full playthrough**, and **roughly where does its difficulty actually sit**.

```bash
python3 tools/bot/run.py --seed 12345                    # one game
python3 tools/bot/run.py --seed 12345 --headed           # ...and watch it
python3 tools/bot/run.py --seeds 30 --workers 4          # a batch, in parallel
python3 tools/bot/run.py --seed 7012 --trace out.json    # dump every decision it made
python3 tools/bot/run.py --seeds 30 --difficulty easy    # measure Easy mode
python3 tools/bot/autopsy.py --seeds 7002 7006           # why did those games never end?
```

Needs `playwright` + chromium, same as the `run-ambush` skill, which it borrows its driver from.
No other setup; the game is still opened straight off disk over `file://`.

## The three pieces

| File | What it owns |
|---|---|
| `game.py` | Seeing and acting: seeded RNG, the dialog router, board state, safety rails |
| `policy.py` | Deciding: where to walk, what to shoot, when to withdraw |
| `run.py` | One game or many, the outcome table, and per-seed reproduction lines |
| `autopsy.py` | Why a game froze: who could act, and what the game actually offered them |

## The automation seam: the bot never touches the page's markup

Since v2 task 2 (2026-09-19) the bot sees and acts **only** through `window.__mission1Debug`
(the "Automation seam" block in `apps/game/mission1demo.js`):

| Call | What it does |
|---|---|
| `pendingDecision()` | the open dialog as data — `{kind, title, text, buttons:[{id,label,disabled}], rows:[{idx,text,odds}]}` — or `null` |
| `choose(i)` | pick row `i` of the open dialog |
| `press(id)` | a dialog button while a dialog is open, otherwise a board verb (`move`, `fireAimed`, `pass`, `exitMap`, `stance:crouching`, `newRound`, ...) |
| `clickHex(hexId)` | whatever the map offers at that hex: entry placement, or a destination marker |
| `select(soldierId)` | Operations: the soldier the panel acts for |
| `board()` | phase, soldiers, Germans, the VP panel as shown, offered `dests` / `entryHexes`, `verbs {name: enabled}` |
| `dialogLog()` | every dialog presented: `{title, rows, phase}` (pacing.py) |

Every call runs the same handler a player's click runs. **The contract is the shapes above, not
the DOM:** the presentation rewrite changes whatever markup it likes and keeps these answering;
`tools/bot/` does not change. Proof it is outcome-neutral: the task-2 batch on the API matched the
task-1 baselines on every game field, 30/30 on both difficulties, and a game driven by real mouse
clicks instead of the API finished identically.

## Seeded dice, and why they are trustworthy

`Math.random` appears exactly **once** in the whole Mission 1 code path — `d10()` in
`mission1demo.js`. Replacing it via `add_init_script` before the page scripts load therefore makes
every game-relevant roll deterministic with **no production change at all**. Same seed, same game;
verified by running one seed twice and diffing the generated squad.

**The die animation consumes no seeded draws** (v2 task 1, 2026-09-19). `animateDie`'s tumbling
faces come from `crypto.getRandomValues`, which the harness does not replace; the game roll is one
`d10()` drawn before the animation starts. The seeded stream is therefore exactly the sequence of
game rolls, and any presentation change — tick count, delays, skipping or replacing the animation
— is outcome-neutral. (Until then the animation took eight seeded draws per die; the pre-task-1
baselines in `baselines/archive/` were recorded under that coupling and no longer reproduce.)

## Outcomes

| Outcome | Meaning |
|---|---|
| `finished` | Reached a real ending; `VP`/`result` are the game's own |
| `stalemate` | Rounds ran on with nothing able to change — fixed in session 63; now a regression signal, see below |
| `crash` | An exception escaped; `traceback` and `tail` are attached |
| `StuckError` | No legal action available and no dialog open |
| `BudgetExceeded` | Hit the step or wall-clock cap |

**Stalemate was a real game state, not a harness failure — and it is now fixed.** `endRound`
returns to Operations only when no active German remains, and Ending 2 requires the Operations
phase, so a fight that could not be finished also could not be left. Surviving seeds ran to Round
300-500 with one or two Germans alive.

**Cause, found in session 63 (`docs/49_PAID_STANCE_CHANGE.md`): the §6/7 paid stance change was
never implemented.** A wounded soldier never receives a free stance change, and a prone soldier
cannot move, so a soldier who was both had no legal action at all — for the rest of the mission.
`autopsy.py` returned "NO LEGAL ACTION — pass only" on 360 of 360 observed turns across all six
seeds, every one a wounded prone soldier. All 30 seeds now finish on both difficulties. **A
`stalemate` outcome from here on is a new regression, not the known one.**

This history is worth keeping, because the reasoning trap in it is the interesting part. The first
explanation — wounded soldier, no free stance change, falls prone at end of Round, prone cannot
move, squad freezes — was plausible, had rulebook text behind it, and had 27 corroborating runs.
`autopsy.py` refuted it in fifteen minutes: those games showed five *healthy, standing* soldiers on
the entry hexes, and their real cause was a harness bug (the bot could not read `currentActorId`).

Six genuine stalemates survived that fix. Their cause was the original theory, correct all along
for a cohort it had never actually been tested against. So the lesson `autopsy.py` exists for cuts
both ways: run it before believing any theory about why a game will not end — including the theory
that the last autopsy already settled the question.

## What the bot is and is not

It plays to a deliberate strategy: almost every VP in Mission 1 is a §2/1 Activation award, banked
the moment a German is revealed, and Germans are revealed by Paragraph Checks, which fire when a
soldier *enters a hex*. So the scoring move is to walk widely and survive it — not to kill people.
It spreads on entry, advances on the four Ending-1 hexes preferring unvisited ground, closes on
Germans during Rounds (Rounds cannot end otherwise), and withdraws north once the target is banked
or the squad is spent.

It is **competent, not expert**. Its scores are a *floor* on what the mission yields, not a verdict
on it — a human reads terrain, sets up crossfires and manages stance far better than these
heuristics. Read a low win rate as "this is hard", never as "this is impossible".

It also cannot tell you whether the game is *enjoyable* — whether the popup-per-step chain is
satisfying or tedious by Round 4, whether losing feels instructive or arbitrary. That needs a
person.

## Bugs it found on its first outing

All four were real, all are fixed, none were visible to the unit suites:

1. **Ending 1 was unreachable.** `checkEndingConditions()` was never called after an ordinary move,
   so occupying the last of the four required hexes was never noticed — and that is the +4 VP
   scoring ending the whole victory target is scaled from.
2. **A hard game lock.** A German who surrendered, withdrew, or died mid-turn was removed from the
   AR Track, and `finishGermanTurn` then asserted he was still the current actor and threw. The
   Round froze permanently. Three of thirty runs hit it.
3. **Four of seven German activations could never fire.** Paragraph hexes are written in printed
   form (`"T-8"`); `activate_german` converted them but `if_soldiers_can_see` and `pc_check_los`
   did not, so `parseId` returned null and the LOS trace threw — silently aborting the paragraph
   chain mid-flight.
4. **A hexless Event marker crashed the page.** The §6/1 Rounds Event Check belongs to the Round,
   not a hex, so a paragraph placing a marker from there passed null into the map renderer.

If you add a rule and want to know it did not break the whole game, run a batch.

## Measuring a difficulty level

`--difficulty easy` picks Easy on the start screen. Across the same 30 seeds (7000-7029, recorded in
`baselines/`) the automated player wins **13% on Normal and 63% on Easy**, with median VP 3.0 → 6.0
and median casualties 3 → 2. Since the bot is a deliberately mediocre player, read those as floors.

Those figures are from the post-session-63 re-recording, in which **every game finishes**. The
earlier "21% / 75%" was quoted over *finished* games only, while six Normal and two Easy games were
unfinishable; the stalemate fix converted those to finished losses, which moves the denominator
without meaningfully moving the difficulty. Compare like with like — and check `need` before
trusting any stored `result`, since the archived Normal baseline was recorded against a victory
target of 10.

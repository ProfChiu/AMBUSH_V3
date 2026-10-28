# 01 — Presentation spec: the interaction model for v2

What the player sees and does. This replaces v1's `03_UX_SPEC.md` popup law and
`13_MESSAGE_SPEC.md`'s dismissal rules. The engine contract underneath is unchanged.

## 1. One rule

**A press is asked for a decision, never for an acknowledgement.** Everything the engine resolves
is shown, on the board where it happened, and the game moves on. The player stops the flow when
they want to (pause, hover, log), not because the game demands a click.

## 2. Surfaces

| Surface | What lives there |
|---|---|
| **Board** (fixed 1600×900 stage, scaled as one unit) | Map A scan; counters as a persistent layer; selection and reachable-hex shading; LOS lines; tracers; floating die faces; result badges on counters (hit, miss, jam, wounded, KIA, panic); German movement animated hex to hex |
| **Side panel** | Squad roster (stance, wounds, weapon, ammo), VP, Action Round Track, the **radio log**: every resolved event as one line, Paragraph text as a card in the same stream, expandable "why" for German decisions |
| **Decision popup** (the only modal type) | Target selection with hit %, stance, assault Capture/Kill, equipment pick-up/exchange, Give Turn — anything with rows to choose from |
| **Resolution card** (non-modal, anchored near the actor) | One per action; see §3 |
| **Mission start / end** | Difficulty pick, squad generation summary, the ending and VP breakdown |

## 3. The resolution card

One card per action (a shot, a grenade, an assault, a Paragraph Check, an Initiative phase).
Inside it the sub-rolls animate **in sequence without a press**: Jam → To-Hit (with the chart row
and modifiers) → Ammo, or Throw → Scatter → Dud → Damage. Each die animates and lands; each line
shows the table column it was read against (visible dice, kept). A failed check highlights and
holds for a beat; a passed one scrolls by. The card fades when the action is over and its lines
are in the radio log.

- **Same-kind rolls batch.** Initiative is one card with every combatant's die rolling at once,
  then the Action Round Track filling. US Awareness for five soldiers is one card.
- **Speed control** in the HUD: slow / normal / fast, plus hold-Space (or click-and-hold) to
  skip to the next decision. Speed never changes outcomes (see §6).
- **Anything can be re-read** from the radio log; clicking a log line re-shows its card.

## 4. The board as information

- **Hover a hex** (Operations): movement cost from the selected soldier, cover row, whether a
  Paragraph Check is due there, which *known* Germans have LOS to it.
- **Hover a German counter:** hit chance from the selected soldier, his stance and weapon, his
  last stated reason.
- **Select a soldier:** reachable hexes shaded by cover quality; walls and apertures drawn.
- **Fire:** a tracer from shooter to target, the landed die at the target hex, the badge on the
  counter. **German fire** the same way, from his hex to yours.
- **Movement in Operations:** click a destination; the soldier walks the route (the engine's own
  wall-aware pathing, `operationsNextStepForTesting`'s logic). The walk stops only when a
  Paragraph Check yields an event, an activation, or a Special Reaction; quiet hexes produce a
  log line, not a popup.

## 5. What stays modal

Decisions (§2), the Paragraph reveal when it demands a choice (options are rows), mission start
and end. Nothing else.

## 6. Determinism and the bot contract

- **Animation must not consume RNG.** In v1, `animateDie` draws `d10()` once per tick, eight
  draws per die, so any change to animation changes every seeded game. Task 1 in
  `02_HANDOFF.md` separates the animation's tumbling faces from the game RNG. After that, speed
  settings, skipping and batching cannot alter outcomes, and the bot baselines are re-recorded
  once.
- **The bot must stay able to play.** `tools/bot/game.py` currently reads the page through
  selectors: `.dlg-backdrop.open`, `.popup-head span`, `.popup-body`,
  `.popup-foot button[data-btn-id]`, `.target-row` (+ `.target-odds`), `.dest-mark[title]`,
  `.entry-hex[title]`, `.counter[data-soldier-id]`, and calls `window.__mission1Debug`
  (`state()`, `operationsNextStepForTesting`, spawn/move helpers). The rewrite either keeps those
  selectors on the new decision popup or, preferred, exposes a `window.__mission1Debug` action
  API (`pendingDecision()`, `choose(i)`, `press(id)`, `clickHex(id)`) and the bot is switched to
  it in task 2. `pacing.py`'s MutationObserver counts `.dlg-backdrop` open/close transitions;
  it needs the same treatment so the press-per-decision metric survives.

## 7. Style

Reuse the tokens in `docs/mockups/design_system.html` (palette, Staatliches / Inter / IBM Plex
Mono, panel chrome, the die widget). Modern-retro restraint: SSI-era layout, crisp type, no pixel
pastiche, no paper skeuomorphism. The v1 `mission1.html` inline CSS is the starting point for the
side panel; the board layer is new.

## 8. Measures of done

| Measure | v1 | v2 target |
|---|---|---|
| Presses per real decision (dialog presses + board actions ÷ dialog choices + board actions; `pacing.py`) | 5.3 (median, seeds 7000–7005, 2026-09-19; the old "2.4" was an undercount) | ≈ 1.0 |
| Dialogs per game (median, 6 seeds) | 120 | decisions only |
| Longest unbroken acknowledgement run | 31 | 0 |
| Bot outcome parity with baselines after task 1 | — | 30/30 identical |
| Console errors in a live drive | 0 | 0 |
| Wan's playtest: the third firefight, Rounds 3–5, losing reads as instructive | not fun | the point |

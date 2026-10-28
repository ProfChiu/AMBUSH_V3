# 13 — Message Spec (Phase 2 deliverable)

**Date:** 2026-07-28
**Phase:** P2 — Message delivery: the dialog system (see `11_GAME_BUILD_PHASES.md`)
**Built:** `apps/game/dialogharness.html` (shell), `apps/game/ambushdialogs.js` (engine), `apps/game/ambushdemo.js`
(canned demo content). Open `apps/game/dialogharness.html` directly — no server, no build step.

---

## 1. Four interaction patterns, not one

The dialog mockup (`docs/mockups/dialogs.html`) and the UX spec (`03_UX_SPEC.md`) actually describe four
different things that all look like "a box on screen," each with its own rules for when it appears, how
many can be open at once, and how it goes away. Conflating them was the risk; the engine
(`ambushdialogs.js`) keeps them as four independent subsystems:

| Subsystem | Who starts it | How many at once | How it closes |
|---|---|---|---|
| **Dialogs** | The game (rules engine) | One visible; rest queue FIFO | Only via its own button(s) — never backdrop-click, Escape only where explicitly allowed |
| **Popups** | The player | One; opening a new one closes the last | X button, backdrop click, or Escape — always |
| **Toasts** | The game, for low-stakes notices | Many, stacked | Auto-dismiss on a timer, or click to dismiss early |
| **Float** | The player (opens), the game (feeds) | One instance per window id, non-modal | Its own X button; never blocks anything else |

This distinction is the actual Phase 2 finding: message dialogs (paragraph, event, combat, condition,
activation, awareness, confirmation) are things the player must **act on or acknowledge**, so they queue
and never silently disappear. Reference material (Squad Record, Charts, Mission Card, Map Key, Counter
Inspector) is something the player **consults**, so it's always instantly dismissable and never
competes for the queue. Illegal-action errors are frequent and low-stakes, so they're not modal at all.
The dice window is explicitly non-modal per the UX spec's own decision (§ Finalized Design Decisions #7)
so a roll's table stays visible while the player keeps working.

---

## 2. The eight message types (Dialogs queue)

Each type is triggered in the demo by its own console button (`apps/game/dialogharness.html`) and implemented
as a spec object pushed to `AmbushUI.Dialogs.push(...)` in `ambushdemo.js`. All eight share the same
queueing behavior: if one is already open, the new one waits; a "+N queued" badge appears in the open
dialog's header the moment a second message arrives.

| Type | Trigger (eventual, post-engine) | Shape | Dismissal |
|---|---|---|---|
| **paragraph_read** | Entering a hex / reaching a paragraph reference | Italic narrative body, source tag | `[Continue]` only. No Escape, no backdrop-click — the player must read it. |
| **event** | Event Check result | Same shape as paragraph_read, distinguished by header/tag | `[Continue]` only. |
| **combat_resolution** | Any fire/grenade/assault resolution | Attacker/target cards, `[Roll]` inside the body, table with the resolving row highlighted amber, result line | `[Cancel]` (before or after rolling — aborts) or `[Apply]` (disabled until a roll has happened). Escape = Cancel. |
| **condition_change** | Mission Card condition advances | Icon + one-line notice | `[Continue]` only. |
| **activation** | German Action Number called | Icon + big number + one-line notice | `[Continue]` only. |
| **awareness_panic** | Action Round awareness roll (black/red number) | Large die-result number (red if out-of-command panic) + explanation | `[Continue]` only. |
| **confirmation** | Any irreversible player choice (fire, charge assault, etc.) | Plain statement of what will happen | `[Cancel]` / `[Fire]` (label varies by context). Escape = Cancel, backdrop-click = Cancel — the only message type where a "soft" dismissal is safe, because it maps to declining the action. |
| **error** *(not a Dialogs entry — see §3)* | Illegal action attempted | — | — |

Six of the eight ("must acknowledge" types) deliberately block Escape and backdrop-click. Only
`confirmation` allows an easy out, because for that type "dismiss" and "decline" are the same thing —
for the other six, an accidental dismiss would silently skip content the player is entitled to see
(paragraph/event text, a combat result, a panic notice), which the project's "paragraph book stays
hidden except for what's triggered" rule and "visible dice, never silent math" rule both depend on
actually being seen.

`allowEnter` on the spec controls whether Enter activates the current primary (amber) button — on by
default, off for `combat_resolution` so an accidental Enter mid-roll can't apply an unrolled result.

---

## 3. Error / illegal action — a toast, not a dialog

Illegal-action errors ("0 MP remaining", "target out of range," "no line of sight") are frequent during
normal play — every rejected click potentially produces one. Routing them through the modal queue would
mean a few misclicks could bury real narrative content behind a wall of "Continue" clicks. Instead
`AmbushUI.Toasts.show(message)` posts a small dismissible banner (bottom-right, stacked, 4s auto-dismiss
or click-to-dismiss) that never blocks the map or the message queue. This is a Phase 2 design decision,
not something the mockups specified — the mockups predate there being enough interaction to need one.

---

## 4. Reference popups

Squad Record, Charts & Tables, Mission Card (view sleeve), Map Key, and Counter Inspector are built from
`docs/mockups/dialogs.html` / `main_screen.html`, wired to real art from `assets/library/` via hardcoded
paths in `ambushdemo.js` (per the project rule that counters/art come from the asset library, never
composed by hand against `Vassal_images/` or `assets/extracted/`). All five, plus a new **Game Log**
popup that mirrors the on-page live feed, share one `Popups` registry — `AmbushUI.Popups.register(id, buildFn)` —
so opening any one closes whichever was open before. Content is still sample/placeholder data (the
squad roster, mission card conditions): live data binding is a later phase's job once the engine exists.
The Counter Inspector demonstrates both states the UX spec calls for — identified (full stats + IN/PC/
WS/MPA/DS glossary) and unidentified (art shown, stats withheld) — via an in-popup tab rather than two
separate popups.

---

## 5. Dice window

One `AmbushUI.FloatDialogs` instance (`dice`), built once at load and shown/hidden on demand. Draggable
by its title bar, closable, and independent of the message queue — rolling here never competes with or
gets interrupted by a queued dialog. `combat_resolution`'s own in-dialog roll is separate from this
window; the floating window is the general-purpose "roll anything and see the table" tool the UX spec
describes, while the in-dialog roll is specific to the fire-combat message that's already open.

---

## 6. What's demo-only vs. what future phases must supply

- **Paragraph/event body text is placeholder**, clearly tagged `[SAMPLE — ...]`, following the same
  convention the approved M4 mockup used. The paragraph interpreter (Phase 6) is what will call
  `Dialogs.push({id:'paragraph_read', ...})` with real triggered text — the message shape doesn't change.
  This is deliberate: the harness should never be mistaken for a paragraph-book leak.
- **Squad/Mission Card data is a fixed sample roster** (Soldiers A/B/C), not read from any `.TAB` file.
- **Combat resolution's fire table is illustrative** (same three-row table as the mockup) — the real
  Weapon Chart lives in `apps/trainer/ambushdata.js` and will replace it once Phase 9 wires combat.
- **The dialog engine itself (`ambushdialogs.js`) has no dependency on any of the above** — it is the
  reusable piece every later phase calls into. `ambushdemo.js` is disposable scaffolding for this phase's
  approval gate.

---

## 7. Verification performed

- `node --check` clean on `ambushdialogs.js` and `ambushdemo.js`.
- jsdom load of `apps/game/dialogharness.html` with zero console/runtime errors (font-CDN fetch failure is
  expected — no network in the verification sandbox, same caveat noted in every prior trainer review).
- Scripted pass: all eight message-type buttons open and dismiss correctly (including the `Roll` →
  `Apply` gating in combat_resolution); firing three messages at once produces a "+2 queued" badge that
  drains correctly; all six popups open and close without leaking state into each other; the dice float
  window opens, rolls, highlights the correct table row, and closes; the error trigger produces a toast,
  not a modal dialog.
- All thirteen image paths referenced in the demo content resolve to real files under `assets/library/`.
- Not done (no real browser in this sandbox): a visual/eyes-on pass. That is this phase's approval gate,
  same caveat as every trainer session before it.

---

## Gate

User opens `apps/game/dialogharness.html`, clicks through the console on the left, and signs off on how the
game talks to them — the queueing behavior, the toast vs. dialog split, and the popup/float patterns —
before Phase 3 (visual fidelity, with the real map and full-size counters) begins.

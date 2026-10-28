# Ambush! Digital v3 — brief (Gate 0 interview 2026-10-20; signed off by Wan 2026-10-21)

**Goal:** Mission 1 of Ambush! finished to the standard of a modern digital game, carrying over
what worked in PhantomFury (zoom, menu and UI, information dialogs, an extensive tutorial,
animation, high-contrast HUD), with new high-res counters made from pixel art plus procedurally
drawn shapes.

## Lineage
- `../AMBUSH/` v1, frozen 2026-09-18. Source material, data pipeline, historical docs.
- `../AMBUSH_V2/` v2, **frozen 2026-10-20** at its punch list (items 1-3 + Done built; zoom/pan
  and the ring menu not built). Its decisions carry forward (below).
- v3 copies v2's 19 DOM-free rules modules **byte-identical** and replaces the presentation.
  This is not a `_FRAMEWORK` kit port.

## Decisions (Wan, 2026-10-20)
| # | Topic | Decision |
|---|-------|----------|
| 1 | Project | New folder `AMBUSH_V3/`; v2 frozen |
| 2 | Canvas | **Map fills the window** (PF style); the HUD floats over it. Overrides the folder's fixed 1920x1080 rule for this project, as PhantomFury did |
| 3 | Scope | Mission 1, polished. No new missions in the first release |
| 4 | Extras | Title / mission-select screens, settings menu, music, sound effects, animation on active components and transitions |
| 5 | Counter figures | ~~Pixelized~~ **Revised 2026-10-21:** the original scans for now (replaced later), scaled dynamically, on a square Vassal-style counter: drawn backing in the counters' own colours, bevel, the printed letter |
| 6 | Counter data | **Revised 2026-10-21:** status follows v2 exactly (crouch scan for crouching/prone, wounded tint, out-of-action grey, selected/acting outline, result badges; stance, wounds, weapon, ammo in the roster). Only the counter's look changes |
| 7 | Map | The scan v2 plays on, `map_a_tactical.png` (5336x4850; the hex grid is calibrated to it), scaled dynamically. `map_a.png` (6900x5100) is not on the grid |
| 8 | Tutorial guide | **Sgt June Whitaker**, from `__SCAD/_CLAUDE/_ASSETS/Characters/WW2/Allies/` (56 sprites); used sprites are copied into `assets/characters/` |
| 9 | German voice | **Major Hedwig Kranz** cameos voice the German AI's `reason` fields ("show the machinery" as a character) |
| 10 | Style | Pixelized human GIs on the counters, cat characters as the presenters. Both kept on purpose |
| 11 | Zoom | Four fixed levels, PF style: wheel notch = one level toward the cursor, keys 1-4, +/-; Close = scan at 1:1 |
| 12 | Orders | **Ring menu** of verbs around the selected soldier; greyed verbs explain why in the engine's words. Menu strip + popups for log, squad, settings |
| 13 | Tutorial | PF's chess order, adapted: 1 Watch a fight under way, 2 The soldier and his card, 3 The map (terrain, LOS), 4 Drills (move, fire, Snap Fire, grenades), 5 The Germans and the paragraph book, 6 A full turn. Puzzles with refusals, debriefs, Back to re-read, chapter ticks |
| 14 | Audio | Free CC0 packs (Kenney, OpenGameArt, freesound CC0) that Wan downloads into `assets/audio/`; Claude wires and mixes them |
| 15 | Theme | PF's dark HUD, retuned to olive drab and amber: near-black panels, bright accents, large type |
| 16 | Carried from v2 | Results resolve on the board (a press is a decision; target ~1.0 presses per decision via `pacing.py`); right-click inspect / right-drag pan; reading-time result cards with Done; **bot parity 30/30** against the seeded baselines |
| 17 | First-playable animation | Soldiers walk the path (camera follows); fire + hit effects (tracer, flash, shake, wound stamp); rolling dice in a tray with the table row lit; screen transitions (title, turn/phase banners, menus, cameos) |

## Phases (one per session, with a check-in after each)
1. **Counter art test** (revised 2026-10-21). Square Vassal-style counters from the original
   scans, every soldier in every v2 state on a test board at all four zoom levels
   (`apps/v3/counter_test.html`). Soldiers only; mission scope = v2's. Wan signs off the look.
2. **Scaffold + shell.** (built 2026-10-21, `apps/v3/index.html`) Copy the engine, 17 suites and bot; title, mission select, settings;
   the stage that fills the window; four-level zoom; dark HUD; audio engine with placeholders.
3. **Mission 1 on the new stage.** Ring menu, right-click inspect, result cards, results on the
   board. Gates: parity 30/30 on Normal + Easy, pacing at ~1.0, a clean live drive.
4. **Animation pass.** Walk, fire/hit, dice tray, transitions, Kranz cameos.
5. **Audio.** CC0 packs wired, mixed, volume in settings.
6-8. **Tutorial**: port PF's Director (camera, spotlight, bubble, guide), then chapters 1-6. (Phase 6 built 2026-10-23: `director.js`, `lesson.js`, `lessons.js`; Basic Training proof lesson; `tools/live_lesson.py`.) (Phase 7a built 2026-10-23: chapter 1 watch-and-predict on fixture `roundFour`, chapter 2 card + puzzles; `tools/live_chapters.py`. Phase 7b built 2026-10-23: chapter 3 the map on fixture `roundThree`, seed 31: map-click puzzles answered from the engine's facts, sight lines drawn; `tools/live_map.py`.) (Phase 8a built 2026-10-24: chapter 4 Drills on fixture `roundFour`, seed 41: move, aimed fire, grenade, assault, each the player's clicks, capture-or-kill included; `tools/live_drills.py`.) (Phase 8b built 2026-10-24: chapter 5 the Germans and the paragraph book on `roundFour`, seed 51, watch-and-predict; `tools/live_germans.py`. Chapter 6 deferred until Mission 1's paragraph-data gaps are fixed.)
9. **Polish + release.** Full play-through, `bump-version`.

## Open items
- (Closed 2026-10-23) Whitaker's 10 head-and-shoulders portraits cover every Director pose.
- (Closed 2026-10-21) No pixelizing; soldiers only for now. Vehicles, weapons and markers keep v2's art.
- (Closed 2026-10-21) The folder `CLAUDE.md` now names v3 as Ambush's current version and lists
  its canvas exception.

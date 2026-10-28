/*
 * ar_track.js — the AR Track chart (§6/1 Action Sequence)
 *
 * Hand-transcribed, not compiled — see assets/extracted/reference/action_round_track.png
 * (upscaled 6x for legibility). Every IN column's die results (0-9) cover the digits 0-9
 * exactly once across its 2-Turn/1-Turn/Panic spaces; the IN 3 out-of-command red set
 * {6,7,9} and IN 1 panic set {1} verified against the rulebook's own §6/4 worked examples.
 *
 * Originally transcribed into apps/trainer/ambushdata.js (Lesson 6). Relocated here as of
 * docs/23_ACTION_ROUND_SCHEDULER.md so apps/game/arscheduler.js (the real engine) and the
 * trainer share one source instead of two hand-copies that could silently drift out of sync
 * if this table is ever corrected. Do not hand-edit without re-checking against the source
 * chart image — this is manually transcribed data, not derived from anything else on disk.
 *
 * Shape: { [IN 0-5]: { twoTurn:[...], twoTurnRed:[...], oneTurn:[...], oneTurnRed:[...],
 * panic:[...] } } — die results 0-9 that land in each space for that Initiative column, with
 * the red-printed subset called out separately (red-ness only matters for US soldiers out of
 * command, §6/1 "Red Number" / §6/4 Panic).
 */
window.AMBUSH_AR_TRACK = {
  0: { twoTurn: [9], twoTurnRed: [9], oneTurn: [1, 3, 4, 5, 6, 7, 8], oneTurnRed: [1, 4, 6, 8], panic: [0, 2] },
  1: { twoTurn: [4, 6], twoTurnRed: [4], oneTurn: [0, 2, 3, 5, 7, 8, 9], oneTurnRed: [3, 7], panic: [1] },
  2: { twoTurn: [3, 5, 8], twoTurnRed: [3, 8], oneTurn: [0, 1, 2, 4, 6, 7, 9], oneTurnRed: [0, 2], panic: [] },
  3: { twoTurn: [1, 2, 7, 9], twoTurnRed: [7, 9], oneTurn: [0, 3, 4, 5, 6, 8], oneTurnRed: [6], panic: [] },
  4: { twoTurn: [0, 2, 5, 6, 7], twoTurnRed: [2, 5], oneTurn: [1, 3, 4, 8, 9], oneTurnRed: [], panic: [] },
  5: { twoTurn: [0, 1, 3, 4, 5, 8], twoTurnRed: [], oneTurn: [2, 6, 7, 9], oneTurnRed: [], panic: [] },
};

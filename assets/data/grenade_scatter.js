/*
 * grenade_scatter.js — the Grenade/Satchel Charge Scatter Diagrams (§10/3)
 *
 * Transcribed from assets/library/reference/grenadechart.png (the same chart image that also
 * carries the Clear Jammed Weapon Chart — see docs/26_GRENADES.md for that side-effect finding).
 * The rulebook's two diagrams: "Diagram A" (the default — one hex directly opposite the throw
 * direction) and "Diagram B" (used only when "the LOS from the thrower's hex to the target hex
 * exactly bisects the two hexes adjacent to the target hex" — the throw direction splits evenly
 * between two neighbors instead of pointing at one).
 *
 * Encoded as offsets (0-5) from the "direction of throw" hex, walking the ring of the target's
 * six neighbors in a FIXED rotational sense — offset 0 is the direction-of-throw hex itself
 * (Diagram A) or the first of its two split hexes (Diagram B, paired with offset 1).
 *
 * That rotational sense (which way around the ring "offset 1, 2, 3..." goes) is not a guess: it
 * was checked against apps/game/hexgrid.js's actual neighbor() index order using real
 * hexToPixel() pixel coordinates (increasing neighbor index sweeps counterclockwise on the
 * rendered map, confirmed numerically, not assumed from the chart image alone) — see
 * apps/game/grenaderules.js's resolveScatter and docs/26_GRENADES.md. The starting assignment
 * (which physical neighbor the chart calls "0" vs "1" etc.) is a best-effort reading of the
 * printed diagram; the rulebook gives no worked example pinning a specific roll to a specific
 * resulting hex to verify that assignment against. Diagram B is also, empirically, unreachable
 * within any real grenade/satchel throw distance (1-6 hexes) anywhere on Map A — see docs/26 —
 * so this is the one piece of this file that has never been exercised by a real throw.
 */
window.AMBUSH_GRENADE_SCATTER = {
  diagramA: [
    { offset: 0, rolls: [6, 7, 8, 9] }, // direction of throw
    { offset: 1, rolls: [0] },
    { offset: 2, rolls: [1] },
    { offset: 3, rolls: [2, 3] },
    { offset: 4, rolls: [4] },
    { offset: 5, rolls: [5] },
  ],
  diagramB: [
    { offset: 0, rolls: [6, 7] }, // direction of throw, first half
    { offset: 1, rolls: [8, 9] }, // direction of throw, second half
    { offset: 2, rolls: [0] },
    { offset: 3, rolls: [1, 2] },
    { offset: 4, rolls: [3, 4] },
    { offset: 5, rolls: [5] },
  ],
};

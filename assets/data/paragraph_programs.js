/*
 * paragraph_programs.js — Phase 6 hand-annotated paragraph programs (docs/20_PARAGRAPH_INTERPRETER.md)
 *
 * Hand-authored, not compiled — this is the actual annotation work the spike
 * (docs/18_DATA_LAYER_SPIKE.md §5) said sizes the interpreter, not something a script can
 * derive from prose. Covers Mission 1's full reachable paragraph set as computed from
 * assets/data/mission_cards.json across all 4 conditions (72 numbers; paragraph 613 doesn't
 * exist in assets/data/paragraphs.json — a real gap in the printed booklet's own numbering,
 * not a bug here). Cross-checked against the actual paragraph text every time, not invented.
 *
 * A paragraph with no further mechanical instructions beyond its own display text (pure
 * flavor, or a check/effect that doesn't route to another paragraph — see the note on 11/12
 * below) gets an empty array, not omitted — omission would be indistinguishable from "not
 * annotated yet".
 *
 * Known, documented gaps (not silently glossed over):
 * - 11, 12: have a check/random effect but no "see N" — no paragraph branching to encode, so
 *   the check itself isn't represented as an op in this pass (nothing here depends on it).
 * - 90: "place landmarks... north and northwest of your current position" — no fixed hex, so
 *   place_landmark has no hex; a real UI needs to ask the player which hexes.
 * - 195: branches on whether the triggering soldier is on/under a bridge — since Phase 8c an
 *   `if_mover` op; the engine has no under-the-bridge position, so at M5 (its only cell)
 *   neither branch applies and nothing happens.
 * - 328, 453: mission-end-conditional VP awards / landmark-triggered future paragraphs aren't
 *   "what happens when this paragraph is read" — out of scope for a per-paragraph interpreter.
 * - 608 item 2: "see 290 if in Clear terrain, see 326 otherwise" — `if_mover` in_clear (Phase 8c).
 * - Phase 8c (2026-10-25) closed docs/PARAGRAPH_DATA_GAPS.md: the 18 (then 21) paragraphs the
 *   chains reached with no program are written (section at the end), and the contact
 *   paragraphs' advantage / automatic awareness / 2 turns are a `contact` op plus
 *   `receivesTwoTurns` on activate_german. `node tools/audit_paragraphs.js` re-checks all of it.
 * - Every german-activation paragraph is annotated with commenceRounds:true regardless of
 *   whether that paragraph's own text says "Commence Rounds" explicitly (some, like 452,
 *   don't) — §6's own text says activating a German always starts Rounds, so the rule wins
 *   over incidental phrasing differences between paragraphs.
 */
window.AMBUSH_PARAGRAPH_PROGRAMS = {
  "1": [{ op: "run_procedure", name: "minefield" }],
  "11": [],
  "12": [],
  "18": [],
  "24": [{ op: "place_event_marker" },
    { op: "check", kind: "pc", modifier: -1, onSuccess: [{ op: "goto", target: "13" }] }],
  "25": [{ op: "place_event_marker" },
    { op: "check", kind: "pc", modifier: -1, onSuccess: [{ op: "goto", target: "7" }] }],
  "26": [{ op: "pc_check_los", hex: "U-9", mode: "highest",
    onSuccess: [{ op: "goto", target: "7" }] }],
  "27": [],
  "28": [{ op: "pc_check_los", hex: "O-12", mode: "highest",
    onSuccess: [{ op: "goto", target: "10" }] }],
  "29": [],
  "30": [{ op: "pc_check_los", hex: "D-17", mode: "highest",
    onSuccess: [{ op: "goto", target: "13" }] }],
  "90": [{ op: "place_landmark" }],
  "179": [{ op: "check", kind: "activation", modifier: 2,
    onSuccess: [{ op: "goto", target: "288" }], onFail: [{ op: "goto", target: "310" }] }],
  "181": [{ op: "roll_die", branches: [
    { lo: 0, hi: 5, then: [{ op: "check", kind: "activation", modifier: 3, onSuccess: [{ op: "goto", target: "20" }] }] },
    { lo: 6, hi: 8, then: [] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: -1, onSuccess: [{ op: "goto", target: "289" }] }] },
  ] }],
  "182": [{ op: "check", kind: "activation", modifier: 1,
    onSuccess: [{ op: "goto", target: "291" }], onFail: [{ op: "goto", target: "313" }] }],
  // The following activate_german gaps (183, 187, 289, 294, 297, 298, 316, 324, 331, 333, 334,
  // 337, 602) were found the same way as 312 above (2026-08-05): real, live goto targets within
  // Mission 1's own reachable set that had no program at all, so their German activation silently
  // never fired. Same annotation approach throughout: one activate_german op per distinct hex
  // (a paragraph activating several Germans in different hexes needs one op each), conditionChange
  // on the last op when the text says "Go to Condition N", and a bespoke note for the
  // advantage/awareness/turn-count narrative text that isn't mechanically modeled — real Rounds
  // resolution (arscheduler.js's Initiative roll + AR Track placement) determines that instead.
  "183": [
    { op: "activate_german", ids: ["25"], hex: "M-7", stance: "crouching", commenceRounds: true, receivesTwoTurns: true, conditionChange: 3 },
    { op: "contact", advantage: "german" },
  ],
  "184": [{ op: "roll_die", branches: [
    { lo: 0, hi: 4, then: [{ op: "if_sighting", sightings: ["2"], state: "not_occurred",
      then: [{ op: "check", kind: "activation", modifier: 3, onSuccess: [{ op: "goto", target: "20" }] }] }] },
    { lo: 5, hi: 8, then: [{ op: "if_sighting", sightings: ["3"], state: "not_occurred",
      then: [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "293" }] }] }] },
    { lo: 9, hi: 9, then: [{ op: "if_sighting", sightings: ["2"], state: "not_occurred",
      then: [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "289" }] }] }] },
  ] }],
  "185": [{ op: "check", kind: "activation", modifier: 1,
    onSuccess: [{ op: "goto", target: "294" }],
    onFail: [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "316" }] }] }],
  "186": [{ op: "roll_die", branches: [
    { lo: 0, hi: 2, then: [{ op: "check", kind: "activation", modifier: 0, onSuccess: [{ op: "goto", target: "288" }] }] },
    { lo: 3, hi: 8, then: [] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: -1, onSuccess: [{ op: "goto", target: "289" }] }] },
  ] }],
  "187": [
    { op: "activate_german", ids: ["34"], hex: "M-5", stance: "crouching", commenceRounds: true },
    { op: "activate_german", ids: ["25"], hex: "M-7", stance: "crouching", commenceRounds: true },
    { op: "activate_german", ids: ["53"], hex: "O-4", stance: "crouching", commenceRounds: true, conditionChange: 3 },
    { op: "contact", advantage: "US" },
  ],
  "189": [{ op: "check", kind: "activation", modifier: 2,
    onSuccess: [{ op: "goto", target: "334" }],
    onFail: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "298" }] }] }],
  "190": [{ op: "check", kind: "activation", modifier: 2,
    onSuccess: [{ op: "goto", target: "324" }],
    onFail: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "289" }] }] }],
  "191": [{ op: "roll_die", branches: [
    { lo: 0, hi: 3, then: [{ op: "check", kind: "activation", modifier: 0, onSuccess: [{ op: "goto", target: "288" }] }] },
    { lo: 4, hi: 8, then: [{ op: "if_sighting", sightings: ["3"], state: "not_occurred",
      then: [{ op: "check", kind: "pc", modifier: -1, onSuccess: [{ op: "goto", target: "293" }] }] }] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "289" }] }] },
  ] }],
  "192": [{ op: "roll_die", branches: [
    { lo: 0, hi: 5, then: [{ op: "check", kind: "activation", modifier: 2, onSuccess: [{ op: "goto", target: "337" }] }] },
    { lo: 6, hi: 8, then: [] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "602" }] }] },
  ] }],
  "193": [{ op: "roll_die", branches: [
    { lo: 0, hi: 3, then: [{ op: "check", kind: "activation", modifier: 1, onSuccess: [{ op: "goto", target: "338" }] }] },
    { lo: 4, hi: 8, then: [] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: -1, onSuccess: [{ op: "goto", target: "602" }] }] },
  ] }],
  "195": [{ op: "if_mover", test: "on_bridge", then: [{ op: "goto", target: "190" }],
    else: [{ op: "if_mover", test: "under_bridge", then: [{ op: "goto", target: "186" }] }] }],
  "196": [{ op: "roll_die", branches: [
    { lo: 0, hi: 4, then: [{ op: "check", kind: "activation", modifier: 2, onSuccess: [{ op: "goto", target: "291" }] }] },
    { lo: 5, hi: 8, then: [{ op: "if_sighting", sightings: ["8"], state: "not_occurred",
      then: [{ op: "check", kind: "pc", modifier: 0,
        onSuccess: [{ op: "goto", target: "342" }], onFail: [{ op: "place_event_marker" }] }] }] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "312" }] }] },
  ] }],
  "198": [
    { op: "if_sighting", sightings: ["5", "6"], state: "occurred", mode: "all", then: [] },
    { op: "if_sighting", sightings: ["5"], state: "occurred", mode: "any", then: [{ op: "goto", target: "318" }] },
    { op: "if_sighting", sightings: ["6"], state: "occurred", mode: "any", then: [{ op: "goto", target: "603" }] },
    { op: "if_sighting", sightings: ["5", "6"], state: "not_occurred", mode: "all", then: [{ op: "goto", target: "189" }] },
  ],
  "199": [
    { op: "if_sighting", sightings: ["2", "6"], state: "occurred", mode: "all", then: [] },
    { op: "if_sighting", sightings: ["2"], state: "occurred", mode: "any", then: [{ op: "goto", target: "318" }] },
    { op: "if_sighting", sightings: ["6"], state: "occurred", mode: "any", then: [{ op: "goto", target: "335" }] },
    { op: "if_sighting", sightings: ["2", "6"], state: "not_occurred", mode: "all", then: [{ op: "goto", target: "318" }] },
  ],
  "289": [
    { op: "activate_german", ids: ["9", "15"], hex: "K-13", stance: "standing", commenceRounds: true, conditionChange: 3 },
    { op: "contact", advantage: "US", checkerAware: true, awareUsTwoTurns: true },
  ],
  "290": [{ op: "check", kind: "activation", modifier: 2,
    onSuccess: [{ op: "goto", target: "297" }],
    onFail: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "333" }] }] }],
  "292": [
    { op: "if_sighting", sightings: ["3"], state: "occurred", then: [{ op: "goto", target: "314" }] },
    { op: "if_sighting", sightings: ["3"], state: "not_occurred", then: [
      { op: "place_event_marker" },
      { op: "check", kind: "pc", modifier: -1, onSuccess: [{ op: "goto", target: "314" }] },
    ] },
  ],
  "294": [
    { op: "activate_german", ids: ["25"], hex: "M-7", stance: "standing", commenceRounds: true },
    { op: "activate_german", ids: ["34"], hex: "M-5", stance: "standing", commenceRounds: true, conditionChange: 3 },
    { op: "contact", advantage: "german" },
  ],
  "295": [{ op: "check", kind: "activation", modifier: 1,
    onSuccess: [{ op: "goto", target: "183" }],
    onFail: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "312" }] }] }],
  "296": [
    { op: "if_sighting", sightings: ["5"], state: "occurred", then: [{ op: "goto", target: "182" }] },
    { op: "if_sighting", sightings: ["5"], state: "not_occurred", then: [
      { op: "check", kind: "activation", modifier: 0,
        onSuccess: [{ op: "goto", target: "294" }], onFail: [{ op: "goto", target: "316" }] },
    ] },
  ],
  "297": [
    { op: "activate_german", ids: ["53"], hex: "O-4", stance: "crouching", commenceRounds: true, conditionChange: 2 },
    { op: "contact", advantage: "german" },
  ],
  "298": [
    { op: "activate_german", ids: ["34"], hex: "M-5", stance: "crouching", commenceRounds: true },
    { op: "activate_german", ids: ["53"], hex: "O-4", stance: "crouching", commenceRounds: true, conditionChange: 2 },
    { op: "contact", advantage: "US" },
  ],
  "299": [{ op: "roll_die", branches: [
    { lo: 0, hi: 3, then: [{ op: "check", kind: "activation", modifier: 1, onSuccess: [{ op: "goto", target: "288" }] }] },
    { lo: 4, hi: 8, then: [] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "289" }] }] },
  ] }],
  "311": [{ op: "roll_die", branches: [
    { lo: 0, hi: 3, then: [{ op: "check", kind: "activation", modifier: 2, onSuccess: [{ op: "goto", target: "23" }] }] },
    { lo: 4, hi: 8, then: [] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: -1, onSuccess: [{ op: "goto", target: "312" }] }] },
  ] }],
  // REAL GAP FOUND (2026-08-05, real user report): "312" is a live goto target from both 311
  // (roll 9, PC check -1) and 315 (roll 9, PC check -2) but had no program of its own — the
  // German activation its own text requires ("[s2] Activate German 25 in hex M-7, standing...
  // Go to Condition 3") silently never fired. "US advantage" and "the PC-checking soldier is
  // automatically aware, aware+non-panicked soldiers get 2 turns this Round" are flagged
  // `bespoke`, not modeled — real Rounds resolution (arscheduler.js's Initiative roll + AR Track
  // placement) determines advantage/turn allocation mechanically instead of this paragraph's
  // scripted override, a deliberate judgment call rather than building a parallel path.
  "312": [
    { op: "activate_german", ids: ["25"], hex: "M-7", stance: "standing", commenceRounds: true, conditionChange: 3 },
    { op: "contact", advantage: "US", checkerAware: true, awareUsTwoTurns: true },
  ],
  "315": [{ op: "roll_die", branches: [
    { lo: 0, hi: 8, then: [{ op: "place_event_marker" }] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "312" }] }] },
  ] }],
  "316": [
    { op: "activate_german", ids: ["25"], hex: "M-7", stance: "crouching", commenceRounds: true },
    { op: "activate_german", ids: ["34"], hex: "M-5", stance: "crouching", commenceRounds: true, conditionChange: 3 },
    { op: "contact", advantage: "US", checkerAware: true },
  ],
  "317": [{ op: "check", kind: "activation", modifier: 1,
    onSuccess: [{ op: "goto", target: "331" }], onFail: [{ op: "goto", target: "187" }] }],
  "318": [{ op: "check", kind: "activation", modifier: 1,
    onSuccess: [{ op: "goto", target: "332" }], onFail: [{ op: "goto", target: "188" }] }],
  "324": [
    { op: "activate_german", ids: ["9", "15"], hex: "K-13", stance: "crouching", commenceRounds: true, conditionChange: 3 },
    { op: "contact", advantage: "german" },
  ],
  "325": [{ op: "roll_die", branches: [
    { lo: 0, hi: 3, then: [{ op: "check", kind: "activation", modifier: 2, onSuccess: [{ op: "goto", target: "23" }] }] },
    { lo: 4, hi: 8, then: [] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "289" }] }] },
  ] }],
  "326": [{ op: "roll_die", branches: [
    { lo: 0, hi: 3, then: [{ op: "check", kind: "activation", modifier: 1, onSuccess: [{ op: "goto", target: "297" }] }] },
    { lo: 4, hi: 8, then: [] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: 2, onSuccess: [{ op: "goto", target: "333" }] }] },
  ] }],
  "328": [],
  "329": [{ op: "place_event_marker" },
    { op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "7" }] }],
  "330": [{ op: "check", kind: "activation", modifier: 3,
    onSuccess: [{ op: "goto", target: "294" }],
    onFail: [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "316" }] }] }],
  "331": [
    { op: "activate_german", ids: ["25"], hex: "M-7", stance: "crouching", commenceRounds: true },
    { op: "activate_german", ids: ["34"], hex: "M-5", stance: "crouching", commenceRounds: true, receivesTwoTurns: true },
    { op: "activate_german", ids: ["53"], hex: "O-4", stance: "crouching", commenceRounds: true, conditionChange: 2 },
    { op: "contact", advantage: "german" },
  ],
  "333": [
    { op: "activate_german", ids: ["53"], hex: "O-4", stance: "standing", commenceRounds: true, conditionChange: 2 },
    { op: "contact", advantage: "US", checkerAware: true, awareUsTwoTurns: true },
  ],
  "334": [
    { op: "activate_german", ids: ["34"], hex: "M-5", stance: "crouching", commenceRounds: true },
    { op: "activate_german", ids: ["53"], hex: "O-4", stance: "crouching", commenceRounds: true, conditionChange: 2 },
    { op: "contact", advantage: "german" },
  ],
  "335": [{ op: "check", kind: "activation", modifier: 3,
    onSuccess: [{ op: "goto", target: "183" }],
    onFail: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "312" }] }] }],
  "336": [{ op: "check", kind: "activation", modifier: 1,
    onSuccess: [
      { op: "if_sighting", sightings: ["5"], state: "occurred", then: [{ op: "goto", target: "183" }] },
      { op: "if_sighting", sightings: ["5"], state: "not_occurred", then: [{ op: "goto", target: "294" }] },
    ],
    onFail: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [
      { op: "if_sighting", sightings: ["5"], state: "occurred", then: [{ op: "goto", target: "312" }] },
      { op: "if_sighting", sightings: ["5"], state: "not_occurred", then: [{ op: "goto", target: "316" }] },
    ] }] }],
  "337": [
    { op: "activate_german", ids: ["34"], hex: "M-5", stance: "crouching", commenceRounds: true, receivesTwoTurns: true },
    { op: "contact", advantage: "german" },
  ],
  "339": [{ op: "check", kind: "pc", modifier: 0,
    onSuccess: [{ op: "goto", target: "342" }], onFail: [{ op: "place_event_marker" }] }],
  "340": [{ op: "check", kind: "activation", modifier: 0,
    onSuccess: [{ op: "goto", target: "291" }], onFail: [{ op: "goto", target: "313" }] }],
  "341": [{ op: "pc_check_los", hex: "R-2", mode: "all", modifier: -2,
    onSuccess: [{ op: "goto", target: "606" }], onFail: [{ op: "goto", target: "197" }], onNone: [] }],
  "343": [
    { op: "if_sighting", sightings: ["2", "5"], state: "occurred", mode: "all", then: [] },
    { op: "if_sighting", sightings: ["2"], state: "occurred", mode: "any", then: [{ op: "goto", target: "603" }] },
    { op: "if_sighting", sightings: ["5"], state: "occurred", mode: "any", then: [{ op: "goto", target: "182" }] },
    { op: "if_sighting", sightings: ["5", "2"], state: "not_occurred", mode: "all", then: [{ op: "goto", target: "330" }] },
  ],
  "344": [
    { op: "if_sighting", sightings: ["2", "5"], state: "occurred", mode: "all", then: [] },
    { op: "if_sighting", sightings: ["2"], state: "occurred", mode: "any", then: [{ op: "goto", target: "192" }] },
    { op: "if_sighting", sightings: ["5"], state: "occurred", mode: "any", then: [{ op: "goto", target: "335" }] },
    { op: "if_sighting", sightings: ["5", "2"], state: "not_occurred", mode: "all", then: [{ op: "goto", target: "330" }] },
  ],
  "345": [{ op: "run_procedure", name: "minefield" },
    { op: "if_sighting", sightings: ["6"], state: "not_occurred", then: [
      { op: "check", kind: "activation", modifier: 1, onSuccess: [{ op: "goto", target: "297" }] },
    ] }],
  "346": [{ op: "if_german_removed_once", germanId: "34", then: [{ op: "goto", target: "611" }] }],
  "347": [{ op: "if_soldiers_can_see", hex: "T-8", then: [
    { op: "activate_german", ids: ["25"], hex: "T-8", stance: "crouching", commenceRounds: true, specialReaction: "B" },
  ] }],
  "348": [],
  "351": [{ op: "activate_german", ids: ["34"], hex: "M-6", stance: "crouching", commenceRounds: true }],
  "450": [{ op: "pc_check_los", hex: "M-10", mode: "all", modifier: -2,
    onSuccess: [{ op: "goto", target: "606" }], onFail: [{ op: "goto", target: "197" }], onNone: [] }],
  "451": [{ op: "if_german_removed_once", germanId: "53", then: [{ op: "goto", target: "452" }] }],
  "452": [{ op: "if_soldiers_can_see", hex: "T-8", then: [
    { op: "activate_german", ids: ["53"], hex: "T-8", stance: "crouching", commenceRounds: true, specialReaction: "B" },
  ] }],
  "453": [{ op: "place_landmark", hex: "R-15" }],
  "455": [{ op: "pc_check_los", hex: "M-5", mode: "all", modifier: -2,
    onSuccess: [{ op: "goto", target: "602" }], onFail: [{ op: "goto", target: "338" }], onNone: [] }],
  "456": [{ op: "check", kind: "activation", modifier: -1,
    onSuccess: [{ op: "goto", target: "337" }], onFail: [{ op: "goto", target: "194" }] }],
  "600": [{ op: "check", kind: "pc", modifier: 0,
    onSuccess: [{ op: "goto", target: "293" }], onFail: [{ op: "place_event_marker" }] }],
  "601": [{ op: "check", kind: "activation", modifier: 3,
    onSuccess: [
      { op: "if_sighting", sightings: ["5"], state: "occurred", then: [{ op: "goto", target: "183" }] },
      { op: "if_sighting", sightings: ["5"], state: "not_occurred", then: [{ op: "goto", target: "294" }] },
    ],
    onFail: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [
      { op: "if_sighting", sightings: ["5"], state: "occurred", then: [{ op: "goto", target: "312" }] },
      { op: "if_sighting", sightings: ["5"], state: "not_occurred", then: [{ op: "goto", target: "316" }] },
    ] }] }],
  "602": [
    { op: "activate_german", ids: ["34"], hex: "M-5", stance: "standing", commenceRounds: true },
    { op: "contact", advantage: "US", checkerAware: true },
  ],
  "603": [{ op: "check", kind: "activation", modifier: 2,
    onSuccess: [{ op: "goto", target: "337" }], onFail: [{ op: "goto", target: "194" }] }],
  "604": [{ op: "check", kind: "pc", modifier: -2,
    onSuccess: [{ op: "goto", target: "342" }], onFail: [{ op: "place_event_marker" }] }],
  "605": [{ op: "run_procedure", name: "minefield" },
    { op: "if_sighting", sightings: ["2"], state: "not_occurred", then: [
      { op: "check", kind: "activation", modifier: 1,
        onSuccess: [{ op: "goto", target: "291" }], onFail: [{ op: "goto", target: "313" }] },
    ] }],
  "607": [{ op: "roll_die", branches: [
    { lo: 0, hi: 3, then: [{ op: "check", kind: "activation", modifier: 0, onSuccess: [{ op: "goto", target: "291" }] }] },
    { lo: 4, hi: 8, then: [] },
    { lo: 9, hi: 9, then: [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "312" }] }] },
  ] }],
  "608": [
    { op: "if_sighting", sightings: ["2", "6"], state: "occurred", mode: "all", then: [] },
    { op: "if_sighting", sightings: ["2"], state: "occurred", mode: "any",
      then: [{ op: "if_mover", test: "in_clear", then: [{ op: "goto", target: "290" }], else: [{ op: "goto", target: "326" }] }] },
    { op: "if_sighting", sightings: ["6"], state: "occurred", mode: "any", then: [{ op: "goto", target: "182" }] },
    { op: "if_sighting", sightings: ["2", "6"], state: "not_occurred", mode: "all", then: [{ op: "goto", target: "182" }] },
  ],
  "609": [
    { op: "if_sighting", sightings: ["5", "6"], state: "occurred", mode: "all", then: [] },
    { op: "if_sighting", sightings: ["5"], state: "occurred", mode: "any", then: [{ op: "goto", target: "290" }] },
    { op: "if_sighting", sightings: ["6"], state: "occurred", mode: "any", then: [{ op: "goto", target: "192" }] },
    { op: "if_sighting", sightings: ["5", "6"], state: "not_occurred", mode: "all", then: [{ op: "goto", target: "189" }] },
  ],
  "610": [{ op: "if_german_removed_once", germanId: "25", then: [{ op: "goto", target: "347" }] }],
  "611": [{ op: "if_soldiers_can_see", hex: "T-8", then: [
    { op: "activate_german", ids: ["34"], hex: "T-8", stance: "crouching", commenceRounds: true, specialReaction: "B", conditionChange: 4 },
  ] }],
  "612": [{ op: "if_soldiers_can_see", hex: "Q-11",
    then: [{ op: "activate_german", ids: ["1", "81"], hex: "Q-11", stance: "crouching", commenceRounds: true, specialReaction: "A" }],
    else: [{ op: "if_soldiers_can_see", hex: "X-7",
      then: [{ op: "activate_german", ids: ["1", "81"], hex: "X-7", stance: "crouching", commenceRounds: true, specialReaction: "A" }] }] }],
  // Empty by explicit user direction (2026-08-05) — see the placeholder text in paragraphs.js for
  // why. Same shape as 328's "text exists, nothing mechanical happens" pattern.
  "613": [],
  "615": [{ op: "activate_german", ids: ["34"], hex: "N-4", stance: "crouching", commenceRounds: true }],

  // ---- Phase 8c (2026-10-25): paragraphs the chains reached with no program --------------
  // docs/PARAGRAPH_DATA_GAPS.md §1. Written from the errata booklet where it has the page
  // (7, 10, 13, 20, 23, 288: source/converted/Ambush_Paragraph_Booklet_Pages_with_Errata_v1.md);
  // the rest from the ToolBox text (assets/data/paragraphs.js), whose booklet pages are not on
  // file — listed in that doc for a re-check once they are.
  "7": [],   // It must have been the wind.
  "10": [],  // False alarm.
  "13": [],  // Just your imagination.
  // "One soldier is fired upon by a hidden rifleman, Rounds do not commence." Aimed, short
  // range, bolt rifle with scope, Weapon Skill 0. The soldier is the one who triggered it.
  "20": [{ op: "hidden_fire", fireType: "aimed", range: "short", weaponId: "scope", weaponSkill: 0 }],
  "23": [{ op: "hidden_fire", fireType: "aimed", range: "short", weaponId: "scope", weaponSkill: 0 }],
  "180": [
    { op: "activate_german", ids: ["9", "15"], hex: "K-13", stance: "crouching", commenceRounds: true, receivesTwoTurns: true, conditionChange: 3 },
    { op: "contact", advantage: "german" },
  ],
  "188": [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "333" }], onFail: [{ op: "goto", target: "297" }] }],
  "194": [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "602" }], onFail: [{ op: "goto", target: "338" }] }],
  // "Activate Germans 1 and 81 in indicated hex": the hex the PC checks were made against
  // (341: R-2, 450: M-10) — paragraphinterpreter.js chain.indicatedHex.
  "197": [
    { op: "activate_german", ids: ["1", "81"], hex: "indicated", stance: "crouching", commenceRounds: true, receivesTwoTurns: true },
    { op: "contact", advantage: "german" },
  ],
  "288": [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "324" }], onFail: [{ op: "goto", target: "180" }] }],
  "291": [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "327" }], onFail: [{ op: "goto", target: "183" }] }],
  "293": [], // a figure in US fatigues beside a tree in G-10: told, nothing to resolve
  "310": [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "289" }], onFail: [{ op: "goto", target: "324" }] }],
  "313": [{ op: "check", kind: "pc", modifier: 0, onSuccess: [{ op: "goto", target: "312" }], onFail: [{ op: "goto", target: "327" }] }],
  "314": [], // [s4] an empty Thompson: the find is told; with no ammo it adds nothing to fire
  "319": [
    { op: "activate_german", ids: ["53"], hex: "O-4", stance: "crouching", commenceRounds: true, receivesTwoTurns: true, conditionChange: 2 },
    { op: "contact", advantage: "german" },
  ],
  "327": [
    { op: "activate_german", ids: ["25"], hex: "M-7", stance: "crouching", commenceRounds: true, conditionChange: 3 },
    { op: "contact", advantage: "german" },
  ],
  "332": [{ op: "check", kind: "pc", modifier: -2, onSuccess: [{ op: "goto", target: "297" }], onFail: [{ op: "goto", target: "319" }] }],
  "338": [
    { op: "activate_german", ids: ["34"], hex: "M-5", stance: "crouching", commenceRounds: true },
    { op: "contact", advantage: "german" },
  ],
  "342": [], // [s8] signs of a minefield strip Q-9 to V-6: told, nothing to resolve
  "606": [
    { op: "activate_german", ids: ["1", "81"], hex: "indicated", stance: "standing", commenceRounds: true },
    { op: "contact", advantage: "US", checkerAware: true },
  ],
};

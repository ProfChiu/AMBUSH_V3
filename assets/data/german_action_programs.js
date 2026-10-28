/*
 * german_action_programs.js — machine-readable annotations of the German Action Paragraphs
 * (§6/8-6/9) reachable in Mission 1. HAND-WRITTEN from the real paragraph text in
 * assets/data/paragraphs.js — not generated, and deliberately not hand-editing that file.
 *
 * Covers the transitive closure of every paragraph the German cards Mission 1 can field
 * (GE 9/R, 15/L, 32/S, 33/V, 34/X, 53/S) cross-reference on their Action Tables, following
 * every "see NNN" chain. Each entry is a program for apps/game/germanactions.js; see that
 * module's header for the format and for why German MOVEMENT is only partly supported.
 *
 * Evaluation order matters: cases are tested top to bottom and the first match wins. That is
 * literally correct for §6/8's numbered options ("choose the first one that applies, even if
 * later options also apply") and is also how the bulleted options are written here — the
 * ordering encodes the compound conditions ("if active target visible AND German in open hex")
 * that the prose spells out longhand, so each case only needs to test what earlier cases
 * haven't already excluded.
 *
 * `target: 'closest'` means §6/9's default targeting rule, quoted: "The target of his fire is
 * the US soldier that is closest to him (in hexes). If two or more targets are equally close,
 * he fires at the easiest target ... If there is still a tie, determine the target at random."
 * `target: 'easiest'` is used only where the paragraph explicitly says "easiest target".
 *
 * NOT MODELLED, flagged per-entry with a `bespoke` note rather than silently approximated:
 * crew-weapon assist (§9/7), "fall prone
 * in the FIRST non-open hex entered" (needs the movement path this data set can't produce),
 * and the "all eligible Germans already have two turns" branch of the turn-giving paragraphs.
 */
(function () {
  'use strict';

  var fireAndDrop = function (target) {
    return [
      { op: 'stance', to: 'crouching' },
      { op: 'fire', mode: 'best', target: target },
      { op: 'stance', to: 'prone', ifFreeStanceChange: true },
    ];
  };

  window.AMBUSH_GERMAN_ACTION_PROGRAMS = {
    // "Lie prone." — §6/9's own worked example: "He does nothing else this turn."
    '800': [{ op: 'stance', to: 'prone' }],

    '801': fireAndDrop('easiest'),
    '802': fireAndDrop('closest'),

    // "If active target visible and German not in open hex, crouch and conduct best fire at
    // easiest target... If active target visible and German in open hex, move as quickly as
    // possible. If no active target visible, run into open, crawl into any other type of hex."
    '803': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '0', then: [{ op: 'move', style: 'open_run' }] },
      { on: 'terrain', is: ['open'], then: [{ op: 'move', style: 'quick' }] },
      { on: 'always', then: fireAndDrop('easiest') },
    ] }],

    '804': [{ op: 'branch', cases: [
      { on: 'not', of: { on: 'in_us_sight' }, then: [{ op: 'remove_from_map', reason: 'out of US sight' }] },
      { on: 'target_within', hexes: 3, then: fireAndDrop('closest') },
      { on: 'always', then: [{ op: 'stance', to: 'prone' }] },
    ] }],

    '805': [{ op: 'branch', cases: [
      { on: 'not', of: { on: 'in_us_sight' }, then: [{ op: 'remove_from_map', reason: 'out of US sight' }] },
      { on: 'target_within', hexes: 4, then: [{ op: 'surrender' }] },
      { on: 'always', then: [{ op: 'stance', to: 'prone' }] },
    ] }],

    '808': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '0', then: [{ op: 'stance', to: 'crouching' }] },
      { on: 'targets_in_sight', count: '1-2', then: fireAndDrop('easiest') },
      { on: 'targets_in_sight', count: '3+', then: [{ op: 'stance', to: 'prone' }] },
    ] }],

    // "Move as quickly as possible; fall prone after movement (spending a Movement Point to do
    // so, if necessary)." The prone step still happens even though the move can't be resolved.
    '809': [{ op: 'move', style: 'quick' }, { op: 'stance', to: 'prone' }],

    '813': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '3+', then: [{ op: 'surrender' }] },
      { on: 'always', goto: '802' },
    ] }],

    // "Crouch, then fire machine gun or assist firing machine gun. Conduct best fire at any
    // active target within 3 hexes. Otherwise, conduct aimed fire at easiest target."
    '815': [
      { op: 'stance', to: 'crouching' },
      { op: 'branch', cases: [
        { on: 'target_within', hexes: 3, then: [{ op: 'fire', mode: 'best', target: 'closest' }] },
        { on: 'always', then: [{ op: 'fire', mode: 'aimed', target: 'easiest' }] },
      ] },
      { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      { op: 'bespoke', note: 'Crew-weapon assist and the "if MG out of ammo, fire second weapon" fallback are not modelled (no crew-weapon or multi-weapon inventory, §9/7).' },
    ],

    // "Ignore the self-preservation Reaction. Roll for a new German Action Number and refer to
    // this soldier's Action Column that would otherwise apply."
    '816': [{ op: 'reroll_action_number', ignoreSelfPreservation: true }],

    '819': [{ op: 'branch', cases: [
      { on: 'has_grenade_and_target_in_range', hexes: 3, then: [
        { op: 'grenade', target: 'closest' },
        { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      ] },
      { on: 'always', then: [{ op: 'move', style: 'open_run' }] },
    ] }],

    // "Crouch, then conduct best fire at easiest target. Fall prone after fire if free stance
    // change available."
    // Reachable from GE 1/Q (Condition 2-3 and Special A, DIE 3). Newly needed once the real
    // GE 1/Q joined Mission 1's activatable set — the coverage test's card list had been stale,
    // seeded with cards no paragraph actually activates while omitting ones that do.
    // The paragraph's Exception ("if this target has already been fired at this round and another
    // target is visible, fire at the second target instead") needs per-round, per-target fire
    // history that nothing in this data set or germanactions.js tracks, so it's flagged rather
    // than silently approximated — same convention as every other partial annotation here.
    '824': [
      { op: 'stance', to: 'crouching' },
      { op: 'fire', mode: 'best', target: 'easiest' },
      { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      { op: 'bespoke', note: 'the Exception (retarget if this target was already fired at this round) is not modelled — no per-round per-target fire history exists' },
    ],

    // "Crouch and conduct snap fire at as many targets as possible, beginning with the closest
    // and then the easiest."
    '825': [{ op: 'stance', to: 'crouching' }, { op: 'fire', mode: 'snap', target: 'closest', multi: true }],

    '829': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '1', then: fireAndDrop('closest') },
      { on: 'always', then: [{ op: 'stance', to: 'prone' }] },
    ] }],

    '830': [{ op: 'branch', cases: [
      { on: 'terrain', is: ['open'], then: [{ op: 'move', style: 'quick' }] },
      { on: 'always', then: [{ op: 'stance', to: 'prone' }] },
    ] }],

    '831': [{ op: 'branch', cases: [
      { on: 'germans_same_or_adjacent', count: '1+', then: [
        { op: 'stance', to: 'crouching' },
        { op: 'give_turn', rule: 'fewest_turns_then_ws' },
      ] },
      { on: 'always', then: [{ op: 'stance', to: 'prone' }] },
    ] },
    { op: 'bespoke', note: 'The "if all eligible Germans already have two turns, see 801" branch is not modelled — per-German remaining-turn counts are on the AR Track but not exposed to this evaluation.' }],

    '832': [{ op: 'branch', cases: [
      { on: 'germans_same_or_adjacent', count: '1+', then: [
        { op: 'stance', to: 'crouching' },
        { op: 'give_turn', rule: 'fewest_turns_then_ws' },
      ] },
      { on: 'always', goto: '801' },
    ] }],

    // Numbered options — first applicable wins (§6/8 step 2).
    '833': [{ op: 'branch', cases: [
      { on: 'targets_in_hex', count: '1+', then: [{ op: 'assault', kill: true }] },
      // Option 2 in full, now that Map A has hexside data (docs/53). "If adjacent to active US
      // soldier through traversable hexside and a grenade is available, crouch and throw grenade.
      // Exception: If active German in the US hex, charge assault to kill." The exception is
      // tested first because it overrides; both share the adjacency-through-a-crossable-hexside
      // test that was un-modelled for as long as the map had no walls.
      { on: 'all', of: [
        { on: 'has_grenade' },
        { on: 'adjacent_traversable_target', count: '1+' },
        { on: 'german_in_adjacent_target_hex' },
      ], then: [{ op: 'assault', kill: true, charge: true }] },
      { on: 'all', of: [
        { on: 'has_grenade' },
        { on: 'adjacent_traversable_target', count: '1+' },
      ], then: [
        { op: 'stance', to: 'crouching' }, { op: 'grenade', target: 'closest' },
      ] },
      { on: 'targets_in_sight', count: '1+', then: [
        { op: 'stance', to: 'crouching' }, { op: 'fire', mode: 'best', target: 'closest' },
      ] },
      { on: 'always', then: [{ op: 'stance', to: 'prone' }] },
    ] },
    ],

    '835': [{ op: 'branch', cases: [
      { on: 'germans_within_two', count: '1+', then: [{ op: 'give_turn', rule: 'fewest_turns_then_closest_then_ws' }] },
      { on: 'always', goto: '801' },
    ] }],

    '836': [{ op: 'branch', cases: [
      { on: 'not', of: { on: 'in_us_sight' }, then: [{ op: 'remove_from_map', reason: 'out of US sight' }] },
      { on: 'terrain', is: ['open'], then: [
        { op: 'move', style: 'quick' }, { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      ] },
      { on: 'always', then: fireAndDrop('closest') },
    ] }],

    '837': [{ op: 'branch', cases: [
      { on: 'not', of: { on: 'in_us_sight' }, then: [{ op: 'remove_from_map', reason: 'out of US sight' }] },
      { on: 'always', then: [{ op: 'move', style: 'quick' }, { op: 'stance', to: 'prone' }] },
    ] }],

    '838': [
      { op: 'move', style: 'open_run' },
      { op: 'branch', cases: [
        { on: 'not', of: { on: 'in_us_sight' }, then: [{ op: 'remove_from_map', reason: 'out of US sight at end of Round' }] },
      ] },
    ],

    '839': [{ op: 'branch', cases: [
      { on: 'targets_in_hex', count: '1+', then: [{ op: 'assault', kill: true }] },
      { on: 'always', then: [
        { op: 'stance', to: 'crouching' }, { op: 'fire', mode: 'best', target: 'closest' },
      ] },
    ] }],

    '841': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '3+', goto: '800' },
      { on: 'always', goto: '815' },
    ] }],

    '843': [{ op: 'branch', cases: [
      { on: 'all', of: [
        { on: 'germans_same_or_adjacent', count: '0' },
        { on: 'targets_in_sight', count: '2+' },
      ], then: [{ op: 'surrender' }] },
      { on: 'always', goto: '815' },
    ] },
    { op: 'bespoke', note: 'Paragraph says "no active German in the same HEX"; this tests same-or-adjacent, the nearest available predicate — slightly stricter, so it surrenders less readily than the card intends.' }],

    '863': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '0', then: [
        { op: 'move', style: 'quick' }, { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      ] },
      { on: 'terrain', is: ['open'], then: [{ op: 'move', style: 'quick' }, { op: 'stance', to: 'prone' }] },
      { on: 'always', goto: '869' },
    ] }],

    '865': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '0', then: [
        { op: 'move', style: 'quick' }, { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      ] },
      { on: 'targets_in_sight', count: '1-2', then: [
        { op: 'stance', to: 'crouching' }, { op: 'fire', mode: 'best', target: 'closest' },
      ] },
      { on: 'targets_in_sight', count: '3+', then: [{ op: 'stance', to: 'prone' }] },
    ] }],

    '866': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '0', then: [
        { op: 'move', style: 'quick' }, { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      ] },
      { on: 'targets_in_sight', count: '1-2', then: [{ op: 'move', style: 'quick' }, { op: 'stance', to: 'prone' }] },
      { on: 'targets_in_sight', count: '3+', then: [
        { op: 'stance', to: 'crouching' }, { op: 'fire', mode: 'snap', target: 'closest', multi: true },
      ] },
    ] }],

    '867': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '0', then: [
        { op: 'move', style: 'quick' }, { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      ] },
      { on: 'always', then: [{ op: 'move', style: 'quick' }, { op: 'stance', to: 'prone' }] },
    ] }],

    // Mission-1-specific paragraphs. Note these DO produce real movement: a named destination
    // hex needs no Movement Reference, so "crawl into hex N-5" resolves fully.
    '913': [{ op: 'branch', cases: [
      { on: 'us_occupies_hex', hex: 'T8', goto: '802' },
      { on: 'germans_lost', count: '3+', then: [
        { op: 'move', style: 'crawl', toHex: 'N5' }, { op: 'set_condition', to: 4 },
      ] },
      { on: 'always', goto: '802' },
    ] }],

    '914': [{ op: 'branch', cases: [
      { on: 'us_occupies_hex', hex: 'T8', goto: '802' },
      { on: 'targets_in_sight', count: '3+', then: [
        { op: 'move', style: 'crawl', toHex: 'N5' }, { op: 'set_condition', to: 4 },
      ] },
      { on: 'always', goto: '802' },
    ] }],

    '915': [{ op: 'branch', cases: [
      { on: 'targets_in_sight', count: '1+', goto: '801' },
      { on: 'always', goto: '830' },
    ] }],

    '916': [{ op: 'branch', cases: [
      { on: 'terrain', is: ['building', 'woods'], goto: '802' },
      { on: 'always', goto: '830' },
    ] }],

    '917': [{ op: 'branch', cases: [
      { on: 'terrain', is: ['building'], goto: '801' },
      { on: 'always', goto: '803' },
    ] }],

    '919': [{ op: 'branch', cases: [
      { on: 'in_activation_hex', goto: '802' },
      { on: 'always', goto: '837' },
    ] }],

    '959': [{ op: 'branch', cases: [
      { on: 'target_within', hexes: 3, then: [
        { op: 'stance', to: 'crouching' },
        { op: 'fire', mode: 'best', target: 'closest', weapon: 'pistol' },
        { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      ] },
      { on: 'always', goto: '815' },
    ] }],

    // Newly reachable once GE 34/X's Condition 2 / DIE 0-1 cell was corrected from 865 to 965 —
    // the transcribed card had a typo, confirmed against both card PDFs and the rendered card
    // image. Same shape as 959 above (the paragraph text is near-identical), differing only in
    // the 5-hex range and in the second bullet: 965 lies prone rather than deferring to 815.
    // "Luger" is a pistol, hence weapon: 'pistol', exactly as 959 annotates the same phrase.
    '965': [{ op: 'branch', cases: [
      { on: 'target_within', hexes: 5, then: [
        { op: 'stance', to: 'crouching' },
        { op: 'fire', mode: 'best', target: 'closest', weapon: 'pistol' },
        { op: 'stance', to: 'prone', ifFreeStanceChange: true },
      ] },
      { on: 'always', then: [{ op: 'stance', to: 'prone' }] },
    ] }],

    // Both reachable from Mission 1 cards once GE 25/N, GE 1/Q and GE 81/P were transcribed for
    // real (918 from GE 25/N Condition 4 DIE 6-9; 920 from GE 1/Q Condition 4 DIE 0-2 and
    // GE 81/P Condition 4 DIE 3). Straight two-way branches on the German's own activation hex,
    // the same `in_activation_hex` condition paragraph 919 already uses.
    '918': [{ op: 'branch', cases: [
      { on: 'in_activation_hex', goto: '801' },
      { on: 'always', goto: '836' },
    ] }],

    '920': [{ op: 'branch', cases: [
      { on: 'in_activation_hex', goto: '802' },
      { on: 'always', goto: '809' },
    ] }],

    '971': [{ op: 'branch', cases: [
      { on: 'targets_in_hex', count: '0', then: [{ op: 'stance', to: 'prone' }] },
      { on: 'targets_in_hex', count: '1-2', then: [{ op: 'assault', kill: true }] },
      { on: 'targets_in_hex', count: '3+', then: [{ op: 'surrender' }] },
    ] }],
  };
})();

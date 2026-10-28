/*
 * test_german_actions.js — §6/8-6/9 German Action Paragraph resolution
 *
 * Checks germanactions.js's evaluation against hand-verified expectations drawn from the real
 * paragraph text, plus structural checks that every annotation in german_action_programs.js is
 * well formed and that every paragraph the Mission 1 German cards can reach is annotated.
 *
 * Run: node tools/test_german_actions.js
 */
const path = require('path');
const ROOT = path.dirname(__dirname);

global.window = {};
require(path.join(ROOT, 'apps/game/germanactions.js'));
require(path.join(ROOT, 'assets/data/german_action_programs.js'));
const GA = global.window.AmbushGermanActions;
const PROGRAMS = global.window.AMBUSH_GERMAN_ACTION_PROGRAMS;

const PARAS = require(path.join(ROOT, 'assets/data/paragraphs.json')).paragraphs;
const ROSTER = require(path.join(ROOT, 'assets/data/german_roster.json')).soldiers;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// A default situation: nothing in sight, in the open, in US sight, free stance change available.
function sit(over) {
  const base = {
    targetsInSight: 0, targetsInHex: 0, inUsSight: true, terrain: 'open',
    inActivationHex: false, germansSameOrAdjacent: 0, germansWithinTwo: 0,
    germansLost: 0, hasGrenade: false, freeStanceChange: true,
    targetsWithin: () => 0, usOccupiesHex: () => false,
  };
  return Object.assign(base, over || {});
}
const names = (r) => r.actions.map(a => a.action + (a.to ? ':' + a.to : '') + (a.target ? ':' + a.target : ''));

// ---------------------------------------------------------------------
// matchCount — the "0" / "1-2" / "3+" specs the paragraphs are written in
// ---------------------------------------------------------------------
{
  check('count "0" matches 0 only', GA.matchCount({ count: '0' }, 0) && !GA.matchCount({ count: '0' }, 1));
  check('count "1-2" matches 1 and 2, not 0 or 3',
    GA.matchCount({ count: '1-2' }, 1) && GA.matchCount({ count: '1-2' }, 2)
    && !GA.matchCount({ count: '1-2' }, 0) && !GA.matchCount({ count: '1-2' }, 3));
  check('count "3+" matches 3 and above, not 2', GA.matchCount({ count: '3+' }, 3) && GA.matchCount({ count: '3+' }, 9) && !GA.matchCount({ count: '3+' }, 2));
  let threw = false;
  try { GA.matchCount({ count: 'lots' }, 1); } catch (e) { threw = /bad count spec/.test(e.message); }
  check('a malformed count spec throws rather than silently failing', threw);
}

// ---------------------------------------------------------------------
// Unknown condition names must throw — a typo in the data is a bug, not a false
// ---------------------------------------------------------------------
{
  let threw = false;
  try { GA.evaluate({ on: 'wat' }, sit()); } catch (e) { threw = /unknown condition/.test(e.message); }
  check('unknown condition name throws', threw);
}

// ---------------------------------------------------------------------
// 800 / 801 / 802 — the simple cases, and §6/9's own worked description
// ---------------------------------------------------------------------
{
  check('800 "Lie prone." -> exactly one prone action',
    JSON.stringify(names(GA.resolve('800', PROGRAMS, sit()))) === JSON.stringify(['stance:prone']));
  check('801 -> crouch, best fire at EASIEST, then prone',
    JSON.stringify(names(GA.resolve('801', PROGRAMS, sit()))) === JSON.stringify(['stance:crouching', 'fire:easiest', 'stance:prone']));
  check('802 -> crouch, best fire at CLOSEST, then prone',
    JSON.stringify(names(GA.resolve('802', PROGRAMS, sit()))) === JSON.stringify(['stance:crouching', 'fire:closest', 'stance:prone']));
  check('802 with no free stance change -> the trailing prone is dropped (§6/7)',
    JSON.stringify(names(GA.resolve('802', PROGRAMS, sit({ freeStanceChange: false })))) === JSON.stringify(['stance:crouching', 'fire:closest']));
}

// ---------------------------------------------------------------------
// 808 — the three-way target-count split, the most common German pattern
// ---------------------------------------------------------------------
{
  check('808 with 0 targets -> just crouch',
    JSON.stringify(names(GA.resolve('808', PROGRAMS, sit({ targetsInSight: 0 })))) === JSON.stringify(['stance:crouching']));
  check('808 with 1 target -> crouch, fire easiest, prone',
    JSON.stringify(names(GA.resolve('808', PROGRAMS, sit({ targetsInSight: 1 })))) === JSON.stringify(['stance:crouching', 'fire:easiest', 'stance:prone']));
  check('808 with 2 targets -> same as 1',
    JSON.stringify(names(GA.resolve('808', PROGRAMS, sit({ targetsInSight: 2 })))) === JSON.stringify(['stance:crouching', 'fire:easiest', 'stance:prone']));
  check('808 with 3 targets -> go prone, do not fire',
    JSON.stringify(names(GA.resolve('808', PROGRAMS, sit({ targetsInSight: 3 })))) === JSON.stringify(['stance:prone']));
}

// ---------------------------------------------------------------------
// 804 / 805 — "If out of US sight, remove the German from the map."
// ---------------------------------------------------------------------
{
  check('804 out of US sight -> removed from map',
    names(GA.resolve('804', PROGRAMS, sit({ inUsSight: false })))[0] === 'remove_from_map');
  check('804 in sight with a target within 3 -> crouch/fire/prone',
    JSON.stringify(names(GA.resolve('804', PROGRAMS, sit({ inUsSight: true, targetsWithin: (n) => n >= 3 ? 1 : 0 }))))
      === JSON.stringify(['stance:crouching', 'fire:closest', 'stance:prone']));
  check('804 in sight, nothing within 3 -> prone',
    JSON.stringify(names(GA.resolve('804', PROGRAMS, sit({ inUsSight: true })))) === JSON.stringify(['stance:prone']));
  check('805 in sight with a target within 4 -> SURRENDER',
    names(GA.resolve('805', PROGRAMS, sit({ targetsWithin: (n) => n >= 4 ? 1 : 0 })))[0] === 'surrender');
}

// ---------------------------------------------------------------------
// Chain following — "see 802" / "Otherwise, conduct 815"
// ---------------------------------------------------------------------
{
  const r = GA.resolve('813', PROGRAMS, sit({ targetsInSight: 1 }));
  check('813 with <3 targets follows "Otherwise, see 802"', r.visited.join('>') === '813>802');
  check('813 chained result is 802\'s actions', JSON.stringify(names(r)) === JSON.stringify(['stance:crouching', 'fire:closest', 'stance:prone']));

  check('813 with 3+ targets surrenders instead of chaining',
    names(GA.resolve('813', PROGRAMS, sit({ targetsInSight: 3 })))[0] === 'surrender');

  const deep = GA.resolve('919', PROGRAMS, sit({ inActivationHex: true }));
  check('919 in activation hex -> 802', deep.visited.join('>') === '919>802');

  const r2 = GA.resolve('841', PROGRAMS, sit({ targetsInSight: 3 }));
  check('841 with 3+ visible -> 800 (lie prone)', r2.visited.join('>') === '841>800' && names(r2)[0] === 'stance:prone');
}

// ---------------------------------------------------------------------
// 971 — assault / surrender by count of targets IN THE HEX (not in sight)
// ---------------------------------------------------------------------
{
  check('971 with no targets in hex -> prone', names(GA.resolve('971', PROGRAMS, sit({ targetsInHex: 0 })))[0] === 'stance:prone');
  check('971 with 1 target in hex -> assault', names(GA.resolve('971', PROGRAMS, sit({ targetsInHex: 1 })))[0] === 'assault');
  check('971 with 2 in hex -> assault', names(GA.resolve('971', PROGRAMS, sit({ targetsInHex: 2 })))[0] === 'assault');
  check('971 with 3 in hex -> surrender', names(GA.resolve('971', PROGRAMS, sit({ targetsInHex: 3 })))[0] === 'surrender');
  const a = GA.resolve('971', PROGRAMS, sit({ targetsInHex: 1 })).actions[0];
  check('971 assault is to KILL (a German always assaults to kill, §11/1)', a.kill === true);
}

// ---------------------------------------------------------------------
// Movement: resolved via a Movement Reference lookup at execution time (mission1demo.js), or a
// NAMED hex resolved right here.
// ---------------------------------------------------------------------
{
  check('809 "move as quickly as possible" -> move_by_reference, but the prone step still happens',
    JSON.stringify(names(GA.resolve('809', PROGRAMS, sit()))) === JSON.stringify(['move_by_reference', 'stance:prone']));

  const r = GA.resolve('913', PROGRAMS, sit({ germansLost: 3 }));
  check('913 with 3+ Germans lost -> a REAL move to the named hex N5, then Condition 4',
    JSON.stringify(names(r)) === JSON.stringify(['move', 'set_condition:4'])
    && r.actions[0].toHex === 'N5' && r.actions[0].style === 'crawl' && r.actions[1].to === 4);
  check('913 with US in T8 -> chains to 802 instead',
    GA.resolve('913', PROGRAMS, sit({ usOccupiesHex: (h) => h === 'T8' })).visited.join('>') === '913>802');
  check('913 default (no condition met) -> 802', GA.resolve('913', PROGRAMS, sit()).visited.join('>') === '913>802');
}

// ---------------------------------------------------------------------
// classifyMovementReference — the one pure piece of §6/8 German Movement's real resolution.
// The chained-move loop itself (terrain lookup, MPA spend, Paragraph Checks) lives in
// mission1demo.js since it needs live state this module doesn't hold; verified there via the
// run-ambush Playwright driver, same convention as fire/assault chains.
// ---------------------------------------------------------------------
{
  check('"NONE" -> no reference at this hex', GA.classifyMovementReference('NONE').type === 'none');
  check('"Exit" -> the German leaves the map', GA.classifyMovementReference('Exit').type === 'exit');
  check('a single-digit hex ref classifies as a hex, not a paragraph',
    JSON.stringify(GA.classifyMovementReference('N-9')) === JSON.stringify({ type: 'hex', hex: 'N-9' }));
  check('a double-digit hex ref classifies as a hex',
    JSON.stringify(GA.classifyMovementReference('N-15')) === JSON.stringify({ type: 'hex', hex: 'N-15' }));
  check('a bare number classifies as a movement reference paragraph',
    JSON.stringify(GA.classifyMovementReference('614')) === JSON.stringify({ type: 'paragraph', paragraph: '614' }));
  let threw = false;
  try { GA.classifyMovementReference('garbage'); } catch (e) { threw = /unrecognised Movement Reference/.test(e.message); }
  check('an unrecognised value throws rather than silently guessing', threw);

  // Cross-check against the actual compiled data — the confirmed example from the session-45
  // screenshot (docs/32_HANDOFF.md §5) and a real "Exit" cell.
  const MOVEMENT = require(path.join(ROOT, 'assets/data/mission_cards_movement.json')).mission_cards_movement;
  check('M1C4 hex M-10\'s real Movement Reference classifies as hex N-9',
    JSON.stringify(GA.classifyMovementReference(MOVEMENT['1']['4']['M-10'])) === JSON.stringify({ type: 'hex', hex: 'N-9' }));
  check('M2C1 hex Y-03\'s real Movement Reference classifies as Exit',
    GA.classifyMovementReference(MOVEMENT['2']['1']['Y-03']).type === 'exit');
}

// ---------------------------------------------------------------------
// Terrain-driven branches
// ---------------------------------------------------------------------
{
  check('916 in a building -> 802', GA.resolve('916', PROGRAMS, sit({ terrain: 'building' })).visited.join('>') === '916>802');
  check('916 in woods -> 802', GA.resolve('916', PROGRAMS, sit({ terrain: 'woods' })).visited.join('>') === '916>802');
  check('916 in the open -> 830', GA.resolve('916', PROGRAMS, sit({ terrain: 'open' })).visited.join('>') === '916>830');
  check('830 in the open -> move (by reference)', names(GA.resolve('830', PROGRAMS, sit({ terrain: 'open' })))[0] === 'move_by_reference');
  check('830 not in the open -> prone', names(GA.resolve('830', PROGRAMS, sit({ terrain: 'woods' })))[0] === 'stance:prone');

  // 803's ordering encodes the compound conditions the prose spells out longhand.
  check('803 with no targets -> run for cover (move)', names(GA.resolve('803', PROGRAMS, sit({ targetsInSight: 0 })))[0] === 'move_by_reference');
  check('803 with a target while in the open -> move', names(GA.resolve('803', PROGRAMS, sit({ targetsInSight: 1, terrain: 'open' })))[0] === 'move_by_reference');
  check('803 with a target while under cover -> stand and fight',
    JSON.stringify(names(GA.resolve('803', PROGRAMS, sit({ targetsInSight: 1, terrain: 'woods' })))) === JSON.stringify(['stance:crouching', 'fire:easiest', 'stance:prone']));
}

// ---------------------------------------------------------------------
// Compound conditions (843) and unannotated fallthrough (863 -> 869)
// ---------------------------------------------------------------------
{
  check('843 surrenders only when alone AND outnumbered',
    names(GA.resolve('843', PROGRAMS, sit({ germansSameOrAdjacent: 0, targetsInSight: 2 })))[0] === 'surrender');
  check('843 with a comrade nearby does NOT surrender -> chains to 815',
    GA.resolve('843', PROGRAMS, sit({ germansSameOrAdjacent: 1, targetsInSight: 2 })).visited.join('>') === '843>815');
  check('843 alone but only one target -> chains to 815',
    GA.resolve('843', PROGRAMS, sit({ germansSameOrAdjacent: 0, targetsInSight: 1 })).visited.join('>') === '843>815');

  const r = GA.resolve('863', PROGRAMS, sit({ targetsInSight: 1, terrain: 'woods' }));
  check('863 falls through to 869, which is outside Mission 1\'s annotated set -> reported as unannotated',
    r.visited.join('>') === '863>869' && r.actions[r.actions.length - 1].action === 'unannotated');
}

// ---------------------------------------------------------------------
// Structural: every annotation is well formed and evaluates in every situation
// ---------------------------------------------------------------------
{
  const KNOWN_OPS = ['stance', 'fire', 'move', 'assault', 'grenade', 'surrender', 'remove_from_map',
    'give_turn', 'set_condition', 'reroll_action_number', 'bespoke', 'branch', 'goto'];
  let badOp = null;
  function walk(ops) {
    for (const op of ops) {
      if (KNOWN_OPS.indexOf(op.op) === -1) { badOp = op.op; return; }
      if (op.op === 'branch') for (const c of op.cases) if (c.then) walk(c.then);
    }
  }
  Object.values(PROGRAMS).forEach(walk);
  check('every op in every program is a known op' + (badOp ? ' (found "' + badOp + '")' : ''), badOp === null);

  // Exercise each program across a spread of situations — any unknown condition name or bad
  // count spec in the data throws here rather than mid-game.
  const spread = [
    sit(), sit({ targetsInSight: 1 }), sit({ targetsInSight: 3 }), sit({ inUsSight: false }),
    sit({ terrain: 'building' }), sit({ terrain: 'woods' }), sit({ targetsInHex: 2 }),
    sit({ germansSameOrAdjacent: 1 }), sit({ germansWithinTwo: 1 }), sit({ germansLost: 3 }),
    sit({ hasGrenade: true, targetsWithin: () => 1 }), sit({ inActivationHex: true }),
    sit({ freeStanceChange: false }), sit({ usOccupiesHex: () => true }),
  ];
  let threwOn = null;
  for (const num of Object.keys(PROGRAMS)) {
    for (const s of spread) {
      try { GA.resolve(num, PROGRAMS, s); } catch (e) { threwOn = num + ': ' + e.message; break; }
    }
    if (threwOn) break;
  }
  check('every program resolves cleanly in every sampled situation' + (threwOn ? ' (' + threwOn + ')' : ''), threwOn === null);

  // Every annotated paragraph must have real text behind it.
  const noText = Object.keys(PROGRAMS).filter(n => !(n in PARAS));
  check('every annotated paragraph has real text in paragraphs.json' + (noText.length ? ' (missing: ' + noText.join(',') + ')' : ''), noText.length === 0);
}

// ---------------------------------------------------------------------
// Coverage: every paragraph Mission 1's German cards can actually reach is annotated
// ---------------------------------------------------------------------
{
  // Derived from the paragraph data, not hardcoded. The old hardcoded list ('9','15','32','33',
  // '34','53') had gone stale in both directions: it named 32 and 33, which no Mission 1 paragraph
  // actually activates, while omitting 1, 25 and 81, which several do — so this check was
  // reporting full coverage while three genuinely reachable paragraphs (824, 918, 920) had no
  // annotation and would have hit germanactions.js's "unannotated" skip in real play.
  const M1_PROGRAMS = require(path.join(ROOT, 'assets/data/paragraph_programs.js')) &&
    global.window.AMBUSH_PARAGRAPH_PROGRAMS;
  const MISSION1_IDS = (function collect(node, out) {
    if (!node || typeof node !== 'object') return out;
    if (Array.isArray(node)) { node.forEach((n) => collect(n, out)); return out; }
    if (node.op === 'activate_german' && node.ids) node.ids.forEach((id) => out.add(String(id)));
    Object.keys(node).forEach((k) => collect(node[k], out));
    return out;
  })(M1_PROGRAMS, new Set());
  check('Mission 1 activates the seven German identity numbers the paragraph data names',
    [...MISSION1_IDS].sort((a, b) => a - b).join(',') === '1,9,15,25,34,53,81');
  const seed = new Set();
  for (const id of MISSION1_IDS) {
    const cardId = Object.keys(ROSTER).find(k => k.replace(/^GE /, '').replace(/\/.*/, '') === id);
    if (!cardId || !ROSTER[cardId].table) continue;
    const t = ROSTER[cardId].table;
    for (const row of t.rows) for (const col of t.columns) {
      const v = String(row.values[col] || '').trim();
      if (/^\d+$/.test(v) && +v > 0) seed.add(String(+v));
    }
  }
  check('the Mission 1 German cards reference a non-trivial set of paragraphs', seed.size > 20);

  const unannotated = [...seed].filter(n => !(n in PROGRAMS));
  check('every paragraph directly on a Mission 1 German card is annotated'
    + (unannotated.length ? ' (missing: ' + unannotated.sort().join(',') + ')' : ''), unannotated.length === 0);
}

// ---------------------------------------------------------------------
// weaponIdForCard — Equipment free text -> weapon_chart.js id. Guards the four bugs the old
// inline mission1demo.js version carried (see germanactions.js's comment).
// ---------------------------------------------------------------------
{
  const w = (equipment) => GA.weaponIdForCard({ Equipment: equipment });

  check('scoped rifle resolves to the scoped row, not the plain bolt rifle',
    w('Bolt Rifle (Scope)') === 'scope' && w('Bolt Rifle (Scope); Pistol (Luger)') === 'scope');
  check('a plain bolt rifle is still a bolt rifle', w('Bolt Rifle; 2 Grenades') === 'bolt');
  check('a pistol-only card gets a pistol, not a free bolt rifle', w('Pistol (Luger)') === 'pistol');
  check('a rifle plus a sidearm resolves to the rifle', w('Bolt Rifle; Pistol (Luger)') === 'bolt');
  check('machine pistol is not confused with a machinegun', w('Machine Pistol; Pistol (Luger)') === 'mp');
  check('machinegun is not confused with a machine pistol', w('Medium Machinegun; Pistol; 2 Grenades') === 'mmg');
  check('submachinegun resolves to smg, not mmg (it contains the substring "machinegun")',
    w('Submachinegun') === 'smg');
  check('an explicitly unarmed card is unarmed', w('No weapon') === null);
  check('a vehicle card is unarmed (vehicles are scenery)', w('Vehicle') === null);
  check('missing equipment text is unarmed rather than a guessed rifle', GA.weaponIdForCard({}) === null);

  // Every real roster card must map to a weapon the chart actually has, or be one of the cards
  // that genuinely carries nothing. A future transcription with unexpected wording fails here
  // rather than silently disarming that German in play.
  const CHART_IDS = require(path.join(ROOT, 'assets/data/weapon_chart.js')) || null;
  const chart = global.window.AMBUSH_WEAPON_CHART.WEAPON_CHART.map((x) => x.id);
  let unmapped = [];
  Object.keys(ROSTER).forEach((cardId) => {
    const card = ROSTER[cardId];
    const id = GA.weaponIdForCard(card);
    const eq = (card.Equipment || '').toLowerCase();
    const legitimatelyUnarmed = !card.Equipment || eq.indexOf('no weapon') !== -1 || eq.indexOf('vehicle') !== -1;
    if (id === null && !legitimatelyUnarmed) unmapped.push(cardId + ': "' + card.Equipment + '"');
    else if (id !== null && chart.indexOf(id) === -1) unmapped.push(cardId + ': unknown weapon id ' + id);
  });
  if (unmapped.length) unmapped.forEach((u) => console.log('  unmapped:', u));
  check('every roster card maps to a real weapon id or is genuinely unarmed', unmapped.length === 0);

  // The three Mission 1 Germans whose weapon actually changed as a result of this fix.
  check('GE 25/N (Mission 1 sniper) now carries the scoped rifle his card states',
    GA.weaponIdForCard(ROSTER['GE 25/N']) === 'scope');
  check('GE 15/L (Mission 1 sniper) now carries the scoped rifle his card states',
    GA.weaponIdForCard(ROSTER['GE 15/L']) === 'scope');
  check('GE 9/R (Mission 1 sniper) now carries the scoped rifle his card states',
    GA.weaponIdForCard(ROSTER['GE 9/R']) === 'scope');
  check('GE 81/P carries the plain bolt rifle his real card states',
    GA.weaponIdForCard(ROSTER['GE 81/P']) === 'bolt');
}

// ---------------------------------------------------------------------
// Decision transparency (session 63) — resolve() must record WHICH option applied and why,
// and describeCondition must be able to render every condition the real data contains.
// ---------------------------------------------------------------------
{
  // 803: "no active target visible" -> option 1; "in open hex" -> option 2; else -> option 3.
  const noTargets = GA.resolve('803', PROGRAMS, sit({ targetsInSight: 0 }));
  check('803 with nothing in sight records option 1 of 3',
    noTargets.decisions.length === 1 && noTargets.decisions[0].option === 1 && noTargets.decisions[0].of === 3);
  check('803 option 1 explains itself as no US soldiers in sight',
    /no US soldiers are in his sight/.test(noTargets.decisions[0].because));

  const inOpen = GA.resolve('803', PROGRAMS, sit({ targetsInSight: 2, terrain: 'open' }));
  check('803 with a target visible in the open records option 2', inOpen.decisions[0].option === 2);
  check('803 option 2 explains itself as being in an open hex',
    /he is in an open hex/.test(inOpen.decisions[0].because));

  const inWoods = GA.resolve('803', PROGRAMS, sit({ targetsInSight: 2, terrain: 'woods' }));
  check('803 with a target visible under cover falls to the catch-all option 3', inWoods.decisions[0].option === 3);
  check('the catch-all option explains itself as no earlier option applying',
    /no earlier option applied/.test(inWoods.decisions[0].because));
  check('the catch-all option is flagged as such, so the UI need not print a tautology',
    inWoods.decisions[0].catchAll === true);
  check('a genuine condition match is NOT flagged as the catch-all',
    inOpen.decisions[0].catchAll === false && noTargets.decisions[0].catchAll === false);

  // The decision record must line up with the actions actually taken, or it is a lie to the player.
  check('the recorded option matches the actions resolve() actually produced',
    names(inOpen).join(',') === 'move_by_reference' && names(inWoods).indexOf('fire:easiest') !== -1);

  // A `not` condition must read as English, not as a logic exercise.
  const hidden = GA.resolve('804', PROGRAMS, sit({ inUsSight: false }));
  check('804 out of US sight records option 1 and phrases the negation naturally',
    hidden.decisions[0].option === 1 && hidden.decisions[0].because === 'he is not in sight of any active US soldier');

  // Chained paragraphs each contribute a decision, tagged with the paragraph they came from.
  const chained = Object.keys(PROGRAMS).filter((k) => {
    const r = GA.resolve(k, PROGRAMS, sit());
    return r.visited.length > 1 && r.decisions.length > 1;
  });
  if (chained.length) {
    const r = GA.resolve(chained[0], PROGRAMS, sit());
    check('a chained paragraph tags each decision with its own paragraph number',
      r.decisions.every((d) => r.visited.indexOf(String(d.paragraph)) !== -1));
  } else {
    check('a chained paragraph tags each decision with its own paragraph number (none reachable from the default situation)', true);
  }

  // Totality: every branch case in the real annotation set must render, and none may come back
  // empty. This is what stops a new condition word shipping with a silently missing explanation.
  let described = 0, undescribed = [];
  const walk = (ops) => (ops || []).forEach((op) => {
    if (op.op !== 'branch') return;
    op.cases.forEach((c) => {
      try {
        const t = GA.describeCondition(c);
        if (!t || !t.trim()) undescribed.push(c.on);
        else described++;
      } catch (e) { undescribed.push(c.on + ': ' + e.message); }
      walk(c.then);
    });
  });
  Object.keys(PROGRAMS).forEach((k) => walk(PROGRAMS[k]));
  if (undescribed.length) undescribed.forEach((u) => console.log('  undescribed:', u));
  check(`every branch case in the real data renders an explanation (${described} cases)`,
    undescribed.length === 0 && described > 0);

  let threw = false;
  try { GA.describeCondition({ on: 'wat' }); } catch (e) { threw = /cannot describe condition/.test(e.message); }
  check('an unknown condition throws rather than explaining nothing', threw);

  // Count phrasing reads the way the paragraphs do.
  check('a "0" count reads as "no ..."', /^no US soldiers are/.test(GA.describeCondition({ on: 'targets_in_sight', count: '0' })));
  check('a "1" count reads as singular', /^1 US soldier is/.test(GA.describeCondition({ on: 'targets_in_sight', count: '1' })));
  check('a "3+" count reads as "3 or more"', /^3 or more US soldiers are/.test(GA.describeCondition({ on: 'targets_in_sight', count: '3+' })));
  check('a "1-2" count reads as a range', /^1-2 US soldiers are/.test(GA.describeCondition({ on: 'targets_in_sight', count: '1-2' })));
  check('an "all" condition joins its clauses with "and"',
    GA.describeCondition({ on: 'all', of: [{ on: 'in_us_sight' }, { on: 'target_within', hexes: 2 }] })
      === 'he is in sight of an active US soldier and a US soldier is within 2 hexes');
}

// ---------------------------------------------------------------------
// §9/4 second weapon — "a German with a jammed weapon will use his second weapon, if he has one"
// ---------------------------------------------------------------------
{
  check('GE 25/N\'s second weapon is the pistol his card lists after the scoped rifle',
    GA.secondWeaponIdForCard(ROSTER['GE 25/N']) === 'pistol');
  check('GE 32/S (MMG + Luger) has the pistol as his second weapon',
    GA.secondWeaponIdForCard(ROSTER['GE 32/S']) === 'pistol');
  check('GE 34/X (Machine Pistol + Luger) has the pistol as his second weapon',
    GA.secondWeaponIdForCard(ROSTER['GE 34/X']) === 'pistol');
  check('a card listing one firearm has no second weapon',
    GA.secondWeaponIdForCard(ROSTER['GE 81/P']) === null);

  // A grenade is not a second WEAPON for §9/4: it is thrown, it has its own action (§10), and a
  // German ordered to fire cannot satisfy that order by throwing one.
  check('a grenade does not count as a second weapon (GE 53/S: Bolt Rifle; Grenade)',
    GA.secondWeaponIdForCard(ROSTER['GE 53/S']) === null);
  check('two grenades do not count either (GE 33/V: Machine Pistol; 2 Grenades)',
    GA.secondWeaponIdForCard(ROSTER['GE 33/V']) === null);

  check('an unarmed card has no second weapon',
    GA.secondWeaponIdForCard({ Equipment: 'No weapon' }) === null);
  check('a missing Equipment field is handled', GA.secondWeaponIdForCard({}) === null);
  check('the same weapon listed twice is not its own second weapon',
    GA.secondWeaponIdForCard({ Equipment: 'Pistol (Luger); Pistol (Luger)' }) === null);

  // Every second weapon must be a real weapon-chart row, same guarantee as the primary.
  const rows = global.window.AMBUSH_WEAPON_CHART.WEAPON_CHART.map((x) => x.id);
  const bad = Object.keys(ROSTER)
    .map((k) => GA.secondWeaponIdForCard(ROSTER[k]))
    .filter((id) => id && rows.indexOf(id) === -1);
  if (bad.length) console.log('  bad second weapon ids:', bad.join(', '));
  check('every second weapon on the roster is a real weapon id', bad.length === 0);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);

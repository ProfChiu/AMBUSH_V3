#!/usr/bin/env node
/*
 * tools/test_victory.js — Phase 10 victory/VP tests (docs/31_VICTORY.md)
 *
 * Run:  node tools/test_victory.js
 */
const path = require('path');
const ROOT = path.join(__dirname, '..');
global.window = {};
require(path.join(ROOT, 'apps/game/victoryrules.js'));
const V = window.AmbushVictory;
const GERMAN_ROSTER = require(path.join(ROOT, 'assets/data/german_roster.json')).soldiers;

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; } else { fail++; console.log('FAIL —', label); }
}

// ---------------------------------------------------------------------
// parseGermanVP against every real VP string actually in the roster
// ---------------------------------------------------------------------
// §2/1: the leading value is the ACTIVATION award ("received when the German is activated,
// regardless of what happens later"); the parenthetical is a separate, ADDITIVE Conditional award.
{
  const noCond = (n) => JSON.stringify({ activation: n, conditional: null });
  check('plain "+1 VP" -> activation 1, no conditional', JSON.stringify(V.parseGermanVP('+1 VP')) === noCond(1));
  check('plain "+2 VP" -> activation 2, no conditional', JSON.stringify(V.parseGermanVP('+2 VP')) === noCond(2));
  check('"+1 VP*" (footnote asterisk) -> activation 1, no conditional', JSON.stringify(V.parseGermanVP('+1 VP*')) === noCond(1));
  check('"+1 VP (+2 VP if captured)" -> activation 1, conditional 2 on "captured"',
    JSON.stringify(V.parseGermanVP('+1 VP (+2 VP if captured)')) === JSON.stringify({ activation: 1, conditional: { amount: 2, trigger: 'captured' } }));
  check('"+1 VP (+1 VP if incapacitated or killed)" (GE 7/N) -> activation 1, conditional 1',
    JSON.stringify(V.parseGermanVP('+1 VP (+1 VP if incapacitated or killed)')) === JSON.stringify({ activation: 1, conditional: { amount: 1, trigger: 'incapacitated or killed' } }));
  check('"+2 VP (+3 VP if knocked out)" -> activation 2, conditional 3 parsed but never triggerable',
    JSON.stringify(V.parseGermanVP('+2 VP (+3 VP if knocked out)')) === JSON.stringify({ activation: 2, conditional: { amount: 3, trigger: 'knocked out' } }));

  // Every real VP string in the actual roster parses and yields a positive activation award.
  var checked = 0, allPositive = true;
  Object.keys(GERMAN_ROSTER).forEach(function (id) {
    var card = GERMAN_ROSTER[id];
    if (!card.VP) return;
    checked++;
    if (!(V.parseGermanVP(card.VP).activation > 0)) allPositive = false;
  });
  check('every real German card VP string (' + checked + ' cards) parses to a positive activation value', checked > 40 && allPositive);
}

// ---------------------------------------------------------------------
// germanActivationVP / germanConditionalVP
// ---------------------------------------------------------------------
{
  check('activation award is earned regardless of outcome', V.germanActivationVP('+1 VP (+2 VP if captured)') === 1);
  check('activation award on a plain card', V.germanActivationVP('+2 VP') === 2);
  check('no VP text -> 0', V.germanActivationVP('') === 0 && V.germanActivationVP(undefined) === 0);

  // GE 34/X "+1 VP (+2 VP if captured)": 1 banked at activation, +2 MORE only on capture.
  check('GE 34/X killed -> 0 conditional (trigger is "captured")', V.germanConditionalVP('+1 VP (+2 VP if captured)', 'killed') === 0);
  check('GE 34/X incapacitated -> 0 conditional', V.germanConditionalVP('+1 VP (+2 VP if captured)', 'incapacitated') === 0);
  check('GE 34/X captured -> +2 conditional, ON TOP of the 1 already banked', V.germanConditionalVP('+1 VP (+2 VP if captured)', 'captured') === 2);

  // GE 7/N "+1 VP (+1 VP if incapacitated or killed)" — the card that proves the reading.
  check('GE 7/N killed -> +1 conditional', V.germanConditionalVP('+1 VP (+1 VP if incapacitated or killed)', 'killed') === 1);
  check('GE 7/N incapacitated -> +1 conditional', V.germanConditionalVP('+1 VP (+1 VP if incapacitated or killed)', 'incapacitated') === 1);
  check('GE 7/N captured -> 0 conditional (trigger names neither)', V.germanConditionalVP('+1 VP (+1 VP if incapacitated or killed)', 'captured') === 0);

  check('card with no conditional award -> 0 for every outcome',
    V.germanConditionalVP('+1 VP', 'killed') === 0 && V.germanConditionalVP('+1 VP', 'captured') === 0);
  check('"knocked out" vehicle trigger never fires (vehicles not modeled)',
    V.germanConditionalVP('+2 VP (+3 VP if knocked out)', 'killed') === 0 && V.germanConditionalVP('+2 VP (+3 VP if knocked out)', 'captured') === 0);

  let threw = false;
  try { V.germanConditionalVP('+1 VP', 'ran away'); } catch (e) { threw = /unknown outcome/.test(e.message); }
  check('unknown outcome throws', threw);
}

// ---------------------------------------------------------------------
// §15 US casualty VP loss — killed always costs 2, incapacitated is exemptible
// ---------------------------------------------------------------------
{
  check('killed soldier: always -2, no exemption', V.usCasualtyVPLoss('killed', true) === 2 && V.usCasualtyVPLoss('killed', false) === 2);
  check('incapacitated soldier, not exfiltrated: -2', V.usCasualtyVPLoss('incapacitated', false) === 2);
  check('incapacitated soldier, exfiltrated off-map: 0 (the exemption named in §15)', V.usCasualtyVPLoss('incapacitated', true) === 0);
}

// ---------------------------------------------------------------------
// computeVPTotal — a full mixed scenario
// ---------------------------------------------------------------------
{
  // Four Germans activated (activation awards: 2+1+1+3 = 7), of whom three were then defeated —
  // only the capture adds a conditional award (+2). The fourth was activated and never engaged,
  // and still scores his 2 VP: §2/1's "regardless of what happens later with that German."
  const result = V.computeVPTotal({
    germanActivations: [
      { vpText: '+2 VP' },                       // 2
      { vpText: '+1 VP (+2 VP if captured)' },   // 1
      { vpText: '+1 VP' },                       // 1
      { vpText: '+3 VP' },                       // 3 — never defeated, still counts
    ],
    germanDefeats: [
      { vpText: '+2 VP', outcome: 'killed' },                        // +0 conditional
      { vpText: '+1 VP (+2 VP if captured)', outcome: 'captured' },  // +2 conditional
      { vpText: '+1 VP', outcome: 'incapacitated' },                 // +0 conditional
    ],
    usCasualties: [
      { outcome: 'incapacitated', wasExfiltrated: true },  // 0
      { outcome: 'incapacitated', wasExfiltrated: false }, // -2
      { outcome: 'killed', wasExfiltrated: true },         // -2 (no exemption for killed)
    ],
    bonusVP: 4,
  });
  check('mixed scenario: gained = activations 7 + conditional 2 + bonus 4 = 13', result.gained === 13);
  check('mixed scenario: lost = 0+2+2 = 4', result.lost === 4);
  check('mixed scenario: total = 13-4 = 9', result.total === 9);

  // The bug this replaced: a German activated but never killed used to score nothing.
  const activatedOnly = V.computeVPTotal({ germanActivations: [{ vpText: '+2 VP' }] });
  check('German activated and never defeated still scores his activation VP', activatedOnly.gained === 2 && activatedOnly.total === 2);

  // Activation VP must not be double-counted by the defeat entry for the same German.
  const oneGerman = V.computeVPTotal({
    germanActivations: [{ vpText: '+1 VP (+2 VP if captured)' }],
    germanDefeats: [{ vpText: '+1 VP (+2 VP if captured)', outcome: 'captured' }],
  });
  check('activated then captured = 1 activation + 2 conditional = 3, not 1+1+2', oneGerman.gained === 3);

  const empty = V.computeVPTotal({});
  check('empty scenario: everything zero', empty.gained === 0 && empty.lost === 0 && empty.total === 0);
}

// ---------------------------------------------------------------------
// §15 final win/lose comparison
// ---------------------------------------------------------------------
{
  check('exactly at Mission 1\'s 13 VP requirement -> won ("greater than or equal to")', V.resolveVictory(13, 13) === 'won');
  check('above the requirement -> won', V.resolveVictory(20, 13) === 'won');
  check('below the requirement -> lost', V.resolveVictory(12, 13) === 'lost');
  check('negative total -> lost', V.resolveVictory(-3, 13) === 'lost');
}

// A captured US soldier: §15 does not address the case, so it is a documented judgment call —
// but it must not THROW, which would take computeVPTotal and every renderVP() call down with it.
{
  check('captured US soldier costs 2 VP rather than throwing', V.usCasualtyVPLoss('captured', false) === 2);
  check('capture has no exfiltration exemption (he cannot be carried off)', V.usCasualtyVPLoss('captured', true) === 2);
  check('a captured casualty still totals correctly', V.computeVPTotal({
    usCasualties: [{ outcome: 'captured', wasExfiltrated: false }],
  }).lost === 2);
  let threw = false;
  try { V.usCasualtyVPLoss('vaporised', false); } catch (e) { threw = true; }
  check('a genuinely unknown outcome still throws', threw);
}

// ---------------------------------------------------------------------
// Mission 1's two specific ending conditions (missions.json's exact victory text)
// ---------------------------------------------------------------------
{
  check('ending 1: all conditions met -> true', V.checkEnding1({ t8Occupied: true, k13Occupied: true, l13Occupied: true, heightsHexWithFullRoadLOS: true, activeGermanCount: 0 }) === true);
  check('ending 1: missing T8 -> false', V.checkEnding1({ t8Occupied: false, k13Occupied: true, l13Occupied: true, heightsHexWithFullRoadLOS: true, activeGermanCount: 0 }) === false);
  check('ending 1: missing K13 -> false', V.checkEnding1({ t8Occupied: true, k13Occupied: false, l13Occupied: true, heightsHexWithFullRoadLOS: true, activeGermanCount: 0 }) === false);
  check('ending 1: missing L13 -> false', V.checkEnding1({ t8Occupied: true, k13Occupied: true, l13Occupied: false, heightsHexWithFullRoadLOS: true, activeGermanCount: 0 }) === false);
  check('ending 1: no heights hex with full road LOS -> false', V.checkEnding1({ t8Occupied: true, k13Occupied: true, l13Occupied: true, heightsHexWithFullRoadLOS: false, activeGermanCount: 0 }) === false);
  check('ending 1: an active German remains -> false ("no active Germans can be on the map")', V.checkEnding1({ t8Occupied: true, k13Occupied: true, l13Occupied: true, heightsHexWithFullRoadLOS: true, activeGermanCount: 1 }) === false);

  check('ending 2: all active US soldiers exited -> true', V.checkEnding2(true) === true);
  check('ending 2: not everyone has exited -> false', V.checkEnding2(false) === false);
}

// ---------------------------------------------------------------------
// Reachable VP ceiling + requirement scaling — the fix for Mission 1 asking 13 VP from data that
// cannot supply it (see victoryrules.js's own comment).
// ---------------------------------------------------------------------
{
  // Shape-agnostic collection: activate_german ops nested under every branch key a paragraph
  // program uses, plus one made-up key, to prove the walk isn't keyed to today's names.
  const programs = {
    '100': [{ op: 'activate_german', ids: ['1'] }],
    '101': [{ op: 'check', kind: 'pc', onSuccess: [{ op: 'activate_german', ids: ['9', '15'] }] }],
    '102': [{ op: 'roll_die', branches: [{ lo: 0, hi: 3, then: [{ op: 'activate_german', ids: ['1'] }] }] }],
    '103': [{ op: 'if_sighting', else: [{ op: 'some_future_key', deeply: { nested: [{ op: 'activate_german', ids: ['34'] }] } }] }],
  };
  const found = V.collectActivatableGermans(programs);
  check('collect: finds activations nested under any branch key, at any depth', found.sort().join(',') === '1,15,34,9');
  check('collect: de-duplicates a German activated by more than one paragraph', found.filter((id) => id === '1').length === 1);

  const vpByNumber = { '1': '+1 VP', '9': '+1 VP', '15': '+1 VP', '34': '+1 VP (+2 VP if captured)' };
  const reach = V.computeReachableVP({
    programs: programs,
    cardVPForGermanId: (id) => vpByNumber[id],
    endingBonus: 4,
  });
  check('reachable: sums every activatable German\'s activation award', reach.activation === 4);
  check('reachable: adds the best conditional award each card can pay', reach.conditional === 2);
  check('reachable: ceiling = activation + conditional + ending bonus', reach.ceiling === 10);

  // Two Germans sharing one substituted stat card are two soldiers, not one — but a single
  // German reached by two different paragraphs is still one soldier.
  const shared = V.computeReachableVP({
    programs: { '200': [{ op: 'activate_german', ids: ['25', '81'] }] },
    cardVPForGermanId: () => '+1 VP',
    instanceKeyForGermanId: (id) => 'GE 33/V #' + id,
    endingBonus: 0,
  });
  check('reachable: distinct instance keys count as distinct soldiers', shared.ceiling === 2);
  const collapsed = V.computeReachableVP({
    programs: { '200': [{ op: 'activate_german', ids: ['25', '81'] }] },
    cardVPForGermanId: () => '+1 VP',
    instanceKeyForGermanId: () => 'GE 33/V',
    endingBonus: 0,
  });
  check('reachable: a shared instance key counts once (the pre-fix collision)', collapsed.ceiling === 1);

  // Scaling: reserve headroom so the mission has more than exactly one winning line.
  const scaled = V.scaleRequirement(13, 13);
  check('scale: a requirement equal to the ceiling is lowered by the default margin', scaled.requirement === 7);
  check('scale: reports that it scaled', scaled.wasScaled === true);
  check('scale: carries the ceiling and margin for display', scaled.ceiling === 13 && scaled.margin === 6);

  // Mission 1's real numbers: a theoretical ceiling of 14 must land the target on 8, the value
  // measured play showed is demanding but not arithmetically unwinnable after one casualty.
  check('scale: Mission 1 (ceiling 14) targets 8', V.scaleRequirement(14, 13).requirement === 8);

  const ample = V.scaleRequirement(40, 13);
  check('scale: never raises a requirement its data comfortably exceeds', ample.requirement === 13 && ample.wasScaled === false);

  const custom = V.scaleRequirement(13, 13, 0);
  check('scale: a zero margin leaves the ceiling as the requirement', custom.requirement === 13 && custom.wasScaled === false);

  check('scale: never returns a requirement below 1', V.scaleRequirement(2, 13).requirement === 1);
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);

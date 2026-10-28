/*
 * Ambush! v3 — the lessons (Phase 6): the words, the moves asked for, and what to look at. Data
 * for lesson.js (the runner) and director.js (the staging); the format is in lesson.js's header.
 *
 * Basic Training is Phase 6's proof lesson: one soldier's two-hex walk from Operations into
 * contact, on the real controller. Its dice are fixed (fixture opsStart, seed 11), so the numbers
 * quoted below are the ones the board rolls; tools/live_lesson.py fails if they ever drift.
 * Chapters 1-6 (brief decision 13) are listed and arrive in Phases 7-8.
 *
 * Phase 7a adds chapter 1 (watch a Round on fixture roundFour, seed 21, and predict what happens:
 * the lesson makes the US moves itself, the Germans act on their own) and chapter 2 (the card,
 * puzzles on the opening squad). Chapter 1's dice are quoted too, and checked by
 * tools/live_chapters.py.
 *
 * Phase 7b adds chapter 3 (the map, fixture roundThree, seed 31): Kowalski's Round 3 turn at H1.
 * Its puzzles are map clicks whose answers and refusals come from the engine itself
 * (AmbushMission.lesson.facts: the movement chart, the fire chart's terrain row, traceLOS), so the
 * words never carry a copy of a number the board could contradict. Its one shot is quoted (snap,
 * Hit Chance 0, to-hit 7) and checked by tools/live_map.py.
 *
 * Phase 8a adds chapter 4 (drills, fixture roundFour, seed 41): move, aimed fire, a grenade and an
 * assault, each made by the player's own clicks (the runner's row and button steps pick the target
 * and the capture-or-kill call). Its dice are quoted and checked by tools/live_drills.py.
 *
 * Phase 8b adds chapter 5 (the Germans and the paragraph book, fixture roundFour, seed 1302719; 51 before Phase 8c), watched
 * and predicted: the mission card's entries (read from AmbushMission.lesson.facts().cell), a
 * paragraph's s-flag lines, each German's card (director.js gcard) and Kranz's reasons. Checked by
 * tools/live_germans.py. Chapter 6 waits for the paragraph-data fix (PROGRESS 2026-10-24).
 */
(function () {
  'use strict';

  var basic = {
    id: 'basic', chapter: 'Basic Training', title: 'Basic Training: first contact',
    blurb: 'One soldier, two hexes, and the moment the Germans show themselves. About three minutes.',
    fixture: 'opsStart', seed: 11,
    beats: [
      { title: 'Welcome to Normandy', view: 'map', pose: 'talk',
        say: 'I’m Sergeant June Whitaker. This is Mission 1: your squad of eight has just come onto the north edge of the map. ' +
          'Before the real thing, one short walk, done right, and you’ll see how the Germans show themselves.',
        explain: 'The mission opens in <b>Operations</b>. No German is on the map yet; your soldiers move one at a time, ' +
          'in any order you choose, and the map itself decides when the enemy appears.',
        cite: '§5/3' },

      { title: 'Meet Pvt. Kowalski', focus: { soldiers: ['us1'] }, card: 'us1', pose: 'talk',
        say: 'This is <b>Pvt. Kowalski</b>, counter B. Mind his <b>Perception (PC) of 5</b>: it decides whether he spots trouble ' +
          'before it spots him.',
        explain: 'Every soldier has Initiative, Perception, Weapon Skill and Movement, rolled for him when the squad was generated. ' +
          'A check rolls one die, 0 to 9: at or under the rating, after any modifier, succeeds. A 0 always succeeds and a 9 always fails.',
        cite: '§4, §5/7' },

      { title: 'Your first move', pose: 'focus', choice: 'Kowalski to H2',
        say: 'Take him one hex south, to <b>H2</b>. In Operations a soldier moves one hex per action, and ' +
          '<b>every hex he enters calls a Paragraph Check</b>.',
        explain: 'Each hex on the map carries a paragraph number. The paragraph says which checks to make and what follows from them.',
        cite: '§5/1, §5/3',
        await: [
          { select: 'us1', say: 'Click Kowalski (B) to select him.',
            wrong: 'Not that one. This lesson moves Kowalski, counter B, in the ring.' },
          { hex: 'H2', with: 'us1', say: 'Click hex H2, just south of him.',
            wrong: 'That isn’t H2. Click the ringed hex just south of Kowalski.' },
        ],
        lesson: 'A move in Operations is also a search: each hex entered reads its paragraph.' },

      { title: 'Paragraph 295: all quiet', focus: { soldiers: ['us1'] }, pose: 'grin',
        say: 'H2 sent us to <b>paragraph 295</b>. It called an <b>Activation Check</b> (rolled 5, failed) and then a ' +
          '<b>Perception Check at −2</b> (rolled 5, failed). Neither came off, so nothing showed itself. ' +
          'The card beside him shows the rolls.',
        explain: 'An Activation Check is made against the current Condition’s Activation Level; a success would have brought ' +
          'Germans out. A Perception Check is made against a soldier’s PC; a success lets your squad see what is there.',
        cite: '§5/7, §5/8' },

      { title: 'One more hex', pose: 'focus', choice: 'Kowalski to H3',
        say: 'Again: one hex south, to <b>H3</b>, the cover hex. Same drill.',
        await: [
          { select: 'us1', say: 'Click Kowalski (B) to select him.',
            wrong: 'Kowalski again: counter B, in the ring.' },
          { hex: 'H3', with: 'us1', say: 'Click hex H3, just south of him.',
            wrong: 'That isn’t H3. Click the ringed hex just south of Kowalski.' },
        ],
        // contact opens this beat's sequel at once; the board goes on resolving under the words
        until: function (b) { return b.germans.length > 0; },
        lesson: 'Each hex is a fresh check. Keep searching and sooner or later the map answers.' },

      { title: 'Contact!', focus: { soldiers: ['us1'], hexes: ['M7', 'M5'] }, pose: 'wow',
        say: 'H3 is <b>paragraph 185</b>. Its Activation Check failed (6), but the <b>Perception Check succeeded</b> (5), ' +
          'and that sent us to <b>paragraph 316</b>: a German Sniper takes his post at <b>M7</b> and an Officer at <b>M5</b>, and <b>Rounds commence</b>, ' +
          'US advantage. The voice cutting in is <b>Major Kranz</b>: she speaks for the German side and reads you their reasons.',
        explain: 'Paragraph 316 activates Germans 25 and 34, starts Action Rounds with the US advantage, moves to Condition 3, and makes ' +
          'Kowalski, who passed the Perception Check, aware at once. Every German revealed is worth Victory Points to you.',
        cite: '¶316, §2/1' },

      { title: 'Debrief', view: 'map', pose: 'grin', done: true,
        say: 'That’s the heart of Operations: walk, read the paragraph, roll the checks, and the map decides when the Germans arrive. ' +
          'From here the fight is in Action Rounds.',
        debrief: {
          takeaways: [
            'In Operations a soldier moves <b>one hex per action</b>, in any order you choose (§5/3).',
            'Every hex entered calls a <b>Paragraph Check</b>; the paragraph names the checks (§5/1).',
            'A check is one die, 0 to 9: <b>at or under the rating</b> succeeds; 0 always does, 9 never (§5/7, §5/8).',
            'Germans appear when a paragraph activates them, and each one revealed is worth VP to you (§2/1).',
          ],
          next: 'Chapter 1, Watch a fight under way.',
        } },
    ],
  };

  // ---------------------------------------------------------------- chapter 1
  // Round 4 of a real game (fixture roundFour). The lesson moves the US side; the player calls
  // what happens next. Seed 21: Kowalski hits (2), wounds (3), misses (4); Baker clears (3);
  // S reads 802 (Action Number 6) and misses Ruiz (9).
  var watch = {
    id: 'watch', chapter: 'Chapter 1', title: 'Chapter 1: Watch a fight under way',
    blurb: 'A Round already running: who acts, and why. You call what happens next. About five minutes.',
    fixture: 'roundFour', seed: 21,
    beats: [
      { title: 'A fight under way', view: 'map', pose: 'talk',
        say: 'This is Round 4 of a real game. Two Germans are out: a <b>Sniper (N) at M7</b> and a <b>Soldier (S) at O4</b>, both in the woods. ' +
          'Pvt. Toth (H) is down at E3, and Delvecchio (E) and Okafor (F) are wounded. I’ll move our side; you call what happens next.',
        explain: 'Once the Germans show themselves the game runs in <b>Action Rounds</b>. Each Round every soldier on both sides gets ' +
          'his place in the turn order, acts when it comes, and the Round ends when everyone has gone.',
        cite: '§6' },

      { title: 'The Action Round track', focus: { ui: ['#track-sec'] }, pose: 'talk',
        say: 'This is the <b>Action Round track</b>. At the start of every Round each soldier rolls on it, by his Initiative, and lands in a space: ' +
          '<b>2-Turn</b>, <b>1-Turn</b> or <b>Panic</b>. The spaces are played left to right.',
        explain: 'The order is: 2-Turn advantage, 2-Turn disadvantage, 1-Turn advantage, 1-Turn disadvantage. ' +
          'Which side has the advantage is rolled at the start of the Round. A soldier in Panic does not act that Round.',
        cite: '§6/1, §6/4' },

      { title: 'Who goes first?', focus: { ui: ['#track-sec'] }, pose: 'focus',
        say: 'The US holds the advantage this Round. Kowalski (B) rolled a <b>2-Turn</b>; the two Germans rolled 1-Turn; ' +
          'Mercer, Delvecchio and Lindqvist are in <b>Panic</b>. Who acts first?',
        ask: { options: [
          { label: 'Kowalski (B), in the 2-Turn advantage space', right: true,
            why: 'The 2-Turn advantage space is played first, and he is the only one in it.' },
          { label: 'The Sniper (N): Germans fire first', right: false,
            why: 'No side always goes first. The advantage roll decides, and this Round it is ours. Kowalski, in 2-Turn advantage, goes first.' },
          { label: 'Mercer (A): the commander leads', right: false,
            why: 'Mercer rolled Panic: he does not act this Round at all. Kowalski, in 2-Turn advantage, goes first.' },
        ] },
        cite: '§6/1',
        lesson: 'The track decides the order: 2-Turn before 1-Turn, the advantage side first in each.' },

      { title: 'Aimed fire', focus: { soldiers: ['us1'], hexes: ['M7'] }, pose: 'focus',
        say: 'Kowalski takes <b>aimed fire</b> at the Sniper, 4 hexes off. Short range gives a base of 5; ' +
          'the Sniper lies prone in woods, −4; Kowalski’s Weapon Skill adds +1. <b>Hit Chance 2.</b> Which die roll hits?',
        explain: 'Hit Chance is the number to roll at or under on one die, 0 to 9. Range sets the base; the target’s cover and ' +
          'stance and the firer’s Weapon Skill move it.',
        cite: '§9/1',
        ask: { options: [
          { label: '0, 1 or 2', right: true, why: 'At or under the Hit Chance hits: three faces in ten, 30%.' },
          { label: '2 or more', right: false, why: 'Lower is better in Ambush!: at or under the Hit Chance hits, so 0, 1 or 2.' },
          { label: 'Exactly 2', right: false, why: 'Any roll at or under the Hit Chance hits: 0, 1 or 2.' },
        ] },
        play: [{ verb: 'fireAimed' }, { choose: 0 }],
        lesson: 'Fire hits on a roll at or under the Hit Chance.' },

      { title: 'Hit!', focus: { soldiers: ['us1'], hexes: ['M7'] }, pose: 'wow',
        say: 'The jam check passed (44), the to-hit die came up <b>2: a hit</b>, and damage rolled <b>3: Wounded</b>. ' +
          'The Sniper is hurt. Kowalski used one of his two turns, so his marker drops to the <b>1-Turn advantage</b> space.',
        explain: 'Every shot runs the same chain: jam check, to-hit, damage, then ammunition. The weapon’s damage line turns ' +
          'the damage die into Killed, Incapacitated, Wounded or a near miss.',
        cite: '§9/1, §13' },

      { title: 'Your choice of order', focus: { ui: ['#pick-sec'] }, pose: 'focus',
        say: 'Kowalski, Ruiz (C), Baker (D) and Okafor (F) now share the 1-Turn advantage space. Who decides which of them goes next?',
        ask: { options: [
          { label: 'You do: the US player picks', right: true,
            why: 'US soldiers in the same space go in the order you choose. Watch: Kowalski fires again, Ruiz holds, Baker clears his jam.' },
          { label: 'The highest Initiative goes first', right: false,
            why: 'Initiative only places a soldier on the track. Inside a space you, the US player, pick the order. Watch.' },
          { label: 'Alphabetical, by counter letter', right: false,
            why: 'That is how the <b>Germans</b> go. Our soldiers in the same space go in the order you choose. Watch.' },
        ] },
        cite: '§6/1',
        play: [{ pick: 'us1' }, { verb: 'fireAimed' }, { choose: 0 }, { pick: 'us2' }, { verb: 'pass' }, { pick: 'us3' }, { verb: 'clearJam' }],
        lesson: 'Inside a space, US soldiers go in the order the player picks; Germans go by letter.' },

      { title: 'Three turns, three choices', focus: { soldiers: ['us1', 'us2', 'us3'] }, pose: 'talk',
        say: 'Kowalski fired again and <b>missed (4)</b>. Ruiz <b>passed</b>: from L2 his best shot was Hit Chance 0, not worth a turn. ' +
          'Baker’s rifle was <b>jammed</b>, so he spent his turn clearing it (3, clear). Only Okafor is left on our side.',
        explain: 'A jammed weapon cannot fire until a turn is spent clearing it. Passing is a real choice: the turn is spent, nothing else happens.',
        cite: '§9/4, §6/7' },

      { title: 'The German turn', focus: { soldiers: ['GE 25/N', 'GE 53/S'] }, pose: 'focus',
        say: 'When Okafor is done it is the Germans’ turn: both are in the <b>1-Turn disadvantage</b> space. ' +
          'German markers in one space go in letter order. Which German acts first?',
        ask: { options: [
          { label: 'The Soldier, S', right: true,
            why: 'Letter order would put N first, but the Sniper is wounded, and a wounded soldier loses the turns he has left this Round.' },
          { label: 'The Sniper, N: N comes before S', right: false,
            why: 'Letter order would, but Kowalski wounded him: a wounded soldier loses the turns he has left this Round. S goes.' },
          { label: 'Neither: the Round is over', right: false,
            why: 'The 1-Turn disadvantage space still has to be played. The Sniper lost his turn to his wound; S goes.' },
        ] },
        cite: '§6/1, §13/2',
        play: [{ verb: 'pass' }],
        until: function (b) { return !!b.verbs.newRound; },
        lesson: 'Germans in a space go by letter; a wound costs the turns left this Round.' },

      { title: 'How a German decides', focus: { soldiers: ['GE 53/S', 'us2'] }, pose: 'talk',
        say: 'S rolled his <b>Action Number (6)</b>, which sent him to <b>paragraph 802</b>: crouch, fire at the closest target, ' +
          'then drop prone if he can. He fired at Ruiz, 3 hexes off, and <b>missed (9)</b>.',
        explain: 'Germans have no player. Each German’s card turns his Action Number into a paragraph, by the current Condition, ' +
          'and the paragraph says what he does. Chapter 5 opens the paragraph book.',
        cite: '§6/8, §6/9' },

      { title: 'Debrief', view: 'map', pose: 'grin', done: true,
        say: 'That was one Round, start to finish: the track set the order, each soldier acted in his space, and the Round ended ' +
          'when everyone had gone. Next Round, everyone rolls again.',
        debrief: {
          takeaways: [
            'Spaces go <b>2-Turn advantage, 2-Turn disadvantage, 1-Turn advantage, 1-Turn disadvantage</b>; Panic does not act (§6/1, §6/4).',
            'Fire hits on a roll <b>at or under the Hit Chance</b>: range sets the base, cover, stance and Weapon Skill move it (§9/1).',
            'Inside a space <b>you pick</b> the US order; Germans go by <b>letter</b> (§6/1).',
            'A <b>wounded</b> soldier loses the turns he has left that Round (§13/2).',
          ],
          next: 'Chapter 2, The soldier and his card.',
        } },
    ],
  };

  // ---------------------------------------------------------------- chapter 2
  // The opening squad (fixture opsStart): a card read, then puzzles on the real eight. No dice.
  var card = {
    id: 'card', chapter: 'Chapter 2', title: 'Chapter 2: The soldier and his card',
    blurb: 'What each number on a soldier means, found on your own squad. About four minutes.',
    fixture: 'opsStart', seed: 12,
    beats: [
      { title: 'The soldier’s card', focus: { soldiers: ['us1'] }, card: 'us1', pose: 'talk',
        say: 'Every soldier is a counter on the map and a card of numbers. Here is <b>Kowalski</b>: Initiative 3, Perception 5, ' +
          'Weapon Skill +1, Movement 4, a Semi-Auto Rifle, standing, unharmed. Each number does one job.',
        explain: 'The ratings were rolled for each soldier when the squad was generated, so no two squads are the same.',
        cite: '§4' },

      { title: 'Initiative (IN)', focus: { soldiers: ['us1'] }, card: 'us1', pose: 'talk',
        say: '<b>Initiative</b> is the column he rolls in on the Action Round track. A higher IN means more faces that land in a 2-Turn space ' +
          'and fewer in Panic. This squad is all IN 3.',
        explain: 'At IN 3, four faces of ten give a 2-Turn and none give Panic, unless a red number comes up when the soldier is out of command.',
        cite: '§6/1, §6/4' },

      { title: 'Weapon Skill (WS)', pose: 'focus', roster: true, choice: 'a WS +1 soldier',
        say: '<b>Weapon Skill</b> goes straight onto every Hit Chance he fires at. Find a soldier with the best Weapon Skill in the squad.',
        explain: 'You saw it in Chapter 1: Kowalski’s +1 turned a Hit Chance of 1 into 2. A −1 takes one off.',
        cite: '§9/1',
        await: [
          { point: true, select: ['us1', 'us3', 'us4', 'us5'], say: 'Click a soldier with Weapon Skill +1.',
            wrong: 'His Weapon Skill is 0: it adds nothing. Look for +1 in the WS column.',
            wrongFor: { us2: 'Ruiz is the squad’s worst shot: Weapon Skill −1, one off every Hit Chance. Look for +1.' } },
        ],
        until: function () { return true; },
        lesson: 'Weapon Skill is added to every Hit Chance: +1 is the best this squad has.' },

      { title: 'Four good shots', focus: { soldiers: ['us1', 'us3', 'us4', 'us5'] }, pose: 'grin',
        say: 'Kowalski, Baker, Delvecchio and Okafor all have <b>WS +1</b>. Ruiz has −1: when he and Kowalski see the same German, ' +
          'Kowalski is the one to fire.',
        cite: '§9/1' },

      { title: 'Perception (PC)', pose: 'focus', roster: true, choice: 'Delvecchio (PC 4)',
        say: '<b>Perception</b> is how likely he is to spot a German before it spots him: a Perception Check succeeds at or under it. ' +
          'Find the soldier most likely to <b>miss</b> one.',
        explain: 'Paragraphs call Perception Checks as your soldiers move. A success can reveal a German or warn of one first.',
        cite: '§5/7',
        await: [
          { point: true, select: 'us4', say: 'Click the soldier with the lowest Perception.',
            wrong: 'His Perception is 5, like most of the squad. One soldier is lower.' },
        ],
        until: function () { return true; },
        lesson: 'Perception is checked at or under: a lower PC misses more.' },

      { title: 'The commander', pose: 'focus', roster: true, choice: 'Mercer (A)',
        say: 'One soldier is the squad’s <b>commander</b>. He carries the BAR, and the men within two hexes of him stay in command. Find him.',
        explain: 'A soldier is in command when his IN plus that of the soldiers with him, and of a commander whose radius reaches him, ' +
          'comes to 5 or more. Out of command, the red numbers on the track turn into Panic.',
        cite: '§6/3',
        await: [
          { point: true, select: 'us0', say: 'Click the commander.',
            wrong: 'Not him. The commander is counter A, with the Automatic Rifle (the BAR).' },
        ],
        until: function () { return true; },
        lesson: 'The commander keeps the soldiers within two hexes in command.' },

      { title: 'Stance', pose: 'focus', choice: 'Kowalski prone',
        say: 'A soldier stands, crouches or lies <b>prone</b>. Lower is harder to hit and slower to move. Put Kowalski on the ground.',
        explain: 'In Operations a stance change costs nothing and calls no Paragraph Check.',
        cite: '§5/3, §7/3',
        await: [
          { select: 'us1', say: 'Click Kowalski (B).', wrong: 'This one is Kowalski’s: counter B.' },
          { verb: 'stance-prone', with: 'us1', say: 'Click Prone in the ring around him.',
            wrong: 'Prone, in the ring around Kowalski.' },
        ],
        until: function (b) { return b.us.filter(function (u) { return u.id === 'us1'; })[0].stance === 'prone'; },
        lesson: 'Prone is the hardest stance to hit, and it cannot move.' },

      { title: 'Down, and stuck', focus: { soldiers: ['us1'] }, card: 'us1', pose: 'talk',
        say: 'He’s down, and look: <b>no hexes are offered</b>. A prone soldier cannot move at all. To move he must get up first.',
        explain: 'Crouching, he can crawl one hex, which spends all his Movement whatever the terrain. Standing, he spends his Movement hex by hex.',
        cite: '§5/3, §7/3' },

      { title: 'Up again', pose: 'focus', choice: 'Kowalski standing',
        say: 'Stand him back up so he can walk on.',
        await: [
          { verb: 'stance-standing', with: 'us1', say: 'Click Stand in the ring around him.',
            wrong: 'Stand, in the ring around Kowalski.' },
        ],
        until: function (b) { return b.us.filter(function (u) { return u.id === 'us1'; })[0].stance === 'standing'; },
        lesson: 'In Operations, stance changes are free.' },

      { title: 'Wounds', focus: { soldiers: ['us4'] }, card: 'us4', pose: 'talk',
        say: 'Last, the line under the ratings: <b>unharmed</b>, <b>wounded</b>, incapacitated or killed. A wound costs a lot: ' +
          'his Movement drops to 2 for the rest of the mission, he takes −1 to every Hit Chance, and he never gets more than one turn a Round.',
        explain: 'A wounded soldier also falls prone, loses the turns he has left that Round, gets no free stance change, carries one Port Box ' +
          'instead of two, and cannot be given a turn. A second wound incapacitates him.',
        cite: '§13/2' },

      { title: 'Debrief', view: 'map', pose: 'grin', done: true,
        say: 'That’s the card. Every number on it shows up somewhere on the board: the track, the Hit Chance, the Perception Check, the move.',
        debrief: {
          takeaways: [
            '<b>IN</b> is his column on the Action Round track (§6/1).',
            '<b>PC</b>: a Perception Check succeeds at or under it (§5/7).',
            '<b>WS</b> is added to every Hit Chance he fires at (§9/1).',
            '<b>Prone</b> cannot move; in Operations a stance change is free (§5/3).',
            'A <b>wound</b>: Movement 2, −1 to hit, one turn a Round at most (§13/2).',
          ],
          next: 'Chapter 3, The map.',
        } },
    ],
  };

  // ---------------------------------------------------------------- chapter 3
  // Round 3 of the same game (fixture roundThree): Kowalski's turn at H1, the Sniper N prone in the
  // woods at M7, nobody on the north edge able to hit him. Seed 31: after H1 -> H3 (2 MP) his snap
  // shot is Hit Chance 0, jam check 68 (clear), to-hit 7 (miss).
  var SNIPER = 'GE 25/N';
  function map() { return window.AmbushMission.lesson; }
  function fx(h) { return map().facts(h, 'us1', SNIPER); }
  function rowOf(h) { return window.AmbushHexGrid.parseId(h).rowIdx; }
  function nearKowalski() {
    var at = window.AmbushMission.hexOf('us1');
    return Object.keys(window.AMBUSH_LOS_A.hexes).filter(function (h) { return window.AmbushFireCombat.hexDistance(at, h) <= 5; });
  }
  function reachable() { return nearKowalski().filter(function (h) { return fx(h).reach !== null; }); }
  function signed(n) { return n > 0 ? '+' + n : n < 0 ? '−' + (-n) : '0'; }
  function outOfReach(h) { return h + ' is out of his reach: getting there would cost more than his ' + fx(h).mpa + ' MP.'; }
  // his sight line from a hex, drawn as he would stand there
  function lookFrom(h) { var n = window.AmbushMission.hexOf(SNIPER); if (h !== n) map().sight(h, n, 'standing', 'prone'); }

  var ground = {
    id: 'map', chapter: 'Chapter 3', title: 'Chapter 3: The map',
    blurb: 'What a hex costs to cross, what it does to a shot, and what it hides. About five minutes.',
    fixture: 'roundThree', seed: 31,
    beats: [
      { title: 'The ground decides', view: 'map', pose: 'talk',
        say: 'Round 3 of the same game. A <b>Sniper (N)</b> lies prone in the woods at <b>M7</b>, and our men on the north edge ' +
          'can do little about him. Kowalski is up next. This chapter is the map: what a hex <b>costs</b> to cross, what it does ' +
          'to a <b>shot</b>, and what it <b>hides</b>.',
        explain: 'Every hex holds one kind of terrain. The Movement Point Cost Chart says what it costs to enter; the fire chart ' +
          'says what it does to a shot at a soldier standing, crouching or lying in it; and line of sight says who can see whom across it.',
        cite: '§7/3, §8, §9/1' },

      { title: 'Kowalski’s turn', pose: 'focus', choice: 'Kowalski (B)',
        say: 'Six of our soldiers share the <b>1-Turn advantage</b> space, so you pick who goes. Pick <b>Kowalski (B)</b>, standing in the stream at H1.',
        explain: 'Inside a space the US player chooses the order (Chapter 1). Kowalski is standing, unhurt, with his full 4 Movement Points.',
        cite: '§6/1',
        await: [
          { select: 'us1', say: 'Click Kowalski (B) to give him the turn.',
            wrong: 'Not that one. This chapter follows Kowalski, counter B, at H1.' },
        ],
        lesson: 'In a Round, a soldier spends Movement Points hex by hex.' },

      { title: 'Read a hex', focus: { soldiers: ['us1'], hexes: ['H2', 'G2', 'I1'] }, pose: 'talk',
        say: 'Four kinds of ground around him. <b>Clear</b> (H2): 1 MP, no cover, a shot at a man standing there gets <b>+1</b>. ' +
          '<b>Cover</b> (G2): 1 MP, light cover, <b>0</b>. <b>Woods</b> (I1): 2 MP, good cover, <b>−2</b>. His own hex is a ' +
          '<b>Stream</b>: 2 MP to enter, no cover. Point at any hex and its card tells you all of this.',
        explain: 'The fire modifier depends on the target’s terrain and stance together: woods give −2 standing, −3 crouching, ' +
          '−4 prone; clear ground +1, 0, −1. Lower is harder to hit.',
        cite: '§7/3, §9/1' },

      { title: 'What it costs', pose: 'focus', choice: 'a 2-MP hex beside him',
        say: 'Kowalski has <b>4 MP</b> this turn. Click a hex <b>next to him</b> that costs <b>2 MP</b> to enter.',
        explain: 'Clear, cover and road cost 1 MP a hex; woods, brush, rough and streams cost 2. A river cannot be entered at all.',
        cite: '§7/3',
        await: [
          { hex: function (h) { var f = fx(h); return f.adjacent && f.mp === 2; }, point: true,
            say: 'Click a hex beside Kowalski that costs 2 MP.',
            wrongHex: function (h) {
              var f = fx(h);
              return f.adjacent ? h + ' is ' + f.label + ': only ' + f.mp + ' MP. Look for heavier ground.'
                : h + ' isn’t next to him. Pick one of the hexes around H1.';
            } },
        ],
        until: function () { return true; },
        lesson: 'Woods and streams cost 2 MP a hex; clear and cover cost 1.' },

      { title: 'How far he gets', pose: 'focus', choice: 'as far south as 4 MP go',
        focus: { soldiers: ['us1'], hexes: ['E5', 'J5'] },   // frames his whole reach, not the answer
        say: function (last) {
          var f = last ? fx(last) : null;
          return (f ? 'Right: ' + last + ' is ' + f.label + ', 2 MP, half his turn’s Movement. ' : '') +
            'Now spend all 4: click the hex <b>farthest south</b> he could reach this turn. Point at a hex first and its card says what it would cost him.';
        },
        explain: 'He may take any route; the cost is the sum of the hexes he enters. Over clear ground 4 MP is 4 hexes; through woods it is 2.',
        cite: '§7/3',
        await: [
          { hex: function (h) {
              var r = reachable(), deepest = Math.max.apply(null, r.map(rowOf));
              return r.indexOf(h) >= 0 && rowOf(h) === deepest;
            }, point: true,
            say: 'Click the farthest hex south that his 4 MP reach.',
            wrongHex: function (h) {
              var f = fx(h);
              return f.reach === null ? outOfReach(h) : 'He can reach ' + h + ' for ' + f.reach + ' MP, but a hex further south is still in reach.';
            } },
        ],
        until: function () { return true; },
        lesson: 'Movement is a budget: the ground decides how far it goes.' },

      { title: 'Line of sight', focus: { hexes: ['H1', 'M7'] }, pose: 'focus', choice: 'the woods that block him',
        sight: function () { lookFrom('H1'); },
        say: 'Can he shoot the Sniper from where he stands? No. The red line is his <b>line of sight</b>, H1 to M7, and it stops short. ' +
          'Click the hex that <b>blocks</b> it.',
        explain: 'Line of sight runs from the centre of one hex to the centre of the other. At the same elevation, woods, brush, rough, ' +
          'rubble and buildings in between block it; the two soldiers’ own hexes never do. To fire at a man you must see him.',
        cite: '§8/1, §8/2',
        await: [
          { hex: function (h) { return h === fx('H1').los.block; }, point: true,
            say: 'Click the hex where his line of sight stops.',
            wrongHex: function (h) {
              var l = fx('H1').los, f = fx(h);
              return l.path.indexOf(h) > 0 ? h + ' is ' + f.label + ': open to the eye. The line runs on past it.'
                : h + ' isn’t on his line. Follow the red line from H1 toward M7.';
            } },
        ],
        until: function () { return true; },
        lesson: 'Woods between two soldiers block their line of sight.' },

      { title: 'Find a line', focus: { soldiers: ['us1'], hexes: ['M7'] }, pose: 'focus', choice: 'a hex with sight of the Sniper',
        say: function (last) {
          var f = fx('H1');
          return 'Right: the <b>' + f.los.blockLabel + ' at ' + f.los.block + '</b> stand between them. Now find him a line: click a hex ' +
            '<b>he can reach</b> from which he would <b>see the Sniper</b>. Each hex you click draws his line from there.';
        },
        explain: 'Line of sight is the same both ways: if Kowalski can see the Sniper, the Sniper can see Kowalski.',
        cite: '§8/1',
        await: [
          { hex: function (h) { var f = fx(h); return f.reach !== null && f.los.clear; }, point: true, look: lookFrom,
            say: 'Click a hex in reach that sees the Sniper.',
            wrongHex: function (h) {
              var f = fx(h);
              if (f.reach === null) return outOfReach(h);
              return 'From ' + h + ' the ' + f.los.blockLabel + ' at ' + f.los.block + ' block his view: see the red line.';
            } },
        ],
        until: function () { return true; },
        lesson: 'Line of sight works both ways: to see him is to be seen.' },

      { title: 'Cover', pose: 'focus', focus: { soldiers: ['us1'] }, choice: 'the best cover in reach',
        say: function (last) {
          return (last ? 'Yes: from ' + last + ' he would see him, and be seen. ' : '') +
            'Shots go by the <b>target’s</b> ground and stance. Click a hex he can reach where a shot at him, standing, would be <b>hardest</b>.';
        },
        explain: 'Each terrain has a row on the fire chart and each stance a column. Standing: clear +1, cover and brush 0, rough −1, woods −2.',
        cite: '§9/1',
        await: [
          { hex: function (h) {
              var f = fx(h), best = Math.min.apply(null, reachable().map(function (x) { return fx(x).mod.standing; }));
              return f.reach !== null && f.mod.standing === best;
            }, point: true,
            say: 'Click the hex in reach where a standing man is hardest to hit.',
            wrongHex: function (h) {
              var f = fx(h);
              return f.reach === null ? outOfReach(h)
                : h + ' is ' + f.label + ', ' + f.cover + ': a shot at a standing man there gets ' + signed(f.mod.standing) + '. Look for better ground.';
            } },
        ],
        until: function () { return true; },
        lesson: 'The target’s terrain and stance set the fire modifier.' },

      { title: 'The trade', focus: { soldiers: ['us1'], hexes: ['H3', 'M7'] }, pose: 'focus', choice: 'Kowalski to H3',
        sight: function () { lookFrom('H3'); },
        say: 'That’s the trade: the woods that hide him also <b>block his view</b>. <b>H3</b> is Cover, sees the Sniper, and costs <b>2 MP</b>, ' +
          'half his Movement, which leaves him a shot after the move. Move him there.',
        explain: 'A soldier who moves no more than half his Movement may take one more action that turn: here, a snap shot.',
        cite: '§6/7, §7/3',
        await: [
          { verb: 'moveBtn', with: 'us1', say: 'Click Move in the ring around Kowalski.',
            wrong: 'Move, in the ring around Kowalski.' },
          { hex: 'H3', with: 'us1', say: 'Click H3, the cover hex two south of him.',
            wrong: 'That isn’t H3. It is the cover hex two south of him, at the end of the green line.' },
        ],
        lesson: 'Cover that keeps the line open beats cover that hides you from your own shot.' },

      { title: 'The shot', focus: { soldiers: ['us1'], hexes: ['M7'] }, pose: 'focus',
        say: 'From H3 he snap-fires at the Sniper, 6 hexes off. Short range gives a base of <b>5</b>; the Sniper lies <b>prone in woods</b>; ' +
          'Kowalski’s Weapon Skill is <b>+1</b>; a shot after a move is <b>snap fire, −2</b>. What is his Hit Chance?',
        explain: 'Hit Chance = range base + the target’s terrain-and-stance modifier + the firer’s Weapon Skill + any other modifier (snap −2).',
        cite: '§9/1',
        ask: { options: [
          { label: '0: a 10% shot', right: true, why: '5 − 4 + 1 − 2 = 0. It hits only on a 0. Prone in woods is the best cover there is.' },
          { label: '2', right: false, why: 'That forgets the snap: a shot after a move is snap fire, −2. 5 − 4 + 1 − 2 = 0.' },
          { label: '4', right: false, why: 'Prone in woods is −4 (−2 is for a man standing in woods). 5 − 4 + 1 − 2 = 0.' },
        ] },
        play: [{ choose: 0 }, { choose: 0 }],
        lesson: 'Prone in woods is −4: the hardest target on the map.' },

      { title: 'Miss', focus: { soldiers: ['us1'], hexes: ['M7'] }, pose: 'think',
        say: 'The jam check passed (68), and the to-hit die came up <b>7: a miss</b>. With Hit Chance 0 only a 0 hits. ' +
          'That is why one Sniper in the woods can hold a whole squad: to shift him, get closer, take <b>aimed</b> fire instead of snap, ' +
          'or make him move out of the trees.',
        explain: 'Range sets the base: closer is better. Aimed fire takes no −2. And a German who leaves his woods leaves his −4 behind.',
        cite: '§9/1' },

      { title: 'Debrief', view: 'map', pose: 'grin', done: true,
        say: 'That’s the map: every hex has a price to cross, a modifier for the man in it, and something to say about who sees whom. ' +
          'Read the ground before you move.',
        debrief: {
          takeaways: [
            'Entering a hex costs MP: <b>clear and cover 1</b>, <b>woods and streams 2</b> (§7/3).',
            '<b>Woods, brush, rough, rubble and buildings</b> between two soldiers block line of sight; it works both ways (§8).',
            'A shot is modified by the <b>target’s</b> terrain and stance: woods −2 standing, −4 prone; clear +1 standing (§9/1).',
            'Move <b>half</b> your Movement or less and you may still fire, as snap fire, −2 (§6/7, §7/3).',
          ],
          next: 'Chapter 4, Drills.',
        } },
    ],
  };

  // ---------------------------------------------------------------- chapter 4
  // Round 4 of the same game (fixture roundFour, chapter 1's position): the Sniper N prone in the
  // woods at M7, the Soldier S prone in the woods at O4. Four drills, each the player's own clicks:
  // Kowalski walks I5 -> L6 (all 4 MP; Event markers on J5, K6: nothing wakes on the way), Ruiz fires aimed at S
  // (Hit Chance 0, jam 65, to-hit 8: miss), Baker throws a grenade at S (Hit Chance 4: throw 4 lands,
  // dud 07, damage 8 = I), Kowalski's second turn charge-assaults the Sniper (Hit Chance 4: to-hit 3,
  // damage 3, Z on the capture row or W on the kill row: wounded either way). Why this order: an
  // assault needs a soldier standing next to the German when his turn starts (a half-MP move offers
  // only snap fire after it), so Kowalski's first turn is the walk and his second the assault.
  var SOLDIER = 'GE 53/S';
  function nextToSniper(h) { return window.AmbushFireCombat.hexDistance(h, window.AmbushMission.hexOf(SNIPER)) === 1; }

  var drills = {
    id: 'drills', chapter: 'Chapter 4', title: 'Chapter 4: Drills',
    blurb: 'Move, aimed and snap fire, a grenade and an assault, each one yours to make. About six minutes.',
    // roundFourDrills and seed 3663131667 (roundFour and 41 until Phase 8c): the Event markers keep
    // J5 and K6 quiet, and the seed rolls 41's dice from where its walk used to leave off.
    fixture: 'roundFourDrills', seed: 3663131667,
    beats: [
      { title: 'Four drills', view: 'map', pose: 'talk',
        say: 'Round 4 of the game you watched in Chapter 1. Two Germans lie <b>prone in the woods</b>: the <b>Sniper (N)</b> at M7 ' +
          'and a <b>Soldier (S)</b> at O4. Prone in woods is −4 to any rifle shot, the best cover there is. Four drills: ' +
          '<b>move</b>, <b>fire</b>, <b>grenade</b>, <b>assault</b>. You make every one of them.',
        explain: 'Kowalski has the 2-Turn space, so he goes first and again later this Round. Ruiz and Baker each have one turn, ' +
          'in the 1-Turn space, before the Germans.',
        cite: '§6/1' },

      { title: 'Aimed or snap', focus: { soldiers: ['us1'], hexes: ['M7'] }, pose: 'focus', choice: 'his aimed Hit Chance',
        say: 'Kowalski stands at I5 and sees the Sniper, 4 hexes off: <b>short range, base 5</b>. Prone in woods is <b>−4</b>; his ' +
          'Weapon Skill is <b>+1</b>. He hasn’t moved, so a shot now is <b>aimed</b>. What is his Hit Chance?',
        explain: 'A soldier who has not moved this turn fires aimed. One who moves half his Movement or less may still fire, ' +
          'as snap fire, at −2. Hit Chance is never less than 0, and a 0 always hits.',
        cite: '§6/7, §9/1',
        ask: { options: [
          { label: '2: a 30% shot', right: true, why: '5 − 4 + 1 = 2. Moved first, the same shot would be snap, −2: Hit Chance 0. ' +
              'Rifles hardly touch a man prone in woods. Get close instead.' },
          { label: '0', right: false, why: 'That is the snap shot, after a move: −2. He hasn’t moved, so it is aimed: 5 − 4 + 1 = 2.' },
          { label: '6', right: false, why: 'Prone in woods is −4, not a bonus: 5 − 4 + 1 = 2.' },
        ] },
        lesson: 'Aimed fire is taken standing still; snap fire, after a move, is −2.' },

      { title: 'Drill 1: move', pose: 'focus', focus: { soldiers: ['us1'], hexes: ['M7'] }, choice: 'a hex beside the Sniper in reach',
        say: 'Close in. He has <b>4 MP</b>. Click a hex <b>next to the Sniper</b> that Kowalski can reach this turn. Point at a hex and ' +
          'its card says what it would cost.',
        explain: 'An assault (Drill 4) starts from the German’s hex or the one beside it. Clear and cover cost 1 MP, streams and woods 2.',
        cite: '§7/3, §11/1',
        await: [
          { hex: function (h) { return nextToSniper(h) && fx(h).reach !== null; }, point: true,
            say: 'Click a hex beside the Sniper that Kowalski can reach.',
            wrongHex: function (h) {
              if (!nextToSniper(h)) return h + ' isn’t next to the Sniper. Pick one of the six hexes around M7.';
              var f = fx(h);
              return h + ' is ' + f.label + ', beside him, but out of reach: getting there would cost more than his ' + f.mpa + ' MP.';
            } },
        ],
        until: function () { return true; },
        lesson: 'Count the MP before you commit: only one hex beside the Sniper was in reach.' },

      { title: 'Into the stream', pose: 'focus', focus: { soldiers: ['us1'], hexes: ['L6', 'M7'] }, choice: 'Kowalski to L6',
        say: function (last) {
          var f = last ? fx(last) : null;
          return (f ? 'Right: <b>' + last + '</b>, ' + f.label + ', for <b>' + f.reach + ' MP</b>: all he has. ' : '') +
            'More than half his Movement means <b>no shot</b> after it: the turn ends when he gets there. Move him.';
        },
        explain: 'Every hex he enters still calls its paragraph, even in a Round. His second turn, later in the Round, starts beside the Sniper.',
        cite: '§6/7, §7/3',
        await: [
          { verb: 'moveBtn', with: 'us1', say: 'Click Move in the ring around Kowalski.', wrong: 'Move, in the ring around Kowalski.' },
          { hex: 'L6', with: 'us1', say: 'Click L6, the stream hex beside the Sniper.',
            wrong: 'That isn’t L6. It is the stream hex next to the Sniper, south-east of Kowalski.' },
        ],
        // a walk of three hexes goes quiet between them; it is over when the track asks who goes next
        until: function (bd) { return (bd.pickable || []).length > 0; },
        lesson: 'Move more than half your Movement and the turn is spent on the walk.' },

      { title: 'Ruiz', pose: 'focus', focus: { soldiers: ['us2', 'us1'] }, choice: 'Ruiz (C)',
        say: 'He made it, and nothing woke on the way. Kowalski’s marker drops to the 1-Turn space for his second turn. ' +
          'Now pick <b>Ruiz (C)</b> at L2: he can see the Soldier at O4.',
        explain: 'Inside a space you choose the order. Kowalski, Ruiz, Baker and Okafor share the 1-Turn advantage space now.',
        cite: '§6/1',
        await: [
          { select: 'us2', say: 'Click Ruiz (C) to give him the turn.', wrong: 'Not that one. Ruiz, counter C, at L2.' },
        ],
        lesson: 'Order inside a space is yours to set.' },

      { title: 'Drill 2: fire', focus: { soldiers: ['us2'], hexes: ['O4'] }, pose: 'focus', choice: 'Ruiz’s Hit Chance',
        say: 'The Soldier is 3 hexes off: <b>short, base 5</b>. Prone in woods: <b>−4</b>. Ruiz’s Weapon Skill is <b>−1</b>. ' +
          'His shot is aimed. What is his Hit Chance?',
        explain: 'Hit Chance = range base + the target’s terrain-and-stance modifier + Weapon Skill (+ snap −2, wounded −1). ' +
          'It never goes below 0, and the die hits on any roll at or under it.',
        cite: '§9/1',
        ask: { options: [
          { label: '0: a 10% shot', right: true, why: '5 − 4 − 1 = 0. Snap would be −2, still 0: the floor. Only a 0 on the die hits.' },
          { label: '2', right: false, why: 'His Weapon Skill is −1, not +1: 5 − 4 − 1 = 0.' },
          { label: '1', right: false, why: 'That leaves out his Weapon Skill of −1: 5 − 4 − 1 = 0.' },
        ] },
        lesson: 'Against prone-in-woods a poor shot is down to the 0 floor.' },

      { title: 'Take the shot', pose: 'focus', focus: { soldiers: ['us2'], hexes: ['O4'] }, choice: 'Ruiz fires aimed',
        say: 'Take it anyway: 10% is not nothing. Click <b>Aimed</b> in the ring, then the Soldier in the target list. ' +
          'The list shows the odds the game works out: they should match yours.',
        explain: 'The target picker lists every German he can see and reach, with the Hit Chance for each.',
        cite: '§9/1',
        await: [
          { verb: 'fireAimed', with: 'us2', say: 'Click Aimed fire in the ring around Ruiz.', wrong: 'Aimed fire, in the ring around Ruiz.' },
          { row: 0, say: 'Click the Soldier (S) in the target list.', wrong: 'Pick the Soldier, GE 53/S, in the list.' },
        ],
        lesson: 'Fire is two clicks: the verb, then the target.' },

      { title: 'Miss', focus: { soldiers: ['us2'], hexes: ['O4'] }, pose: 'think',
        say: 'Jam check 65: the rifle works. To-hit <b>8: a miss</b>. That is what prone in woods buys him. ' +
          'Something has to get round the cover, and Baker carries it.',
        explain: 'Every shot rolls a jam check (percentile) before the to-hit die, and an ammunition check after it.',
        cite: '§9/1, §9/4' },

      { title: 'Baker', pose: 'focus', focus: { soldiers: ['us3'] }, card: 'us3', choice: 'Baker (D)',
        say: 'Pick <b>Baker (D)</b> at J1. His rifle is <b>jammed</b>, so no Fire in his ring. But a grenade needs no rifle.',
        explain: 'A jammed weapon cannot fire until a turn is spent clearing it. Every soldier in the squad started with two grenades.',
        cite: '§9/4, §10/1',
        await: [
          { select: 'us3', say: 'Click Baker (D) to give him the turn.', wrong: 'Not that one. Baker, counter D, at J1.' },
        ],
        lesson: 'A jammed rifle still leaves the grenade.' },

      { title: 'Drill 3: grenade', focus: { soldiers: ['us3'], hexes: ['O4'] }, pose: 'focus', choice: 'the grenade’s Hit Chance',
        say: 'Standing, he can throw <b>6 hexes</b>; O4 is 5 off, <b>long range, base 3</b>. His Weapon Skill is <b>+1</b>. ' +
          'A grenade lands in the <b>hex</b>, so the man’s cover does not count. What is the Hit Chance?',
        explain: 'Throw range is set by the thrower’s stance: standing 6, crouching 3, prone none. Grenade modifiers are only ' +
          'Weapon Skill, −2 if he is wounded and −3 if he cannot see the hex.',
        cite: '§10/1',
        ask: { options: [
          { label: '4: a 50% throw', right: true, why: '3 + 1 = 4. No −4: the woods and his stance do not count against a grenade.' },
          { label: '0', right: false, why: 'That applies the −4 for prone in woods. A grenade ignores it: 3 + 1 = 4.' },
          { label: '6', right: false, why: '6 is his throw range standing, not the Hit Chance. Long range is base 3: 3 + 1 = 4.' },
        ] },
        lesson: 'A grenade ignores terrain and stance: the answer to a man dug in.' },

      { title: 'Throw it', pose: 'focus', focus: { soldiers: ['us3'], hexes: ['O4'] }, choice: 'Baker throws at O4',
        say: 'Click <b>Grenade</b> in the ring, then the Soldier’s hex in the list.',
        explain: 'A grenade that misses scatters to a nearby hex; one that lands rolls a dud check, then damage for every man in the hex.',
        cite: '§10/1',
        await: [
          { verb: 'grenadeBtn', with: 'us3', say: 'Click Grenade in the ring around Baker.', wrong: 'Grenade, in the ring around Baker.' },
          { row: 0, say: 'Click the Soldier at O4 in the list.', wrong: 'Pick the Soldier at O4 in the list.' },
        ],
        lesson: 'Grenade: the verb, then the hex.' },

      { title: 'In the hole', focus: { hexes: ['O4'] }, pose: 'grin',
        say: 'Throw <b>4: it lands</b> in O4. Dud check 07: it goes off. Damage <b>8: I</b>, incapacitated. The Soldier is out of the fight.',
        explain: 'The damage letters: W wounded, I incapacitated, K killed. An incapacitated German is out of the fight.',
        cite: '§10/1, §13' },

      { title: 'Kowalski again', pose: 'focus', focus: { soldiers: ['us1'], hexes: ['M7'] }, choice: 'Kowalski (B)',
        say: 'Now <b>Kowalski’s second turn</b>. He is standing beside the Sniper. Pick him.',
        explain: 'A soldier in the 2-Turn space takes one turn there and one more in the 1-Turn space.',
        cite: '§6/1',
        await: [
          { select: 'us1', say: 'Click Kowalski (B) to give him his second turn.', wrong: 'Not that one. Kowalski, counter B, at L6.' },
        ],
        lesson: 'Two turns in a Round: walk with one, strike with the other.' },

      { title: 'Drill 4: assault', focus: { soldiers: ['us1'], hexes: ['M7'] }, pose: 'focus', choice: 'the assault’s Hit Chance',
        say: 'An assault is hand to hand: base <b>7</b>, always. Add Kowalski’s Weapon Skill <b>+1</b>; take off the Sniper’s ' +
          'Weapon Skill, <b>1</b>; and he must charge into M7 from beside it: a <b>charge assault, −3</b>. What is the Hit Chance?',
        explain: 'The attacker must be standing. Charging in, he may spend only half his Movement to enter the hex (the woods cost 2 of his 2). ' +
          'A defender’s Weapon Skill of 1 or more counts against the attacker unless he is wounded, panicked or unaware.',
        cite: '§11/1, §11/3, §11/4',
        ask: { options: [
          { label: '4: a 50% assault', right: true, why: '7 + 1 − 1 − 3 = 4. Terrain plays no part in hand-to-hand.' },
          { label: '5', right: false, why: 'The Sniper’s own Weapon Skill counts against Kowalski: 7 + 1 − 1 − 3 = 4.' },
          { label: '0', right: false, why: 'That takes the −4 for prone in woods. An assault ignores terrain: 7 + 1 − 1 − 3 = 4.' },
        ] },
        lesson: 'Assault ignores cover; the defender’s Weapon Skill counts instead.' },

      { title: 'Go in', pose: 'focus', focus: { soldiers: ['us1'], hexes: ['M7'] }, choice: 'Kowalski assaults',
        say: 'Click <b>Assault</b> in the ring, pick the Sniper, then decide: <b>to capture</b> or <b>to kill</b>. That call is yours.',
        explain: 'Each uses its own row of the damage table. A captured German is out of the fight and cannot be freed while a US ' +
          'soldier holds the hex.',
        cite: '§11/1, §11/2',
        await: [
          { verb: 'assaultBtn', with: 'us1', say: 'Click Assault in the ring around Kowalski.', wrong: 'Assault, in the ring around Kowalski.' },
          { row: 0, say: 'Click the Sniper in the list.', wrong: 'Pick the Sniper, GE 25/N, in the list.' },
          { button: ['capture', 'kill'], say: 'Assault to Capture, or Assault to Kill: your call.',
            wrong: 'Pick Assault to Capture or Assault to Kill.' },
        ],
        lesson: 'An assault asks one more question: capture or kill.' },

      { title: 'Hand to hand', focus: { soldiers: ['us1'], hexes: ['M7'] }, pose: 'grin',
        say: function (last, btn) {
          return 'Kowalski crashes into the woods. To-hit <b>3: a hit</b>. Damage <b>3</b>: ' +
            (btn === 'kill' ? '<b>W</b> on the kill row, <b>wounded</b>.' :
              '<b>Z</b> on the capture row: <b>wounded</b>. Z takes a man prisoner only if he is already wounded or panicked.') +
            ' The Sniper is hurt, and Kowalski stands in his woods. Against a wounded man, the next Z on the capture row takes a prisoner.';
        },
        explain: 'A wounded defender also loses his Weapon Skill in an assault: the next one against him would be 7 + 1 − 3 = 5, or 8 from inside his hex.',
        cite: '§11/1, §13/2' },

      { title: 'Debrief', view: 'map', pose: 'grin', done: true,
        say: 'Four drills, four answers to a man dug in: walk close, take the shot you have, throw what ignores cover, and go in by hand.',
        debrief: {
          takeaways: [
            'Move <b>more than half</b> your Movement and the turn ends; half or less leaves one more action, as <b>snap fire, −2</b> (§6/7).',
            '<b>Aimed</b> fire is taken without moving. Hit Chance never drops below <b>0</b>, and a 0 always hits (§9/1).',
            'A <b>grenade</b>: standing 6 hexes, crouching 3, prone none; base by range + Weapon Skill, <b>no terrain modifier</b> (§10/1).',
            'An <b>assault</b>: standing, base 7 + WS − the defender’s WS; <b>−3</b> charging in from next door; capture or kill (§11).',
          ],
          next: 'Chapter 5, The Germans and the paragraph book.',
        } },
    ],
  };

  // ---------------------------------------------------------------- chapter 5
  // Round 4 again (fixture roundFour), watched: the lesson moves the US side, the player calls the
  // German side's books before they are read. Seed 51: Kowalski passes; Ruiz walks L2 -> M3 -> N3 -> O3.
  // M3 is paragraph 343 (s2 has happened, s5 not: line 2, see 603); 603's Activation Check rolls 1, a
  // success, so 337 reads: [s5], German 34 (Officer X) appears at M5 and his mid-Round track roll (0)
  // lands in a space already played. N3 is 608 (s2 and s6 have both happened: line 1, no event). O3 is
  // S5-192: s5 has just happened, so it is crossed off. Baker, Okafor and Kowalski pass. The Sniper
  // (Condition 2-3, die 4) reads 808: three of us in sight, he stays prone. S, with Ruiz beside him,
  // reads Special S (self-preservation; Kranz: "Zu nah!"), die 0: 839, fires at Ruiz: hit 4, damage
  // 3, wounded. Route chosen so every paragraph it can reach is programmed (Mission 1's paragraph
  // data has gaps, PROGRESS 2026-10-24; J5's 179 -> 310 is one of them). Checked by tools/live_germans.py.
  var STAND = 'GE 53/S';
  function cellOf(h) { var c = map().facts(h).cell; return c ? c.raw : '?'; }

  var germans = {
    id: 'germans', chapter: 'Chapter 5', title: 'Chapter 5: The Germans and the paragraph book',
    blurb: 'How the German side decides: the mission card, the paragraph book and each German’s card. You call it first. About five minutes.',
    // seed 1302719 (was 51 until Phase 8c): 337 now gives German 34 his 2 turns without an AR
    // roll, one die fewer, so 51 no longer rolled the dice quoted below; this seed rolls them again.
    fixture: 'roundFour', seed: 1302719,
    beats: [
      { title: 'The other side', view: 'map', pose: 'talk',
        say: 'Round 4 again. Nobody plays the Germans: the game’s own books do. The <b>mission card</b> says what each hex holds, ' +
          'the <b>paragraph book</b> says what happens, and each German’s <b>card</b> turns his die into his orders. ' +
          'Major Kranz reads you their reasons. You call each one before it is read.',
        explain: 'In the boxed game you look all of this up yourself. Here the board looks it up, and the radio log keeps every line.',
        cite: '§5/1, §6/8' },

      { title: 'Kowalski holds', focus: { soldiers: ['us1'] }, pose: 'talk',
        say: 'Kowalski has the first turn. This time he <b>passes</b>: we are here to watch the other side. Press Next.',
        explain: 'Passing spends the turn and nothing else. His second turn comes later this Round, in the 1-Turn space.',
        cite: '§6/7',
        play: [{ verb: 'pass' }],
        until: function (bd) { return (bd.pickable || []).length > 0; } },

      { title: 'The mission card', focus: { soldiers: ['us2'], hexes: ['M3', 'N3', 'O3'] }, pose: 'talk',
        say: function () {
          return 'Ruiz (C) will walk from L2 to <b>O3</b>, right beside the Soldier S. Every hex he enters gets a Paragraph Check, ' +
            'and the mission card, under Condition 3, gives each hex its entry: M3 <b>' + cellOf('M3') + '</b>, N3 <b>' + cellOf('N3') +
            '</b>, O3 <b>' + cellOf('O3') + '</b>. A plain number is a paragraph. <b>S5-192</b> means paragraph 192, ' +
            '<b>unless sighting s5 has already happened</b>.';
        },
        explain: 'Sightings, s1 to s9, are the mission’s memory. A paragraph that begins [s5] marks s5 the moment it is read; ' +
          'after that every S5 entry on the card is crossed off, and paragraphs that ask “if s5 has occurred” take another line. ' +
          'So far this game: s2 (the Sniper’s arrival), s6 and s7.',
        cite: '§5/1, §5/4' },

      { title: 'Paragraph 343', focus: { soldiers: ['us2'], hexes: ['M3'] }, pose: 'focus',
        say: 'M3 is <b>paragraph 343</b>. Its lines are tried in order and the first that fits is followed: ' +
          '<b>1.</b> If s2 and s5 have occurred, no event. <b>2.</b> If s2 has occurred, see 603. <b>3.</b> If s5 has occurred, see 182. ' +
          '<b>4.</b> If neither, see 330. s2 has happened; s5 has not. Which line does Ruiz get?',
        explain: '603 calls an Activation Check at +2. A success there reads the paragraph that brings a German out.',
        cite: '¶343, §5/4',
        ask: { options: [
          { label: 'Line 2: see 603', right: true,
            why: 's2 has happened and s5 has not, so line 1 fails and line 2 is the first that fits. Watch him walk.' },
          { label: 'Line 1: no event', right: false,
            why: 'Line 1 needs both s2 and s5, and s5 has not happened. Line 2 is the first that fits: see 603. Watch.' },
          { label: 'Line 4: see 330', right: false,
            why: 'Line 4 is for neither sighting, but s2 happened when the Sniper showed himself. Line 2 fits: see 603. Watch.' },
        ] },
        play: [{ pick: 'us2' }, { verb: 'move' }, { hex: 'O3' }],
        // the walk is over when he stands in O3 and the track asks who goes next (the Officer's
        // mid-walk arrival shows the pick list for a moment)
        until: function (bd) { return window.AmbushMission.hexOf('us2') === 'O3' && (bd.pickable || []).length > 0; },
        maxMs: 150000,   // M3's chain brings the Officer out mid-walk: over a minute at Normal speed
        lesson: 'A paragraph’s lines are tried in order; the sightings pick the line.' },

      { title: 'A new German', focus: { soldiers: ['us2'], hexes: ['M5', 'O3'] }, pose: 'wow',
        say: '603’s Activation Check rolled <b>1: a success</b>, and that read <b>paragraph 337</b>: “[s5] Activate German 34 in hex M5.” ' +
          'An <b>Officer (X)</b> is out, +1 VP to you, and <b>s5 has now happened</b>. At N3, paragraph 608’s first line fit ' +
          '(s2 and s6 have both happened): no event. And O3, S5-192? <b>Crossed off</b>: s5 is done. The radio log says so.',
        explain: 'A German who appears mid-Round rolls for his place on the track. The Officer rolled 0, a space already played, ' +
          'so he waits for next Round.',
        cite: '¶337, §5/4, §6/6' },

      { title: 'The Soldier’s card', gcard: { id: STAND, col: 'SPECIAL S' }, focus: { soldiers: [STAND, 'us2'] }, pose: 'focus',
        say: 'Now the Germans. This is the Soldier’s card: the die, 0 to 9, down the side, a column for each Condition, and two ' +
          '<b>Special</b> columns. Ruiz stands <b>right beside him</b>. Which column will he read?',
        explain: 'A German reads the column for the current Condition, unless a US soldier is in or next to his hex ' +
          '(self-preservation: Special S) or a paragraph has put a Special Reaction into effect.',
        cite: '§6/8',
        ask: { options: [
          { label: 'Special S: self-preservation', right: true,
            why: 'A German in or next to an active US soldier’s hex reads Special S, whatever the Condition. Kranz has a word for it.' },
          { label: 'Condition 2-3: it is Condition 3', right: false,
            why: 'That is his usual column, but a US soldier beside him overrides it: self-preservation, Special S.' },
          { label: 'Special B', right: false,
            why: 'Special B is a Special Reaction, set only by a paragraph, and none is in effect. Ruiz beside him means Special S.' },
        ] },
        lesson: 'Stand next to a German and you change which column he reads.' },

      { title: 'The Sniper’s card', gcard: { id: SNIPER, col: 'CONDITION 2-3' }, focus: { soldiers: [SNIPER] }, pose: 'focus',
        say: 'The Sniper has nobody beside him, so he reads <b>Condition 2-3</b>. His die will come up <b>4</b>. Which paragraph does he read? ' +
          '(Baker, Okafor and Kowalski will hold; then the Germans go, in letter order.)',
        explain: 'Find the row the die falls in, then read across to the column. 808: no target in sight, crouch; one or two, ' +
          'fire at the easiest; three or more, fall prone.',
        cite: '§6/8',
        ask: { options: [
          { label: '808', right: true, why: '4 falls in the 3-5 row: 808. He can see three of us, so he stays flat. Watch.' },
          { label: '919', right: false, why: '919 is the Condition 4 column. We are in Condition 3: row 3-5 of Condition 2-3 is 808. Watch.' },
          { label: '802', right: false, why: '802 is the 0 row. 4 falls in 3-5: 808. Watch.' },
        ] },
        play: [{ pick: 'us3' }, { verb: 'pass' }, { pick: 'us5' }, { verb: 'pass' }, { verb: 'pass' }],
        until: function (bd) { return !!bd.verbs.newRound; },
        lesson: 'A German’s card turns his die into a paragraph: row by the die, column by the situation.' },

      { title: 'Zu nah!', focus: { soldiers: [STAND, 'us2'] }, pose: 'wow',
        say: 'The Sniper read 808 and, with three of us in sight, <b>stayed down</b>. Then S: his die came up <b>0</b> under Special S, ' +
          '<b>paragraph 839</b>. Nobody was in his hex, so he crouched and fired at the closest man: Ruiz, beside him. ' +
          'To-hit <b>4: a hit</b>; damage <b>3: wounded</b>. “Zu nah!” was Kranz: <b>too close</b>.',
        explain: 'A German fires at the closest US soldier unless his paragraph names another target; on a tie, the easiest. ' +
          'Ruiz’s walk woke an Officer and put Ruiz where S was sure to shoot.',
        cite: '¶839, §6/9' },

      { title: 'Reading the reasons', focus: { soldiers: [STAND, SNIPER] }, pose: 'focus',
        say: 'Every German line in the <b>radio log</b> (the Log button, top of the screen) opens on a <b>why</b>: the paragraph and the line ' +
          'that applied. Kranz speaks up when the reason breaks the pattern. Why did he call out S and not the Sniper?',
        explain: 'Kranz also speaks when a German appears, throws a grenade, kills one of ours, or the Condition changes.',
        cite: '§6/8, §6/9',
        ask: { options: [
          { label: 'S had Ruiz beside him: self-preservation', right: true,
            why: 'Kranz calls out a column forced by self-preservation or a Special Reaction. The Sniper read his usual column.' },
          { label: 'S fired; the Sniper did not', right: false,
            why: 'Firing is ordinary. Kranz called out S because self-preservation overrode his Condition column.' },
          { label: 'S is an officer', right: false,
            why: 'S is a Soldier; the Officer is X, at M5. Kranz called out S’s self-preservation column.' },
        ] },
        lesson: 'Kranz voices the reasons that break the pattern; the log keeps them all.' },

      { title: 'Debrief', view: 'map', pose: 'grin', done: true,
        say: 'That is the whole German side: the map wakes them, the paragraph book remembers what has happened, and each card turns ' +
          'a die into orders. You never move a German, but you decide which page he reads.',
        debrief: {
          takeaways: [
            'The <b>mission card</b> gives each hex a paragraph, NONE, EVENT, or <b>Sn-paragraph</b>: read only until sighting n happens (§5/1, §5/4).',
            'A paragraph’s numbered lines are tried <b>in order</b>; the first that fits is followed. [sN] marks sighting n the moment it is read (§5/4).',
            'A German’s <b>card</b>: row by his die, column by his <b>Condition</b>, unless a US soldier is in or next to his hex (<b>Special S</b>) or a Special Reaction is in effect (§6/8).',
            'Germans fire at the <b>closest</b> target unless the paragraph says otherwise. The log’s <b>why</b> gives every reason; Kranz voices the unusual ones (§6/9).',
          ],
          next: 'Chapter 6, A full turn.',
        } },
    ],
  };

  window.AmbushLessons = [basic, watch, card, ground, drills, germans];
  // the chapter list (brief decision 13); a chapter with no lesson yet is shown, locked
  window.AmbushChapters = [
    { n: 0, lesson: 'basic', title: 'Basic Training', blurb: basic.blurb },
    { n: 1, lesson: 'watch', title: 'Watch a fight under way', blurb: watch.blurb },
    { n: 2, lesson: 'card', title: 'The soldier and his card', blurb: card.blurb },
    { n: 3, lesson: 'map', title: 'The map', blurb: ground.blurb },
    { n: 4, lesson: 'drills', title: 'Drills', blurb: drills.blurb },
    { n: 5, lesson: 'germans', title: 'The Germans and the paragraph book', blurb: germans.blurb },
    { n: 6, title: 'A full turn', blurb: 'Operations into contact, through a whole Round.' },
  ];
})();

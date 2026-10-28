/*
 * paragraphinterpreter.js — Phase 6 paragraph interpreter (docs/20_PARAGRAPH_INTERPRETER.md)
 *
 * Pure logic, no DOM — depends on nothing (LOS/roster lookups are injected, see ctx below).
 * Executes a hand-annotated "program" (a small instruction list, see the op types below) for
 * one paragraph and returns what happened. The paragraph's own prose (assets/data/paragraphs.json)
 * stays the source of truth for what the player sees — a program only encodes the *mechanical*
 * instructions embedded in that prose (branches, checks, state changes), matching §5/1's "book
 * stays hidden except what a triggered paragraph reveals": display is a separate concern from
 * execution, and this module only does the latter.
 *
 * Every "conduct a check" op is resolved through an injected ctx callback rather than computing
 * a real PC/Activation Check result here — that needs a soldier's actual ratings and the checks
 * subsystem, which is Phase 7 work and doesn't exist yet (docs/18_DATA_LAYER_SPIKE.md §5,
 * categories 4-5). Same for "conduct the minefield/boobytrap procedure" (Phase 9). Programs for
 * paragraphs that need those are still written and annotated now — run() just calls the injected
 * stub and continues, so nothing here is blocked on those phases existing; only real execution
 * (a real PC rating driving a real check) is.
 *
 * ctx (all required unless noted):
 *   rollDie()                          -> 0-9
 *   resolveCheck(kind, modifier, soldier?) -> 'success' | 'fail' (kind: 'pc' | 'activation';
 *                                         soldier {id, pc} when one named soldier rolls, else the mover)
 *   hasSighting(n)                     -> bool                  (n: sighting number as a string, '0'-'9')
 *   soldiersWhoCanSee(hexId)           -> [{id, pc}, ...]        (LOS + roster query; a bare id is
 *                                         accepted and rolls with the mover's PC)
 *   isGermanRemovedOnce(germanId)      -> bool                   (§7/4 evasive-movement tracking)
 *   placeEventMarker(hexId?)           -> void
 *   placeLandmark(hexId?)              -> void
 *   setCondition(n)                    -> void
 *   activateGerman(spec)               -> void   (spec: {ids, hex, stance, specialReaction})
 *   commenceRounds()                   -> void
 *   awardVP(amount, note?)             -> void
 *   runProcedure(name)                 -> void   (name: 'minefield' | 'boobytrap' — Phase 9 stub)
 *   moverIs(test)                      -> bool   (optional; test: 'in_clear' | 'on_bridge' |
 *                                                 'under_bridge'; the soldier whose check is running)
 *   hiddenFire(spec)                   -> void   (optional; spec: {fireType, range, weaponId, weaponSkill})
 *
 * chain (optional third argument): state shared by the paragraphs of one chain. pc_check_los
 * sets chain.indicatedHex, so a later paragraph's "activate ... in indicated hex" (606, 197,
 * hex: 'indicated') lands where the checks were made (Phase 8c, 2026-10-25).
 *
 * run() return shape: { effects: [{op, ...}], outcome: {type:'goto', target} | {type:'end'} }
 * "effects" logs every ctx call made, in order — lets a test (or a future UI) see exactly what
 * happened without re-deriving it from ctx call order itself.
 */
(function () {
  'use strict';

  function evalSightingCond(ctx, sightings, state, mode) {
    var check = state === 'occurred' ? ctx.hasSighting : function (n) { return !ctx.hasSighting(n); };
    if (mode === 'all') return sightings.every(check);
    return sightings.some(check);
  }

  function run(program, ctx, chain) {
    chain = chain || {};
    var effects = [];
    function log(op, extra) { effects.push(Object.assign({ op: op }, extra || {})); }

    function exec(instrs) {
      for (var i = 0; i < instrs.length; i++) {
        var ins = instrs[i];
        switch (ins.op) {
          case 'goto':
            return { type: 'goto', target: ins.target };

          case 'roll_die': {
            var roll = ctx.rollDie();
            log('roll_die', { result: roll });
            var branch = ins.branches.filter(function (b) { return roll >= b.lo && roll <= b.hi; })[0];
            if (!branch) throw new Error('roll_die: no branch covers roll ' + roll);
            var r = exec(branch.then);
            if (r) return r;
            break;
          }

          case 'check': {
            var result = ctx.resolveCheck(ins.kind, ins.modifier || 0);
            log('check', { kind: ins.kind, modifier: ins.modifier || 0, result: result });
            var branchInstrs = result === 'success' ? (ins.onSuccess || []) : (ins.onFail || []);
            var r2 = exec(branchInstrs);
            if (r2) return r2;
            break;
          }

          case 'pc_check_los': {
            var candidates = ctx.soldiersWhoCanSee(ins.hex).map(function (c) { return typeof c === 'object' ? c : { id: c, pc: null }; });
            chain.indicatedHex = ins.hex;
            log('pc_check_los', { hex: ins.hex, mode: ins.mode, candidates: candidates.map(function (c) { return c.id; }) });
            if (!candidates.length) {
              var r3 = exec(ins.onNone || []);
              if (r3) return r3;
              break;
            }
            var toCheck = ins.mode === 'highest'
              ? [candidates.slice().sort(function (a, b) { return b.pc - a.pc; })[0]]
              : candidates;
            // Every candidate is checked unconditionally (not short-circuited) — §5/1's "every
            // soldier ... must make a PC check" means each one rolls, even once one succeeds.
            var results = toCheck.map(function (soldier) {
              // Each soldier rolls against his own PC (§5/1), not the mover's.
              var res = ctx.resolveCheck('pc', ins.modifier || 0, soldier.pc === null ? undefined : soldier);
              log('check', { kind: 'pc', modifier: ins.modifier || 0, result: res, soldier: soldier.id });
              return res;
            });
            var anySuccess = results.indexOf('success') !== -1;
            var r4 = exec(anySuccess ? (ins.onSuccess || []) : (ins.onFail || []));
            if (r4) return r4;
            break;
          }

          case 'if_sighting': {
            var cond = evalSightingCond(ctx, ins.sightings, ins.state, ins.mode || 'all');
            if (cond) {
              var r5 = exec(ins.then || []);
              if (r5) return r5;
              return { type: 'end' }; // numbered-list rule matched — §5/1 "choose the first that applies"
            }
            break;
          }

          case 'if_german_removed_once': {
            if (ctx.isGermanRemovedOnce(ins.germanId)) {
              var r6 = exec(ins.then || []);
              if (r6) return r6;
            }
            break;
          }

          case 'if_soldiers_can_see': {
            var seers = ctx.soldiersWhoCanSee(ins.hex);
            log('if_soldiers_can_see', { hex: ins.hex, anySeen: seers.length > 0 });
            var branch2 = seers.length ? (ins.then || []) : (ins.else || []);
            var r7 = exec(branch2);
            if (r7) return r7;
            break;
          }

          // Genuinely one-off mechanics the DSL doesn't (and shouldn't try to) generalize —
          // e.g. paragraph 608's "see 290 if in Clear terrain, see 326 otherwise" needs a
          // terrain lookup nothing here has access to yet. Logged, not thrown, so annotating
          // the rest of a paragraph around one bespoke clause doesn't block everything else.
          case 'bespoke':
            log('bespoke', { note: ins.note });
            break;

          // A branch on where the soldier who triggered the paragraph stands (608: "see 290 if in
          // clear"; 195: on or under the bridge). No branch applies -> nothing happens.
          case 'if_mover': {
            var is = !!(ctx.moverIs && ctx.moverIs(ins.test));
            log('if_mover', { test: ins.test, result: is });
            var r8 = exec(is ? (ins.then || []) : (ins.else || []));
            if (r8) return r8;
            break;
          }

          // The terms a contact paragraph sets for Round 1 (§6/1 Initiative exception, §6/5):
          // which side has the advantage, whether the soldier whose PC check led here is
          // automatically aware, and whether every aware US soldier gets 2 turns. Only logged:
          // the Round reads it from the chain's effects (AmbushOperations.contactTerms).
          case 'contact':
            log('contact', { advantage: ins.advantage, checkerAware: !!ins.checkerAware, awareUsTwoTurns: !!ins.awareUsTwoTurns });
            break;

          // "One soldier is fired upon by a hidden rifleman" (20, 23): one fire with fixed
          // features at the soldier who triggered the paragraph; no German appears.
          case 'hidden_fire': {
            var spec = { fireType: ins.fireType, range: ins.range, weaponId: ins.weaponId, weaponSkill: ins.weaponSkill || 0 };
            if (ctx.hiddenFire) ctx.hiddenFire(spec);
            log('hidden_fire', spec);
            break;
          }

          case 'place_event_marker':
            ctx.placeEventMarker(ins.hex);
            log('place_event_marker', { hex: ins.hex });
            break;

          case 'place_landmark':
            ctx.placeLandmark(ins.hex);
            log('place_landmark', { hex: ins.hex });
            break;

          case 'set_condition':
            ctx.setCondition(ins.to);
            log('set_condition', { to: ins.to });
            break;

          case 'activate_german':
            var actHex = ins.hex === 'indicated' ? chain.indicatedHex : ins.hex;
            if (!actHex) throw new Error('activate_german: no indicated hex in this chain');
            var spec2 = { ids: ins.ids, hex: actHex, stance: ins.stance, specialReaction: ins.specialReaction || null, receivesTwoTurns: !!ins.receivesTwoTurns };
            ctx.activateGerman(spec2);
            log('activate_german', spec2);
            if (ins.commenceRounds) { ctx.commenceRounds(); log('commence_rounds'); }
            if (ins.conditionChange) { ctx.setCondition(ins.conditionChange); log('set_condition', { to: ins.conditionChange }); }
            break;

          case 'award_vp':
            ctx.awardVP(ins.amount, ins.note);
            log('award_vp', { amount: ins.amount, note: ins.note });
            break;

          case 'run_procedure':
            ctx.runProcedure(ins.name);
            log('run_procedure', { name: ins.name });
            break;

          default:
            throw new Error('unknown op: ' + ins.op);
        }
      }
      return null;
    }

    var outcome = exec(program) || { type: 'end' };
    return { effects: effects, outcome: outcome };
  }

  window.AmbushParagraphInterpreter = { run: run };
})();

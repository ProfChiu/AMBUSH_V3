#!/usr/bin/env python3
"""Live check: a US soldier whose only weapon a friend took (§14 Pick Up from an active ally in the
same hex) is unarmed, and nothing throws when he is asked about.

Plays seed 7000 (Normal) to a quiet Action Round, moves soldier B into soldier A's hex, has B take
every weapon A carries through the real Pick Up offers, then asks the page about A: targets, the
verbs (Fire refused with "He has no weapon."), Clear Jam with a stale jam flag, the action panel and
the kit. Exit 0 when every check passes.

  AMBUSH_PAGE=v3 python3 tools/live_unarmed.py [--seed 7000] [--headed]
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent / 'bot'))
from live_save import check, dbg, fails, play_until  # noqa: E402
from game import Session  # noqa: E402
from policy import Policy  # noqa: E402

PROBE = r"""(() => {
  const M1 = window.AmbushM1, st = M1.state, out = {};
  const live = st.usSoldiers.filter(u => u.isActive && u.hexId && !u.exited && u.weaponId && u.inventory);
  if (live.length < 2) return { error: 'fewer than two armed active US soldiers' };
  const A = live[0], B = live[1];
  out.a = A.id; out.b = B.id; out.weapon = A.weaponId;
  B.hexId = A.hexId;
  // Make room: B sets down what he carries, so the Port Box cost never blocks the hand-off.
  M1.EQ.carriedItemIds(B.inventory).forEach(id => M1.EQ.dropItem(B.inventory, id)); B.weaponId = null;
  for (let i = 0; i < 6; i++) {
    const offer = M1.pickupOffers(B).find(o => o.from === A.id && M1.EQ.carriedItemIds(A.inventory).length &&
      o.item !== undefined && !/ammo|clip|grenade/i.test(o.label));
    if (!offer) break;
    if (!offer.take()) { out.takeFailed = offer.label; break; }
  }
  out.aWeaponAfter = A.weaponId;
  const tryIt = (name, fn) => { try { out[name] = fn(); } catch (e) { out[name + 'Error'] = String(e && e.message || e); } };
  tryIt('targets', () => M1.visibleEnemyTargets(A).length);
  tryIt('fire', () => { const v = M1.verbs(A); return { aimedOk: v.fireAimed.ok, aimedWhy: v.fireAimed.why, snapOk: v.fireSnap.ok, pickupOk: v.pickup.ok }; });
  tryIt('clearJam', () => { A.weaponJammed = true; try { return M1.canClearJam(A); } finally { A.weaponJammed = false; } });
  // The original crash needs a German in his sight: the range test came after line of sight.
  // Put one active German in A's hex (same hex: sight is clear) and ask for a shot at him.
  tryIt('shotAtAdjacent', () => {
    const g = M1.activeGermans()[0] || Object.keys(st.germans).map(k => st.germans[k])[0];
    if (!g) return 'no German';
    const was = [g.hexId, g.isActive]; g.hexId = A.hexId; g.isActive = true;
    try { return M1.canFireAt(A, g); } finally { g.hexId = was[0]; g.isActive = was[1]; }
  });
  tryIt('kit', () => /unarmed/.test(M1.kitHtml(A, false)));
  tryIt('panel', () => { M1.showActionPanel(A.id); return true; });
  return out;
})()"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', type=int, default=7000)
    ap.add_argument('--headed', action='store_true')
    a = ap.parse_args()
    print(f'== Unarmed soldier (seed {a.seed})')
    with Session(a.seed, headless=not a.headed, max_steps=20000, max_seconds=600) as s:
        pol = Policy('normal')
        b = play_until(s, pol, lambda b: b['phase'] == 'round' and dbg(s, 'D.isSafeToSave()'))
        check(bool(b), 'reached a quiet Action Round')
        if b:
            r = s._page.page.evaluate(PROBE)
            print('  ', r)
            check('error' not in r, 'found two armed active US soldiers')
            check(r.get('aWeaponAfter') is None and 'takeFailed' not in r, 'B took every weapon A carried; A is unarmed')
            check('targetsError' not in r and r.get('targets') == 0, 'unarmed A has no targets, no throw')
            f = r.get('fire') or {}
            check('fireError' not in r and f.get('aimedOk') is False and f.get('snapOk') is False,
                  'Fire refused for unarmed A, no throw')
            check(f.get('aimedWhy') == 'He has no weapon.', 'the refusal says "He has no weapon."')
            check('clearJamError' not in r and r.get('clearJam') is False, 'Clear Jam refused with a stale jam flag, no throw')
            check('shotAtAdjacentError' not in r and r.get('shotAtAdjacent') is False, 'no shot at a German in his own hex, no throw')
            check('kitError' not in r and r.get('kit') is True, 'the kit shows "unarmed"')
            check('panelError' not in r and r.get('panel') is True, 'the action panel opens for A, no throw')
            check(not s.errors, 'zero console errors' + ('' if not s.errors else ': ' + ' | '.join(s.errors[:3])))
    print('PASS' if not fails else f'FAIL ({len(fails)})')
    sys.exit(1 if fails else 0)


if __name__ == '__main__':
    main()

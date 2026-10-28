"""Live check of Learn to Play chapter 5, The Germans and the paragraph book (Phase 8b): plays it
in Chromium with real mouse clicks, wrong answers first, and asserts what the player must see.

  python3 tools/live_germans.py [--shots DIR] [--headed]

Fixture roundFour, seed 1302719 (51 before Phase 8c), watched: Kowalski passes; the mission-card words come from the engine
(M3 343, N3 608, O3 S5-192); Ruiz walks to O3 and the board rolls what lessons.js quotes (603's
Activation Check 1, success; 337 brings the Officer X to M5; O3 is crossed off, s5 having just
happened); the German cards show with the asked-about column marked; the Sniper reads 808 (die 4),
S reads Special S, 839 (die 0) and wounds Ruiz (to-hit 4, damage 3); Kranz says "Zu nah!"; the
debrief marks the two wrong calls; the chapter ticks. Zero console errors. Exit status 0 only if
every check passes.
"""
import os
import argparse
import pathlib
import sys
import time

from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
PAGE = (ROOT / 'apps/v3/index.html').as_uri()

fails = []


def check(ok, what):
    print(('  ok   ' if ok else '  FAIL ') + what)
    if not ok:
        fails.append(what)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--shots')
    ap.add_argument('--headed', action='store_true')
    a = ap.parse_args()
    shots = pathlib.Path(a.shots) if a.shots else None
    if shots:
        shots.mkdir(parents=True, exist_ok=True)
    n = [0]

    with sync_playwright() as pw:
        br = pw.chromium.launch(headless=not a.headed)
        pg = br.new_page(viewport={'width': 1600, 'height': 900})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))

        def shot(name):
            if shots:
                n[0] += 1
                pg.screenshot(path=str(shots / ('%02d_%s.png' % (n[0], name))))

        def st():
            return pg.evaluate('AmbushLesson.state()')

        def wait_beat(i, timeout=60):
            t0 = time.time()
            while time.time() - t0 < timeout:
                s = st()
                if s and s['beat'] == i and not s['settling']:
                    pg.wait_for_timeout(1500)   # the camera lands, the words fade in
                    return True
                pg.wait_for_timeout(200)
            return False

        def say():
            return pg.evaluate("document.getElementById('beat-say').textContent")

        def refusal():
            return pg.evaluate("(function(){var n=document.getElementById('beat-refuse'); return n.hidden ? '' : n.textContent})()")

        def verdict():
            return pg.evaluate("(function(){var v=document.querySelector('#beat-ask .ask-verdict'); return v ? v.textContent : ''})()")

        def answer(k):
            pg.click('#beat-ask .ask-opt >> nth=%d' % k)
            pg.mouse.move(30, 450)   # off the result card: a hovered card holds (by design)
            pg.wait_for_timeout(400)

        def click_counter(sid):
            box = pg.evaluate("(function(){var r=document.querySelector('.counter[data-soldier-id=\"%s\"]').getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]})()" % sid)
            pg.mouse.click(box[0], box[1])
            pg.wait_for_timeout(350)

        def click_hex(hx):
            p = pg.evaluate("""(function(){var G=AmbushHexGrid,q=G.parseId('%s'),c=G.hexToPixel(q.colIdx,q.rowIdx);
              return AmbushStage.view.toScreen(c.x,c.y)})()""" % hx)
            pg.mouse.click(p['x'], p['y'])
            pg.mouse.move(30, 450)   # off the result card: a hovered card holds (by design), a hand moves on
            pg.wait_for_timeout(350)

        def nxt():
            pg.click('#btn-continue')

        def next_label():
            return pg.evaluate("(function(){var c=document.getElementById('btn-continue'); return c.hidden ? '' : c.textContent})()")

        def board():
            return pg.evaluate('AmbushMission.lesson.board()')

        def us(sid):
            return [u for u in board()['us'] if u['id'] == sid][0]

        def log():
            return pg.evaluate("Array.from(document.querySelectorAll('#combatlog .log-line')).map(e=>e.textContent).join(' | ')")


        def refuse_has(*words):
            r = refusal()
            ok = all(w in r for w in words)
            if not ok:
                print('       refusal was: %r' % r)
            return ok

        def sight():
            return pg.evaluate("Array.from(document.querySelectorAll('#sight-layer .sight:not(.end):not(.beyond)')).map(e=>e.getAttribute('class')).join(',')")

        def pending():
            return pg.evaluate('AmbushMission.lesson.pending()') or {}

        def wait_dialog(prefix, timeout=20):
            t0 = time.time()
            while time.time() - t0 < timeout:
                p = pending()
                if p.get('kind') == 'dialog' and p.get('title', '').startswith(prefix):
                    pg.wait_for_timeout(500)
                    return p
                pg.wait_for_timeout(100)
            return {}

        def click_row(k):
            pg.click('#dialogs-root .target-row >> nth=%d' % k)
            pg.mouse.move(30, 450)
            pg.wait_for_timeout(350)

        def click_button(bid):
            pg.click('#dialogs-root button[data-btn-id="%s"]' % bid)
            pg.mouse.move(30, 450)
            pg.wait_for_timeout(350)

        def german(gid):
            return [g for g in board()['germans'] if g['id'] == gid][0]

        def kranz_said():
            return pg.evaluate('(window.__kr || []).join(" | ")')

        def card_col():
            return pg.evaluate("(function(){var t=document.querySelector('#beat-card .gcard-table th.on'); return t ? t.textContent : ''})()")

        print('Chapter 5, live')
        pg.goto(PAGE + '?lesson=germans')
        check(wait_beat(0), 'beat 1 (the other side) shows from a deep link')
        pg.evaluate("(function(){window.__kr=[];var k=AmbushCues.kranz;AmbushCues.kranz=function(m,h){__kr.push(String(h).replace(/<[^>]+>/g,''));return k.apply(this,arguments)}})()")
        check('Round 4' in say() and board()['currentActorId'] == 'us1', 'Round 4 of the saved game, Kowalski to act')
        click_hex('O3')
        check(refuse_has('Read on first'), 'a map click while reading is refused')
        nxt()
        check(wait_beat(1), 'beat 2 (Kowalski holds) shows')
        nxt()
        check(wait_beat(2, timeout=60), 'he passes; beat 3 (the mission card) shows')
        check('Kowalski passes' in log(), '... the log says he passed')
        s = say()
        check('M3 343' in s and 'N3 608' in s and 'O3 S5-192' in s, 'the mission-card entries are the engine\'s (M3 343, N3 608, O3 S5-192)')
        shot('mission_card')
        nxt()
        check(wait_beat(3), 'beat 4 (paragraph 343) asks')
        click_hex('M3')
        check(refuse_has('Make your call'), 'a click before the call is refused')
        answer(1)
        check(verdict().startswith('Not quite') and 's5' in verdict(), 'the "no event" answer is explained with s5')
        check(wait_beat(4, timeout=120), 'Ruiz walks; beat 5 (a new German) follows')
        L = log()
        check(us('us2')['hexId'] == 'O3', 'Ruiz is at O3 (%s)' % us('us2')['hexId'])
        check('Paragraph 343' in L and 'Activation Check: 1 → success' in L and 'Paragraph 337' in L, 'the board read 343, rolled 1 on 603 and read 337')
        check('GE 34/X' in L and any(g['id'] == 'GE 34/X' and g['hexId'] == 'M5' for g in board()['germans']), 'the Officer X is out at M5')
        check('Paragraph 608' in L and 'O3: sighting s5 has already happened' in L, 'N3 read 608; O3 is crossed off in the log')
        check('Paragraph 192' not in L, '... and 192 was never read')
        shot('new_german')
        nxt()
        check(wait_beat(5), "beat 6 (the Soldier's card) asks")
        check(card_col() == 'Special S', "S's card shows, Special S marked (%r)" % card_col())
        answer(0)
        check(verdict() and not verdict().startswith('Not quite'), 'the right column is confirmed')
        nxt()
        check(wait_beat(6), "beat 7 (the Sniper's card) asks")
        check(card_col() == 'Cond. 2-3', "the Sniper's card shows, Condition 2-3 marked (%r)" % card_col())
        answer(2)
        check(verdict().startswith('Not quite') and '808' in verdict(), 'the 802 answer is explained')
        shot('german_card')
        check(wait_beat(7, timeout=150), 'our side holds, the Germans act; beat 8 (Zu nah!) follows')
        L = log()
        if os.environ.get('LIVE_DUMP'): open(os.environ['LIVE_DUMP'], 'w').write(L)  # the radio log, for re-fitting quotes
        check('(GE 25/N, Sniper): 4 → 808 [Condition 3]' in L, 'the Sniper rolled 4 and read 808')
        check('(GE 53/S, Soldier): 0 → 839 [Self-Preservation' in L, 'S rolled 0 and read 839 under Special S')
        check('fires (aimed) at Pvt. Ruiz' in L and 'To-hit: 4 → HIT' in L and 'Damage: 3 → W' in L, 'S fired at Ruiz: hit 4, damage 3 = W')
        check(us('us2')['status'] == 'wounded', 'Ruiz is wounded')
        check('Zu nah!' in kranz_said(), 'Kranz said "Zu nah!"')
        check(bool(board()['verbs'].get('newRound')), 'the Round is over')
        shot('zu_nah')
        nxt()
        check(wait_beat(8), 'beat 9 (reading the reasons) asks')
        answer(0)
        check(verdict() and not verdict().startswith('Not quite'), 'the right reason is confirmed')
        nxt()
        check(wait_beat(9), 'the debrief shows')
        rows = pg.evaluate("document.querySelectorAll('.db-row').length")
        miss = pg.evaluate("document.querySelectorAll('.db-mark.miss').length")
        check(rows == 4, 'four calls in the report (%d)' % rows)
        check(miss == 2, 'the two wrong calls are marked (%d)' % miss)
        shot('debrief_5')
        nxt()
        pg.wait_for_timeout(1500)
        check(pg.evaluate("!!document.querySelector('.chapter.done[data-lesson=\"germans\"]')"), 'chapter 5 is ticked')

        check(not errs, 'zero console errors' + ('' if not errs else ': ' + ' | '.join(errs[:5])))
        br.close()

    print('%d failed' % len(fails) if fails else 'all checks passed')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

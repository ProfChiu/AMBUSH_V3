"""Live check of Learn to Play chapters 1 and 2 (Phase 7a): plays both in Chromium with real mouse
clicks, wrong answers and wrong soldiers first, and asserts what the player must see.

  python3 tools/live_chapters.py [--shots DIR] [--headed]

Chapter 1 (fixture roundFour, seed 21): a click before the call is refused; a wrong prediction is
explained and the beat goes on; the lesson's own moves reach the real controller; the dice quoted
in lessons.js are the dice the board rolls; the Germans act on their own and Kranz reads it; the
debrief marks the misses. Chapter 2 (opsStart): the card shows his kit; wrong soldiers are refused
by name; Prone leaves him no hex to move to; both chapters tick. Zero console errors. Exit status 0
only if every check passes.
"""
import argparse
import pathlib
import re
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
            pg.wait_for_timeout(400)

        def click_counter(sid):
            box = pg.evaluate("(function(){var r=document.querySelector('.counter[data-soldier-id=\"%s\"]').getBoundingClientRect(); return [r.left+r.width/2, r.top+r.height/2]})()" % sid)
            pg.mouse.click(box[0], box[1])
            pg.wait_for_timeout(350)

        def click_hex(hx):
            p = pg.evaluate("""(function(){var G=AmbushHexGrid,q=G.parseId('%s'),c=G.hexToPixel(q.colIdx,q.rowIdx);
              return AmbushStage.view.toScreen(c.x,c.y)})()""" % hx)
            pg.mouse.click(p['x'], p['y'])
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

        # ------------------------------------------------------------ the list
        print('Chapter list')
        pg.goto(PAGE + '?learn=1')
        pg.wait_for_timeout(900)
        check(pg.evaluate("document.querySelectorAll('.chapter').length") == 7, 'seven chapters listed')
        check(pg.evaluate("Array.from(document.querySelectorAll('.chapter.live')).map(e=>e.dataset.lesson).join(',')") == 'basic,watch,card,map,drills,germans',
              'Basic Training and chapters 1-5 playable (3: tools/live_map.py, 4: tools/live_drills.py, 5: tools/live_germans.py)')
        shot('chapters')

        # ------------------------------------------------------------ chapter 1
        print('Chapter 1, live')
        pg.click('.chapter.live[data-lesson="watch"]')
        check(wait_beat(0), 'beat 1 (a fight under way) shows')
        check('Round 4' in say() and us('us7')['status'] == 'incapacitated', 'Round 4 of the saved game, Toth down')
        nxt()
        check(wait_beat(1), 'beat 2 (the track) shows')
        nxt()
        check(wait_beat(2), 'beat 3 (who goes first) asks')
        check(next_label() == '', 'no Next until the call is made')
        click_hex('K5')
        check('Make your call' in refusal(), 'a map click before the call is refused in words')
        shot('ask_first')
        answer(2)
        check(verdict().startswith('Not quite') and 'Panic' in verdict(), 'a wrong call is explained (Mercer is in Panic)')
        check(pg.evaluate("document.querySelector('#beat-ask .ask-opt.right').textContent").startswith('Kowalski'), 'the right answer is shown')
        check(next_label() == 'Next ▸', 'Next comes back after the call')
        shot('wrong_call')
        nxt()
        check(wait_beat(3), 'beat 4 (aimed fire) asks')
        check('Hit Chance 2' in say(), 'the Hit Chance is quoted')
        answer(0)
        check(verdict().startswith('Right'), 'the right call is confirmed')
        check(next_label() == '', 'no Next while the lesson plays the shot')
        check(wait_beat(4), 'beat 5 (hit) follows the shot by itself')
        L = log()
        check('To-hit: 2 → HIT' in L and 'Damage: 3 → W' in L, 'the board rolled the quoted dice (hit 2, damage 3)')
        check([g for g in board()['germans'] if g['id'] == 'GE 25/N'][0]['status'] == 'wounded', 'the Sniper is wounded')
        shot('hit')
        nxt()
        check(wait_beat(5), 'beat 6 (order) asks')
        check(bool(board()['pickable']), 'the pick list is up')
        answer(0)
        check(wait_beat(6, timeout=90), 'beat 7 follows the three turns')
        L = log()
        check('To-hit: 4 → miss' in L and 'Ruiz passes' in L and re.search(r'Baker attempts to clear.*3 → CLEAR', L) is not None,
              'Kowalski missed (4), Ruiz passed, Baker cleared (3)')
        nxt()
        check(wait_beat(7), 'beat 8 (German turn) asks')
        answer(1)
        check(verdict().startswith('Not quite') and 'wounded' in verdict(), 'the letter-order trap is explained')
        check(wait_beat(8, timeout=120), 'beat 9 follows the German turn')
        L = log()
        check('→ 802' in L and 'To-hit: 9 → miss' in L and 'Round 4 complete' in L, 'S read 802 and missed (9); the Round ended')
        check('GE 25/N' not in L.split('Okafor passes')[-1].split('Round 4 complete')[0].replace('GE 25/N, Sniper) — range', ''),
              'the wounded Sniper did not act')
        shot('german_turn')
        nxt()
        check(wait_beat(9), 'the debrief shows')
        check(pg.evaluate("document.querySelectorAll('.db-row').length") == 4, 'four calls in the report')
        check(pg.evaluate("document.querySelectorAll('.db-mark.miss').length") == 2, 'the two wrong calls are marked')
        shot('debrief_1')
        nxt()
        pg.wait_for_timeout(1500)
        check(pg.evaluate("!!document.querySelector('.chapter.done[data-lesson=\"watch\"]')"), 'chapter 1 is ticked (%s)' % pg.url[-12:])

        # ------------------------------------------------------------ chapter 2 (deep link)
        print('Chapter 2, live')
        pg.goto(PAGE + '?lesson=card')
        check(wait_beat(0), 'beat 1 (the card) shows from a deep link')
        check(pg.evaluate("document.querySelector('#beat-card .pc-kit').textContent") == 'Semi-Auto Rifle · standing · unharmed',
              'his card shows weapon, stance and status')
        shot('card')
        nxt()
        check(wait_beat(1), 'beat 2 (IN) shows')
        nxt()
        check(wait_beat(2), 'beat 3 (WS) asks')
        check(pg.evaluate("document.querySelectorAll('#beat-card .roster tr').length") == 9, 'the squad roster is shown to read from')
        click_counter('us2')
        check('Ruiz' in refusal() and '−1' in refusal(), 'Ruiz is refused by name (WS −1)')
        click_counter('us0')
        check('Weapon Skill is 0' in refusal(), 'a WS 0 soldier is refused')
        shot('ws_refused')
        click_counter('us3')
        check(wait_beat(3), 'Baker (WS +1) is accepted')
        nxt()
        check(wait_beat(4), 'beat 5 (PC) asks')
        click_counter('us1')
        check('Perception is 5' in refusal(), 'a PC 5 soldier is refused')
        click_counter('us4')
        check(wait_beat(5), 'Delvecchio (PC 4) is accepted')
        click_counter('us0')
        check(wait_beat(6), 'Mercer, the commander, is found (his hex carries a move marker)')
        check(us('us4')['hexId'] == 'F1', '... and Delvecchio did not move there')
        click_counter('us1')
        pg.click('#stance-prone')
        check(wait_beat(7), 'Kowalski goes prone from the ring')
        check(us('us1')['stance'] == 'prone' and not board()['dests'], 'prone, and no hex is offered')
        shot('prone')
        nxt()
        check(wait_beat(8), 'beat 9 (up again) asks')
        pg.click('#stance-standing')
        check(wait_beat(9), 'he stands')
        check(us('us1')['stance'] == 'standing' and bool(board()['dests']), 'standing, and he can move again')
        check(pg.evaluate("document.querySelector('#beat-card .pc-kit').textContent").endswith('unharmed'), 'the wounds beat shows a card')
        nxt()
        check(wait_beat(10), 'the debrief shows')
        check(pg.evaluate("document.querySelectorAll('.db-row').length") == 5, 'five decisions in the report')
        check(pg.evaluate("document.querySelectorAll('.db-mark.retry').length") == 2, 'the two puzzles with wrong clicks are marked retries')
        shot('debrief_2')
        nxt()
        pg.wait_for_timeout(1500)
        check(pg.evaluate("document.querySelectorAll('.chapter.done').length") == 2, 'chapters 1 and 2 are ticked')

        check(not errs, 'zero console errors' + ('' if not errs else ': ' + ' | '.join(errs[:5])))
        br.close()

    print('%d failed' % len(fails) if fails else 'all checks passed')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

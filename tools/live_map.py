"""Live check of Learn to Play chapter 3, The map (Phase 7b): plays it in Chromium with real mouse
clicks, wrong hexes first, and asserts what the player must see.

  python3 tools/live_map.py [--shots DIR] [--headed]

Fixture roundThree, seed 31. Every map puzzle refuses a wrong hex in the engine's words (MP cost,
out of reach, the hex that blocks the line, the fire modifier) and takes a right one without moving
anyone; a click on a counter answers for his hex; the sight line is drawn red to its blocking hex
or green; the player's own Move to H3 reaches the real controller and the snap shot rolls the dice
lessons.js quotes (Hit Chance 0, jam 68, to-hit 7); the debrief marks retries; the chapter ticks.
Zero console errors. Exit status 0 only if every check passes.
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


        def refuse_has(*words):
            r = refusal()
            ok = all(w in r for w in words)
            if not ok:
                print('       refusal was: %r' % r)
            return ok

        def sight():
            return pg.evaluate("Array.from(document.querySelectorAll('#sight-layer .sight:not(.end):not(.beyond)')).map(e=>e.getAttribute('class')).join(',')")

        print('Chapter 3, live')
        pg.goto(PAGE + '?lesson=map')
        check(wait_beat(0), 'beat 1 (the ground decides) shows from a deep link')
        check('Round 3' in say() and us('us1')['hexId'] == 'H1' and board()['phase'] == 'round', 'Round 3 of the saved game, Kowalski at H1')
        nxt()
        check(wait_beat(1), 'beat 2 (pick Kowalski) asks')
        click_counter('us3')
        check(refuse_has('Kowalski'), 'another soldier is refused')
        click_counter('us1')
        check(wait_beat(2), 'Kowalski is picked')
        check(board()['currentActorId'] == 'us1', '... and has the turn')
        shot('read_a_hex')
        nxt()
        check(wait_beat(3), 'beat 4 (what it costs) asks')
        click_hex('G2')
        check(refuse_has('G2 is Cover', '1 MP'), 'a 1-MP neighbour is refused with its cost')
        click_hex('H3')
        check(refuse_has('isn’t next to him'), 'a far hex is refused as not adjacent')
        shot('cost_refused')
        click_counter('us2')
        check(wait_beat(4), "a click on Ruiz's counter answers for I1, woods, 2 MP")
        check(us('us2')['hexId'] == 'I1' and us('us1')['hexId'] == 'H1', '... and nobody moved')
        check(say().startswith('Right: I1 is Woods'), 'the next words name the hex picked')
        click_hex('H6')
        check(refuse_has('H6 is out of his reach', '4 MP'), 'an unreachable hex is refused')
        click_hex('H4')
        check(refuse_has('reach H4 for 3 MP', 'further south'), 'a nearer hex is refused with its cost')
        click_hex('H5')
        check(wait_beat(5), 'H5 (4 MP south) is accepted')
        check(sight() == 'sight blocked', 'his sight line to the Sniper is drawn red')
        check(pg.evaluate("!!document.querySelector('#sight-layer .sight-block')"), '... with its blocking hex ringed')
        shot('los_blocked')
        click_hex('J3')
        check(refuse_has('runs on past it'), 'an open hex on the line is refused')
        click_hex('G3')
        check(refuse_has('isn’t on his line'), 'a hex off the line is refused')
        click_hex('K4')
        check(wait_beat(6), 'K4, the woods, is accepted as the block')
        check('Woods at K4' in say(), 'the next words name the block')
        click_hex('I1')
        check(refuse_has('From I1', 'block his view'), 'a reachable hex without sight is refused (woods at J1)')
        check(sight() == 'sight blocked', '... and its line is drawn red')
        shot('line_refused')
        click_hex('J4')
        check(refuse_has('out of his reach'), 'an unreachable hex is refused')
        click_hex('G3')
        check(wait_beat(7), 'G3, in reach and in sight, is accepted')
        check('from G3' in say(), 'the next words name it')
        click_hex('H3')
        check(refuse_has('H3 is Cover', 'gets 0'), 'cover is refused with its modifier')
        click_hex('G1')
        check(refuse_has('G1 is Clear', '+1'), 'clear ground is refused with its modifier')
        click_counter('us3')
        check(wait_beat(8), "J1 (woods, -2), under Baker's counter, is accepted")
        check(sight() == 'sight clear', 'the H3 line is drawn green')
        shot('trade')
        click_hex('H3')
        check(refuse_has('Move, in the ring'), 'a map click before Move is refused')
        pg.click('#moveBtn')
        pg.wait_for_timeout(600)
        check('H3' in board()['dests'], 'Move offers H3')
        click_hex('H2')
        check(refuse_has('That isn’t H3'), 'the wrong destination is refused')
        click_hex('H3')
        check(wait_beat(9, timeout=90), 'he moves; the shot beat asks')
        check(us('us1')['hexId'] == 'H3', 'Kowalski is at H3')
        p = pg.evaluate('AmbushMission.lesson.pending()')
        check(bool(p) and p.get('title') == 'Combo Action', 'the game offers the follow-up action')
        shot('shot_ask')
        click_hex('G3')
        check('Make your call' in refusal(), 'a click before the call is refused')
        answer(1)
        check(verdict().startswith('Not quite') and 'snap' in verdict(), 'the forgot-the-snap call is explained')
        seen = ''
        for _ in range(200):   # the target picker is open for a moment while the lesson plays the shot
            p = pg.evaluate('AmbushMission.lesson.pending()')
            if p and p.get('title', '').startswith('Select Target'):
                seen = p.get('text', '')
                break
            pg.wait_for_timeout(50)
        check('Base 5 (short range) -4 terrain, +1 WS, -2 snap → Hit Chance 0' in seen, 'the target picker reads Hit Chance 0 from 5 -4 +1 -2')
        check(wait_beat(10, timeout=90), 'the lesson takes the shot; the miss beat follows')
        L = log()
        check('fires (snap)' in L and 'Jam check: 68' in L and 'To-hit: 7 → miss' in L, 'the board rolled the quoted dice (snap, jam 68, to-hit 7)')
        shot('miss')
        nxt()
        check(wait_beat(11), 'the debrief shows')
        check(pg.evaluate("document.querySelectorAll('.db-row').length") == 8, 'eight decisions in the report')
        check(pg.evaluate("document.querySelectorAll('.db-mark.retry').length") == 7, 'the seven puzzles with wrong clicks are marked retries')
        check(pg.evaluate("document.querySelectorAll('.db-mark.miss').length") == 1, 'the wrong call is marked')
        shot('debrief_3')
        nxt()
        pg.wait_for_timeout(1500)
        check(pg.evaluate("!!document.querySelector('.chapter.done[data-lesson=\"map\"]')"), 'chapter 3 is ticked')

        check(not errs, 'zero console errors' + ('' if not errs else ': ' + ' | '.join(errs[:5])))
        br.close()

    print('%d failed' % len(fails) if fails else 'all checks passed')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

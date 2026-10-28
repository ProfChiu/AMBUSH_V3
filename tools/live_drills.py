"""Live check of Learn to Play chapter 4, Drills (Phase 8a): plays it in Chromium with real mouse
clicks, wrong answers first, and asserts what the player must see.

  python3 tools/live_drills.py [--shots DIR] [--headed]

Fixture roundFourDrills (Event markers on J5, K6), seed 3663131667 (roundFour, seed 41 before Phase 8c). The move puzzle refuses a hex not beside the Sniper and one beside him
out of reach, in the engine's words; Kowalski's own Move reaches L6 with nothing activated; Ruiz's
aimed shot, Baker's grenade and Kowalski's charge assault are each the player's clicks (verb, target
row, capture-or-kill button), a wrong dialog button is refused, the pickers' odds match the words
(0, 4, 4) and the board rolls the dice lessons.js quotes (miss 8; throw 4, dud 07, damage 8 = I;
assault 3, damage 3 = Z); the debrief marks retries and wrong calls; the chapter ticks. Zero
console errors. Exit status 0 only if every check passes.
"""
import argparse
import os
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

        print('Chapter 4, live')
        pg.goto(PAGE + '?lesson=drills')
        check(wait_beat(0), 'beat 1 (four drills) shows from a deep link')
        check('Round 4' in say() and us('us1')['hexId'] == 'I5' and board()['currentActorId'] == 'us1', 'Round 4 of the saved game, Kowalski to act at I5')
        nxt()
        check(wait_beat(1), 'beat 2 (aimed or snap) asks')
        click_hex('L6')
        check('Make your call' in refusal(), 'a click before the call is refused')
        answer(1)
        check(verdict().startswith('Not quite') and 'snap' in verdict(), 'the snap-fire answer is explained')
        nxt()
        check(wait_beat(2), 'beat 3 (drill 1: move) asks')
        click_hex('J5')
        check(refuse_has('J5 isn’t next to the Sniper'), 'a hex away from the Sniper is refused')
        click_hex('M6')
        check(refuse_has('M6 is Woods', 'out of reach', '4 MP'), 'a hex beside him out of reach is refused with the MP')
        shot('move_refused')
        click_hex('L6')
        check(wait_beat(3), 'L6, the one hex beside him in reach, is accepted')
        check(say().startswith('Right: L6') and '4 MP' in say(), 'the next words name the hex and its cost')
        check(us('us1')['hexId'] == 'I5', '... and nobody moved')
        click_hex('L6')
        check(refuse_has('Move, in the ring'), 'a map click before Move is refused')
        pg.click('#moveBtn')
        pg.wait_for_timeout(600)
        check('L6' in board()['dests'], 'Move offers L6')
        click_hex('K6')
        check(refuse_has('That isn’t L6'), 'the wrong destination is refused')
        click_hex('L6')
        check(wait_beat(4, timeout=90), 'he walks; the Ruiz beat asks')
        check(us('us1')['hexId'] == 'L6', 'Kowalski is at L6 (%s)' % us('us1')['hexId'])
        check('German activated' not in log(), '... and nothing activated on the way')
        click_counter('us3')
        check(refuse_has('Ruiz'), 'another soldier is refused by name')
        click_counter('us2')
        check(wait_beat(5), 'Ruiz is picked; his shot question asks')
        check(board()['currentActorId'] == 'us2', '... and has the turn')
        answer(1)
        check(verdict().startswith('Not quite') and 'Weapon Skill' in verdict(), 'the wrong Weapon Skill answer is explained')
        nxt()
        check(wait_beat(6), 'beat 7 (take the shot) asks')
        click_hex('O4')
        check(refuse_has('Aimed fire, in the ring'), 'a map click before Aimed is refused')
        pg.click('#fireAimed')
        p = wait_dialog('Select Target')
        check(bool(p) and 'Base 5 (short range) -4 terrain, -1 WS → Hit Chance 0' in p.get('text', ''), 'the picker reads Hit Chance 0 from 5 -4 -1')
        click_button('cancel')
        check(refuse_has('Pick the Soldier'), 'Cancel is refused while the target is asked for')
        shot('target_picker')
        click_row(0)
        check(wait_beat(7, timeout=90), 'Ruiz fires; the miss beat follows')
        L = log()
        check('Ruiz fires (aimed)' in L and 'Jam check: 65' in L and 'To-hit: 8 → miss' in L, 'the board rolled the quoted dice (aimed, jam 65, to-hit 8)')
        nxt()
        check(wait_beat(8), 'beat 9 (Baker) asks')
        click_counter('us5')
        check(refuse_has('Baker'), 'Okafor is refused: Baker is asked for')
        click_counter('us3')
        check(wait_beat(9), 'Baker is picked; the grenade question asks')
        check(us('us3')['jammed'] and board()['verbs'].get('grenade') and not board()['verbs'].get('fireAimed'), 'his rifle is jammed, the grenade is offered')
        answer(1)
        check(verdict().startswith('Not quite') and '−4' in verdict(), 'the cover answer is explained')
        nxt()
        check(wait_beat(10), 'beat 11 (throw it) asks')
        pg.click('#grenadeBtn')
        p = wait_dialog('Select Target')
        check(bool(p) and p.get('rows') and p['rows'][0]['odds'] == 4, 'the picker gives the grenade Hit Chance 4')
        click_row(0)
        check(wait_beat(11, timeout=90), 'Baker throws; the result beat follows')
        L = log()
        check('Grenade throw: 4 → lands in O4' in L and 'Dud check: 07' in L and ': 8 → I' in L, 'the board rolled the quoted dice (throw 4, dud 07, damage 8 = I)')
        check(german('GE 53/S')['status'] == 'incapacitated', 'the Soldier is incapacitated')
        shot('grenade')
        nxt()
        check(wait_beat(12), 'beat 13 (Kowalski again) asks')
        click_counter('us1')
        check(wait_beat(13), "Kowalski's second turn; the assault question asks")
        check(board()['verbs'].get('assault'), 'Assault is offered beside the Sniper')
        answer(0)
        check(verdict() and not verdict().startswith('Not quite'), 'the right call is confirmed')
        nxt()
        check(wait_beat(14), 'beat 15 (go in) asks')
        pg.click('#assaultBtn')
        p = wait_dialog('Select Target')
        check(bool(p) and p.get('rows') and p['rows'][0]['odds'] == 4 and 'Charge assault' in p['rows'][0]['text'], 'the picker gives the charge assault Hit Chance 4')
        click_row(0)
        p = wait_dialog('Capture or Kill')
        check(bool(p), 'the capture-or-kill call is asked')
        click_button('cancel')
        check(refuse_has('Capture', 'Kill'), 'Cancel is refused: capture or kill is asked for')
        shot('capture_or_kill')
        click_button('capture')
        check(wait_beat(15, timeout=90), 'Kowalski goes in; the result beat follows')
        L = log()
        if os.environ.get('LIVE_DUMP'): open(os.environ['LIVE_DUMP'], 'w').write(L)  # the radio log, for re-fitting quotes
        check('Assault to-hit: 3 → HIT' in L and 'Assault damage: 3 → Z' in L, 'the board rolled the quoted dice (to-hit 3, damage 3 = Z)')
        check(german('GE 25/N')['status'] == 'wounded' and us('us1')['hexId'] == 'M7', 'the Sniper is wounded, Kowalski in his hex')
        check('capture row' in say(), 'the words follow the capture call')
        shot('assault')
        nxt()
        check(wait_beat(16), 'the debrief shows')
        rows = pg.evaluate("document.querySelectorAll('.db-row').length")
        retry = pg.evaluate("document.querySelectorAll('.db-mark.retry').length")
        miss = pg.evaluate("document.querySelectorAll('.db-mark.miss').length")
        check(rows == 12, 'twelve decisions in the report (%d)' % rows)
        check(retry == 6, 'the six steps with wrong clicks are marked retries (%d)' % retry)
        check(miss == 3, 'the three wrong calls are marked (%d)' % miss)
        shot('debrief_4')
        nxt()
        pg.wait_for_timeout(1500)
        check(pg.evaluate("!!document.querySelector('.chapter.done[data-lesson=\"drills\"]')"), 'chapter 4 is ticked')

        check(not errs, 'zero console errors' + ('' if not errs else ': ' + ' | '.join(errs[:5])))
        br.close()

    print('%d failed' % len(fails) if fails else 'all checks passed')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

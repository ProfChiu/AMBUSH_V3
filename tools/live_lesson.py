"""Live check of the Learn to Play lesson (Phase 6): plays Basic Training in Chromium with real
mouse clicks, wrong ones first, and asserts what the player must see.

  python3 tools/live_lesson.py [--shots DIR] [--headed]

Checks: the chapter list opens from the title; every beat shows in Whitaker's bubble; a click
that does not fit the step is refused in words and changes nothing; the right clicks go through
to the real controller; the dice quoted in lessons.js are the dice the board rolls (seed 11);
Kranz cuts in on contact; Back re-reads an earlier beat; Finish ticks the chapter; zero console
errors. Exit status 0 only if every check passes.
"""
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

        def wait_beat(i, timeout=40):
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

        def us(sid):
            return [u for u in pg.evaluate('AmbushMission.lesson.board()')['us'] if u['id'] == sid][0]

        def log():
            return pg.evaluate("Array.from(document.querySelectorAll('#combatlog .log-line')).map(e=>e.textContent).join(' | ')")

        print('Basic Training, live')
        pg.goto(PAGE)
        pg.wait_for_timeout(900)
        pg.click('#t-learn')
        pg.wait_for_timeout(700)
        check(pg.evaluate("document.getElementById('learn').classList.contains('show')"), 'Learn to play opens the chapter list')
        check(pg.evaluate("document.querySelectorAll('.chapter').length") == 7, 'seven chapters listed (Basic Training + 1-6)')
        check(pg.evaluate("document.querySelectorAll('.chapter.live').length") == 6, 'six chapters playable (Basic Training, 1-5), chapter 6 locked')
        shot('chapters')
        pg.click('.chapter.live')

        check(wait_beat(0), 'beat 1 (welcome) shows')
        check('Whitaker' in say(), 'Whitaker introduces herself')
        check(pg.evaluate("document.getElementById('guide-img').getAttribute('src')").endswith('face-happy.png'), 'her talking face')
        shot('welcome')
        # a board click before Next is refused, and does nothing
        click_counter('us1')
        check('Next' in refusal(), 'a counter click on a talk beat is refused ("press Next")')
        check(pg.evaluate('AmbushMission.lesson.board().selectedId') is None, '... and selects nobody')
        nxt()

        check(wait_beat(1), 'beat 2 (meet Kowalski) shows')
        check(pg.evaluate("!document.getElementById('beat-card').hidden"), 'his counter is shown large in the bubble')
        check(pg.evaluate("!document.getElementById('lesson-spot').classList.contains('none')"), 'the spotlight rings him')
        pg.click('#btn-why')
        check(pg.evaluate("getComputedStyle(document.getElementById('beat-explain')).display") == 'block', 'Why? opens the rule behind it')
        shot('meet_kowalski')
        nxt()

        check(wait_beat(2), 'beat 3 (first move) waits for the player')
        check(pg.evaluate("document.getElementById('btn-continue').hidden"), 'Next is hidden while a move is asked for')
        click_counter('us0')
        check('Kowalski' in refusal(), 'selecting the wrong soldier is refused in words')
        check(pg.evaluate('AmbushMission.lesson.board().selectedId') is None, '... and selects nobody')
        shot('refused_wrong_soldier')
        click_counter('us1')
        check(pg.evaluate('AmbushMission.lesson.board().selectedId') == 'us1', 'clicking Kowalski selects him (the real handler)')
        check(st()['step'] == 1, 'the first step ticks')
        check(refusal() == '', '... and the refusal before it clears')
        pg.wait_for_timeout(1300)
        click_hex('G2')
        check('H2' in refusal(), 'a walk to the wrong hex is refused')
        check(us('us1')['hexId'] == 'H1', '... and he has not moved (G2 is a legal walk, not the lesson\'s)')
        shot('refused_wrong_hex')
        click_hex('H2')
        check(wait_beat(3), 'the move plays out, then beat 4 shows')
        check(us('us1')['hexId'] == 'H2', 'Kowalski is at H2')
        lg = log()
        check('Paragraph 295' in lg and 'Activation Check: 5 → fail' in lg and 'Perception Check: 5 → fail' in lg,
              'the board rolled what the words say (295: Activation 5 fail, Perception 5 fail)')
        shot('paragraph_295')
        nxt()

        check(wait_beat(4), 'beat 5 (one more hex) waits')
        click_counter('us1')
        pg.wait_for_timeout(1300)
        click_hex('H3')
        check(wait_beat(5, timeout=60), 'contact: beat 6 shows')
        lg = log()
        check('Paragraph 185' in lg and 'Activation Check: 6 → fail' in lg and 'Perception Check: 5 → success' in lg and 'Paragraph 316' in lg,
              'the board rolled what the words say (185: Activation 6 fail, Perception 5 success, to 316)')
        g = pg.evaluate('AmbushMission.lesson.board()')['germans']
        check(any(x['hexId'] == 'M7' and x['role'] == 'Sniper' for x in g), 'a German Sniper is at M7')
        # The board reveals one German per card while the beat shows; give the second one time.
        t0 = time.time()
        while time.time() - t0 < 30 and not any(x['hexId'] == 'M5' for x in g):
            pg.wait_for_timeout(500)
            g = pg.evaluate('AmbushMission.lesson.board()')['germans']
        check(any(x['hexId'] == 'M5' and x['role'] == 'Officer' for x in g), 'an Officer is at M5 (paragraph 316: German 34)')
        kr = pg.evaluate('AmbushCues.state().kranz') or ''
        check('Achtung' in kr, 'Kranz cuts in (%s...)' % kr[:40])
        shot('contact')
        pg.click('#btn-back')
        pg.wait_for_timeout(700)
        check(pg.evaluate("document.getElementById('tutor').classList.contains('reviewing')") and 'One more hex' in pg.evaluate("document.getElementById('beat-title').textContent"),
              'Back re-reads the beat before')
        nxt()
        pg.wait_for_timeout(700)
        check('Contact' in pg.evaluate("document.getElementById('beat-title').textContent"), 'Next returns to the live beat')
        nxt()

        check(wait_beat(6), 'the debrief shows')
        rows = pg.evaluate("document.querySelectorAll('.db-row').length")
        check(rows == 2, 'the after-action report lists both moves (%d)' % rows)
        check(pg.evaluate("document.querySelectorAll('.db-mark.retry').length") == 1, 'the first move is marked a retry (a wrong click came first)')
        check(pg.evaluate("document.getElementById('btn-continue').textContent") == 'Finish', 'the last button says Finish')
        shot('debrief')
        nxt()
        pg.wait_for_timeout(1500)
        check('learn=1' in pg.url and pg.evaluate("document.getElementById('learn').classList.contains('show')"), 'Finish returns to the chapter list')
        check(pg.evaluate("document.querySelectorAll('.chapter.done').length") == 1, 'Basic Training is ticked')
        shot('ticked')

        check(not errs, 'zero console errors' + ('' if not errs else ': ' + ' | '.join(errs[:5])))
        br.close()

    print('%d failed' % len(fails) if fails else 'all checks passed')
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())

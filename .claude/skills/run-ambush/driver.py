#!/usr/bin/env python3
"""
driver.py — Playwright driver for Ambush! Digital's static HTML apps.

Both apps (apps/trainer/, apps/game/) are plain HTML/JS with no build step and no dev
server — every page is opened directly via a file:// URL. This driver wraps the handful
of things that are fiddly to get right by hand:

  - opening a page by its repo-relative path and catching console/page errors from the
    very first paint (a page that throws on load can still render its static shell,
    so "it looks fine" is not enough — always check .errors)
  - clicking a hex by its printed ID (e.g. "L9") on any page that loads hexgrid.js and
    positions elements with the AmbushHexGrid.hexToPixel() percentage convention
    (#map-canvas, left/top in %) — apps/game/mainscreen.html, movementsandbox.html,
    hexinspector.html, lossandbox.html all do this; computing the click point from the
    grid math (not eyeballed pixel percentages) is what makes this reusable across all
    four instead of re-deriving hex coordinates by hand each time.

Usage as a library (see SKILL.md for full transcripts):

    from driver import AmbushPage
    with AmbushPage(headless=True) as page:
        page.open('apps/game/lossandbox.html')
        page.click_hex('L9')
        page.click_hex('P12')
        page.screenshot('/tmp/out.png')
        assert page.errors == []

Usage as a quick CLI smoke check:

    python3 driver.py apps/game/lossandbox.html --click-hex L9 --click-hex P12 \
        --screenshot /tmp/out.png
"""
import argparse
import os
import sys

from playwright.sync_api import sync_playwright

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))


class AmbushPage:
    def __init__(self, headless=True, viewport=(1500, 950)):
        self._pw = sync_playwright().start()
        self._browser = self._pw.chromium.launch(headless=headless)
        self.page = self._browser.new_page(viewport={'width': viewport[0], 'height': viewport[1]})
        self.errors = []
        self.page.on('console', lambda m: self.errors.append(m.text) if m.type == 'error' else None)
        self.page.on('pageerror', lambda exc: self.errors.append('PAGEERROR: ' + str(exc)))

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def open(self, repo_relative_path, wait_ms=300):
        """repo_relative_path e.g. 'apps/game/lossandbox.html' — relative to REPO_ROOT."""
        url = 'file://' + os.path.join(REPO_ROOT, repo_relative_path)
        self.page.goto(url)
        self.page.wait_for_timeout(wait_ms)

    def click_hex(self, hex_id, canvas_selector='#map-canvas', wait_ms=200):
        """Click the hex with this printed ID (e.g. 'L9') on a page using hexgrid.js's
        percentage-position convention. Reads the real grid math from the page itself
        (window.AmbushHexGrid) rather than guessing pixel coordinates by hand."""
        pct = self.page.evaluate(
            '''(id) => {
                const G = window.AmbushHexGrid;
                const p = G.parseId(id);
                if (!p) return null;
                const px = G.hexToPixel(p.colIdx, p.rowIdx);
                return { x: px.pctX, y: px.pctY };
            }''',
            hex_id,
        )
        if pct is None:
            raise ValueError('not a valid hex id on this grid: ' + hex_id)
        box = self.page.locator(canvas_selector).bounding_box()
        cx = box['x'] + box['width'] * pct['x'] / 100
        cy = box['y'] + box['height'] * pct['y'] / 100
        self.page.mouse.click(cx, cy)
        self.page.wait_for_timeout(wait_ms)

    def click(self, selector, wait_ms=200):
        self.page.locator(selector).click()
        self.page.wait_for_timeout(wait_ms)

    def text(self, selector):
        return self.page.locator(selector).inner_text()

    def screenshot(self, path):
        self.page.screenshot(path=path)

    def close(self):
        self._browser.close()
        self._pw.stop()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('page', help='repo-relative path, e.g. apps/game/lossandbox.html')
    ap.add_argument('--click', action='append', default=[], help='CSS selector to click, in order')
    ap.add_argument('--click-hex', action='append', default=[], dest='click_hex', help='hex ID to click, in order')
    ap.add_argument('--screenshot', help='path to save a final screenshot')
    ap.add_argument('--headed', action='store_true')
    args = ap.parse_args()

    with AmbushPage(headless=not args.headed) as p:
        p.open(args.page)
        for sel in args.click:
            p.click(sel)
        for hid in args.click_hex:
            p.click_hex(hid)
        if args.screenshot:
            p.screenshot(args.screenshot)
            print('screenshot:', args.screenshot)
        print('console/page errors:', p.errors)
        sys.exit(1 if p.errors else 0)


if __name__ == '__main__':
    main()

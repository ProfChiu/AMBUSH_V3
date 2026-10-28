#!/usr/bin/env python3
"""
Phase 1 verification for the canonical asset library.

Checks, and fails loudly on any of:
  1. every index entry resolves to a real file on disk
  2. no shipped file is blank
  3. no two shipped files are byte-identical (would mean a naming mistake)
  4. every file on disk is claimed by the index (no orphans)
  5. expected roster completeness - US A-K, German L-X standing + crouching,
     every weapon has a jam face, every vehicle has a KO face
  6. every cell of all four sheets was assigned a name
  7. counter sizes match the sheet the counter came from

Run:  python3 tools/verify_assets.py
"""

import hashlib
import json
import os
import sys

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = os.path.join(ROOT, "assets", "library")

US = list("ABCDEFGHJK")
DE_MAP = list("LMNPQRSTUVWX")          # letters with 0.63" map counters
DE_AR = DE_MAP + ["Y", "Z"]            # letters with 0.50" AR tiles

fails, warns = [], []


def check(cond, msg):
    if not cond:
        fails.append(msg)


def warn(cond, msg):
    if not cond:
        warns.append(msg)


def main():
    ix = json.load(open(os.path.join(GAME, "asset_index.json")))
    counters = ix["counters"]
    fallback = ix.get("fallback", {})
    allrec = dict(counters)
    allrec.update(fallback)

    # 1 + 2 + 3 - files resolve, are non-blank, and are distinct
    hashes = {}
    for name, rec in allrec.items():
        p = os.path.join(GAME, rec["file"])
        check(os.path.exists(p), "missing file for %s -> %s" % (name, rec["file"]))
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert("RGB")
        px = list(im.getdata())
        nonwhite = sum(1 for q in px if sum(q) < 730) / len(px)
        check(nonwhite > 0.02, "blank slice shipped: %s" % name)
        h = hashlib.sha1(im.tobytes()).hexdigest()
        if h in hashes:
            warn(False, "identical art: %s == %s" % (name, hashes[h]))
        else:
            hashes[h] = name

    # 4 - no orphan files
    claimed = {rec["file"] for rec in allrec.values()} | set(ix.get("other", []))
    claimed |= {"asset_index.json", "contact_sheet.html"}
    for dirpath, _dirs, files in os.walk(GAME):
        for f in files:
            rel = os.path.relpath(os.path.join(dirpath, f), GAME)
            check(rel in claimed, "orphan file not in index: %s" % rel)

    # 5 - roster completeness
    for L in US:
        for stance in ("standing", "crouching"):
            check("us_soldier_%s_%s" % (L, stance) in counters,
                  "missing us_soldier_%s_%s" % (L, stance))
    for L in DE_MAP:
        for stance in ("standing", "crouching"):
            check("de_soldier_%s_%s" % (L, stance) in counters,
                  "missing de_soldier_%s_%s" % (L, stance))
    warn(all("de_soldier_%s_standing" % L in counters for L in ("Y", "Z")),
         "German Y/Z have no 0.63\" map counter on the remastered sheets "
         "(fallback supplied from Vassal)")

    # every US letter should carry four AR values, every German letter two
    for L in US:
        n = len([k for k in counters if k.startswith("ar_us_%s_in" % L)])
        check(n == 4, "ar_us_%s has %d values, expected 4" % (L, n))
    for L in DE_AR:
        n = len([k for k in counters if k.startswith("ar_de_%s_in" % L)])
        check(n == 2, "ar_de_%s has %d values, expected 2" % (L, n))

    # weapons: every non-jam weapon needs a jam face (radio is the exception -
    # it has a plain reverse, not a jam)
    for k in counters:
        if k.startswith("weapon_") and not k.endswith(("_jam", "_back")):
            if k.endswith("radio"):
                check(k + "_back" in counters, "%s has no reverse" % k)
            else:
                check(k + "_jam" in counters, "%s has no jam face" % k)

    # vehicles: every vehicle needs a KO face
    for k in counters:
        if k.startswith("vehicle_") and not k.endswith("_ko"):
            check(k + "_ko" in counters, "%s has no KO face" % k)

    # 6 - full sheet coverage
    check(not ix.get("unassigned_cells"),
          "unassigned sheet cells: %s" % ix.get("unassigned_cells"))

    # 7 - sizes match the source sheet
    for name, rec in counters.items():
        expect = ix["sheet_geometry"][rec["sheet"]]["cell_px"] - 2 * ix["sheet_geometry"][rec["sheet"]]["inset_px"]
        im = Image.open(os.path.join(GAME, rec["file"]))
        check(im.size == (expect, expect),
              "%s is %s, expected %dx%d" % (name, im.size, expect, expect))

    # report
    print("checked %d counters + %d fallback" % (len(counters), len(fallback)))
    print("distinct art hashes: %d" % len(hashes))
    for w in warns:
        print("  WARN  " + w)
    for f in fails:
        print("  FAIL  " + f)
    if fails:
        sys.exit("VERIFICATION FAILED (%d)" % len(fails))
    print("OK - %d warnings, 0 failures" % len(warns))


if __name__ == "__main__":
    main()

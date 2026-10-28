#!/usr/bin/env python3
"""make_temp_tokens.py: placeholder weapon tokens until the final art (Wan, 2026-10-25).

Draws the tokens Mission 1 needs that assets/library/weapons/ lacks, in the existing tokens'
style (140x140, transparent, art on the diagonal, bold black label with a white outline at the
bottom right; a _jam twin adds the white X and "Jam" from the real jam tokens). Written under
their final names, so dropping in the real art replaces them with no code change. The list is in
assets/library/weapons/TEMP_TOKENS.md.
  python3 tools/make_temp_tokens.py
"""
import os
from PIL import Image, ImageChops, ImageDraw, ImageFont

ROOT = os.path.join(os.path.dirname(__file__), '..')
W = os.path.join(ROOT, 'assets/library/weapons')
FONT = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial Bold.ttf', 30)
S = 140


def label(im, text):
    d = ImageDraw.Draw(im)
    box = d.textbbox((0, 0), text, font=FONT)
    x, y = S - 6 - (box[2] - box[0]), S - 6 - (box[3] - box[1]) - box[1]
    d.text((x, y), text, font=FONT, fill=(0, 0, 0, 255), stroke_width=3, stroke_fill=(255, 255, 255, 255))
    return im


def jam_overlay():
    """The white X and 'Jam' the real tokens add: the jam token minus its plain twin."""
    a = Image.open(os.path.join(W, 'weapon_de_bolt.png')).convert('RGBA')
    b = Image.open(os.path.join(W, 'weapon_de_bolt_jam.png')).convert('RGBA')
    diff = ImageChops.difference(a, b).convert('L').point(lambda v: 255 if v > 40 else 0)
    ImageDraw.Draw(diff).rectangle((48, 100, S, S), fill=0)    # the label differs too: keep X and Jam only
    over = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    over.paste(b, (0, 0), diff)
    return over


def scope():
    im = Image.open(os.path.join(W, 'weapon_de_bolt.png')).convert('RGBA')
    d = ImageDraw.Draw(im)
    d.rectangle((48, 100, S, S), fill=(0, 0, 0, 0))           # clear the "Bolt" label
    # the scope: a dark tube riding above the receiver, parallel to the barrel
    x0, y0, x1, y1 = 52, 64, 80, 34
    d.line((x0, y0, x1, y1), fill=(30, 30, 30, 255), width=9)
    d.line((x0 + 1, y0 - 2, x1 + 1, y1 - 2), fill=(90, 90, 90, 255), width=2)
    for (cx, cy) in ((x0, y0), (x1, y1)):
        d.ellipse((cx - 6, cy - 6, cx + 6, cy + 6), fill=(25, 25, 25, 255))
    d.line((62, 62, 58, 68), fill=(30, 30, 30, 255), width=3)  # mounts
    d.line((72, 51, 68, 57), fill=(30, 30, 30, 255), width=3)
    return label(im, 'Scope')


def grenade_us():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((22, 34, 82, 104), fill=(78, 90, 52, 255), outline=(30, 34, 20, 255), width=3)
    for i in range(1, 4):                                       # the pineapple's grooves
        d.line((22 + i * 15, 38, 22 + i * 15, 100), fill=(48, 56, 30, 255), width=3)
        d.line((26, 34 + i * 17, 78, 34 + i * 17), fill=(48, 56, 30, 255), width=3)
    d.rectangle((42, 22, 62, 36), fill=(110, 110, 100, 255), outline=(40, 40, 36, 255), width=2)  # fuze
    d.line((60, 26, 86, 60), fill=(150, 150, 140, 255), width=5)  # spoon
    d.ellipse((30, 10, 46, 26), outline=(170, 170, 160, 255), width=3)  # pin ring
    return label(im, 'Gren')


def grenade_de():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.line((26, 112, 78, 50), fill=(150, 105, 60, 255), width=12)        # wooden handle
    d.line((26, 112, 78, 50), fill=(120, 80, 45, 255), width=4)
    d.line((76, 52, 106, 18), fill=(40, 42, 38, 255), width=30)      # the head: a can on the end of the stick
    d.line((76, 52, 106, 18), fill=(95, 100, 92, 255), width=24)
    d.line((80, 54, 108, 22), fill=(130, 135, 125, 255), width=4)
    d.ellipse((20, 108, 32, 120), fill=(60, 62, 58, 255))               # cap
    return label(im, 'Gren')


def clip():
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    for i in range(5):                                            # five brass rounds in a clip
        x = 24 + i * 15
        d.rounded_rectangle((x, 30, x + 12, 92), radius=4, fill=(196, 150, 60, 255), outline=(90, 64, 20, 255), width=2)
        d.polygon([(x, 30), (x + 12, 30), (x + 6, 16)], fill=(170, 110, 60, 255), outline=(90, 64, 20, 255))
    d.rectangle((20, 86, 100, 96), fill=(120, 120, 110, 255), outline=(50, 50, 45, 255), width=2)
    return label(im, 'Clip')


jam = jam_overlay()
made = {
    'weapon_de_scope.png': scope(),
    'item_grenade_us.png': grenade_us(),
    'item_grenade_de.png': grenade_de(),
    'item_clip.png': clip(),
}
made['weapon_de_scope_jam.png'] = Image.alpha_composite(made['weapon_de_scope.png'].copy(), jam)
for name, im in made.items():
    im.save(os.path.join(W, name))
    print('wrote', name)

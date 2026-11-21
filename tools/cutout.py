#!/usr/bin/env python3
"""Turn a shoe photo with a plain grey or coloured background into a pure white background.

Uses rembg (MIT) with its local ISNet model, so nothing is sent to any service. The model file (about 170 MB) is
downloaded once from the rembg GitHub releases and checked against a fixed hash.
Install once, in its own environment:  python3 -m venv .cutout-venv && .cutout-venv/bin/pip install -r tools/requirements-cutout.txt
Use:  .cutout-venv/bin/python tools/cutout.py photo.jpg out.png [--crop LEFT TOP RIGHT BOTTOM]
Then give out.png to tools/add-shoes.py like any white-background photo.
"""
import argparse
from PIL import Image
from rembg import new_session, remove

ap = argparse.ArgumentParser()
ap.add_argument('src'); ap.add_argument('dst')
ap.add_argument('--crop', nargs=4, type=int, metavar=('L', 'T', 'R', 'B'), help='keep only this box (use it to cut one shoe out of a photo with several)')
ap.add_argument('--model', default='isnet-general-use')
a = ap.parse_args()

im = Image.open(a.src).convert('RGB')
if a.crop: im = im.crop(tuple(a.crop))
pad = 24                                    # white margin so a shoe touching the edge keeps a clean outline
padded = Image.new('RGB', (im.width + 2 * pad, im.height + 2 * pad), (255, 255, 255)); padded.paste(im, (pad, pad))
cut = remove(padded, session=new_session(a.model))          # RGBA
white = Image.new('RGB', cut.size, (255, 255, 255)); white.paste(cut, mask=cut.getchannel('A'))
white.save(a.dst)
print('wrote', a.dst, white.size)

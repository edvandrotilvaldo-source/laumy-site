#!/usr/bin/env python3
"""Add products to the Keep site without touching the ones already there.

Each product = two photos on a pure white background: a 3/4 view and a front view, toe pointing right.
The script works out which is which (the 3/4 view is the wide one), cleans the white, fits both into the
common 1200x960 canvas, saves WebP, appends the product to data/products.src.json and rebuilds the page data.

One photo only (no front view; a retail photo that already has its soft shadow):
  python3 tools/add-products.py --group Reebok --name "Pump" --color "Branco" --baked-shadow photo.jpg
Explicit pair:
  python3 tools/add-products.py --group Nike --name "Air Max 90" --color "Branco" photo1.png photo2.png
A whole folder (files named "<Name> - <Colour> - lado.png" and "<Name> - <Colour> - frente.png"):
  python3 tools/add-products.py --group Nike --folder /path/to/Nike
New brands are added automatically (they appear as a new tab). Needs Pillow and numpy; run from the project folder.
"""
import argparse, json, re, subprocess, sys, unicodedata
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CW, CH, BW, BH = 1200, 960, 1000, 860
SRC = ROOT / 'data' / 'products.src.json'
BASE = ROOT / 'data' / 'baselines.json'
OUT = ROOT / 'img' / 'products'


def slugify(s):
    s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode().lower()
    return re.sub(r'[^a-z0-9]+', '-', s).strip('-')


def load(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    corner = np.median(np.concatenate([a[0, :], a[-1, :], a[:, 0], a[:, -1]]).min(axis=1))
    if corner < 240:
        sys.exit(f'{path}: the background is not white (corner value {corner:.0f}). Use a pure white background.')
    a = np.minimum(255.0, a * (255.0 / max(corner, 1)))   # lift the near-white to true 255
    a[a.min(axis=2) >= 250] = 255
    return a.astype(np.uint8)


def bbox(a):
    ys, xs = np.where(a.min(axis=2) < 240)
    return xs.min(), ys.min(), xs.max() + 1, ys.max() + 1


def place(a, box, scale):
    x0, y0, x1, y1 = box
    im = Image.fromarray(a[y0:y1, x0:x1])
    w, h = max(1, round((x1 - x0) * scale)), max(1, round((y1 - y0) * scale))
    im = im.resize((w, h), Image.LANCZOS)
    c = Image.new('RGB', (CW, CH), (255, 255, 255))
    c.paste(im, ((CW - w) // 2, (CH - h) // 2))
    return c


MIN_SIDE = 700   # the product's longest side must be at least this many px in the photo, or it looks soft on big screens


def process_single(p, slug, allow_low):
    a = load(p); k = bbox(a)
    w, h = k[2] - k[0], k[3] - k[1]
    if max(w, h) < MIN_SIDE and not allow_low:
        sys.exit(f'{p}: the product is only {max(w, h)}px on its longest side in the photo (minimum {MIN_SIDE}). Send a bigger photo or use --allow-low-res.')
    s = min(BW / w, BH / h)
    OUT.mkdir(parents=True, exist_ok=True)
    place(a, k, s).save(OUT / f'{slug}-3q.webp', 'WEBP', quality=86, method=6)
    return round(((CH + round(h * s)) / 2) / CH, 4)


def process(p1, p2, slug):
    imgs = [(p, load(p)) for p in (p1, p2)]
    boxes = [bbox(a) for _, a in imgs]
    ratio = [(b[2] - b[0]) / (b[3] - b[1]) for b in boxes]
    side = 0 if ratio[0] >= ratio[1] else 1
    front = 1 - side
    if abs(ratio[0] - ratio[1]) < .25:
        sys.exit(f'{slug}: both photos have the same proportions. One must be the 3/4 view and one the front view.')
    a3, k3 = imgs[side][1], boxes[side]
    af, kf = imgs[front][1], boxes[front]
    w3, h3 = k3[2] - k3[0], k3[3] - k3[1]
    wf, hf = kf[2] - kf[0], kf[3] - kf[1]
    s3 = min(BW / w3, BH / h3)
    sf = min(s3, 880 / hf, BW / wf)
    OUT.mkdir(parents=True, exist_ok=True)
    place(a3, k3, s3).save(OUT / f'{slug}-3q.webp', 'WEBP', quality=86, method=6)
    place(af, kf, sf).save(OUT / f'{slug}-frente.webp', 'WEBP', quality=86, method=6)
    return round(((CH + round(h3 * s3)) / 2) / CH, 4)


def add(brand, name, color, p1, p2=None, baked_shadow=False, allow_low=False):
    slug = slugify(f'{brand} {name} {color}')
    src = json.loads(SRC.read_text())
    if any(p['id'] == slug for p in src['products']):
        sys.exit(f'{slug} already exists. Nothing changed.')
    bl = process(p1, p2, slug) if p2 else process_single(p1, slug, allow_low)
    base = json.loads(BASE.read_text()); base[slug] = bl; BASE.write_text(json.dumps(base, indent=1))
    if brand not in src['groups']:
        src['groups'].append(brand)
    item = {'id': slug, 'slug': slug, 'group': brand, 'name': name, 'color': color}
    if not p2: item['single'] = True            # one photo only: no front view
    if baked_shadow: item['shadow'] = 'baked'   # the photo already has its own soft shadow
    src['products'].append(item)
    SRC.write_text(json.dumps(src, indent=2, ensure_ascii=False) + '\n')
    print('added', slug)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--group', required=True)
    ap.add_argument('--name'); ap.add_argument('--color')
    ap.add_argument('--folder')
    ap.add_argument('--baked-shadow', action='store_true', help='the photo already has its own soft shadow under the product')
    ap.add_argument('--allow-low-res', action='store_true')
    ap.add_argument('photos', nargs='*')
    a = ap.parse_args()
    if a.folder:
        pairs = {}
        for f in sorted(Path(a.folder).iterdir()):
            m = re.match(r'^(.+?) - (.+?) - (lado|frente)\.(png|jpe?g|webp)$', f.name, re.I)
            if m: pairs.setdefault((m[1], m[2]), {})[m[3].lower()] = f
        if not pairs: sys.exit('No files named "<Name> - <Colour> - lado.png" / "- frente.png" found.')
        for (n, c), d in pairs.items():
            if len(d) != 2: print('skipped (needs both lado and frente):', n, c); continue
            add(a.group, n, c, d['lado'], d['frente'], a.baked_shadow, a.allow_low_res)
    else:
        if not (a.name and a.color and len(a.photos) in (1, 2)): ap.error('give --name, --color and one photo (3/4 view only) or two photos (3/4 + front)')
        add(a.group, a.name, a.color, a.photos[0], a.photos[1] if len(a.photos) == 2 else None, a.baked_shadow, a.allow_low_res)
    subprocess.run(['node', 'tools/build.mjs'], cwd=ROOT, check=True)


if __name__ == '__main__':
    main()

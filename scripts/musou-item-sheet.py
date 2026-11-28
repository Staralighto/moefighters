"""Slice a 4x4 magenta-keyed item sheet into 128x128 transparent PNGs.
usage: python3 scripts/musou-item-sheet.py sheet.png outdir name1,name2,...(16)
"""
from pathlib import Path
import re
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

if len(sys.argv) != 4:
    raise SystemExit(__doc__)
src, outdir, raw_names = sys.argv[1:]
names = raw_names.split(',')
if len(names) != 16 or len(set(names)) != 16 or any(not re.fullmatch(r'[a-z][a-z0-9-]*', n) for n in names):
    raise SystemExit('Expected 16 unique lowercase item names (letters, digits, hyphens).')
with Image.open(src) as sheet:
    im = np.asarray(sheet.convert('RGB'), dtype=np.float32)
H, W, _ = im.shape
R, G, B = im[..., 0], im[..., 1], im[..., 2]
mag = np.minimum(R, B) - G          # ~250 on pure background

# 1. background = strongly magenta pixels connected to the image border
strong = mag > 140
lab, _ = ndimage.label(strong)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
# enclosed holes (inside triangle, lamp stand, lanyard loop): near-pure magenta regions count too
pure = mag > 215
plab, _ = ndimage.label(pure)
keep_pure = np.bincount(plab.ravel()) >= 3
keep_pure[0] = False
bg |= ndimage.binary_dilation(keep_pure[plab]) & strong

# 2. soft edge: pixels within 3px of background get alpha from how magenta they are
near = ndimage.binary_dilation(bg, iterations=3) & ~bg
alpha = np.ones((H, W), np.float32)
alpha[bg] = 0
a_edge = 1 - np.clip((mag - 30) / (230 - 30), 0, 1)
alpha[near] = a_edge[near]

# 3. despill: pull R/B down toward G on edge pixels (removes pink fringe)
rgb = im.copy()
spill = near & (mag > 0)
lim = np.maximum(G, np.minimum(R, B) - mag * 0.9)
for c in (0, 2):
    ch = rgb[..., c]
    ch[spill] = np.minimum(ch[spill], np.maximum(lim[spill], G[spill] + 10))
rgba = np.dstack([rgb, alpha * 255]).clip(0, 255).astype(np.uint8)

# 4. per-cell crop to content, fit into 128 with padding
OUT, FIT = 128, 116
cw, ch_ = W / 4, H / 4
# assign every opaque blob to the cell holding its centre, so slivers of a neighbour never leak in
olab, on = ndimage.label(rgba[..., 3] > 16)
cents = ndimage.center_of_mass(np.ones_like(olab), olab, range(1, on + 1))
owner = np.array([-1] + [int(cy // ch_) * 4 + int(cx // cw) for cy, cx in cents])
cells = owner[olab]
icons = []
for i, name in enumerate(names):
    ys, xs = np.nonzero(cells == i)
    if not len(xs):
        raise SystemExit(f'Empty cell {i + 1} ({name}).')
    rows = slice(ys.min(), ys.max() + 1)
    cols = slice(xs.min(), xs.max() + 1)
    cell = rgba[rows, cols].copy()
    cell[cells[rows, cols] != i, 3] = 0
    img = Image.fromarray(cell, 'RGBA')
    s = FIT / max(img.size)
    img = img.resize((max(1, round(img.width * s)), max(1, round(img.height * s))), Image.LANCZOS)
    canvas = Image.new('RGBA', (OUT, OUT), (0, 0, 0, 0))
    canvas.paste(img, ((OUT - img.width) // 2, (OUT - img.height) // 2))
    icons.append(canvas)

dest = Path(outdir)
dest.mkdir(parents=True, exist_ok=True)
for name, canvas in zip(names, icons):
    canvas.save(dest / f'{name}.png', optimize=True)

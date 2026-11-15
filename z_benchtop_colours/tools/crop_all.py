import json, glob, os, sys, re, concurrent.futures as cf
import numpy as np
from PIL import Image, ImageStat, ImageDraw
Image.MAX_IMAGE_PIXELS = None
base = sys.argv[1]
def save(im, key, out):
    w = min(4096, im.width); big = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
    big.save(f"{base}/out/{key}.jpg", quality=82, optimize=True, progressive=True)
    im.resize((320, round(im.height * 320 / im.width)), Image.LANCZOS).save(f"{base}/out/{key}-thumb.jpg", quality=80)
    out['hex'] = '#%02x%02x%02x' % tuple(round(c) for c in ImageStat.Stat(im.resize((64, 32))).mean)
    out['px'] = big.size; out['bytes'] = os.path.getsize(f"{base}/out/{key}.jpg")
def edge(prof, lo, hi):
    n = len(prof); a, b = int(n * lo), int(n * hi); return a + int(np.argmax(prof[a:b]))
def sa(path):
    slug = os.path.basename(path)[:-5]; out = dict(slug=slug)
    im = Image.open(path).convert('RGB'); W, H = im.size
    s = np.asarray(im.resize((2000, round(2000 * H / W))).convert('L'), dtype=float); h, w = s.shape
    gx = np.abs(np.diff(s, axis=1))[int(h * .3):int(h * .6)].mean(0)
    gy = np.abs(np.diff(s, axis=0))[:, int(w * .3):int(w * .7)].mean(1)
    l, r = edge(gx, .05, .3), edge(gx, .7, .95) + 1; t, b = edge(gy, .02, .25), edge(gy, .6, .9) + 1
    # every SA photo uses one staged template: fixed slab box (median of the detected edges, inset)
    fx = {'dulce-de-leche': (.136, .864), 'le-taj': (.140, .860)}.get(slug, (.1215, .8775))
    box = (round(W * fx[0]), round(H * .1045), round(W * fx[1]), round(H * .7975))
    out['box_frac'] = [round(box[0] / W, 3), round(box[1] / H, 3), round(box[2] / W, 3), round(box[3] / H, 3)]
    c = im.crop(box); out['aspect'] = round(c.width / c.height, 3)
    save(c, 'sa-' + slug, out); return out
def ydl(it):
    out = dict(slug=it['slug'])
    src = [p for p in glob.glob(f"{base}/ydl_dl/{it['slug']}.*") if not p.endswith('.pdf')]
    if not src: return out
    im = Image.open(src[0]).convert('RGB')
    # trim uniform border, then keep the true slab proportion from the top (drops the stand shadow)
    a = np.asarray(im.convert('L'), dtype=float); bg = a[0, 0]
    ys, xs = np.where(np.abs(a - bg) > 18); im = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    asp = it['slab_w'] / it['slab_h']
    if im.width / im.height < asp - .01: im = im.crop((0, 0, im.width, round(im.width / asp)))
    out['aspect'] = round(im.width / im.height, 3); save(im, 'ydl-' + it['slug'], out); return out
os.makedirs(base + '/out', exist_ok=True)
for f in glob.glob(base + '/out/*'): os.remove(f)
man = json.load(open(base + '/ydl_manifest.json'))
with cf.ThreadPoolExecutor(4) as ex:
    y = list(ex.map(ydl, man)); s = list(ex.map(sa, [p for p in sorted(glob.glob(base + '/sa_dl/*.webp')) if 'carrara_' not in p]))
json.dump(dict(ydl=y, sa=s), open(base + '/crop_results.json', 'w'), indent=1)
for r in y + s: print(r['slug'], r.get('box_frac'), r.get('aspect'), r.get('hex'), r.get('bytes'))

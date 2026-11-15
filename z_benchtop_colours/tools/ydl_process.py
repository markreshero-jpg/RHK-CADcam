import json, re, os, sys, urllib.request, concurrent.futures as cf
import pymupdf
from PIL import Image, ImageChops, ImageStat
Image.MAX_IMAGE_PIXELS = None
base = sys.argv[1]
os.makedirs(base + '/ydl_dl', exist_ok=True); os.makedirs(base + '/out', exist_ok=True)
rows = json.load(open(base + '/ydl_all.json', encoding='utf-8'))
items = []
for r in rows:
    if r.get('err'): continue
    rng, name = r['range'], r['name']
    if not rng.startswith('Mineral') and name.startswith('Mineral'): rng, name = name, rng
    if not rng.startswith('Mineral'): continue
    name = re.sub(r'\s*[^\w\s]+\s*NEW\s*$', '', name).strip()
    m = re.match(r'(\d+)\s*x\s*(\d+)', r['slab'] or '')
    items.append(dict(slug=r['slug'], name=name, group=rng.split(' - ', 1)[1], url=r['url'], pdf=r['pdf'], finish=r['finish'],
                      slab_w=int(m.group(1)) if m else 3230, slab_h=int(m.group(2)) if m else 1630,
                      code=(re.search(r'/((?:\d{4}|SE\d\d))-', r['pdf'] or '') or [None, None])[1]))
def trim(im):
    bg = Image.new(im.mode, im.size, im.getpixel((0, 0)))
    bb = ImageChops.difference(im, bg).convert('L').point(lambda v: 255 if v > 18 else 0).getbbox()
    return im.crop(bb) if bb else im
def work(it):
    out = dict(it)
    if not it['pdf']: return out
    p = f"{base}/ydl_dl/{it['slug']}.pdf"
    try:
        if not os.path.exists(p):
            import subprocess; subprocess.run(['curl', '-sf', '-o', p, it['pdf']], check=True)
        doc = pymupdf.open(p)
        imgs = [(doc.extract_image(x[0]), x) for x in doc[0].get_images(full=True)]
        info = max(imgs, key=lambda t: t[0]['width'] * t[0]['height'])[0]
        tmp = f"{base}/ydl_dl/{it['slug']}.{info['ext']}"
        open(tmp, 'wb').write(info['image'])
        im = Image.open(tmp).convert('RGB')
        out['src_px'] = im.size
        im = trim(im)
        out['trim_px'] = im.size
        if im.height > im.width: im = im.rotate(90, expand=True)
        w = min(4096, im.width); big = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
        big.save(f"{base}/out/ydl-{it['slug']}.jpg", quality=82, optimize=True, progressive=True)
        th = im.resize((320, round(im.height * 320 / im.width)), Image.LANCZOS); th.save(f"{base}/out/ydl-{it['slug']}-thumb.jpg", quality=80)
        mean = ImageStat.Stat(im.resize((64, 32))).mean
        out['hex'] = '#%02x%02x%02x' % tuple(round(c) for c in mean)
        out['aspect'] = round(im.width / im.height, 3)
        out['bytes'] = os.path.getsize(f"{base}/out/ydl-{it['slug']}.jpg")
    except Exception as e:
        out['err'] = repr(e)
    return out
with cf.ThreadPoolExecutor(6) as ex: res = list(ex.map(work, items))
json.dump(res, open(base + '/ydl_manifest.json', 'w'), indent=1)
for r in res: print(r['group'], '|', r['name'], r.get('code'), r.get('src_px'), r.get('trim_px'), r.get('aspect'), r.get('hex'), r.get('bytes'), r.get('err', ''))
print(len(res))

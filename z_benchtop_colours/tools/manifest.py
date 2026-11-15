import json, re, os, sys, subprocess, html, io
from PIL import Image, ImageStat
base, dest = sys.argv[1], sys.argv[2]
def fetch(u):
    return subprocess.run(['curl', '-sf', u], capture_output=True, check=True).stdout
def mean_hex(data, centre=.6):
    im = Image.open(io.BytesIO(data)).convert('RGB'); w, h = im.size; c = (1 - centre) / 2
    im = im.crop((int(w * c), int(h * c), int(w * (1 - c)), int(h * (1 - c))))
    return '#%02x%02x%02x' % tuple(round(v) for v in ImageStat.Stat(im.resize((32, 32))).mean)
crop = json.load(open(base + '/crop_results.json'))
cr = {('ydl', r['slug']): r for r in crop['ydl']} | {('sa', r['slug']): r for r in crop['sa']}
out = []
for it in json.load(open(base + '/ydl_manifest.json')):
    c = cr.get(('ydl', it['slug']), {})
    e = dict(brand='YDL', colour_name=it['name'], colour_code=it['code'], range_name='Mineral ' + it['group'], finish=it['finish'],
             slab_w=it['slab_w'], slab_h=it['slab_h'], hex=c.get('hex'), image=('ydl-' + it['slug']) if c.get('hex') else None, source_url=it['url'])
    if not e['hex']:
        page = fetch(it['url']).decode('utf-8', 'replace')
        imgs = [u for u in re.findall(r'https://www\.ydlstone\.com\.au/wp-content/uploads/[^"\' )]+-300x300\.jpg', page)]
        key = re.sub(r'[^a-z]', '', it['name'].lower())
        hit = [u for u in imgs if key in re.sub(r'[^a-z]', '', u.lower())]
        if hit: e['hex'] = mean_hex(fetch(hit[0])); e['note'] = 'swatch from product sample (no slab image published)'
    out.append(e)
sa = {o['slug']: o for o in json.load(open(base + '/sa_20mm.json'))}
slabs = json.load(open(base + '/sa_slabs.json'))
for slug, o in sa.items():
    name = html.unescape(o['name']).strip()
    if 'WA Only' in name or 'wa-only' in slug or slug == 'enchanted-white': continue   # WA-only / discontinued
    cats = [c for c in o['cats'] if c in ('Essential', 'Deluxe', 'Premium', 'Prestige', 'Signature')]
    rng = 'Kaya' if 'Kaya' in o['spec'].get('Product Type', '') else 'Zenith' + (' ' + cats[0] if cats else '')
    m = re.match(r'(\d+)\s*x\s*(\d+)', o['spec'].get('Nominal Slab Dimensions', ''))
    c = cr.get(('sa', slug), {})
    blown = slug in ('pearl-white', 'carrara-mist')
    e = dict(brand='Stone Ambassador', colour_name=name, colour_code=(re.match(r'(\d{4})-', slug) or [None, None])[1], range_name=rng,
             finish=o['spec'].get('Surface Finish'), slab_w=int(m.group(1)), slab_h=int(m.group(2)),
             hex=None if blown else c.get('hex'), image=None if (blown or not c.get('hex')) else 'sa-' + slug, source_url=o['link'])
    if not e['hex']:
        pu = (slabs.get(slug) or {}).get('product')
        if pu: e['hex'] = mean_hex(fetch(pu)); e['note'] = 'swatch from product sample' + (' (slab photo over-exposed)' if blown else ' (no slab image published)')
    out.append(e)
json.dump(out, open(dest, 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
for e in out: print(e['brand'][:3], e['colour_name'], e['range_name'], e['hex'], bool(e['image']), e.get('note', ''))
print(len(out), sum(1 for e in out if e['image']))

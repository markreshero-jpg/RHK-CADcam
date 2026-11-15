import re, html, json, sys, urllib.request, concurrent.futures as cf
out_dir = sys.argv[1]
sm = open(out_dir + '/ydl_sitemap.xml', encoding='utf-8').read()
urls = re.findall(r'<loc>([^<]*/products/[^<]*)</loc>', sm)
def get(u):
    r = urllib.request.Request(u, headers={'User-Agent': 'curl/8.0'})
    return urllib.request.urlopen(r, timeout=60).read().decode('utf-8', 'replace')
def parse(u):
    try: s = get(u)
    except Exception as e: return dict(url=u, err=str(e))
    t = re.sub(r'(?s)<script.*?</script>|<style.*?</style>', '', s)
    L = [l.strip() for l in html.unescape(re.sub(r'<[^>]+>', '\n', t)).split('\n') if l.strip()]
    def after(k):
        try: return L[L.index(k) + 1]
        except ValueError: return None
    try: i = L.index('Slab Dimensions')
    except ValueError: return dict(url=u, err='no spec')
    rng, name = L[i - 4], L[i - 3]
    pdfs = [p for p in re.findall(r'href="([^"]+\.pdf)"', s) if not re.search(r'Brochure|Warranty|MSDS|Care', p, re.I)]
    return dict(url=u, slug=u.rstrip('/').split('/')[-1], range=rng, name=re.sub(r'\s*\W\s*NEW$', '', name).strip(), isnew=name.endswith('NEW'),
                slab=after('Slab Dimensions'), finish=after('Surface Finish'), thick=after('Available Thickness'), pdf=pdfs[0] if pdfs else None)
with cf.ThreadPoolExecutor(8) as ex: res = list(ex.map(parse, urls))
json.dump(res, open(out_dir + '/ydl_all.json', 'w'), indent=1)
for r in res: print(r.get('range'), '|', r.get('name'), '|', r.get('slab'), r.get('finish'), r.get('thick'), '|', (r.get('pdf') or r.get('err') or '')[-40:])

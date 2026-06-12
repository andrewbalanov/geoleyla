# -*- coding: utf-8 -*-
"""Инфо-карточки v2: батч-API Википедии (20 статей/запрос) + фото.
Выход: js/data/info.js + assets/info/."""
import json, os, re, time, urllib.request, urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'GeoLeylaGame/1.0 (personal education project)'}
INFO_DIR = os.path.join(BASE, 'assets/info')
os.makedirs(INFO_DIR, exist_ok=True)
API = 'https://ru.wikipedia.org/w/api.php'

def http(url, binary=False, tries=3):
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            return data if binary else json.loads(data.decode())
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(6 * (a + 1))
        except Exception:
            time.sleep(3 * (a + 1))
    return None

def loadjson(p):
    return json.loads(open(os.path.join(BASE, p), encoding='utf-8').read().split('=', 1)[1].rstrip(';\n'))

# ---------- сбор всех нужных титулов ----------
CAP_TITLE = {'Панама':'Панама (город)','Гватемала':'Гватемала (город)','Алжир':'Алжир (город)',
 'Тунис':'Тунис (город)','Джибути':'Джибути (город)','Сан-Марино':'Сан-Марино (город)',
 'Люксембург':'Люксембург (город)','Монако':'Монако'}
CO_TITLE = {'ДР Конго':'Демократическая Республика Конго','Конго':'Республика Конго'}
US_TITLE = {'Вашингтон':'Вашингтон (штат)','Нью-Йорк':'Нью-Йорк (штат)'}

countries = loadjson('js/data/countries.js')
usa = loadjson('js/data/usa.js')
states = [g['properties'] for g in usa['objects']['states']['geometries']]
france = loadjson('js/data/france.js')['features']
wine_src = open(os.path.join(BASE, 'js/data/wine.js'), encoding='utf-8').read()
wine_pairs = re.findall(r'img:"([^"]+)".*?wiki:"([^"]+)"', wine_src)
pm_pairs = []
for js, bucket in (('js/data/places.js', 'places'), ('js/data/monuments.js', 'monuments')):
    src = open(os.path.join(BASE, js), encoding='utf-8').read()
    for slug, wiki in re.findall(r'\{img:"([^"]+)".*?wiki:"([^"]+)"', src):
        pm_pairs.append((bucket, slug, wiki))

titles = set()
for c in countries:
    titles.add(CO_TITLE.get(c['name'], c['name']))
    titles.add(CAP_TITLE.get(c['capital'], c['capital']))
for p in states:
    titles.add(US_TITLE.get(p['name'], p['name']))
for f in france:
    titles.add(f['properties']['name'] + ' (департамент)')
for slug, wiki in wine_pairs:
    titles.add(wiki)
for _, _, wiki in pm_pairs:
    titles.add(wiki)
titles = sorted(titles)
print('титулов:', len(titles), flush=True)

# ---------- батч-запросы ----------
DATA = {}   # финальный титул -> {extract, thumb}
RESOLVE = {}  # исходный -> финальный

def fetch_batch(batch):
    q = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'redirects': 1,
        'prop': 'extracts|pageimages', 'exintro': 1, 'exsentences': 2,
        'explaintext': 1, 'exlimit': 'max', 'pithumbsize': 640, 'pilimit': 'max',
        'titles': '|'.join(batch)
    })
    res = http(API + '?' + q)
    if not res: return
    qq = res.get('query', {})
    for n in qq.get('normalized', []) + qq.get('redirects', []):
        RESOLVE[n['from']] = n['to']
    for page in qq.get('pages', {}).values():
        t = page.get('title')
        if not t or 'missing' in page: continue
        DATA[t] = {
            'extract': (page.get('extract') or '').strip(),
            'thumb': (page.get('thumbnail') or {}).get('source')
        }

for i in range(0, len(titles), 20):
    fetch_batch(titles[i:i + 20])
    print(f'батч {i//20 + 1}/{(len(titles)+19)//20}', flush=True)
    time.sleep(1.0)

def resolve(t):
    seen = set()
    while t in RESOLVE and t not in seen:
        seen.add(t); t = RESOLVE[t]
    return t

def get(t):
    d = DATA.get(resolve(t))
    if d and d['extract'] and 'может означать' in d['extract'][:60]:
        return None  # дизамбиг
    return d

def trim(text):
    text = (text or '').strip()
    if len(text) > 300:
        cut = text[:300]
        dot = cut.rfind('. ')
        text = cut[:dot + 1] if dot > 120 else cut + '…'
    return text

def upscale(url):
    return re.sub(r'/(\d+)px-', '/640px-', url) if url else None

# ---------- фото ----------
photo_queue = []  # (url, fname)
def queue_photo(url, fname):
    if url: photo_queue.append((upscale(url), fname))

INFO = {'countries': {}, 'usa': {}, 'france': {}, 'wine': {}, 'places': {}, 'monuments': {}}

for c in countries:
    dco = get(CO_TITLE.get(c['name'], c['name']))
    dcap = get(CAP_TITLE.get(c['capital'], c['capital']))
    text = trim(dco['extract'] if dco else '')
    thumb = (dcap and dcap['thumb']) or (dco and dco['thumb'])
    fname = 'c-' + c['iso2'] + '.jpg' if thumb else None
    if fname: queue_photo(thumb, fname)
    if text or fname:
        INFO['countries'][c['iso2']] = {'t': text, 'img': fname}

for p in states:
    d = get(US_TITLE.get(p['name'], p['name']))
    if not d: continue
    fname = 'us-' + re.sub(r'[^a-z]+', '-', p['orig'].lower()).strip('-') + '.jpg' if d['thumb'] else None
    if fname: queue_photo(d['thumb'], fname)
    INFO['usa'][p['name']] = {'t': trim(d['extract']), 'img': fname}

for f in france:
    pr = f['properties']
    d = get(pr['name'] + ' (департамент)')
    if not d: continue
    fname = 'fr-' + pr['code'].lower() + '.jpg' if d['thumb'] else None
    if fname: queue_photo(d['thumb'], fname)
    INFO['france'][pr['code']] = {'t': trim(d['extract']), 'img': fname}

for slug, wiki in wine_pairs:
    d = get(wiki)
    if d and d['thumb']:
        fname = slug + '.jpg'
        queue_photo(d['thumb'], fname)
        INFO['wine'][slug] = {'img': fname}

for bucket, slug, wiki in pm_pairs:
    d = get(wiki)
    if d and d['extract']:
        INFO[bucket][slug] = trim(d['extract'])

print('фото в очереди:', len(photo_queue), flush=True)
# очередь фото — в файл (докачка отдельным скриптом fetch_photos.py)
with open(os.path.join(BASE, 'tools/photo_queue.json'), 'w', encoding='utf-8') as f:
    json.dump(photo_queue, f)
if os.environ.get('NO_PHOTOS') != '1':
    ok = 0
    for i, (url, fname) in enumerate(photo_queue):
        path = os.path.join(INFO_DIR, fname)
        if os.path.exists(path) and os.path.getsize(path) > 2000:
            ok += 1; continue
        data = http(url, binary=True)
        if data and len(data) > 2000:
            open(path, 'wb').write(data); ok += 1
        if (i + 1) % 40 == 0: print(f'  фото {i+1}/{len(photo_queue)}, ок {ok}', flush=True)
        time.sleep(0.25)
    print('фото скачано:', ok, flush=True)

# если локального файла нет — ставим прямой URL Википедии (хотлинк работает у игроков)
url_by_fname = {f: u for u, f in photo_queue}
for bucket in ('countries', 'usa', 'france', 'wine'):
    for k, v in INFO[bucket].items():
        img = v.get('img')
        if img and not (os.path.exists(os.path.join(INFO_DIR, img)) and os.path.getsize(os.path.join(INFO_DIR, img)) > 2000):
            v['img'] = url_by_fname.get(img)  # None если url нет

with open(os.path.join(BASE, 'js/data/info.js'), 'w', encoding='utf-8') as f:
    f.write('window.INFO=')
    json.dump(INFO, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('ГОТОВО info.js:', {k: len(v) for k, v in INFO.items()}, flush=True)

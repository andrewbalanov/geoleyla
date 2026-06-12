# -*- coding: utf-8 -*-
"""Расширение датасетов через Wikidata: памятники (ЮНЕСКО) и природные объекты.
Выход: js/data/places2.js, js/data/monuments2.js + фото в assets/info/."""
import json, os, re, time, urllib.request, urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'GeoLeylaGame/1.0 (personal education project)'}
SPARQL = 'https://query.wikidata.org/sparql'

def query(q, tries=3):
    for a in range(tries):
        try:
            req = urllib.request.Request(SPARQL + '?format=json&query=' + urllib.parse.quote(q), headers=UA)
            with urllib.request.urlopen(req, timeout=90) as r:
                return json.loads(r.read().decode())['results']['bindings']
        except Exception as e:
            print('  sparql retry', a, type(e).__name__, flush=True)
            time.sleep(8 * (a + 1))
    return []

def get(url, tries=3):
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception:
            time.sleep(4 * (a + 1))
    return None

def v(row, key):
    return row.get(key, {}).get('value')

COMMON = '''
  OPTIONAL { ?item wdt:P18 ?imgRaw }
  OPTIONAL { ?item rdfs:label ?ruRaw FILTER(LANG(?ruRaw)="ru") }
  OPTIONAL { ?item rdfs:label ?enRaw FILTER(LANG(?enRaw)="en") }
  OPTIONAL { ?item schema:description ?descRaw FILTER(LANG(?descRaw)="ru") }
  OPTIONAL { ?item wdt:P17 ?ctry . ?ctry rdfs:label ?ctryRaw FILTER(LANG(?ctryRaw)="ru") }
'''
SELECT = '''SELECT ?item ?links ?lat ?lon (SAMPLE(?imgRaw) AS ?img) (SAMPLE(?ruRaw) AS ?ru)
 (SAMPLE(?enRaw) AS ?en) (SAMPLE(?descRaw) AS ?desc) (SAMPLE(?ctryRaw) AS ?ctryName) '''
GROUPBY = ' GROUP BY ?item ?links ?lat ?lon'

def class_query(qid, min_links, extra=''):
    return SELECT + ''' WHERE {
  ?item wdt:P31 wd:''' + qid + ''' ; wikibase:sitelinks ?links ; p:P625/psv:P625 ?c .
  ?c wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  FILTER(?links >= ''' + str(min_links) + ''')''' + extra + COMMON + '}' + GROUPBY

WHS_QUERY = SELECT + ''' (GROUP_CONCAT(DISTINCT ?typeEn;separator="|") AS ?types) WHERE {
  ?item wdt:P1435 wd:Q9259 ; wikibase:sitelinks ?links ; p:P625/psv:P625 ?c .
  ?c wikibase:geoLatitude ?lat ; wikibase:geoLongitude ?lon .
  FILTER(?links >= 28)
  OPTIONAL { ?item wdt:P31 ?tp . ?tp rdfs:label ?typeEn FILTER(LANG(?typeEn)="en") }
''' + COMMON + '}' + GROUPBY

NATURE_CLASSES = [
    ('Q8502',  55, 'гора', 90),
    ('Q23397', 48, 'озеро', 130),
    ('Q34038', 26, 'водопад', 70),
    ('Q8514',  26, 'пустыня', 300),
    ('Q46831', 38, 'горы', 300),
    ('Q8072',  42, 'вулкан', 80),
    ('Q23442', 52, 'остров', 130),
    ('Q4022',  68, 'река', 350),
]
NATURE_WORDS = re.compile(r'park|lake|mountain|falls|island|reef|desert|forest|glacier|volcano|bay|river|atoll|caldera|nature|fjord|cave|karst|wilderness|lagoon|delta|dune|peninsula', re.I)

def slugify(qid):
    return 'wd-' + qid.lower()

manual_src = open(os.path.join(BASE, 'js/data/places.js'), encoding='utf-8').read() + \
             open(os.path.join(BASE, 'js/data/monuments.js'), encoding='utf-8').read()
manual_en = set(re.sub(r'[^a-z]', '', m.lower()) for m in re.findall(r'en:"([^"]+)"', manual_src))
manual_pts = [(float(a), float(b)) for a, b in re.findall(r'lat:(-?[\d.]+), lng:(-?[\d.]+)', manual_src)]

def near_manual(lat, lon):
    for mlat, mlon in manual_pts:
        if abs(mlat - lat) < 0.6 and abs(mlon - lon) < 0.9:
            return True
    return False

seen_qid = set()
places2, monuments2 = [], []

def add(bucket, row, typ, r):
    qid = v(row, 'item').rsplit('/', 1)[1]
    if qid in seen_qid: return
    ru, en = v(row, 'ru'), v(row, 'en') or ''
    if not ru: return
    lat, lon = float(v(row, 'lat')), float(v(row, 'lon'))
    if re.sub(r'[^a-z]', '', en.lower()) in manual_en or near_manual(lat, lon): return
    seen_qid.add(qid)
    desc = v(row, 'desc') or ''
    ctry = v(row, 'ctryName') or ''
    info = desc
    if ctry and ctry.lower() not in desc.lower():
        info = (desc + ' · ' + ctry) if desc else ctry
    bucket.append({
        'img': slugify(qid), 'name': ru[:48], 'en': en[:60], 'type': typ,
        'lat': round(lat, 3), 'lng': round(lon, 3), 'r': r,
        'links': int(v(row, 'links')), 'imgUrl': v(row, 'img') or '', 'info': info[:160]
    })

print('ЮНЕСКО…', flush=True)
for row in query(WHS_QUERY):
    types = (v(row, 'types') or '')
    if NATURE_WORDS.search(types):
        add(places2, row, 'наследие ЮНЕСКО', 110)
    else:
        add(monuments2, row, 'наследие ЮНЕСКО', 70)
print(f'  WHS: places {len(places2)}, monuments {len(monuments2)}', flush=True)

for qid, links, typ, r in NATURE_CLASSES:
    print('класс', qid, typ, '…', flush=True)
    for row in query(class_query(qid, links)):
        add(places2, row, typ, r)
    time.sleep(2)

places2.sort(key=lambda x: -x['links'])
monuments2.sort(key=lambda x: -x['links'])
places2 = places2[:120]
monuments2 = monuments2[:170]
print(f'итого новых: места {len(places2)}, памятники {len(monuments2)}', flush=True)

# Фото
photo_dir = os.path.join(BASE, 'assets/info')
os.makedirs(photo_dir, exist_ok=True)
ok = 0
for i, e in enumerate(places2 + monuments2):
    url = e.pop('imgUrl')
    path = os.path.join(photo_dir, e['img'] + '.jpg')
    if os.path.exists(path) and os.path.getsize(path) > 2000:
        e['photo'] = 1; ok += 1; continue
    if not url:
        e['photo'] = 0; continue
    fname = url.rsplit('/', 1)[1]
    data = get('https://commons.wikimedia.org/wiki/Special:FilePath/' + fname + '?width=640')
    if data and len(data) > 2000:
        open(path, 'wb').write(data)
        e['photo'] = 1; ok += 1
    else:
        e['photo'] = 0
    if (i + 1) % 25 == 0: print(f'  фото {i+1}, ок {ok}', flush=True)
    time.sleep(0.35)
print('фото скачано:', ok, flush=True)

for name, data in (('places2', places2), ('monuments2', monuments2)):
    for e in data: e.pop('links', None)
    with open(os.path.join(BASE, f'js/data/{name}.js'), 'w', encoding='utf-8') as f:
        f.write(f'window.{name.upper()}=')
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        f.write(';\n')
print('ГОТОВО: places2.js / monuments2.js', flush=True)

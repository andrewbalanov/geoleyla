# -*- coding: utf-8 -*-
"""Английские тексты инфо-карточек: ru-титулы -> langlinks -> en.wikipedia extracts.
Выход: js/data/info_en.js (только тексты, картинки берутся из info.js)."""
import json, os, re, time, urllib.request, urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'GeoLeylaGame/1.0 (personal education project)'}
RU_API = 'https://ru.wikipedia.org/w/api.php'
EN_API = 'https://en.wikipedia.org/w/api.php'

def http(url, tries=3):
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode())
        except Exception:
            time.sleep(3 * (a + 1))
    return None

def loadjson(p):
    return json.loads(open(os.path.join(BASE, p), encoding='utf-8').read().split('=', 1)[1].rstrip(';\n'))

CAP_TITLE = {'Панама':'Панама (город)','Гватемала':'Гватемала (город)','Алжир':'Алжир (город)',
 'Тунис':'Тунис (город)','Джибути':'Джибути (город)','Сан-Марино':'Сан-Марино (город)',
 'Люксембург':'Люксембург (город)','Монако':'Монако'}
CO_TITLE = {'ДР Конго':'Демократическая Республика Конго','Конго':'Республика Конго'}
US_TITLE = {'Вашингтон':'Вашингтон (штат)','Нью-Йорк':'Нью-Йорк (штат)'}

countries = loadjson('js/data/countries.js')
usa = loadjson('js/data/usa.js')
states = [g['properties'] for g in usa['objects']['states']['geometries']]
france = loadjson('js/data/france.js')['features']
pm_pairs = []
for js, bucket in (('js/data/places.js', 'places'), ('js/data/monuments.js', 'monuments')):
    src = open(os.path.join(BASE, js), encoding='utf-8').read()
    for slug, wiki in re.findall(r'\{img:"([^"]+)".*?wiki:"([^"]+)"', src):
        pm_pairs.append((bucket, slug, wiki))

# ru-титулы, которым нужен en-эквивалент
ru_titles = set()
for c in countries:
    ru_titles.add(CO_TITLE.get(c['name'], c['name']))
for p in states:
    ru_titles.add(US_TITLE.get(p['name'], p['name']))
for f in france:
    ru_titles.add(f['properties']['name'] + ' (департамент)')
for _, _, wiki in pm_pairs:
    ru_titles.add(wiki)
ru_titles = sorted(ru_titles)
print('ru-титулов:', len(ru_titles), flush=True)

# ---------- шаг 1: langlinks ru -> en (50 за запрос) ----------
RU2EN = {}     # финальный ru-титул -> en-титул
RESOLVE = {}   # нормализация/редиректы ru
for i in range(0, len(ru_titles), 50):
    batch = ru_titles[i:i + 50]
    q = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'redirects': 1,
        'prop': 'langlinks', 'lllang': 'en', 'lllimit': 'max',
        'titles': '|'.join(batch)})
    res = http(RU_API + '?' + q)
    if not res: continue
    qq = res.get('query', {})
    for n in qq.get('normalized', []) + qq.get('redirects', []):
        RESOLVE[n['from']] = n['to']
    for page in qq.get('pages', {}).values():
        t = page.get('title')
        for ll in page.get('langlinks', []) or []:
            if ll.get('lang') == 'en':
                RU2EN[t] = ll.get('*')
    print(f'langlinks {i//50 + 1}/{(len(ru_titles)+49)//50}', flush=True)
    time.sleep(0.8)

def ru2en(t):
    seen = set()
    while t in RESOLVE and t not in seen:
        seen.add(t); t = RESOLVE[t]
    return RU2EN.get(t)

# ---------- шаг 2: какие en-страницы читать ----------
# wd-* места/памятники: en-лейбл обычно совпадает с названием статьи (redirects=1 дочистит)
wd_pairs = []
for js, bucket in (('js/data/places2.js', 'places'), ('js/data/monuments2.js', 'monuments')):
    for e in loadjson(js):
        wd_pairs.append((bucket, e['img'], e['en']))

en_titles = set()
for t in ru_titles:
    e = ru2en(t)
    if e: en_titles.add(e)
for _, _, en in wd_pairs:
    en_titles.add(en)
en_titles = sorted(en_titles)
print('en-титулов:', len(en_titles), flush=True)

# ---------- шаг 3: extracts с en.wikipedia (20 за запрос) ----------
DATA = {}
ENRESOLVE = {}
for i in range(0, len(en_titles), 20):
    batch = en_titles[i:i + 20]
    q = urllib.parse.urlencode({
        'action': 'query', 'format': 'json', 'redirects': 1,
        'prop': 'extracts', 'exintro': 1, 'exsentences': 2,
        'explaintext': 1, 'exlimit': 'max',
        'titles': '|'.join(batch)})
    res = http(EN_API + '?' + q)
    if res:
        qq = res.get('query', {})
        for n in qq.get('normalized', []) + qq.get('redirects', []):
            ENRESOLVE[n['from']] = n['to']
        for page in qq.get('pages', {}).values():
            t = page.get('title')
            if not t or 'missing' in page: continue
            DATA[t] = (page.get('extract') or '').strip()
    if (i // 20) % 5 == 0:
        print(f'extracts {i//20 + 1}/{(len(en_titles)+19)//20}', flush=True)
    time.sleep(0.8)

def en_get(t):
    if not t: return None
    seen = set()
    while t in ENRESOLVE and t not in seen:
        seen.add(t); t = ENRESOLVE[t]
    txt = DATA.get(t)
    if txt and ('may refer to' in txt[:80] or 'can refer to' in txt[:80]):
        return None
    return txt

def trim(text):
    text = (text or '').strip()
    if len(text) > 300:
        cut = text[:300]
        dot = cut.rfind('. ')
        text = cut[:dot + 1] if dot > 120 else cut + '…'
    return text

INFO = {'countries': {}, 'usa': {}, 'france': {}, 'places': {}, 'monuments': {}}
for c in countries:
    t = trim(en_get(ru2en(CO_TITLE.get(c['name'], c['name']))))
    if t: INFO['countries'][c['iso2']] = t
for p in states:
    t = trim(en_get(ru2en(US_TITLE.get(p['name'], p['name']))))
    if t: INFO['usa'][p['name']] = t
for f in france:
    pr = f['properties']
    t = trim(en_get(ru2en(pr['name'] + ' (департамент)')))
    if t: INFO['france'][pr['code']] = t
for bucket, slug, wiki in pm_pairs:
    t = trim(en_get(ru2en(wiki)))
    if t: INFO[bucket][slug] = t
for bucket, slug, en in wd_pairs:
    t = trim(en_get(en))
    if t: INFO[bucket][slug] = t

with open(os.path.join(BASE, 'js/data/info_en.js'), 'w', encoding='utf-8') as f:
    f.write('window.INFO_EN=')
    json.dump(INFO, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('ГОТОВО info_en.js:', {k: len(v) for k, v in INFO.items()}, flush=True)

# -*- coding: utf-8 -*-
"""Инфо-карточки: тексты (ру-Википедия) и фото для стран, штатов, департаментов,
винных регионов; тексты для мест/памятников. Выход: js/data/info.js + assets/info/."""
import json, os, re, time, urllib.request, urllib.parse

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'GeoLeylaGame/1.0 (personal education project)'}
INFO_DIR = os.path.join(BASE, 'assets/info')
os.makedirs(INFO_DIR, exist_ok=True)

def http(url, binary=False, tries=3):
    for a in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=30) as r:
                data = r.read()
            return data if binary else json.loads(data.decode())
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            time.sleep(5 * (a + 1))
        except Exception:
            time.sleep(3 * (a + 1))
    return None

def summary(title):
    return http('https://ru.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title.replace(' ', '_')))

def search_title(q):
    res = http('https://ru.wikipedia.org/w/api.php?action=opensearch&limit=1&format=json&search=' + urllib.parse.quote(q))
    return res[1][0] if res and res[1] else None

def get_card(title, fallback_q=None):
    s = summary(title)
    if not s or s.get('type') == 'disambiguation':
        t2 = search_title(fallback_q or title)
        if t2 and t2 != title:
            s = summary(t2) or s
    if not s: return None, None
    text = (s.get('extract') or '').strip()
    if len(text) > 300:
        cut = text[:300]
        dot = cut.rfind('. ')
        text = (cut[:dot + 1] if dot > 120 else cut + '…')
    thumb = (s.get('thumbnail') or {}).get('source')
    if thumb:
        thumb = re.sub(r'/(\d+)px-', '/640px-', thumb)
    return text, thumb

def save_photo(url, fname):
    path = os.path.join(INFO_DIR, fname)
    if os.path.exists(path) and os.path.getsize(path) > 2000:
        return True
    if not url: return False
    data = http(url, binary=True)
    if data and len(data) > 2000:
        open(path, 'wb').write(data)
        return True
    return False

def load_js(path):
    return json.loads(open(os.path.join(BASE, path), encoding='utf-8').read().split('=', 1)[1].rstrip(';\n'))

INFO = {'countries': {}, 'usa': {}, 'france': {}, 'wine': {}, 'places': {}, 'monuments': {}}

CAP_TITLE = {'Панама':'Панама (город)','Гватемала':'Гватемала (город)','Алжир':'Алжир (город)',
 'Тунис':'Тунис (город)','Джибути':'Джибути (город)','Сан-Марино':'Сан-Марино (город)',
 'Люксембург':'Люксембург (город)','Сингапур':'Сингапур','Монако':'Монако'}
CO_TITLE = {'ДР Конго':'Демократическая Республика Конго','Конго':'Республика Конго'}
US_TITLE = {'Вашингтон':'Вашингтон (штат)','Нью-Йорк':'Нью-Йорк (штат)','Джорджия':'Джорджия'}

# --- Страны: текст о стране + фото столицы ---
countries = load_js('js/data/countries.js')
for i, c in enumerate(countries):
    text, cthumb = get_card(CO_TITLE.get(c['name'], c['name']), c['name'] + ' государство')
    _, capthumb = get_card(CAP_TITLE.get(c['capital'], c['capital']), c['capital'] + ' столица')
    img = None
    fname = 'c-' + c['iso2'] + '.jpg'
    if save_photo(capthumb or cthumb, fname):
        img = fname
    if text or img:
        INFO['countries'][c['iso2']] = {'t': text or '', 'img': img}
    if (i + 1) % 25 == 0: print(f'страны {i+1}/196', flush=True)
    time.sleep(0.35)

# --- Штаты США ---
usa = load_js('js/data/usa.js')
states = [g['properties'] for g in usa['objects']['states']['geometries']]
for i, p in enumerate(states):
    text, thumb = get_card(US_TITLE.get(p['name'], p['name']), p['name'] + ' штат США')
    fname = 'us-' + re.sub(r'[^a-z]+', '-', p['orig'].lower()).strip('-') + '.jpg'
    img = fname if save_photo(thumb, fname) else None
    if text or img:
        INFO['usa'][p['name']] = {'t': text or '', 'img': img}
    time.sleep(0.35)
print('штаты готовы', flush=True)

# --- Департаменты Франции ---
fr = load_js('js/data/france.js')
for i, f in enumerate(fr['features']):
    p = f['properties']
    text, thumb = get_card(p['name'] + ' (департамент)', p['orig'] + ' департамент')
    fname = 'fr-' + p['code'].lower() + '.jpg'
    img = fname if save_photo(thumb, fname) else None
    if text or img:
        INFO['france'][p['code']] = {'t': text or '', 'img': img}
    if (i + 1) % 25 == 0: print(f'департаменты {i+1}/96', flush=True)
    time.sleep(0.35)

# --- Винные регионы (фото; текст уже в wine.js) ---
wine_src = open(os.path.join(BASE, 'js/data/wine.js'), encoding='utf-8').read()
for slug, wiki in re.findall(r'img:"([^"]+)".*?wiki:"([^"]+)"', wine_src):
    _, thumb = get_card(wiki, wiki)
    fname = slug + '.jpg'
    if save_photo(thumb, fname):
        INFO['wine'][slug] = {'img': fname}
    time.sleep(0.35)
print('вино готово', flush=True)

# --- Места и памятники (тексты; фото уже есть в assets/places) ---
for js, bucket in (('js/data/places.js', 'places'), ('js/data/monuments.js', 'monuments')):
    src = open(os.path.join(BASE, js), encoding='utf-8').read()
    pairs = re.findall(r'\{img:"([^"]+)".*?wiki:"([^"]+)"', src)
    for i, (slug, wiki) in enumerate(pairs):
        text, _ = get_card(wiki, wiki)
        if text:
            INFO[bucket][slug] = text
        time.sleep(0.3)
    print(bucket, 'готово', flush=True)

with open(os.path.join(BASE, 'js/data/info.js'), 'w', encoding='utf-8') as f:
    f.write('window.INFO=')
    json.dump(INFO, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('ГОТОВО info.js:', {k: len(vv) for k, vv in INFO.items()}, flush=True)

# -*- coding: utf-8 -*-
"""Загрузка флагов (flagcdn) и фото мест/памятников (Wikipedia REST API)."""
import json, os, re, sys, time, urllib.request, urllib.parse
from concurrent.futures import ThreadPoolExecutor, as_completed

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'GeomasterCloneGame/1.0 (personal hobby project)'}

def get(url, binary=True, timeout=25, tries=4):
    # Бережный режим: ретраи с растущей паузой на 429/тайм-аутах
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                data = r.read()
            return data if binary else json.loads(data.decode('utf-8'))
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < tries - 1:
                time.sleep(6 * (attempt + 1))
                continue
            raise
        except Exception:
            if attempt < tries - 1:
                time.sleep(2)
                continue
            raise

def get_json(url):
    return get(url, binary=False)

# ---------------- Флаги ----------------
countries = json.loads(open(os.path.join(BASE, 'js/data/countries.js'), encoding='utf-8').read().split('=', 1)[1].rstrip(';\n'))
flag_dir = os.path.join(BASE, 'assets/flags')
os.makedirs(flag_dir, exist_ok=True)

def fetch_flag(iso2):
    path = os.path.join(flag_dir, f'{iso2}.png')
    if os.path.exists(path) and os.path.getsize(path) > 500:
        return ('ok', iso2)
    try:
        data = get(f'https://flagcdn.com/w320/{iso2}.png')
        open(path, 'wb').write(data)
        return ('ok', iso2)
    except Exception as e:
        return ('fail', f'{iso2}: {e}')

# ---------------- Фото мест ----------------
def parse_entries(js_path):
    src = open(js_path, encoding='utf-8').read()
    out = []
    for m in re.finditer(r'\{img:"([^"]+)".*?wiki:"([^"]+)"', src):
        out.append((m.group(1), m.group(2)))
    return out

entries = parse_entries(os.path.join(BASE, 'js/data/places.js')) + parse_entries(os.path.join(BASE, 'js/data/monuments.js'))
photo_dir = os.path.join(BASE, 'assets/places')
os.makedirs(photo_dir, exist_ok=True)

def summary(title):
    url = 'https://ru.wikipedia.org/api/rest_v1/page/summary/' + urllib.parse.quote(title.replace(' ', '_'))
    return get_json(url)

def fetch_photo(slug, title):
    for f in os.listdir(photo_dir):
        if f.startswith(slug + '.') and os.path.getsize(os.path.join(photo_dir, f)) > 2000:
            return ('ok', slug, f)
    try:
        try:
            s = summary(title)
        except Exception:
            q = urllib.parse.urlencode({'action': 'opensearch', 'search': title, 'limit': 1, 'format': 'json'})
            res = get_json('https://ru.wikipedia.org/w/api.php?' + q)
            if not res[1]:
                return ('fail', slug, f'{title}: не найдено')
            s = summary(res[1][0])
        thumb = (s.get('thumbnail') or {}).get('source')
        if not thumb:
            return ('fail', slug, f'{title}: нет фото в статье')
        big = re.sub(r'/(\d+)px-', '/640px-', thumb)
        ext = 'png' if '.png' in big.lower() else ('svg' if '.svg' in big.lower() else 'jpg')
        if ext == 'svg':  # svg-превью отдаются как png
            ext = 'png'
        try:
            data = get(big)
        except Exception:
            data = get(thumb)
        fname = f'{slug}.{ext}'
        open(os.path.join(photo_dir, fname), 'wb').write(data)
        return ('ok', slug, fname)
    except Exception as e:
        return ('fail', slug, f'{title}: {e}')

flag_fail, photo_ok, photo_fail = [], {}, []
with ThreadPoolExecutor(max_workers=6) as ex:
    for r in ex.map(fetch_flag, [c['iso2'] for c in countries]):
        if r[0] == 'fail':
            flag_fail.append(r[1])

# Фото — последовательно и не спеша, чтобы не злить Википедию
for i, (slug, title) in enumerate(entries):
    r = fetch_photo(slug, title)
    if r[0] == 'ok':
        photo_ok[r[1]] = r[2]
    else:
        photo_fail.append(r[2])
    if (i + 1) % 20 == 0:
        print(f'...фото {i+1}/{len(entries)}', flush=True)
    time.sleep(0.45)

manifest = os.path.join(BASE, 'js/data/photos.js')
with open(manifest, 'w', encoding='utf-8') as f:
    f.write('window.PHOTOS=')
    json.dump(photo_ok, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')

flags_done = len([f for f in os.listdir(flag_dir) if f.endswith('.png')])
print(f'флагов: {flags_done}/{len(countries)}; ошибки флагов: {flag_fail}')
print(f'фото: {len(photo_ok)}/{len(entries)}')
for p in photo_fail:
    print('  нет фото:', p)

# -*- coding: utf-8 -*-
"""Щадящая докачка фото карточек из tools/photo_queue.json (паузы 2с, ретраи)."""
import json, os, time, urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = {'User-Agent': 'GeoLeylaGame/1.0 (personal education project)'}
INFO_DIR = os.path.join(BASE, 'assets/info')

queue = json.load(open(os.path.join(BASE, 'tools/photo_queue.json')))
todo = [(u, f) for u, f in queue
        if not (os.path.exists(os.path.join(INFO_DIR, f)) and os.path.getsize(os.path.join(INFO_DIR, f)) > 2000)]
print('к докачке:', len(todo), 'из', len(queue), flush=True)

ok = fail = 0
for i, (url, fname) in enumerate(todo):
    data = None
    for a in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                data = r.read()
            break
        except Exception:
            time.sleep(20 * (a + 1))
    if data and len(data) > 2000:
        open(os.path.join(INFO_DIR, fname), 'wb').write(data)
        ok += 1
    else:
        fail += 1
    if (i + 1) % 20 == 0:
        print(f'{i+1}/{len(todo)} ок {ok} фейл {fail}', flush=True)
    time.sleep(2.0)
print(f'ГОТОВО: ок {ok}, фейл {fail}', flush=True)

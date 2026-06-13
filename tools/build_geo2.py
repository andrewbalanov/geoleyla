# -*- coding: utf-8 -*-
"""Океаны (5) и крупные горные массивы мира → js/data/geo2.js.
Дополняет window.PLACES (type "океан"/"горы") и window.AREAS (полигоны) для режимов
"Моря и океаны" и "Горы". Источники: ne_marine.geojson (океаны), ne_regions.geojson (хребты)."""
import json, os, re, math

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
marine = json.load(open(os.path.join(BASE, "tools/ne_marine.geojson"), encoding="utf-8"))
regions = json.load(open(os.path.join(BASE, "tools/ne_regions.geojson"), encoding="utf-8"))


def mname(f):
    p = f["properties"]
    return (p.get("name") or p.get("NAME") or "")


def polys_of(geom):
    return [geom["coordinates"]] if geom["type"] == "Polygon" else list(geom["coordinates"])


def decimate(ring, maxpts, nd):
    if len(ring) > maxpts:
        step = int(math.ceil(len(ring) / float(maxpts)))
        ring = ring[::step]
    out = [[round(x, nd), round(y, nd)] for x, y in ring]
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def clean(polys, maxpts, nd, minring=4):
    res = []
    for rings in polys:
        nr = [decimate(r, maxpts, nd) for r in rings if len(r) >= 4]
        nr = [r for r in nr if len(r) >= minring]
        if nr:
            res.append(nr)
    return res


def bbox_center(coords):
    xs = []; ys = []
    def w(c):
        if c and isinstance(c[0], (int, float)): xs.append(c[0]); ys.append(c[1]); return
        for x in c: w(x)
    w(coords)
    return (round((min(ys) + max(ys)) / 2, 2), round((min(xs) + max(xs)) / 2, 2))


# ---------- Океаны (объединяем северную и южную части Атлантики и Пацифики) ----------
OCEANS = [
    ("ocean-atlantic", "Атлантический океан", "Atlantic Ocean", ["NORTH ATLANTIC OCEAN", "SOUTH ATLANTIC OCEAN"]),
    ("ocean-pacific", "Тихий океан", "Pacific Ocean", ["NORTH PACIFIC OCEAN", "SOUTH PACIFIC OCEAN"]),
    ("ocean-indian", "Индийский океан", "Indian Ocean", ["INDIAN OCEAN"]),
    ("ocean-arctic", "Северный Ледовитый океан", "Arctic Ocean", ["ARCTIC OCEAN"]),
    ("ocean-southern", "Южный океан", "Southern Ocean", ["SOUTHERN OCEAN"]),
]
marine_by = {}
for f in marine["features"]:
    marine_by.setdefault(mname(f).upper(), []).append(f["geometry"])

places = []
areas = {}
for slug, ru, en, names in OCEANS:
    polys = []
    for nm in names:
        for g in marine_by.get(nm, []):
            polys += polys_of(g)
    if not polys:
        raise SystemExit("ocean not found: " + slug)
    coords = clean(polys, maxpts=90, nd=2, minring=5)
    geom = {"type": "MultiPolygon", "coordinates": coords}
    lat, lng = bbox_center(coords)
    if slug == "ocean-arctic": lat = 84.0
    places.append({"img": slug, "name": ru, "en": en, "type": "океан", "lat": lat, "lng": lng, "r": 1500})
    areas[slug] = geom

# ---------- Горные массивы (хребты). 5 базовых (alps/himalaya/andes/rockies/ural) уже в places.js ----------
# (slug, RU, EN, [подстроки NAME в ne_regions])
RANGES = [
    ("caucasus", "Кавказ", "Caucasus", ["caucasus mts", "caucasus"]),
    ("carpathians", "Карпаты", "Carpathians", ["carpathian"]),
    ("atlas", "Атласские горы", "Atlas Mountains", ["atlas mountains"]),
    ("altai", "Алтай", "Altai Mountains", ["altay mountains", "altai"]),
    ("appalachians", "Аппалачи", "Appalachian Mountains", ["appalachian"]),
    ("apennines", "Апеннины", "Apennines", ["appennini", "apennine"]),
    ("pyrenees", "Пиренеи", "Pyrenees", ["pyren"]),
    ("tianshan", "Тянь-Шань", "Tian Shan", ["tien shan", "tian shan"]),
    ("kunlun", "Куньлунь", "Kunlun Mountains", ["kunlun", "kunlan"]),
    ("zagros", "Загрос", "Zagros Mountains", ["zagros"]),
    ("hindukush", "Гиндукуш", "Hindu Kush", ["hindu kush", "hindu"]),
    ("scandinavian", "Скандинавские горы", "Scandinavian Mountains", ["scandinav", "kjolen", "kjølen", "kolen"]),
    ("greatdividing", "Большой Водораздельный хребет", "Great Dividing Range", ["great dividing"]),
    ("drakensberg", "Драконовы горы", "Drakensberg", ["drakensberg"]),
    ("cascades", "Каскадные горы", "Cascade Range", ["cascade"]),
    ("sierranevada", "Сьерра-Невада", "Sierra Nevada", ["sierra nevada"]),
    ("sierramadre", "Сьерра-Мадре", "Sierra Madre", ["sierra madre occidental", "sierra madre"]),
    ("brooks", "Хребет Брукса", "Brooks Range", ["brooks"]),
    ("alaskarange", "Аляскинский хребет", "Alaska Range", ["alaska range"]),
    ("coastmts", "Береговые хребты", "Coast Mountains", ["coast mountains"]),
    ("balkans", "Балканские горы", "Balkan Mountains", ["balkan"]),
    ("dinaric", "Динарское нагорье", "Dinaric Alps", ["dinaric"]),
    ("ahaggar", "Ахаггар", "Ahaggar", ["ahaggar", "hoggar"]),
    ("tibesti", "Тибести", "Tibesti", ["tibesti"]),
    ("sayan", "Саяны", "Sayan Mountains", ["eastern sayan", "sayan"]),
    ("verkhoyansk", "Верхоянский хребет", "Verkhoyansk Range", ["verkhoyansk"]),
    ("westernghats", "Западные Гаты", "Western Ghats", ["western ghats"]),
    ("taurus", "Тавр", "Taurus Mountains", ["taurus"]),
    ("alborz", "Эльбурс", "Alborz", ["alborz", "elburz"]),
    ("karakoram", "Каракорум", "Karakoram", ["karakoram", "karakorum"]),
    ("pamir", "Памир", "Pamir", ["pamir"]),
]

range_feats = [f for f in regions["features"]
               if (f["properties"].get("featurecla") or f["properties"].get("FEATURECLA") or "") == "Range/mtn"]
found = []
missing = []
for slug, ru, en, needles in RANGES:
    hit = None
    for nd in needles:                       # пробуем подстроки по приоритету
        for f in range_feats:
            if nd in mname(f).lower():
                hit = f; break
        if hit: break
    if not hit:
        missing.append(slug); continue
    polys = polys_of(hit["geometry"])
    coords = clean(polys, maxpts=40, nd=3, minring=4)
    geom = {"type": "MultiPolygon", "coordinates": coords}
    lat, lng = bbox_center(coords)
    places.append({"img": slug, "name": ru, "en": en, "type": "горы", "lat": lat, "lng": lng, "r": 350})
    areas[slug] = geom
    found.append(slug + "←" + mname(hit))

# ---------- запись ----------
lines = []
lines.append("// Океаны и горные массивы для режимов «Моря и океаны» и «Горы». Сгенерировано build_geo2.py")
lines.append("window.GEO2_PLACES=" + json.dumps(places, ensure_ascii=False) + ";")
lines.append("window.GEO2_AREAS=" + json.dumps(areas, ensure_ascii=False, separators=(",", ":")) + ";")
lines.append("window.PLACES=(window.PLACES||[]).concat(window.GEO2_PLACES);")
lines.append("window.AREAS=Object.assign(window.AREAS||{},window.GEO2_AREAS);")
out = "\n".join(lines) + "\n"
open(os.path.join(BASE, "js/data/geo2.js"), "w", encoding="utf-8").write(out)
print("oceans:", len(OCEANS), "ranges found:", len(found), "missing:", missing)
print("file KB:", round(len(out) / 1024))
for x in found: print("  ", x)

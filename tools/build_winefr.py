# -*- coding: utf-8 -*-
"""Полигоны 13 винных регионов Франции из департаментов (france.js).
Регионы непересекающиеся (каждый департамент — максимум в одном регионе).
Выход: js/data/winefr.js -> window.WINEFR_GEO (FeatureCollection, по фиче на регион)."""
import json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
fr = json.loads(open(os.path.join(BASE, "js/data/france.js"), encoding="utf-8").read().split("=", 1)[1].rstrip(";\n"))
by_code = {f["properties"]["code"]: f for f in fr["features"]}

# slug (как в wine.js), RU, EN, коды департаментов INSEE
REGIONS = [
 ("w-bordeaux", "Бордо", "Bordeaux", ["33"]),
 ("w-burgundy", "Бургундия", "Burgundy", ["21", "71", "89"]),
 ("w-champagne", "Шампань", "Champagne", ["51", "10"]),
 ("w-loire", "Долина Луары", "Loire Valley", ["44", "49", "37", "41", "18"]),
 ("w-rhone", "Долина Роны", "Rhône Valley", ["26", "84", "07"]),
 ("w-alsace", "Эльзас", "Alsace", ["67", "68"]),
 ("w-provence", "Прованс", "Provence", ["83", "13", "04"]),
 ("w-languedoc", "Лангедок", "Languedoc", ["34", "11", "30", "66"]),
 ("w-beaujolais", "Божоле", "Beaujolais", ["69"]),
 ("w-jura", "Юра", "Jura", ["39"]),
 ("w-savoie", "Савойя", "Savoy", ["73", "74"]),
 ("w-cahors", "Каор (Юго-Запад)", "Cahors", ["46", "32", "82", "24", "47"]),
 ("w-corsica", "Корсика", "Corsica", ["2A", "2B"]),
]


# приглушённая палитра, чтобы регионы были видны и различимы (без подписей)
TINTS = ["#a23c5a", "#c98a3c", "#6b8e5a", "#4a8a9c", "#b5654a", "#8a6dab",
         "#b8962f", "#7a9e4f", "#d08a6a", "#5a7a8a", "#b07a9c", "#9c7a4a", "#6aa38a"]


def polys_of(geom):
    if geom["type"] == "Polygon":
        return [geom["coordinates"]]
    return list(geom["coordinates"])


feats = []
missing = []
for i, (slug, ru, en, codes) in enumerate(REGIONS):
    coords = []
    for c in codes:
        f = by_code.get(c)
        if not f:
            missing.append(c); continue
        coords += polys_of(f["geometry"])
    feats.append({
        "type": "Feature",
        "properties": {"slug": slug, "name": ru, "orig": en, "tint": TINTS[i % len(TINTS)]},
        "geometry": {"type": "MultiPolygon", "coordinates": coords}})

out = {"type": "FeatureCollection", "features": feats}
with open(os.path.join(BASE, "js/data/winefr.js"), "w", encoding="utf-8") as f:
    f.write("window.WINEFR_GEO=")
    json.dump(out, f, ensure_ascii=False, separators=(",", ":"))
    f.write(";\n")
print("ГОТОВО winefr.js:", len(feats), "регионов; пропущены коды:", missing)

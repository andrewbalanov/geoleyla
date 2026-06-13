# -*- coding: utf-8 -*-
"""Полигоны 23 винных регионов мира -> js/data/wineworld.js (window.WINEWORLD_GEO).
Крупные регионы — реальные admin-1 формы (объединение провинций Natural Earth 10m),
субрегиональные винные зоны (округа/долины) — компактные ручные области.
Порядок фич СТРОГО = порядок WINE_WORLD в wine.js (fid совпадает с индексом вина).
Намотка колец приводится к RFC 7946 (внешнее кольцо CCW) — иначе d3.geoContains инвертируется."""
import json, os, re, math, urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ADM1 = "/tmp/adm1_10m.geojson"
if not os.path.exists(ADM1):
    url = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_10m_admin_1_states_provinces.geojson"
    print("downloading admin-1 10m...")
    urllib.request.urlretrieve(url, ADM1)
adm = json.load(open(ADM1, encoding="utf-8"))

prov = {}
byname = {}
for f in adm["features"]:
    pr = f["properties"]
    prov[((pr.get("admin") or ""), (pr.get("name") or ""))] = f["geometry"]
    byname.setdefault(pr.get("name") or "", f["geometry"])

# WINE_WORLD из wine.js: slug, ru, en, lat, lng (по порядку файла)
ws = open(os.path.join(BASE, "js/data/wine.js"), encoding="utf-8").read()
wo = re.search(r"WINE_WORLD\s*=\s*\[(.*?)\];", ws, re.S).group(1)
WORLD = []
for m in re.finditer(r'\{img:"(w-[^"]+)",\s*name:"((?:[^"\\]|\\.)*)",\s*en:"((?:[^"\\]|\\.)*)",\s*lat:([-\d.]+),\s*lng:([-\d.]+)', wo):
    WORLD.append((m.group(1), m.group(2), m.group(3), float(m.group(4)), float(m.group(5))))
assert len(WORLD) == 23, len(WORLD)

# Реальные регионы: slug -> (admin, [названия провинций admin-1])
REAL = {
  "w-tuscany": ("Italy", ["Firenze","Siena","Pisa","Lucca","Arezzo","Grosseto","Livorno","Massa-Carrara","Pistoia","Prato"]),
  "w-piedmont": ("Italy", ["Turin","Cuneo","Asti","Alessandria","Novara","Vercelli","Biella","Verbano-Cusio-Ossola"]),
  "w-veneto": ("Italy", ["Venezia","Verona","Padova","Vicenza","Treviso","Rovigo","Belluno"]),
  "w-sicily": ("Italy", ["Palermo","Catania","Messina","Siracusa","Ragusa","Trapani","Agrigento","Caltanissetta","Enna"]),
  "w-rioja": ("Spain", ["La Rioja"]),
  "w-jerez": ("Spain", ["Cádiz"]),
  "w-douro": ("Portugal", ["Vila Real","Bragança"]),
  "w-vinho": ("Portugal", ["Braga","Viana do Castelo","Porto"]),
  "w-tokaj": ("Hungary", ["Borsod-Abaúj-Zemplén"]),
  "w-mendoza": ("Argentina", ["Mendoza"]),
  "w-kakheti": ("Georgia", ["Kakheti"]),
  "w-chile": ("Chile", ["Región Metropolitana de Santiago", "Libertador General Bernardo O'Higgins", "Maule"]),
  "w-marlborough": ("New Zealand", ["Marlborough District"]),
  "w-crimea": (None, ["Crimea"]),
}

# Ручные компактные области (субрегиональные зоны): slug -> (rx, ry) в градусах вокруг lat/lng из wine.js
HAND = {
  "w-ribera": (0.85, 0.28),
  "w-mosel": (0.50, 0.32),
  "w-rheingau": (0.32, 0.13),
  "w-santorini": (0.11, 0.13),
  "w-napa": (0.16, 0.30),
  "w-sonoma": (0.20, 0.34),
  "w-willamette": (0.34, 0.62),
  "w-stellenbosch": (0.30, 0.28),
  "w-barossa": (0.26, 0.32),
}

TINTS = ["#a23c5a","#c98a3c","#6b8e5a","#4a8a9c","#b5654a","#8a6dab","#b8962f","#7a9e4f",
         "#d08a6a","#5a7a8a","#b07a9c","#9c7a4a","#6aa38a","#a8556d","#c2954a","#5f8f6f",
         "#7d6aa0","#bf7050","#8f9a40","#5a8a96","#a86a8a","#937a52","#6f9e84"]


def polys_of(geom):
    return [geom["coordinates"]] if geom["type"] == "Polygon" else list(geom["coordinates"])


def decimate(ring, maxpts=44):
    if len(ring) <= maxpts:
        pts = list(ring)
    else:
        step = int(math.ceil(len(ring) / float(maxpts)))
        pts = ring[::step]
        if pts[-1] != ring[-1]:
            pts.append(ring[-1])
    out = [[round(x, 4), round(y, 4)] for x, y in pts]
    if out[0] != out[-1]:
        out.append(out[0])
    return out


def signed_area(ring):
    s = 0.0
    for i in range(len(ring) - 1):
        x1, y1 = ring[i]; x2, y2 = ring[i + 1]
        s += x1 * y2 - x2 * y1
    return s / 2.0


def rewind(polys):
    """d3.geoContains требует ВНЕШНЕЕ кольцо ПО ЧАСОВОЙ (площадь<0), дыры — против часовой.
    Проверено по рабочему winefr.js: внешнее кольцо там -CW (отрицательная площадь)."""
    for rings in polys:
        for j, r in enumerate(rings):
            cw = signed_area(r) < 0
            if (j == 0 and not cw) or (j > 0 and cw):
                r.reverse()
    return polys


def clean(polys):
    res = []
    for rings in polys:
        nr = [decimate(r) for r in rings]
        nr = [r for r in nr if len(r) >= 4]
        if nr:
            res.append(nr)
    return rewind(res)


def octagon(lng, lat, rx, ry):
    pts = []
    for i in range(8):
        a = math.pi / 8 + i * math.pi / 4
        pts.append([round(lng + rx * math.cos(a), 4), round(lat + ry * math.sin(a), 4)])
    pts.append(pts[0])
    # rewind ждёт список полигонов; для Polygon возвращаем кольца одного полигона ([pts])
    return rewind([[pts]])[0]


feats = []
for i, (slug, ru, en, lat, lng) in enumerate(WORLD):
    if slug in REAL:
        admin, provs = REAL[slug]
        polys = []
        for nm in provs:
            geom = prov.get((admin, nm)) if admin else byname.get(nm)
            if not geom:
                raise SystemExit("NOT FOUND admin-1: %s / %s" % (admin, nm))
            polys += polys_of(geom)
        geometry = {"type": "MultiPolygon", "coordinates": clean(polys)}
    elif slug in HAND:
        rx, ry = HAND[slug]
        geometry = {"type": "Polygon", "coordinates": octagon(lng, lat, rx, ry)}
    else:
        raise SystemExit("No geometry mapping for " + slug)
    feats.append({"type": "Feature",
                  "properties": {"slug": slug, "name": ru, "orig": en, "tint": TINTS[i % len(TINTS)]},
                  "geometry": geometry})

out = {"type": "FeatureCollection", "features": feats}
js = "window.WINEWORLD_GEO=" + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
open(os.path.join(BASE, "js/data/wineworld.js"), "w", encoding="utf-8").write(js)
print("regions:", len(feats), "| real:", sum(1 for f in feats if f["properties"]["slug"] in REAL),
      "| hand:", sum(1 for f in feats if f["properties"]["slug"] in HAND),
      "| file KB:", round(len(js) / 1024))

# -*- coding: utf-8 -*-
"""Полигоны областей (моря, заливы, проливы, хребты, пустыни) для режима «Моря и горы».
Источник: Natural Earth 10m marine polys + geography regions. Выход: js/data/areas.js"""
import json, os, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

marine = json.load(open(os.path.join(BASE, 'tools/ne_marine.geojson'), encoding='utf-8'))
regions = json.load(open(os.path.join(BASE, 'tools/ne_regions.geojson'), encoding='utf-8'))

# slug места → имя полигона в NE (None = искать по en-имени места)
ALIAS = {
  'mediterranean': 'Mediterranean Sea', 'black-sea': 'Black Sea', 'red-sea': 'Red Sea',
  'caribbean': 'Caribbean Sea', 'baltic': 'Baltic Sea', 'north-sea': 'North Sea',
  'japan-sea': 'Sea of Japan', 'south-china': 'South China Sea', 'arabian-sea': 'Arabian Sea',
  'sargasso': 'Sargasso Sea', 'okhotsk': 'Sea of Okhotsk', 'bering-sea': 'Bering Sea',
  'coral-sea': 'Coral Sea', 'caspian': 'Caspian Sea', 'dead-sea': 'Dead Sea',
  'gulf-mexico': 'Gulf of Mexico', 'bengal': 'Bay of Bengal', 'persian-gulf': 'Persian Gulf',
  'hudson-bay': 'Hudson Bay', 'biscay': 'Bay of Biscay', 'la-manche': 'English Channel',
  'gibraltar': 'Strait of Gibraltar', 'bering-strait': 'Bering Strait', 'magellan': 'Strait of Magellan',
  'bosphorus': 'Bosporus',
  'alps': 'Alps', 'himalaya': 'Himalayas', 'andes': 'Andes', 'rockies': 'Rocky Mountains',
  'ural': 'Ural Mountains',
  'sahara': 'Sahara', 'gobi': 'Gobi Desert', 'atacama': 'Atacama Desert',
  'kalahari': 'Kalahari Desert', 'namib': 'Namib Desert',
}

def norm(s):
    return re.sub(r'[^a-z]', '', (s or '').lower())

pool = {}
for f in marine['features']:
    nm = f['properties'].get('name')
    if nm: pool.setdefault(norm(nm), f['geometry'])
for f in regions['features']:
    p = f['properties']
    nm = p.get('NAME_EN') or p.get('NAME')
    if nm: pool.setdefault(norm(nm), f['geometry'])
    alt = p.get('NAMEALT')
    if alt: pool.setdefault(norm(alt), f['geometry'])

def thin_ring(ring, max_pts=240):
    n = len(ring)
    if n <= max_pts: return [[round(x, 3), round(y, 3)] for x, y in ring]
    step = n / float(max_pts)
    out = [ring[int(i * step)] for i in range(max_pts)]
    out.append(ring[0])
    return [[round(x, 3), round(y, 3)] for x, y in out]

def thin_geom(g):
    if g['type'] == 'Polygon':
        return {'type': 'Polygon', 'coordinates': [thin_ring(r) for r in g['coordinates']]}
    if g['type'] == 'MultiPolygon':
        # оставить только крупные части
        polys = sorted(g['coordinates'], key=lambda p: -len(p[0]))[:6]
        return {'type': 'MultiPolygon', 'coordinates': [[thin_ring(r) for r in poly] for poly in polys]}
    return g

src = open(os.path.join(BASE, 'js/data/places.js'), encoding='utf-8').read()
entries = re.findall(r'\{img:"([^"]+)", en:"([^"]+)"', src)

areas = {}
missing = []
for slug, en in entries:
    key = norm(ALIAS.get(slug, en))
    g = pool.get(key)
    if g:
        areas[slug] = thin_geom(g)
    else:
        missing.append(slug)

out_path = os.path.join(BASE, 'js/data/areas.js')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('window.AREAS=')
    json.dump(areas, f, separators=(',', ':'))
    f.write(';\n')
size = os.path.getsize(out_path)
print(f'областей: {len(areas)}, размер: {size//1024}KB')
print('точками остаются:', missing)

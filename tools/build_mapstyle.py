# -*- coding: utf-8 -*-
"""Кастомный стиль карты: liberty (OpenFreeMap) → без подписей, цвета как в Google Maps."""
import json, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
s = json.load(open(os.path.join(BASE, 'tools/liberty-style.json'), encoding='utf-8'))

# убрать все подписи и иконки
s['layers'] = [l for l in s['layers'] if l['type'] != 'symbol']
s['name'] = 'GeoLeyla Light'

# целевые цвета (близко к Google Maps / скриншоту)
FILLS = {
    'background': '#f7f6f2',
    'water': '#a8d4f2',
    'park': '#cdeac6',
    'landcover_wood': 'rgba(185, 222, 184, 0.8)',
    'landcover_grass': '#cfeac8',
    'landcover_ice': '#eef7f9',
    'landcover_sand': '#f2eddf',
    'landuse_residential': 'rgba(235, 233, 228, 0.7)',
    'landuse_pitch': '#def0d2',
    'landuse_track': '#def0d2',
    'landuse_cemetery': '#d9e8cf',
    'landuse_hospital': '#fbeef0',
    'landuse_school': '#f0efe4',
    'aeroway_fill': '#eceae5',
    'building': '#eae8e2',
    'building-3d': '#eae8e2',
}
LINES = {
    'park_outline': 'rgba(196, 227, 189, 1)',
    'waterway_tunnel': '#a8d4f2',
    'waterway_river': '#a8d4f2',
    'waterway_other': '#a8d4f2',
    'aeroway_runway': '#f0ede9',
    'aeroway_taxiway': '#f0ede9',
    'boundary_3': '#b6bcc2',
    'boundary_2': '#9aa0a6',
    'boundary_disputed': '#9aa0a6',
}
# дороги: оранжевые магистрали → мягкий google-жёлтый, остальное белое
ROAD_MAIN = '#ffd98c'      # motorway
ROAD_MAIN_CASING = '#ecc77f'
ROAD_MID = '#ffeebe'       # trunk/primary/secondary
ROAD_MID_CASING = '#e8ddc0'
NEUTRAL_CASING = '#e3e0da'
RAIL = '#d2d0cc'

for l in s['layers']:
    lid = l['id']
    paint = l.setdefault('paint', {})
    t = l['type']
    if t in ('fill', 'background', 'fill-extrusion'):
        key = 'background-color' if t == 'background' else ('fill-extrusion-color' if t == 'fill-extrusion' else 'fill-color')
        if lid in FILLS:
            paint[key] = FILLS[lid]
    elif t == 'line':
        if lid in LINES:
            paint['line-color'] = LINES[lid]
        elif 'rail' in lid:
            paint['line-color'] = RAIL
        elif 'motorway' in lid:
            paint['line-color'] = ROAD_MAIN_CASING if lid.endswith('casing') else ROAD_MAIN
        elif ('trunk_primary' in lid) or ('secondary_tertiary' in lid) or lid.endswith('_link') or ('link_casing' in lid):
            paint['line-color'] = ROAD_MID_CASING if lid.endswith('casing') else ROAD_MID
        elif lid.endswith('casing'):
            paint['line-color'] = NEUTRAL_CASING

with open(os.path.join(BASE, 'js/data/mapstyle.js'), 'w', encoding='utf-8') as f:
    f.write('window.MAP_STYLE=')
    json.dump(s, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('слоёв в стиле:', len(s['layers']))

# ---------- Terrain-вариант (как режим Terrain в Google Maps) ----------
t = json.loads(json.dumps(s))
t['name'] = 'GeoLeyla Terrain'
t['sources']['hillshade'] = {
    'type': 'raster',
    'tiles': ['https://services.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}'],
    'tileSize': 256, 'maxzoom': 13,
    'attribution': 'Esri'
}
T_FILLS = {
    'background': '#d7efdc',
    'water': '#93d7d0',
    'park': 'rgba(168, 216, 160, 0.55)',
    'landcover_wood': 'rgba(116, 186, 128, 0.5)',
    'landcover_grass': 'rgba(165, 214, 152, 0.45)',
    'landcover_ice': 'rgba(244, 250, 252, 0.8)',
    'landcover_sand': 'rgba(243, 233, 198, 0.55)',
    'landuse_residential': 'rgba(224, 234, 222, 0.5)',
    'aeroway_fill': 'rgba(228, 232, 226, 0.6)',
    'building': '#dde3da',
    'building-3d': '#dde3da',
}
T_LINES = {
    'waterway_tunnel': '#93d7d0', 'waterway_river': '#93d7d0', 'waterway_other': '#93d7d0',
    'boundary_3': '#7d8b82',
    'boundary_2': '#46584f',
    'boundary_disputed': '#46584f',
    'park_outline': 'rgba(150, 200, 145, 0.5)',
}
T_ROAD_MAIN, T_ROAD_MAIN_C = '#b7aede', '#998fc7'
T_ROAD_MID, T_ROAD_MID_C = '#d6d0ef', '#b9b3d9'
for l in t['layers']:
    lid = l['id']; paint = l.setdefault('paint', {}); ty = l['type']
    if ty in ('fill', 'background', 'fill-extrusion'):
        key = 'background-color' if ty == 'background' else ('fill-extrusion-color' if ty == 'fill-extrusion' else 'fill-color')
        if lid in T_FILLS: paint[key] = T_FILLS[lid]
    elif ty == 'line':
        if lid in T_LINES: paint['line-color'] = T_LINES[lid]
        elif 'rail' in lid: paint['line-color'] = '#c4c8c2'
        elif 'motorway' in lid: paint['line-color'] = T_ROAD_MAIN_C if lid.endswith('casing') else T_ROAD_MAIN
        elif ('trunk_primary' in lid) or ('secondary_tertiary' in lid) or lid.endswith('_link') or ('link_casing' in lid):
            paint['line-color'] = T_ROAD_MID_C if lid.endswith('casing') else T_ROAD_MID
        elif lid.endswith('casing'): paint['line-color'] = '#cfd6cc'
# вставить рельеф сразу после natural_earth (под воду и дороги)
idx = next(i for i, l in enumerate(t['layers']) if l['id'] == 'natural_earth') + 1
t['layers'].insert(idx, {
    'id': 'esri-hillshade', 'type': 'raster', 'source': 'hillshade',
    'minzoom': 3,
    'paint': {'raster-opacity': 0.62, 'raster-contrast': 0.1}
})
with open(os.path.join(BASE, 'js/data/mapstyle_terrain.js'), 'w', encoding='utf-8') as f:
    f.write('window.MAP_STYLE_TERRAIN=')
    json.dump(t, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print('terrain-слоёв:', len(t['layers']))

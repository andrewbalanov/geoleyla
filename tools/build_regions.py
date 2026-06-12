# -*- coding: utf-8 -*-
"""Сборка js/data/france.js и js/data/usa.js с русскими названиями."""
import json, os, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

FR_RU = {
 "Ain":"Эн","Aisne":"Эна","Allier":"Алье","Alpes-de-Haute-Provence":"Альпы Верхнего Прованса",
 "Hautes-Alpes":"Верхние Альпы","Alpes-Maritimes":"Приморские Альпы","Ardèche":"Ардеш","Ardennes":"Арденны",
 "Ariège":"Арьеж","Aube":"Об","Aude":"Од","Aveyron":"Аверон","Bouches-du-Rhône":"Буш-дю-Рон",
 "Calvados":"Кальвадос","Cantal":"Канталь","Charente":"Шаранта","Charente-Maritime":"Приморская Шаранта",
 "Cher":"Шер","Corrèze":"Коррез","Corse-du-Sud":"Южная Корсика","Haute-Corse":"Верхняя Корсика",
 "Côte-d'Or":"Кот-д’Ор","Côtes-d'Armor":"Кот-д’Армор","Creuse":"Крёз","Dordogne":"Дордонь","Doubs":"Ду",
 "Drôme":"Дром","Eure":"Эр","Eure-et-Loir":"Эр и Луар","Finistère":"Финистер","Gard":"Гар",
 "Haute-Garonne":"Верхняя Гаронна","Gers":"Жер","Gironde":"Жиронда","Hérault":"Эро",
 "Ille-et-Vilaine":"Иль и Вилен","Indre":"Эндр","Indre-et-Loire":"Эндр и Луара","Isère":"Изер","Jura":"Юра",
 "Landes":"Ланды","Loir-et-Cher":"Луар и Шер","Loire":"Луара","Haute-Loire":"Верхняя Луара",
 "Loire-Atlantique":"Атлантическая Луара","Loiret":"Луаре","Lot":"Ло","Lot-et-Garonne":"Ло и Гаронна",
 "Lozère":"Лозер","Maine-et-Loire":"Мен и Луара","Manche":"Манш","Marne":"Марна","Haute-Marne":"Верхняя Марна",
 "Mayenne":"Майен","Meurthe-et-Moselle":"Мёрт и Мозель","Meuse":"Мёз","Morbihan":"Морбиан","Moselle":"Мозель",
 "Nièvre":"Ньевр","Nord":"Нор","Oise":"Уаза","Orne":"Орн","Pas-de-Calais":"Па-де-Кале",
 "Puy-de-Dôme":"Пюи-де-Дом","Pyrénées-Atlantiques":"Атлантические Пиренеи","Hautes-Pyrénées":"Верхние Пиренеи",
 "Pyrénées-Orientales":"Восточные Пиренеи","Bas-Rhin":"Нижний Рейн","Haut-Rhin":"Верхний Рейн","Rhône":"Рона",
 "Haute-Saône":"Верхняя Сона","Saône-et-Loire":"Сона и Луара","Sarthe":"Сарта","Savoie":"Савойя",
 "Haute-Savoie":"Верхняя Савойя","Paris":"Париж","Seine-Maritime":"Приморская Сена",
 "Seine-et-Marne":"Сена и Марна","Yvelines":"Ивелин","Deux-Sèvres":"Дё-Севр","Somme":"Сомма","Tarn":"Тарн",
 "Tarn-et-Garonne":"Тарн и Гаронна","Var":"Вар","Vaucluse":"Воклюз","Vendée":"Вандея","Vienne":"Вьенна",
 "Haute-Vienne":"Верхняя Вьенна","Vosges":"Вогезы","Yonne":"Йонна","Territoire de Belfort":"Бельфор",
 "Essonne":"Эсон","Hauts-de-Seine":"О-де-Сен","Seine-Saint-Denis":"Сен-Сен-Дени","Val-de-Marne":"Валь-де-Марн",
 "Val-d'Oise":"Валь-д’Уаз",
}

US_RU = {
 "Alabama":"Алабама","Alaska":"Аляска","Arizona":"Аризона","Arkansas":"Арканзас","California":"Калифорния",
 "Colorado":"Колорадо","Connecticut":"Коннектикут","Delaware":"Делавэр","Florida":"Флорида","Georgia":"Джорджия",
 "Hawaii":"Гавайи","Idaho":"Айдахо","Illinois":"Иллинойс","Indiana":"Индиана","Iowa":"Айова","Kansas":"Канзас",
 "Kentucky":"Кентукки","Louisiana":"Луизиана","Maine":"Мэн","Maryland":"Мэриленд","Massachusetts":"Массачусетс",
 "Michigan":"Мичиган","Minnesota":"Миннесота","Mississippi":"Миссисипи","Missouri":"Миссури","Montana":"Монтана",
 "Nebraska":"Небраска","Nevada":"Невада","New Hampshire":"Нью-Гэмпшир","New Jersey":"Нью-Джерси",
 "New Mexico":"Нью-Мексико","New York":"Нью-Йорк","North Carolina":"Северная Каролина",
 "North Dakota":"Северная Дакота","Ohio":"Огайо","Oklahoma":"Оклахома","Oregon":"Орегон",
 "Pennsylvania":"Пенсильвания","Rhode Island":"Род-Айленд","South Carolina":"Южная Каролина",
 "South Dakota":"Южная Дакота","Tennessee":"Теннесси","Texas":"Техас","Utah":"Юта","Vermont":"Вермонт",
 "Virginia":"Вирджиния","Washington":"Вашингтон","West Virginia":"Западная Вирджиния","Wisconsin":"Висконсин",
 "Wyoming":"Вайоминг",
}

# --- Франция: плоский GeoJSON, метрополия (96) ---
fr = json.load(open(os.path.join(BASE, 'tools/france-dep.geojson'), encoding='utf-8'))
metro = re.compile(r'^(0[1-9]|[1-8][0-9]|9[0-5]|2A|2B)$')
feats = []
missing = []
for f in fr['features']:
    code, nom = f['properties']['code'], f['properties']['nom']
    if not metro.match(code):
        continue
    ru = FR_RU.get(nom)
    if not ru:
        missing.append(nom)
        ru = nom
    feats.append({'type': 'Feature',
                  'properties': {'code': code, 'name': ru, 'orig': nom},
                  'geometry': f['geometry']})
out = {'type': 'FeatureCollection', 'features': feats}
with open(os.path.join(BASE, 'js/data/france.js'), 'w', encoding='utf-8') as f:
    f.write('window.FRANCE_GEO=')
    json.dump(out, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print(f'Франция: {len(feats)} департаментов; без перевода: {missing}')

# --- США: TopoJSON, только 50 штатов ---
us = json.load(open(os.path.join(BASE, 'tools/us-states-10m.json'), encoding='utf-8'))
geoms = us['objects']['states']['geometries']
keep = []
dropped = []
for g in geoms:
    name = g['properties'].get('name', '')
    ru = US_RU.get(name)
    if ru:
        g['properties'] = {'name': ru, 'orig': name}
        keep.append(g)
    else:
        dropped.append(name)
us['objects']['states']['geometries'] = keep
with open(os.path.join(BASE, 'js/data/usa.js'), 'w', encoding='utf-8') as f:
    f.write('window.USA_TOPO=')
    json.dump(us, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
print(f'США: {len(keep)} штатов; исключены: {dropped}')

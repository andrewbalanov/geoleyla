# -*- coding: utf-8 -*-
"""Сборка игровых данных Geomaster: js/data/world.js + js/data/countries.js"""
import json, sys, os

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
T = lambda *p: os.path.join(BASE, 'tools', *p)
OUT = lambda *p: os.path.join(BASE, 'js', 'data', *p)

topo = json.load(open(T('countries-50m.json')))
meta = json.load(open(T('countries-meta2.json')))
ne = json.load(open(T('ne_places.geojson')))

# ---------- Русские названия столиц (ключ — английское название из Natural Earth / mledoze) ----------
CAP_RU = {
 "Abu Dhabi":"Абу-Даби","Abuja":"Абуджа","Accra":"Аккра","Addis Ababa":"Аддис-Абеба","Algiers":"Алжир",
 "Amman":"Амман","Amsterdam":"Амстердам","Andorra la Vella":"Андорра-ла-Велья","Ankara":"Анкара",
 "Antananarivo":"Антананариву","Apia":"Апиа","Ashgabat":"Ашхабад","Asmara":"Асмэра","Astana":"Астана",
 "Nur-Sultan":"Астана","Asuncion":"Асунсьон","Asunción":"Асунсьон","Athens":"Афины","Baghdad":"Багдад",
 "Baku":"Баку","Bamako":"Бамако","Bandar Seri Begawan":"Бандар-Сери-Бегаван","Bangkok":"Бангкок",
 "Bangui":"Банги","Banjul":"Банжул","Basseterre":"Бастер","Beijing":"Пекин","Beirut":"Бейрут",
 "Belgrade":"Белград","Belmopan":"Бельмопан","Berlin":"Берлин","Bern":"Берн","Bishkek":"Бишкек",
 "Bissau":"Бисау","Bogota":"Богота","Bogotá":"Богота","Brasilia":"Бразилиа","Brasília":"Бразилиа",
 "Bratislava":"Братислава","Brazzaville":"Браззавиль","Bridgetown":"Бриджтаун","Brussels":"Брюссель",
 "Bucharest":"Бухарест","Budapest":"Будапешт","Buenos Aires":"Буэнос-Айрес","Bujumbura":"Бужумбура",
 "Cairo":"Каир","Canberra":"Канберра","Caracas":"Каракас","Castries":"Кастри","Chisinau":"Кишинёв",
 "Chișinău":"Кишинёв","Colombo":"Коломбо","Conakry":"Конакри","Copenhagen":"Копенгаген","Dakar":"Дакар",
 "Damascus":"Дамаск","Dar es Salaam":"Дар-эс-Салам","Dhaka":"Дакка","Dili":"Дили","Djibouti":"Джибути",
 "Dodoma":"Додома","Doha":"Доха","Dublin":"Дублин","Dushanbe":"Душанбе","Freetown":"Фритаун",
 "Funafuti":"Фунафути","Gaborone":"Габороне","Georgetown":"Джорджтаун","Gitega":"Гитега",
 "Guatemala City":"Гватемала","Guatemala":"Гватемала","Hanoi":"Ханой","Ha Noi":"Ханой","Harare":"Хараре",
 "Havana":"Гавана","Helsinki":"Хельсинки","Honiara":"Хониара","Islamabad":"Исламабад","Jakarta":"Джакарта",
 "Jerusalem":"Иерусалим","Juba":"Джуба","Kabul":"Кабул","Kampala":"Кампала","Kathmandu":"Катманду",
 "Khartoum":"Хартум","Kigali":"Кигали","Kingston":"Кингстон","Kingstown":"Кингстаун","Kinshasa":"Киншаса",
 "Kuala Lumpur":"Куала-Лумпур","Kuwait City":"Эль-Кувейт","Kuwait":"Эль-Кувейт","Kyiv":"Киев","Kiev":"Киев",
 "La Paz":"Ла-Пас","Libreville":"Либревиль","Lilongwe":"Лилонгве","Lima":"Лима","Lisbon":"Лиссабон",
 "Ljubljana":"Любляна","Lome":"Ломе","Lomé":"Ломе","London":"Лондон","Luanda":"Луанда","Lusaka":"Лусака",
 "Luxembourg":"Люксембург","Madrid":"Мадрид","Majuro":"Маджуро","Malabo":"Малабо","Male":"Мале",
 "Malé":"Мале","Managua":"Манагуа","Manama":"Манама","Manila":"Манила","Maputo":"Мапуту","Maseru":"Масеру",
 "Mbabane":"Мбабане","Mbabné":"Мбабане","Mexico City":"Мехико","Minsk":"Минск","Mogadishu":"Могадишо",
 "Monaco":"Монако","Monrovia":"Монровия","Montevideo":"Монтевидео","Moroni":"Морони","Moscow":"Москва",
 "Muscat":"Маскат","Nairobi":"Найроби","Nassau":"Нассау","Naypyidaw":"Нейпьидо","Nay Pyi Taw":"Нейпьидо",
 "N'Djamena":"Нджамена","Ndjamena":"Нджамена","New Delhi":"Нью-Дели","Ngerulmud":"Нгерулмуд",
 "Niamey":"Ниамей","Nicosia":"Никосия","Nouakchott":"Нуакшот","Nuku'alofa":"Нукуалофа",
 "Nukualofa":"Нукуалофа","Oslo":"Осло","Ottawa":"Оттава","Ouagadougou":"Уагадугу","Palikir":"Паликир",
 "Panama City":"Панама","Paramaribo":"Парамарибо","Paris":"Париж","Phnom Penh":"Пномпень",
 "Podgorica":"Подгорица","Port Louis":"Порт-Луи","Port Moresby":"Порт-Морсби","Port of Spain":"Порт-оф-Спейн",
 "Port-of-Spain":"Порт-оф-Спейн","Port Vila":"Порт-Вила","Port-au-Prince":"Порт-о-Пренс",
 "Porto-Novo":"Порто-Ново","Prague":"Прага","Praia":"Прая","Pretoria":"Претория","Pristina":"Приштина",
 "Prishtina":"Приштина","Priština":"Приштина","Putrajaya":"Путраджая","Pyongyang":"Пхеньян","Quito":"Кито",
 "Rabat":"Рабат","Ramallah":"Рамалла","Reykjavik":"Рейкьявик","Reykjavík":"Рейкьявик","Riga":"Рига",
 "Riyadh":"Эр-Рияд","Rome":"Рим","Roseau":"Розо","San Jose":"Сан-Хосе","San José":"Сан-Хосе",
 "San Marino":"Сан-Марино","San Salvador":"Сан-Сальвадор","Sana'a":"Сана","Sanaa":"Сана",
 "Santiago":"Сантьяго","Santo Domingo":"Санто-Доминго","Sao Tome":"Сан-Томе","São Tomé":"Сан-Томе",
 "Sarajevo":"Сараево","Seoul":"Сеул","Singapore":"Сингапур","Skopje":"Скопье","Sofia":"София",
 "Sri Jayawardenepura Kotte":"Шри-Джаяварденепура-Котте","St. George's":"Сент-Джорджес",
 "Saint George's":"Сент-Джорджес","St. John's":"Сент-Джонс","Saint John's":"Сент-Джонс",
 "Stockholm":"Стокгольм","Sucre":"Сукре","Suva":"Сува","Taipei":"Тайбэй","Tallinn":"Таллин",
 "Tarawa":"Южная Тарава","South Tarawa":"Южная Тарава","Tashkent":"Ташкент","Tbilisi":"Тбилиси",
 "Tegucigalpa":"Тегусигальпа","Tehran":"Тегеран","Thimphu":"Тхимпху","Tirana":"Тирана","Tokyo":"Токио",
 "Tripoli":"Триполи","Tunis":"Тунис","Ulaanbaatar":"Улан-Батор","Ulan Bator":"Улан-Батор","Vaduz":"Вадуц",
 "Valletta":"Валлетта","Vatican City":"Ватикан","Victoria":"Виктория","Vienna":"Вена","Vientiane":"Вьентьян",
 "Vilnius":"Вильнюс","Warsaw":"Варшава","Washington, D.C.":"Вашингтон","Washington D.C.":"Вашингтон",
 "Washington":"Вашингтон","Wellington":"Веллингтон","Windhoek":"Виндхук","Yamoussoukro":"Ямусукро",
 "Yaounde":"Яунде","Yaoundé":"Яунде","Yaren":"Ярен","Yerevan":"Ереван","Zagreb":"Загреб",
 "Lobamba":"Лобамба","Abidjan":"Абиджан","Cotonou":"Котону","The Hague":"Гаага",
 "Andorra":"Андорра-ла-Велья","Kobenhavn":"Копенгаген","København":"Копенгаген",
}

# Принудительный выбор столицы (официальная) и её координат: iso2 -> (ru, lat, lng)
CAP_OVERRIDE = {
 "TZ": ("Додома", -6.173, 35.742),
 "BO": ("Сукре", -19.0475, -65.2603),
 "LK": ("Шри-Джаяварденепура-Котте", 6.9027, 79.8607),
 "KZ": ("Астана", 51.1694, 71.4491),
 "MM": ("Нейпьидо", 19.7633, 96.0785),
 "CI": ("Ямусукро", 6.8276, -5.2893),
 "BJ": ("Порто-Ново", 6.4969, 2.6289),
 "BI": ("Гитега", -3.4264, 29.9308),
 "NL": ("Амстердам", 52.3676, 4.9041),
 "IL": ("Иерусалим", 31.7683, 35.2137),
 "ZA": ("Претория", -25.7479, 28.2293),
 "MY": ("Куала-Лумпур", 3.139, 101.6869),
 "SZ": ("Мбабане", -26.3054, 31.1367),
 "PS": ("Рамалла", 31.9038, 35.2034),
 "XK": ("Приштина", 42.6629, 21.1655),
 "NR": ("Ярен", -0.5477, 166.9209),
 "PW": ("Нгерулмуд", 7.5006, 134.6242),
}

# Короткие/привычные русские названия стран (поверх mledoze translations.rus.common)
NAME_RU_OVERRIDE = {
 "US":"США","GB":"Великобритания","KR":"Южная Корея","KP":"Северная Корея","CD":"ДР Конго","CG":"Конго",
 "MK":"Северная Македония","SZ":"Эсватини","CZ":"Чехия","AE":"ОАЭ","VA":"Ватикан","TL":"Восточный Тимор",
 "CV":"Кабо-Верде","MM":"Мьянма","TW":"Тайвань","XK":"Косово","PS":"Палестина","FM":"Микронезия",
 "VC":"Сент-Винсент и Гренадины","KN":"Сент-Китс и Невис","BA":"Босния и Герцеговина",
 "CF":"ЦАР","DO":"Доминиканская Республика","SY":"Сирия","LA":"Лаос","BN":"Бруней","TT":"Тринидад и Тобаго",
}

REGION_RU = {"Africa":"Африка","Americas":"Америка","Asia":"Азия","Europe":"Европа","Oceania":"Океания","Antarctic":"Антарктика"}

# Малоизвестные страны — исключаются из пула «Известные»
NOT_FAMOUS = set("TV NR KI PW FM MH SB VU WS TO KM ST CV GW GQ GA TG BJ BI MW LS SZ DJ ER GM GN SL LR BF NE TD MR CF TL AG DM GD KN LC VC SR GY BZ".split())

# Алиасы: mledoze common name -> world-atlas properties.name
TOPO_ALIAS = {
 "United States":"United States of America","Tanzania":"United Republic of Tanzania","Kosovo":"Kosovo",
 "Czechia":"Czechia","DR Congo":"Dem. Rep. Congo","Republic of the Congo":"Congo",
 "Central African Republic":"Central African Rep.","South Sudan":"S. Sudan","Ivory Coast":"Côte d'Ivoire",
 "Bosnia and Herzegovina":"Bosnia and Herz.","North Macedonia":"Macedonia","Dominican Republic":"Dominican Rep.",
 "Equatorial Guinea":"Eq. Guinea","Eswatini":"eSwatini","Solomon Islands":"Solomon Is.",
 "Marshall Islands":"Marshall Is.","Saint Kitts and Nevis":"St. Kitts and Nevis",
 "Saint Vincent and the Grenadines":"St. Vin. and Gren.","Saint Lucia":"Saint Lucia",
 "Antigua and Barbuda":"Antigua and Barb.","Sao Tome and Principe":"São Tomé and Principe",
 "Western Sahara":"W. Sahara","South Korea":"South Korea","North Korea":"North Korea",
 "Palestine":"Palestine","Vatican City":"Vatican","Cape Verde":"Cabo Verde","East Timor":"Timor-Leste",
}

geoms = topo['objects']['countries']['geometries']
by_id = {}
by_name = {}
for i, g in enumerate(geoms):
    gid = str(g.get('id', ''))
    by_id.setdefault(gid, []).append(i)
    nm = (g.get('properties') or {}).get('name', '')
    by_name[nm] = i

# Столицы Natural Earth: iso2 -> (name, lat, lng); основная столица приоритетнее alt
ne_caps = {}
for f in ne['features']:
    p = f['properties']
    fc = str(p.get('featurecla', ''))
    if not fc.startswith('Admin-0 capital'):
        continue
    iso2 = p.get('iso_a2') or ''
    if not iso2 or iso2 == '-99':
        continue
    main = (fc == 'Admin-0 capital')
    cur = ne_caps.get(iso2)
    if cur is None or (main and not cur[3]):
        nm = p.get('nameascii') or p.get('name')
        ne_caps[iso2] = (nm, p['latitude'], p['longitude'], main, p.get('name'))

countries = []
missing_topo, missing_cap, missing_ru = [], [], []

for c in meta:
    iso2 = c['cca2']
    independent = c.get('independent') is True
    if not (independent or iso2 in ('TW', 'XK')):
        continue
    common = c['name']['common']
    # --- полигон на карте ---
    fid = None
    ccn3 = str(c.get('ccn3') or '')
    cand = by_id.get(ccn3, []) if ccn3 else []
    if len(cand) == 1:
        fid = cand[0]
    else:
        tn = TOPO_ALIAS.get(common, common)
        if tn in by_name:
            fid = by_name[tn]
    if fid is None:
        missing_topo.append(f"{iso2} {common}")
    # --- столица ---
    cap_ru = clat = clng = None
    if iso2 in CAP_OVERRIDE:
        cap_ru, clat, clng = CAP_OVERRIDE[iso2]
    elif iso2 in ne_caps:
        nm, lat, lng, _, raw = ne_caps[iso2]
        cap_ru = CAP_RU.get(nm) or CAP_RU.get(raw or '')
        if cap_ru is None:
            missing_ru.append(f"{iso2} NE:{nm}")
        clat, clng = lat, lng
    else:
        caps = c.get('capital') or []
        if caps:
            cap_ru = CAP_RU.get(caps[0])
            if cap_ru is None:
                missing_ru.append(f"{iso2} mledoze:{caps[0]}")
        latlng = c.get('latlng') or [None, None]
        clat, clng = latlng[0], latlng[1]
        missing_cap.append(f"{iso2} {common} -> центр страны")
    name_ru = NAME_RU_OVERRIDE.get(iso2) or (c.get('translations', {}).get('rus', {}) or {}).get('common') or common
    countries.append({
        'iso2': iso2.lower(),
        'fid': fid,
        'name': name_ru,
        'nameEn': common,
        'capital': cap_ru,
        'clat': round(clat, 4) if clat is not None else None,
        'clng': round(clng, 4) if clng is not None else None,
        'lat': (c.get('latlng') or [0, 0])[0],
        'lng': (c.get('latlng') or [0, 0])[1],
        'region': REGION_RU.get(c.get('region', ''), c.get('region', '')),
        'top': iso2 not in NOT_FAMOUS,
    })

countries.sort(key=lambda x: x['name'])

os.makedirs(OUT(), exist_ok=True)
with open(OUT('world.js'), 'w', encoding='utf-8') as f:
    f.write('window.WORLD_TOPO=')
    json.dump(topo, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')
with open(OUT('countries.js'), 'w', encoding='utf-8') as f:
    f.write('window.COUNTRIES=')
    json.dump(countries, f, ensure_ascii=False, separators=(',', ':'))
    f.write(';\n')

print(f"стран в игре: {len(countries)}; популярных: {sum(1 for x in countries if x['top'])}")
print(f"без полигона на карте: {len(missing_topo)} -> {missing_topo}")
print(f"столица = центр страны (нет точки NE): {len(missing_cap)} -> {missing_cap}")
print(f"нет русского названия столицы: {len(missing_ru)} -> {missing_ru}")
caps_named = sum(1 for x in countries if x['capital'])
print(f"столиц с русским названием: {caps_named}/{len(countries)}")

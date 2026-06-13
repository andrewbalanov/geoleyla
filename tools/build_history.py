# -*- coding: utf-8 -*-
"""100 исторических событий: точные координаты + описания (RU/EN) и фото из Википедии.
Выход: js/data/history.js  ->  window.HISTORY = [ {img,name,en,lat,lng,year,cat,r,info,infoEn,photo}, ... ]
Запуск: python3 tools/build_history.py
"""
import json, os, re, time, urllib.parse, urllib.request

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RU_API = "https://ru.wikipedia.org/w/api.php"
EN_API = "https://en.wikipedia.org/w/api.php"
UA = {"User-Agent": "GeoClubGame/1.0 (educational project)"}

# slug, имя RU, статья RU (для запроса), год (отриц.=до н.э.), lat, lng, категория
EVENTS = [
 ("marathon", "Марафонская битва", "Марафонская битва", -490, 38.073, 23.93, "battle"),
 ("thermopylae", "Битва при Фермопилах", "Битва при Фермопилах", -480, 38.797, 22.536, "battle"),
 ("gaugamela", "Битва при Гавгамелах", "Битва при Гавгамелах", -331, 36.36, 43.25, "battle"),
 ("cannae", "Битва при Каннах", "Битва при Каннах", -216, 41.306, 16.132, "battle"),
 ("zama", "Битва при Заме", "Битва при Заме", -202, 36.30, 9.43, "battle"),
 ("hastings", "Битва при Гастингсе", "Битва при Гастингсе", 1066, 50.911, 0.487, "battle"),
 ("icebattle", "Ледовое побоище", "Ледовое побоище", 1242, 58.68, 27.49, "battle"),
 ("hattin", "Битва при Хаттине", "Битва при Хаттине", 1187, 32.80, 35.45, "battle"),
 ("kulikovo", "Куликовская битва", "Куликовская битва", 1380, 53.62, 38.66, "battle"),
 ("grunwald", "Грюнвальдская битва", "Грюнвальдская битва", 1410, 53.49, 20.12, "battle"),
 ("agincourt", "Битва при Азенкуре", "Битва при Азенкуре", 1415, 50.464, 2.141, "battle"),
 ("constantinople", "Падение Константинополя", "Падение Константинополя", 1453, 41.013, 28.983, "battle"),
 ("bosworth", "Битва при Босворте", "Битва при Босворте", 1485, 52.586, -1.41, "battle"),
 ("lepanto", "Битва при Лепанто", "Битва при Лепанто", 1571, 38.20, 21.30, "battle"),
 ("poltava", "Полтавская битва", "Полтавская битва", 1709, 49.61, 34.55, "battle"),
 ("trafalgar", "Трафальгарское сражение", "Трафальгарское сражение", 1805, 36.27, -6.27, "battle"),
 ("austerlitz", "Битва при Аустерлице", "Битва под Аустерлицем", 1805, 49.13, 16.76, "battle"),
 ("borodino", "Бородинское сражение", "Бородинское сражение", 1812, 55.52, 35.82, "battle"),
 ("waterloo", "Битва при Ватерлоо", "Битва при Ватерлоо", 1815, 50.68, 4.412, "battle"),
 ("gettysburg", "Битва при Геттисберге", "Геттисбергское сражение", 1863, 39.81, -77.23, "battle"),
 ("somme", "Битва на Сомме", "Битва на Сомме", 1916, 50.00, 2.68, "battle"),
 ("verdun", "Битва при Вердене", "Верденская битва", 1916, 49.208, 5.42, "battle"),
 ("pearlharbor", "Нападение на Пёрл-Харбор", "Нападение на Пёрл-Харбор", 1941, 21.365, -157.95, "battle"),
 ("moscow1941", "Битва за Москву", "Битва за Москву", 1941, 55.75, 37.62, "battle"),
 ("stalingrad", "Сталинградская битва", "Сталинградская битва", 1942, 48.71, 44.51, "battle"),
 ("kursk", "Курская битва", "Курская битва", 1943, 51.0, 36.0, "battle"),
 ("dday", "Высадка в Нормандии", "Нормандская операция", 1944, 49.34, -0.51, "battle"),
 ("iwojima", "Битва за Иводзиму", "Битва за Иводзиму", 1945, 24.78, 141.32, "battle"),
 ("berlin1945", "Берлинская операция", "Берлинская операция (1945)", 1945, 52.52, 13.40, "battle"),
 ("hwando", "Битва при Хальхин-Голе", "Бои на Халхин-Голе", 1939, 47.73, 118.6, "battle"),

 ("columbus", "Колумб достиг Америки", "Открытие Америки", 1492, 24.0, -74.5, "discovery"),
 ("vascodagama", "Васко да Гама в Индии", "Васко да Гама", 1498, 11.25, 75.78, "discovery"),
 ("magellan", "Кругосветка Магеллана", "Первое кругосветное плавание", 1519, 36.78, -6.35, "discovery"),
 ("cook", "Кук открывает Австралию", "Джеймс Кук", 1770, -34.0, 151.23, "discovery"),
 ("bellingshausen", "Первая русская антарктическая экспедиция", "Первая русская антарктическая экспедиция", 1820, -69.0, 1.0, "discovery"),
 ("southpole", "Амундсен на Южном полюсе", "Амундсен, Руаль", 1911, -90.0, 0.0, "discovery"),
 ("northpole", "Покорение Северного полюса", "Северный полюс", 1909, 90.0, 0.0, "discovery"),
 ("everest", "Первое восхождение на Эверест", "Джомолунгма", 1953, 27.988, 86.925, "discovery"),
 ("machupicchu", "Открытие Мачу-Пикчу", "Мачу-Пикчу", 1911, -13.163, -72.545, "discovery"),
 ("tutankhamun", "Гробница Тутанхамона", "Гробница Тутанхамона", 1922, 25.740, 32.601, "discovery"),
 ("rosetta", "Розеттский камень", "Розеттский камень", 1799, 31.40, 30.42, "discovery"),
 ("titanicroute", "Первый трансатлантический телеграф", "Трансатлантический телеграфный кабель", 1858, 51.92, -10.30, "discovery"),

 ("vesuvius", "Извержение Везувия", "Извержение Везувия (79)", 79, 40.75, 14.49, "disaster"),
 ("lisbon", "Лиссабонское землетрясение", "Лиссабонское землетрясение 1755 года", 1755, 38.72, -9.14, "disaster"),
 ("tambora", "Извержение Тамбора", "Тамбора", 1815, -8.25, 118.0, "disaster"),
 ("krakatoa", "Извержение Кракатау", "Кракатау", 1883, -6.102, 105.423, "disaster"),
 ("greatfire", "Великий пожар Лондона", "Великий лондонский пожар", 1666, 51.512, -0.092, "disaster"),
 ("sanfran1906", "Землетрясение в Сан-Франциско", "Землетрясение в Сан-Франциско (1906)", 1906, 37.77, -122.42, "disaster"),
 ("titanic", "Гибель «Титаника»", "Титаник", 1912, 41.726, -49.948, "disaster"),
 ("kanto", "Великое землетрясение Канто", "Великое землетрясение Канто", 1923, 35.33, 139.15, "disaster"),
 ("hiroshima", "Бомбардировка Хиросимы", "Атомная бомбардировка Хиросимы и Нагасаки", 1945, 34.395, 132.455, "disaster"),
 ("nagasaki", "Бомбардировка Нагасаки", "Атомная бомбардировка Нагасаки", 1945, 32.773, 129.863, "disaster"),
 ("chernobyl", "Чернобыльская катастрофа", "Авария на Чернобыльской АЭС", 1986, 51.389, 30.099, "disaster"),
 ("tsunami2004", "Цунами в Индийском океане", "Землетрясение в Индийском океане (2004)", 2004, 3.30, 95.98, "disaster"),
 ("fukushima", "Авария на Фукусиме", "Авария на АЭС Фукусима-1", 2011, 37.421, 141.033, "disaster"),

 ("pyramids", "Строительство пирамиды Хеопса", "Пирамида Хеопса", -2560, 29.979, 31.134, "ancient"),
 ("stonehenge", "Возведение Стоунхенджа", "Стоунхендж", -2500, 51.179, -1.826, "ancient"),
 ("greatwall", "Великая Китайская стена", "Великая Китайская стена", -220, 40.432, 116.57, "ancient"),
 ("olympia", "Первые Олимпийские игры", "Античные Олимпийские игры", -776, 37.638, 21.63, "ancient"),
 ("rome", "Основание Рима", "Основание Рима", -753, 41.892, 12.485, "ancient"),
 ("alexandria", "Основание Александрии", "Александрия", -331, 31.20, 29.92, "ancient"),
 ("colosseum", "Открытие Колизея", "Колизей", 80, 41.890, 12.492, "ancient"),
 ("petra", "Расцвет Петры", "Петра", -100, 30.328, 35.444, "ancient"),
 ("chichenitza", "Возведение Чичен-Ицы", "Чичен-Ица", 600, 20.683, -88.568, "ancient"),
 ("angkor", "Строительство Ангкор-Вата", "Ангкор-Ват", 1150, 13.412, 103.867, "ancient"),
 ("tajmahal", "Строительство Тадж-Махала", "Тадж-Махал", 1653, 27.175, 78.042, "ancient"),
 ("silkroad", "Открытие Великого шёлкового пути", "Великий шёлковый путь", -130, 39.654, 66.96, "ancient"),
 ("terracotta", "Терракотовая армия", "Терракотовая армия", -210, 34.385, 109.279, "ancient"),

 ("rometfall", "Падение Западной Римской империи", "Падение Западной Римской империи", 476, 41.89, 12.49, "politics"),
 ("charlemagne", "Коронация Карла Великого", "Карл Великий", 800, 41.902, 12.454, "politics"),
 ("rus988", "Крещение Руси", "Крещение Руси", 988, 50.45, 30.52, "politics"),
 ("magnacarta", "Великая хартия вольностей", "Великая хартия вольностей", 1215, 51.444, -0.567, "politics"),
 ("luther", "95 тезисов Лютера", "95 тезисов", 1517, 51.866, 12.65, "politics"),
 ("mayflower", "Прибытие «Мейфлауэра»", "Мейфлауэр", 1620, 41.958, -70.662, "politics"),
 ("bostontea", "Бостонское чаепитие", "Бостонское чаепитие", 1773, 42.352, -71.052, "politics"),
 ("usdeclaration", "Декларация независимости США", "Декларация независимости США", 1776, 39.949, -75.150, "politics"),
 ("bastille", "Взятие Бастилии", "Взятие Бастилии", 1789, 48.853, 2.369, "politics"),
 ("octrev", "Октябрьская революция", "Октябрьская революция", 1917, 59.941, 30.375, "politics"),
 ("sarajevo", "Убийство в Сараеве", "Сараевское убийство", 1914, 43.858, 18.429, "politics"),
 ("versailles", "Версальский договор", "Версальский договор", 1919, 48.805, 2.121, "politics"),
 ("yalta", "Ялтинская конференция", "Ялтинская конференция", 1945, 44.467, 34.143, "politics"),
 ("japansurrender", "Капитуляция Японии", "Капитуляция Японии", 1945, 35.36, 139.77, "politics"),
 ("berlinwall", "Падение Берлинской стены", "Падение Берлинской стены", 1989, 52.516, 13.377, "politics"),
 ("ussrend", "Распад СССР", "Беловежские соглашения", 1991, 52.55, 23.85, "politics"),
 ("mlk", "Речь «У меня есть мечта»", "У меня есть мечта", 1963, 38.889, -77.050, "politics"),
 ("cubacrisis", "Карибский кризис", "Карибский кризис", 1962, 23.13, -82.38, "politics"),
 ("911", "Теракты 11 сентября", "Террористический акт 11 сентября 2001 года", 2001, 40.712, -74.013, "politics"),

 ("gutenberg", "Изобретение книгопечатания", "Гутенберг, Иоганн", 1440, 49.999, 8.271, "science"),
 ("wright", "Первый полёт братьев Райт", "Флайер-1", 1903, 36.019, -75.671, "science"),
 ("penicillin", "Открытие пенициллина", "Пенициллин", 1928, 51.517, -0.173, "science"),
 ("trinity", "Испытание «Тринити»", "Тринити (ядерное испытание)", 1945, 33.677, -106.475, "science"),
 ("dna", "Открытие структуры ДНК", "Двойная спираль", 1953, 52.203, 0.121, "science"),
 ("cern", "Запуск Большого адронного коллайдера", "Большой адронный коллайдер", 2008, 46.234, 6.055, "science"),
 ("telephone", "Изобретение телефона", "Телефон", 1876, 42.362, -71.084, "science"),
 ("edison", "Лампа накаливания Эдисона", "Лампа накаливания", 1879, 40.568, -74.332, "science"),
 ("radioactivity", "Открытие радия", "Кюри, Мария", 1898, 48.843, 2.345, "science"),
 ("goldrush", "Золотая лихорадка в Калифорнии", "Калифорнийская золотая лихорадка", 1848, 38.80, -120.89, "science"),

 ("gagarin", "Первый полёт человека в космос", "Восток-1", 1961, 45.92, 63.342, "space"),
 ("apollo11", "Запуск «Аполлона-11»", "Аполлон-11", 1969, 28.573, -80.649, "space"),
 ("sputnik", "Запуск первого спутника", "Спутник-1", 1957, 45.92, 63.342, "space"),

 ("suez", "Открытие Суэцкого канала", "Суэцкий канал", 1869, 30.58, 32.27, "discovery"),
 ("panama", "Открытие Панамского канала", "Панамский канал", 1914, 9.08, -79.68, "discovery"),
]


# место события: slug -> (RU «Город, Страна», EN «City, Country»)
PLACE = {
 "marathon": ("Марафон, Греция", "Marathon, Greece"),
 "thermopylae": ("Фермопилы, Греция", "Thermopylae, Greece"),
 "gaugamela": ("близ Мосула, Ирак", "near Mosul, Iraq"),
 "cannae": ("Канны, Италия", "Cannae, Italy"),
 "zama": ("Зама, Тунис", "Zama, Tunisia"),
 "hastings": ("Гастингс, Англия", "Hastings, England"),
 "icebattle": ("Чудское озеро, Россия", "Lake Peipus, Russia"),
 "hattin": ("Рога Хаттина, Израиль", "Horns of Hattin, Israel"),
 "kulikovo": ("Куликово поле, Россия", "Kulikovo Field, Russia"),
 "grunwald": ("Грюнвальд, Польша", "Grunwald, Poland"),
 "agincourt": ("Азенкур, Франция", "Agincourt, France"),
 "constantinople": ("Стамбул, Турция", "Istanbul, Turkey"),
 "bosworth": ("Босворт, Англия", "Bosworth, England"),
 "lepanto": ("залив Патраикос, Греция", "Gulf of Patras, Greece"),
 "poltava": ("Полтава, Украина", "Poltava, Ukraine"),
 "trafalgar": ("мыс Трафальгар, Испания", "Cape Trafalgar, Spain"),
 "austerlitz": ("Славков, Чехия", "Slavkov, Czechia"),
 "borodino": ("Бородино, Россия", "Borodino, Russia"),
 "waterloo": ("Ватерлоо, Бельгия", "Waterloo, Belgium"),
 "gettysburg": ("Геттисберг, США", "Gettysburg, USA"),
 "somme": ("река Сомма, Франция", "Somme, France"),
 "verdun": ("Верден, Франция", "Verdun, France"),
 "pearlharbor": ("Пёрл-Харбор, Гавайи, США", "Pearl Harbor, Hawaii, USA"),
 "moscow1941": ("Москва, Россия", "Moscow, Russia"),
 "stalingrad": ("Волгоград, Россия", "Volgograd, Russia"),
 "kursk": ("Курск, Россия", "Kursk, Russia"),
 "dday": ("Нормандия, Франция", "Normandy, France"),
 "iwojima": ("Иводзима, Япония", "Iwo Jima, Japan"),
 "berlin1945": ("Берлин, Германия", "Berlin, Germany"),
 "hwando": ("Халхин-Гол, Монголия", "Khalkhin Gol, Mongolia"),
 "columbus": ("Сан-Сальвадор, Багамы", "San Salvador, Bahamas"),
 "vascodagama": ("Каликут, Индия", "Calicut, India"),
 "magellan": ("Санлукар, Испания", "Sanlúcar, Spain"),
 "cook": ("Ботани-Бей, Австралия", "Botany Bay, Australia"),
 "bellingshausen": ("Антарктида", "Antarctica"),
 "southpole": ("Южный полюс", "South Pole"),
 "northpole": ("Северный полюс", "North Pole"),
 "everest": ("Эверест, Непал", "Mount Everest, Nepal"),
 "machupicchu": ("Мачу-Пикчу, Перу", "Machu Picchu, Peru"),
 "tutankhamun": ("Долина Царей, Египет", "Valley of the Kings, Egypt"),
 "rosetta": ("Розетта, Египет", "Rosetta, Egypt"),
 "titanicroute": ("Валентия, Ирландия", "Valentia, Ireland"),
 "suez": ("Суэцкий канал, Египет", "Suez Canal, Egypt"),
 "panama": ("Панамский канал, Панама", "Panama Canal, Panama"),
 "vesuvius": ("Помпеи, Италия", "Pompeii, Italy"),
 "lisbon": ("Лиссабон, Португалия", "Lisbon, Portugal"),
 "tambora": ("вулкан Тамбора, Индонезия", "Mount Tambora, Indonesia"),
 "krakatoa": ("Кракатау, Индонезия", "Krakatoa, Indonesia"),
 "greatfire": ("Лондон, Англия", "London, England"),
 "sanfran1906": ("Сан-Франциско, США", "San Francisco, USA"),
 "titanic": ("Северная Атлантика", "North Atlantic"),
 "kanto": ("Токио, Япония", "Tokyo, Japan"),
 "hiroshima": ("Хиросима, Япония", "Hiroshima, Japan"),
 "nagasaki": ("Нагасаки, Япония", "Nagasaki, Japan"),
 "chernobyl": ("Припять, Украина", "Pripyat, Ukraine"),
 "tsunami2004": ("Суматра, Индонезия", "Sumatra, Indonesia"),
 "fukushima": ("Фукусима, Япония", "Fukushima, Japan"),
 "pyramids": ("Гиза, Египет", "Giza, Egypt"),
 "stonehenge": ("Уилтшир, Англия", "Wiltshire, England"),
 "greatwall": ("Китай", "China"),
 "olympia": ("Олимпия, Греция", "Olympia, Greece"),
 "rome": ("Рим, Италия", "Rome, Italy"),
 "alexandria": ("Александрия, Египет", "Alexandria, Egypt"),
 "colosseum": ("Рим, Италия", "Rome, Italy"),
 "petra": ("Петра, Иордания", "Petra, Jordan"),
 "chichenitza": ("Юкатан, Мексика", "Yucatán, Mexico"),
 "angkor": ("Ангкор, Камбоджа", "Angkor, Cambodia"),
 "tajmahal": ("Агра, Индия", "Agra, India"),
 "silkroad": ("Самарканд, Узбекистан", "Samarkand, Uzbekistan"),
 "terracotta": ("Сиань, Китай", "Xi'an, China"),
 "rometfall": ("Рим, Италия", "Rome, Italy"),
 "charlemagne": ("Рим, Италия", "Rome, Italy"),
 "rus988": ("Киев, Украина", "Kyiv, Ukraine"),
 "magnacarta": ("Раннимид, Англия", "Runnymede, England"),
 "luther": ("Виттенберг, Германия", "Wittenberg, Germany"),
 "mayflower": ("Плимут, США", "Plymouth, USA"),
 "bostontea": ("Бостон, США", "Boston, USA"),
 "usdeclaration": ("Филадельфия, США", "Philadelphia, USA"),
 "bastille": ("Париж, Франция", "Paris, France"),
 "octrev": ("Санкт-Петербург, Россия", "St. Petersburg, Russia"),
 "sarajevo": ("Сараево, Босния и Герцеговина", "Sarajevo, Bosnia and Herzegovina"),
 "versailles": ("Версаль, Франция", "Versailles, France"),
 "yalta": ("Ялта, Крым", "Yalta, Crimea"),
 "japansurrender": ("Токийский залив, Япония", "Tokyo Bay, Japan"),
 "berlinwall": ("Берлин, Германия", "Berlin, Germany"),
 "ussrend": ("Беловежская пуща, Беларусь", "Belovezha Forest, Belarus"),
 "mlk": ("Вашингтон, США", "Washington, D.C., USA"),
 "cubacrisis": ("Гавана, Куба", "Havana, Cuba"),
 "911": ("Нью-Йорк, США", "New York, USA"),
 "gutenberg": ("Майнц, Германия", "Mainz, Germany"),
 "wright": ("Китти-Хок, США", "Kitty Hawk, USA"),
 "penicillin": ("Лондон, Англия", "London, England"),
 "trinity": ("Нью-Мексико, США", "New Mexico, USA"),
 "dna": ("Кембридж, Англия", "Cambridge, England"),
 "cern": ("Женева, Швейцария", "Geneva, Switzerland"),
 "telephone": ("Бостон, США", "Boston, USA"),
 "edison": ("Менло-Парк, США", "Menlo Park, USA"),
 "radioactivity": ("Париж, Франция", "Paris, France"),
 "goldrush": ("Калифорния, США", "California, USA"),
 "gagarin": ("Байконур, Казахстан", "Baikonur, Kazakhstan"),
 "apollo11": ("мыс Канаверал, США", "Cape Canaveral, USA"),
 "sputnik": ("Байконур, Казахстан", "Baikonur, Kazakhstan"),
}


def http(url):
    for a in range(3):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=40) as r:
                return json.loads(r.read().decode())
        except Exception:
            time.sleep(2 * (a + 1))
    return None


def fetch_ru(titles):
    out = {}
    for i in range(0, len(titles), 20):
        batch = titles[i:i + 20]
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "redirects": 1,
            "prop": "extracts|pageimages|langlinks", "lllang": "en", "lllimit": "max",
            "exintro": 1, "exsentences": 5, "explaintext": 1, "exlimit": "max",
            "piprop": "thumbnail", "pithumbsize": 900,
            "titles": "|".join(batch)})
        res = http(RU_API + "?" + q)
        norm = {}
        if res:
            qq = res.get("query", {})
            for n in qq.get("normalized", []) + qq.get("redirects", []):
                norm[n["from"]] = n["to"]
            for page in qq.get("pages", {}).values():
                t = page.get("title")
                en = None
                for ll in page.get("langlinks", []) or []:
                    if ll.get("lang") == "en":
                        en = ll.get("*")
                out[t] = {
                    "extract": (page.get("extract") or "").strip(),
                    "img": (page.get("thumbnail") or {}).get("source"),
                    "en_title": en}
        out["__norm__" + str(i)] = norm
        print("ru %d/%d" % (i // 20 + 1, (len(titles) + 19) // 20), flush=True)
        time.sleep(0.6)
    return out


def fetch_en(titles):
    out = {}
    titles = [t for t in titles if t]
    for i in range(0, len(titles), 20):
        batch = titles[i:i + 20]
        q = urllib.parse.urlencode({
            "action": "query", "format": "json", "redirects": 1,
            "prop": "extracts", "exintro": 1, "exsentences": 9,
            "explaintext": 1, "exlimit": "max", "titles": "|".join(batch)})
        res = http(EN_API + "?" + q)
        if res:
            for page in res.get("query", {}).get("pages", {}).values():
                if "missing" in page:
                    continue
                out[page.get("title")] = (page.get("extract") or "").strip()
        print("en %d/%d" % (i // 20 + 1, (len(titles) + 19) // 20), flush=True)
        time.sleep(0.6)
    return out


def trim(text, n=1200):
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) > n:
        cut = text[:n]
        dot = cut.rfind(". ")
        text = cut[:dot + 1] if dot > 600 else cut + "…"
    return text


def main():
    ru_titles = [e[2] for e in EVENTS]
    ru = fetch_ru(ru_titles)
    # карта нормализаций ru title
    norm = {}
    for k, v in list(ru.items()):
        if k.startswith("__norm__"):
            norm.update(v)
    def resolve(t):
        seen = set()
        while t in norm and t not in seen:
            seen.add(t); t = norm[t]
        return t
    en_titles = []
    for e in EVENTS:
        d = ru.get(resolve(e[2])) or {}
        if d.get("en_title"):
            en_titles.append(d["en_title"])
    en = fetch_en(en_titles)

    data = []
    miss = []
    for slug, name, wru, year, lat, lng, cat in EVENTS:
        d = ru.get(resolve(wru)) or {}
        info = trim(d.get("extract"))
        ent = d.get("en_title")
        infoEn = trim(en.get(ent)) if ent else ""
        img = d.get("img") or ""
        if not info:
            miss.append(name)
        pl = PLACE.get(slug, ("", ""))
        data.append({
            "img": slug, "name": name, "en": ent or name,
            "lat": lat, "lng": lng, "year": year, "cat": cat, "r": 130,
            "place": pl[0], "placeEn": pl[1],
            "info": info, "infoEn": infoEn, "photo": img})

    with open(os.path.join(BASE, "js/data/history.js"), "w", encoding="utf-8") as f:
        f.write("window.HISTORY=")
        json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    print("ГОТОВО history.js:", len(data), "событий; без текста:", len(miss), miss[:8], flush=True)


if __name__ == "__main__":
    main()

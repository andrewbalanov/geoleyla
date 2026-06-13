# -*- coding: utf-8 -*-
"""Ключевой (крупнейший по населению) город каждой страны, департамента Франции и штата США
из GeoNames cities15000. → js/data/citylabels.js (window.CITY_CO / CITY_FR / CITY_US).
RU-имя берём из alternatenames (первый кириллический токен), иначе латиницей."""
import os, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = "/tmp/cities15000.txt"

US_ABBR = {
 "AL": "Alabama", "AK": "Alaska", "AZ": "Arizona", "AR": "Arkansas", "CA": "California",
 "CO": "Colorado", "CT": "Connecticut", "DE": "Delaware", "FL": "Florida", "GA": "Georgia",
 "HI": "Hawaii", "ID": "Idaho", "IL": "Illinois", "IN": "Indiana", "IA": "Iowa",
 "KS": "Kansas", "KY": "Kentucky", "LA": "Louisiana", "ME": "Maine", "MD": "Maryland",
 "MA": "Massachusetts", "MI": "Michigan", "MN": "Minnesota", "MS": "Mississippi", "MO": "Missouri",
 "MT": "Montana", "NE": "Nebraska", "NV": "Nevada", "NH": "New Hampshire", "NJ": "New Jersey",
 "NM": "New Mexico", "NY": "New York", "NC": "North Carolina", "ND": "North Dakota", "OH": "Ohio",
 "OK": "Oklahoma", "OR": "Oregon", "PA": "Pennsylvania", "RI": "Rhode Island", "SC": "South Carolina",
 "SD": "South Dakota", "TN": "Tennessee", "TX": "Texas", "UT": "Utah", "VT": "Vermont",
 "VA": "Virginia", "WA": "Washington", "WV": "West Virginia", "WI": "Wisconsin", "WY": "Wyoming",
 "DC": "District of Columbia",
}

# RU-имена городов из geonames ненадёжны (alternatenames без языковых тегов — первым часто
# идёт осетинский/сербский/украинский). Поэтому подпись города даём латиницей (она читаема в обоих языках).
fr = {}   # insee -> [pop, name, lat, lng]
us = {}   # state-abbr -> ...

for line in open(SRC, encoding="utf-8"):
    f = line.rstrip("\n").split("\t")
    if len(f) < 15:
        continue
    name, alt = f[1], f[3]
    try:
        lat, lng = round(float(f[4]), 3), round(float(f[5]), 3)
        pop = int(f[14] or 0)
    except ValueError:
        continue
    cc, adm1, adm2 = f[8], f[10], f[11]
    rec = [pop, name, lat, lng]

    if cc == "FR" and adm2:
        if adm2 not in fr or pop > fr[adm2][0]:
            fr[adm2] = rec
    if cc == "US" and adm1 in US_ABBR:
        st = US_ABBR[adm1]
        if st not in us or pop > us[st][0]:
            us[st] = rec


def pack(d, keymap=None):
    out = {}
    for k, v in d.items():
        kk = keymap(k) if keymap else k
        out[kk] = {"city": v[1], "lat": v[2], "lng": v[3]}
    return out

import json
FR = pack(fr)
US = pack(us)
js = ("// Ключевые (крупнейшие) города департаментов Франции и штатов США. build_citylabels.py\n"
      "window.CITY_FR=" + json.dumps(FR, ensure_ascii=False) + ";\n"
      "window.CITY_US=" + json.dumps(US, ensure_ascii=False) + ";\n")
open(os.path.join(BASE, "js/data/citylabels.js"), "w", encoding="utf-8").write(js)
print("FR depts:", len(FR), "| US states:", len(US), "| KB:", round(len(js) / 1024))
print("sample US:", {k: US[k] for k in list(US)[:3]})
print("sample FR:", {k: FR[k] for k in list(FR)[:3]})

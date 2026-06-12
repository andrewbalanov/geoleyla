"use strict";
/* GEO-Академия Лейлы — логика игры: локальная дуэль, онлайн-дуэль, экраны */
(function () {

  // ---------- Константы ----------
  var PLAYER_COLORS = ["#ff5fa2", "#29c5e6"];
  // pos: [left%, top%] таблички в меню, rot — наклон, col — цвет
  var MODES = {
    capitals:  { icon: "🏛️", name: "Столицы мира",    desc: "Найди столицу на карте",            diff: true,  map: "world",  pos: [8, 12],  rot: -2, col: "y" },
    seas:      { icon: "⛰️", name: "Моря и горы",     desc: "Области морей и хребтов — на рельефной карте", diff: false, map: "terrain", pos: [36, 17], rot: -2, col: "y" },
    flagsmap:  { icon: "📍", name: "Флаги: на карте", desc: "Чей флаг? Найди страну",            diff: true,  map: "world",  pos: [76, 12], rot: 2,  col: "o", region: true },
    france:    { icon: "🥖", name: "Регионы Франции", desc: "Найди департамент на карте",        diff: false, map: "france", pos: [46, 25], rot: -4, col: "o" },
    usa:       { icon: "🤠", name: "Штаты США",       desc: "Найди штат на карте",               diff: false, map: "usa",    pos: [14, 38], rot: 3,  col: "o" },
    wineworld: { icon: "🍷", name: "Винные регионы мира", desc: "Легендарные терруары планеты + карточки сомелье", diff: false, map: "world" },
    winefrance:{ icon: "🍇", name: "Винные регионы Франции", desc: "От Шампани до Прованса + карточки сомелье", diff: false, map: "world", homeBounds: [[40.8, -5.8], [51.6, 10.2]] },
    countries: { icon: "🗺️", name: "Страны мира",     desc: "Найди страну на карте",             diff: true,  map: "world",  pos: [52, 56], rot: 2,  col: "o" },
    flagquiz:  { icon: "🚩", name: "Флаги",           desc: "Выбери правильный флаг из трёх",    diff: false, map: null,     pos: [10, 66], rot: -3, col: "y", region: true },
    places:    { icon: "🏞️", name: "Известные места", desc: "Озёра, водопады, острова — по фото", diff: false, map: "world", pos: [27, 79], rot: 2,  col: "r" },
    monuments: { icon: "🗽", name: "Памятники мира",  desc: "Знаменитые сооружения — по фото",   diff: false, map: "world",  pos: [68, 48], rot: 3,  col: "y" },
    mix:       { icon: "🎲", name: "Микс",            desc: "Всё вперемешку",                    diff: true,  map: "world",  pos: [82, 72], rot: -2, col: "r" }
  };
  var PHOTOS = window.PHOTOS || {};
  var SEAS_TYPES = { "море": 1, "залив": 1, "пролив": 1, "канал": 1, "озеро-море": 1, "гора": 1, "горы": 1, "вулкан": 1, "мыс": 1, "риф": 1, "фьорд": 1, "пустыня": 1 };
  // области (полигоны) для режима «Моря и горы» — заполняется в init из AREAS
  var TERRAIN_FEATURES = [];
  var TERRAIN_FIDX = {};

  // ---------- Утилиты ----------
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function fmtKm(d) { return Math.round(d).toLocaleString("ru-RU") + " км"; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function isLeyla(name) { return /лейл|leyla|leila/i.test(name || ""); }

  function store(key, val) {
    try {
      if (val === undefined) { var s = localStorage.getItem(key); return s ? JSON.parse(s) : null; }
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  // ---------- Состояние ----------
  var maps = {};            // name -> GeoMap
  var activeMapName = null; // 'world' | 'france' | 'usa' | null (викторина флагов)
  var fidToCountry = {};
  var iso2ToCountry = {};
  var settings = store("gm_settings") || { p1: "Лейла", p2: "Андрей", twoPlayers: true, nQ: 10, timer: 30, diff: "top", region: "all", cards: "on" };
  if (!settings.region) settings.region = "all";
  if (!settings.cards) settings.cards = "on";
  var G = null; // текущий матч

  // ---------- Сеть (онлайн-дуэль через PeerJS) ----------
  var NET = { active: false, isHost: false, peer: null, conn: null, remoteName: "", code: "" };
  var CODE_AB = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  function makeCode() {
    var s = "";
    for (var i = 0; i < 4; i++) s += CODE_AB[Math.floor(Math.random() * CODE_AB.length)];
    return s;
  }
  function myName() {
    var el = $("#inp-online-name");
    var v = (el && el.value || settings.p1 || "Игрок").trim().slice(0, 14);
    return v || "Игрок";
  }
  function netSend(obj) {
    if (NET.conn && NET.conn.open) { try { NET.conn.send(obj); } catch (e) {} }
  }
  function netCleanup() {
    var c = NET.conn, p = NET.peer;
    NET = { active: false, isHost: false, peer: null, conn: null, remoteName: "", code: "" };
    try { if (c) c.close(); } catch (e) {}
    try { if (p) p.destroy(); } catch (e) {}
    $("#online-banner").style.display = "none";
  }

  function hostRoom() {
    netCleanup();
    NET.isHost = true;
    NET.code = makeCode();
    $("#online-host-sec").style.display = "";
    $("#online-join-sec").style.display = "none";
    $("#online-code").textContent = "· · · ·";
    $("#online-host-status").textContent = "Создаём комнату…";
    var peer = NET.peer = new Peer("gmleyla-" + NET.code, { debug: 0 });
    peer.on("open", function () {
      $("#online-code").textContent = NET.code.split("").join(" ");
      var canLink = /^https?:$/.test(location.protocol);
      $("#btn-copy-invite").style.display = canLink ? "" : "none";
      $("#online-host-status").textContent = canLink
        ? "Отправь ссылку-приглашение или скажи код — и жди подключения…"
        : "Скажи соперникам этот код и жди подключения…";
    });
    peer.on("connection", function (c) {
      if (NET.conn) { try { c.close(); } catch (e) {} return; }
      NET.conn = c;
      bindConn(c);
    });
    peer.on("error", function (err) {
      var t = err && err.type;
      if (t === "unavailable-id") { hostRoom(); return; }
      $("#online-host-status").textContent = "Ошибка сети (" + (t || err) + "). Попробуй создать заново.";
    });
  }

  function joinRoom() {
    var code = ($("#inp-join-code").value || "").replace(/\s/g, "").toUpperCase();
    if (code.length !== 4) { $("#online-join-status").textContent = "Введи код из 4 символов"; return; }
    netCleanup();
    NET.isHost = false;
    $("#online-join-status").textContent = "Подключаемся…";
    var peer = NET.peer = new Peer({ debug: 0 });
    peer.on("open", function () {
      var c = peer.connect("gmleyla-" + code, { reliable: true });
      NET.conn = c;
      bindConn(c);
    });
    peer.on("error", function (err) {
      var t = err && err.type;
      if (t === "peer-unavailable") $("#online-join-status").textContent = "Комната не найдена. Проверь код!";
      else $("#online-join-status").textContent = "Ошибка сети (" + (t || err) + ")";
    });
  }

  function bindConn(c) {
    c.on("open", function () {
      NET.active = true;
      netSend({ t: "hello", name: myName() });
      if (!NET.isHost) $("#online-join-status").textContent = "Подключилась! Ждём, пока хост выберет режим… 🎓";
    });
    c.on("data", onNetMsg);
    c.on("close", function () { onNetDrop("Соединение потеряно 😢"); });
    c.on("error", function () { onNetDrop("Ошибка соединения 😢"); });
  }

  function onNetDrop(text) {
    if (!NET.active && !NET.peer) return;
    var inGame = G && G.online && !$("#screen-menu").classList.contains("active");
    netCleanup();
    stopTimer();
    if (inGame || !$("#screen-online").classList.contains("active")) {
      $("#net-drop-text").textContent = text || "Соединение потеряно";
      $("#overlay-net").classList.add("show");
    } else {
      $("#online-join-status").textContent = text || "Соединение потеряно";
      $("#online-host-status").textContent = text || "Соединение потеряно";
    }
  }

  function onNetMsg(msg) {
    if (!msg || !msg.t) return;
    if (msg.t === "hello") {
      NET.remoteName = String(msg.name || "Соперник").slice(0, 14);
      if (NET.isHost) {
        $("#online-host-status").textContent = "✔ " + NET.remoteName + " подключилась!";
      }
      renderMenu();
      showScreen("screen-menu");
    } else if (msg.t === "start") {
      // гость получает старт игры
      startOnlineMatch(msg.mode, msg.questions, msg.timer, msg.hostName, false);
    } else if (msg.t === "answer") {
      if (!G || !G.online) return;
      G.players[1 - G.myIdx].answers[msg.q] = msg.ans;
      updateOppStatus();
      if (msg.q === G.qIndex) tryReveal();
    } else if (msg.t === "next") {
      if (!G || !G.online || NET.isHost) return;
      nextQuestion();
    } else if (msg.t === "abort") {
      // хост или гость прервал матч — оба в меню, сессия живёт
      if (G && G.online) quitToMenu(true);
    } else if (msg.t === "bye") {
      onNetDrop("Соперник вышел из онлайн-сессии");
    }
  }

  // ---------- Карты ----------
  function getMap(name) {
    if (!maps[name]) {
      var div = document.createElement("div");
      div.className = "map-holder";
      div.id = "map-" + name;
      $("#map-stage").appendChild(div);
      if (name === "world") maps[name] = GeoMap.createWorld(div, window.WORLD_TOPO, onPick);
      else if (name === "france") maps[name] = GeoMap.createFrance(div, window.FRANCE_GEO, onPick);
      else if (name === "usa") maps[name] = GeoMap.createUSA(div, window.USA_TOPO, onPick);
      else if (name === "terrain") maps[name] = GeoMap.createTerrain(div, TERRAIN_FEATURES, onPick);
    }
    return maps[name];
  }
  function cur() { return activeMapName ? maps[activeMapName] : null; }
  function showStage(mapName) { // mapName или null → викторина флагов
    activeMapName = mapName;
    if (mapName) getMap(mapName);
    $$("#map-stage .map-holder").forEach(function (d) {
      d.style.display = (mapName && d.id === "map-" + mapName) ? "" : "none";
    });
    $("#choice-wrap").style.display = mapName ? "none" : "";
    $(".zoom-controls").style.display = mapName ? "" : "none";
    $("#map-hint").style.display = mapName ? "" : "none";
    if (mapName) maps[mapName].invalidate(); // контейнер уже видим — размер корректный
  }

  // ---------- Очки ----------
  function scorePoint(d, r) {
    if (d <= r) return 1000;
    return Math.max(0, Math.round(1000 * Math.exp(-(d - r) / 1300)));
  }
  function scoreCountry(d, decay) {
    if (d <= 0.5) return 1000;
    return Math.max(0, Math.round(700 * Math.exp(-d / (decay || 1100))));
  }

  // ---------- Генерация вопросов ----------
  function poolCountries(diffTop, needShape, region) {
    return window.COUNTRIES.filter(function (c) {
      if (needShape && c.fid == null) return false;
      if (diffTop && !c.top) return false;
      if (region && region !== "all" && c.region !== region) return false;
      return true;
    });
  }
  function qCapital(c) {
    return { kind: "point", mode: "capitals", title: c.capital, chip: "столица",
      sub: c.capitalEn, iso2: c.iso2,
      target: [c.clng, c.clat], r: 75,
      reveal: c.capital + " — столица: " + c.name,
      revealSub: c.capitalEn + " — capital of " + c.nameEn };
  }
  function qCountry(c) {
    return { kind: "country", mode: "countries", title: c.name, chip: "страна", decay: 1100,
      sub: c.nameEn, iso2: c.iso2,
      fid: c.fid, target: getMap("world").centroidOf(c.fid), reveal: c.name, revealSub: c.nameEn };
  }
  function qFlagMap(c) {
    return { kind: "country", mode: "flagsmap", title: "Чей это флаг?", chip: "флаг", decay: 1100,
      flag: c.iso2, iso2: c.iso2, fid: c.fid, target: getMap("world").centroidOf(c.fid),
      reveal: "Это флаг: " + c.name, revealSub: c.nameEn };
  }
  function qPlace(p, mode) {
    var q = { kind: "point", mode: mode || "places", title: p.name, chip: p.type,
      sub: p.en, revealSub: p.en, slug: p.img, infoText: p.info || null,
      img: PHOTOS[p.img] ? "assets/places/" + PHOTOS[p.img] : (p.photo || null),
      target: [p.lng, p.lat], r: p.r, reveal: p.name };
    if (mode === "seas") {
      q.mapName = "terrain";
      var fid = TERRAIN_FIDX[p.img];
      if (fid != null) {
        q.kind = "country";
        q.fid = fid;
        q.decay = 350;
        q.target = d3.geoCentroid(TERRAIN_FEATURES[fid]);
      }
    }
    return q;
  }
  function qMonument(m) {
    return { kind: "point", mode: "monuments", title: m.name, chip: m.type,
      sub: m.en, revealSub: m.en, slug: m.img, infoText: m.info || null,
      img: PHOTOS[m.img] ? "assets/places/" + PHOTOS[m.img] : (m.photo || null),
      target: [m.lng, m.lat], r: m.r, reveal: m.name };
  }
  function qWine(w, mode) {
    var wi = ((window.INFO || {}).wine || {})[w.img];
    var img = wi && wi.img ? (/^https?:/.test(wi.img) ? wi.img : "assets/info/" + wi.img) : null;
    return { kind: "point", mode: mode, title: w.name, chip: "винный регион",
      sub: w.en, revealSub: w.en, wine: w,
      img: img,
      target: [w.lng, w.lat], r: w.r, reveal: w.name };
  }
  function qRegions(mapName, chip, decay) {
    var m = getMap(mapName);
    return shuffle(m.features.map(function (f, i) { return i; })).map(function (i) {
      var pr = m.features[i].properties;
      return { kind: "country", mode: mapName, mapName: mapName, title: pr.name, chip: chip,
        sub: pr.orig, revealSub: pr.orig,
        fid: i, target: m.centroidOf(i), decay: decay,
        reveal: pr.name };
    });
  }
  function qFlagQuiz(region) {
    var pool = poolCountries(false, false, region);
    if (pool.length < 3) pool = window.COUNTRIES.slice();
    return shuffle(pool).map(function (c) {
      var others = shuffle(pool.filter(function (x) { return x !== c; })).slice(0, 2);
      var opts = shuffle([c].concat(others)).map(function (x) { return { iso2: x.iso2, name: x.name }; });
      return { kind: "choice", mode: "flagquiz", title: c.name, chip: "найди флаг",
        sub: c.nameEn,
        options: opts, correct: c.iso2, reveal: "Флаг: " + c.name, revealSub: c.nameEn };
    });
  }

  function buildQuestions(mode, n, diff, region) {
    var top = diff === "top";
    var qs = [];
    if (mode === "capitals") qs = shuffle(poolCountries(top, false)).map(qCapital);
    else if (mode === "countries") qs = shuffle(poolCountries(top, true)).map(qCountry);
    else if (mode === "flagsmap") qs = shuffle(poolCountries(top, true, region)).map(qFlagMap);
    else if (mode === "places") qs = shuffle(window.PLACES.filter(function (p) { return !SEAS_TYPES[p.type]; })).map(function (p) { return qPlace(p); });
    else if (mode === "seas") qs = shuffle(window.PLACES.filter(function (p) { return SEAS_TYPES[p.type]; })).map(function (p) { return qPlace(p, "seas"); });
    else if (mode === "monuments") qs = shuffle(window.MONUMENTS).map(qMonument);
    else if (mode === "france") qs = qRegions("france", "департамент", 110);
    else if (mode === "usa") qs = qRegions("usa", "штат", 450);
    else if (mode === "wineworld") qs = shuffle(window.WINE_WORLD || []).map(function (w) { return qWine(w, "wineworld"); });
    else if (mode === "winefrance") qs = shuffle(window.WINE_FRANCE || []).map(function (w) { return qWine(w, "winefrance"); });
    else if (mode === "flagquiz") qs = qFlagQuiz(region);
    else if (mode === "mix") {
      var lim = n === "all" ? 50 : n;
      var gens = [
        shuffle(poolCountries(top, false)).map(qCapital),
        shuffle(poolCountries(top, true)).map(qCountry),
        shuffle(poolCountries(top, true)).map(qFlagMap),
        shuffle(window.PLACES).map(function (p) { return qPlace(p); }),
        shuffle(window.MONUMENTS).map(qMonument),
        qFlagQuiz("all")
      ];
      var used = {};
      var guard = 0;
      while (qs.length < lim && guard++ < 800) {
        var pool2 = gens[Math.floor(Math.random() * gens.length)];
        var q = pool2.shift();
        if (!q) continue;
        var key = q.mode + ":" + q.title + ":" + (q.flag || q.correct || "");
        if (used[key]) continue;
        used[key] = 1;
        qs.push(q);
      }
      return qs;
    }
    return n === "all" ? qs : qs.slice(0, n);
  }

  // ---------- Экраны ----------
  function showScreen(id) {
    $$(".screen").forEach(function (s) { s.classList.toggle("active", s.id === id); });
  }

  // ---------- Меню ----------
  function renderMenuMap() {
    var host = $("#menu-map");
    if (host.dataset.done) return;
    host.dataset.done = "1";
    var W = 1000, H = 520;
    var svg = d3.select(host).attr("viewBox", "0 0 " + W + " " + H).attr("preserveAspectRatio", "xMidYMid slice");
    var proj = d3.geoNaturalEarth1().fitExtent([[-40, -10], [W + 40, H + 10]], { type: "Sphere" });
    var path = d3.geoPath(proj);
    svg.append("path")
      .datum(topojson.mesh(window.WORLD_TOPO, window.WORLD_TOPO.objects.countries, function (a, b) { return a === b; }))
      .attr("d", path).attr("class", "menu-coast");
    svg.append("path")
      .datum(topojson.mesh(window.WORLD_TOPO, window.WORLD_TOPO.objects.countries, function (a, b) { return a !== b; }))
      .attr("d", path).attr("class", "menu-borders");
    // Оксфорд ♥ — цель Лейлы
    var ox = proj([-1.2577, 51.752]);
    var go = svg.append("g").attr("class", "menu-oxford");
    go.append("circle").attr("cx", ox[0]).attr("cy", ox[1]).attr("r", 4.5);
    go.append("circle").attr("class", "pulse").attr("cx", ox[0]).attr("cy", ox[1]).attr("r", 4.5);
  }

  // ---------- Фото Лейлы (assets/leyla.jpg → localStorage → плейсхолдер) ----------
  function initLeylaPhoto() {
    var slot = $("#leyla-photo");
    if (!slot) return;
    function showSrc(src) {
      slot.innerHTML = '<img src="' + src + '" alt="Лейла">';
      slot.classList.add("has-photo");
    }
    // пробуем jpg → png → сохранённое в браузере фото
    function probeChain(srcs, i) {
      if (i >= srcs.length) {
        var saved = null;
        try { saved = localStorage.getItem("gm_leyla_photo"); } catch (e) {}
        if (saved) showSrc(saved);
        return;
      }
      var probe = new Image();
      probe.onload = function () { showSrc(srcs[i]); };
      probe.onerror = function () { probeChain(srcs, i + 1); };
      probe.src = srcs[i];
    }
    probeChain(["assets/leyla.jpg", "assets/leyla.png"], 0);
    // портрет почётного члена клуба статичен и неприкосновенен ♥
  }

  function renderMenu() {
    renderMenuMap();
    var list = $("#mode-list");
    list.innerHTML = "";
    Object.keys(MODES).forEach(function (key, idx) {
      var m = MODES[key];
      var btn = document.createElement("button");
      btn.className = "mode-card";
      btn.style.setProperty("--d", (idx * 0.04) + "s");
      btn.innerHTML = '<span class="mc-icon">' + m.icon + '</span>' +
        '<span class="mc-text"><b>' + m.name + '</b><small>' + m.desc + "</small></span>" +
        '<span class="mc-arrow">›</span>';
      btn.onclick = function () { openSetup(key); };
      list.appendChild(btn);
    });
    if (!NET.active) {
      var ob = document.createElement("button");
      ob.className = "mode-card mode-card-online";
      ob.style.setProperty("--d", (Object.keys(MODES).length * 0.04) + "s");
      ob.innerHTML = '<span class="mc-icon">🌐</span>' +
        '<span class="mc-text"><b>Онлайн-дуэль</b><small>С разных устройств — по коду комнаты</small></span>' +
        '<span class="mc-arrow">›</span>';
      ob.onclick = openOnline;
      list.appendChild(ob);
    }
    // гость онлайн-сессии не выбирает режим — ждёт хоста
    if (NET.active && !NET.isHost) list.classList.add("guest-wait");
    else list.classList.remove("guest-wait");
    updateOnlineBanner();
    renderH2H();
    updateMuteBtns();
    if (window.Account) Account.renderBox();
  }

  function updateOnlineBanner() {
    var b = $("#online-banner");
    if (!NET.active) { b.style.display = "none"; return; }
    var who = esc(NET.remoteName || "…");
    b.innerHTML = (NET.isHost
      ? "🌐 Онлайн-сессия с <b>" + who + "</b> — выбери режим!"
      : "🌐 Онлайн-сессия с <b>" + who + "</b>. Хост выбирает режим…") +
      '<button id="btn-leave-net">Выйти из онлайн-сессии</button>';
    b.style.display = "block";
    $("#btn-leave-net").onclick = leaveOnlineSession;
  }

  function openOnline() {
    $("#inp-online-name").value = settings.p1 || "Лейла";
    $("#online-host-sec").style.display = "none";
    $("#online-join-sec").style.display = "none";
    $("#online-host-status").textContent = "";
    $("#online-join-status").textContent = "";
    $("#inp-join-code").value = "";
    showScreen("screen-online");
  }

  function h2hKey(a, b) { return [a, b].sort().join("⚔"); }
  function renderH2H() {
    var el = $("#h2h");
    var h = store("gm_h2h") || {};
    var rec = h[h2hKey(settings.p1, settings.p2)];
    if (rec) {
      el.innerHTML = '<span class="h2h-name" style="color:' + PLAYER_COLORS[0] + '">' + esc(settings.p1) + "</span>" +
        '<span class="h2h-score">' + (rec[settings.p1] || 0) + " : " + (rec[settings.p2] || 0) + "</span>" +
        '<span class="h2h-name" style="color:' + PLAYER_COLORS[1] + '">' + esc(settings.p2) + "</span>" +
        (rec.draws ? '<span class="h2h-draws">ничьих: ' + rec.draws + "</span>" : "");
      el.style.display = "flex";
    } else el.style.display = "none";
  }

  function renderTrophy() {
    var h = store("gm_h2h") || {};
    var keys = Object.keys(h);
    var html = keys.length ? keys.map(function (k) {
      var names = k.split("⚔");
      var rec = h[k];
      return '<div class="trophy-row"><b>' + esc(names[0]) + "</b> " + (rec[names[0]] || 0) +
        " : " + (rec[names[1]] || 0) + " <b>" + esc(names[1]) + "</b>" +
        (rec.draws ? ' <small>(ничьих: ' + rec.draws + ")</small>" : "") + "</div>";
    }).join("") : '<div class="trophy-row">Пока нет сыгранных дуэлей</div>';
    $("#trophy-list").innerHTML = html;
    $("#overlay-trophy").classList.add("show");
  }

  // ---------- Настройка матча ----------
  var pendingMode = null;
  function openSetup(mode) {
    if (NET.active && !NET.isHost) return; // гость ждёт хоста
    pendingMode = mode;
    var m = MODES[mode];
    $("#setup-title").innerHTML = m.icon + " " + m.name;
    $("#inp-p1").value = settings.p1;
    $("#inp-p2").value = settings.p2;
    setSeg("#seg-players", settings.twoPlayers ? "2" : "1");
    setSeg("#seg-nq", String(settings.nQ));
    setSeg("#seg-timer", String(settings.timer));
    setSeg("#seg-diff", settings.diff);
    setSeg("#seg-region", settings.region);
    setSeg("#seg-cards", settings.cards);
    $("#row-diff").style.display = m.diff ? "" : "none";
    $("#row-region").style.display = m.region ? "" : "none";
    var online = NET.active && NET.isHost;
    $("#row-players").style.display = online ? "none" : "";
    $("#row-p1").style.display = online ? "none" : "";
    $("#row-p2").style.display = online ? "none" : (settings.twoPlayers ? "" : "none");
    $("#setup-online-note").style.display = online ? "" : "none";
    if (online) $("#setup-online-note").innerHTML = "🌐 Онлайн-дуэль: <b style='color:" + PLAYER_COLORS[0] + "'>" + esc(myName()) + "</b> против <b style='color:" + PLAYER_COLORS[1] + "'>" + esc(NET.remoteName) + "</b>";
    showScreen("screen-setup");
  }

  function setSeg(sel, val) {
    $$(sel + " button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-val") === val);
    });
    if (!$(sel + " button.on")) {
      var first = $(sel + " button");
      if (first) first.classList.add("on");
    }
  }
  function getSeg(sel) {
    var b = $(sel + " button.on");
    return b ? b.getAttribute("data-val") : null;
  }

  function bindSegs() {
    $$(".seg").forEach(function (seg) {
      seg.addEventListener("click", function (e) {
        var b = e.target.closest("button");
        if (!b) return;
        $$(".seg#" + seg.id + " button").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        if (seg.id === "seg-players") {
          $("#row-p2").style.display = b.getAttribute("data-val") === "2" ? "" : "none";
        }
      });
    });
  }

  function readSettings() {
    settings.p1 = ($("#inp-p1").value || "Лейла").trim().slice(0, 14) || "Лейла";
    settings.p2 = ($("#inp-p2").value || "Андрей").trim().slice(0, 14) || "Андрей";
    settings.twoPlayers = getSeg("#seg-players") === "2";
    var nq = getSeg("#seg-nq") || "10";
    settings.nQ = nq === "all" ? "all" : (parseInt(nq, 10) || 10);
    settings.timer = parseInt(getSeg("#seg-timer"), 10) || 0;
    settings.diff = getSeg("#seg-diff") || "top";
    settings.region = getSeg("#seg-region") || "all";
    settings.cards = getSeg("#seg-cards") || "on";
    store("gm_settings", settings);
  }

  function startMatch() {
    readSettings();
    var questions = buildQuestions(pendingMode, settings.nQ, settings.diff, settings.region);
    if (!questions.length) { alert("Нет вопросов для этого режима"); return; }

    if (NET.active && NET.isHost) {
      netSend({ t: "start", mode: pendingMode, questions: questions, timer: settings.timer, hostName: myName() });
      startOnlineMatch(pendingMode, questions, settings.timer, myName(), true);
      return;
    }

    var players = [{ name: settings.p1, color: PLAYER_COLORS[0], score: 0, answers: [] }];
    if (settings.twoPlayers) players.push({ name: settings.p2, color: PLAYER_COLORS[1], score: 0, answers: [] });
    G = {
      mode: pendingMode, online: false, myIdx: 0,
      players: players, questions: questions,
      timerSec: settings.timer,
      qIndex: 0, order: [], turn: 0, phase: "idle", guess: null
    };
    restartMatch();
  }

  function startOnlineMatch(mode, questions, timer, hostName, iAmHost) {
    pendingMode = mode;
    var me = myName();
    G = {
      mode: mode, online: true, myIdx: iAmHost ? 0 : 1,
      players: [
        { name: iAmHost ? me : String(hostName || "Хост").slice(0, 14), color: PLAYER_COLORS[0], score: 0, answers: [] },
        { name: iAmHost ? NET.remoteName : me, color: PLAYER_COLORS[1], score: 0, answers: [] }
      ],
      questions: questions, timerSec: timer || 0,
      qIndex: 0, order: [0, 1], turn: 0, phase: "idle", guess: null
    };
    restartMatch();
  }

  function restartMatch() {
    G.qIndex = 0;
    G.players.forEach(function (p) { p.score = 0; p.answers = []; });
    for (var nm in maps) maps[nm].clearFound();
    renderScoreChips();
    showScreen("screen-game");
    startQuestion();
  }

  // ---------- Ход игры ----------
  function curQ() { return G.questions[G.qIndex]; }
  function curPlayer() { return G.online ? G.players[G.myIdx] : G.players[G.order[G.turn]]; }
  function stageFor(q) { return q.kind === "choice" ? null : (q.mapName || MODES[G.mode].map || "world"); }

  function startQuestion() {
    var q = curQ();
    G.turn = 0;
    G.phase = "handoff";
    $("#q-progress").textContent = (G.qIndex + 1) + " / " + G.questions.length;
    $("#turnbar").style.display = "none";
    $("#timer-wrap").style.display = "none";
    showStage(stageFor(q));
    if (cur()) {
      cur().setHome(MODES[G.mode].homeBounds || null);
      cur().reset(false);
    }
    renderChoice(q, true);
    hideRevealPanel();
    $("#overlay-infocard").classList.remove("show");
    if (G.online) {
      beginTurn();
    } else {
      G.order = G.players.length === 2 && G.qIndex % 2 === 1 ? [1, 0] : G.players.map(function (_, i) { return i; });
      renderQuestionCard(true);
      if (G.players.length === 2) showHandoff(curPlayer(), true);
      else beginTurn();
    }
  }

  function showHandoff(player, isFirst) {
    G.phase = "handoff";
    if (cur()) cur().setClickEnabled(false);
    stopTimer();
    var ov = $("#overlay-handoff");
    ov.style.setProperty("--pc", player.color);
    $("#handoff-sub").textContent = isFirst ? "Первым отвечает" : "Передай устройство — не подглядывай! 🙈";
    $("#handoff-name").textContent = player.name;
    $("#handoff-name").style.color = player.color;
    ov.classList.add("show");
    Sound.handoff();
  }

  function beginTurn() {
    $("#overlay-handoff").classList.remove("show");
    var q = curQ();
    G.phase = "answer";
    G.guess = null;
    if (cur()) {
      if (!G.online || true) cur().reset(false);
      cur().setClickEnabled(true);
      var hint = $("#map-hint");
      hint.textContent = "👆 Коснись карты, чтобы поставить метку";
      hint.style.display = "";
      hint.classList.add("show");
    } else {
      renderChoice(q, false);
    }
    renderQuestionCard(false);
    renderTurnBar();
    $("#btn-confirm").classList.remove("show");
    startTimer();
  }

  function renderQuestionCard(masked) {
    var q = curQ();
    var card = $("#q-card");
    if (masked && G.players.length === 2 && !G.online) {
      card.innerHTML = '<div class="q-title q-masked">? ? ?</div>';
      return;
    }
    var html = "";
    if (q.flag) html += '<img class="q-flag" src="assets/flags/' + q.flag + '.png" alt="флаг">';
    if (q.img) html += '<img class="q-img" src="' + q.img + '" alt="">';
    // язык названий: en — английское крупно, русское мелко
    var tMain = q.title, tSub = q.sub;
    if (gameLang === "en" && q.sub && q.sub !== q.title) { tMain = q.sub; tSub = q.title; }
    html += '<div class="q-line"><div class="q-titles"><div class="q-title">' + esc(tMain) + "</div>";
    if (tSub && tSub !== tMain) html += '<div class="q-sub">' + esc(tSub) + "</div>";
    html += "</div>";
    if (q.chip) html += '<span class="chip">' + esc(q.chip) + "</span>";
    html += "</div>";
    card.innerHTML = html;
  }

  // ---------- Викторина флагов (3 флага на палочках) ----------
  function renderChoice(q, masked) {
    if (q.kind !== "choice") return;
    var host = $("#choice-flags");
    if (masked) { host.innerHTML = ""; return; }
    host.innerHTML = q.options.map(function (o, i) {
      return '<button class="flag-stick" data-iso2="' + o.iso2 + '" style="--i:' + i + '">' +
        '<span class="flag-card"><img src="assets/flags/' + o.iso2 + '.png" alt=""><span class="flag-pegs"></span></span>' +
        '<span class="stick"></span></button>';
    }).join("");
    $$("#choice-flags .flag-stick").forEach(function (b) {
      b.onclick = function () {
        if (G.phase !== "answer") return;
        $$("#choice-flags .flag-stick").forEach(function (x) { x.classList.remove("sel"); });
        b.classList.add("sel");
        G.guess = b.getAttribute("data-iso2");
        $("#btn-confirm").classList.add("show");
        Sound.place();
      };
    });
  }

  function updateOppStatus() {
    var el = $("#opp-status");
    if (!el || !G || !G.online) return;
    var opp = G.players[1 - G.myIdx];
    var answered = !!opp.answers[G.qIndex];
    el.textContent = "· " + opp.name + (answered ? " ответил(а) ✔" : " думает…");
  }

  function renderTurnBar() {
    var tb = $("#turnbar");
    if (G.online) {
      var me = G.players[G.myIdx];
      tb.innerHTML = '<span class="dot" style="background:' + me.color + '"></span>' +
        "<span>Отвечай, <b style=\"color:" + me.color + '">' + esc(me.name) + "</b></span>" +
        '<span id="opp-status"></span>' +
        '<span id="timer-num"></span>';
      tb.style.display = "flex";
      updateOppStatus();
    } else {
      var p = curPlayer();
      tb.innerHTML = '<span class="dot" style="background:' + p.color + '"></span>' +
        "<span>Отвечает: <b style=\"color:" + p.color + '">' + esc(p.name) + "</b></span>" +
        '<span id="timer-num"></span>';
      tb.style.display = "flex";
    }
    $("#timer-wrap").style.display = G.timerSec ? "" : "none";
  }

  function renderScoreChips() {
    var el = $("#score-chips");
    el.innerHTML = G.players.map(function (p, i) {
      return '<span class="score-chip" id="score-chip-' + i + '" style="--pc:' + p.color + '">' +
        '<i></i>' + esc(p.name) + ' <b id="score-val-' + i + '">' + p.score + "</b></span>";
    }).join("");
  }

  // ---------- Таймер ----------
  var timerRAF = null, timerEnd = 0, timerTotal = 0, lastTick = -1;
  function startTimer() {
    stopTimer();
    if (!G.timerSec) { $("#timer-bar").style.width = "100%"; return; }
    timerTotal = G.timerSec * 1000;
    timerEnd = performance.now() + timerTotal;
    lastTick = -1;
    function frame(now) {
      var left = Math.max(0, timerEnd - now);
      $("#timer-bar").style.width = (left / timerTotal * 100) + "%";
      var sec = Math.ceil(left / 1000);
      var tn = $("#timer-num");
      if (tn) tn.textContent = "⏱ " + sec;
      $("#timer-bar").classList.toggle("low", left < timerTotal * 0.25);
      if (sec <= 3 && sec !== lastTick && left > 0) { Sound.tick(); lastTick = sec; }
      if (left <= 0) { onTimeout(); return; }
      timerRAF = requestAnimationFrame(frame);
    }
    timerRAF = requestAnimationFrame(frame);
  }
  function stopTimer() { if (timerRAF) { cancelAnimationFrame(timerRAF); timerRAF = null; } }
  function onTimeout() {
    timerRAF = null;
    if (!G || G.phase !== "answer") return;
    confirmAnswer(true);
  }

  // ---------- Ответ ----------
  function onPick(ll) {
    if (!G || G.phase !== "answer" || !cur()) return;
    G.guess = ll;
    var p = curPlayer();
    cur().addPin("guess", ll, p.color);
    // для вопросов-областей подсвечиваем регион под кликом до подтверждения
    if (curQ().kind === "country") {
      cur().markSel(cur().countryAt(ll));
    }
    $("#btn-confirm").classList.add("show");
    $("#map-hint").classList.remove("show");
    Sound.place();
  }

  function confirmAnswer(byTimeout) {
    if (G.phase !== "answer") return;
    stopTimer();
    var q = curQ();
    var p = curPlayer();
    if (cur()) {
      cur().setClickEnabled(false);
      cur().removeMarker("guess");
      cur().markSel(null);
    }
    $("#btn-confirm").classList.remove("show");
    $("#map-hint").classList.remove("show");
    $$("#choice-flags .flag-stick").forEach(function (x) { x.classList.remove("sel"); });

    var ans = { guess: G.guess, d: null, pts: 0, hitName: null };
    if (G.guess != null) {
      if (q.kind === "choice") {
        ans.pts = G.guess === q.correct ? 1000 : 0;
      } else if (q.kind === "point") {
        ans.d = geoHaversine(G.guess, q.target);
        ans.pts = scorePoint(ans.d, q.r);
      } else {
        ans.d = cur().distanceToCountry(G.guess, q.fid);
        ans.pts = scoreCountry(ans.d, q.decay);
        var hitFid = cur().countryAt(G.guess);
        if (hitFid != null && hitFid !== q.fid) {
          ans.hitFid = hitFid;
          if (stageFor(q) === "world") {
            var hc = fidToCountry[hitFid];
            ans.hitName = hc ? hc.name : cur().featureName(hitFid);
          } else {
            ans.hitName = cur().featureName(hitFid);
          }
        }
      }
    }
    p.answers[G.qIndex] = ans;
    if (!byTimeout) Sound.confirm();

    if (G.online) {
      netSend({ t: "answer", q: G.qIndex, ans: ans });
      G.phase = "wait";
      var opp = G.players[1 - G.myIdx];
      var hint = $("#map-hint");
      hint.textContent = "Ответ принят! Ждём: " + opp.name + "… ⏳";
      hint.style.display = "";
      hint.classList.add("show");
      tryReveal();
      return;
    }

    G.turn++;
    if (G.turn < G.order.length) {
      showHandoff(curPlayer(), false);
    } else {
      doReveal();
    }
  }

  function tryReveal() {
    if (!G || !G.online || G.phase === "reveal") return;
    var a0 = G.players[0].answers[G.qIndex];
    var a1 = G.players[1].answers[G.qIndex];
    if (a0 && a1) doReveal();
  }

  // ---------- Раскрытие ----------
  function doReveal() {
    G.phase = "reveal";
    stopTimer();
    $("#turnbar").style.display = "none";
    $("#timer-wrap").style.display = "none";
    $("#map-hint").classList.remove("show");
    renderQuestionCard(false);

    var q = curQ();
    var rows = q.kind === "choice" ? revealChoice(q) : revealMap(q);

    $("#reveal-title").innerHTML = esc(q.reveal) +
      (q.revealSub ? '<div class="reveal-sub">' + esc(q.revealSub) + "</div>" : "");
    $("#reveal-rows").innerHTML = rows;
    var last = G.qIndex + 1 >= G.questions.length;
    var nb = $("#btn-next");
    if (G.online && !NET.isHost) {
      nb.disabled = true;
      nb.textContent = last ? "Итоги — ждём хоста…" : "Дальше — ждём хоста…";
    } else {
      nb.disabled = false;
      nb.textContent = last ? "Итоги 🏆" : "Дальше ›";
    }
    var panel = $("#reveal-panel");
    panel.classList.add("show");

    if (q.kind !== "choice") {
      var m = cur();
      var pts = [q.target];
      if (q.kind === "country" && m.features[q.fid]) {
        // вписать всю область/страну, а не только центр
        var bb = d3.geoBounds(m.features[q.fid]);
        if (bb[0][0] <= bb[1][0]) pts.push(bb[0], bb[1]); // кроме секущих антимеридиан
      }
      G.players.forEach(function (p) {
        var a = p.answers[G.qIndex];
        if (a && a.guess) pts.push(a.guess);
      });
      var maxZoom = q.kind === "country" ? (stageFor(q) === "world" ? 6.5 : 9) : (q.r <= 100 ? 10 : q.r <= 300 ? 7.5 : 5.5);
      m.fitTo(pts, maxZoom, 900, panel.offsetHeight);
    }

    G.players.forEach(function (p, i) {
      countUp("#score-val-" + i, p.score - (p.answers[G.qIndex] ? p.answers[G.qIndex].pts : 0), p.score);
    });

    // инфо-карточка об объекте
    var hasCard = !!getCardData(q);
    $("#btn-card").style.display = hasCard ? "" : "none";
    if (hasCard && settings.cards !== "off") {
      var qi = G.qIndex;
      setTimeout(function () {
        if (G && G.phase === "reveal" && G.qIndex === qi) showCard(q);
      }, 1100);
    }

    var best = Math.max.apply(null, G.players.map(function (p) { return p.answers[G.qIndex] ? p.answers[G.qIndex].pts : 0; }));
    if (best >= 850) Sound.good(); else if (best >= 350) Sound.meh(); else Sound.bad();
  }

  function revealMap(q) {
    var m = cur();
    if (q.kind === "country") {
      m.highlightCountry(q.fid);
      m.markFound(q.fid);
    }
    m.addTarget("answer", q.target);
    G.players.forEach(function (p, i) {
      var a = p.answers[G.qIndex];
      if (a && a.guess) {
        if (a.hitFid != null && a.hitFid !== q.fid) m.markWrong(a.hitFid); // промах — красным
        m.addPin("p" + i, a.guess, p.color);
        m.drawArc("p" + i, a.guess, q.target, p.color);
      }
    });
    return G.players.map(function (p) {
      var a = p.answers[G.qIndex] || { pts: 0 };
      var info;
      if (!a.guess) info = "не успел(а) ответить";
      else if (q.kind === "point") info = a.d <= q.r ? "🎯 " + fmtKm(a.d) : fmtKm(a.d);
      else if (a.d <= 0.5) info = "🎯 точно в цель!";
      else info = "мимо на " + fmtKm(a.d) + (a.hitName ? " (попал(а) в: " + esc(a.hitName) + ")" : "");
      p.score += a.pts;
      return revRow(p, info, a.pts);
    }).join("");
  }

  function revealChoice(q) {
    renderChoice(q, false); // отрисовать заново (у онлайн-гостя могло не быть)
    $$("#choice-flags .flag-stick").forEach(function (b) {
      b.onclick = null;
      var iso = b.getAttribute("data-iso2");
      b.classList.toggle("correct", iso === q.correct);
      var dots = G.players.map(function (p) {
        var a = p.answers[G.qIndex];
        return a && a.guess === iso ? '<i class="pick-dot" style="background:' + p.color + '"></i>' : "";
      }).join("");
      var wrongPick = dots && iso !== q.correct;
      b.classList.toggle("wrong", !!wrongPick);
      var old = b.querySelector(".picks");
      if (old) old.remove();
      if (dots) {
        var span = document.createElement("span");
        span.className = "picks";
        span.innerHTML = dots;
        b.querySelector(".flag-card").appendChild(span);
      }
    });
    return G.players.map(function (p) {
      var a = p.answers[G.qIndex] || { pts: 0 };
      var info;
      if (!a.guess) info = "не успел(а) ответить";
      else if (a.pts >= 1000) info = "✔ верно!";
      else {
        var c = iso2ToCountry[a.guess];
        info = "✘ это флаг: " + (c ? esc(c.name) : "другой страны");
      }
      p.score += a.pts;
      return revRow(p, info, a.pts);
    }).join("");
  }

  // ---------- Инфо-карточки об объекте ----------
  function infoImg(img) {
    if (!img) return null;
    return /^https?:/.test(img) ? img : "assets/info/" + img;
  }
  function getCardData(q) {
    var I = window.INFO || {};
    if (q.wine) {
      var wi = (I.wine || {})[q.wine.img];
      return { img: wi ? infoImg(wi.img) : null, title: q.wine.name, sub: q.wine.en,
        text: q.wine.desc, wines: q.wine.wines };
    }
    if (q.iso2 && (I.countries || {})[q.iso2]) {
      var c = I.countries[q.iso2];
      var co = iso2ToCountry[q.iso2];
      if (!co) return null;
      return { img: infoImg(c.img), title: co.name, sub: co.nameEn,
        cap: "Столица: " + co.capital + " · " + co.capitalEn, text: c.t };
    }
    if (q.mode === "usa" || q.mode === "france") {
      var m = maps[stageFor(q)];
      if (!m) return null;
      var pr = m.features[q.fid].properties;
      var d = q.mode === "usa" ? (I.usa || {})[pr.name] : (I.france || {})[pr.code];
      if (!d) return null;
      return { img: infoImg(d.img), title: pr.name, sub: pr.orig, text: d.t };
    }
    if (q.slug) {
      var bucket = q.mode === "monuments" ? I.monuments : I.places;
      var t = (bucket || {})[q.slug] || q.infoText;
      if (!t && !q.img) return null;
      return { img: q.img, title: q.title, sub: q.sub, text: t || "" };
    }
    return null;
  }

  function showCard(q) {
    var d = getCardData(q);
    if (!d) return false;
    var img = $("#card-img");
    img.style.display = d.img ? "" : "none";
    if (d.img) img.src = d.img;
    $("#card-title").textContent = d.title || "";
    $("#card-sub").textContent = d.sub || "";
    var cap = $("#card-cap");
    cap.textContent = d.cap || "";
    cap.style.display = d.cap ? "" : "none";
    $("#card-text").textContent = d.text || "";
    var wl = $("#card-wines");
    if (d.wines) {
      wl.style.display = "";
      wl.innerHTML = '<div class="card-wines-h">🍷 Пять знаменитых вин региона</div>' +
        d.wines.map(function (w) {
          return '<div class="wine-row"><b>' + esc(w.n) + "</b><span>" + esc(w.d) + "</span></div>";
        }).join("");
    } else {
      wl.style.display = "none";
      wl.innerHTML = "";
    }
    $("#overlay-infocard").classList.add("show");
    return true;
  }

  function revRow(p, info, pts) {
    return '<div class="rev-row"><span class="dot" style="background:' + p.color + '"></span>' +
      '<span class="rev-name">' + esc(p.name) + "</span>" +
      '<span class="rev-info">' + info + "</span>" +
      '<span class="rev-pts ' + (pts >= 850 ? "great" : pts >= 400 ? "ok" : "low") + '">+' + pts + "</span></div>";
  }

  function countUp(sel, from, to) {
    var el = $(sel);
    if (!el) return;
    var t0 = performance.now(), dur = 700;
    function f(now) {
      var k = Math.min(1, (now - t0) / dur);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) requestAnimationFrame(f);
    }
    requestAnimationFrame(f);
  }

  function hideRevealPanel() { $("#reveal-panel").classList.remove("show"); }

  function nextQuestion() {
    hideRevealPanel();
    $("#overlay-infocard").classList.remove("show");
    G.qIndex++;
    if (G.qIndex >= G.questions.length) showResults();
    else startQuestion();
  }

  // ---------- Итоги ----------
  function showResults() {
    var ps = G.players;
    var headline, sub = "";
    if (ps.length === 2) {
      var w = ps[0].score === ps[1].score ? null : (ps[0].score > ps[1].score ? ps[0] : ps[1]);
      saveH2H(w);
      if (w) {
        if (isLeyla(w.name)) headline = "🎓 Оксфорд всё ближе, <b style=\"color:" + w.color + '">' + esc(w.name) + "</b>!";
        else headline = "🏆 Победа: <b style=\"color:" + w.color + '">' + esc(w.name) + "</b>!";
        sub = ps[0].score.toLocaleString("ru-RU") + " : " + ps[1].score.toLocaleString("ru-RU");
        Sound.win();
        confetti(w.color);
      } else {
        headline = "🤝 Ничья!";
        sub = ps[0].score.toLocaleString("ru-RU") + " : " + ps[1].score.toLocaleString("ru-RU");
        Sound.meh();
      }
    } else {
      headline = isLeyla(ps[0].name) ? "🎓 Так держать, будущая студентка Оксфорда!" : "Твой результат";
      sub = ps[0].score.toLocaleString("ru-RU") + " из " + (G.questions.length * 1000).toLocaleString("ru-RU");
      Sound.win();
      confetti(ps[0].color);
    }
    creditScore();
    $("#result-headline").innerHTML = headline;
    $("#result-score").textContent = sub;
    $("#result-mode").textContent = MODES[G.mode].icon + " " + MODES[G.mode].name + (G.online ? " · онлайн" : "");

    var rows = G.questions.map(function (q, qi) {
      var bestPts = Math.max.apply(null, ps.map(function (x) { return x.answers[qi] ? x.answers[qi].pts : 0; }));
      var cells = ps.map(function (p) {
        var a = p.answers[qi];
        var v = a ? a.pts : 0;
        return '<td class="' + (ps.length === 2 && v === bestPts && v > 0 ? "best" : "") + '">' + v + "</td>";
      }).join("");
      var label = q.flag ? '<img class="result-flag" src="assets/flags/' + q.flag + '.png"> ' + esc(q.reveal.replace("Это флаг: ", "")) : esc(q.title);
      return "<tr><td>" + (qi + 1) + "</td><td class=\"q\">" + label + "</td>" + cells + "</tr>";
    }).join("");
    var head = "<tr><th>#</th><th>Вопрос</th>" + ps.map(function (p) {
      return '<th style="color:' + p.color + '">' + esc(p.name) + "</th>";
    }).join("") + "</tr>";
    $("#result-table").innerHTML = head + rows;

    var rb = $("#btn-rematch");
    if (G.online && !NET.isHost) { rb.disabled = true; rb.textContent = "⚔ Реванш запускает хост"; }
    else { rb.disabled = false; rb.textContent = "⚔ Реванш"; }

    renderH2H2($("#result-h2h"));
    showScreen("screen-results");
  }

  function saveH2H(winner) {
    if (G.players.length !== 2) return;
    var h = store("gm_h2h") || {};
    var key = h2hKey(G.players[0].name, G.players[1].name);
    var rec = h[key] || {};
    if (winner) rec[winner.name] = (rec[winner.name] || 0) + 1;
    else rec.draws = (rec.draws || 0) + 1;
    G.players.forEach(function (p) { if (!(p.name in rec)) rec[p.name] = rec[p.name] || 0; });
    h[key] = rec;
    store("gm_h2h", h);
  }

  function renderH2H2(el) {
    if (!G || G.players.length !== 2) { el.textContent = ""; return; }
    var h = store("gm_h2h") || {};
    var rec = h[h2hKey(G.players[0].name, G.players[1].name)];
    if (!rec) { el.textContent = ""; return; }
    el.textContent = "Общий счёт: " + G.players[0].name + " " + (rec[G.players[0].name] || 0) +
      " : " + (rec[G.players[1].name] || 0) + " " + G.players[1].name +
      (rec.draws ? " (ничьих: " + rec.draws + ")" : "");
  }

  function rematch() {
    if (G.online && !NET.isHost) return;
    G.questions = buildQuestions(G.mode, settings.nQ, settings.diff, settings.region);
    if (G.online) {
      // реванш = новый старт (гость может быть уже в меню сессии)
      netSend({ t: "start", mode: G.mode, questions: G.questions, timer: G.timerSec, hostName: myName() });
    }
    restartMatch();
  }

  // выход в меню: онлайн-сессия ЖИВЁТ, рвём только текущий матч
  function quitToMenu(silent) {
    stopTimer();
    if (!silent && G && G.online && NET.active) netSend({ t: "abort" });
    G = null;
    renderMenu();
    showScreen("screen-menu");
  }

  // полный выход из онлайн-сессии (кнопка в баннере меню)
  function leaveOnlineSession() {
    if (NET.active) netSend({ t: "bye" });
    netCleanup();
    G = null;
    renderMenu();
    showScreen("screen-menu");
  }

  // ---------- Конфетти ----------
  function confetti(color) {
    var cv = $("#confetti");
    cv.width = innerWidth; cv.height = innerHeight;
    cv.style.display = "block";
    var ctx = cv.getContext("2d");
    var colors = [color, "#ffd54a", "#ffffff", "#8fce5a", "#29c5e6"];
    var parts = [];
    for (var i = 0; i < 160; i++) {
      parts.push({
        x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
        vx: (Math.random() - 0.5) * 2.4, vy: 2 + Math.random() * 3.6,
        s: 5 + Math.random() * 7, r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.25, c: colors[i % colors.length]
      });
    }
    var t0 = performance.now();
    function frame(now) {
      ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(function (p) {
        p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (now - t0 < 3500) requestAnimationFrame(frame);
      else { ctx.clearRect(0, 0, cv.width, cv.height); cv.style.display = "none"; }
    }
    requestAnimationFrame(frame);
  }

  // ---------- Аккаунт, профиль, рейтинг ----------
  var gameLang = "ru"; // 'en' меняет местами основное/второе название

  function renderAccountBox() {
    var box = $("#account-box");
    if (!box) return;
    if (!window.Account || !Account.isIn()) {
      box.innerHTML = '<button class="account-btn" id="btn-open-auth">👤 Вход · Регистрация</button>';
      var b = $("#btn-open-auth");
      if (b) b.onclick = openAuth;
      return;
    }
    var p = Account.profile() || {};
    box.innerHTML = '<button class="account-btn in" id="btn-open-profile">👤 <b>' + esc(Account.nick() || "Игрок") +
      "</b><span>🏆 " + (p.totalScore || 0).toLocaleString("ru-RU") + " очков · игр: " + (p.games || 0) + "</span></button>";
    var pb = $("#btn-open-profile");
    if (pb) pb.onclick = openProfile;
  }
  window.__renderAccountBox = renderAccountBox;

  function onAccountChange() {
    renderAccountBox();
    var nick = window.Account && Account.nick();
    if (nick) {
      settings.p1 = nick;
      store("gm_settings", settings);
      renderH2H();
    }
    gameLang = (window.Account && Account.lang()) || "ru";
  }

  var authMode = "login";
  function openAuth() {
    authMode = "login";
    setSeg("#seg-auth", "login");
    $("#auth-row-nick").style.display = "none";
    $("#btn-auth-go").textContent = "Войти";
    $("#auth-status").textContent = "";
    showScreen("screen-auth");
  }

  function authGo() {
    var email = ($("#auth-email").value || "").trim();
    var pass = $("#auth-pass").value || "";
    var st = $("#auth-status");
    st.textContent = "⏳ Секунду…";
    var p = authMode === "reg"
      ? Account.register($("#auth-nick").value, email, pass)
      : Account.login(email, pass);
    p.then(function () {
      st.textContent = "";
      renderMenu();
      showScreen("screen-menu");
    }).catch(function (e) {
      st.textContent = "⚠️ " + Account.errText(e);
    });
  }

  function openProfile() {
    var p = Account.profile() || {};
    $("#prof-nick").value = Account.nick() || "";
    $("#prof-summary").innerHTML = "Email: <b>" + esc(Account.email() || "—") + "</b> · Очки: <b>" +
      (p.totalScore || 0).toLocaleString("ru-RU") + "</b> · Игр: <b>" + (p.games || 0) + "</b>";
    setSeg("#seg-lang", Account.lang());
    $("#prof-status").textContent = "";
    $("#prof-old-pass").value = $("#prof-new-pass").value = "";
    $("#prof-email-pass").value = $("#prof-new-email").value = "";
    // у Google-аккаунтов пароль/email управляются Google
    var g = Account.isGoogle();
    $("#prof-google-note").style.display = g ? "" : "none";
    $("#row-prof-pass").style.display = g ? "none" : "";
    $("#row-prof-email").style.display = g ? "none" : "";
    showScreen("screen-profile");
  }

  function openLeaders() {
    showScreen("screen-leaders");
    $("#leaders-status").textContent = "⏳ Загружаем рейтинг…";
    $("#leaders-table").innerHTML = "";
    renderH2H2($("#leaders-h2h"));
    if (!window.Account || !firebase) { $("#leaders-status").textContent = "Рейтинг недоступен"; return; }
    Account.leaderboard().then(function (rows) {
      if (!rows.length) {
        $("#leaders-status").textContent = "Пока никто не сыграл — будь первой, Лейла!";
        return;
      }
      $("#leaders-status").textContent = "";
      var me = Account.uid();
      $("#leaders-table").innerHTML = "<tr><th>#</th><th>Игрок</th><th>Очки</th><th>Игр</th></tr>" +
        rows.map(function (r, i) {
          var medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : (i + 1);
          return '<tr class="' + (r.uid === me ? "me" : "") + '"><td>' + medal + '</td><td class="q">' +
            esc(r.nick || "—") + "</td><td>" + (r.score || 0).toLocaleString("ru-RU") + "</td><td>" + r.games + "</td></tr>";
        }).join("");
    }).catch(function (e) {
      $("#leaders-status").textContent = "⚠️ " + Account.errText(e);
    });
  }

  function renderH2H2leaders(el) { renderH2H2(el); }

  // очки в общий рейтинг: онлайн — мой счёт; соло — мой; локальная дуэль —
  // только игроку, чьё имя совпадает с ником (чтобы не фармить вдвоём с одного аккаунта)
  function creditScore() {
    if (!window.Account || !Account.isIn() || !G) return;
    var pts = 0;
    if (G.online) pts = G.players[G.myIdx].score;
    else if (G.players.length === 1) pts = G.players[0].score;
    else {
      var nick = (Account.nick() || "").toLowerCase();
      var mine = G.players.filter(function (p) { return p.name.toLowerCase() === nick; })[0];
      if (mine) pts = mine.score;
    }
    if (pts > 0) Account.addScore(pts);
  }

  // ---------- Звук ----------
  function updateMuteBtns() {
    $$(".btn-mute").forEach(function (b) { b.textContent = Sound.isMuted() ? "🔇" : "🔊"; });
  }
  function updateMusicBtns() {
    $$(".btn-music").forEach(function (b) {
      b.classList.toggle("off", !Music.isOn());
      b.title = Music.isOn() ? "Музыка: " + Music.title() + " (выключить)" : "Включить музыку";
    });
    $$(".btn-music-next").forEach(function (b) {
      b.title = "Следующий трек (сейчас: " + Music.title() + ")";
    });
  }

  // ---------- Инициализация ----------
  function normExt(e) {
    return { img: e.img, en: e.en, name: e.name, type: e.type, lat: e.lat, lng: e.lng, r: e.r,
      photo: e.photo ? "assets/info/" + e.img + ".jpg" : null, info: e.info || null };
  }

  function init() {
    window.COUNTRIES.forEach(function (c) {
      if (c.fid != null) fidToCountry[c.fid] = c;
      iso2ToCountry[c.iso2] = c;
    });

    // расширенные датасеты из Wikidata (если собраны)
    if (window.PLACES2 && window.PLACES2.length) {
      window.PLACES = window.PLACES.concat(window.PLACES2.map(normExt));
    }
    if (window.MONUMENTS2 && window.MONUMENTS2.length) {
      window.MONUMENTS = window.MONUMENTS.concat(window.MONUMENTS2.map(normExt));
    }
    // области (полигоны) для «Морей и гор»; обмотка нормализуется под d3
    function fixWinding(geom) {
      var polys = geom.type === "Polygon" ? [geom.coordinates] : geom.coordinates;
      polys.forEach(function (rings) {
        var probe = { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: rings } };
        if (d3.geoArea(probe) > Math.PI * 2) {
          rings.forEach(function (r) { r.reverse(); });
        }
      });
    }
    if (window.AREAS) {
      window.PLACES.forEach(function (p) {
        var g = window.AREAS[p.img];
        if (g && TERRAIN_FIDX[p.img] == null) {
          fixWinding(g);
          TERRAIN_FIDX[p.img] = TERRAIN_FEATURES.length;
          TERRAIN_FEATURES.push({ type: "Feature", properties: { name: p.name, orig: p.en }, geometry: g });
        }
      });
    }

    renderMenu();
    bindSegs();

    $("#btn-start").onclick = startMatch;
    $("#btn-back-menu").onclick = function () { showScreen("screen-menu"); };
    $("#handoff-go").onclick = beginTurn;
    $("#btn-confirm").onclick = function () { confirmAnswer(false); };
    $("#btn-next").onclick = function () {
      if (G && G.online && NET.isHost) netSend({ t: "next" });
      nextQuestion();
    };
    $("#btn-zoom-in").onclick = function () { if (cur()) cur().zoomBy(1.7); };
    $("#btn-zoom-out").onclick = function () { if (cur()) cur().zoomBy(1 / 1.7); };
    $("#btn-zoom-world").onclick = function () { if (cur()) cur().reset(true); };
    $("#btn-rematch").onclick = rematch;
    $("#btn-results-menu").onclick = quitToMenu;
    $("#btn-quit").onclick = function () {
      if (confirm("Завершить игру и выйти в меню?")) quitToMenu();
    };
    $("#btn-trophy").onclick = openLeaders;
    $("#btn-info").onclick = function () { $("#overlay-info").classList.add("show"); };
    $$(".overlay-card .btn-close").forEach(function (b) {
      b.onclick = function () { b.closest(".overlay").classList.remove("show"); };
    });
    $("#btn-net-menu").onclick = function () {
      $("#overlay-net").classList.remove("show");
      quitToMenu();
    };
    $$(".btn-mute").forEach(function (b) {
      b.onclick = function () { Sound.setMuted(!Sound.isMuted()); updateMuteBtns(); };
    });
    $("#btn-card").onclick = function () { if (G) showCard(curQ()); };
    $$(".btn-music").forEach(function (b) {
      b.onclick = function () { Music.toggle(); updateMusicBtns(); };
    });
    $$(".btn-music-next").forEach(function (b) {
      b.onclick = function () { Music.next(); updateMusicBtns(); };
    });
    Music.onChange(updateMusicBtns);
    updateMusicBtns();

    // онлайн-экран
    $("#btn-host-room").onclick = function () {
      settings.p1 = myName(); store("gm_settings", settings);
      hostRoom();
    };
    $("#btn-show-join").onclick = function () {
      $("#online-join-sec").style.display = "";
      $("#online-host-sec").style.display = "none";
      $("#inp-join-code").focus();
    };
    $("#btn-join-room").onclick = function () {
      settings.p1 = myName(); store("gm_settings", settings);
      joinRoom();
    };
    $("#btn-online-back").onclick = function () {
      netCleanup();
      renderMenu();
      showScreen("screen-menu");
    };
    $("#btn-copy-invite").onclick = function () {
      if (!NET.code) return;
      var link = location.origin + location.pathname + "?join=" + NET.code;
      var done = function () {
        $("#online-host-status").textContent = "Ссылка скопирована — отправь её и жди подключения! 💌";
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(link).then(done, function () { window.prompt("Скопируй ссылку:", link); });
      } else {
        window.prompt("Скопируй ссылку:", link);
      }
    };
    $("#inp-join-code").addEventListener("input", function () {
      this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    });

    // клик по фото вопроса — увеличить/уменьшить
    document.addEventListener("click", function (e) {
      if (e.target.classList && e.target.classList.contains("q-img")) {
        e.target.classList.toggle("zoomed");
      }
    });
    window.addEventListener("resize", function () {
      if (cur()) cur().invalidate();
    });
    window.addEventListener("beforeunload", function () {
      if (NET.active) netSend({ t: "bye" });
    });

    // аккаунты и рейтинг
    if (window.Account && Account.init()) {
      Account.onChange(onAccountChange);
    }
    $("#seg-auth").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      authMode = b.getAttribute("data-val");
      $("#auth-row-nick").style.display = authMode === "reg" ? "" : "none";
      $("#btn-auth-go").textContent = authMode === "reg" ? "Зарегистрироваться" : "Войти";
      $("#auth-status").textContent = "";
    });
    $("#btn-auth-go").onclick = authGo;
    $("#btn-auth-google").onclick = function () {
      var st = $("#auth-status");
      st.textContent = "⏳ Открываем окно Google…";
      Account.loginGoogle().then(function () {
        st.textContent = "";
        renderMenu();
        showScreen("screen-menu");
      }).catch(function (e) {
        st.textContent = "⚠️ " + Account.errText(e);
      });
    };
    $("#auth-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") authGo(); });
    $("#btn-auth-forgot").onclick = function () {
      var email = ($("#auth-email").value || "").trim();
      if (!email) { $("#auth-status").textContent = "Введите email в поле выше и нажмите ещё раз"; return; }
      Account.resetPassword(email).then(function () {
        $("#auth-status").textContent = "✉️ Письмо для сброса пароля отправлено на " + email;
      }).catch(function (e2) { $("#auth-status").textContent = "⚠️ " + Account.errText(e2); });
    };
    $("#btn-auth-back").onclick = function () { showScreen("screen-menu"); };
    $("#btn-prof-back").onclick = function () { renderMenu(); showScreen("screen-menu"); };
    $("#btn-leaders-back").onclick = function () { showScreen("screen-menu"); };
    $("#btn-logout").onclick = function () {
      Account.logout().then(function () { renderMenu(); showScreen("screen-menu"); });
    };
    $("#btn-prof-nick").onclick = function () {
      Account.changeNick($("#prof-nick").value).then(function () {
        $("#prof-status").textContent = "✔ Имя изменено";
        onAccountChange();
      }).catch(function (e) { $("#prof-status").textContent = "⚠️ " + Account.errText(e); });
    };
    $("#btn-prof-pass").onclick = function () {
      Account.changePassword($("#prof-old-pass").value, $("#prof-new-pass").value).then(function () {
        $("#prof-status").textContent = "✔ Пароль изменён";
      }).catch(function (e) { $("#prof-status").textContent = "⚠️ " + Account.errText(e); });
    };
    $("#btn-prof-email").onclick = function () {
      Account.changeEmail($("#prof-email-pass").value, ($("#prof-new-email").value || "").trim()).then(function () {
        $("#prof-status").textContent = "✉️ Подтвердите смену по письму на новом адресе";
      }).catch(function (e) { $("#prof-status").textContent = "⚠️ " + Account.errText(e); });
    };
    $("#seg-lang").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      Account.setLang(b.getAttribute("data-val"));
      gameLang = b.getAttribute("data-val");
    });

    $("#inp-p1").addEventListener("input", renderH2H);
    initLeylaPhoto();
    renderAccountBox();
    showScreen("screen-menu");

    // открыли по ссылке-приглашению (?join=КОД) — подключаемся сами
    var joinCode = null;
    try { joinCode = new URLSearchParams(location.search).get("join"); } catch (e) {}
    if (joinCode) {
      history.replaceState(null, "", location.pathname);
      openOnline();
      $("#online-join-sec").style.display = "";
      $("#inp-join-code").value = joinCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
      $("#online-join-status").textContent = "Тебя пригласили в игру! Подключаемся…";
      setTimeout(joinRoom, 500);
    }
  }

  document.addEventListener("DOMContentLoaded", init);

  // отладочный доступ (используется только для тестов)
  window.__DEV = {
    getMap: function (name) { return name ? maps[name] : cur(); },
    net: function () { return { active: NET.active, isHost: NET.isHost, code: NET.code, remote: NET.remoteName }; },
    state: function () {
      if (!G) return null;
      return { phase: G.phase, q: G.qIndex, turn: G.turn, mode: G.mode, stage: activeMapName,
        online: G.online, myIdx: G.myIdx,
        scores: G.players.map(function (p) { return p.score; }),
        answers: G.players.map(function (p) { return p.answers; }) };
    }
  };
})();

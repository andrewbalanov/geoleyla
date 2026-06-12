"use strict";
/* GEO-Академия Лейлы — логика игры: локальная дуэль, онлайн-дуэль, экраны */
(function () {

  // ---------- Константы ----------
  var PLAYER_COLORS = ["#ff5fa2", "#29c5e6", "#e8cd80", "#7ee08b"];
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
  function fmtKm(d) { return Math.round(d).toLocaleString("ru-RU") + " " + window.I18N.t("km"); }
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

  // ---------- Сеть (онлайн до 4 игроков, звезда через хоста) ----------
  var NET = {
    active: false, isHost: false, peer: null,
    conn: null,      // у гостя: соединение с хостом
    conns: {},       // у хоста: pid -> DataConnection
    nextPid: 1,
    players: [],     // ростер комнаты: [{pid, name, photo, ready}]
    myPid: 0,        // хост всегда 0
    pending: null,   // выбранный хостом режим: {mode, nQ, timer, diff, region}
    code: ""
  };
  var MAX_PLAYERS = 4;
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
  function netSendTo(c, obj) {
    if (c && c.open) { try { c.send(obj); } catch (e) {} }
  }
  // хост: всем гостям (кроме exceptPid, если задан)
  function broadcast(obj, exceptPid) {
    for (var pid in NET.conns) {
      if (exceptPid != null && Number(pid) === exceptPid) continue;
      netSendTo(NET.conns[pid], obj);
    }
  }
  function netCleanup() {
    var c = NET.conn, cs = NET.conns, p = NET.peer;
    NET = { active: false, isHost: false, peer: null, conn: null, conns: {},
      nextPid: 1, players: [], myPid: 0, pending: null, code: "" };
    try { if (c) c.close(); } catch (e) {}
    for (var k in cs) { try { cs[k].close(); } catch (e) {} }
    try { if (p) p.destroy(); } catch (e) {}
    $("#online-banner").style.display = "none";
  }

  function hostRoom() {
    netCleanup();
    NET.isHost = true;
    NET.active = true;
    NET.myPid = 0;
    NET.code = makeCode();
    NET.players = [{ pid: 0, name: myName(), photo: myPhotoSmall(), ready: false }];
    $("#online-host-sec").style.display = "none";
    $("#online-join-sec").style.display = "none";
    $("#lobby-sec").style.display = "";
    $("#lobby-code").textContent = "· · · ·";
    $("#lobby-status").textContent = T("creating");
    renderLobby();
    var peer = NET.peer = new Peer("gmleyla-" + NET.code, { debug: 0 });
    peer.on("open", function () {
      $("#lobby-code").textContent = NET.code.split("").join(" ");
      var canLink = /^https?:$/.test(location.protocol);
      $("#btn-copy-invite").style.display = canLink ? "" : "none";
      $("#share-row").style.display = canLink ? "" : "none";
      renderLobby();
    });
    peer.on("connection", function (c) {
      c.on("open", function () {
        if (NET.peer !== peer) return;
        if (NET.players.length >= MAX_PLAYERS) { netSendTo(c, { t: "full" }); setTimeout(function () { try { c.close(); } catch (e) {} }, 400); return; }
        if (G && G.online) { netSendTo(c, { t: "busy" }); setTimeout(function () { try { c.close(); } catch (e) {} }, 400); return; }
        var pid = NET.nextPid++;
        c.__pid = pid;
        NET.conns[pid] = c;
      });
      bindConn(c);
    });
    bindPeerWatch(peer, "#lobby-status");
    peer.on("error", function (err) {
      var t = err && err.type;
      if (t === "unavailable-id") { hostRoom(); return; }
      if (t === "network") return; // связь с брокером — её чинит bindPeerWatch
      $("#lobby-status").textContent = T("netErr", t || err);
    });
  }
  function myPhotoSmall() {
    return (window.Account && Account.isIn() && Account.photo()) || null;
  }

  function joinRoom() {
    var code = ($("#inp-join-code").value || "").replace(/\s/g, "").toUpperCase();
    if (code.length !== 4) { $("#online-join-status").textContent = T("code4"); return; }
    netCleanup();
    NET.isHost = false;
    $("#online-join-status").textContent = T("connecting");
    var attempts = 0, watchdog = null;
    var peer = NET.peer = new Peer({ debug: 0 });
    function tryConnect() {
      if (NET.peer !== peer || peer.destroyed) return;
      if (NET.conn && NET.conn.open) return;
      var c = peer.connect("gmleyla-" + code, { reliable: true });
      NET.conn = c;
      bindConn(c);
      // брокер не всегда отвечает на повторный запрос к несуществующей
      // комнате — не даём статусу зависнуть навсегда
      clearTimeout(watchdog);
      watchdog = setTimeout(function () {
        if (NET.peer === peer && !peer.destroyed && !(NET.conn && NET.conn.open)) {
          $("#online-join-status").textContent = T("roomNotFound");
        }
      }, 9000);
    }
    peer.on("open", tryConnect);
    bindPeerWatch(peer, "#online-join-status");
    peer.on("error", function (err) {
      var t = err && err.type;
      if (t === "peer-unavailable") {
        // хост мог как раз переподключаться к брокеру — одна повторная попытка
        if (++attempts <= 1) {
          $("#online-join-status").textContent = T("retrying");
          setTimeout(tryConnect, 1200);
        } else {
          $("#online-join-status").textContent = T("roomNotFound");
        }
      } else if (t === "network") {
        // связь с брокером — её чинит bindPeerWatch
      } else {
        $("#online-join-status").textContent = T("netErr", t || err);
      }
    });
  }

  // связь с PeerJS-брокером может рваться (телефон уснул, сеть мигнула):
  // тихо переподключаемся с тем же id — комната и матч при этом не умирают
  function bindPeerWatch(peer, statusSel) {
    peer.on("disconnected", function () {
      if (NET.peer !== peer || peer.destroyed) return;
      if ($("#screen-online").classList.contains("active"))
        $(statusSel).textContent = T("reconnecting");
      setTimeout(function () {
        if (NET.peer === peer && !peer.destroyed && peer.disconnected) {
          try { peer.reconnect(); } catch (e) {}
        }
      }, 800);
    });
  }

  function bindConn(c) {
    c.on("open", function () {
      if (!NET.isHost) {
        NET.active = true;
        netSend({ t: "hello", name: myName(), photo: myPhotoSmall() });
        $("#online-join-status").textContent = T("joinedWait");
      }
    });
    c.on("data", function (msg) { onNetMsg(msg, c); });
    c.on("close", function () { onConnClosed(c); });
    c.on("error", function () { onConnClosed(c); });
  }

  function pidIdx(pid) {
    for (var i = 0; i < NET.players.length; i++) if (NET.players[i].pid === pid) return i;
    return -1;
  }
  function gIdxOf(pid) {
    if (!G) return -1;
    for (var i = 0; i < G.players.length; i++) if (G.players[i].pid === pid) return i;
    return -1;
  }

  // обрыв соединения: у хоста уходит один гость (комната живёт),
  // у гостя пропал хост — значит вся комната закрылась
  function onConnClosed(c) {
    if (NET.isHost) {
      var pid = c.__pid;
      if (pid == null || NET.conns[pid] !== c) return; // устаревшее соединение
      delete NET.conns[pid];
      hostDropPlayer(pid, false);
      return;
    }
    if (NET.conn !== c) return;
    onNetDrop(T("netLost"));
  }

  // хост: игрок ушёл/кикнут — из лобби убрать, в игре пометить выбывшим
  function hostDropPlayer(pid, kicked) {
    var i = pidIdx(pid);
    if (i < 0) return;
    var name = NET.players[i].name;
    NET.players.splice(i, 1);
    var inGame = G && G.online;
    if (inGame) {
      var gi = gIdxOf(pid);
      if (gi >= 0) G.players[gi].left = true;
      broadcast({ t: "playerLeft", pid: pid, kicked: !!kicked });
      renderScoreChips();
      updateOppStatus();
      // если играть больше не с кем — завершаем матч в лобби
      if (G.players.filter(function (p) { return !p.left; }).length < 2) {
        broadcast({ t: "tolobby" });
        toLobbyAll(T("allLeft"));
        return;
      }
      if (G.phase === "wait" || G.phase === "answer") tryReveal();
    }
    broadcastLobby();
    if (!inGame && $("#screen-online").classList.contains("active"))
      $("#lobby-status").textContent = T("guestLeft", name);
  }

  function onNetDrop(text) {
    if (!NET.active && !NET.peer) return;
    var inGame = G && G.online && !$("#screen-menu").classList.contains("active");
    netCleanup();
    stopTimer();
    G = null;
    if (inGame || !$("#screen-online").classList.contains("active")) {
      $("#net-drop-text").textContent = text || T("netLost");
      $("#overlay-net").classList.add("show");
    } else {
      $("#lobby-sec").style.display = "none";
      $("#online-host-sec").style.display = "";
      $("#online-join-sec").style.display = "none";
      $("#online-host-status").textContent = text || T("netLost");
    }
    renderMenu();
  }

  // ---------- Лобби ----------
  function lobbySnapshot() {
    return {
      players: NET.players.map(function (p) { return { pid: p.pid, name: p.name, photo: p.photo, ready: p.ready }; }),
      pending: NET.pending ? pendingLabel(NET.pending) : null
    };
  }
  function pendingLabel(p) {
    var m = MODES[p.mode];
    return (m ? m.icon + " " + I18N.modeName(p.mode, m.name) : p.mode) +
      " · " + (p.nQ === "all" ? T("allQ") : p.nQ + " " + T("questionsW")) +
      (p.timer ? " · ⏱ " + p.timer + T("secShort") : "");
  }
  // хост: разослать состояние лобби и перерисовать своё
  function broadcastLobby() {
    broadcast({ t: "lobby", lobby: lobbySnapshot() });
    renderLobby();
    updateOnlineBanner();
  }
  function showLobby() {
    openOnline();
    $("#online-host-sec").style.display = "none";
    $("#online-join-sec").style.display = "none";
    $("#lobby-sec").style.display = "";
    if (NET.isHost) {
      $("#lobby-code").textContent = NET.code.split("").join(" ");
      var canLink = /^https?:$/.test(location.protocol);
      $("#btn-copy-invite").style.display = canLink ? "" : "none";
      $("#share-row").style.display = canLink ? "" : "none";
    } else {
      $("#lobby-code").textContent = NET.code.split("").join(" ");
      $("#btn-copy-invite").style.display = "none";
      $("#share-row").style.display = "none";
    }
    renderLobby();
  }
  function renderLobby() {
    if ($("#lobby-sec").style.display === "none") return;
    var me = NET.myPid;
    $("#lobby-players").innerHTML = NET.players.map(function (p) {
      var ava = p.photo ? '<img class="lp-av" src="' + p.photo + '" alt="">' : genAvatar(p.name, "lp-av");
      return '<div class="lobby-player' + (p.ready ? " rdy" : "") + (p.pid === me ? " me" : "") + '">' +
        ava +
        '<span class="lp-name">' + esc(p.name) + (p.pid === 0 ? ' <span class="lp-host">👑</span>' : "") + "</span>" +
        '<span class="lp-state">' + (p.ready ? T("readyMark") : T("waitMark")) + "</span>" +
        (NET.isHost && p.pid !== 0 ? '<button class="lp-kick" data-pid="' + p.pid + '" title="' + T("kickTitle") + '">✕</button>' : "") +
      "</div>";
    }).join("");
    $$("#lobby-players .lp-kick").forEach(function (b) {
      b.onclick = function () {
        if (confirm(T("kickQ"))) kickPlayer(Number(b.getAttribute("data-pid")));
      };
    });
    // выбранный режим
    var pend = NET.isHost ? (NET.pending ? pendingLabel(NET.pending) : null) : NET.pendingView;
    $("#lobby-pending").innerHTML = pend
      ? T("lobbyMode") + " <b>" + pend + "</b>"
      : T("lobbyNoMode");
    // кнопки
    $("#btn-lobby-mode").style.display = NET.isHost ? "" : "none";
    var meP = NET.players[pidIdx(me)];
    var rb = $("#btn-lobby-ready");
    rb.textContent = meP && meP.ready ? T("notReadyBtn") : T("readyBtn");
    rb.classList.toggle("btn-orange", !(meP && meP.ready));
    // статус
    var readyN = NET.players.filter(function (p) { return p.ready; }).length;
    var st;
    if (NET.players.length < 2) st = T("waitingPlayers");
    else if (!pend) st = T("hostPicksMode");
    else if (readyN < NET.players.length) st = T("waitingReady", readyN, NET.players.length);
    else st = T("starting");
    $("#lobby-status").textContent = st;
  }
  function setMyReady(v) {
    if (NET.isHost) {
      NET.players[0].ready = v;
      broadcastLobby();
      maybeStartGame();
    } else {
      var i = pidIdx(NET.myPid);
      if (i >= 0) NET.players[i].ready = v; // локально до прихода ростера
      renderLobby();
      netSend({ t: "ready", v: v });
    }
  }
  function kickPlayer(pid) {
    var c = NET.conns[pid];
    if (c) {
      netSendTo(c, { t: "kick" });
      setTimeout(function () { try { c.close(); } catch (e) {} }, 400);
      delete NET.conns[pid];
    }
    hostDropPlayer(pid, true);
  }
  // хост: все готовы и режим выбран — поехали
  function maybeStartGame() {
    if (!NET.isHost || !NET.pending) return;
    if (G && G.online) return;
    if (NET.players.length < 2) return;
    if (!NET.players.every(function (p) { return p.ready; })) return;
    var pd = NET.pending;
    var questions = buildQuestions(pd.mode, pd.nQ, pd.diff, pd.region);
    if (!questions.length) { $("#lobby-status").textContent = T("noQuestions"); return; }
    var roster = NET.players.map(function (p) { return { pid: p.pid, name: p.name, photo: p.photo }; });
    NET.players.forEach(function (p) { p.ready = false; });
    broadcast({ t: "start", mode: pd.mode, questions: questions, timer: pd.timer, players: roster });
    startOnlineMatch(pd.mode, questions, pd.timer, roster);
  }
  // все возвращаются в комнату ожидания (после матча или когда играть некем)
  function toLobbyAll(statusText) {
    stopTimer();
    G = null;
    NET.players.forEach(function (p) { p.ready = false; });
    showLobby();
    if (statusText) $("#lobby-status").textContent = statusText;
    if (NET.isHost) broadcastLobby();
  }

  function onNetMsg(msg, fromConn) {
    if (!msg || !msg.t) return;
    if (NET.isHost) hostMsg(msg, fromConn);
    else guestMsg(msg);
  }

  // ---------- сообщения у хоста ----------
  function hostMsg(msg, c) {
    var pid = c && c.__pid;
    if (msg.t === "hello") {
      if (pid == null) return;
      var nm = String(msg.name || "Игрок").slice(0, 14);
      var ph = (typeof msg.photo === "string" && msg.photo.length < 60000) ? msg.photo : null;
      if (pidIdx(pid) < 0) NET.players.push({ pid: pid, name: nm, photo: ph, ready: false });
      netSendTo(c, { t: "welcome", pid: pid, code: NET.code });
      broadcastLobby();
      Sound.place();
    } else if (msg.t === "ready") {
      var i = pidIdx(pid);
      if (i >= 0) NET.players[i].ready = !!msg.v;
      broadcastLobby();
      maybeStartGame();
    } else if (msg.t === "answer") {
      if (!G || !G.online) return;
      var gi = gIdxOf(pid);
      if (gi < 0) return;
      G.players[gi].answers[msg.q] = msg.ans;
      broadcast({ t: "answer", pid: pid, q: msg.q, ans: msg.ans }, pid);
      updateOppStatus();
      if (msg.q === G.qIndex) tryReveal();
    } else if (msg.t === "bye") {
      if (pid == null) return;
      if (NET.conns[pid]) { try { NET.conns[pid].close(); } catch (e) {} delete NET.conns[pid]; }
      hostDropPlayer(pid, false);
    }
  }

  // ---------- сообщения у гостя ----------
  function guestMsg(msg) {
    if (msg.t === "welcome") {
      NET.myPid = msg.pid;
      NET.code = msg.code || NET.code;
      showLobby();
    } else if (msg.t === "lobby") {
      NET.players = msg.lobby.players || [];
      NET.pendingView = msg.lobby.pending || null;
      // сигнал «вернуться в комнату» после матча
      if (G && G.online && $("#screen-results").classList.contains("active")) { G = null; showLobby(); }
      else if (!G || !G.online) { if (!$("#screen-online").classList.contains("active")) updateOnlineBanner(); }
      renderLobby();
      updateOnlineBanner();
    } else if (msg.t === "start") {
      startOnlineMatch(msg.mode, msg.questions, msg.timer, msg.players);
    } else if (msg.t === "answer") {
      if (!G || !G.online) return;
      var gi = gIdxOf(msg.pid);
      if (gi < 0 || gi === G.myIdx) return;
      G.players[gi].answers[msg.q] = msg.ans;
      updateOppStatus();
      if (msg.q === G.qIndex) tryReveal();
    } else if (msg.t === "next") {
      if (!G || !G.online) return;
      nextQuestion();
    } else if (msg.t === "playerLeft") {
      var gi2 = gIdxOf(msg.pid);
      if (gi2 >= 0 && G) { G.players[gi2].left = true; renderScoreChips(); updateOppStatus(); if (G.phase === "wait" || G.phase === "answer") tryReveal(); }
      var i2 = pidIdx(msg.pid);
      if (i2 >= 0) NET.players.splice(i2, 1);
      renderLobby();
    } else if (msg.t === "tolobby") {
      toLobbyAll();
    } else if (msg.t === "abort") {
      if (G && G.online) toLobbyAll();
    } else if (msg.t === "kick" || msg.t === "closed") {
      var txt = msg.t === "kick" ? T("kickedMsg") : T("roomClosed");
      netCleanup();
      stopTimer();
      G = null;
      renderMenu();
      $("#net-drop-text").textContent = txt;
      $("#overlay-net").classList.add("show");
    } else if (msg.t === "full") {
      netCleanup();
      $("#online-join-status").textContent = T("roomFull");
    } else if (msg.t === "busy") {
      netCleanup();
      $("#online-join-status").textContent = T("roomBusy");
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
  function renderMenuMap(sel) {
    var host = $(sel || "#menu-map");
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
    var slots = $$(".leyla-photo");
    if (!slots.length) return;
    function showSrc(src) {
      slots.forEach(function (slot) {
        slot.innerHTML = '<img src="' + src + '" alt="Лейла">';
        slot.classList.add("has-photo");
      });
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
        '<span class="mc-text"><b>' + I18N.modeName(key, m.name) + '</b><small>' + I18N.modeDesc(key, m.desc) + "</small></span>" +
        '<span class="mc-arrow">›</span>';
      btn.onclick = function () { openSetup(key); };
      list.appendChild(btn);
    });
    if (!NET.active) {
      var ob = document.createElement("button");
      ob.className = "mode-card mode-card-online";
      ob.style.setProperty("--d", (Object.keys(MODES).length * 0.04) + "s");
      ob.innerHTML = '<span class="mc-icon">🌐</span>' +
        '<span class="mc-text"><b>' + T('online') + '</b><small>' + T('onlineDesc') + '</small></span>' +
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
    b.innerHTML = T("bannerRoom", esc(NET.code || "····"), NET.players.length) +
      '<button id="btn-to-room">' + T("toRoom") + "</button>" +
      '<button id="btn-leave-net">' + T("leaveNet") + "</button>";
    b.style.display = "block";
    $("#btn-to-room").onclick = showLobby;
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
        (rec.draws ? '<span class="h2h-draws">' + T("draws") + ": " + rec.draws + "</span>" : "");
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
    $("#setup-title").innerHTML = m.icon + " " + I18N.modeName(mode, m.name);
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
    if (online) $("#setup-online-note").innerHTML = T("roomNote",
      NET.players.map(function (p) { return esc(p.name); }).join(", "));
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
    if (!questions.length) { alert(T("noQuestions")); return; }

    if (NET.active && NET.isHost) {
      // онлайн: режим назначен — все собираются в комнате ожидания
      NET.pending = { mode: pendingMode, nQ: settings.nQ, timer: settings.timer,
        diff: settings.diff, region: settings.region };
      showLobby();
      broadcastLobby();
      maybeStartGame(); // вдруг все уже нажали «Готов»
      return;
    }

    // фото из аккаунта получает игрок, чьё имя совпадает с ником
    var myPhoto = (window.Account && Account.isIn()) ? Account.photo() : null;
    var myNick = (window.Account && Account.nick()) || "";
    var players = [{ name: settings.p1, color: PLAYER_COLORS[0], score: 0, answers: [],
      photo: myPhoto && settings.p1 === myNick ? myPhoto : null }];
    if (settings.twoPlayers) players.push({ name: settings.p2, color: PLAYER_COLORS[1], score: 0, answers: [],
      photo: myPhoto && settings.p2 === myNick ? myPhoto : null });
    G = {
      mode: pendingMode, online: false, myIdx: 0,
      players: players, questions: questions,
      timerSec: settings.timer,
      qIndex: 0, order: [], turn: 0, phase: "idle", guess: null
    };
    restartMatch();
  }

  function startOnlineMatch(mode, questions, timer, roster) {
    pendingMode = mode;
    var myIdx = 0;
    var players = roster.map(function (r, i) {
      if (r.pid === NET.myPid) myIdx = i;
      return { pid: r.pid, name: String(r.name || "Игрок").slice(0, 14),
        color: PLAYER_COLORS[i % PLAYER_COLORS.length], score: 0, answers: [],
        photo: r.photo || null, left: false };
    });
    G = {
      mode: mode, online: true, myIdx: myIdx,
      players: players,
      questions: questions, timerSec: timer || 0,
      qIndex: 0, order: players.map(function (_, i) { return i; }),
      turn: 0, phase: "idle", guess: null
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
    $("#handoff-sub").textContent = isFirst ? T("firstUp") : T("passDevice");
    $("#handoff-avatar").innerHTML = player.photo
      ? '<img src="' + player.photo + '" alt="" style="border-color:' + player.color + '">'
      : "";
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
      hint.textContent = T("tapMap");
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
    if (I18N.lang() === "en" && q.sub && q.sub !== q.title) { tMain = q.sub; tSub = q.title; }
    if (q.mode === "flagsmap") { tMain = T("whoseFlag"); tSub = null; }
    html += '<div class="q-line"><div class="q-titles"><div class="q-title">' + esc(tMain) + "</div>";
    if (tSub && tSub !== tMain) html += '<div class="q-sub">' + esc(tSub) + "</div>";
    html += "</div>";
    if (q.chip) html += '<span class="chip">' + esc(I18N.typeOf(q.chip)) + "</span>";
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
    var alive = G.players.filter(function (p) { return !p.left; });
    var done = alive.filter(function (p) { return p.answers[G.qIndex]; }).length;
    if (alive.length <= 2) {
      var opp = alive.filter(function (p, i) { return G.players.indexOf(p) !== G.myIdx; })[0];
      if (!opp) { el.textContent = ""; return; }
      el.textContent = opp.answers[G.qIndex] ? T("oppDone", opp.name) : T("oppThinking", opp.name);
    } else {
      el.textContent = T("answeredN", done, alive.length);
    }
  }

  function renderTurnBar() {
    var tb = $("#turnbar");
    if (G.online) {
      var me = G.players[G.myIdx];
      tb.innerHTML = '<span class="dot" style="background:' + me.color + '"></span>' +
        "<span>" + T("youAnswer") + "<b style=\"color:" + me.color + '">' + esc(me.name) + "</b></span>" +
        '<span id="opp-status"></span>' +
        '<span id="timer-num"></span>';
      tb.style.display = "flex";
      updateOppStatus();
    } else {
      var p = curPlayer();
      tb.innerHTML = '<span class="dot" style="background:' + p.color + '"></span>' +
        "<span>" + T("answers") + "<b style=\"color:" + p.color + '">' + esc(p.name) + "</b></span>" +
        '<span id="timer-num"></span>';
      tb.style.display = "flex";
    }
    $("#timer-wrap").style.display = G.timerSec ? "" : "none";
  }

  function renderScoreChips() {
    var el = $("#score-chips");
    var canKick = G.online && NET.isHost;
    el.innerHTML = G.players.map(function (p, i) {
      return '<span class="score-chip' + (p.left ? " left" : "") + '" id="score-chip-' + i + '" style="--pc:' + p.color + '">' +
        (p.photo ? '<img class="av" src="' + p.photo + '" alt="">' : "<i></i>") +
        esc(p.name) + ' <b id="score-val-' + i + '">' + p.score + "</b>" +
        (canKick && p.pid !== 0 && !p.left ? '<button class="chip-kick" data-pid="' + p.pid + '" title="' + T("kickTitle") + '">✕</button>' : "") +
      "</span>";
    }).join("");
    $$("#score-chips .chip-kick").forEach(function (b) {
      b.onclick = function () {
        if (confirm(T("kickQ"))) kickPlayer(Number(b.getAttribute("data-pid")));
      };
    });
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
          var hf = cur().features[hitFid];
          if (stageFor(q) === "world") {
            var hc = fidToCountry[hitFid];
            ans.hitName = hc ? hc.name : cur().featureName(hitFid);
            ans.hitNameEn = hc ? hc.nameEn : ans.hitName;
          } else {
            ans.hitName = cur().featureName(hitFid);
            ans.hitNameEn = (hf && hf.properties && hf.properties.orig) || ans.hitName;
          }
        }
      }
    }
    p.answers[G.qIndex] = ans;
    if (!byTimeout) Sound.confirm();

    if (G.online) {
      if (NET.isHost) broadcast({ t: "answer", pid: NET.myPid, q: G.qIndex, ans: ans });
      else netSend({ t: "answer", q: G.qIndex, ans: ans });
      G.phase = "wait";
      var hint = $("#map-hint");
      hint.textContent = T("sentWaitAll");
      hint.style.display = "";
      hint.classList.add("show");
      updateOppStatus();
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
    var all = G.players.every(function (p) { return p.left || p.answers[G.qIndex]; });
    if (all) doReveal();
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

    var rMain = q.reveal, rSub = q.revealSub;
    if (q.mode === "flagsmap" || q.mode === "flagquiz") {
      var fn = I18N.lang() === "en" && q.revealSub ? q.revealSub : q.reveal.replace(/^(Это флаг: |Флаг: )/, "");
      rMain = T("itsFlag", fn); rSub = null;
    } else if (I18N.lang() === "en" && q.revealSub) { rMain = q.revealSub; rSub = q.reveal; }
    $("#reveal-title").innerHTML = esc(rMain) +
      (rSub && rSub !== rMain ? '<div class="reveal-sub">' + esc(rSub) + "</div>" : "");
    $("#reveal-rows").innerHTML = rows;
    var last = G.qIndex + 1 >= G.questions.length;
    var nb = $("#btn-next");
    if (G.online && !NET.isHost) {
      nb.disabled = true;
      nb.textContent = last ? T("finalsWait") : T("nextWait");
    } else {
      nb.disabled = false;
      nb.textContent = last ? T("finals") : T("next");
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
      var hitNm = I18N.lang() === "en" && a.hitNameEn ? a.hitNameEn : a.hitName;
      if (!a.guess) info = T("noAnswer");
      else if (q.kind === "point") info = a.d <= q.r ? "🎯 " + fmtKm(a.d) : fmtKm(a.d);
      else if (a.d <= 0.5) info = T("bullseye");
      else info = T("missBy", fmtKm(a.d)) + (hitNm ? T("hitInto", esc(hitNm)) : "");
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
      if (!a.guess) info = T("noAnswer");
      else if (a.pts >= 1000) info = T("correct");
      else {
        var c = iso2ToCountry[a.guess];
        var cn = c ? (I18N.lang() === "en" ? c.nameEn : c.name) : "?";
        info = T("wrongFlag", esc(cn));
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
  // английский текст карточки (если язык EN и перевод есть), иначе null
  function enInfo(bucket, key) {
    if (I18N.lang() !== "en") return null;
    return ((window.INFO_EN || {})[bucket] || {})[key] || null;
  }
  function getCardData(q) {
    var I = window.INFO || {};
    var en = I18N.lang() === "en";
    if (q.wine) {
      var wi = (I.wine || {})[q.wine.img];
      var we = en && (window.WINE_EN || {})[q.wine.img];
      return { img: wi ? infoImg(wi.img) : null,
        title: en ? q.wine.en : q.wine.name,
        sub: en ? q.wine.name : q.wine.en,
        text: (we && we.desc) || q.wine.desc,
        wines: (we && we.wines) || q.wine.wines };
    }
    if (q.iso2 && (I.countries || {})[q.iso2]) {
      var c = I.countries[q.iso2];
      var co = iso2ToCountry[q.iso2];
      if (!co) return null;
      return { img: infoImg(c.img),
        title: en ? co.nameEn : co.name,
        sub: en ? co.name : co.nameEn,
        cap: T("capitalCap") + (en ? co.capitalEn + " · " + co.capital : co.capital + " · " + co.capitalEn),
        text: enInfo("countries", q.iso2) || c.t };
    }
    if (q.mode === "usa" || q.mode === "france") {
      var m = maps[stageFor(q)];
      if (!m) return null;
      var pr = m.features[q.fid].properties;
      var d = q.mode === "usa" ? (I.usa || {})[pr.name] : (I.france || {})[pr.code];
      if (!d) return null;
      var et = q.mode === "usa" ? enInfo("usa", pr.name) : enInfo("france", pr.code);
      return { img: infoImg(d.img),
        title: en ? pr.orig : pr.name,
        sub: en ? pr.name : pr.orig,
        text: et || d.t };
    }
    if (q.slug) {
      var bucket = q.mode === "monuments" ? I.monuments : I.places;
      var t = enInfo(q.mode === "monuments" ? "monuments" : "places", q.slug) ||
        (bucket || {})[q.slug] || q.infoText;
      if (!t && !q.img) return null;
      return { img: q.img,
        title: en && q.sub ? q.sub : q.title,
        sub: en && q.sub ? q.title : q.sub,
        text: t || "" };
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
      wl.innerHTML = '<div class="card-wines-h">' + T("wines5") + "</div>" +
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
    if (ps.length >= 2) {
      var sorted = ps.slice().sort(function (a, b) { return b.score - a.score; });
      var w = sorted[0].score === sorted[1].score ? null : sorted[0];
      if (ps.length === 2) saveH2H(w);
      if (w) {
        if (isLeyla(w.name)) headline = T("leylaWin") + "<b style=\"color:" + w.color + '">' + esc(w.name) + "</b>!";
        else headline = T("win") + "<b style=\"color:" + w.color + '">' + esc(w.name) + "</b>!";
        sub = sorted.map(function (p) { return p.score.toLocaleString("ru-RU"); }).join(" : ");
        Sound.win();
        confetti(w.color);
      } else {
        headline = T("drawT");
        sub = sorted.map(function (p) { return p.score.toLocaleString("ru-RU"); }).join(" : ");
        Sound.meh();
      }
    } else {
      headline = isLeyla(ps[0].name) ? T("leylaWin").replace(/, $/, "!").replace(/,\s*$/, "!") : T("yourResult");
      sub = ps[0].score.toLocaleString("ru-RU") + " " + T("outOf") + " " + (G.questions.length * 1000).toLocaleString("ru-RU");
      Sound.win();
      confetti(ps[0].color);
    }
    creditScore();
    $("#result-headline").innerHTML = headline;
    $("#result-score").textContent = sub;
    $("#result-mode").textContent = MODES[G.mode].icon + " " + I18N.modeName(G.mode, MODES[G.mode].name) + (G.online ? T("onlineTag") : "");

    var rows = G.questions.map(function (q, qi) {
      var bestPts = Math.max.apply(null, ps.map(function (x) { return x.answers[qi] ? x.answers[qi].pts : 0; }));
      var cells = ps.map(function (p) {
        var a = p.answers[qi];
        var v = a ? a.pts : 0;
        return '<td class="' + (ps.length >= 2 && v === bestPts && v > 0 ? "best" : "") + '">' + v + "</td>";
      }).join("");
      var en = I18N.lang() === "en";
      var label = q.flag
        ? '<img class="result-flag" src="assets/flags/' + q.flag + '.png"> ' + esc(en && q.revealSub ? q.revealSub : q.reveal.replace(/^(Это флаг: |Флаг: )/, ""))
        : esc(en && q.sub && q.sub !== q.title ? q.sub : q.title);
      return "<tr><td>" + (qi + 1) + "</td><td class=\"q\">" + label + "</td>" + cells + "</tr>";
    }).join("");
    var head = "<tr><th>#</th><th>" + T("question") + "</th>" + ps.map(function (p) {
      return '<th style="color:' + p.color + '">' + esc(p.name) + "</th>";
    }).join("") + "</tr>";
    $("#result-table").innerHTML = head + rows;

    var rb = $("#btn-rematch");
    rb.disabled = false;
    if (G.online) rb.textContent = NET.isHost ? T("newGameLobby") : T("backToRoom");
    else rb.textContent = T("rematch");

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
    el.textContent = T("totalH2H") + G.players[0].name + " " + (rec[G.players[0].name] || 0) +
      " : " + (rec[G.players[1].name] || 0) + " " + G.players[1].name +
      (rec.draws ? " (" + T("draws") + ": " + rec.draws + ")" : "");
  }

  function rematch() {
    if (G && G.online) {
      // онлайн: все собираются в комнате ожидания на новую партию
      if (NET.isHost) { broadcast({ t: "tolobby" }); toLobbyAll(); }
      else { G = null; showLobby(); }
      return;
    }
    G.questions = buildQuestions(G.mode, settings.nQ, settings.diff, settings.region);
    restartMatch();
  }

  // выход из матча: хост завершает его для всех (все в лобби),
  // гость покидает комнату целиком
  function quitToMenu(silent) {
    stopTimer();
    if (G && G.online && NET.active) {
      if (NET.isHost) {
        if (!silent) broadcast({ t: "abort" });
        toLobbyAll();
        return;
      }
      if (!silent) netSend({ t: "bye" });
      netCleanup();
    }
    G = null;
    renderMenu();
    showScreen("screen-menu");
  }

  // полный выход из комнаты (кнопка в баннере меню)
  function leaveOnlineSession() {
    if (NET.active) {
      if (NET.isHost) broadcast({ t: "closed" });
      else netSend({ t: "bye" });
    }
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

  // ---------- Локализация ----------
  var T = function () { return window.I18N.t.apply(null, arguments); };
  function applyLang() {
    document.documentElement.lang = I18N.lang();
    $$("[data-i18n]").forEach(function (el) { el.innerHTML = T(el.getAttribute("data-i18n")); });
    $$("[data-i18n-ph]").forEach(function (el) { el.placeholder = T(el.getAttribute("data-i18n-ph")); });
    $$("#btn-lang, #btn-welcome-lang").forEach(function (lb) {
      lb.textContent = I18N.lang().toUpperCase();
    });
  }
  function switchLang(l) {
    I18N.setLang(l);
    if (window.Account && Account.isIn()) Account.setLang(I18N.lang());
    applyLang();
    renderMenu();
  }

  // ---------- Аккаунт, профиль, рейтинг ----------
  var gameLang = "ru"; // зеркалит I18N.lang() для подписей вопросов

  function renderAccountBox() {
    var box = $("#account-box");
    if (!box) return;
    if (!window.Account || !Account.isIn()) {
      box.innerHTML = '<button class="account-btn" id="btn-open-auth">' + T("loginBtn") + "</button>";
      var b = $("#btn-open-auth");
      if (b) b.onclick = openAuth;
      return;
    }
    var p = Account.profile() || {};
    var ava = Account.photo() ? '<img class="av" src="' + Account.photo() + '" alt="">' : "👤";
    box.innerHTML = '<button class="account-btn in" id="btn-open-profile">' + ava + ' <b>' + esc(Account.nick() || "Игрок") +
      "</b><span>🏆 " + (p.totalScore || 0).toLocaleString("ru-RU") + " " + T("pts") + " · " + T("games") + ": " + (p.games || 0) + "</span></button>" +
      '<div class="account-actions">' +
        '<button id="btn-acc-profile">⚙️ ' + T("profileBtn") + "</button>" +
        '<button id="btn-acc-leaders">🏆 ' + T("ratingBtn") + "</button>" +
        '<button id="btn-acc-logout">🚪 ' + T("signOut") + "</button>" +
      "</div>";
    $("#btn-open-profile").onclick = openProfile;
    $("#btn-acc-profile").onclick = openProfile;
    $("#btn-acc-leaders").onclick = openLeaders;
    $("#btn-acc-logout").onclick = function () {
      Account.logout().then(function () { revealWelcome(); showScreen("screen-welcome"); });
    };
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
    var accLang = (window.Account && Account.isIn() && Account.lang()) || null;
    if (accLang && accLang !== I18N.lang()) {
      I18N.setLang(accLang);
      applyLang();
      renderMenu();
    }
    gameLang = I18N.lang();
    applyGate();
  }

  // сжать выбранное фото до квадрата 96px (dataURL ~5КБ — хранится прямо в профиле)
  var pendingAuthPhoto = null;
  function pickAvatar(fileInput, btn, done) {
    fileInput.onchange = function () {
      var f = this.files && this.files[0];
      if (!f) return;
      var img = new Image();
      img.onload = function () {
        var size = 96;
        var cv = document.createElement("canvas");
        cv.width = cv.height = size;
        var k = Math.max(size / img.width, size / img.height);
        var w = img.width * k, h = img.height * k;
        cv.getContext("2d").drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
        var url = cv.toDataURL("image/jpeg", 0.8);
        btn.innerHTML = '<img src="' + url + '" alt="">';
        done(url);
      };
      img.src = URL.createObjectURL(f);
      this.value = "";
    };
    btn.onclick = function () { fileInput.click(); };
  }

  function avatarHTML(photo, cls) {
    return photo ? '<img class="' + (cls || "av") + '" src="' + photo + '" alt="">' : "";
  }

  var authMode = "login";
  function openAuth(mode) {
    authMode = mode === "reg" ? "reg" : "login";
    setSeg("#seg-auth", authMode);
    var isReg = authMode === "reg";
    $("#auth-row-nick").style.display = isReg ? "" : "none";
    $("#auth-row-photo").style.display = isReg ? "" : "none";
    $("#btn-auth-go").textContent = isReg ? T("signUp") : T("signIn");
    $("#auth-status").textContent = "";
    showScreen("screen-auth");
  }

  // ---------- Парадный вход: в клуб пускаем только его членов ----------
  var pendingJoin = null;
  function revealWelcome() {
    $("#welcome-wait").style.display = "none";
    $("#welcome-actions").style.display = "";
    if (pendingJoin) $("#welcome-status").textContent = T("inviteFirst");
  }
  function applyGate() {
    var inn = window.Account && Account.isIn();
    var act = $(".screen.active");
    var onGate = act && (act.id === "screen-welcome" || act.id === "screen-auth");
    if (inn && onGate) {
      renderMenu();
      showScreen("screen-menu");
      if (pendingJoin) { var c = pendingJoin; pendingJoin = null; goJoin(c); }
    } else if (!inn) {
      revealWelcome();
    }
  }
  function goJoin(code) {
    openOnline();
    $("#online-join-sec").style.display = "";
    $("#inp-join-code").value = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    $("#online-join-status").textContent = T("invited");
    setTimeout(joinRoom, 500);
  }

  function authGo() {
    var email = ($("#auth-email").value || "").trim();
    var pass = $("#auth-pass").value || "";
    var st = $("#auth-status");
    st.textContent = T("waitSec");
    var p = authMode === "reg"
      ? Account.register($("#auth-nick").value, email, pass, pendingAuthPhoto)
      : Account.login(email, pass);
    p.then(function () {
      st.textContent = "";
      applyGate();
    }).catch(function (e) {
      st.textContent = "⚠️ " + Account.errText(e);
    });
  }

  function openProfile() {
    var p = Account.profile() || {};
    $("#prof-photo-btn").innerHTML = Account.photo()
      ? '<img src="' + Account.photo() + '" alt="">' : "<span>📷</span>";
    $("#prof-nick").value = Account.nick() || "";
    $("#prof-summary").innerHTML = T("emailW") + ": <b>" + esc(Account.email() || "—") + "</b> · " + T("scoreW") + ": <b>" +
      (p.totalScore || 0).toLocaleString("ru-RU") + "</b> · " + T("gamesW") + ": <b>" + (p.games || 0) + "</b>";
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

  // стильная «дженерик»-аватарка: цвет из имени, первая буква в золочёном круге
  var GEN_AV = [
    ["#e8cd80", "#8a6d14"], ["#ff9cc4", "#a23c68"], ["#86c9ea", "#2a5d80"],
    ["#a4dca9", "#2f6b3a"], ["#e0aa74", "#8a4f1d"], ["#cfa9e6", "#6b3f8a"],
    ["#9adbd2", "#1f6157"], ["#f0a8a0", "#94372c"]
  ];
  function genAvatar(nick, cls) {
    var n = (nick || "?").trim() || "?";
    var s = 0;
    for (var i = 0; i < n.length; i++) s = (s * 31 + n.charCodeAt(i)) % 9973;
    var p = GEN_AV[s % GEN_AV.length];
    return '<span class="gen-av ' + (cls || "") + '" style="background:linear-gradient(155deg,' +
      p[0] + "," + p[1] + ')">' + esc(n.charAt(0).toUpperCase()) + "</span>";
  }
  function avatarOf(r, cls) {
    return r.photo ? '<img class="' + (cls || "av") + '" src="' + r.photo + '" alt="">' : genAvatar(r.nick, cls);
  }

  function podiumCard(r, place, me) {
    var medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
    return '<div class="pod pod-' + place + (r.uid === me ? " me" : "") + '">' +
      (place === 1 ? '<div class="pod-crown">👑</div>' : "") +
      '<div class="pod-ava">' + avatarOf(r, "pod-img") + '<span class="pod-medal">' + medals[place] + "</span></div>" +
      '<div class="pod-nick">' + esc(r.nick || "—") + "</div>" +
      '<div class="pod-score">' + (r.score || 0).toLocaleString("ru-RU") + "</div>" +
      '<div class="pod-games">' + T("gamesW") + ": " + r.games + "</div>" +
      '<div class="pod-base">' + place + "</div>" +
    "</div>";
  }

  function openLeaders() {
    showScreen("screen-leaders");
    $("#leaders-status").textContent = T("loadingLb");
    $("#leaders-table").innerHTML = "";
    $("#lb-podium").innerHTML = "";
    $("#lb-table-wrap").style.display = "none";
    renderH2H2($("#leaders-h2h"));
    if (!window.Account || !firebase) { $("#leaders-status").textContent = T("lbUnavail"); return; }
    Account.leaderboard().then(function (rows) {
      if (!rows.length) {
        $("#leaders-status").textContent = T("lbEmpty");
        return;
      }
      $("#leaders-status").textContent = "";
      var me = Account.uid();

      // пьедестал: 2 — 1 — 3
      var top = rows.slice(0, 3);
      var order = top.length === 3 ? [1, 0, 2] : top.length === 2 ? [1, 0] : [0];
      $("#lb-podium").innerHTML = order.map(function (idx) {
        return podiumCard(top[idx], idx + 1, me);
      }).join("");

      // таблица — с 4-го места
      var rest = rows.slice(3);
      if (rest.length) {
        $("#lb-table-wrap").style.display = "";
        $("#leaders-table").innerHTML =
          "<tr><th class='lb-rank'>#</th><th class='lb-player'>" + T("playerW") + "</th><th class='lb-score'>" +
          T("scoreW") + "</th><th class='lb-games'>" + T("gamesW") + "</th></tr>" +
          rest.map(function (r, i) {
            return '<tr class="' + (r.uid === me ? "me" : "") + '">' +
              '<td class="lb-rank">' + (i + 4) + "</td>" +
              '<td class="lb-player">' + avatarOf(r, "av") + "<span>" + esc(r.nick || "—") + "</span></td>" +
              '<td class="lb-score">' + (r.score || 0).toLocaleString("ru-RU") + "</td>" +
              '<td class="lb-games">' + r.games + "</td></tr>";
          }).join("");
      }
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
      if (G && G.online && NET.isHost) broadcast({ t: "next" });
      nextQuestion();
    };
    $("#btn-zoom-in").onclick = function () { if (cur()) cur().zoomBy(1.7); };
    $("#btn-zoom-out").onclick = function () { if (cur()) cur().zoomBy(1 / 1.7); };
    $("#btn-zoom-world").onclick = function () { if (cur()) cur().reset(true); };
    $("#btn-rematch").onclick = rematch;
    $("#btn-results-menu").onclick = quitToMenu;
    $("#btn-quit").onclick = function () {
      if (confirm(T("quitQ"))) quitToMenu();
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
    // приглашение в WhatsApp / Telegram — открывается выбор контакта с готовым текстом
    function inviteLink() {
      return NET.code ? location.origin + location.pathname + "?join=" + NET.code : null;
    }
    $("#btn-share-wa").onclick = function () {
      var link = inviteLink();
      if (!link) return;
      window.open("https://wa.me/?text=" + encodeURIComponent(T("inviteMsg", myName()) + "\n" + link), "_blank");
    };
    $("#btn-share-tg").onclick = function () {
      var link = inviteLink();
      if (!link) return;
      window.open("https://t.me/share/url?url=" + encodeURIComponent(link) +
        "&text=" + encodeURIComponent(T("inviteMsg", myName())), "_blank");
    };
    $("#btn-copy-invite").onclick = function () {
      if (!NET.code) return;
      var link = location.origin + location.pathname + "?join=" + NET.code;
      var done = function () {
        $("#online-host-status").textContent = T("inviteCopied");
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
    // лобби: готовность и выбор режима
    $("#btn-lobby-ready").onclick = function () {
      var meP = NET.players[pidIdx(NET.myPid)];
      setMyReady(!(meP && meP.ready));
    };
    $("#btn-lobby-mode").onclick = function () {
      renderMenu();
      showScreen("screen-menu");
    };

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
      if (NET.active) {
        if (NET.isHost) broadcast({ t: "closed" });
        else netSend({ t: "bye" });
      }
    });
    // вкладка проснулась (телефон разблокировали) — вернуть связь с брокером
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && NET.peer && NET.peer.disconnected && !NET.peer.destroyed) {
        try { NET.peer.reconnect(); } catch (e) {}
      }
    });

    // запрет масштабирования страницы пальцами (iOS Safari игнорирует meta
    // viewport) — щипок работает только на игровой карте, у неё свой зум
    function pinchOnMap(e) {
      return e.target && e.target.closest && e.target.closest("#map-wrap");
    }
    ["gesturestart", "gesturechange", "gestureend"].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        if (!pinchOnMap(e)) e.preventDefault();
      }, { passive: false });
    });
    document.addEventListener("touchmove", function (e) {
      if (e.scale !== undefined && e.scale !== 1 && !pinchOnMap(e)) e.preventDefault();
    }, { passive: false });

    // аккаунты и рейтинг
    var accountOn = false;
    if (window.Account && Account.init()) {
      accountOn = true;
      Account.onChange(onAccountChange);
    }
    $("#seg-auth").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      authMode = b.getAttribute("data-val");
      $("#auth-row-nick").style.display = authMode === "reg" ? "" : "none";
      $("#auth-row-photo").style.display = authMode === "reg" ? "" : "none";
      $("#btn-auth-go").textContent = authMode === "reg" ? T("signUp") : T("signIn");
      $("#auth-status").textContent = "";
    });
    pickAvatar($("#auth-photo-file"), $("#auth-photo-btn"), function (url) { pendingAuthPhoto = url; });
    pickAvatar($("#prof-photo-file"), $("#prof-photo-btn"), function (url) {
      Account.setPhoto(url).then(function () { $("#prof-status").textContent = T("photoUpdated"); });
    });
    $("#btn-auth-go").onclick = authGo;
    function googleSignIn(stEl) {
      stEl.textContent = T("openingGoogle");
      Account.loginGoogle().then(function () {
        stEl.textContent = "";
        applyGate();
      }).catch(function (e) {
        stEl.textContent = "⚠️ " + Account.errText(e);
      });
    }
    $("#btn-auth-google").onclick = function () { googleSignIn($("#auth-status")); };
    $("#btn-welcome-google").onclick = function () { googleSignIn($("#welcome-status")); };
    $("#btn-welcome-login").onclick = function () { openAuth("login"); };
    $("#btn-welcome-reg").onclick = function () { openAuth("reg"); };
    $("#auth-pass").addEventListener("keydown", function (e) { if (e.key === "Enter") authGo(); });
    $("#btn-auth-forgot").onclick = function () {
      var email = ($("#auth-email").value || "").trim();
      if (!email) { $("#auth-status").textContent = T("enterEmailFirst"); return; }
      Account.resetPassword(email).then(function () {
        $("#auth-status").textContent = T("resetSent", email);
      }).catch(function (e2) { $("#auth-status").textContent = "⚠️ " + Account.errText(e2); });
    };
    $("#btn-auth-back").onclick = function () {
      showScreen(window.Account && Account.isIn() ? "screen-menu" : "screen-welcome");
    };
    $("#btn-prof-back").onclick = function () { renderMenu(); showScreen("screen-menu"); };
    $("#btn-leaders-back").onclick = function () { showScreen("screen-menu"); };
    $("#btn-logout").onclick = function () {
      Account.logout().then(function () { revealWelcome(); showScreen("screen-welcome"); });
    };
    $("#btn-prof-nick").onclick = function () {
      Account.changeNick($("#prof-nick").value).then(function () {
        $("#prof-status").textContent = T("nickChanged");
        onAccountChange();
      }).catch(function (e) { $("#prof-status").textContent = "⚠️ " + Account.errText(e); });
    };
    $("#btn-prof-pass").onclick = function () {
      Account.changePassword($("#prof-old-pass").value, $("#prof-new-pass").value).then(function () {
        $("#prof-status").textContent = T("passChanged");
      }).catch(function (e) { $("#prof-status").textContent = "⚠️ " + Account.errText(e); });
    };
    $("#btn-prof-email").onclick = function () {
      Account.changeEmail($("#prof-email-pass").value, ($("#prof-new-email").value || "").trim()).then(function () {
        $("#prof-status").textContent = T("emailVerify");
      }).catch(function (e) { $("#prof-status").textContent = "⚠️ " + Account.errText(e); });
    };
    $("#seg-lang").addEventListener("click", function (e) {
      var b = e.target.closest("button");
      if (!b) return;
      switchLang(b.getAttribute("data-val"));
      gameLang = I18N.lang();
    });
    $("#btn-lang").onclick = function () {
      switchLang(I18N.lang() === "ru" ? "en" : "ru");
      gameLang = I18N.lang();
    };
    $("#btn-welcome-lang").onclick = $("#btn-lang").onclick;

    $("#inp-p1").addEventListener("input", renderH2H);
    initLeylaPhoto();
    renderMenuMap("#welcome-map");
    applyLang();
    renderAccountBox();

    // ссылка-приглашение (?join=КОД) — подключимся сразу после входа в клуб
    var joinCode = null;
    try { joinCode = new URLSearchParams(location.search).get("join"); } catch (e) {}
    if (joinCode) {
      history.replaceState(null, "", location.pathname);
      pendingJoin = joinCode;
    }

    // парадный вход: ждём ответ Firebase о членстве, гостям показываем кнопки входа
    if (!accountOn) revealWelcome();
    setTimeout(function () {
      if (!(window.Account && Account.isIn())) revealWelcome();
    }, 4000);
  }

  document.addEventListener("DOMContentLoaded", init);

  // отладочный доступ (используется только для тестов)
  window.__DEV = {
    getMap: function (name) { return name ? maps[name] : cur(); },
    peer: function () { return NET.peer; },
    net: function () { return { active: NET.active, isHost: NET.isHost, code: NET.code, players: NET.players, myPid: NET.myPid, pending: NET.pending }; },
    state: function () {
      if (!G) return null;
      return { phase: G.phase, q: G.qIndex, turn: G.turn, mode: G.mode, stage: activeMapName,
        online: G.online, myIdx: G.myIdx,
        scores: G.players.map(function (p) { return p.score; }),
        answers: G.players.map(function (p) { return p.answers; }) };
    }
  };
})();

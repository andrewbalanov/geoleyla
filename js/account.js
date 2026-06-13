"use strict";
/* Аккаунты и рейтинг: Firebase Auth (email/пароль) + Firestore (ники, очки) */
window.Account = (function () {
  var auth = null, db = null, user = null, profile = null;
  var listeners = [];

  var ERR = {
    "auth/email-already-in-use": "Этот email уже зарегистрирован",
    "auth/invalid-email": "Некорректный email",
    "auth/weak-password": "Пароль слишком простой (минимум 6 символов)",
    "auth/wrong-password": "Неверный пароль",
    "auth/invalid-credential": "Неверный email или пароль",
    "auth/user-not-found": "Пользователь с таким email не найден",
    "auth/too-many-requests": "Слишком много попыток — подождите немного",
    "auth/operation-not-allowed": "Вход по email/паролю не включён в Firebase-консоли (Authentication → Sign-in method)",
    "auth/requires-recent-login": "Для этого действия войдите заново",
    "permission-denied": "База данных закрыта правилами — вставьте правила Firestore (вкладка Rules)",
    "nick-taken": "Это имя уже занято",
    "bad-nick": "Имя должно быть от 2 до 16 символов",
    "auth/popup-blocked": "Браузер заблокировал окно входа — разрешите всплывающие окна",
    "auth/popup-closed-by-user": "Окно входа было закрыто",
    "auth/cancelled-popup-request": "Окно входа было закрыто",
    "auth/unauthorized-domain": "Домен не добавлен в Authorized domains (Authentication → Settings)",
    "net-timeout": "База данных не отвечает. Проверьте, что в консоли Firebase создан Firestore (Firestore Database → Create database)"
  };
  var ERR_EN = {
    "auth/email-already-in-use": "This email is already registered",
    "auth/invalid-email": "Invalid email address",
    "auth/weak-password": "Password is too weak (at least 6 characters)",
    "auth/wrong-password": "Wrong password",
    "auth/invalid-credential": "Wrong email or password",
    "auth/user-not-found": "No user found with this email",
    "auth/too-many-requests": "Too many attempts — please wait a bit",
    "auth/operation-not-allowed": "Email/password sign-in is not enabled in the Firebase console",
    "auth/requires-recent-login": "Please sign in again to do this",
    "permission-denied": "The database is locked by security rules",
    "nick-taken": "This name is already taken",
    "bad-nick": "The name must be 2–16 characters long",
    "auth/popup-blocked": "The browser blocked the sign-in window — allow pop-ups",
    "auth/popup-closed-by-user": "The sign-in window was closed",
    "auth/cancelled-popup-request": "The sign-in window was closed",
    "auth/unauthorized-domain": "This domain is not in Authorized domains (Authentication → Settings)",
    "net-timeout": "The database is not responding. Check your connection and try again"
  };
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) {
      setTimeout(function () { rej({ code: "net-timeout" }); }, ms || 9000);
    })]);
  }
  function errText(e) {
    var code = (e && (e.code || e.message)) || "";
    var en = window.I18N && I18N.lang() === "en";
    var d = en ? ERR_EN : ERR;
    return d[code] || ((en ? "Error: " : "Ошибка: ") + code);
  }

  function init() {
    if (!window.firebase || !window.FIREBASE_CONFIG) return false;
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      auth.onAuthStateChanged(function (u) {
        user = u;
        if (u) { loadProfile(); startPresence(); }
        else { stopPresence(); profile = null; notify(); }
      });
      return true;
    } catch (e) { return false; }
  }

  function loadProfile() {
    withTimeout(db.collection("users").doc(user.uid).get(), 9000).then(function (s) {
      profile = s.exists ? s.data() : { nick: user.displayName || "Игрок", totalScore: 0, games: 0, lang: "ru" };
      notify();
    }).catch(function () {
      profile = { nick: user.displayName || "Игрок", totalScore: 0, games: 0, lang: "ru" };
      notify();
    });
  }

  function notify() { listeners.forEach(function (f) { try { f(); } catch (e) {} }); }
  function nickKey(n) { return n.trim().toLowerCase(); }

  function register(nick, email, pass, photo) {
    nick = (nick || "").trim();
    if (nick.length < 2 || nick.length > 16) return Promise.reject({ code: "bad-nick" });
    var key = nickKey(nick);
    return withTimeout(db.collection("nicks").doc(key).get(), 9000).then(function (s) {
      if (s.exists) throw { code: "nick-taken" };
      return auth.createUserWithEmailAndPassword(email, pass);
    }).then(function (cred) {
      var uid = cred.user.uid;
      var batch = db.batch();
      batch.set(db.collection("nicks").doc(key), { uid: uid });
      batch.set(db.collection("users").doc(uid), {
        nick: nick, nickLower: key, email: email, lang: "ru",
        photo: photo || null,
        totalScore: 0, games: 0,
        created: firebase.firestore.FieldValue.serverTimestamp()
      });
      return batch.commit().then(function () {
        return cred.user.updateProfile({ displayName: nick });
      });
    });
  }

  function setPhoto(dataUrl) {
    if (!user) return Promise.resolve();
    if (profile) { profile.photo = dataUrl; notify(); }
    return db.collection("users").doc(user.uid).update({ photo: dataUrl }).catch(function () {});
  }

  function login(email, pass) { return auth.signInWithEmailAndPassword(email, pass); }
  function logout() { goOffline(); stopPresence(); return auth.signOut(); }

  // ---------- Присутствие онлайн + вызов на дуэль ----------
  var beatTimer = null, chalUnsub = null, chalCb = null, seenChal = {};
  function myNick() { return (profile && profile.nick) || (user && user.displayName) || "Игрок"; }
  function myPhotoUrl() { return (profile && profile.photo) || (user && user.photoURL) || null; }
  function startPresence() {
    stopPresence();
    if (!user || !db) return;
    beat();
    beatTimer = setInterval(beat, 30000);
    try {
      chalUnsub = db.collection("users").where("chal.to", "==", user.uid).onSnapshot(function (snap) {
        snap.forEach(function (d) {
          if (d.id === user.uid) return;
          var c = (d.data() || {}).chal;
          if (!c || !c.ts) return;
          var ms = c.ts.toMillis ? c.ts.toMillis() : 0;
          if (!ms || Date.now() - ms > 60000) return;          // протухший вызов игнорируем
          var key = d.id + "|" + ms + "|" + (c.kind || "");
          if (seenChal[key]) return;
          seenChal[key] = 1;
          if (chalCb) { try { chalCb({ fromUid: d.id, fromName: c.fromName, fromPhoto: c.fromPhoto || null, code: c.code || null, kind: c.kind || "invite" }); } catch (e) {} }
        });
      }, function () {});
    } catch (e) {}
  }
  function beat() {
    if (!user || !db) return;
    db.collection("users").doc(user.uid).set({ online: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }).catch(function () {});
  }
  function stopPresence() {
    if (beatTimer) { clearInterval(beatTimer); beatTimer = null; }
    if (chalUnsub) { try { chalUnsub(); } catch (e) {} chalUnsub = null; }
  }
  function goOffline() {
    if (user && db) db.collection("users").doc(user.uid).set({ online: 0 }, { merge: true }).catch(function () {});
  }
  function challengeMsg(toUid, kind, code) {
    if (!user || !db) return Promise.resolve();
    var c = { to: toUid, kind: kind, fromName: myNick(), fromPhoto: myPhotoUrl(), ts: firebase.firestore.FieldValue.serverTimestamp() };
    if (code) c.code = code;
    return db.collection("users").doc(user.uid).set({ chal: c }, { merge: true }).catch(function () {});
  }
  function clearChallenge() {
    if (!user || !db) return Promise.resolve();
    return db.collection("users").doc(user.uid).set({ chal: firebase.firestore.FieldValue.delete() }, { merge: true }).catch(function () {});
  }
  function resetPassword(email) { return auth.sendPasswordResetEmail(email); }

  // ---- Вход через Google: при первом входе автоматически выдаём уникальный ник ----
  function loginGoogle() {
    var provider = new firebase.auth.GoogleAuthProvider();
    return auth.signInWithPopup(provider).then(function (cred) {
      return ensureProfile(cred.user);
    });
  }
  function ensureProfile(u) {
    return withTimeout(db.collection("users").doc(u.uid).get(), 9000).then(function (s) {
      if (s.exists) return;
      var base = ((u.displayName || (u.email || "Игрок").split("@")[0]) + "").trim().slice(0, 14) || "Игрок";
      return claimNick(base, 0, u);
    }).then(function () { loadProfile(); }).catch(function () { loadProfile(); });
  }
  function claimNick(base, n, u) {
    var nick = n ? (base.slice(0, 14 - String(n).length) + n) : base;
    var key = nickKey(nick);
    return db.runTransaction(function (tx) {
      return tx.get(db.collection("nicks").doc(key)).then(function (s) {
        if (s.exists) throw { code: "nick-taken" };
        tx.set(db.collection("nicks").doc(key), { uid: u.uid });
        tx.set(db.collection("users").doc(u.uid), {
          nick: nick, nickLower: key, email: u.email || "", lang: "ru",
          photo: u.photoURL || null, // аватар из Google
          totalScore: 0, games: 0,
          created: firebase.firestore.FieldValue.serverTimestamp()
        });
      });
    }).then(function () {
      return u.updateProfile({ displayName: nick });
    }).catch(function (e) {
      if (e && e.code === "nick-taken" && n < 99) return claimNick(base, n + 1, u);
    });
  }
  function isGoogle() {
    if (!user) return false;
    var hasPass = false, hasGoogle = false;
    (user.providerData || []).forEach(function (p) {
      if (p.providerId === "password") hasPass = true;
      if (p.providerId === "google.com") hasGoogle = true;
    });
    return hasGoogle && !hasPass;
  }

  function reauth(pass) {
    var cred = firebase.auth.EmailAuthProvider.credential(user.email, pass);
    return user.reauthenticateWithCredential(cred);
  }
  function changePassword(oldPass, newPass) {
    return reauth(oldPass).then(function () { return user.updatePassword(newPass); });
  }
  function changeEmail(pass, newEmail) {
    return reauth(pass).then(function () {
      // в новых проектах смена подтверждается письмом на новый адрес
      if (user.verifyBeforeUpdateEmail) return user.verifyBeforeUpdateEmail(newEmail);
      return user.updateEmail(newEmail);
    }).then(function () {
      return db.collection("users").doc(user.uid).update({ email: newEmail }).catch(function () {});
    });
  }
  function changeNick(newNick) {
    newNick = (newNick || "").trim();
    if (newNick.length < 2 || newNick.length > 16) return Promise.reject({ code: "bad-nick" });
    var newKey = nickKey(newNick);
    var oldKey = profile && profile.nickLower;
    if (newKey === oldKey) {
      return db.collection("users").doc(user.uid).update({ nick: newNick }).then(afterNick(newNick, newKey));
    }
    return db.runTransaction(function (tx) {
      return tx.get(db.collection("nicks").doc(newKey)).then(function (s) {
        if (s.exists) throw { code: "nick-taken" };
        tx.set(db.collection("nicks").doc(newKey), { uid: user.uid });
        if (oldKey) tx.delete(db.collection("nicks").doc(oldKey));
        tx.update(db.collection("users").doc(user.uid), { nick: newNick, nickLower: newKey });
      });
    }).then(afterNick(newNick, newKey));
  }
  function afterNick(nick, key) {
    return function () {
      if (profile) { profile.nick = nick; profile.nickLower = key; }
      user.updateProfile({ displayName: nick });
      notify();
    };
  }
  function setLang(lang) {
    if (profile) profile.lang = lang;
    notify();
    return db.collection("users").doc(user.uid).update({ lang: lang }).catch(function () {});
  }

  function addScore(pts, mode) {
    if (!user || !db || !pts) return Promise.resolve();
    var inc = firebase.firestore.FieldValue.increment;
    if (profile) {
      profile.totalScore = (profile.totalScore || 0) + pts;
      profile.games = (profile.games || 0) + 1;
      if (mode) { profile.modes = profile.modes || {}; profile.modes[mode] = (profile.modes[mode] || 0) + pts; }
      notify();
    }
    // set+merge с вложенным increment — начислит и общие очки, и очки по режиму, даже если поля ещё нет
    var upd = { totalScore: inc(pts), games: inc(1) };
    if (mode) { upd.modes = {}; upd.modes[mode] = inc(pts); }
    lbCache = null; // сбросить кэш рейтинга — после игры показать свежие очки
    return db.collection("users").doc(user.uid).set(upd, { merge: true }).catch(function () {});
  }

  // осиротевшие тест-аккаунты (auth удалён, документ обнулить уже нельзя) — прячем из рейтинга
  var SKIP_UIDS = { "EdXftNsdSlUdacOn3cqcpMBGJXC3": 1 };
  // mode: null/"all" — общий рейтинг (totalScore); иначе — очки конкретного режима (modes[mode])
  // кэш сырых данных рейтинга: одно чтение базы на сессию просмотра, переключение
  // режимов считаем у себя (раньше каждый таб заново тянул 300 доков и иногда отваливался)
  var lbCache = null, lbCacheTs = 0;
  function lbFetch() {
    // source:"server" — только полные данные с сервера, без частичного in-memory кэша
    // (он наполняется слушателем вызовов и при сбое сети отдавал неполный список)
    return withTimeout(db.collection("users").limit(300).get({ source: "server" }), 13000).then(function (snap) {
      var raw = [];
      snap.forEach(function (d) { if (!SKIP_UIDS[d.id]) raw.push({ uid: d.id, v: d.data() }); });
      if (raw.length) { lbCache = raw; lbCacheTs = Date.now(); }  // не затираем хорошие данные пустым ответом
      return raw.length ? raw : (lbCache || raw);
    });
  }
  function leaderboard(mode) {
    var byMode = mode && mode !== "all";
    function parse(raw) {
      var rows = [];
      raw.forEach(function (r) {
        var v = r.v;
        var score = byMode ? ((v.modes && v.modes[mode]) || 0) : (v.totalScore || 0);
        if (score <= 0) return; // пустые/без очков в этом режиме не показываем
        var on = v.online && v.online.toMillis ? v.online.toMillis() : (typeof v.online === "number" ? v.online : 0);
        rows.push({ uid: r.uid, nick: v.nick, score: score, games: v.games || 0, photo: v.photo || null, online: on });
      });
      rows.sort(function (a, b) { return b.score - a.score; });
      return rows.slice(0, 50);
    }
    if (lbCache && Date.now() - lbCacheTs < 60000) return Promise.resolve(parse(lbCache)); // свежий кэш — без обращения к базе
    return lbFetch().catch(function () { return lbFetch(); }).then(parse).catch(function (e) {
      if (lbCache) return parse(lbCache);  // сбой/таймаут — показываем последние удачные данные, а не ошибку/пустоту
      throw e;
    });
  }
  function invalidateLeaderboard() { lbCache = null; }

  return {
    init: init,
    onChange: function (f) { listeners.push(f); },
    isIn: function () { return !!user; },
    uid: function () { return user && user.uid; },
    email: function () { return user && user.email; },
    profile: function () { return profile; },
    nick: function () { return (profile && profile.nick) || (user && user.displayName) || null; },
    photo: function () { return (profile && profile.photo) || (user && user.photoURL) || null; },
    setPhoto: setPhoto,
    lang: function () { return (profile && profile.lang) || "ru"; },
    register: register, login: login, logout: logout,
    loginGoogle: loginGoogle, isGoogle: isGoogle,
    resetPassword: resetPassword, changePassword: changePassword,
    changeEmail: changeEmail, changeNick: changeNick, setLang: setLang,
    addScore: addScore, leaderboard: leaderboard,
    onChallenge: function (f) { chalCb = f; },
    sendChallenge: function (toUid, code) { return challengeMsg(toUid, "invite", code); },
    declineChallenge: function (toUid) { return challengeMsg(toUid, "decline"); },
    clearChallenge: clearChallenge,
    goOffline: goOffline,
    errText: errText,
    renderBox: function () { if (window.__renderAccountBox) window.__renderAccountBox(); }
  };
})();

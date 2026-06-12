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
    "net-timeout": "База данных не отвечает. Проверьте, что в консоли Firebase создан Firestore (Firestore Database → Create database)"
  };
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise(function (_, rej) {
      setTimeout(function () { rej({ code: "net-timeout" }); }, ms || 9000);
    })]);
  }
  function errText(e) {
    var code = (e && (e.code || e.message)) || "";
    return ERR[code] || ("Ошибка: " + code);
  }

  function init() {
    if (!window.firebase || !window.FIREBASE_CONFIG) return false;
    try {
      firebase.initializeApp(window.FIREBASE_CONFIG);
      auth = firebase.auth();
      db = firebase.firestore();
      auth.onAuthStateChanged(function (u) {
        user = u;
        if (u) loadProfile();
        else { profile = null; notify(); }
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

  function register(nick, email, pass) {
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
        totalScore: 0, games: 0,
        created: firebase.firestore.FieldValue.serverTimestamp()
      });
      return batch.commit().then(function () {
        return cred.user.updateProfile({ displayName: nick });
      });
    });
  }

  function login(email, pass) { return auth.signInWithEmailAndPassword(email, pass); }
  function logout() { return auth.signOut(); }
  function resetPassword(email) { return auth.sendPasswordResetEmail(email); }

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

  function addScore(pts) {
    if (!user || !db || !pts) return Promise.resolve();
    if (profile) { profile.totalScore = (profile.totalScore || 0) + pts; profile.games = (profile.games || 0) + 1; notify(); }
    return db.collection("users").doc(user.uid).update({
      totalScore: firebase.firestore.FieldValue.increment(pts),
      games: firebase.firestore.FieldValue.increment(1)
    }).catch(function () {});
  }

  function leaderboard() {
    return withTimeout(db.collection("users").orderBy("totalScore", "desc").limit(50).get(), 9000).then(function (snap) {
      var rows = [];
      snap.forEach(function (d) {
        var v = d.data();
        rows.push({ uid: d.id, nick: v.nick, score: v.totalScore || 0, games: v.games || 0 });
      });
      return rows;
    });
  }

  return {
    init: init,
    onChange: function (f) { listeners.push(f); },
    isIn: function () { return !!user; },
    uid: function () { return user && user.uid; },
    email: function () { return user && user.email; },
    profile: function () { return profile; },
    nick: function () { return (profile && profile.nick) || (user && user.displayName) || null; },
    lang: function () { return (profile && profile.lang) || "ru"; },
    register: register, login: login, logout: logout,
    resetPassword: resetPassword, changePassword: changePassword,
    changeEmail: changeEmail, changeNick: changeNick, setLang: setLang,
    addScore: addScore, leaderboard: leaderboard,
    errText: errText,
    renderBox: function () { if (window.__renderAccountBox) window.__renderAccountBox(); }
  };
})();

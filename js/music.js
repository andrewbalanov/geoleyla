"use strict";
/* Фоновая музыка: 5 приключенческих треков (Kevin MacLeod, CC-BY 4.0, incompetech.com) */
window.Music = (function () {
  var TRACKS = [
    { f: "assets/music/curse-of-the-scarab.mp3", n: "Curse of the Scarab" },
    { f: "assets/music/desert-city.mp3", n: "Desert City" },
    { f: "assets/music/ibn-al-noor.mp3", n: "Ibn Al-Noor" },
    { f: "assets/music/crossing-the-divide.mp3", n: "Crossing the Divide" },
    { f: "assets/music/five-armies.mp3", n: "Five Armies" }
  ];
  var on = false, idx = 0, started = false;
  try {
    on = localStorage.getItem("gm_music") === "1"; // по умолчанию выключено
    idx = Math.min(TRACKS.length - 1, parseInt(localStorage.getItem("gm_track") || "0", 10) || 0);
  } catch (e) {}

  var audio = new Audio();
  audio.volume = 0.32;
  audio.preload = "none";
  audio.addEventListener("ended", function () { next(); });
  audio.addEventListener("error", function () { if (on && started) next(); });

  function save() {
    try {
      localStorage.setItem("gm_music", on ? "1" : "0");
      localStorage.setItem("gm_track", String(idx));
    } catch (e) {}
  }
  function play() {
    audio.src = TRACKS[idx].f;
    var p = audio.play();
    if (p && p.catch) p.catch(function () {});
  }
  function next() {
    idx = (idx + 1) % TRACKS.length;
    save();
    if (on) { play(); notify(); }
  }
  function toggle() {
    on = !on;
    save();
    if (on) { started = true; play(); }
    else audio.pause();
    notify();
  }
  var listeners = [];
  function notify() { listeners.forEach(function (fn) { fn(); }); }

  // автозапуск после первого касания (браузеры блокируют автоплей)
  function kick() {
    if (started || !on) return;
    started = true;
    play();
  }
  document.addEventListener("pointerdown", kick, { once: false });

  return {
    toggle: toggle,
    next: function () { started = true; next(); },
    isOn: function () { return on; },
    title: function () { return TRACKS[idx].n; },
    onChange: function (fn) { listeners.push(fn); }
  };
})();

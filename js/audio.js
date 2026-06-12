"use strict";
/* Лёгкие синтезированные звуки (WebAudio), без аудиофайлов */
window.Sound = (function () {
  var ctx = null;
  var muted = false;
  try { muted = localStorage.getItem("gm_muted") === "1"; } catch (e) {}

  function ac() {
    if (!ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume();
    return ctx;
  }

  function tone(freq, dur, type, vol, when, slideTo) {
    if (muted) return;
    var c = ac();
    if (!c) return;
    var o = c.createOscillator(), g = c.createGain();
    var t0 = c.currentTime + (when || 0);
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.16, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  return {
    place: function () { tone(660, 0.09, "triangle", 0.18); tone(880, 0.07, "triangle", 0.12, 0.06); },
    confirm: function () { tone(523, 0.1, "sine", 0.15); tone(784, 0.12, "sine", 0.15, 0.09); },
    handoff: function () { tone(440, 0.12, "sine", 0.13); tone(587, 0.14, "sine", 0.13, 0.12); },
    good: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.14, "triangle", 0.15, i * 0.09); }); },
    meh: function () { tone(392, 0.14, "sine", 0.14); tone(494, 0.16, "sine", 0.12, 0.12); },
    bad: function () { tone(233, 0.28, "sawtooth", 0.07, 0, 130); },
    win: function () {
      [392, 523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.2, "triangle", 0.15, i * 0.12); });
      tone(1318, 0.42, "triangle", 0.13, 0.62);
    },
    tick: function () { tone(990, 0.035, "square", 0.045); },
    setMuted: function (m) { muted = !!m; try { localStorage.setItem("gm_muted", m ? "1" : "0"); } catch (e) {} },
    isMuted: function () { return muted; }
  };
})();

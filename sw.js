/* Service worker: network-first, чтобы обновления приходили сразу,
   а офлайн — отдаём из кэша. Делает игру устанавливаемой как приложение. */
var CACHE = "geoclub-v5";

self.addEventListener("install", function (e) {
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  // кэшируем только свой origin; внешние тайлы/Firebase/PeerJS — всегда сеть
  if (url.origin !== self.location.origin) return;
  // ВСЕГДА перепроверяем у сервера (no-cache), иначе после деплоя браузер мог бы
  // отдать смесь старых и новых файлов из HTTP-кэша и сломать запуск режимов
  var fresh;
  try { fresh = new Request(req, { cache: "no-cache" }); } catch (e) { fresh = req; }
  e.respondWith(
    fetch(fresh).then(function (res) {
      if (res && res.status === 200 && res.type === "basic") {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) {
        return hit || caches.match("./index.html");
      });
    })
  );
});

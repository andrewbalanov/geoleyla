"use strict";
/* Движок карты на MapLibre GL: векторный стиль как Google Maps (без подписей),
   плавный инерционный зум/пан. d3 — только геоматематика (geoContains/centroid/хаверсин). */
(function () {

  function haversine(a, b) { // a,b = [lng,lat] → км
    var R = 6371, rad = Math.PI / 180;
    var dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  // Разрезать кольца, пересекающие антимеридиан (±180), чтобы заливка не
  // растягивалась полосами через всю карту (например Россия/Чукотка).
  function cutAntimeridian(geometry) {
    if (!geometry || (geometry.type !== "Polygon" && geometry.type !== "MultiPolygon")) return geometry;
    function cutRing(ring) {
      var out = [], cur = [];
      for (var i = 0; i < ring.length; i++) {
        var p = ring[i];
        if (i > 0) {
          var q = ring[i - 1];
          if (Math.abs(p[0] - q[0]) > 180) { // сегмент пересекает шов
            var pun = p[0] + (p[0] < q[0] ? 360 : -360);
            var seam = q[0] > 0 ? 180 : -180;
            var t = (seam - q[0]) / (pun - q[0]);
            var lat = q[1] + t * (p[1] - q[1]);
            cur.push([seam, lat]);
            out.push(cur);
            cur = [[-seam, lat]];
          }
        }
        cur.push(p);
      }
      if (cur.length) out.push(cur);
      // кольцо началось в середине куска — склеить первый и последний (одна сторона)
      if (out.length > 1) {
        var f = out[0], l = out[out.length - 1];
        if ((f[0][0] > 0) === (l[l.length - 1][0] > 0)) { out[out.length - 1] = l.concat(f); out.shift(); }
      }
      return out.map(function (c) {
        if (c.length && (c[0][0] !== c[c.length - 1][0] || c[0][1] !== c[c.length - 1][1])) c.push(c[0].slice());
        return c;
      }).filter(function (c) { return c.length >= 4; });
    }
    function ringSpan(r) { var xs = r.map(function (p) { return p[0]; }); return Math.max.apply(null, xs) - Math.min.apply(null, xs); }
    function cutPolygon(poly) {
      var res = [];
      poly.forEach(function (ring, idx) {
        if (ringSpan(ring) > 180) cutRing(ring).forEach(function (r) { res.push([r]); });
        else if (idx === 0) res.push([ring]);
        else if (res.length) res[res.length - 1].push(ring);
        else res.push([ring]);
      });
      return res;
    }
    var out = [];
    var polys = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
    polys.forEach(function (poly) { cutPolygon(poly).forEach(function (p) { out.push(p); }); });
    if (out.length === 1) return { type: "Polygon", coordinates: out[0] };
    return { type: "MultiPolygon", coordinates: out };
  }

  function pinEl(color) {
    var d = document.createElement("div");
    d.className = "gm-pin";
    d.innerHTML = '<svg viewBox="-13 -44 26 46" width="30" height="52">' +
      '<path d="M0,0C-6.5,-11 -11,-15.5 -11,-22.5a11,11 0 1,1 22,0C11,-15.5 6.5,-11 0,0Z" ' +
      'fill="' + color + '" stroke="#fff" stroke-width="2"/>' +
      '<circle cx="0" cy="-22.5" r="4.6" fill="#fff"/></svg>';
    return d;
  }
  function targetEl() {
    var d = document.createElement("div");
    d.className = "gm-target";
    d.innerHTML = "<i></i><b></b>";
    return d;
  }

  /* config: { name, features, regions(bool), bounds [[lat,lng],[lat,lng]] (как раньше),
               maxBounds, minZoom, maxZoom, onPick } */
  function GeoMap(container, config) {
    var self = this;
    this.opts = config;
    this.features = config.features;
    this.markers = {};
    this.cityLabels = {};   // fid -> {lnglat, text} — подписи городов, держатся до конца матча
    this.found = {};
    this.answerFid = null;
    this.clickEnabled = false;
    this.container = container;
    this._arcs = [];
    this._pending = [];
    this._ready = false;

    // bounds в формате [[lat,lng],[lat,lng]] → maplibre [[lng,lat],[lng,lat]]
    function llb(b) { return [[b[0][1], b[0][0]], [b[1][1], b[1][0]]]; }
    this.homeBounds = llb(config.bounds);
    this._defaultHome = this.homeBounds;
    this._wrongFids = [];

    // слои игры зашиваются прямо в стиль — не нужно ждать события load
    var style = JSON.parse(JSON.stringify(config.style || window.MAP_STYLE));
    var regionsFC = { type: "FeatureCollection", features: this.features.map(function (f, i) {
      var pr = config.wineRegions && f.properties ? { tint: f.properties.tint } : {};
      return { type: "Feature", id: i, properties: pr, geometry: cutAntimeridian(f.geometry) };
    }) };
    style.sources.regions = { type: "geojson", data: regionsFC };
    style.sources.arcs = { type: "geojson", data: { type: "FeatureCollection", features: [] } };
    var ST = function (name) { return ["boolean", ["feature-state", name], false]; };
    // green — верный ответ (угадал), yellow — верный ответ, но игрок промахнулся,
    // wrong — куда указал ошибочно, sel — выбор до подтверждения
    // pcolor — индивидуальный цвет игрока (мультиплеер): заливка области в его цвет
    var PC = ["coalesce", ["feature-state", "pcolor"], "#888"];
    // мир: постоянные границы стран из наших полигонов — рисуем ПЕРВЫМИ (под заливкой), чтобы
    // на ответе зелёная/жёлтая заливка ложилась поверх. Линии в пикселях → видны на любом зуме и
    // на мобильном (раньше границы шли только из векторных тайлов и на мелком зуме/мобайле пропадали).
    if (config.worldBorders) {
      style.layers.push({
        id: "regions-base-line", type: "line", source: "regions",
        layout: { "line-join": "round" },
        paint: {
          "line-color": "#3c4a44",
          "line-width": ["interpolate", ["linear"], ["zoom"], 0.5, 0.9, 3, 1.3, 6, 1.9, 12, 2.8],
          "line-opacity": 0.9
        }
      });
    }
    if (config.wineRegions) {
      // винные регионы: каждый окрашен своим приглушённым цветом (явно отмечен),
      // на ответе — зелёный/жёлтый/красный (или цвет игрока в мультиплеере)
      style.layers.push({
        id: "regions-fill", type: "fill", source: "regions",
        paint: {
          "fill-color": ["case",
            ST("green"), "#3cb84d",
            ST("yellow"), "#f0c93a",
            ST("wrong"), "#e15b5b",
            ST("sel"), "#5b9bd5",
            ST("pcolork"), PC,
            ["coalesce", ["get", "tint"], "#9c6b4a"]],
          "fill-opacity": ["case",
            ST("green"), 0.8, ST("yellow"), 0.78, ST("wrong"), 0.7, ST("sel"), 0.7, ST("pcolork"), 0.8,
            0.5]
        }
      });
      style.layers.push({
        id: "regions-line", type: "line", source: "regions",
        paint: { "line-color": "rgba(40,30,20,0.5)", "line-width": 0.8 }
      });
    } else if (config.regions) {
      style.layers.push({
        id: "regions-fill", type: "fill", source: "regions",
        paint: {
          "fill-color": ["case",
            ST("green"), "#3cb84d",
            ST("yellow"), "#f0c93a",
            ST("wrong"), "#e15b5b",
            ST("sel"), "#5b9bd5",
            ST("pcolork"), PC,
            "#ffffff"],
          "fill-opacity": ["case",
            ST("green"), 0.78,
            ST("yellow"), 0.74,
            ST("wrong"), 0.62,
            ST("sel"), 0.65,
            ST("pcolork"), 0.8,
            0.85]
        }
      });
      style.layers.push({
        id: "regions-line", type: "line", source: "regions",
        paint: { "line-color": "#8e9aa0", "line-width": 1.1 }
      });
    } else if (config.grayBase) {
      // режим «Горы»: все массивы заранее серой заливкой; на ответе — цвет
      style.layers.push({
        id: "regions-fill", type: "fill", source: "regions",
        paint: {
          "fill-color": ["case",
            ST("green"), "#3cb84d",
            ST("yellow"), "#f0c93a",
            ST("wrong"), "#e15b5b",
            ST("sel"), "#5b9bd5",
            ST("pcolork"), PC,
            "#8d8378"],
          "fill-opacity": ["case",
            ST("green"), 0.8, ST("yellow"), 0.76, ST("wrong"), 0.68, ST("sel"), 0.64, ST("pcolork"), 0.8,
            0.42]
        }
      });
      style.layers.push({
        id: "regions-line", type: "line", source: "regions",
        paint: { "line-color": "rgba(70,55,40,0.5)", "line-width": 0.7 }
      });
    } else {
      // мир/terrain: заливка видна только для верного/жёлтого/промаха/цвета игрока
      style.layers.push({
        id: "regions-fill", type: "fill", source: "regions",
        paint: {
          "fill-color": ["case",
            ST("green"), "#3cb84d",
            ST("yellow"), "#f0c93a",
            ST("wrong"), "#e15b5b",
            ST("sel"), "#5b9bd5",
            ST("pcolork"), PC,
            "#79ca7f"],
          "fill-opacity": ["case",
            ST("green"), 0.62,
            ST("yellow"), 0.6,
            ST("wrong"), 0.62,
            ST("sel"), 0.45,
            ST("pcolork"), 0.6,
            0]
        }
      });
      style.layers.push({
        id: "regions-line", type: "line", source: "regions",
        paint: {
          "line-color": ["case", ST("wrong"), "#8e2f2f", ST("yellow"), "#9c7a17", ST("pcolork"), PC, "#1d7c2c"],
          "line-width": 2.4,
          "line-opacity": ["case", ST("green"), 0.95, ST("yellow"), 0.9, ST("wrong"), 0.85, ST("pcolork"), 0.9, 0]
        }
      });
    }
    style.layers.push({
      id: "arcs-line", type: "line", source: "arcs",
      layout: { "line-cap": "round" },
      paint: {
        "line-color": ["get", "color"],
        "line-width": 3,
        "line-dasharray": [0.1, 2.2],
        "line-opacity": 0.95
      }
    });

    var map = this.map = new maplibregl.Map({
      container: container,
      style: style,
      attributionControl: false,
      minZoom: config.minZoom || 0.8,
      maxZoom: config.maxZoom || 17,
      renderWorldCopies: false,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      fadeDuration: 80,
      bounds: this.homeBounds,
      fitBoundsOptions: { padding: 10 }
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disable();
    // быстрый и плавный зум колесом (по умолчанию 1/450 — слишком медленно)
    map.scrollZoom.setWheelZoomRate(1 / 140);
    map.scrollZoom.setZoomRate(1 / 90);
    if (config.maxBounds) map.setMaxBounds(llb(config.maxBounds));
    // Без значка атрибуции на карте (мешал в углу). Кредиты карты вынесены в окно «Как играть».

    // если карта создана в скрытом/нулевом контейнере — перефитить вид при первом реальном размере
    this._zeroInit = !container.clientWidth || !container.clientHeight;
    map.on("resize", function () {
      if (self._zeroInit && container.clientWidth > 0) {
        self._zeroInit = false;
        map.fitBounds(self.homeBounds, { padding: 10, duration: 0 });
      }
    });

    map.on("click", function (e) {
      if (!self.clickEnabled) return;
      var lng = e.lngLat.lng, lat = e.lngLat.lat;
      if (lng < -180) lng += 360;
      if (lng > 180) lng -= 360;
      if (lat < -88 || lat > 88) return;
      if (self.opts.onPick) self.opts.onPick([lng, lat]);
    });

    // всплывающая подсказка с названием уже раскрытой области (зелёной/жёлтой) при наведении
    var tip = this._tip = document.createElement("div");
    tip.className = "map-tip";
    tip.style.display = "none";
    container.appendChild(tip);
    map.on("mousemove", function (e) {
      var fid = self.countryAt([e.lngLat.lng, e.lngLat.lat]);
      if (fid != null && self.found[fid]) {
        var nm = (self._tipNamer && self._tipNamer(fid)) || self.featureName(fid);
        if (nm) {
          tip.textContent = nm;
          tip.style.display = "";
          tip.style.left = e.point.x + "px";
          tip.style.top = (e.point.y - 12) + "px";
          return;
        }
      }
      tip.style.display = "none";
    });
    map.on("mouseout", function () { tip.style.display = "none"; });

    // слои уже в стиле; ждём только применения стиля для setData/setFeatureState
    function tryReady() {
      if (self._ready) return;
      try {
        if (map.getSource("arcs")) {
          self._ready = true;
          self._pending.forEach(function (fn) { fn(); });
          self._pending = [];
        }
      } catch (e) { /* стиль ещё применяется */ }
    }
    map.on("styledata", tryReady);
    map.on("load", tryReady);
    tryReady();
  }

  GeoMap.prototype._whenReady = function (fn) {
    if (this._ready) fn(); else this._pending.push(fn);
  };

  GeoMap.prototype.invalidate = function () {
    this.map.resize();
    if (this._zeroInit && this.container.clientWidth > 0) {
      this._zeroInit = false;
      this.map.fitBounds(this.homeBounds, { padding: 10, duration: 0 });
    }
  };

  GeoMap.prototype.setClickEnabled = function (on) {
    this.clickEnabled = !!on;
    this.map.getCanvas().style.cursor = on ? "crosshair" : "";
  };

  GeoMap.prototype.reset = function (animate) {
    this.clearOverlays();
    this.map.stop();
    if (!this.container.clientWidth) { this._zeroInit = true; return; }
    this.map.fitBounds(this.homeBounds, { padding: 10, duration: animate ? 700 : 0 });
  };

  GeoMap.prototype.zoomBy = function (f) {
    var dz = f > 1 ? 1.25 : -1.25;
    this.map.easeTo({ zoom: this.map.getZoom() + dz, duration: 280 });
  };

  GeoMap.prototype.addPin = function (id, lnglat, color) {
    this.removeMarker(id);
    this.markers[id] = new maplibregl.Marker({ element: pinEl(color), anchor: "bottom" })
      .setLngLat(lnglat).addTo(this.map);
    return this.markers[id];
  };

  GeoMap.prototype.addTarget = function (id, lnglat) {
    this.removeMarker(id);
    this.markers[id] = new maplibregl.Marker({ element: targetEl(), anchor: "center" })
      .setLngLat(lnglat).addTo(this.map);
    return this.markers[id];
  };

  GeoMap.prototype.removeMarker = function (id) {
    if (this.markers[id]) { this.markers[id].remove(); delete this.markers[id]; }
  };

  // резолвер локализованного имени для всплывающей подсказки (fid -> строка)
  GeoMap.prototype.setTipNamer = function (fn) { this._tipNamer = fn; };

  // подпись ключевого города области: точка + название, держится до конца матча
  GeoMap.prototype.addCityLabel = function (fid, lnglat, text) {
    if (!text || lnglat == null) return;
    var id = "city" + fid;
    this.cityLabels[fid] = { lnglat: lnglat, text: text };
    this.removeMarker(id);
    var el = document.createElement("div");
    el.className = "map-citylabel";
    var dot = document.createElement("span"); dot.className = "mcl-dot";
    var nm = document.createElement("span"); nm.className = "mcl-name"; nm.textContent = text;
    el.appendChild(dot); el.appendChild(nm);
    this.markers[id] = new maplibregl.Marker({ element: el, anchor: "left" })
      .setLngLat(lnglat).addTo(this.map);
  };

  GeoMap.prototype.drawArc = function (id, a, b, color) {
    var self = this;
    this._arcs.push({ type: "Feature", properties: { color: color },
      geometry: { type: "LineString", coordinates: [a, b] } });
    this._whenReady(function () {
      self.map.getSource("arcs").setData({ type: "FeatureCollection", features: self._arcs });
    });
  };

  // подсветка области под кликом до подтверждения (null — снять)
  GeoMap.prototype.markSel = function (fid) {
    var self = this;
    var prev = this._selFid;
    this._selFid = fid;
    this._whenReady(function () {
      if (prev != null && prev !== fid) {
        self.map.setFeatureState({ source: "regions", id: prev }, { sel: false });
      }
      if (fid != null) {
        self.map.setFeatureState({ source: "regions", id: fid }, { sel: true });
      }
    });
  };

  // куда промахнулся игрок — красным до следующего вопроса
  GeoMap.prototype.markWrong = function (fid) {
    var self = this;
    this._wrongFids = this._wrongFids || [];
    this._wrongFids.push(fid);
    this._whenReady(function () {
      self.map.setFeatureState({ source: "regions", id: fid }, { wrong: true });
    });
  };

  // временные «домашние» границы режима (null — вернуть стандартные)
  GeoMap.prototype.setHome = function (b) {
    this.homeBounds = b
      ? [[b[0][1], b[0][0]], [b[1][1], b[1][0]]]
      : this._defaultHome;
  };

  // верный ответ, угадан игроком — зелёный до конца матча
  GeoMap.prototype.markCorrect = function (fid) {
    var self = this;
    this.found[fid] = "green";
    this._whenReady(function () {
      self.map.setFeatureState({ source: "regions", id: fid }, { green: true, yellow: false });
    });
  };
  // верный ответ, но игрок промахнулся — жёлтый до конца матча
  GeoMap.prototype.markMissed = function (fid) {
    var self = this;
    if (this.found[fid] === "green") return; // уже угадан — оставляем зелёным
    this.found[fid] = "yellow";
    this._whenReady(function () {
      self.map.setFeatureState({ source: "regions", id: fid }, { yellow: true });
    });
  };
  // верный ответ конкретного игрока — его цветом (мультиплеер), до конца матча
  GeoMap.prototype.markPlayer = function (fid, color) {
    var self = this;
    this.found[fid] = "pcolor";
    this._whenReady(function () {
      self.map.setFeatureState({ source: "regions", id: fid }, { pcolork: true, pcolor: color, green: false, yellow: false });
    });
  };
  GeoMap.prototype.clearFound = function () {
    var self = this;
    var ids = Object.keys(this.found);
    this.found = {};
    // подписи городов держатся до конца матча — сбрасываем вместе с found
    for (var cid in this.markers) { if (cid.indexOf("city") === 0) { this.markers[cid].remove(); delete this.markers[cid]; } }
    this.cityLabels = {};
    this._whenReady(function () {
      ids.forEach(function (id) {
        self.map.setFeatureState({ source: "regions", id: +id }, { green: false, yellow: false, pcolork: false });
      });
    });
  };

  GeoMap.prototype.clearOverlays = function () {
    var keep = {};   // подписи городов (city*) переживают смену вопроса — до конца матча
    for (var id in this.markers) {
      if (id.indexOf("city") === 0) keep[id] = this.markers[id];
      else this.markers[id].remove();
    }
    this.markers = keep;
    this._arcs = [];
    var self = this;
    var wrongs = this._wrongFids || [];
    this._wrongFids = [];
    this.markSel(null);
    this._whenReady(function () {
      var src = self.map.getSource("arcs");
      if (src) src.setData({ type: "FeatureCollection", features: [] });
      wrongs.forEach(function (fid) {
        self.map.setFeatureState({ source: "regions", id: fid }, { wrong: false });
      });
    });
  };

  // Вписать точки [[lng,lat],...] (bottomPad px — высота нижней панели)
  GeoMap.prototype.fitTo = function (points, maxZoom, durationMs, bottomPad) {
    if (!points.length) return;
    var b = new maplibregl.LngLatBounds(points[0], points[0]);
    points.forEach(function (p) { b.extend(p); });
    // паддинги не должны превышать размер канваса (иначе maplibre откажется фитить)
    var w = this.container.clientWidth || 800, h = this.container.clientHeight || 600;
    var pt = 100, pb = 50 + (bottomPad || 0), pl = 60, pr = 60;
    if (pt + pb > h * 0.75) { var kv = h * 0.75 / (pt + pb); pt *= kv; pb *= kv; }
    if (pl + pr > w * 0.5) { var kh = w * 0.5 / (pl + pr); pl *= kh; pr *= kh; }
    this.map.stop();
    this.map.fitBounds(b, {
      padding: { top: pt, left: pl, right: pr, bottom: pb },
      maxZoom: maxZoom || 10,
      duration: durationMs == null ? 900 : durationMs,
      essential: true
    });
  };

  GeoMap.prototype.countryAt = function (lnglat) {
    for (var i = 0; i < this.features.length; i++) {
      if (d3.geoContains(this.features[i], lnglat)) return i;
    }
    return null;
  };

  GeoMap.prototype.distanceToCountry = function (lnglat, fid) {
    var f = this.features[fid];
    if (!f) return Infinity;
    if (d3.geoContains(f, lnglat)) return 0;
    var best = Infinity;
    function walk(coords) {
      if (typeof coords[0] === "number") {
        var d = haversine(lnglat, coords);
        if (d < best) best = d;
        return;
      }
      for (var i = 0; i < coords.length; i++) walk(coords[i]);
    }
    walk(f.geometry.coordinates);
    return best;
  };

  GeoMap.prototype.centroidOf = function (fid) {
    return d3.geoCentroid(this.features[fid]);
  };

  GeoMap.prototype.featureName = function (fid) {
    var f = this.features[fid];
    return f && f.properties ? f.properties.name : "";
  };

  /* ---------- Фабрики карт ---------- */
  GeoMap.createWorld = function (container, topo, onPick) {
    var fc = topojson.feature(topo, topo.objects.countries);
    return new GeoMap(container, {
      name: "world",
      features: fc.features,
      regions: false,
      worldBorders: true,   // всегда видимые границы стран из наших данных (не зависят от зума/тайлов)
      bounds: [[-54, -170], [73, 170]],
      maxBounds: [[-85, -179.9], [85, 179.9]],
      minZoom: 1.0,
      maxZoom: 17,
      onPick: onPick
    });
  };

  GeoMap.createFrance = function (container, geojson, onPick) {
    return new GeoMap(container, {
      name: "france",
      features: geojson.features,
      regions: true,
      bounds: [[41.2, -5.5], [51.3, 9.8]],
      maxBounds: [[36, -13], [56, 17]],
      minZoom: 4.2,
      maxZoom: 15,
      onPick: onPick
    });
  };

  GeoMap.createWineFrance = function (container, geojson, onPick) {
    return new GeoMap(container, {
      name: "winefr",
      features: geojson.features,
      wineRegions: true,
      bounds: [[41.2, -5.5], [51.3, 9.8]],
      maxBounds: [[36, -13], [56, 17]],
      minZoom: 4.2,
      maxZoom: 15,
      onPick: onPick
    });
  };

  // винные регионы мира — те же области-полигоны, что у Франции, но в масштабе планеты
  GeoMap.createWineWorld = function (container, geojson, onPick) {
    return new GeoMap(container, {
      name: "wineworld",
      features: geojson.features,
      wineRegions: true,
      bounds: [[-48, -125], [55, 178]],
      maxBounds: [[-85, -179.9], [85, 179.9]],
      minZoom: 1.0,
      maxZoom: 15,
      onPick: onPick
    });
  };

  // Terrain-карта мира (рельеф как в Google Terrain) с областями морей и хребтов
  GeoMap.createTerrain = function (container, areaFeatures, onPick) {
    return new GeoMap(container, {
      name: "terrain",
      features: areaFeatures,
      regions: false,
      style: window.MAP_STYLE_TERRAIN || window.MAP_STYLE,
      bounds: [[-54, -170], [73, 170]],
      maxBounds: [[-85, -179.9], [85, 179.9]],
      minZoom: 1.0,
      maxZoom: 13,
      onPick: onPick
    });
  };

  // режим «Горы»: только горные массивы, все заранее серой заливкой (grayBase)
  GeoMap.createMountains = function (container, areaFeatures, onPick) {
    return new GeoMap(container, {
      name: "mountains",
      features: areaFeatures,
      grayBase: true,
      style: window.MAP_STYLE_TERRAIN || window.MAP_STYLE,
      bounds: [[-54, -170], [73, 170]],
      maxBounds: [[-85, -179.9], [85, 179.9]],
      minZoom: 1.0,
      maxZoom: 13,
      onPick: onPick
    });
  };

  GeoMap.createUSA = function (container, topo, onPick) {
    var fc = topojson.feature(topo, topo.objects.states);
    return new GeoMap(container, {
      name: "usa",
      features: fc.features,
      regions: true,
      bounds: [[17, -170], [72, -64]],
      maxBounds: [[5, -179.9], [80, -45]],
      minZoom: 1.8,
      maxZoom: 15,
      onPick: onPick
    });
  };

  window.GeoMap = GeoMap;
  window.geoHaversine = haversine;
})();

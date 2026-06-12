// Простейший статический сервер для игры (без зависимостей)
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8741;
const MIME = {
  html: "text/html; charset=utf-8", js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8", png: "image/png", jpg: "image/jpeg",
  jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml",
  json: "application/json", woff2: "font/woff2", ttf: "font/ttf", ico: "image/x-icon"
};

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("not found"); return; }
    const ext = path.extname(file).slice(1).toLowerCase();
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream", "Cache-Control": "no-store" });
    res.end(data);
  });
}).listen(PORT, "0.0.0.0", () => console.log("Geomaster: http://localhost:" + PORT));

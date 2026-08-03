// 의존성 0 정적 서버. 프로토타입에 빌드 도구를 얹을 이유가 없다.
//
// **public/ 도 루트처럼 서빙한다.** Vite 를 쓰던 습관대로 에셋을 public/assets 에 뒀는데
// 이 서버는 루트만 보고 있어서 스프라이트가 통째로 404 였다 — 화면에는 글자만 남았다.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const PORT = 8772;
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
  ".json": "application/json",
};

createServer(async (req, res) => {
  const p = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const ext = p.slice(p.lastIndexOf("."));
  for (const base of ["./", "./public/"]) {          // 루트 → public 순으로 찾는다
    try {
      const body = await readFile(new URL(base + p.replace(/^\//, ""), import.meta.url));
      res.writeHead(200, {
        "content-type": TYPES[ext] || "application/octet-stream",
        "cache-control": "no-cache",                 // 고치자마자 새로고침으로 보이게
      });
      res.end(body);
      return;
    } catch { /* 다음 자리에서 찾는다 */ }
  }
  res.writeHead(404).end("not found");
}).listen(PORT, () => console.log(`http://127.0.0.1:${PORT}/`));

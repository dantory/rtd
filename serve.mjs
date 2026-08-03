// 의존성 0 정적 서버. 프로토타입에 빌드 도구를 얹을 이유가 없다.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const PORT = 8772;
const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css" };
createServer(async (req, res) => {
  const p = req.url === "/" ? "/index.html" : req.url.split("?")[0];
  try {
    const body = await readFile(new URL("." + p, import.meta.url));
    res.writeHead(200, { "content-type": TYPES[p.slice(p.lastIndexOf("."))] || "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("not found"); }
}).listen(PORT, () => console.log(`http://127.0.0.1:${PORT}/`));

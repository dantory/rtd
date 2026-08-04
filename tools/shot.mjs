/* 화면을 있는 그대로 찍는다 — 눈으로 볼 수 없으면 "허접함"을 고칠 수 없다.
   playwright 는 옆 프로젝트 것을 빌려 쓴다(이 리포는 의존성 0을 지킨다).
   node tools/shot.mjs <out.png> [폭x높이] [준비대기ms] [스크립트]  */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

const out   = process.argv[2] || "/tmp/rtd.png";
const [w,h] = (process.argv[3] || "430x900").split("x").map(Number);
const wait  = Number(process.argv[4] || 900);
const evalJs= process.argv[5] || "";

const b = await chromium.launch();
const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:2 });
p.on("console", m => { if (m.type()==="error") console.log("[console.error]", m.text()); });
p.on("pageerror", e => console.log("[pageerror]", e.message));
await p.goto("http://127.0.0.1:8772/", { waitUntil:"networkidle" });
await p.waitForTimeout(wait);
if (evalJs) { await p.evaluate(evalJs); await p.waitForTimeout(wait); }
await p.screenshot({ path: out });
await b.close();
console.log("saved", out);

/** **연출을 얹고도 6배속에서 프레임이 안 처지는지 잰다.**
 *
 *  트레이서·머즐·피격 비네트·보스 링을 더한 뒤, 탄과 이펙트가 실제로 쏟아지는 상태(중반
 *  라운드 + 자동 웨이브 + 6배속)에서 진짜 requestAnimationFrame 루프(step)의 프레임 간격을
 *  30초 동안 모아 **평균 25ms 이하**인지 본다. 여기서 재는 건 게임의 실제 rAF 루프다 —
 *  probe 처럼 tick 을 손으로 돌리면 그리기·연출 비용이 빠져 이 측정이 뜻을 잃는다.
 *
 *      node tools/fxperf.mjs
 */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 800 } });
const errs = [];
p.on("pageerror", e => errs.push(e.message));
await p.goto("http://127.0.0.1:8772/", { waitUntil: "networkidle" });
await p.waitForTimeout(700);

// 탄·이펙트가 많은 상태로 몰아넣는다: 자리를 꽉 채우고(대원 여럿), 중반 라운드에서, 자동으로 계속.
await p.evaluate(() => {
  META.relics = 99999;
  let n = 0; while (META.relics >= recruitCost() && n++ < 12) recruit();
  S.round = 12; S.speed = 6; S.auto = true; S.autoRun = true;
  syncArmy(); fillFree(); startWave();
  window.__raf = [];
  let last = performance.now();
  const sample = (t) => { window.__raf.push(t - last); last = t; requestAnimationFrame(sample); };
  requestAnimationFrame(sample);
});
await p.waitForTimeout(30000);

const r = await p.evaluate(() => {
  const a = window.__raf.slice(5);                       // 초반 워밍업 몇 프레임은 뺀다
  const avg = a.reduce((s, x) => s + x, 0) / a.length;
  const p95 = a.slice().sort((x, y) => x - y)[Math.floor(a.length * 0.95)];
  return { n: a.length, avg, p95, round: S.round };
});
await b.close();

console.log(`프레임 ${r.n}개 · 평균 ${r.avg.toFixed(1)}ms · p95 ${r.p95.toFixed(1)}ms · ${r.round}R 까지`);
if (errs.length) console.log(`✗ pageerror ${errs.length}개: ${errs.slice(0, 3).join(" / ")}`);
const ok = r.avg <= 25 && errs.length === 0;
console.log(ok ? "통과 — 6배속에서 프레임 안 처짐" : "실패");
process.exit(ok ? 0 : 1);

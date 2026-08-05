/** 병과 심사 — 12병과가 저마다 제 몫을 하는가를 **숫자로** 잰다.
 *
 *  자: 기준 편성(소총병×3)이 가는 라운드 vs 소총병 둘에 병과 X 하나를 끼운 편성.
 *  그 차이가 X 의 **한계 기여**다. 씨앗 고정이라 편성 차이만 결과에 남는다.
 *  씨앗 3개로 평균 내 몹 체력 편차의 운을 지운다.
 *
 *      node tools/classaudit.mjs        # serve.mjs(8772) + 크롬(9333)
 */
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find(x => x.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
await send("Runtime.enable");
await send("Page.navigate", { url: "http://127.0.0.1:8772/index.html" });
await new Promise(r => setTimeout(r, 1200));

/* 한 판: 지정 편성(전원 2등급·훈련 0)으로 자동 웨이브를 돌려 몇 라운드에서 죽는지.
   30R 상한 — 안 죽으면 30 으로 친다(그 이상은 심사에 정보가 없다). */
const run = (kinds, seed) => `(() => {
  { let __s = ${seed}; Math.random = () => {
    __s |= 0; __s = (__s + 0x6D2B79F5) | 0;
    let t = Math.imul(__s ^ (__s >>> 15), 1 | __s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  localStorage.removeItem("rtd.meta.v1");
  Object.assign(META,{relics:0,best:0,army:[],armyId:0,
    up:Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0])),
    seen:Object.fromEntries(KIND_IDS.map(k=>[k,0])),
    lv:Object.fromEntries(KIND_IDS.map(k=>[k,0]))});
  refreshSlots();
  META.army = ${JSON.stringify(kinds)}.map((k,i)=>({id:i+1, slot:i, kind:k, g:2, hp:1, maxHp:1}));
  META.armyId = 9;
  newGame();
  S.auto=false; S.gap=0; S.autoRun=false;
  let g=0;
  while(!S.over && S.round<=30 && g++<250){
    startWave();
    let t=0; while(S.running && t<300){ tick(1/30); t+=1/30; }
    if (S.running) break;
  }
  return S.round;
})()`;

const SEEDS = [0x1a2b3c4d, 0x5e6f7a8b, 0x2c3d4e5f];
const KINDS = await ev("JSON.stringify(KIND_IDS)").then(JSON.parse);
const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;

const base = [];
for (const s of SEEDS) base.push(await ev(run(["gun", "gun", "gun"], s)));
console.log(`기준(소총병×3)  ${base.join(" · ")}  평균 ${avg(base).toFixed(1)}R\n`);

const rows = [];
for (const k of KINDS) {
  const r = [];
  for (const s of SEEDS) r.push(await ev(run(["gun", "gun", k], s)));
  rows.push({ k, avg: avg(r), runs: r });
}
rows.sort((a, b) => b.avg - a.avg);
for (const { k, avg: a, runs } of rows) {
  const d = a - avg(base);
  console.log(`${k.padEnd(8)} ${a.toFixed(1)}R  (${d >= 0 ? "+" : ""}${d.toFixed(1)})   ${runs.join(" · ")}`);
}
ws.close(); process.exit(0);

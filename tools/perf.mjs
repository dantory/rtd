/** **적이 많아지면 렉이 걸린다**(병수님, 2026-08-08)를 숫자로 잡는 자.
 *
 *  헤드리스에서 프레임 간격(rAF)은 못 믿는다 — 적 세 마리에도 25ms 가 나온다. 대신
 *  CDP 의 `Performance.getMetrics` 로 **스타일 재계산·레이아웃에 실제로 쓴 시간**을
 *  같은 프레임 수 동안 재서 비교한다. 이건 vsync 와 무관하고 기기 성능에도 덜 흔들린다.
 *
 *      node tools/perf.mjs
 */
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find(x => x.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params })); });
const ev = async (x) => {
  const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) { console.error("페이지 예외:", r.exceptionDetails.exception?.description); process.exit(1); }
  return r?.result?.value;
};
await send("Runtime.enable");
await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Performance.enable");
await send("Page.navigate", { url: "http://127.0.0.1:8772/index.html" });
await new Promise(r => setTimeout(r, 1500));

const metrics = async () => Object.fromEntries((await send("Performance.getMetrics")).metrics.map(m => [m.name, m.value]));

/** 그 라운드의 웨이브 한복판을 만들어 놓고 N 프레임을 진짜로 돌린다. */
const setup = (r) => ev(`(() => {
  localStorage.removeItem("rtd.meta.v1");
  Object.assign(META,{relics:0,best:99,army:[],armyId:0,
    up:Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0])),
    seen:Object.fromEntries(KIND_IDS.map(k=>[k,0])),
    lv:Object.fromEntries(KIND_IDS.map(k=>[k,0]))});
  for(let i=0;i<40;i++) recruit(true);
  META.up.slots=9;
  newGame(); S.auto=false; S.gap=0; S.speed=1; S.round=${r};
  S.coreMax=S.coreHp=1e9;          // 여기서 재는 건 밸런스가 아니라 그리는 값이다
  autoBest(); startWave();
  let u=0; while(S.running && S.spawned<S.toSpawn && u<400){ tick(1/30); u+=1/30; }
  return S.mobs.length;
})()`);

const frames = (n) => ev(`new Promise(res=>{ let c=0;
  const f=()=>{ if(!S.over){ tick(1/30); paint(); } if(++c<${n}) requestAnimationFrame(f); else res(S.mobs.length); };
  requestAnimationFrame(f); })`);

const N = 90;
console.log("═══ 그리는 값 (같은 " + N + " 프레임 동안 쓴 시간) ═══\n");
for (const r of [6, 22, 40]) {
  const spawned = await setup(r);
  const a = await metrics();
  const left = await frames(N);
  const b = await metrics();
  const ms = (k) => ((b[k] - a[k]) * 1000);
  const dom = await ev(`document.querySelectorAll("#world *").length`);
  console.log(`R${r} · 적 ${spawned}→${left} · DOM ${dom}\n` +
    `     스타일 재계산 ${ms("RecalcStyleDuration").toFixed(0)}ms (${b.RecalcStyleCount - a.RecalcStyleCount}회) · ` +
    `레이아웃 ${ms("LayoutDuration").toFixed(0)}ms (${b.LayoutCount - a.LayoutCount}회) · ` +
    `스크립트 ${ms("ScriptDuration").toFixed(0)}ms`);
}
process.exit(0);

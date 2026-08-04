/** 한 판을 돌려 놓고 **왜 멈췄는지** 게임 안의 값을 그대로 꺼내 본다.
 *
 *  검증 봇이 "1R" 을 뱉을 때 그것이 죽은 것인지 안 끝난 것인지 로그만으로는 못 가른다.
 *  둘은 고쳐야 할 곳이 완전히 다르다 — 죽었으면 밸런스고, 안 끝났으면 교착이다.
 *
 *      node tools/probe.mjs [판수]
 */
const RUNS = Number(process.argv[2] || 6);
// 두 번째 인자 auto → 게임의 자동 운영(⚙)을 켜고 잰다. 사람이 켜 두고 보는 그대로다.
const AUTO = process.argv[3] === 'auto';
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find(x => x.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params })); });
const ev = async (x) => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;
await send("Runtime.enable");
await send("Page.navigate", { url: "http://127.0.0.1:8772/index.html" });
await new Promise(r => setTimeout(r, 1000));

const out = await ev(`(() => {
  localStorage.removeItem("rtd.meta.v1");
  Object.assign(META,{relics:0,best:0,
    up:Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0])),
    seen:Object.fromEntries(KIND_IDS.map(k=>[k,0]))});
  const AUTO = ${AUTO};
  const rows=[];
  for(let run=0; run<${RUNS}; run++){
    newGame(); S.auto=false; S.gap=0; S.autoRun=AUTO;
    let g=0, stalled=null, firstHit=0, lowest=1;
    while(!S.over && S.round<=30 && g++<250){
      if(!AUTO){ let n=0; while(S.gold>=(Math.max(6,12-META.up.cheap)+S.rolls*2)&&n++<40) roll();
        while(canMerge()) merge(); fillFree(); }
      startWave();
      let t=0; while(S.running && t<300){ tick(1/30); t+=1/30;
        const f=S.coreHp/S.coreMax; if(f<lowest) lowest=f;
        if(!firstHit && S.coreHp<S.coreMax) firstHit=S.round; }
      if (S.running) {                       // 300 초가 지나도 안 끝났다 = 교착
        stalled = { round:S.round, mobs:S.mobs.length, spawned:S.spawned, toSpawn:S.toSpawn,
          coreHp:Math.round(S.coreHp), stuck:S.mobs.filter(m=>m.stuck).length,
          mobHp:S.mobs.map(m=>Math.round(m.hp)).slice(0,6),
          out:placed().map(t=>t.kind+":"+t.g), box:inBox().length };
        break;
      }
    }
    rows.push({ round:S.round, over:S.over, stalled, firstHit, lowest:+lowest.toFixed(2) });
  }
  return rows;
})()`);

for (const r of out) {
  console.log(r.stalled ? `R${r.round} 교착 ${JSON.stringify(r.stalled)}` : `R${r.round} ${r.over ? "죽음" : "정상종료"} · 처음 맞은 라운드 ${r.firstHit || "-"} · 최저체력 ${Math.round(r.lowest*100)}%`);
}
const st = out.filter(r => r.stalled).length;
console.log(`\n교착 ${st}/${out.length} · 죽음 ${out.filter(r => r.over).length}/${out.length}`);
ws.close();

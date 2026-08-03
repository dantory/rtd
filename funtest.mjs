/** 유즈맵 랜타디의 심장은 **"다음 라운드를 누르고 싶은가"** 다.
 *  그건 셋으로 쪼갤 수 있다:
 *    1) 뽑기·합성이 실제로 **성장**으로 이어지는가 (등급이 오르고 화력이 커지는가)
 *    2) 라운드가 **적당히 조여 오는가** — 아무것도 안 해도 이기면 뽑을 이유가 없고,
 *       제대로 해도 5라운드에서 뚫리면 성장을 볼 새가 없다
 *    3) 예외 없이 끝까지 도는가
 *      node funtest.mjs
 */
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find(x=>x.type==="page").webSocketDebuggerUrl);
await new Promise(r=>{ws.onopen=r;});
let id=0; const pend=new Map(); const errors=[];
ws.onmessage=e=>{const m=JSON.parse(e.data);
  if(m.method==="Runtime.exceptionThrown") errors.push(m.params?.exceptionDetails?.exception?.description||"?");
  if(pend.has(m.id)){pend.get(m.id)(m.result);pend.delete(m.id);}};
const send=(m,p={})=>new Promise(res=>{const i=++id;pend.set(i,res);ws.send(JSON.stringify({id:i,method:m,params:p}));});
const ev=async x=>{const r=await send("Runtime.evaluate",{expression:x,returnByValue:true,awaitPromise:true});
  if(r?.exceptionDetails) errors.push((r.exceptionDetails.exception?.description||"").slice(0,160));
  return r?.result?.value;};
await send("Runtime.enable");
await send("Page.navigate",{url:"http://127.0.0.1:8772/index.html"});
await new Promise(r=>setTimeout(r,900));

// 실제 시간을 기다리지 않고 tick 을 직접 돌린다 — 20라운드를 60배로 접는다
const RUNS = Number(process.argv[2] || 8);
const play = (mode) => `(() => {
  const runs = [];
  for (let r = 0; r < ${RUNS}; r++) {
    location.hash = "";                       // 상태 초기화용 표식 (아래에서 새로 만든다)
    Object.assign(S, { gold:90, life:20, round:1, rolls:0, towers:[], mobs:[], shots:[],
                       running:false, spawned:0, toSpawn:0, spawnT:0, sel:null, over:false });
    const peak = { g:1, dmg:0 };
    let guard = 0;
    while (!S.over && S.round <= 20 && guard++ < 200) {
      // 라운드 전에 살 수 있는 만큼 뽑고, 합칠 수 있으면 합친다
      if ("${mode}" !== "idle") {
        let n = 0;
        while (S.gold >= (12 + S.rolls*2) && freeSlots().length && n++ < 40) roll();
        while (canMerge()) merge();
      }
      startWave();
      let t = 0;
      while (S.running && t < 240) { tick(1/30); t += 1/30; }   // 라운드 최대 240초분
      for (const tw of S.towers) { if (tw.g > peak.g) peak.g = tw.g; }
      peak.dmg = S.towers.reduce((a,tw)=>a+Math.round(KINDS[tw.kind].dmg*Math.pow(3,tw.g-1)),0);
    }
    runs.push({ round:S.round, life:S.life, rolls:S.rolls, towers:S.towers.length,
                peakG:peak.g, dmg:peak.dmg, over:S.over });
  }
  const avg = (f) => runs.reduce((a,x)=>a+f(x),0)/runs.length;
  return { 도달라운드:+avg(x=>x.round).toFixed(1), 남은목숨:+avg(x=>x.life).toFixed(1),
           뽑기:+avg(x=>x.rolls).toFixed(1), 타워:+avg(x=>x.towers).toFixed(1),
           최고등급:+avg(x=>x.peakG).toFixed(1), 총화력:Math.round(avg(x=>x.dmg)),
           뚫린판:runs.filter(x=>x.over).length + "/" + runs.length };
})()`;

const playing = await ev(play("play"));
const idle    = await ev(play("idle"));
const p = (o) => Object.entries(o).map(([k,v])=>`${k} ${v}`).join(" · ");
console.log(`\n═══ 랜타디 재미 지표 (각 ${RUNS}판, 20라운드까지) ═══\n`);
console.log("── 뽑고 합치며 논다\n   " + p(playing));
console.log("\n── 아무것도 안 한다 (뽑지도 합치지도 않음)\n   " + p(idle) + "\n");

const chk = (n, ok, d) => console.log(`${ok ? "✓" : "✗"} ${n}${d ? "  — " + d : ""}`);
console.log("── 판정 ──");
chk("뽑고 합치면 실제로 더 멀리 간다", playing.도달라운드 > idle.도달라운드 + 3,
    `놀았을 때 ${playing.도달라운드}R · 안 했을 때 ${idle.도달라운드}R`);
chk("등급이 실제로 오른다 (합성이 작동한다)", playing.최고등급 >= 3, `평균 최고 ${playing.최고등급}등급`);
chk("아무것도 안 하면 일찍 뚫린다", idle.도달라운드 < 8, `${idle.도달라운드}R`);
chk("제대로 하면 성장을 볼 만큼은 간다", playing.도달라운드 >= 10, `${playing.도달라운드}R`);
chk("20라운드가 그냥 뚫리지는 않는다", playing.도달라운드 <= 20.5, `${playing.도달라운드}R`);
chk("예외 없이 돈다", errors.length === 0, errors.slice(0,2).join(" | ").slice(0,150));
ws.close(); process.exit(0);

/** 벙커디펜스가 묻는 것은 **"어디에 세울까"가 결과를 바꾸는가** 다.
 *
 *  길을 따라가는 타워디펜스에서는 배치가 사실상 "길 옆이냐" 하나뿐이었다. 가운데를 지키고
 *  사방에서 오게 하면 배치가 진짜 결정이 된다 — 그게 사실인지 숫자로 확인한다.
 *
 *  그래서 **같은 뽑기·합성을 하되 배치만 다른 봇 둘**을 나란히 돌린다.
 *    아무렇게나  — 뽑힌 자리 그대로 둔다
 *    보고 세운다 — 이번 웨이브가 오는 갈래 쪽으로 고르게 나눠 세운다
 *  둘의 차이가 곧 "배치가 게임인가"의 답이다.
 *
 *      node funtest.mjs [판수]      # serve.mjs(8772) + 크롬(9333)
 */
const RUNS = Number(process.argv[2] || 6);

const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find(x => x.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map(); const errors = [];
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.method === "Runtime.exceptionThrown") errors.push(m.params?.exceptionDetails?.exception?.description || "?");
  if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); }
};
const send = (m, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params })); });
const ev = async (x) => {
  const r = await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) errors.push((r.exceptionDetails.exception?.description || "").slice(0, 200));
  return r?.result?.value;
};
await send("Runtime.enable");
await send("Page.navigate", { url: "http://127.0.0.1:8772/index.html" });
await new Promise(r => setTimeout(r, 1000));

// 배치·유물 사용 여부를 켜고 끄며 같은 루프를 돌린다
const play = (place, useMeta) => [
  '(() => {',
  '  localStorage.removeItem("rtd.meta.v1");',
  // **업그레이드 키를 손으로 적지 말 것.** 새 업그레이드를 하나 더하면 여기만 빠져서
  // 그 값이 undefined 가 되고, 그걸 쓰는 계산이 통째로 NaN 이 된다 — slots 를 더했을 때
  // 자리가 0 개가 되어 봇이 1R 에 전멸했다. 게임이 아니라 이 자가 틀린 것이었다.
  '  Object.assign(META,{relics:0,best:0,',
  '    up:Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0]))});',
  '  refreshSlots();',
  '  const arrange = () => {',
  '    const lanes = waveLanes(S.round), c = coreCenter();',
  // 판 크기는 **게임에서 가져온다.** 13×9 로 박아 뒀더니 판을 21×21 로 넓힌 순간
  // 후보 칸이 구석 21칸만 잡혀, 보고 세운 봇이 오히려 1R 에 죽었다 — 게임이 아니라
  // 이 자를 잘못 대고 있었던 것이다.
  '    const cells=[]; for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) if(buildable(x,y)) cells.push({x,y});',
  '    const used=new Set();',
  '    S.towers.forEach((t,i)=>{',
  '      const th=lanes[i%lanes.length];',
  // 세우는 반지름도 링 두께에서 뽑는다(전엔 195 로 박혀 있었다) — 링이 두꺼워지면 같이 따라간다.
  '      const R=coreRadius()+CELL*(RING*0.78);',
  '      const ax=c.x+Math.cos(th)*R, ay=c.y+Math.sin(th)*R;',
  '      let b=null,bd=1e9;',
  '      for(const s of cells){const k=s.x+","+s.y; if(used.has(k))continue;',
  '        const d=Math.hypot(cx(s.x)-ax,cy(s.y)-ay); if(d<bd){bd=d;b=s;}}',
  '      if(b){used.add(b.x+","+b.y); t.x=b.x; t.y=b.y;}',
  '    });',
  '  };',
  '  const runs=[], grades=[];',
  `  for (let run=0; run<${RUNS}; run++) {`,
  '    newGame();',
  // 봇은 웨이브를 손으로 시작한다. 자동 진행을 켠 채 두면 tick 루프 안에서 다음 웨이브가
  // 저 혼자 이어져, 봇이 뽑고 합칠 틈 없이 라운드만 흘러간다.
  '    S.auto=false; S.gap=0;',
  '    let g=0;',
  '    while(!S.over && S.round<=30 && g++<250){',
  // **자리가 찼다고 뽑기를 멈추면 안 된다.** 가진 것과 내보낸 것이 갈린 뒤로 뽑기는
  // 자리를 채우는 일이 아니라 **합성할 셋을 모으는 일**이다. freeSlots() 를 조건에 두었더니
  // 봇이 자리 셋을 채운 순간 뽑기를 멈춰 창고가 늘 비었고, 그래서 합성이 한 번도 안 났다.
  '      let n=0; while(S.gold>=(Math.max(6,12-META.up.cheap)+S.rolls*2)&&n++<40) roll();',
  '      while(canMerge()) merge();',
  place ? '      arrange();' : '',
  '      startWave();',
  '      let t=0; while(S.running && t<300){ tick(1/30); t+=1/30; }',
  '      if (S.running) break;',
  '    }',
  '    runs.push(S.round);',
  '    grades.push(Math.max(1, ...S.towers.map(t=>t.g)));',
  useMeta ? [
  '    let k=0;',
  '    while(k++<30){',
  '      const key=Object.keys(UPGRADES).filter(x=>META.relics>=upCost(x)).sort((a,b)=>upCost(a)-upCost(b))[0];',
  '      if(!key) break; META.relics-=upCost(key); META.up[key]++;',
  '    }',
  '    saveMeta();'].join("\n") : '',
  '  }',
  '  const avg = a => +(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);',
  '  return { seq:runs, avg:avg(runs), grade:avg(grades) };',
  '})()'
].filter(Boolean).join("\n");

const blind  = await ev(play(false, false));
const smart  = await ev(play(true,  false));
const growth = await ev(play(true,  true));

console.log(`\n═══ 벙커디펜스 지표 (각 ${RUNS}판) ═══\n`);
console.log(`── 아무렇게나 세운다   평균 ${blind.avg}R · 최고등급 ${blind.grade}`);
console.log(`   ${blind.seq.join(" · ")}`);
console.log(`── 오는 쪽을 보고 세운다  평균 ${smart.avg}R · 최고등급 ${smart.grade}`);
console.log(`   ${smart.seq.join(" · ")}`);
console.log(`── 보고 세우고 + 유물을 쓴다  평균 ${growth.avg}R`);
console.log(`   ${growth.seq.join(" → ")}\n`);

const chk = (n, ok, d) => console.log(`${ok ? "✓" : "✗"} ${n}${d ? "  — " + d : ""}`);
console.log("── 판정 ──");
chk("배치가 결과를 크게 바꾼다 (이 구조의 존재 이유)", smart.avg > blind.avg + 3,
    `아무렇게나 ${blind.avg}R → 보고 세우면 ${smart.avg}R`);
chk("합성으로 등급이 오른다", smart.grade >= 2.5, `평균 최고 ${smart.grade}등급`);
const f = growth.seq.slice(0,2).reduce((a,b)=>a+b,0)/2, l = growth.seq.slice(-2).reduce((a,b)=>a+b,0)/2;
chk("판을 거듭하면 더 간다 (유물)", l >= f, `처음 2판 ${f.toFixed(1)}R → 마지막 2판 ${l.toFixed(1)}R`);
chk("첫 벽이 너무 이르지 않다", smart.avg >= 7, `${smart.avg}R`);
chk("예외 없이 돈다", errors.length === 0, errors.slice(0,2).join(" | ").slice(0,150));
ws.close(); process.exit(0);

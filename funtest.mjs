/** 이 판이 묻는 것은 **"무엇을 내보낼까"가 결과를 바꾸는가** 다.
 *
 *  자리를 셋으로 조이기 전에는 "어디에 세울까"를 쟀다. 자리가 고정된 뒤로 위치 선택이
 *  사라졌는데 자는 그대로여서 늘 ✗ 가 떴다 — 실패가 아니라 무의미해진 자였다.
 *  지금 결정은 가진 것 중 무엇을 벙커에 올리느냐다.
 *
 *  그래서 **같은 뽑기·합성을 하되 내보내는 기준만 다른 봇 둘**을 나란히 돌린다.
 *    아무거나  — 가진 것을 섞어서 앞에서부터
 *    골라 낸다 — 등급·피해가 높은 것부터(게임의 fillFree 와 같은 기준)
 *  둘의 차이가 곧 "고르는 것이 게임인가"의 답이다.
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
  // **같은 코드면 같은 판정.** Math.random 을 씨앗 고정 PRNG 로 덮어 봇의 징집·합성·전투를
  // 결정적으로 만든다. 스트림은 판을 거듭하며 흐르므로 판마다 다른 값을 뽑되(표본은 여섯
  // 그대로), 자를 다시 돌리면 똑같이 흐른다 — 그래서 세 번 돌려도 seq·등급·판정이 한 글자도
  // 안 바뀐다. 덮어쓰기는 이 eval 안에서만 산다(봇 전용) — 실제 게임의 Math.random 은 그대로다.
  '  { let __s = 0x1a2b3c4d; Math.random = () => {',
  '    __s |= 0; __s = (__s + 0x6D2B79F5) | 0;',
  '    let t = Math.imul(__s ^ (__s >>> 15), 1 | __s);',
  '    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;',
  '    return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }',
  '  localStorage.removeItem("rtd.meta.v1");',
  // **업그레이드 키를 손으로 적지 말 것.** 새 업그레이드를 하나 더하면 여기만 빠져서
  // 그 값이 undefined 가 되고, 그걸 쓰는 계산이 통째로 NaN 이 된다 — slots 를 더했을 때
  // 자리가 0 개가 되어 봇이 1R 에 전멸했다. 게임이 아니라 이 자가 틀린 것이었다.
  '  Object.assign(META,{relics:0,best:0,army:[],armyId:0,',
  '    up:Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0])),',
  '    seen:Object.fromEntries(KIND_IDS.map(k=>[k,0])),',
  '    lv:Object.fromEntries(KIND_IDS.map(k=>[k,0]))});',
  '  refreshSlots();',
  /* **무엇을 내보낼까가 결과를 바꾸는가.**
     자리가 셋으로 고정된 뒤로 "어디에 세울까"는 결정이 아니게 됐다. 옛 자는 위치를 재고
     있었고, 그래서 늘 ✗ 가 떴다 — 실패가 아니라 무의미해진 것이었다. 지금 이 판이 묻는
     것은 가진 것 중 무엇을 자리에 올리느냐다. 봇 둘을 그 축으로 갈라 세운다.
       고른다   — 등급·피해가 높은 것부터(게임의 fillFree 와 같은 기준)
       아무거나 — 가진 것을 섞어서 앞에서부터 */
  /* **자를 게임의 자동 운영과 갈라 둔다.** 게임 안의 fillFree 는 이제 빈 자리만 메운다
     (사람이 정한 배치를 0.4초마다 덮어쓰지 않게). 여기서 재려는 것은 "가진 것 중 센 것을
     골라 내보내면 결과가 달라지는가"라 **정보를 다 아는 사람**을 세워야 한다 — 그게 autoBest 다. */
  '  const arrange = () => { autoBest(); };',
  '  const shuffleOut = () => {',
  '    META.army.forEach(t => { t.slot = null; });',
  '    const box = META.army.slice();',
  '    for (let i=box.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;const q=box[i];box[i]=box[j];box[j]=q;}',
  '    const seen = new Set();',
  '    for (const t of box) { const f = freeSlots(); if (!f.length) break;',
  '      if (seen.has(t.kind)) continue; t.slot = f[0]; seen.add(t.kind); }',
  '    syncArmy();',
  '  };',
  '  const runs=[], grades=[];',
  `  for (let run=0; run<${RUNS}; run++) {`,
  // **부대를 먼저 꾸린다.** 판 안에서 뽑던 것이 판 밖 일이 됐으므로, 출격 전에 유물을
  // 털어 징집하고 합친다. 이것이 사람이 정산 화면에서 하는 일 그대로다.
  '    let r=0; while(META.relics>=recruitCost() && r++<40) recruit();',
  '    newGame();',
  // 봇은 웨이브를 손으로 시작한다. 자동 진행을 켠 채 두면 tick 루프 안에서 다음 웨이브가
  // 저 혼자 이어져, 봇이 뽑고 합칠 틈 없이 라운드만 흘러간다.
  // 자동 운영도 끈다 — 봇이 뽑고 합치는 것과 겹치면 무엇이 결과를 만들었는지 못 가른다.
  '    S.auto=false; S.gap=0; S.autoRun=false;',
  '    let g=0;',
  /* 상한 40 — 30 이면 성장한 판이 **벽이 아니라 자에 걸려** 31 로 찍힌다(상성이 들어간
     뒤 실제로 열 판 중 셋이 그랬다). 자에 걸린 값으로는 벽이 어디인지 못 읽는다. */
  '    while(!S.over && S.round<=40 && g++<250){',
  // **자리가 찼다고 뽑기를 멈추면 안 된다.** 가진 것과 내보낸 것이 갈린 뒤로 뽑기는
  // 자리를 채우는 일이 아니라 **합성할 셋을 모으는 일**이다. freeSlots() 를 조건에 두었더니
  // 봇이 자리 셋을 채운 순간 뽑기를 멈춰 창고가 늘 비었고, 그래서 합성이 한 번도 안 났다.

  place ? '      arrange();' : '      shuffleOut();',
  '      startWave();',
  '      let t=0; while(S.running && t<300){ tick(1/30); t+=1/30; }',
  '      if (S.running) break;',
  '    }',
  '    runs.push(S.round);',
  '    grades.push(Math.max(1, ...META.army.map(t=>t.g), 1));',
  useMeta ? [
  '    let k=0;',
  '    while(k++<30){',
  // 유물은 **전역 업그레이드와 병과 훈련 양쪽**에 쓴다 — 한쪽만 사면 성장 축을 반만 재는 셈이다.
  '      const ups=Object.keys(UPGRADES).filter(x=>META.relics>=upCost(x)).map(x=>({k:x,c:upCost(x),t:0}));',
  '      const trs=KIND_IDS.filter(x=>META.seen[x]&&META.relics>=kindCost(x)).map(x=>({k:x,c:kindCost(x),t:1}));',
  '      const key=[...ups,...trs].sort((a,b)=>a.c-b.c)[0];',
  '      if(!key) break; META.relics-=key.c;',
  '      if(key.t) META.lv[key.k]++; else META.up[key.k]++;',
  '    }',
  '    saveMeta();'].join("\n") : '',
  '  }',
  '  const avg = a => +(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);',
  '  return { seq:runs, avg:avg(runs), grade:avg(grades), peak:Math.max(1,...grades) };',
  '})()'
].filter(Boolean).join("\n");

const blind  = await ev(play(false, false));
const smart  = await ev(play(true,  false));
const growth = await ev(play(true,  true));

console.log(`\n═══ 벙커디펜스 지표 (각 ${RUNS}판) ═══\n`);
console.log(`── 아무거나 내보낸다   평균 ${blind.avg}R · 최고등급 ${blind.grade}`);
console.log(`   ${blind.seq.join(" · ")}`);
console.log(`── 센 것을 골라 내보낸다 평균 ${smart.avg}R · 최고등급 ${smart.grade}`);
console.log(`   ${smart.seq.join(" · ")}`);
console.log(`── 골라 내보내고 + 자원을 쓴다 평균 ${growth.avg}R`);
console.log(`   ${growth.seq.join(" → ")}\n`);

const chk = (n, ok, d) => console.log(`${ok ? "✓" : "✗"} ${n}${d ? "  — " + d : ""}`);
console.log("── 판정 ──");
chk("무엇을 내보내느냐가 결과를 바꾼다 (이 구조의 존재 이유)", smart.avg > blind.avg + 3,
    `아무거나 ${blind.avg}R → 골라 내보내면 ${smart.avg}R`);
// **징집은 중급(2)까지만 나온다 — 상급(3)은 합성으로만 닿는다.** 그래서 평균이 2.5 근처에서
// 출렁이던 옛 기준 대신 "상급에 닿았는가"를 본다: 3 이상이면 같은 것 셋을 합친 적이 있다는 증거다.
chk("합성으로 등급이 오른다", smart.peak >= 3, `최고 ${smart.peak}등급 도달 (평균 ${smart.grade})`);
const f = growth.seq.slice(0,2).reduce((a,b)=>a+b,0)/2, l = growth.seq.slice(-2).reduce((a,b)=>a+b,0)/2;
chk("판을 거듭하면 더 간다 (자원)", l >= f, `처음 2판 ${f.toFixed(1)}R → 마지막 2판 ${l.toFixed(1)}R`);
chk("첫 벽이 너무 이르지 않다", smart.avg >= 7, `${smart.avg}R`);
chk("예외 없이 돈다", errors.length === 0, errors.slice(0,2).join(" | ").slice(0,150));
ws.close(); process.exit(0);

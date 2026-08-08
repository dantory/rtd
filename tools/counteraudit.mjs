/** **예고를 읽고 갈아 끼우는 것이 이득인가.**
 *
 *  상성을 수치로 넣었다고 그것이 곧 결정이 되지는 않는다. "방패가 온다"를 읽고 저격수를
 *  넣었을 때 실제로 더 가야만 배치 화면을 열 이유가 생긴다 — 안 재면 넣어 놓고 됐다고
 *  믿는 것뿐이다(이 게임에서 이미 냉동병이 그렇게 +0.3R 로 죽어 있었다).
 *
 *  같은 씨앗·같은 부대로 봇 둘을 나란히 돌린다.
 *    힘   — 등급·피해가 높은 순 (게임의 「추천 배치」와 같은 기준)
 *    상성 — 같은 기준에 **다음 웨이브에 유리한 종류**를 얹어서 고른다
 *  둘의 차이가 곧 "예고가 읽을 값이 있는 글인가"의 답이다.
 *
 *      node tools/counteraudit.mjs [판수]
 */
const RUNS = Number(process.argv[2] || 8);

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
/* **캐시를 끈다.** 안 끄면 고친 모듈이 아니라 예전 것을 재는 수가 있다 —
   실제로 RARITY 표를 세 번 바꿨는데 결과가 한 자리도 안 변해서 알아챘다. */
await send("Network.enable"); await send("Network.setCacheDisabled", { cacheDisabled: true });
await send("Page.navigate", { url: "http://127.0.0.1:8772/index.html" });
await new Promise(r => setTimeout(r, 1000));

const play = (useCounter) => `(() => {
  { let __s = 0x1a2b3c4d; Math.random = () => {
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

  /* 다음 웨이브가 무엇에 약한지 → 어떤 공격이 유리한지. combat.js 의 MOBWEAK 과 같은 뜻을
     **유닛 쪽 언어**로 옮긴 것이다: 느리게 / 한 방 / 범위 / 관통·연사. */
  const need = (r) => {
    const set = new Set();
    for (const k of new Set(wavePool(r))) {
      if (k === "runner") set.add("slow");
      if (k === "brute")  set.add("big");
      if (k === "swarm")  set.add("area");
      if (k === "shield") set.add("pierce");
    }
    return set;
  };
  /* **피해 숫자만으로는 안 보이는 값**을 얹는다. 두 갈래다.
       ① 역할 — 느리게·방어·회복·지휘는 피해가 낮아 힘으로 고르면 영영 안 뽑힌다. 그런데
          실제로 재 보니 냉동병 한 자리가 두꺼움 웨이브에서 입는 피해를 648 → 36 으로 줄인다.
       ② 상성 — 이번 테마에 유리한 공격(MOBWEAK 과 짝).
     이 둘을 아는 사람과 모르는 사람의 차이가 곧 "배치가 결정인가"의 답이다. */
  const bonus = (t, nd) => {
    const K = KINDS[t.kind]; let b = 1;
    if (K.slow)  b *= 3;      // 느리게 — 어느 웨이브든 입는 피해를 절반 아래로 끌어내린다
    if (K.armor) b *= 2;      // 방패병
    if (K.heal)  b *= 2;      // 위생병
    if (K.aura)  b *= 2;      // 지휘관
    if (nd.has("area")   && (K.splash || K.chain)) b *= 2;
    if (nd.has("pierce") && K.pierce) b *= 2.5;        // 방패 여덟 대를 통째로 건너뛴다
    if (nd.has("pierce") && K.cd <= 0.6) b *= 1.5;     // 연사는 방패를 빨리 벗긴다
    if (nd.has("big")    && K.dmg >= 30) b *= 1.6;
    return b;
  };

  const arrange = (r) => {
    const nd = ${useCounter} ? need(r) : new Set();
    /* **역할은 곱으로 못 센다.** 냉동병의 값은 피해가 아니라 "입는 피해가 준다"라서,
       피해에 배수를 얹는 식으로는 등급 계단(×3)에 영영 못 미친다(3배를 줘도 안 뽑혔다).
       그래서 한 자리를 **떼어 준다** — 사람이 "느리게 하나는 넣고 본다"고 아는 것 그대로다. */
    /* 실측(diag)으로 값이 큰 순서: 위생병(입는 피해 4296→6) · 냉동병(→2262) · 방패병.
       자리가 셋뿐이면 하나만, 넷 이상이면 둘까지 떼어 준다 — 다 떼면 때릴 것이 없어진다. */
    const roleRank = (t) => (KINDS[t.kind].heal ? 3 : KINDS[t.kind].slow ? 2 : KINDS[t.kind].armor ? 1 : 0);
    const support = ${useCounter}
      ? META.army.filter(t => roleRank(t) > 0)
          .sort((a,b) => roleRank(b) - roleRank(a) || dmgOf(b) - dmgOf(a))
          .slice(0, slotMax() >= 4 ? 2 : 1)
      : [];
    /* **등급을 사전식으로 두면 상성이 절대 못 이긴다.** g*1e6 을 쓰면 등급 하나 차이가
       10^6 이라 어떤 배수도 그 계단을 못 넘어, 봇이 사실상 상성을 안 본다(그래서 -1R 이 나왔다).
       dmgOf 는 이미 등급을 ×3 씩 품고 있으므로 그것만으로 힘의 순서가 선다. */
    const score = (t) => dmgOf(t) * bonus(t, nd);
    META.army.forEach(t => { t.slot = null; });
    const seen = new Set();
    support.forEach((t, i) => { t.slot = i; seen.add(t.kind); });
    for (const t of META.army.slice().sort((a,b) => score(b) - score(a))) {
      const f = freeSlots(); if (!f.length) break;
      if (seen.has(t.kind)) continue;
      t.slot = f[0]; seen.add(t.kind);
    }
    syncArmy();
  };

  const runs = [];
  for (let run = 0; run < ${RUNS}; run++) {
    let r = 0; while (META.relics >= recruitCost() && r++ < 40) recruit();
    newGame();
    S.auto = false; S.gap = 0; S.autoRun = false;
    let g = 0;
    while (!S.over && S.round <= 60 && g++ < 400) {
      arrange(S.round);                 // **라운드마다 다시 고른다** — 그게 예고를 읽는다는 뜻이다
      startWave();
      let t = 0; while (S.running && t < 300) { tick(1/30); t += 1/30; }
      if (S.running) break;
    }
    runs.push(S.round);
    // 자원은 양쪽 다 같은 순서로 쓴다 — 재려는 축은 배치 하나다
    let k = 0;
    while (k++ < 30) {
      const ups = Object.keys(UPGRADES).filter(x => META.relics >= upCost(x)).map(x => ({k:x, c:upCost(x), t:0}));
      const trs = KIND_IDS.filter(x => META.seen[x] && META.relics >= kindCost(x)).map(x => ({k:x, c:kindCost(x), t:1}));
      const key = [...ups, ...trs].sort((a,b) => a.c - b.c)[0];
      if (!key) break; META.relics -= key.c;
      if (key.t) META.lv[key.k]++; else META.up[key.k]++;
    }
    saveMeta();
  }
  const avg = a => +(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1);
  return { seq: runs, avg: avg(runs) };
})()`;

const power   = await ev(play(false));
const counter = await ev(play(true));

console.log(`\n═══ 상성 심사 (각 ${RUNS}판, 같은 씨앗) ═══\n`);
console.log(`── 힘만 본다 (「추천 배치」와 같은 기준)  평균 ${power.avg}R`);
console.log(`   ${power.seq.join(" · ")}`);
console.log(`── 예고와 역할을 읽고 고른다             평균 ${counter.avg}R`);
console.log(`   ${counter.seq.join(" · ")}`);
const gain = +(counter.avg - power.avg).toFixed(1);
/* **초반 판은 아무리 잘 알아도 고를 것이 없다.** 종류가 넷만 열려 있고 부대도 서너 기라
   두 봇의 배치가 글자 그대로 같다(실제로 앞 네 판이 늘 동일하게 나온다). 아는 것이 값을
   하기 시작하는 건 부대가 갖춰진 뒤라, 판정은 **뒤 절반**으로 본다. */
const half = a => a.slice(Math.floor(a.length / 2));
const avg = a => +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1);
const lp = avg(half(power.seq)), lc = avg(half(counter.seq));
const late = +(lc - lp).toFixed(1);
console.log(`\n전체 차이 ${gain > 0 ? "+" : ""}${gain}R · 부대가 갖춰진 뒤(뒤 절반) ${late > 0 ? "+" : ""}${late}R`);
const ok = late >= 1.5;
console.log(`${ok ? "✓" : "✗"} 예고와 역할을 읽고 고르면 더 간다  — 뒤 절반 ${lp}R → ${lc}R`);
console.log(`${errors.length === 0 ? "✓" : "✗"} 예외 없이 돈다${errors.length ? "  — " + errors.slice(0,2).join(" | ").slice(0,150) : ""}`);
ws.close(); process.exit(0);

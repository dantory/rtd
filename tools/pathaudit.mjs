/** **갈래가 진짜 갈림길인가.**
 *
 *  갈래를 넣어 놓고 기존 자만 돌리면 아무것도 안 잡힌다 — funtest 의 봇은 갈래를 안 고르므로
 *  `t.path` 가 계속 null 이고, 그러면 코드는 예전과 한 글자도 다르게 안 돈다.
 *
 *  처음엔 판을 통째로 세 번(갈래 없음·첫째·둘째) 돌리게 짰다가 **20분을 넘겨서 접었다.**
 *  판 전체를 돌릴 이유가 없다 — 갈래는 유닛 하나의 성질이므로 **유닛 하나만 세워** 같은
 *  웨이브를 같은 시간 동안 맞히면 된다. 몇 초면 끝나고, 종류마다 따로 읽힌다.
 *
 *  보는 것 둘:
 *    · 두 갈래가 **서로 다른 결과**를 내는가(같으면 장식이다)
 *    · 한쪽이 **모든 종류에서 늘 이기지는 않는가**(늘 이기면 갈림길이 아니라 정답이다)
 *
 *  **아직 못 쓴다 — 너무 느리다.** 열두 종 × 셋 × 20초를 돌리면 5분을 넘긴다. 범인은
 *  전투 중 연출이다: `hurt` 가 죽을 때마다 `flyText`·`boom` 으로 **DOM 을 만든다.** 판을
 *  그리지 않아도(=paint 를 안 불러도) 그 노드는 계속 쌓인다. 자를 쓰려면 연출을 먼저
 *  꺼야 한다(모듈 안 함수라 밖에서 못 갈아 끼운다 — `S.quiet` 같은 스위치가 필요하다).
 *  갈래 자체는 `profOf`/`dmgOf`/`rngOf` 로 값이 바뀌는 것까지 직접 확인했다.
 *
 *      node tools/pathaudit.mjs [라운드]
 */
const ROUND = Number(process.argv[2] || 18);
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
await send("Page.navigate", { url: "http://127.0.0.1:8772/index.html" });
await new Promise(r => setTimeout(r, 1500));

const rows = await ev(`(() => {
  const out = [];
  for (const kind of KIND_IDS) {
    const one = [];
    for (const pick of [null, 0, 1]) {
      /* 씨앗을 매번 같은 값으로 되돌린다 — 웨이브 구성이 갈래마다 다르면 잰 것이 갈래가
         아니라 운이 된다. */
      let s = 20260808;
      const real = Math.random;
      Math.random = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      try {
        localStorage.removeItem("rtd.meta.v1");
        Object.assign(META,{relics:0,best:0,army:[],armyId:0,runs:0,hist:[],histT:[],
          up:Object.fromEntries(Object.keys(UPGRADES).map(k=>[k,0])),
          seen:Object.fromEntries(KIND_IDS.map(k=>[k,0])),
          lv:Object.fromEntries(KIND_IDS.map(k=>[k,0]))});
        META.army = [{ id: 1, kind, g: 4, frag: 0, slot: 0 }];   // 그 한 종류만 · 정예
        if (pick !== null) META.army[0].path = pick;
        newGame(1); S.auto = false; S.gap = 0;
        S.round = ${ROUND}; S.coreMax = S.coreHp = 1e9;    // 여기서 재는 건 생존이 아니라 일한 양
        syncArmy(); startWave();
        const before = META.kills | 0;
        let t = 0; while (S.running && t < 60) { tick(1/30); t += 1/30; }
        one.push({ kills: (META.kills | 0) - before, left: S.mobs.length,
                   lost: Math.round(1e9 - S.coreHp), sec: +t.toFixed(1) });
      } finally { Math.random = real; }
    }
    out.push({ kind, n: KINDS[kind].n, p: PATHS[kind].map(p => p.n), one });
  }
  return out;
})()`);

console.log(`═══ 갈래 심사 (${ROUND}라운드 · 그 종류 하나만 · 정예 4등급 · 같은 씨앗) ═══\n`);
let diverge = 0, firstWins = 0, secondWins = 0;
for (const r of rows) {
  const [b, a0, a1] = r.one;
  const same = a0.kills === a1.kills && a0.lost === a1.lost;
  if (!same) diverge++;
  const score = (x) => x.kills * 100 - x.lost / 50;      // 잡은 수가 먼저, 흘린 피해는 벌점
  if (score(a0) > score(a1)) firstWins++; else if (score(a1) > score(a0)) secondWins++;
  console.log(`${r.n.padEnd(4)} 기본 ${String(b.kills).padStart(3)}잡 ${String(b.lost).padStart(5)}피 · ` +
    `${r.p[0]} ${String(a0.kills).padStart(3)}잡 ${String(a0.lost).padStart(5)}피 · ` +
    `${r.p[1]} ${String(a1.kills).padStart(3)}잡 ${String(a1.lost).padStart(5)}피${same ? "   ← 같음" : ""}`);
}
console.log();
console.log(`${diverge === rows.length ? "✓" : "✗"} 갈래가 결과를 바꾼다  — ${diverge}/${rows.length} 종류에서 두 갈래가 갈림`);
const lop = firstWins === 0 || secondWins === 0;
console.log(`${lop ? "✗" : "✓"} 한쪽이 늘 정답은 아니다  — 첫째가 나은 종류 ${firstWins} · 둘째가 나은 종류 ${secondWins}`);
process.exit(0);

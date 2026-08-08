/** 날 경계 선이 **제대로 서는가** — #hist 의 .hb.day 를 세고 자리를 잰다.
 *
 *  재는 것 셋:
 *   1) 날이 바뀌는 자리에만 선다 (네 무리로 심으면 선은 셋)
 *   2) 선이 막대 사이 **틈**에 든다 — 막대를 덮으면 판을 잘못 읽는다
 *   3) 시각 없는 옛 세이브(histT 가 0)에는 한 줄도 안 긋는다 — 없던 날을 지어내지 않는다
 *
 *      node tools/histday.mjs      # serve.mjs(8772) + 크롬(9333)
 */
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find(x => x.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;

await send("Page.navigate", { url: "http://127.0.0.1:8772/index.html?fresh=1" });
await new Promise(r => setTimeout(r, 1400));

/* 최근이 앞. 오늘 5판 · 어제 10판 · 2일 전 4판 · 3일 전 5판 → 경계는 셋 */
const seed = (withT) => `(() => {
  META.runs=64; META.kills=9000; META.best=31;
  META.hist=Array.from({length:24},(_,i)=>12+((i*7)%16));
  const D=864e5, day=n=>Date.now()-n*D+36e5;   // 자정 넘김을 피해 정오께로 심는다
  META.histT=${withT}
    ? [...Array(5).fill(day(0)),...Array(10).fill(day(1)),...Array(4).fill(day(2)),...Array(5).fill(day(3))]
    : Array(24).fill(0);
  META.epochs=[{n:10,sum:40,max:6},{n:10,sum:70,max:9}];
  drawShop(); document.getElementById('forge').classList.add('on');
  const bars=[...document.querySelectorAll('#hist .hb:not(.old)')];
  const marks=bars.map((b,i)=>({i,day:b.classList.contains('day')})).filter(x=>x.day).map(x=>x.i);
  /* 선은 막대 왼쪽 -2px 자리. 앞 막대 오른쪽 끝보다 오른쪽에, 제 막대 왼쪽 끝보다 왼쪽에 있어야 틈이다 */
  const inGap=marks.every(i=>{
    const r=bars[i].getBoundingClientRect(), p=bars[i-1].getBoundingClientRect();
    return r.left-2>=p.right-0.5 && r.left-1<=r.left;
  });
  return JSON.stringify({bars:bars.length, lines:marks, inGap});
})()`;

const withT = JSON.parse(await ev(seed(true)));
const noT = JSON.parse(await ev(seed(false)));
const ok = withT.bars === 24 && withT.lines.length === 3 && withT.inGap && noT.lines.length === 0;
console.log("시각 있음", withT);
console.log("시각 없음", noT);
console.log(ok ? "✓ 날 경계 — 무리 넷에 선 셋, 틈 안, 옛 세이브엔 없음" : "✗ 날 경계");
ws.close();
process.exit(ok ? 0 : 1);

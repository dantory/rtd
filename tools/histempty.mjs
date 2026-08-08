/** 첫 사람의 기록 화면이 **비어 있지 않은가** — 예시 그래프를 잰다.
 *
 *  재는 것 넷:
 *   1) 한 판도 안 끝냈으면 예시 막대가 선다 (열넉 칸, 마지막이 호박색)
 *   2) 「예시」 글자가 그래프 위에 얹힌다 — 없으면 제 기록으로 읽힌다
 *   3) 예시는 **안 눌린다** — 눌러서 뜻풀이가 바뀌면 진짜 막대처럼 보인다
 *   4) 한 판이라도 끝나면 예시가 **통째로 사라진다** (진짜 막대만)
 *
 *      node tools/histempty.mjs      # serve.mjs(8772) + 크롬(9333)
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

const probe = seed => `(() => {
  ${seed}
  drawShop(); document.getElementById('forge').classList.add('on');
  const h=document.getElementById('hist');
  const gh=[...h.querySelectorAll('.hb.gh')], real=[...h.querySelectorAll('.hb:not(.gh)')];
  const lab=h.querySelector('.ghlab');
  const lg=document.getElementById('histLegend');
  const before=lg.innerHTML;
  /* 예시 막대를 눌러 본다 — pointer-events:none 이면 클릭이 .hist 로 떨어져 뜻풀이가 그대로여야 한다 */
  if (gh[0]) gh[0].dispatchEvent(new MouseEvent('click',{bubbles:true}));
  const after=lg.innerHTML;
  const r=lab?lab.getBoundingClientRect():null, hr=h.getBoundingClientRect();
  return JSON.stringify({
    ghost:gh.length, real:real.length,
    amberLast: gh.length? gh[gh.length-1].classList.contains('nw') : false,
    label: lab? lab.textContent.trim() : "",
    onGraph: r? (r.top>=hr.top-1 && r.bottom<=hr.bottom+1 && r.left>=hr.left-1 && r.right<=hr.right+1) : false,
    inert: before===after,
    legend: lg.textContent.trim(),
    note: document.getElementById('statNote').textContent.trim(),
  });
})()`;

const empty = JSON.parse(await ev(probe(
  `META.runs=0; META.kills=0; META.best=0; META.hist=[]; META.histT=[]; META.epochs=[];`)));
const played = JSON.parse(await ev(probe(
  `META.runs=1; META.kills=40; META.best=9; META.hist=[9]; META.histT=[Date.now()]; META.epochs=[];`)));

const ok = empty.ghost === 14 && empty.real === 0 && empty.amberLast && empty.label === "예시"
  && empty.onGraph && empty.inert && empty.legend.includes("예시")
  && played.ghost === 0 && played.real === 1 && !played.label;

console.log("빈 세이브  ", empty);
console.log("한 판 끝냄", played);
console.log(ok ? "✓ 빈 기록 — 예시 열넉 칸이 서고, 안 눌리고, 첫 판에 사라진다" : "✗ 빈 기록");
ws.close();
process.exit(ok ? 0 : 1);

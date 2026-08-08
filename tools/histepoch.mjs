/** 접힌 옛 묶음이 **언제 것인지** 말하는가 — foldHist 가 t0·t1 을 담고, 막대 설명이 그걸 읽는지.
 *
 *  「옛 10판 평균」이 두 달 전 것인지 어제 것인지가 어디에도 안 적혀 있었다(자체 검수).
 *  시각 없던 옛 세이브는 그냥 「옛 」로 남아야 한다 — 없던 날짜를 지어내지 않는다.
 *  뜻풀이 줄이 길어져 두 줄로 접히는지도 320px 에서 같이 잰다.
 *
 *      node tools/histepoch.mjs      # serve.mjs(8772) + 크롬(9333)
 */
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find(x => x.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;

await send("Emulation.setDeviceMetricsOverride", { width: 320, height: 800, deviceScaleFactor: 1, mobile: true });
await send("Page.navigate", { url: "http://127.0.0.1:8772/index.html?fresh=1" });
await new Promise(r => setTimeout(r, 1400));

const out = JSON.parse(await ev(`(() => {
  const D = 864e5, now = Date.now(), R = [];
  const say = t => t;
  /* ── 1. 시각이 있는 44판: 앞 20판이 접혀 두 묶음이 된다 ── */
  // hist 는 최근이 앞. i=0 이 방금 판, i=43 이 제일 옛 판(43일 전).
  META.hist = Array.from({length:44},(_,i)=>10+(i%9));
  META.histT = Array.from({length:44},(_,i)=>now - i*D);
  META.epochs = [];
  foldHist(META);
  R.push({t:"접힘", hist:META.hist.length, histT:META.histT.length, eps:META.epochs.map(e=>[e.n, e.t0>0, e.t1>0, Math.round((e.t1-e.t0)/D)])});
  drawStats();
  const olds = [...document.querySelectorAll('#hist .hb.old')].map(b=>b.dataset.say);
  R.push({t:"막대말", olds});

  /* ── 2. 시각 없는 옛 세이브: 「옛 」로 남는가 ── */
  META.hist = Array.from({length:44},(_,i)=>10+(i%9));
  META.histT = []; META.epochs = [];
  foldHist(META);
  drawStats();
  R.push({t:"시각없음", olds:[...document.querySelectorAll('#hist .hb.old')].map(b=>b.dataset.say)});

  /* ── 3. 묶음이 EPOCH_MAX(12)를 넘겨 합쳐질 때 범위가 살아남는가 ── */
  META.hist = Array.from({length:24+130},(_,i)=>10+(i%9));
  META.histT = Array.from({length:24+130},(_,i)=>now - i*D);
  META.epochs = [];
  foldHist(META);
  R.push({t:"합침", n:META.epochs.length, first:[META.epochs[0].n, Math.round((META.epochs[0].t1-META.epochs[0].t0)/D)],
          older: META.epochs[0].t0 < META.epochs[META.epochs.length-1].t0});

  /* ── 4. 뜻풀이 줄: 막대를 눌렀을 때 320px 에서 몇 줄인가 ── */
  META.hist = Array.from({length:44},(_,i)=>10+(i%9));
  META.histT = Array.from({length:44},(_,i)=>now - i*D*3);
  META.epochs = []; META.runs=64; META.kills=9000; META.best=31;
  foldHist(META); drawShop();
  // 뜻풀이 줄은 **펼쳐진 칸에서만** 폭을 가진다 — 안 열면 높이가 0 이라 줄 수 재기가 헛돈다
  document.getElementById('forge').classList.add('on');
  drawStats();
  const lg = document.getElementById('histLegend');
  const base = Math.round(lg.getBoundingClientRect().height);
  document.querySelector('#hist .hb.old').click();
  const rd = lg.querySelector('.rd');
  R.push({t:"뜻풀이", base, pressed:Math.round(lg.getBoundingClientRect().height),
          lines: rd ? Math.round(rd.getBoundingClientRect().height/13) : 0, say: rd ? rd.textContent : null});
  return JSON.stringify(R);
})()`));

for (const r of out) console.log(JSON.stringify(r));
const fail = [];
const eps1 = out[0].eps;
if (out[0].hist !== 24 || out[0].histT !== 24) fail.push("hist/histT 가 24 로 안 잘림");
if (!eps1.length || !eps1.every(e => e[1] && e[2])) fail.push("t0/t1 이 안 담김");
if (!out[1].olds.every(s => /전/.test(s))) fail.push("막대 설명에 시각이 안 나옴: " + out[1].olds[0]);
if (!out[2].olds.every(s => s.startsWith("옛 "))) fail.push("시각 없는 묶음이 「옛 」이 아님: " + out[2].olds[0]);
if (out[3].first[0] < 20 || out[3].first[1] < 15) fail.push("합친 묶음의 범위가 죽음");
if (!out[3].older) fail.push("왼쪽 묶음이 더 옛것이 아님");
if (out[4].lines > 1) fail.push("뜻풀이가 두 줄로 접힘: " + out[4].say);
console.log(fail.length ? "✗ " + fail.join(" / ") : "✓ 접힌 묶음이 언제 것인지 말한다");

/* 폰 흉내를 반드시 벗긴다 — 안 벗기면 뒤에 도는 funtest 가 320px 화면에서 돌아 엉뚱한 판정을 낸다 */
await send("Emulation.clearDeviceMetricsOverride");
ws.close();
process.exit(fail.length ? 1 : 0);

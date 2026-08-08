/** 밑줄의 「첫 N판 평균」이 **언제의 첫 판인지** 말하는가.
 *
 *  묶음이 든 시각은 막대를 눌러야만 뜨는 설명 안에만 있었다(자체 검수) — 밑줄에도 붙여
 *  안 눌러도 읽히게 했다. 시각을 안 들고 있던 옛 세이브엔 괄호가 안 붙어야 한다.
 *  320px 에서 밑줄이 몇 줄로 접히는지도 같이 잰다(세 줄을 넘으면 도로 길어진 것).
 *
 *      node tools/histfirst.mjs      # serve.mjs(8772) + 크롬(9333)
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
  const setup = (histT) => {
    META.hist = Array.from({length:44},(_,i)=>10+(i%9));
    META.histT = histT; META.epochs = [];
    META.runs = 64; META.kills = 9000; META.best = 31; META.firstRun = now - 43*D;
    foldHist(META); drawShop();
    document.getElementById('forge').classList.add('on');   // 접힌 칸은 폭이 0 이라 줄 수를 못 잰다
    drawStats();
    const n = document.getElementById('statNote');
    return { html: n.innerHTML, text: n.textContent,
             lines: Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight)) };
  };
  /* ── 1. 시각이 있는 세이브: 첫 묶음에 시기가 붙는가 ── */
  R.push({t:"시각있음", ...setup(Array.from({length:44},(_,i)=>now - i*D))});
  /* ── 2. 아주 오래된 세이브: 「달 전」 셈씨가 붙는가 ── */
  R.push({t:"오래됨", ...setup(Array.from({length:44},(_,i)=>now - i*D*3))});
  /* ── 3. 시각 없는 옛 세이브: 괄호가 안 붙어야 한다 ── */
  R.push({t:"시각없음", ...setup([])});
  return JSON.stringify(R);
})()`));

let bad = 0;
const say = (ok, m) => { if (!ok) bad++; console.log(`${ok ? "✓" : "✗"} ${m}`); };
for (const r of out) {
  const m = /첫 (\d+)판(\(([^)]+)\))? 평균/.exec(r.text);
  if (r.t === "시각없음") {
    say(!!m && !m[2], `${r.t} — 괄호 없음 (${m ? m[0] : "줄 자체가 없다"})`);
  } else {
    say(!!m && !!m[3], `${r.t} — 시기가 붙는다 (${m ? m[0] : "없음"})`);
    say(!!m && !/^(옛|undefined|NaN)/.test(m[3] || "x"), `${r.t} — 지어낸 말이 아니다 (${m?.[3]})`);
  }
  say(r.lines <= 3, `${r.t} — 320px 에서 ${r.lines}줄 (3줄 이내)`);
}
console.log(bad ? `\n✗ ${bad}건` : "\n✓ 다 통과");
ws.close();
process.exit(bad ? 1 : 0);

/** 뜻풀이 줄이 **한 줄에 드는가** — 폭 넷에서 #histLegend 자식들의 top 을 세어 잰다.
 *
 *  두 줄로 접히면 맨 뒤의 「눌러서 그 판」이 밀려 내려가 안 읽힌다. 눈으로는 못 잡는다 —
 *  넉 장이 다 뜨는 건 **최고 기록 표시가 있을 때뿐**이라, 옛 묶음의 max 를 낮게 깔아야
 *  재현된다(그걸 몰라 처음엔 "안 접힌다"로 잘못 읽었다).
 *  옛 묶음의 바램(멀수록 흐리게)도 같이 찍는다.
 *
 *      node tools/histlegend.mjs      # serve.mjs(8772) + 크롬(9333)
 */
const list = await (await fetch("http://127.0.0.1:9333/json/list")).json();
const ws = new WebSocket(list.find(x => x.type === "page").webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0; const pend = new Map();
ws.onmessage = e => { const m = JSON.parse(e.data); if (pend.has(m.id)) { pend.get(m.id)(m.result); pend.delete(m.id); } };
const send = (m, params = {}) => new Promise(res => { const i = ++id; pend.set(i, res); ws.send(JSON.stringify({ id: i, method: m, params })); });
const ev = async x => (await send("Runtime.evaluate", { expression: x, returnByValue: true, awaitPromise: true }))?.result?.value;

for (const w of [320, 360, 390, 430]) {
  await send("Emulation.setDeviceMetricsOverride", { width: w, height: 800, deviceScaleFactor: 1, mobile: true });
  await send("Page.navigate", { url: "http://127.0.0.1:8772/index.html?fresh=1" });
  await new Promise(r => setTimeout(r, 1400));
  const out = await ev(`(() => {
    META.runs=64; META.kills=9000; META.best=31;
    META.hist=Array.from({length:24},(_,i)=>12+((i*7)%16));
    META.epochs=[{n:10,sum:40,max:6},{n:10,sum:70,max:9},{n:10,sum:100,max:12},{n:10,sum:130,max:15}];
    drawShop(); document.getElementById('forge').classList.add('on');
    const l=document.getElementById('histLegend'), r=l.getBoundingClientRect();
    const kids=[...l.children].map(c=>Math.round(c.getBoundingClientRect().top));
    const lines=new Set(kids).size;
    const bars=[...document.querySelectorAll('#hist .hb.old')].map(b=>Math.round(b.getBoundingClientRect().width)+'/'+getComputedStyle(b).opacity);
    return JSON.stringify({h:Math.round(r.height), lines, old:bars});
  })()`);
  console.log(w, out);
}
/* **폰 흉내를 반드시 벗긴다.** 안 벗기면 이 자 뒤에 도는 funtest 가 320px 화면에서 돌아
   엉뚱한 판정을 낸다 — 브라우저는 아홉시간씩 떠 있는 공용이다. */
await send("Emulation.clearDeviceMetricsOverride");
ws.close();

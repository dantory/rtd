/** **예고가 몇 판 앞서 이름을 대는가.**
 *
 *  이름은 대게 됐지만(namedwarn.mjs) 뜨는 때가 24R 을 마치고 나서였다 — 25R 짜리에 맞춰
 *  갈아 끼우려면 자원·합성이 몇 판 필요하니 그건 아직 준비할 시간이 아니다.
 *
 *  재는 것 다섯:
 *   1) 20~24R 예고에 **「N R 뒤 <이름>」**이 뜬다 (머리줄 · 배치 화면 둘 다)
 *   2) 남은 판 수가 맞다 (24R 이면 1R 뒤, 20R 이면 5R 뒤)
 *   3) 다섯 판 밖(19R)에는 **안 뜬다** — 늘 떠 있으면 배경이 된다
 *   4) 코앞(25R)에는 **겹쳐 안 뜬다** — 위 칩이 이미 이름을 대고 있다
 *   5) 320px 에서 안 접히고 머리줄 밖으로 안 샌다
 *
 *      node tools/namedsoon.mjs      # serve.mjs(8772)
 */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

/* [라운드, 기대하는 남은 판 수 (null = 안 떠야 함)] */
const CASES = [[19, null], [20, 5], [22, 3], [24, 1], [25, null], [48, 2], [73, 2]];

const probe = (r) => `(() => {
  S.over = false; S.running = false; S.round = ${r};
  refresh(); openSquad();
  const bar = document.getElementById('wavebar');
  const el  = bar.querySelector('.namedsoon');
  const sq  = document.getElementById('sqWave').textContent.trim();
  const ns  = namedSoon(${r});
  if (!el) return { round:${r}, el:false, want: ns, sq: sq.slice(0, 70) };
  const cs = getComputedStyle(el), er = el.getBoundingClientRect(), br = bar.getBoundingClientRect();
  return {
    round:${r}, el:true, want: ns,
    text: el.textContent.trim(),
    font: Math.round(parseFloat(cs.fontSize) * 10) / 10,
    spill: Math.round(er.right - br.right),
    sqHas: ns ? sq.includes(ns.away + "R 뒤") && sq.includes(ns.nb.n) : false,
    sq: sq.slice(0, 70),
  };
})()`;

const b = await chromium.launch();
let bad = 0;
for (const W of [320, 430]) {
  const p = await b.newPage({ viewport: { width: W, height: 860 } });
  await p.goto("http://127.0.0.1:8772/", { waitUntil: "networkidle" });
  await p.waitForTimeout(900);

  for (const [r, away] of CASES) {
    const x = await p.evaluate(probe(r));
    const fail = [];
    if (away === null) {
      if (x.el) fail.push(`떠서는 안 되는데 떴다 —「${x.text}」`);
    } else if (!x.el) fail.push(`칩이 없다 — ${away}R 뒤를 안 알린다`);
    else {
      if (!x.text.startsWith(`${away}R 뒤`)) fail.push(`남은 판이 어긋난다(${x.text})`);
      if (!x.want || !x.text.includes(x.want.nb.n)) fail.push(`이름이 어긋난다(${x.text})`);
      if (!(x.font > 8)) fail.push(`접혔다 ${x.font}px`);
      if (x.spill > 0) fail.push(`머리줄 밖으로 +${x.spill}px`);
      if (!x.sqHas) fail.push(`배치 화면이 안 알린다(${x.sq})`);
    }
    if (fail.length) bad++;
    console.log(`${fail.length ? "✗" : "✓"} ${W}px ${String(r).padStart(2)}R  ` +
      `「${x.text || "—"}」` + (fail.length ? "   ← " + fail.join(" / ") : ""));
  }
  await p.close();
}
await b.close();
console.log(bad ? `\n✗ ${bad}건` : "\n✓ 몇 판 앞선 예고가 제때 뜨고 제때 조용하다");
process.exit(bad ? 1 : 0);

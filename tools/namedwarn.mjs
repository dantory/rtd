/** **예고가 이름 있는 놈이 오는 줄 말하는가.**
 *
 *  스물다섯 라운드짜리는 준비할 시간을 주는 것이 요점인데, 배너가 뜰 때는 이미 판에 와 있다.
 *  그전까지 예고 칩은 어느 보스든 늘 같은 boss.png 한 장이라 "큰 놈"까지밖에 못 읽었다.
 *
 *  재는 것 다섯:
 *   1) 25·50·75R 예고에 **그놈 이름**이 뜬다 (머리줄 칩 · 배치 화면 첫 줄 둘 다)
 *   2) 셋의 **테 색이 서로 다르다** — 판 위에서 쓰는 색과 같은 색을 쓴다
 *   3) 320px 에서 **안 접힌다** — 종류 이름은 font-size:0 으로 접히는 자리다
 *   4) 칩이 머리줄 밖으로 안 샌다
 *   5) 이름 없는 보스 라운드(20R)에는 안 뜬다 — 늘 뜨면 특별할 것이 없다
 *
 *      node tools/namedwarn.mjs      # serve.mjs(8772)
 */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

const ROUNDS = [25, 50, 75];

/* `nextR` 은 **웨이브가 도는 중이면 다음 라운드**다 — 멈춰 있을 때는 지금 라운드가 곧 예고다.
   S.running 을 끄고 S.round 를 그 라운드에 두면 "이제 곧 이놈" 화면이 된다. */
const probe = (r) => `(() => {
  S.over = false; S.running = false; S.round = ${r};
  refresh(); openSquad();
  const bar = document.getElementById('wavebar');
  const el  = bar.querySelector('.namedwarn');
  const sq  = document.getElementById('sqWave');
  const nb  = namedBoss(${r});
  if (!el) return { round:${r}, el:false, want: nb && nb.n || null, sq: sq.textContent.trim() };
  const cs = getComputedStyle(el), er = el.getBoundingClientRect(), br = bar.getBoundingClientRect();
  return {
    round:${r}, el:true, want: nb && nb.n || null,
    text: el.textContent.trim(),
    font: Math.round(parseFloat(cs.fontSize) * 10) / 10,   // 접히면 0 이 된다
    color: cs.color, border: cs.borderTopColor,
    spill: Math.round(er.right - br.right),                // 머리줄 밖으로 샜나
    sqHas: nb ? sq.textContent.includes(nb.n) : false,
    sq: sq.textContent.trim().slice(0, 60),
  };
})()`;

const b = await chromium.launch();
let bad = 0;
for (const W of [320, 430]) {
  const p = await b.newPage({ viewport: { width: W, height: 860 } });
  await p.goto("http://127.0.0.1:8772/", { waitUntil: "networkidle" });
  await p.waitForTimeout(900);

  const borders = new Set();
  for (const r of ROUNDS) {
    const x = await p.evaluate(probe(r));
    const fail = [];
    if (!x.el) fail.push(`칩이 없다 — 「${x.want}」를 안 알린다`);
    else {
      if (!x.text.includes(x.want)) fail.push(`이름이 어긋난다(${x.text})`);
      if (!(x.font > 8)) fail.push(`접혔다 ${x.font}px`);
      if (x.spill > 0) fail.push(`머리줄 밖으로 +${x.spill}px`);
      if (!x.sqHas) fail.push(`배치 화면이 안 알린다(${x.sq})`);
      borders.add(x.border);
    }
    if (fail.length) bad++;
    console.log(`${fail.length ? "✗" : "✓"} ${W}px ${x.round}R  「${x.text || "—"}」  ` +
      `${x.font || 0}px  테[${x.border || "—"}]` + (fail.length ? "   ← " + fail.join(" / ") : ""));
  }
  if (borders.size && borders.size < ROUNDS.length) {
    bad++; console.log(`✗ ${W}px 테 색이 겹친다 — ${borders.size}종`);
  }

  /* 이름 없는 보스 라운드에는 안 떠야 한다 — 뜨면 "이번엔 그놈"이 뜻을 잃는다. */
  const plain = await p.evaluate(probe(20));
  if (plain.el) { bad++; console.log(`✗ ${W}px 20R 에 이름 칩이 뜬다 —「${plain.text}」`); }
  else console.log(`✓ ${W}px 20R  이름 없는 보스에는 안 뜸`);
  await p.close();
}
await b.close();

console.log(bad ? `\n✗ ${bad}건` : "\n✓ 예고가 그놈 이름을 댄다");
process.exit(bad ? 1 : 0);

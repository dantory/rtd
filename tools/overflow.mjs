/** **화면 밖으로 삐져나온 것을 이름으로 집어낸다.**
 *
 *  "오른쪽이 잘린다"를 눈과 스크린샷으로 쫓다 두 번 헛짚었다. 폭을 제한해도 안 되던 진짜
 *  원인은 grid 아이템의 min-width:auto 였는데, 그건 그림으로는 안 보인다. 그래서 브라우저에게
 *  직접 묻는다 — 지금 화면 폭을 넘는 요소가 무엇이냐.
 *
 *  전장·결과(상점)·편성 **세 화면을 여러 폭에서** 돌린다. 폰마다 폭이 다르고, 넘치는 곳도
 *  화면마다 다르기 때문이다.
 *
 *      node tools/overflow.mjs
 */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

const WIDTHS = [320, 360, 390, 430];
const SCREENS = [
  ["전장", ""],
  ["결과(상점)", `META.relics=40; META.seen.gun=3; META.seen.cannon=2; META.seen.rail=1;
      drawShop(); document.getElementById('over').classList.add('on');`],
  ["편성", `META.relics=200; for(let i=0;i<10;i++) recruit(); refresh(); openSquad();`],
];

const PROBE = `(() => {
  const w = innerWidth, h = innerHeight, bad = [];
  /* **세로는 "나가는 버튼이 보이느냐"로 잰다.**
     내용이 화면보다 긴 것 자체는 문제가 아니다(스크롤하면 된다). 문제는 판을 끝내고
     나가는 버튼이 그 아래로 밀려나 안 보이는 것이다 — 스크롤이 되는 줄 모르면
     그건 그냥 잘린 화면이고, 사람은 게임이 멈췄다고 읽는다. */
  for (const [id, btn] of [["over", "again"], ["squad", "sqClose"]]) {
    const wrap = document.getElementById(id);
    if (!wrap || !wrap.classList.contains("on")) continue;
    const b2 = document.getElementById(btn);
    if (!b2) { bad.push("#" + btn + " 이 없다"); continue; }
    const r2 = b2.getBoundingClientRect();
    if (r2.bottom > h + 1 || r2.top < -1)
      bad.push("#" + btn + " 이 화면 밖이다 [" + Math.round(r2.top) + "~" + Math.round(r2.bottom) + "] / 화면 " + h);
  }
  for (const e of document.querySelectorAll("body *")) {
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > w + 1 || r.left < -1) {
      // 전장 안(#world)은 끌어서 보는 곳이라 넘치는 게 정상이다 — 셈에서 뺀다
      if (e.closest("#world")) continue;
      bad.push((e.tagName.toLowerCase() + "." + (e.className || "")).slice(0, 46)
               + " [" + Math.round(r.left) + "~" + Math.round(r.right) + "]");
    }
  }
  return { w, docW: document.documentElement.scrollWidth, bad: bad.slice(0, 8) };
})()`;

const b = await chromium.launch();
let total = 0;
for (const [name, setup] of SCREENS) {
  for (const w of WIDTHS) {
    const p = await b.newPage({ viewport: { width: w, height: 820 } });
    await p.goto("http://127.0.0.1:8772/", { waitUntil: "networkidle" });
    await p.waitForTimeout(700);
    if (setup) { await p.evaluate(setup); await p.waitForTimeout(400); }
    const r = await p.evaluate(PROBE);
    const over = r.docW > r.w;
    total += r.bad.length;
    console.log(`${name} ${w}px  문서폭 ${r.docW}${over ? " ← 가로 스크롤 생김" : ""}`);
    for (const x of r.bad) console.log("   ✗ " + x);
    await p.close();
  }
}
console.log(total ? `\n삐져나온 것 ${total}개` : "\n다 들어왔다");
await b.close();

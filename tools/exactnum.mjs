/** **줄여 적은 수를 폰에서 읽을 수 있는가.**
 *
 *  「128만」의 원래 수는 `title` 에만 있었다 — 마우스 없는 화면에선 영영 못 읽는다.
 *  붙은 자리가 여섯(기록 두 장 · 자원 셋 · 전투력 둘)이라 자리마다 따로 달면 다음에
 *  하나 더 붙일 때 또 빼먹으므로 손잡이를 하나로 묶었다(`wireExact`).
 *
 *  재는 법: 오래 굴린 사람 수(자원 1,284,000)를 넣고 **화면마다 눌러 본다.**
 *   1) 눌린 수마다 방울이 뜨는가
 *   2) 방울에 쉼표 박힌 정확한 수가 있는가 (줄여 적은 것이 또 나오면 ✗)
 *   3) 방울이 화면 밖으로 나가지 않는가 (320px 에서 오른쪽 끝 숫자)
 *   4) 다른 데를 누르면 사라지는가
 *
 *      node tools/exactnum.mjs      # serve.mjs(8772)
 */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

const WIDTHS = [320, 390];

const SETUP = `(() => {
  document.getElementById('intro').classList.remove('on');   // 첫 사람 안내막이 화면을 덮는다
  META.relics = 1284000; META.kills = 128400; META.runs = 1284;
  META.up = {dmg:60,rate:40,hp:50,slots:6,pool:12,luck:20};
  return true;
})()`;

/* 화면 셋 — 자원 둘·전투력 하나(상점), 기록 두 장, 전투력 하나(배치) */
const SCREENS = {
  상점: `(() => { drawShop(); document.getElementById('forge').classList.add('on'); return true })()`,
  기록: `(() => {                                    // 기록은 상점 안을 내려가면 나온다
    document.getElementById('forge').classList.add('on');
    drawShop();
    document.getElementById('stats').scrollIntoView({block:'center'});
    return true })()`,
  배치: `(() => { document.getElementById('forge').classList.remove('on'); openSquad(); return true })()`,
};

const b = await chromium.launch();
let bad = 0, seen = 0;
for (const w of WIDTHS) {
  const p = await b.newPage({ viewport: { width: w, height: 820 } });
  await p.goto("http://127.0.0.1:8772/", { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  await p.evaluate(SETUP);
  for (const [name, show] of Object.entries(SCREENS)) {
    await p.evaluate(show);
    await p.waitForTimeout(220);
    const els = await p.$$("[data-ex]");
    for (const el of els) {
      const info = await el.evaluate(e => {
        const r = e.getBoundingClientRect();
        // **화면에 실제로 얹혀 있는 것만** 센다 — 상점을 연 채로 뒤에 깔린 기록 칸까지
        // 누르면 재는 것이 화면이 아니게 된다
        const top = r.width && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          ex: e.dataset.ex,
          txt: e.textContent.replace(/\s+/g, " ").trim().slice(0, 20),
          inBtn: !!e.closest("button"),
          vis: !!(top && (e === top || e.contains(top))),
        };
      });
      if (!info.vis || info.inBtn) continue;      // 버튼 안의 수는 버튼이 제 할 일을 한다
      seen++;
      await el.evaluate(e => e.click());
      await p.waitForTimeout(80);
      const bub = await p.evaluate(() => {
        const e = document.getElementById("exbub");
        if (!e) return null;
        const r = e.getBoundingClientRect();
        return { on: e.classList.contains("on"), txt: e.textContent,
                 spill: Math.round(Math.max(0, -r.left, r.right - innerWidth, -r.top)) };
      });
      const fails = [];
      if (!bub || !bub.on) fails.push("방울이 안 뜸");
      else {
        if (bub.txt !== info.ex) fails.push(`방울 「${bub.txt}」 ≠ 「${info.ex}」`);
        if (!/\d,\d/.test(bub.txt)) fails.push(`쉼표 없는 수 「${bub.txt}」`);
        if (bub.spill > 0) fails.push(`방울이 ${bub.spill}px 밖으로`);
      }
      if (fails.length) { bad++; console.log(`  ${w}px ${name} 「${info.txt}」 ✗ ${fails.join(" · ")}`); }
      else console.log(`  ${w}px ${name} 「${info.txt}」 ✓ → ${bub.txt}`);
    }
    // 다른 데를 누르면 사라지는가
    await p.mouse.click(3, 400);
    await p.waitForTimeout(60);
    const still = await p.evaluate(() => {
      const e = document.getElementById("exbub");
      return !!(e && e.classList.contains("on"));
    });
    if (still) { bad++; console.log(`  ${w}px ${name} ✗ 딴 데를 눌러도 방울이 남음`); }
  }
  await p.close();
}
await b.close();
console.log(seen ? `\n${bad ? "✗" : "✓"} 눌린 수 ${seen}자리 · 어긋남 ${bad}` : "\n✗ 눌릴 수를 하나도 못 찾음");
process.exit(bad || !seen ? 1 : 0);

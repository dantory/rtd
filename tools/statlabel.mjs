/** 기록 화면 **숫자 넉 장의 이름표가 한 줄로 서는가.**
 *
 *  「최고 라운드」 한 장만 좁은 폰에서 「최고 / 라운드」로 갈라져, 그 칸만 키가 커지고
 *  넉 장의 밑선이 들쭉날쭉했다. 사람 눈엔 "하나가 삐뚤다"로만 보이고 왜인지는 안 보인다.
 *
 *  재는 것 셋:
 *   1) 이름표 넉 장이 다 **한 줄** — 줄 수는 글자 상자 높이 ÷ 한 줄 높이로 센다
 *   2) 넉 장의 **칸 키가 같다** (1px 안)
 *   3) 이름표가 제 칸 밖으로 안 나간다 (letter-spacing 이 마지막 글자 뒤에 붙는다)
 *
 *      node tools/statlabel.mjs      # serve.mjs(8772)
 */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

const WIDTHS = [320, 360, 390, 430];
/* **숫자가 오래 굴린 사람 것이어야 한다.** 처치 수는 자릿수가 계속 늘어나는 유일한 값이라
   백 판쯤 굴리면 여섯 자리가 된다 — 그때 갈라지면 이름표를 고쳐 놔도 같은 자리가 또 뜬다. */
const SETUP = `META.relics=40; META.best=137; META.runs=482; META.kills=1284000;
  META.hist=[8,12,19,7,24,31,18,22,9,27,33,15,40,11,26,38,20,29,13,35,17,42,23,30];
  drawShop(); document.getElementById('forge').classList.add('on');`;

const PROBE = `(() => {
  const out = [];
  for (const c of document.querySelectorAll('#stats .stc')) {
    const l = c.querySelector('.stl'), v = c.querySelector('.stv');
    const lr = l.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(l).lineHeight) ||
               parseFloat(getComputedStyle(l).fontSize) * 1.2;
    const vr = v.getBoundingClientRect();
    const vlh = parseFloat(getComputedStyle(v).lineHeight) ||
                parseFloat(getComputedStyle(v).fontSize) * 1.2;
    out.push({
      name: l.textContent.trim(),
      val: v.textContent.trim(),
      lines: Math.round(lr.height / lh),
      vLines: Math.round(vr.height / vlh),
      cellW: Math.round(cr.width),
      cellH: Math.round(cr.height),
      /* letter-spacing 은 마지막 글자 뒤에도 붙어서 글자 상자를 칸 밖으로 민다.
         숫자는 「1,284,000」처럼 안 접히는 덩어리라 줄 수만 봐서는 삐져나간 걸 못 잡는다 —
         칸 밖으로 나갔는지를 이름표와 숫자 **둘 다** 잰다(padding 4px 은 봐준다). */
      spill: Math.round(Math.max(0,
        lr.right - (cr.right - 4), (cr.left + 4) - lr.left,
        vr.right - (cr.right - 4), (cr.left + 4) - vr.left)),
    });
  }
  return out;
})()`;

const b = await chromium.launch();
let bad = 0;
for (const w of WIDTHS) {
  const p = await b.newPage({ viewport: { width: w, height: 820 } });
  await p.goto("http://127.0.0.1:8772/", { waitUntil: "networkidle" });
  await p.waitForTimeout(700);
  await p.evaluate(SETUP);
  await p.waitForTimeout(300);
  const cells = await p.evaluate(PROBE);
  const heights = cells.map(c => c.cellH);
  const ragged = Math.max(...heights) - Math.min(...heights) > 1;
  /* 폭도 **✗ 로 센다** — repeat(4,1fr) 이라도 min-width:auto 면 긴 숫자가 제 칸을 넓히고
     옆칸을 빼앗는다(320px 에서 96 / 39 / 65 / 55px). min-width:0 + 줄여 적기(shortNum)
     로 막았으니, 다시 기울면 그건 되돌아간 것이다. */
  const widths = cells.map(c => c.cellW);
  const uneven = Math.max(...widths) - Math.min(...widths) > 2;
  console.log(`${w}px  칸 키 ${heights.join(" / ")}${ragged ? "  ← 들쭉날쭉" : ""}` +
              `  · 칸 폭 ${widths.join(" / ")}${uneven ? "  ← 넉 장이 안 고르다" : ""}`);
  for (const c of cells) {
    const ok = c.lines === 1 && c.vLines === 1 && !ragged && !uneven && c.spill <= 1;
    if (!ok) bad++;
    console.log(`   ${ok ? "✓" : "✗"} ${c.name} (${c.val}) — 이름표 ${c.lines}줄 · 숫자 ${c.vLines}줄` +
                (c.spill > 1 ? ` · 칸 밖 ${c.spill}px` : ""));
  }
  await p.close();
}
console.log(bad ? `\n어긋난 이름표 ${bad}개` : "\n넉 장이 다 한 줄로 나란하다");
await b.close();
process.exit(bad ? 1 : 0);

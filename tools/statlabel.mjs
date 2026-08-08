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
/* 숫자가 길수록 칸이 좁아지지 않는지도 같이 본다 — 넉 자리 처치 수가 실제 값이다 */
const SETUP = `META.relics=40; META.best=137; META.runs=48; META.kills=12840;
  META.hist=[8,12,19,7,24,31,18,22,9,27,33,15,40,11,26,38,20,29,13,35,17,42,23,30];
  drawShop(); document.getElementById('forge').classList.add('on');`;

const PROBE = `(() => {
  const out = [];
  for (const c of document.querySelectorAll('#stats .stc')) {
    const l = c.querySelector('.stl'), v = c.querySelector('.stv');
    const lr = l.getBoundingClientRect(), cr = c.getBoundingClientRect();
    const lh = parseFloat(getComputedStyle(l).lineHeight) ||
               parseFloat(getComputedStyle(l).fontSize) * 1.2;
    out.push({
      name: l.textContent.trim(),
      val: v.textContent.trim(),
      lines: Math.round(lr.height / lh),
      cellH: Math.round(cr.height),
      /* letter-spacing 은 마지막 글자 뒤에도 붙어서 글자 상자를 칸 밖으로 민다 */
      spill: Math.round(Math.max(0, lr.right - (cr.right - 4), (cr.left + 4) - lr.left)),
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
  console.log(`${w}px  칸 키 ${heights.join(" / ")}${ragged ? "  ← 들쭉날쭉" : ""}`);
  for (const c of cells) {
    const ok = c.lines === 1 && !ragged && c.spill <= 1;
    if (!ok) bad++;
    console.log(`   ${ok ? "✓" : "✗"} ${c.name} (${c.val}) — ${c.lines}줄` +
                (c.spill > 1 ? ` · 칸 밖 ${c.spill}px` : ""));
  }
  await p.close();
}
console.log(bad ? `\n어긋난 이름표 ${bad}개` : "\n넉 장이 다 한 줄로 나란하다");
await b.close();
process.exit(bad ? 1 : 0);

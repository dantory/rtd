/** **예고 칩을 누르면 그놈의 속이 뜨는가.**
 *
 *  다섯 판 앞서 이름은 대게 됐지만(namedsoon.mjs) **무엇에 약한지**는 코앞에 와야 나왔다 —
 *  이름만 알고는 갈아 끼울 것을 못 고르니 앞서 알려 준 뜻이 없다. 마우스가 있는 화면은
 *  `title` 로 읽었지만 폰에는 마우스가 없다. 칩에 `data-ex` 를 달아 눌러서 읽게 했다.
 *
 *  재는 것 여섯:
 *   1) 예고 칩(코앞·몇 판 뒤 둘 다)에 `data-ex` 가 달려 있다
 *   2) 그 속에 능력과 **그때 유리한 것**(POWCOUNTER)이 다 들어 있다
 *   3) 실제로 눌러서 말풍선이 뜬다 (#exbub.on)
 *   4) 말풍선이 여러 줄로 펴진다 (.multi — nowrap 이면 320px 에서 샌다)
 *   5) 말풍선이 화면 밖으로 안 샌다 (좌·우·위·아래)
 *   6) 머리줄 맨 위 칩이라도 말풍선이 **칩을 가리지 않는다**(위가 모자라면 아래로)
 *
 *      node tools/bosstip.mjs      # serve.mjs(8772)
 */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

/* [라운드, 눌러 볼 칩] — 코앞(namedwarn)·몇 판 뒤(namedsoon)·보통 보스 셋 다 */
const CASES = [[25, ".namedwarn"], [22, ".namedsoon"], [50, ".namedwarn"], [73, ".namedsoon"], [10, "img.mobico.exn"]];

const b = await chromium.launch();
let bad = 0;
for (const W of [320, 430]) {
  const p = await b.newPage({ viewport: { width: W, height: 860 } });
  await p.goto("http://127.0.0.1:8772/", { waitUntil: "networkidle" });
  await p.waitForTimeout(900);
  /* 첫 화면(인사말)이 판을 통째로 덮고 있다 — 안 치우면 손가락이 늘 그 덮개에 닿는다.
     사람은 이걸 먼저 누르고 시작하므로 여기서도 같은 자리에서 시작한다. */
  await p.evaluate(`(() => { const g = document.getElementById('introGo'); if (g) g.click();
    document.querySelectorAll('.ov.on, #intro.on').forEach(e => e.classList.remove('on')); })()`);
  await p.waitForTimeout(200);

  for (const [r, sel] of CASES) {
    const has = await p.evaluate(`(() => {
      S.over = false; S.running = false; S.round = ${r};
      refresh();
      const el = document.querySelector('#wavebar ${sel}');
      return el ? { ex: el.dataset.ex || "", want: bossTip(namedSoon(${r}) ? namedSoon(${r}).r : ${r}) } : null;
    })()`);
    const fail = [];
    if (!has) fail.push(`칩이 없다 (${sel})`);
    else {
      if (!has.ex) fail.push("data-ex 가 없다 — 눌러도 안 뜬다");
      else {
        // 능력 줄과 대응하는 「유리한 것」이 짝으로 다 들어 있는지
        const want = has.want.split("\n").map(s => s.trim()).filter(Boolean);
        const miss = want.filter(w => !has.ex.includes(w.replace(/^[·→]\s*/, "")));
        if (miss.length) fail.push(`속이 모자란다 — ${miss.slice(0, 2).join(" / ")}`);
        if (!/→/.test(has.ex)) fail.push("유리한 것이 없다 — 능력 이름만으로는 못 고른다");
      }
      // 실제로 눌러 본다
      await p.click(`#wavebar ${sel}`, { force: true });
      await p.waitForTimeout(200);
      const bub = await p.evaluate(`(() => {
        const el = document.getElementById('exbub'), c = document.querySelector('#wavebar ${sel}');
        if (!el || !el.classList.contains('on')) return null;
        const R = el.getBoundingClientRect(), C = c.getBoundingClientRect();
        const overlap = !(R.right < C.left || R.left > C.right || R.bottom < C.top || R.top > C.bottom);
        return { multi: el.classList.contains('multi'), lines: el.textContent.split("\\n").length,
          l: Math.round(R.left), r: Math.round(innerWidth - R.right),
          t: Math.round(R.top), bt: Math.round(innerHeight - R.bottom), overlap };
      })()`);
      if (!bub) fail.push("눌러도 말풍선이 안 뜬다");
      else {
        if (!bub.multi) fail.push("한 줄로 눌려 있다 — 320px 에서 샌다");
        if (bub.lines < 3) fail.push(`줄이 모자란다 ${bub.lines}줄`);
        if (bub.l < 0) fail.push(`왼쪽으로 ${-bub.l}px 샌다`);
        if (bub.r < 0) fail.push(`오른쪽으로 ${-bub.r}px 샌다`);
        if (bub.t < 0) fail.push(`위로 ${-bub.t}px 샌다`);
        if (bub.bt < 0) fail.push(`아래로 ${-bub.bt}px 샌다`);
        if (bub.overlap) fail.push("말풍선이 칩을 가린다");
      }
    }
    if (fail.length) bad++;
    console.log(`${fail.length ? "✗" : "✓"} ${W}px ${String(r).padStart(2)}R ${sel.padEnd(11)} ${fail.join(" · ")}`);
  }
  await p.close();
}
await b.close();
console.log(bad ? `\n✗ ${bad}건` : "\n✓ 예고 칩을 누르면 능력과 유리한 것이 뜬다");
process.exit(bad ? 1 : 0);

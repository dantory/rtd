/** **자릿수가 늘면 판이 밀리는가.**
 *
 *  기록 넉 장은 이미 잡았다(`statlabel.mjs`). 그런데 줄여 적기(`shortNum`)는 그 넉 장에만
 *  붙어 있고, **자원·전투력**은 판 도중에도 상점에서도 날것 그대로 나간다 — 이쪽이 훨씬
 *  오래 보는 숫자다. 방치형이라 자원은 자고 일어나면 여섯 자리가 된다.
 *
 *  재는 법: **같은 화면을 두 번** 그린다. 한 번은 갓 시작한 사람 수(자원 40),
 *  한 번은 오래 굴린 사람 수(자원 1,284,000). 글자가 길어진 것 말고 **판이 움직였으면** ✗.
 *
 *   1) 머리줄(.hud) 이 접혀 머리통 키가 커지는가 — 접히면 아래 화면이 통째로 내려간다
 *   2) 자원 칸이 제 자리 밖으로 나가는가
 *   3) 상점·배치 밑줄(#armyNote/#sqNote) 이 줄 수가 늘어나는가
 *
 *      node tools/numwidth.mjs      # serve.mjs(8772)
 */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

const WIDTHS = [320, 360, 390, 430];

/* 갓 시작한 사람 / 오래 굴린 사람. 판 수·처치 말고 **화면에 그대로 나가는 수**를 벌린다. */
const SAVES = {
  new: `META.relics=40; META.army=META.army.slice(0,3);`,
  old: `META.relics=987654321;
        META.up={dmg:60,rate:40,hp:50,slots:6,pool:12,luck:20};`,
};

const SHOW = `(() => {
  drawShop();
  document.getElementById('forge').classList.add('on');
  return true;
})()`;

const PROBE = `(() => {
  const r = el => el.getBoundingClientRect();
  const lines = el => {
    const s = getComputedStyle(el);
    const lh = parseFloat(s.lineHeight) || parseFloat(s.fontSize) * 1.6;
    return Math.round(r(el).height / lh);
  };
  const hud = document.querySelector('.hud'), head = document.querySelector('header');
  const rlc = document.getElementById('relicBtn');
  const am = document.getElementById('armyNote');
  return {
    headH: Math.round(r(head).height),
    hudH:  Math.round(r(hud).height),
    // 접힘: 자식 하나 키보다 줄 상자가 눈에 띄게 크면 두 줄로 접힌 것
    hudWrap: Math.round(r(hud).height) - Math.round(r(rlc).height) > 6,
    relicW: Math.round(r(rlc).width),
    relicTxt: rlc.textContent.trim(),
    // 「1284000」처럼 쉼표도 단위도 없는 네 자리 위 숫자는 자릿수를 세어야 읽힌다
    relicRaw: /\d{4,}/.test(document.getElementById('hRelic').textContent),
    relicTip: document.getElementById('hRelic').title,
    // 자원 칸이 머리통 밖으로 밀려났는가 (오른쪽 여백 4px 은 봐준다)
    spill: Math.round(Math.max(0, r(rlc).right - (r(head).right - 4))),
    armyLines: lines(am),
    armyH: Math.round(r(am).height),
    armyTxt: am.textContent.replace(/\\s+/g, ' ').trim().slice(0, 46),
  };
})()`;

const b = await chromium.launch();
let bad = 0;
for (const w of WIDTHS) {
  const got = {};
  for (const [tag, setup] of Object.entries(SAVES)) {
    const p = await b.newPage({ viewport: { width: w, height: 820 } });
    await p.goto("http://127.0.0.1:8772/", { waitUntil: "networkidle" });
    await p.waitForTimeout(700);
    await p.evaluate(setup);
    await p.evaluate(SHOW);
    await p.waitForTimeout(250);
    got[tag] = await p.evaluate(PROBE);
    await p.close();
  }
  const [n, o] = [got.new, got.old];
  const bumped = o.headH - n.headH;
  const grew = o.armyLines - n.armyLines;
  const fails = [];
  if (o.hudWrap && !n.hudWrap) fails.push("머리줄이 접힘");
  if (bumped > 1) fails.push(`머리통 ${n.headH}→${o.headH}px`);
  if (o.spill > 0) fails.push(`자원 칸이 ${o.spill}px 밖으로`);
  if (grew > 0) fails.push(`상점 밑줄 ${n.armyLines}→${o.armyLines}줄`);
  if (o.relicRaw) fails.push(`자원이 날것 「${o.relicTxt}」`);
  if (!o.relicTip.includes(",")) fails.push("정확한 수가 title 에 없음");
  if (fails.length) bad++;
  console.log(`${w}px  ${fails.length ? "✗ " + fails.join(" · ") : "✓"}`);
  console.log(`      자원 「${n.relicTxt}」${n.relicW}px → 「${o.relicTxt}」${o.relicW}px` +
              ` · 머리통 ${n.headH}/${o.headH} · 밑줄 ${n.armyLines}/${o.armyLines}줄`);
}
await b.close();
console.log(bad ? `\n✗ ${bad}/${WIDTHS.length} 폭에서 자릿수가 판을 민다` : "\n✓ 자릿수가 늘어도 판은 그대로");
process.exit(bad ? 1 : 0);

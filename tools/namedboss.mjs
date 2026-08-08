/** **이름 있는 놈이 판 위에서 알아보이는가.**
 *
 *  스물다섯 라운드에 한 번뿐인 놈인데, 배너 한 줄이 지나가고 나면 판에는 보통 보스와
 *  똑같은 붉은 덩어리만 남아 있었다 — 같은 boss.png, 같은 76px, 같은 테.
 *  "드물게 두는 것이 요점"이라 적어 놓고 정작 만났을 때 그런 줄을 모른다.
 *
 *  재는 것 넷:
 *   1) 이름표가 몸에 붙어 있다 — 셋의 이름이 각각 제 놈 위에 뜬다
 *   2) 보통 보스보다 **크다** (76 → 98)
 *   3) 셋의 **테 색이 서로 다르다** — 같은 색이면 이름표를 읽기 전엔 못 가른다
 *   4) 이름표가 판 밖으로 안 새고, 체력바를 안 덮는다
 *
 *      node tools/namedboss.mjs      # serve.mjs(8772)
 */
import { chromium } from "/Users/lbs/source/personal/game-asset-editor/node_modules/playwright/index.mjs";

/* 25 · 50 · 75 — NAMED 셋이 한 번씩 다 나오는 라운드. 50 은 보통 보스 라운드(5 의 배수)이기도
   해서, 여기서 이름 있는 놈이 안 나오면 `namedBoss` 의 나머지 셈이 틀어진 것이다.
   100 · 150 · 175 는 **두 바퀴째부터** — 셋뿐이라 재탕이던 자리다. 이름 앞에 수식이 붙어
   길어지므로 여기서 이름표가 새는지를 같이 잰다(첫 바퀴에서만 재면 못 잡는다). */
const ROUNDS = [25, 50, 75, 100, 150, 175];
const CYCLE1 = 75;                       // 이 라운드까지가 첫 바퀴

const probe = (r) => `(() => {
  S.over = true;                        // 게임 고리를 멈춘다 — 재는 사이에 걸어가면 자가 흔들린다
  S.round = ${r};
  S.mobs.length = 0;
  /* 보스는 **웨이브의 첫 몸**으로만 나온다(S.spawned === 0) — 이걸 안 되돌리면 두 번째
     라운드부터는 그냥 잡몹이 나와서 "이름 있는 놈이 안 나옴"으로 잘못 읽힌다. */
  S.spawned = 0;
  document.querySelectorAll('.mob').forEach(el => el.remove());
  spawnMob();                           // 보스 라운드의 첫 몸 = 보스
  /* 체력바는 **성한 놈에게는 안 그린다** — 반쯤 깎아 놔야 이름표와 겹치는지를 잴 수 있다
     (안 그러면 숨은 바의 좌표 0 과 재서 말도 안 되는 수가 나온다). */
  if (S.mobs[0]) S.mobs[0].hp = S.mobs[0].maxHp * 0.5;
  paintOnce();
  const el = document.querySelector('.mob.named');
  const m  = S.mobs[0];
  if (!el) return { round:${r}, named:m && m.named || null, el:false };
  const er = el.getBoundingClientRect();
  const tag = el.querySelector('.nametag');
  const bar = el.querySelector('i');
  const cs  = getComputedStyle(el, '::before');
  const tr  = tag && tag.getBoundingClientRect();
  const br  = bar && bar.getBoundingClientRect();
  return {
    round: ${r}, el:true,
    named: m.named, powers: (m.powers||[]).join('·'),
    // **판은 확대·축소된다** — 화면 px 로 재면 배율이 섞인다. 레이아웃 px 로 잰다.
    size: el.offsetWidth,
    ring: el.style.getPropertyValue('--ring').trim(),
    border: cs.borderTopColor,
    tag: tag ? tag.textContent.trim() : null,
    tagW: tr ? Math.round(tr.width) : 0,
    // 이름표가 몸 폭을 크게 넘으면 옆 놈과 겹쳐 읽힌다(몸의 1.6 배까지 봐준다)
    tagSpill: tr ? Math.round(tr.width - er.width * 1.6) : 0,
    // 이름표가 체력바를 덮으면 둘 다 못 읽는다
    overBar: (tr && br && br.height) ? Math.round(tr.bottom - br.top) : -99,
  };
})()`;

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 430, height: 860 } });
await p.goto("http://127.0.0.1:8772/", { waitUntil: "networkidle" });
await p.waitForTimeout(900);
/* 게임 고리가 계속 돌면 몹이 걸어가 버려서 재는 사이에 자리가 바뀐다 —
   `paint` 만 한 번 부르는 창구를 만들어 정지 화면으로 잰다. */
await p.evaluate(`window.paintOnce = () => paint();`);

const rows = [];
for (const r of ROUNDS) rows.push(await p.evaluate(probe(r)));
await b.close();

let bad = 0;
const rings = new Set();
for (const x of rows) {
  const fail = [];
  if (!x.el) fail.push("이름 있는 놈이 안 나옴");
  else {
    if (!x.tag || x.tag !== x.named) fail.push(`이름표 없음/어긋남(${x.tag})`);
    if (x.size < 90) fail.push(`안 큼 ${x.size}px`);
    if (!x.ring) fail.push("테 색 없음");
    if (x.tagSpill > 0) fail.push(`이름표가 몸보다 넓다 +${x.tagSpill}px`);
    if (x.overBar > 0) fail.push(`이름표가 체력바를 덮는다 ${x.overBar}px`);
    /* 두 바퀴째는 **더 험한 놈**이어야 한다 — 이름이 그대로거나 능력이 안 늘었으면
       그냥 재탕이다(그걸 고치려고 얹은 것이므로 여기서 잡는다). */
    if (x.round > CYCLE1) {
      const np = (x.powers || "").split("·").filter(Boolean).length;
      if (np < 3) fail.push(`두 바퀴째인데 능력이 ${np}개`);
      if (!/^(거듭난|굶주린|심연의|잿빛|\d+대) /.test(x.named || "")) fail.push(`이름에 바퀴 수식이 없다(${x.named})`);
    } else rings.add(x.ring);
  }
  if (fail.length) bad++;
  console.log(`${fail.length ? "✗" : "✓"} ${x.round}R  ${x.named || "—"}  ` +
    `${x.size || 0}px  테[${x.ring || "—"}]  이름표「${x.tag || "—"}」 ${x.tagW}px  [${x.powers || "—"}]` +
    (fail.length ? "   ← " + fail.join(" / ") : ""));
}
// 테 색은 **첫 바퀴 셋**만 센다 — 두 바퀴째는 같은 몸의 더 험한 판이라 색을 물려받는 것이 맞다
if (rings.size < 3) { bad++; console.log(`✗ 테 색이 겹친다 — ${rings.size}종`); }

console.log(bad ? `\n✗ ${bad}건` : `\n✓ ${rows.length}판 다 알아본다 — 두 바퀴째는 더 험하다`);
process.exit(bad ? 1 : 0);



export const $ = (id) => document.getElementById(id);

/* ══════════════════════════════════════════════════════════════
   유닛 — 등급이 오르면 **눈에 띄게** 세져야 한다.
   합성이 "조금 나아짐"이면 셋을 모을 이유가 없다. 등급마다 피해가 3배씩 뛴다.
   대신 사거리·속도는 종류가 정한다 — 그래야 어느 종류를 키울지가 선택이 된다.
   ══════════════════════════════════════════════════════════ */
/** **벙커에 넣는 건 포탑이 아니라 대원이다.**
 *  자리에 놓는 것이 구조물이면 아무리 "할당"이라 불러도 화면에는 타워를 세우는 게임으로
 *  보인다. 병과가 곧 벙커의 성격이다 — 무엇을 넣느냐로 공격도 방어도 갈린다.
 *  뒤의 넷은 **때리는 것 말고 다른 일**을 한다. 숫자만 다른 병과는 늘려 봐야 목록만 길어진다. */
export const KINDS = {
  gun:   { n:"소총병", ico:"⌖", col:"#c9ccd1", dmg:6,  rng:140, cd:0.55, fx:"hit",
           d:"고르게 쏜다" },
  cannon:{ n:"척탄병", ico:"◉", col:"#d0785a", dmg:22, rng:118, cd:1.5,  splash:44, fx:"blast",
           d:"느리지만 터진다" },
  frost: { n:"냉동병", ico:"❆", col:"#6ba8d6", dmg:4,  rng:132, cd:0.7,  slow:0.45, fx:"frost",
           d:"느리게 만든다" },
  bolt:  { n:"전격병", ico:"⚡", col:"#a978c9", dmg:11, rng:172, cd:0.9,  chain:2, fx:"spark",
           d:"멀리, 여럿에게 튄다" },
  // ── 뽑기에 결이 생기게 넷을 더한다. **숫자만 다른 유닛은 늘려 봐야 목록만 길어진다** —
  //    저마다 "이건 이럴 때 쓴다"가 달라야 뽑을 때마다 판이 달라진다.
  flame: { n:"화염병", ico:"🔥", col:"#e08a3c", dmg:5, rng:96, cd:0.3, splash:30, fx:"blast",
           d:"코앞을 빠르게 태운다" },
  rail:  { n:"저격수", ico:"↟", col:"#dfe6ee", dmg:46, rng:230, cd:2.4, pierce:3, fx:"spark",
           d:"아주 멀리, 뚫고 지나간다" },
  drone: { n:"정찰병", ico:"✈", col:"#7fb069", dmg:7, rng:150, cd:0.8, bounty:2, fx:"hit",
           d:"잡을 때마다 유물을 더 준다" },
  mine:  { n:"공병",   ico:"◇", col:"#e0c458", dmg:34, rng:70, cd:2.0, splash:52, arm:true, fx:"blast",
           d:"붙은 놈들을 한꺼번에" },
  // ── 때리는 것 말고 다른 일을 하는 넷 ──
  medic:  { n:"위생병", ico:"✚", col:"#e2b8b8", dmg:3, rng:110, cd:1.1, heal:7, fx:"hit",
            d:"싸우는 동안 벙커를 고친다" },
  guard:  { n:"방패병", ico:"▣", col:"#8f9aa8", dmg:8, rng:88, cd:0.9, armor:0.24, fx:"hit",
            d:"벙커가 받는 피해를 줄인다" },
  rocket: { n:"로켓병", ico:"➶", col:"#6f8f5a", dmg:62, rng:196, cd:2.8, splash:58, fx:"blast",
            d:"한 발이 무겁다" },
  officer:{ n:"지휘관", ico:"★", col:"#d6a84a", dmg:9, rng:150, cd:1.0, aura:0.22, fx:"hit",
            d:"벙커 전원의 피해를 올린다" },
};
export const KIND_IDS = Object.keys(KINDS);
export const GRADE = [1,2,3,4,5];
export const gradeMul = (g) => Math.pow(3, g - 1);          // 1 · 3 · 9 · 27 · 81
export const GNAME = ["", "하급", "중급", "상급", "정예", "전설"];
export const GCOL  = ["", "#8a8f98", "#7fb069", "#6ba8d6", "#a978c9", "#e0a458"];

/** **자리를 셋으로 조인 만큼 하나가 세야 한다.**
 *  전에는 자리가 백열두 개여서 열댓 기가 동시에 쐈다. 벙커에 셋만 들어가는데 그때 수치를
 *  그대로 두니 화력이 5분의 1 이 되어 3~5 라운드에서 죽었고, 뽑기 횟수가 모자라 같은 것
 *  셋을 모을 수가 없어 합성까지 같이 죽었다. 자리 수가 줄면 개당 화력은 그만큼 올라야 한다. */
export const BUNKER_DMG = 4.5;
// 타워도 맞는다. 등급이 오르면 단단해지되 피해만큼 뛰지는 않는다 —
// 세다고 안 부서지면 바깥에 세우는 데 값이 없어진다.
// 대원은 이제 안 죽는다(벙커가 대신 맞는다). 이 값은 표시용으로만 남는다.
export const hpOf   = (t) => Math.round(28 + t.g * 22);

/* ══════════════════════════════════════════════════════════════
   전장 — **벙커디펜스.**
   ──────────────────────────────────────────────────────────────
   길을 따라가는 타워디펜스에서는 배치가 사실상 "길 옆이냐 아니냐" 하나뿐이다.
   가운데 지킬 것을 놓고 **사방에서 몰려오게** 하면 배치가 진짜 결정이 된다 —
   한쪽에 몰아 세우면 반대쪽이 그대로 뚫리고, 고르게 펴면 어디도 두껍지 않다.

   **대원은 벙커 안에 있어 맞지 않는다.** 자리가 몇 개뿐인 구조에서 대원이 죽어 없어지면
   화력이 통째로 사라져 그 판이 거기서 끝나고, 무엇보다 모아 온 것을 전투 한 번에 잃으면
   수집이 성립하지 않는다. 깎이는 것은 벙커 하나이고, 그래서 방어는 받는 피해를 줄이는
   일(방패병)과 깎인 것을 되돌리는 일(위생병)로 갈린다.
   ══════════════════════════════════════════════════════════ */
/** **판은 넉넉해야 판으로 보인다.** 처음엔 13×9(117칸) 였는데, 놓을 수 있는 자리 바깥이
 *  한두 줄뿐이라 적이 달려오는 게 아니라 화면 밖에서 툭 튀어나왔고, 판 전체를 봐도
 *  격자 몇 개라 "전장"이 아니라 UI 표처럼 보였다. 21×21(441칸) 로 넓혀 **바깥을 진짜
 *  벌판으로** 만든다 — 넓힌 땅은 놓는 자리가 아니라 **달려오는 것을 보는 시간**이다. */
export const COLS = 21, ROWS = 21;
/* **본진은 한 칸이다.** 3×3 은 벙커 하나치고 판을 너무 많이 먹었고, 그만큼 대원 자리가
   바깥으로 밀려 반대편까지 사거리가 안 닿는 문제까지 낳았다(그걸 사거리 배수로 메우고
   있었다). 한 칸으로 줄이면 대원이 벙커에 바짝 붙고 앞마당도 아담해진다. */
export const CORE = { x: 10, y: 10, w: 1, h: 1 };        // 한가운데 한 칸이 본진
export const inCore = (x, y) => x >= CORE.x && x < CORE.x + CORE.w && y >= CORE.y && y < CORE.y + CORE.h;
export const coreKey = new Set();
for (let y = CORE.y; y < CORE.y + CORE.h; y++)
  for (let x = CORE.x; x < CORE.x + CORE.w; x++) coreKey.add(x + "," + y);

/** **놓을 수 있는 곳은 본진 둘레뿐이다.**
 *  판 전체를 열어 두면 뽑은 것이 아무 데나 떨어져 대부분 헛돈다 — 사거리가 안 닿으니
 *  가진 타워의 절반이 장식이 되고, 사람은 매번 일일이 옮겨야 한다(실제로 그랬다).
 *  둘레로 좁히면 "어느 쪽을 두껍게 할까"라는 진짜 결정만 남는다. 바깥 땅은 적이 달려오는
 *  자리로 비워 둔다 — 요격할 시간이 거기서 나온다. */
export const RING = 3;   // 벙커 앞마당(철판 데크)의 두께. 자리는 이 안에서만 열린다.

/** **자리는 벙커에 붙어 있고, 처음엔 몇 개 없다.**
 *
 *  판 위 아무 데나 세우는 방식을 걷어냈다. 자리가 백 개면 "어디에"는 사실 결정이 아니다 —
 *  뽑은 것을 순서대로 늘어놓을 뿐이고, 자리가 남아도니 무엇 하나 버릴 일이 없다.
 *  벙커에 붙일 수 있는 **칸을 세어서** 주면 그때부터 결정이 생긴다: 이걸 넣으려면
 *  무엇을 빼야 하는가. 합성이 셋을 하나로 만드는 것도 그래서 값이 생긴다 — 자리가 둘 는다.
 *
 *  여는 순서는 **안쪽 테두리부터, 그 안에서는 사방으로 흩어지게**다. 각도순으로 차례차례
 *  열면 한쪽 면만 두꺼워져 적이 반대편으로 그냥 걸어 들어온다. 링 크기와 서로소인 걸음으로
 *  돌면 몇 개만 열려 있어도 사방이 고르게 덮인다. */
export const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const SLOT_SPOTS = (() => {
  const c = { x: CORE.x + (CORE.w - 1) / 2, y: CORE.y + (CORE.h - 1) / 2 };
  const out = [];
  for (let r = 1; r <= RING; r++) {
    const a = CORE.x - r, b = CORE.x + CORE.w - 1 + r;
    const t = CORE.y - r, u = CORE.y + CORE.h - 1 + r;
    const ring = [];
    for (let x = a; x <= b; x++) { ring.push([x, t]); ring.push([x, u]); }
    for (let y = t + 1; y <= u - 1; y++) { ring.push([a, y]); ring.push([b, y]); }
    ring.sort((p, q) => Math.atan2(p[1] - c.y, p[0] - c.x) - Math.atan2(q[1] - c.y, q[0] - c.x));
    let step = Math.round(ring.length * 0.382) | 1;      // 황금비 걸음, 홀수로
    while (gcd(step, ring.length) !== 1) step += 2;      // 서로소여야 한 바퀴에 다 들른다
    for (let i = 0; i < ring.length; i++) out.push(ring[(i * step) % ring.length]);
  }
  return out;
})();
export const SLOT_BASE = 3;                                    // 첫 판에 주는 자리
// `| 0` 은 군더더기가 아니다 — 예전 세이브나 검증 하네스가 slots 없는 up 을 넣으면
// undefined 가 되어 자리 수가 통째로 NaN 이 된다(실제로 그래서 봇이 1R 에 전멸했다).
export const slotMax = () => Math.min(SLOT_SPOTS.length, SLOT_BASE + (META.up.slots | 0));
export let SLOT_SET = new Set();
export let DECK_R = 1;
/** **앞마당은 자리를 따라 자란다.** 처음부터 9×9 철판을 깔아 두면 자리 셋이 허허벌판에
 *  점 셋으로 떠서, 벙커가 아니라 빈 주차장이 된다. 열린 자리가 닿는 테두리까지만 깔면
 *  첫 판은 5×5 로 아담하고, 증축할 때마다 **바닥이 실제로 넓어지는 게 보인다.** */
export function refreshSlots() {
  const n = slotMax();
  SLOT_SET = new Set(SLOT_SPOTS.slice(0, n).map(p => p[0] + "," + p[1]));
  let left = n;
  DECK_R = 1;
  for (let i = 1; i <= RING; i++) {
    DECK_R = i;
    left -= (CORE.w + 2 * i) * (CORE.h + 2 * i) - (CORE.w + 2 * i - 2) * (CORE.h + 2 * i - 2);
    if (left <= 0) break;
  }
}
export const buildable = (x, y) => SLOT_SET.has(x + "," + y);
/** 앞마당 — 자리가 아직 안 열린 칸까지 포함한 벙커 바닥. 여기에 철판을 깐다. */
export const onDeck = (x, y) =>
  !inCore(x, y) &&
  x >= CORE.x - DECK_R && x < CORE.x + CORE.w + DECK_R &&
  y >= CORE.y - DECK_R && y < CORE.y + CORE.h + DECK_R;

/* ══════════════════════════════════════════════════════════════
   판을 넘어서는 성장 — **"한 판 더"를 만드는 것**
   ──────────────────────────────────────────────────────────────
   뚫리면 아무것도 안 남으면, 벽을 만난 순간이 그냥 끝이다. 도달한 만큼 유물을 주고
   그걸로 영구히 세지게 하면 **같은 벽이 "다음 판에 넘을 것"으로 바뀐다.**
   재미의 축 넷 중 ①불어난다에 손이 제일 오래 간 이유가 이 구조(환생)였다.
   ══════════════════════════════════════════════════════════ */
export const META_KEY = "rtd.meta.v1";
export const UPGRADES = {
  dmg:   { n:"벼림",   d:"모든 피해 +13%",      base:4, per:3 },
  life:  { n:"성벽",   d:"벙커 체력 +90",       base:3, per:2 },
  cheap: { n:"흥정",   d:"징집 값 -1 (바닥 2)", base:5, per:4 },
  luck:  { n:"안목",   d:"중급이 더 자주 나온다", base:5, per:4 },
  // **자리 자체가 성장이다.** 첫 판은 셋뿐이라 무엇을 넣을지가 매번 결정이 되고,
  // 판을 거듭해 늘려 놓으면 예전엔 못 굴리던 조합이 굴러간다 — 불어나는 맛이 여기에 있다.
  slots: { n:"증축",   d:"배치 자리 +1",        base:4, per:3 },
};
export const META = loadMeta();
export function loadMeta() {
  try {
    const raw = JSON.parse(localStorage.getItem(META_KEY));
    if (raw && typeof raw === "object") {
      return { relics: raw.relics | 0, best: raw.best | 0,
               up: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, (raw.up?.[k]) | 0])),
               // 도감 — **모으는 재미는 남는 데서 온다.** 판이 끝나면 사라지는 수집은 수집이 아니다.
               seen: Object.fromEntries(KIND_IDS.map(k => [k, (raw.seen?.[k]) | 0])),
               // 병과별 훈련 등급. 모은 것을 **키우는** 축 — 수집이 장식으로 끝나지 않게 한다.
               lv: Object.fromEntries(KIND_IDS.map(k => [k, (raw.lv?.[k]) | 0])),
               /* **부대는 판을 넘어 남는다.** 판마다 뽑아 쓰고 버리면 그건 내 대원이 아니라
                  그 판의 소모품이다 — 모으는 재미도, 편성이라는 말도 성립하지 않는다.
                  각 대원은 slot 을 가진다: 번호면 그 자리에 서고, null 이면 창고에 있다. */
               army: Array.isArray(raw.army) ? raw.army.filter(t => KINDS[t?.kind]).map(t => ({
                 id: t.id | 0, kind: t.kind, g: Math.max(1, Math.min(5, t.g | 0)),
                 slot: (t.slot === null || t.slot === undefined) ? null : (t.slot | 0),
               })) : [],
               armyId: raw.armyId | 0,
               // **마지막으로 본 시각.** 탭을 닫아 둔 사이를 재려면 나갈 때의 시각이 남아 있어야
               // 한다. 예전 세이브엔 없으니 0 — 그 경우 오프라인 지급을 건너뛴다(없던 시간을
               // 지어내지 않는다). saveMeta 가 갱신하므로 게임이 도는 동안 저절로 흐른다.
               // `| 0` 을 쓰면 안 된다 — Date.now()(약 1.78e12)는 32비트를 넘어 잘려 나간다.
               lastSeen: Number.isFinite(raw.lastSeen) && raw.lastSeen > 0 ? raw.lastSeen : 0 };
    }
  } catch { /* 손상됐으면 조용히 새로 시작 — 저장이 깨졌다고 게임이 안 켜지면 안 된다 */ }
  return { relics: 0, best: 0, up: Object.fromEntries(Object.keys(UPGRADES).map(k => [k, 0])),
           seen: Object.fromEntries(KIND_IDS.map(k => [k, 0])),
           lv: Object.fromEntries(KIND_IDS.map(k => [k, 0])),
           army: [], armyId: 0, lastSeen: 0 };
}
// 저장할 때마다 지금 시각을 찍는다 — 이 값이 다음 부팅에서 "비운 시간"의 기준이 된다.
export const saveMeta = () => {
  META.lastSeen = Date.now();
  try { localStorage.setItem(META_KEY, JSON.stringify(META)); } catch {}
};
/** 이번 세션에 **처음** 만난 병과. 정산 도감에 NEW 를 붙였다가 다음에 켜면 사라진다.
 *  META 에 저장하지 않는다 — "방금 새로 얻었다"는 이 판을 도는 동안만 뜻이 있는 신호라,
 *  세이브에 남기면 영영 NEW 로 남아 뱃지의 의미가 죽는다. */
export const newlySeen = new Set();
/** 도감에 적는다. 처음 본 병과면 true — 그때만 요란하게 알린다.
 *  **최고 등급까지 남긴다.** 한 번 상급을 만들어 봤다는 기록이 다음 판을 시작하게 만든다. */
export function noteSeen(kind, g) {
  const cur = META.seen[kind] | 0;
  if (g <= cur) return false;
  META.seen[kind] = g;
  saveMeta();
  if (cur === 0) { newlySeen.add(kind); return true; }   // 처음이면 도감 카드에도 NEW 를 남긴다
  return false;
}
export const seenCount = () => KIND_IDS.filter(k => META.seen[k]).length;

/* ══ 병과 훈련 — **모은 것을 키우는 축** ══
   전역 업그레이드(모든 피해 +13%)만 있으면 열두 병과가 다 같은 속도로 세진다. 그러면
   무엇을 모았는지가 결과에 안 남고, 도감은 그저 장식이 된다. 병과마다 따로 키우면
   "이번 판은 저격수를 밀어 보자"가 성립하고, **뽑기 운이 아니라 내가 정한 방향**이 된다.
     · 등급 — 그 병과의 피해와 사거리
     · 특기 — 그 병과만의 수치(터지는 범위·회복량·방어·지휘 등). 곧 스킬이다
   만난 적 없는 병과는 못 키운다. 모으는 것이 먼저다. */
export const kindLv    = (k) => META.lv[k] | 0;
/* lv 를 덤으로 받는다 — 기본은 지금 훈련 등급이지만, 도감이 "한 단계 위" 값을 미리
   보여 줄 때(dexStat) 같은 식을 lv+1 로 다시 쓰려고 열어 둔다. 인자를 안 주면 예전 그대로다. */
export const kindDmgMul= (k, lv = kindLv(k)) => 1 + lv * 0.16;
export const kindRngMul= (k, lv = kindLv(k)) => 1 + lv * 0.05;
export const kindSkill = (k, lv = kindLv(k)) => 1 + lv * 0.11;
export const kindCost  = (k) => 3 + kindLv(k) * 3;
export const upCost = (k) => UPGRADES[k].base + UPGRADES[k].per * META.up[k];
// 넘긴 라운드가 곧 보상이다. 보스 라운드(5의 배수)를 넘기면 덤이 붙는다.
/** 죽을 때 받는 유물. **멀리 갈수록 가파르게** 준다 — 한 라운드를 더 미는 것이
 *  다음 판을 눈에 띄게 바꿔야 "막히면 강해져서 돌파한다"가 성립한다. */
export const relicsFor = (round) => Math.floor((round - 1) * 2.4 + Math.pow(Math.max(0, round - 1), 1.4) / 2);
/** **막는 중에도 유물이 들어온다.** 죽어야만 강해질 수 있으면 벽에 부딪힌 순간
 *  할 수 있는 게 죽기를 기다리는 것뿐이다. 세 라운드마다 한 줌씩, 멀리 갈수록 굵게. */
export const relicTick = (round) => (round % 2 === 0 ? 1 + Math.floor(round / 6) : 0);
// **돌파가 체감되어야 한다.** 스무 판을 해도 8%씩 오르면 벽은 그대로 벽이다.
/* **맞기 시작한 뒤에도 버틸 시간이 있어야 한다.** 260 이면 적 몇이 붙는 순간 몇 초 만에
   끝나서, 처음 맞은 라운드와 죽는 라운드가 붙어 버렸다(재 보니 1~5 라운드 차). 두껍게 두고
   대신 한 대를 가볍게 하면, 새어 든 놈들이 조금씩 깎다 잡히는 구간이 길어진다. */
export const metaLife = () => 520 + META.up.life * 90;   // 본진 체력
export const metaDmg  = () => 1 + META.up.dmg * 0.13;

/* 판마다 다섯 종만 나오게 하던 장치(rollPool)는 걷어냈다. 부대가 판을 넘어 남게 된
   뒤로는 "이번 판에 뭐가 나오나"가 아니라 **지금까지 무엇을 모았나**가 그 판의 성격이다.
   대신 나오는 병과 자체를 최고 기록에 따라 열어 준다(poolSize). */

/* ══ 상태 ══ */
/* 한 판 동안만 사는 값들. **부대는 여기 없다** — META.army 에 있고 판을 넘어 남는다. */
export const S = {
  coreHp: 0, coreMax: 0, round: 1,
  mobs: [], shots: [],
  running: false, spawned: 0, toSpawn: 0, spawnT: 0,
  sel: null, over: false,
  speed: 1,          // 배속 — 관전하는 장르라 기다림이 곧 지루함이다
  // 웨이브를 알아서 잇는다. 기본은 켜짐 — 매 라운드 버튼을 찾아 누르는 게 제일 성가시다.
  auto: (() => { try { return localStorage.getItem("rtd.auto") !== "0"; } catch { return true; } })(),
  gap: 0,            // 다음 웨이브까지 남은 시간
  bounty: 0,         // 정찰병이 더 벌어들인 몫 — 라운드 유물에 얹힌다
  // 뽑기·합성까지 알아서. 이게 켜져 있어야 진짜 방치형이 된다.
  autoRun: (() => { try { return localStorage.getItem("rtd.autorun") !== "0"; } catch { return true; } })(),
  autoT: 0,
};

/** **압박은 서서히 와야 한다.**
 *
 *  재 보니 본진이 처음 맞는 게 15~22 라운드였고 죽는 건 20~24 라운드였다. 무손상으로
 *  달리다 한두 라운드 만에 즉사하는 곡선이다 — 그러면 위생병도 방패병도 쓸 자리가 없고,
 *  유물을 쓸 이유도 마지막 순간에야 생긴다. 돌파할 벽이 아니라 낭떠러지다.
 *
 *  원인은 체력만 가파르게(×1.30) 올린 것이다. 우리 화력은 합성으로 ×3 씩 계단을 뛰므로
 *  한동안 압도하다가 계단 사이에서 한 번에 무너진다. 그래서 **체력은 완만하게, 수는
 *  가파르게** 바꿨다. 수가 늘면 몇 마리가 새어 들어와 본진을 조금씩 깎고, 그 지점부터
 *  고치고 막는 병과가 값을 하기 시작한다. 터지는 병과(척탄병·로켓병·화염병)도 같이 산다. */
export const waveHp   = (r) => Math.round(24 * Math.pow(1.235, r - 1));
export const waveN    = (r) => 3 + Math.floor(r * 2.0);
export const isBossR  = (r) => r % 5 === 0;

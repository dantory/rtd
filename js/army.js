import { BUNKER_DMG, CORE, GCOL, GNAME, gradeMul, hpOf, KIND_IDS, kindDmgMul, kindLv, kindRngMul, KINDS, kindSkill, META, metaDmg, noteSeen, RING, S, saveMeta, SLOT_SPOTS, slotMax } from "./core.js";
import { CELL, px, py, say } from "./view.js";
import { drawShop, flyText, popTower } from "./combat.js";
import { refresh } from "./ui.js";
import { sfx } from "./sound.js";


/* ══════════════════════════════════════════════════════════════
   뽑기 — 이 게임의 도파민.
   라운드가 오를수록 좋은 게 나올 확률이 오른다. 안 그러면 후반에도 하급만 나와
   "뽑는다"가 벌금이 된다. 다만 상급 이상은 뽑기로 못 나온다 — **합성만이 길**이어야
   셋을 모으는 행동에 값이 생긴다.
   ══════════════════════════════════════════════════════════ */
/** **징집** — 자원으로 새 대원을 부대에 들인다. 판이 끝난 뒤 정산 화면에서만.
 *
 *  전에는 판마다 골드로 뽑아 그 판에서만 쓰고 버렸다. 그러면 대원이 내 것이 아니라
 *  그 판의 소모품이고, "보유한 유닛을 배치한다"는 말이 성립하지 않는다.
 *  값은 부대가 커질수록 오른다 — 그래야 자원이 쌓였다고 무한히 불리지 못한다. */
/* 계수가 0.6 이던 때는 부대가 스물만 돼도 한 기에 열여섯이 들어, 판당 두어 기밖에 못
   늘렸다. 열두 병과에서 같은 종류 같은 등급 셋을 모으려면 부대가 그보다 훨씬 커야 한다
   — 그래서 합성이 죽었다(등급 1.8). 값은 오르되 완만하게. 합성이 부대를 줄이면
   징집 값도 같이 내려가므로, 합치는 것 자체가 다음 징집을 싸게 만든다. */
export const recruitCost = () => Math.max(2, 4 - META.up.cheap) + Math.floor(META.army.length * 0.22);
/** **병과는 차차 열린다.**
 *  열두 종류를 처음부터 다 풀면 같은 종류 같은 등급 셋이 좀처럼 안 모여 합성이 죽는다
 *  (실제로 등급 1.8 까지 떨어졌다). 넷으로 시작해 최고 기록이 오를 때마다 하나씩 연다 —
 *  초반에는 셋을 모으기 쉽고, 멀리 갈수록 새 얼굴이 나와 도감이 채워진다. */
export const poolSize = () => Math.min(KIND_IDS.length, 4 + Math.floor(META.best / 4));
export const nextUnlockAt = () => (poolSize() >= KIND_IDS.length ? 0 : (poolSize() - 3) * 4);
export function recruit() {
  const c = recruitCost();
  if (META.relics < c) return;
  META.relics -= c;
  const pool = KIND_IDS.slice(0, poolSize());
  const kind = pool[Math.floor(Math.random() * pool.length)];
  // 중급이 섞여 나와야 상급까지 길이 열린다. 안목이 그 확률을 올린다.
  const g = Math.random() + META.up.luck * 0.06 > 0.86 ? 2 : 1;
  const t = { id: ++META.armyId, kind, g, slot: null };
  META.army.push(t);
  const fresh = noteSeen(kind, g);
  fillFree();                        // 자리가 비어 있으면 바로 세운다
  syncArmy(); saveMeta();
  say((fresh ? `<b style="color:var(--amber)">새 병과!</b> ` : "") +
      `<b>${GNAME[g]} ${KINDS[kind].n}</b> 을(를) 들였다.`);
  drawShop(); refresh();
}

/** **가진 것과 내보낸 것은 다르다.**
 *
 *  자리를 셋으로 조였더니 가진 것도 셋이 되어 같은 종류 셋을 모을 수가 없었고, 합성이
 *  통째로 죽었다(검증 봇 최고 등급 3.0 → 1.5). 벙커에 "할당한다"는 건 가진 것 중에서
 *  **골라 넣는다**는 뜻이지, 뽑은 것이 곧바로 자리에 꽂힌다는 뜻이 아니다.
 *  그래서 뽑은 것은 제한 없이 쌓이고, 그중 자리에 넣은 것만 싸운다.
 *  자리에 없는 것은 `x` 가 null 이다 — 합성·판매는 가진 것 전부를 대상으로 한다. */
/** **부대는 META.army 에 있다** — S.towers 가 아니다.
 *
 *  판마다 뽑아 쓰고 버리는 구조에서는 대원이 그 판의 소모품이었다. 이제 대원은 판을 넘어
 *  남고, 판은 **가진 것 중에서 골라 내보내는** 일이 된다. 자리는 slot 번호로 들고 있고
 *  (null 이면 창고), 화면 좌표 x·y 는 판을 시작할 때 그 번호에서 만들어 붙인다.
 *  좌표를 저장하지 않는 건 자리 수가 늘면(증축) 같은 번호도 다른 칸이 되기 때문이다. */
export const isOut = (t) => t.slot !== null && t.slot < slotMax();
export const placed = () => META.army.filter(isOut);
export const inBox  = () => META.army.filter(t => !isOut(t));
export const occupied = () => new Set(placed().map(t => t.slot));

/** 자리 번호에서 좌표와 체력을 만들어 붙인다. 판을 시작할 때와 자리 수가 바뀔 때 부른다. */
export function syncArmy() {
  const taken = new Set();
  for (const t of META.army) {
    // 증축을 되돌린 적은 없지만, 저장이 깨져 자리 번호가 범위를 벗어나면 창고로 돌린다
    if (t.slot !== null && (t.slot >= slotMax() || taken.has(t.slot))) t.slot = null;
    if (t.slot !== null) taken.add(t.slot);
    const p = t.slot === null ? null : SLOT_SPOTS[t.slot];
    t.x = p ? p[0] : null;
    t.y = p ? p[1] : null;
    t.maxHp = hpOf(t); t.hp = t.maxHp; t.cd = 0; t.healT = 0;
  }
}
/** 비어 있는 자리 **번호**들. 좌표가 아니라 번호를 다루는 게 부대의 언어다. */
export function freeSlots() {
  const occ = occupied(), out = [];
  for (let i = 0; i < slotMax(); i++) if (!occ.has(i)) out.push(i);
  return out;
}

/** **빈 자리는 알아서 채운다.** 자리를 비워 두는 건 손해일 뿐 결정이 아니다 — 합치고 나서
 *  매번 손으로 두 자리를 채우게 하면 그건 결정이 아니라 잔일이다. 센 것부터 내보내고,
 *  무엇을 내보낼지는 진열대의 칩을 눌러 언제든 바꾼다. */
export function fillFree() {
  const rank = (t) => t.g * 1e6 + dmgOf(t);
  const box = inBox().sort((a, b) => rank(b) - rank(a));
  for (const t of box) {
    const free = freeSlots();
    if (!free.length) break;
    t.slot = free[0];
  }
  /* **창고가 더 세면 바꿔 넣는다.**
     합쳐서 만든 상급이 창고에 앉아 있고 자리엔 하급이 서 있으면 자동 운영이 일을 반만 한
     것이다. 무엇보다 합성 결과가 자리에 안 나가면 **합친 순간이 화면에 안 보인다** —
     기여는 절대적인데(빼면 25R → 12R) 플레이어에게는 아무 일도 안 일어난 것처럼 보였다. */
  for (;;) {
    const best = inBox().sort((a, b) => rank(b) - rank(a))[0];
    if (!best) break;
    const worst = placed().sort((a, b) => rank(a) - rank(b))[0];
    if (!worst || rank(best) <= rank(worst)) break;
    best.slot = worst.slot;
    worst.slot = null;
  }
  syncArmy(); saveMeta();
}

/** 진열대의 칩을 눌렀을 때 — 창고에 있으면 내보내고, 다 나가 있으면 하나 거둔다. */
export function toggleOut(key) {
  const [kind, gs] = key.split(":"); const g = +gs;
  const mine = META.army.filter(t => t.kind === kind && t.g === g);
  const waiting = mine.filter(t => !isOut(t));
  if (waiting.length) {
    let free = freeSlots();
    /* 자리가 꽉 찼으면 **제일 약한 것과 바꿔 넣는다** — "거둔 다음 내보내라"는 두 손질을
       요구하는 데다, 예전엔 실패 안내(토스트)마저 편성 창 밑에 깔려 그냥 고장으로 보였다. */
    if (!free.length) {
      const weakest = placed().sort((x, y) => dmgOf(x) - dmgOf(y))[0];
      if (!weakest) return;
      weakest.slot = null;
      free = freeSlots();
    }
    waiting[0].slot = free[0];
    S.sel = waiting[0].id;
    syncArmy(); saveMeta(); refresh(); popTower(waiting[0], "rolled");
  } else {
    const out = mine.filter(isOut);
    if (!out.length) return;
    const t = out[out.length - 1];
    t.slot = null;
    if (S.sel === t.id) S.sel = null;
    syncArmy(); saveMeta();
      refresh();
  }
}

/* ══ 합성 — 같은 종류·같은 등급 셋 ══ */
export function mergeGroups() {
  const m = new Map();
  for (const t of META.army) {
    const k = t.kind + ":" + t.g;
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(t);
  }
  return m;
}
export function canMerge() {
  for (const [k, arr] of mergeGroups()) {
    const g = +k.split(":")[1];
    if (g < 5 && arr.length >= 3) return k;
  }
  return null;
}
export const merge = () => mergeKey(canMerge());
export function mergeKey(k) {
  if (!k) return;
  const [kind, gs] = k.split(":");
  const g = +gs;
  const arr = mergeGroups().get(k).slice(0, 3);
  // **가장 좋은 자리를 남긴다** — 합쳤더니 구석에 서 있으면 억울하다.
  // 자리에 나가 있는 것이 창고에 있는 것보다 늘 먼저다(창고 것은 덮는 게 없다).
  // 나가 있는 것을 남긴다 — 자리 배정이 흔들리지 않게. 위치 유불리는 이제 없다(벙커에서 쏜다).
  arr.sort((a, b) => (isOut(b) - isOut(a)));
  const keep = arr[0];
  const gone = new Set(arr.slice(1).map(t => t.id));
  META.army = META.army.filter(t => !gone.has(t.id));
  keep.g = g + 1;
  keep.maxHp = hpOf(keep); keep.hp = keep.maxHp;     // 합치면 새것처럼 선다
  S.sel = keep.id;
  fillFree();                                        // 셋이 하나가 되며 빈 두 자리를 메운다
  noteSeen(kind, keep.g);                            // 합쳐 오른 등급도 도감에 남는다
  refresh();                       // 자리 배치가 먼저다 — 그래야 연출이 제자리에서 터진다
  sfx("merge");
  // 대원은 벙커 안에 있으니 연출도 벙커에서 — 위로 병과와 등급이 떠오르고 링이 퍼진다.
  const c = coreCenter();
  flyText(c.x, c.y - coreRadius() - 40, "★ " + GNAME[keep.g] + " " + KINDS[kind].n, GCOL[keep.g]);
  popTower(keep, "merged");
}
// 벙커 가운데서 쏘게 된 뒤로 자리에 따른 유불리가 없다 — 늘 사방을 고르게 덮는다.
// 이름은 합성 정렬과 하네스가 아직 부르므로 남긴다.
export const coverOf = (t) => rngOf(t);
export const coreCenter = () => ({ x: px(CORE.x) + CELL * CORE.w / 2, y: py(CORE.y) + CELL * CORE.h / 2 });
export const coreRadius = () => CELL * CORE.w / 2;
/** **적이 나오는 반지름 — 놓을 수 있는 자리 바로 바깥.**
 *  판을 21×21 로 넓혔다고 이걸 같이 밀면 안 된다. 바로 앞 판에서 "적군이 너무 멀리서
 *  나온다"는 말을 듣고 526 → 326 으로 당긴 자리다. **넓힌 땅은 배경이지 싸움터가 아니다** —
 *  싸움은 여전히 본진 코앞에서 벌어지고, 벌판은 그 뒤로 펼쳐져 판을 판처럼 보이게 할 뿐이다.
 *  (RING 이 2→3 이 되면서 326 → 390 으로 한 칸만큼만 따라 밀렸다.)
 *  웨이브 화살표도 여기 선다 — 가리키는 곳과 나오는 곳이 다르면 미리 보여 주는 뜻이 없다. */
export const spawnRadius = () => coreRadius() + CELL * (RING + 1.6);

/** 해산 — 부대에서 내보내고 자원을 조금 돌려받는다. 쓸 데 없는 하급이 창고에 쌓이는 걸
 *  덜어 내는 길이자, 징집 값이 부대 크기를 따라 오르므로 **줄이는 것도 선택**이 된다. */
export const sellOf = (t) => Math.max(1, Math.round(gradeMul(t.g) * 0.8));
export function sell(id) {
  const t = META.army.find(x => x.id === (id === undefined ? S.sel : id));
  if (!t) return;
  META.relics += sellOf(t);
  META.army = META.army.filter(x => x.id !== t.id);
  if (S.sel === t.id) S.sel = null;
  fillFree(); syncArmy(); saveMeta();
  drawShop(); refresh();
}

/* 판 클릭 배치는 없다 — 대원은 벙커 안이라 판에 옮겨 세울 자리 자체가 없다.
   넣고 빼는 것은 진열대 칩과 편성 화면이 맡는다. */

/* ── 대원 능력치 — 부대 상태(placed)와 판 크기(spawnRadius)를 본다 ── */
/** 지휘관은 **벙커 전원**의 피해를 올린다. 사거리를 두지 않는 건 벙커이기 때문이다 —
 *  같은 건물 안이라 누가 누구 옆인지를 따질 것이 없다. 여럿 넣으면 그만큼 쌓인다. */
export const auraMul = () => 1 + placed().reduce(
  (s, t) => s + (KINDS[t.kind].aura || 0) * (1 + (t.g - 1) * 0.5) * kindSkill(t.kind), 0);
export const dmgOf  = (t) => Math.round(KINDS[t.kind].dmg * BUNKER_DMG * gradeMul(t.g) * metaDmg()
                                 * auraMul() * kindDmgMul(t.kind));
/** 방패병이 있으면 본진이 받는 피해가 준다. 여럿 넣으면 곱으로 쌓이되 바닥을 둔다 —
 *  방패병만 채워 무적이 되면 그건 방어가 아니라 정답이 하나뿐인 판이 된다. */
export const armorMul = () => {
  let m = 1;
  for (const t of placed()) {
    const a = KINDS[t.kind].armor;
    if (a) m *= 1 - Math.min(0.6, a * (1 + (t.g - 1) * 0.35) * kindSkill(t.kind));
  }
  return Math.max(0.28, m);
};
/** 사거리의 원점이 **벙커 가운데**가 된 뒤의 배수다.
 *  1.9 는 대원이 벙커 둘레에 흩어 서 있던 시절의 값 — 반대편 대원까지 닿게 하려는
 *  보정이었다. 원점이 가운데로 오자 그 보정이 통째로 남아돌아, 최장 사거리(437)가
 *  적 출현 반경(326)을 넘어 **나오자마자 죽었다.** 최장이 출현 반경 안쪽(~290)에,
 *  최단이 벙커 앞마당에 오도록 당긴다(1.25 는 벽이 15R 로 일렀고 1.45 가 22R 언저리). 병과별 차이는 배수라 그대로. */
export const BUNKER_RNG = 1.45;
/* 상한: 적 출현 반경 안쪽. 사거리가 출현 반경을 넘으면 **나오자마자 죽어서** 싸움이 화면
   밖 일이 된다 — 저격수가 등급·훈련으로 크면 실제로 넘는다(334 > 326). */
export const rngOf  = (t) => Math.min(spawnRadius() - 30,
  Math.round((KINDS[t.kind].rng + (t.g - 1) * 9) * BUNKER_RNG * kindRngMul(t.kind)));

/* 병과마다 다른 **특기의 대표값**. 훈련(kindSkill)만큼 자라는 것과 등급 계단마다 늘어나는 것이
   섞여 있어, 각 병과가 무엇을 키우는지(둔화·범위·연쇄·관통·회복·감쇄·지휘…)를 lv 로 계산한다.
   전투식(combat.js)과 같은 상수를 쓰되 도감은 등급1·판 상태와 무관한 값을 보여 준다. */
const DEX_SKILL = {
  frost:   (k, lv) => ["둔화", Math.round(Math.min(0.8, KINDS.frost.slow   * kindSkill(k, lv)) * 100) + "%"],
  guard:   (k, lv) => ["감쇄", Math.round(Math.min(0.6, KINDS.guard.armor  * kindSkill(k, lv)) * 100) + "%"],
  officer: (k, lv) => ["지휘", Math.round(KINDS.officer.aura * kindSkill(k, lv) * 100) + "%"],
  cannon:  (k, lv) => ["범위", "" + Math.round(KINDS.cannon.splash * kindSkill(k, lv))],
  flame:   (k, lv) => ["범위", "" + Math.round(KINDS.flame.splash  * kindSkill(k, lv))],
  mine:    (k, lv) => ["범위", "" + Math.round(KINDS.mine.splash   * kindSkill(k, lv))],
  rocket:  (k, lv) => ["범위", "" + Math.round(KINDS.rocket.splash * kindSkill(k, lv))],
  medic:   (k, lv) => ["회복", "" + Math.max(1, Math.round(KINDS.medic.heal * 0.5 * kindSkill(k, lv)))],
  bolt:    (k, lv) => ["연쇄", "" + (KINDS.bolt.chain  + Math.floor(lv / 3))],
  rail:    (k, lv) => ["관통", "" + (KINDS.rail.pierce + Math.floor(lv / 3))],
  drone:   (k)     => ["자원", "" + KINDS.drone.bounty],
};
/** 도감 카드에 적는 대표 수치 — **판 상태(출격·라운드·지휘관 버프)에 안 흔들리게** 등급1·전역
 *  업그레이드를 뺀 병과 고유값만 본다. 카드에서 바뀌는 축은 훈련이라 지금 값과 한 단계 위 값을
 *  같이 준다("41 → 47"). 실제 전투값은 등급과 지휘관으로 더 크다 — 여기 값은 병과끼리 견주고
 *  훈련이 무엇을 올리는지 읽으라고 있는 것이다. */
export function dexStat(k) {
  const K = KINDS[k], lv = kindLv(k), s = DEX_SKILL[k];
  const cur = s ? s(k, lv) : null, nxt = s ? s(k, lv + 1) : null;
  return {
    dmg:  Math.round(K.dmg * BUNKER_DMG * kindDmgMul(k, lv)),
    dmgN: Math.round(K.dmg * BUNKER_DMG * kindDmgMul(k, lv + 1)),
    /* 실전과 같은 상한(출현 반경 안쪽)을 적용한다 — 캡 없는 수치를 적으면
       "334→350"처럼 실제로는 안 오르는 사거리를 오른다고 말하는 거짓 표시가 된다. */
    rng:  Math.min(spawnRadius() - 30, Math.round(K.rng * BUNKER_RNG * kindRngMul(k, lv))),
    rngN: Math.min(spawnRadius() - 30, Math.round(K.rng * BUNKER_RNG * kindRngMul(k, lv + 1))),
    sLb:  cur ? cur[0] : null,
    sCur: cur ? cur[1] : null,
    sNxt: nxt ? nxt[1] : null,
  };
}

import { BUNKER_DMG, CORE, fragNeed, GCOL, GNAME, gradeMul, hpOf, KIND_IDS, kindDmgMul, kindLv, kindRngMul, KINDS, kindSkill, META, metaDmg, noteSeen, RING, S, saveMeta, SLOT_SPOTS, slotMax } from "./core.js";
import { CELL, px, py, say } from "./view.js";
import { drawShop, flyText, popTower } from "./combat.js";
import { refresh } from "./ui.js";
import { sfx } from "./sound.js";


/* ══════════════════════════════════════════════════════════════
   뽑기 — 이 게임의 도파민이자 **유일한 성장 통로**.
   새 종류면 부대에 들어오고, 이미 가진 종류면 그 유닛의 조각이 되어 별이 오른다.
   상급 이상은 뽑기로 바로 안 나온다 — 쌓아 올려야 나온다.
   ══════════════════════════════════════════════════════════ */
/** **뽑기** — 자원으로 새 유닛을 부대에 들인다. 판이 끝난 뒤 정산 화면에서만.
 *
 *  전에는 판마다 골드로 뽑아 그 판에서만 쓰고 버렸다. 그러면 유닛이 내 것이 아니라
 *  그 판의 소모품이고, "보유한 유닛을 배치한다"는 말이 성립하지 않는다.
 *  값은 부대가 커질수록 오른다 — 그래야 자원이 쌓였다고 무한히 불리지 못한다. */
/* 부대는 이제 열두 기에서 멎으므로(종류당 한 기) 값이 무한히 오르지는 않는다. */
export const recruitCost = () => Math.max(2, 4 - META.up.cheap) + Math.floor(META.army.length * 0.22);
/** **종류는 차차 열린다.**
 *  열두 종류를 처음부터 다 풀면 같은 종류 같은 등급 셋이 좀처럼 안 모여 합성이 죽는다
 *  (실제로 등급 1.8 까지 떨어졌다). 넷으로 시작해 최고 기록이 오를 때마다 하나씩 연다 —
 *  초반에는 셋을 모으기 쉽고, 멀리 갈수록 새 얼굴이 나와 도감이 채워진다. */
export const poolSize = () => Math.min(KIND_IDS.length, 4 + Math.floor(META.best / 4));
export const nextUnlockAt = () => (poolSize() >= KIND_IDS.length ? 0 : (poolSize() - 3) * 4);
/** 뽑기. `free` 면 값을 안 받고 토스트도 안 띄운다 — 판이 끝날 때 한꺼번에 여러 기가
 *  들어오므로, 낱개로 알리면 토스트가 줄줄이 쌓여 결과 화면을 덮는다(결과 줄에 한 번에 적는다). */
export function recruit(free) {
  const c = recruitCost();
  if (!free) {
    if (META.relics < c) return;
    META.relics -= c;
  }
  const pool = KIND_IDS.slice(0, poolSize());
  /* 균등하게 뽑는다. 이미 가진 종류에 가중치를 주면 등급이 훨씬 빨리 오르지만, 부대가 몇
     종류로 편식해 **무엇을 내보낼까가 결정이 아니게 된다** — 검증에서 "아무거나 vs 골라
     내보내기" 차이가 3.6R → 2.4R 로 줄어 판정이 깨졌다. */
  const kind = pool[Math.floor(Math.random() * pool.length)];
  const own = META.army.find(t => t.kind === kind);
  /* **이미 가진 종류면 조각이 된다.** 종류당 한 기만 보유하므로 또 나온 것을 창고에 쌓을
     데가 없다 — 대신 그 자리에서 별이 오른다. 이것이 이 게임의 합성이다. */
  if (own) {
    own.frag = (own.frag | 0) + 1;
    let up = false;
    while (own.g < 5 && own.frag >= fragNeed(own.g)) { own.frag -= fragNeed(own.g); own.g++; up = true; }
    if (up) { noteSeen(kind, own.g); gradeUpFx(own); }
    fillFree(); syncArmy(); saveMeta();
    if (!free)
      say(up ? `<b style="color:${GCOL[own.g]}">${GNAME[own.g]} ${KINDS[kind].n}</b> 등급 상승!`
             : `<b>${KINDS[kind].n}</b> 조각 +1 <span style="color:var(--dim)">(${own.frag}/${fragNeed(own.g)})</span>`);
    drawShop(); refresh();
    return own;
  }
  // 중급이 섞여 나와야 상급까지 길이 열린다. 행운이 그 확률을 올린다.
  const g = Math.random() + META.up.luck * 0.06 > 0.86 ? 2 : 1;
  const t = { id: ++META.armyId, kind, g, frag: 0, slot: null };
  META.army.push(t);
  const fresh = noteSeen(kind, g);
  fillFree();                        // 자리가 비어 있으면 바로 세운다
  syncArmy(); saveMeta();
  if (!free)
    say((fresh ? `<b style="color:var(--amber)">새 유닛!</b> ` : "") +
        `<b>${GNAME[g]} ${KINDS[kind].n}</b> 획득!`);
  drawShop(); refresh();
  return t;
}
/** 등급이 오른 순간을 벙커에서 알린다 — 예전 합성 연출을 그대로 쓴다.
 *  숫자가 불어나는 순간이 화면에 안 보이면 모으는 축은 장부에만 산다. */
function gradeUpFx(t) {
  refresh();
  sfx("merge");
  const c = coreCenter();
  flyText(c.x, c.y - coreRadius() - 40, "★ " + GNAME[t.g] + " " + KINDS[t.kind].n, GCOL[t.g]);
  const el = document.querySelector("#world .core");
  if (el) { el.classList.remove("merged"); void el.offsetWidth; el.classList.add("merged"); }
}

/** **가진 것과 내보낸 것은 다르다.** 벙커에 넣을 수 있는 자리는 몇 개뿐이고, 가진 종류는
 *  그보다 많다 — 그중 무엇을 내보낼지가 이 게임이 사람에게 묻는 것이다. */
/** **부대는 META.army 에 있다** — S.towers 가 아니다.
 *
 *  판마다 뽑아 쓰고 버리는 구조에서는 유닛이 그 판의 소모품이었다. 이제 유닛은 판을 넘어
 *  남고, 판은 **가진 것 중에서 골라 내보내는** 일이 된다. 자리는 slot 번호로 들고 있고
 *  (null 이면 창고), 화면 좌표 x·y 는 판을 시작할 때 그 번호에서 만들어 붙인다.
 *  좌표를 저장하지 않는 건 자리 수가 늘면(자리 늘리기) 같은 번호도 다른 칸이 되기 때문이다. */
export const isOut = (t) => t.slot !== null && t.slot < slotMax();
export const placed = () => META.army.filter(isOut);
export const inBox  = () => META.army.filter(t => !isOut(t));
export const occupied = () => new Set(placed().map(t => t.slot));

/** 자리 번호에서 좌표와 체력을 만들어 붙인다. 판을 시작할 때와 자리 수가 바뀔 때 부른다. */
export function syncArmy() {
  const taken = new Set();
  /* **한 종류는 한 자리만**(병수님). 규칙이 생기기 전 저장에는 같은 종류가 두 자리에
     서 있을 수 있으므로 여기서 한 번 걸러 낸다 — 규칙을 넣는 곳마다 따로 막으면
     어느 한 길이 빠졌을 때 조용히 중복이 살아남는다. 등급이 높은 쪽을 남긴다. */
  const kinds = new Set();
  for (const t of [...META.army].sort((a, b) => b.g - a.g)) {
    if (t.slot === null) continue;
    if (kinds.has(t.kind)) t.slot = null; else kinds.add(t.kind);
  }
  for (const t of META.army) {
    // 자리 늘리기를 되돌린 적은 없지만, 저장이 깨져 자리 번호가 범위를 벗어나면 창고로 돌린다
    if (t.slot !== null && (t.slot >= slotMax() || taken.has(t.slot))) t.slot = null;
    if (t.slot !== null) taken.add(t.slot);
    const p = t.slot === null ? null : SLOT_SPOTS[t.slot];
    const moved = t.x !== (p ? p[0] : null) || t.y !== (p ? p[1] : null);
    t.x = p ? p[0] : null;
    t.y = p ? p[1] : null;
    t.maxHp = hpOf(t); t.hp = t.maxHp;
    /* **쿨다운을 여기서 0 으로 밀면 안 된다.** 자동 채움이 0.4초마다 이 함수를 부르는데,
       그때마다 t.cd 를 0 으로 되돌리면 재장전 2.8초짜리 로켓병이 0.4초마다 쏜다 —
       화력이 통째로 부푼다(재 보니 벽이 20R → 28R 로 밀렸다). 자리가 실제로 바뀐
       유닛만 초기화한다. 안 바뀐 유닛은 쏘던 박자를 그대로 이어 간다. */
    if (moved || t.cd === undefined) { t.cd = 0; t.healT = 0; t.chillT = 0; }
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
/** 자리를 겨루는 기준 — 등급이 먼저, 같으면 피해. **상성은 안 본다**(일부러). */
const rank = (t) => t.g * 1e6 + dmgOf(t);

/** **빈 자리만 채운다.** 자리를 비워 두는 건 결정이 아니라 손해일 뿐이라 이건 자동이 맡는다.
 *
 *  전에는 여기서 **창고가 더 세면 자리를 빼앗기까지** 했다. 그런데 그 기준(등급·피해 높은
 *  순)이 곧 검증에서 "골라 내보내기"라고 부르던 바로 그 알고리즘이라, 사람이 배치 화면을
 *  열어 무엇을 넣든 0.4초 뒤에 자동이 제 답으로 되돌려 놓았다 — 즉 **사람 손의 기여가
 *  0 이었다.** 예고를 보고 냉동병을 넣어도 자동이 도로 뽑아 버리니 상성을 넣어도 소용이 없다.
 *  그래서 자동은 빈 자리를 메우는 데서 멈추고, 자리를 **바꾸는** 일은 사람(또는 사람이 직접
 *  누르는 「추천 배치」)에게 돌려준다. */
export function fillFree() {
  const taken = new Set(placed().map(t => t.kind));
  for (const t of inBox().sort((a, b) => rank(b) - rank(a))) {
    const free = freeSlots();
    if (!free.length) break;
    if (taken.has(t.kind)) continue;      // 한 종류는 한 자리만
    t.slot = free[0];
    taken.add(t.kind);
  }
  syncArmy(); saveMeta();
}

/** **추천 배치** — 가진 것 중 힘이 센 순으로 자리를 채운다(빈 자리 + 약한 자리 교체).
 *
 *  예전 fillFree 가 매 0.4초 몰래 하던 일이다. 하던 일 자체가 나빴던 게 아니라 **묻지도
 *  않고 했던 것**이 문제였다 — 손으로 누르는 버튼이 되면 같은 계산이 편의가 된다.
 *  기준은 순수한 힘(등급·피해)이라 **상성은 안 본다**: 예고를 읽고 갈아 끼우는 사람이
 *  이 버튼보다 잘할 여지가 남아 있어야 배치 화면을 열 이유가 생긴다. */
export function autoBest() {
  fillFree();
  /* 창고가 더 세면 바꿔 넣는다. 겨루는 상대는 **같은 종류가 나가 있으면 그것**, 없으면
     제일 약한 자리다 — 그래야 바꿔 넣는 동안에도 중복이 안 생긴다. */
  for (let guard = 0; guard < 64; guard++) {
    const box = inBox().sort((a, b) => rank(b) - rank(a));
    const out = placed().sort((a, b) => rank(a) - rank(b));
    let moved = false;
    for (const best of box) {
      const target = out.find(t => t.kind === best.kind) || out[0];
      if (!target || rank(best) <= rank(target)) continue;
      best.slot = target.slot; target.slot = null;
      moved = true; break;
    }
    if (!moved) break;
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
    /* **한 종류는 한 자리만.** 같은 종류가 이미 나가 있으면 거기에 갈아 끼운다 —
       막아 버리면 눌러도 아무 일이 없어 고장으로 읽히고, 사람이 원한 건 "이걸 넣겠다"다.
       등급이 다른 같은 종류(하급 소총병 ↔ 중급 소총병)를 갈아 끼울 때도 이 길로 온다. */
    const sameOut = placed().find(t => t.kind === kind);
    if (sameOut) {
      sameOut.slot = null;
      free = freeSlots();
    } else if (!free.length) {
      /* 자리가 꽉 찼으면 **제일 약한 것과 바꿔 넣는다** — "거둔 다음 내보내라"는 두 손질을
         요구하는 데다, 예전엔 실패 안내(토스트)마저 배치 창 밑에 깔려 그냥 고장으로 보였다. */
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

/* ══ 등급 — **중복 뽑기가 곧 합성이다** ══
   종류당 한 기만 보유하므로 "같은 것 셋을 골라 합친다"는 자리가 없다. 또 나온 것은
   recruit() 에서 그 유닛의 조각이 되고, 조각이 차면 그 자리에서 별이 오른다.
   그래서 합성 버튼도, 합성 대상 고르기도 없다 — 뽑는 것 하나로 모으기와 키우기가 겹친다. */
/** 다음 등급까지 남은 조각. 전설(5)이면 0. */
export const fragLeft = (t) => (t.g >= 5 ? 0 : fragNeed(t.g) - (t.frag | 0));
/** 등급이 오를 준비가 된 유닛이 있는가 — 화면에 "곧 오른다"를 적을 때 쓴다. */
export const nearGradeUp = () => META.army.filter(t => t.g < 5 && fragLeft(t) === 1).length;

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

/** 정리 — 부대에서 내보내고 자원을 조금 돌려받는다. 쓸 데 없는 하급이 창고에 쌓이는 걸
 *  덜어 내는 길이자, 뽑기 값이 부대 크기를 따라 오르므로 **줄이는 것도 선택**이 된다. */
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

/* 판 클릭 배치는 없다 — 유닛은 벙커 안이라 판에 옮겨 세울 자리 자체가 없다.
   넣고 빼는 것은 진열대 칩과 배치 화면이 맡는다. */

/* ── 유닛 능력치 — 부대 상태(placed)와 판 크기(spawnRadius)를 본다 ── */
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
 *  1.9 는 유닛이 벙커 둘레에 흩어 서 있던 시절의 값 — 반대편 유닛까지 닿게 하려는
 *  보정이었다. 원점이 가운데로 오자 그 보정이 통째로 남아돌아, 최장 사거리(437)가
 *  적 출현 반경(326)을 넘어 **나오자마자 죽었다.** 최장이 출현 반경 안쪽(~290)에,
 *  최단이 벙커 앞마당에 오도록 당긴다(1.25 는 벽이 15R 로 일렀고 1.45 가 22R 언저리). 종류별 차이는 배수라 그대로. */
export const BUNKER_RNG = 1.45;
/* 상한: 적 출현 반경 안쪽. 사거리가 출현 반경을 넘으면 **나오자마자 죽어서** 싸움이 화면
   밖 일이 된다 — 저격수가 등급·훈련으로 크면 실제로 넘는다(334 > 326). */
export const rngOf  = (t) => Math.min(spawnRadius() - 30,
  Math.round((KINDS[t.kind].rng + (t.g - 1) * 9) * BUNKER_RNG * kindRngMul(t.kind)));

/* 종류마다 다른 **특기의 대표값**. 훈련(kindSkill)만큼 자라는 것과 등급 계단마다 늘어나는 것이
   섞여 있어, 각 종류가 무엇을 키우는지(둔화·범위·연쇄·관통·회복·감쇄·지휘…)를 lv 로 계산한다.
   전투식(combat.js)과 같은 상수를 쓰되 도감은 등급1·판 상태와 무관한 값을 보여 준다. */
const DEX_SKILL = {
  frost:   (k, lv) => ["느리게", Math.round(Math.min(0.8, KINDS.frost.slow   * kindSkill(k, lv)) * 100) + "%"],
  guard:   (k, lv) => ["방어", Math.round(Math.min(0.6, KINDS.guard.armor  * kindSkill(k, lv)) * 100) + "%"],
  officer: (k, lv) => ["공격", Math.round(KINDS.officer.aura * kindSkill(k, lv) * 100) + "%"],
  cannon:  (k, lv) => ["범위", "" + Math.round(KINDS.cannon.splash * kindSkill(k, lv))],
  flame:   (k, lv) => ["범위", "" + Math.round(KINDS.flame.splash  * kindSkill(k, lv))],
  mine:    (k, lv) => ["범위", "" + Math.round(KINDS.mine.splash   * kindSkill(k, lv))],
  rocket:  (k, lv) => ["범위", "" + Math.round(KINDS.rocket.splash * kindSkill(k, lv))],
  medic:   (k, lv) => ["회복", "" + Math.max(1, Math.round(KINDS.medic.heal * 0.5 * kindSkill(k, lv)))],
  bolt:    (k, lv) => ["튕김", "" + (KINDS.bolt.chain  + Math.floor(lv / 3))],
  rail:    (k, lv) => ["관통", "" + (KINDS.rail.pierce + Math.floor(lv / 3))],
  drone:   (k)     => ["자원", "" + KINDS.drone.bounty],
};
/** 도감 카드에 적는 대표 수치 — **판 상태(출격·라운드·지휘관 버프)에 안 흔들리게** 등급1·전역
 *  업그레이드를 뺀 종류 고유값만 본다. 카드에서 바뀌는 축은 훈련이라 지금 값과 한 단계 위 값을
 *  같이 준다("41 → 47"). 실제 전투값은 등급과 지휘관으로 더 크다 — 여기 값은 종류끼리 견주고
 *  훈련이 무엇을 올리는지 읽으라고 있는 것이다. */
export function dexStat(k) {
  const K = KINDS[k], lv = kindLv(k), s = DEX_SKILL[k];
  const cur = s ? s(k, lv) : null, nxt = s ? s(k, lv + 1) : null;
  return {
    dmg:  Math.round(K.dmg * BUNKER_DMG * kindDmgMul(k, lv)),
    dmgN: Math.round(K.dmg * BUNKER_DMG * kindDmgMul(k, lv + 1)),
    /* 실전과 같은 상한(출현 반경 안쪽)을 적용한다 — 캡 없는 수치를 적으면
       "334→350"처럼 실제로는 안 오르는 사거리를 오른다고 말하는 거짓 표시가 된다. */
    /* 상한도 반올림한다 — spawnRadius() 가 소수라 "296.4" 같은 값이 그대로 카드에 찍혔다. */
    rng:  Math.round(Math.min(spawnRadius() - 30, K.rng * BUNKER_RNG * kindRngMul(k, lv))),
    rngN: Math.round(Math.min(spawnRadius() - 30, K.rng * BUNKER_RNG * kindRngMul(k, lv + 1))),
    sLb:  cur ? cur[0] : null,
    sCur: cur ? cur[1] : null,
    sNxt: nxt ? nxt[1] : null,
  };
}

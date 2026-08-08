let nextId = 1;   // 몹 id 는 웨이브를 만드는 여기서만 는다
import { $, foldHist, fragNeed, RARE, rarityOf, GCOL, GNAME, gradeMul, isBossR, KIND_IDS, kindCost, kindLv, KINDS, kindSkill, MEDAL_GATE, medalDmg, medalGain, medalRelic, medals, medalSlots, META, metSet, noteMet, noteSeen, slotCapped, newlySeen, nextMedalAt, relicsFor, relicTick, S, saveMeta, seenCount, slotMax, upCost, UPGRADES, waveHp, waveN, skipTo } from "./core.js";
import { banner, drawGrid, px, say } from "./view.js";
import { armorMul, autoBest, coreCenter, coreRadius, dexStat, dmgOf, fillFree, isOut, nextUnlockAt, placed, poolSize, powerOf, recruit, recruitCost, rngOf, spawnRadius } from "./army.js";
import { refresh } from "./ui.js";
import { sfx } from "./sound.js";


/* ══════════════════════════════════════════════════════════════
   웨이브 — **자동으로 싸운다.** 내가 짜 놓은 것이 나 없이 막는 걸 지켜보는 것이
   이 장르의 심장이다. 그래서 전투 중에는 손댈 것을 일부러 두지 않았다.
   ══════════════════════════════════════════════════════════ */
export const WAVE_GAP = 3.5;                  // 웨이브 사이에 숨 돌리는 시간(초)

/* **종류가 다르게 굴러야 낭떠러지가 비탈이 된다.** 전에는 여섯 종이 겉모습만 달랐다 —
   그러면 화력이 감당하는 동안은 다 같이 죽고, 한계를 넘는 순간 다 같이 새어 든다(재 보니
   처음 맞은 라운드와 죽는 라운드가 1~2R). 결을 종마다 벌려 두면 두껍고 느린 놈(brute)이
   먼저 새어 들어와 본진을 조금씩 깎고, 얇고 빠른 놈(runner)은 그래도 잡히며, 그 간격이
   라운드를 따라 벌어진다. 덤으로 위생병·냉동병처럼 때리지 않는 종류가 값을 하기 시작한다.
   수치는 시작점일 뿐 — probe 로 재서 벽 20~28R 을 유지하도록 튜닝한다. */
const MOB = {
  grunt:  { hp: 0.85, sp: 1.0 },                       // 기준
  runner: { hp: 0.5,  sp: 1.5 },                       // 빠르고 얇다 — 그래도 잡힌다
  brute:  { hp: 3.2,  sp: 0.55 },                      // 아주 느리고 아주 두껍다 — 홀로 새어 들어 본진을 조금씩 깎는다
  swarm:  { hp: 0.35, sp: 1.2, pack: [3, 4] },         // 한 번에 여럿, 낱개는 얇다 — 범위가 답이 되려면 실제로 뭉쳐 와야 한다
  shield: { hp: 1.0,  sp: 0.85, guard: 8 },            // 처음 여덟 대를 거의 다 흘린다 — 관통이 아니면 벗기는 데 시간이 든다
  boss:   { hp: 8,    sp: 0.625 },                     // 옛 15px/초 = 24×0.625, 그대로

  /* ══ 뒤에서 열리는 넷 ══
     **20 라운드가 넘어도 같은 적만 나오면 거기서 컨텐츠가 끝난다.** 재 보니 적 다섯이
     10R 에 전부 나오고 그 뒤로 새 얼굴이 없었다 — 30R 이나 15R 이나 화면이 같았다.
     넷 다 "무엇으로 상대하나"가 서로 다르게 갈리도록 둔다(겹치면 종류가 는 게 아니다). */
  /* 세기는 **자로 정한다.** 처음 값(1.1 / 0.035 / 1.0 / 6)으로는 새 적이 열리는 20R 이
     그대로 벽이 되어, 자원을 안 쓰는 봇이 스무 판을 돌아도 20R 에서 평평해졌다.
     새 얼굴은 "새로 볼 것"이지 "여기서 끝"이 아니어야 한다. */
  splitter:{ hp: 0.9, sp: 0.9,  split: 2, from: 12 },   // 죽으면 둘로 나뉜다 → 범위로 한꺼번에
  healer:  { hp: 0.8, sp: 0.8,  heal: 0.018, from: 18 },// 곁의 적을 되살린다 → 멀리서 먼저 끊어야
  shooter: { hp: 0.8, sp: 0.75, standoff: 120, from: 26 }, // 멀찍이 서서 쏜다 → 사거리 싸움
  bomber:  { hp: 1.3, sp: 0.7,  bomb: 3.5, from: 34 },  // 닿으면 한 번 크게 터진다 → 붙기 전에
};
/** 이 종류가 열리는 최소 라운드. 0 이면 처음부터. */
export const mobFrom = (k) => MOB[k]?.from || 0;

/* ══════════════════════════════════════════════════════════════
   상성 — **예고를 보고 갈아 끼울 이유.**
   ──────────────────────────────────────────────────────────────
   "방패 적이 옵니다"라고 미리 알려 주면서 정작 관통이 방패를 뚫든 말든 결과가 같으면,
   그 예고는 읽을 이유가 없는 글자다. 배치 화면을 열 이유도 같이 없어진다.
   그래서 종류마다 **실제 수치로 갈리는 약점**을 하나씩 준다 — 예고를 보고 무엇을 넣을지가
   바뀌어야 "무엇을 내보낼까"가 비로소 결정이 된다.

     빠름(runner)  느려진 동안 받는 피해 ×2       ← 냉동병
     두꺼움(brute) 한 방이 큰 공격에 ×2            ← 로켓병 · 저격수 · 지뢰병
     떼(swarm)     범위·튕김을 온전히 받는다       ← 폭탄병 · 화염병 · 전격병
     방패(shield)  처음 여덟 대를 82% 흘린다. **관통은 그냥 무시**  ← 저격수 · 연사

   **크기는 등급 계단에 견줘 정한다.** 처음엔 +45% 로 넣었는데, 등급 하나가 피해 ×3 인
   판에서 45% 는 반올림 오차다 — 실제로 재 보니 예고를 읽는 봇이 힘만 보는 봇보다
   -1R 이었다(즉 결정이 아니었다). 배로 올려야 "이번 라운드는 저격수"가 성립한다. */
/** 적 종류의 화면 이름 — 예고(상단 바)·배너·배치 화면이 **같은 표**를 봐야 말이 안 갈린다. */
export const MOBNAME = { grunt:"보통", runner:"빠름", brute:"두꺼움", swarm:"떼", shield:"방패",
  splitter:"분열", healer:"치유", shooter:"포격", bomber:"자폭" };
export const MOBWEAK = {
  runner: { lb: "느리게",    d: "느려지면 크게 다침" },
  brute:  { lb: "한 방",     d: "한 방이 큰 공격에 약함" },
  swarm:  { lb: "범위",      d: "범위·튕김을 온전히 받음" },
  shield: { lb: "연사·관통", d: "관통은 방패를 무시 · 연사로 방패를 벗김" },
  splitter:{ lb: "범위",     d: "죽으면 둘로 나뉨 — 범위로 한꺼번에 쓸어야" },
  healer:  { lb: "사거리",   d: "곁의 적을 되살림 — 멀리서 먼저 끊어야" },
  shooter: { lb: "사거리",   d: "멀찍이 서서 벙커를 포격 — 사거리가 닿아야 잡힘" },
  bomber:  { lb: "사거리·한 방", d: "닿으면 크게 터짐 — 붙기 전에 잡아야" },
};
/** 한 방이 "크다"의 기준 — 그 몹 최대 체력의 이만큼. 배수라 라운드가 올라도 뜻이 안 변한다. */
const BIGHIT = 0.09;

/* 보스(5의 배수)는 능력 하나를 안고 온다 — 라운드마다 돌려 쓴다. "큰 놈 하나 더"가 아니라
   사건이 되게. haste=곁의 적을 몰아친다, spawn=쓰러지며 새끼를 흩는다,
   ward=멀리서는 잘 안 박힌다(가까이 붙어야 온전히 들어간다). */
const BOSS_POWERS = ["haste", "spawn", "ward", "quake", "armor"];
export const POWNAME = {
  haste: "주변 적을 몰아침",
  spawn: "쓰러지면 새끼가 흩어짐",
  ward:  "멀리서는 잘 안 박힘",
  quake: "가끔 벙커를 직접 뒤흔듦",
  armor: "받는 피해가 절반",
};
export const bossPower = (r) => BOSS_POWERS[(Math.floor(r / 5) - 1 + BOSS_POWERS.length) % BOSS_POWERS.length];
/* **능력 이름만으로는 무엇을 갈아 끼울지가 안 나온다.** 「받는 피해가 절반」을 읽어도 그래서
   뭘 내보내라는 것인지는 판에서 맞아 보고야 안다 — 다섯 판 앞서 알려 주는 뜻이 없어진다.
   능력마다 **그때 유리한 것**을 한마디로 짝지어 둔다(게임이 실제로 재는 수와 같은 쪽으로:
   ward 는 120px 밖에서 0.45배, armor 는 절반, quake 는 벙커를 직접 친다). */
export const POWCOUNTER = {
  haste: "먼저 이놈부터 — 사거리",
  spawn: "새끼까지 한꺼번에 — 범위",
  ward:  "가까이서 때리는 것 — 짧은 사거리",
  quake: "빨리 끊는 것 — 연사",
  armor: "한 방이 큰 것 — 절반이 깎여도 남게",
};

/* ══ 이름 있는 놈 ══
   **보스가 5라운드마다 오는데 능력 셋이 돌기만 하면 그건 사건이 아니라 일정이다.**
   스물다섯 라운드마다 이름을 가진 놈이 온다 — 능력을 둘 안고, 훨씬 두껍고, 쓰러뜨리면
   크게 떨군다. 자주 오면 특별할 것이 없으므로 **드물게** 두는 것이 요점이다. */
/* `hue`·`ring` 은 **판 위에서 알아보게 하는 몫**이다. 배너는 한 번 뜨고 사라지므로
   이름이 나온 것을 놓치면 그 뒤로는 보통 보스와 구분할 길이 없었다 — 셋이 다 같은
   boss.png 에 같은 붉은 테였다. 몸을 키우고 색을 갈라 **보면 안다**로 만든다. */
const NAMED = [
  { n:"강철 파괴자", powers:["armor","quake"], hp:2.4, sp:0.95, hue:-150, ring:"180,190,205" },
  { n:"역병 어미",   powers:["spawn","haste"], hp:2.0, sp:1.15, hue:  60, ring:"140,190,110" },
  { n:"장막의 것",   powers:["ward","armor"],  hp:2.6, sp:0.85, hue: -95, ring:"170,130,210" },
];
/* **셋뿐이라 100R 부터는 재탕이었다.** 25·50·75 다음이 다시 강철 파괴자면 그건 순환이지
   사건이 아니다 — 한 바퀴 돌 때마다 **그다음은 더 험한 놈**이 되게 한다. 몸이 두꺼워지고
   (바퀴마다 +60%), 능력을 하나씩 더 안고(둘→셋→넷, 다섯이 상한), 이름 앞에 그 바퀴의
   수식이 붙는다 — **같은 놈이 아니라는 것이 예고 줄에서부터 읽혀야** 갈아 끼울 마음이 든다. */
const NAMED_TIER = ["", "거듭난", "굶주린", "심연의", "잿빛"];
export function namedBoss(r) {
  if (r % 25 !== 0) return null;
  const i = Math.floor(r / 25) - 1;
  const base = NAMED[i % NAMED.length];
  const cyc = Math.floor(i / NAMED.length);            // 0 = 첫 바퀴(25·50·75)
  if (!cyc) return base;
  const powers = base.powers.slice();
  const cap = Math.min(2 + cyc, BOSS_POWERS.length);
  for (const p of BOSS_POWERS) {                       // 바퀴마다 능력 하나씩 더
    if (powers.length >= cap) break;
    if (!powers.includes(p)) powers.push(p);
  }
  return { ...base, powers, n: `${NAMED_TIER[cyc] || cyc + 1 + "대"} ${base.n}`,
           hp: base.hp * (1 + 0.6 * cyc), sp: base.sp * (1 + 0.04 * cyc) };
}
/* **예고가 한 라운드 앞뿐이면 아직 준비할 시간이 아니다.** 이름은 대게 됐지만 뜨는 때가
   24R 을 마치고 나서다 — 25R 짜리에 맞춰 갈아 끼우려면 자원·합성이 몇 판 필요하다.
   그래서 몇 판 앞서 "3R 뒤 「강철 파괴자」"를 댄다. 너무 일찍부터 늘 떠 있으면 배경이
   되므로 **다섯 판 안**으로만 — 그 밖에서는 조용한 편이 정확하다. */
export const NAMED_SOON = 5;
/** 다음에 올 이름 있는 놈 — `away` 판 뒤다. 코앞(away===0)이거나 멀면 null. */
export function namedSoon(r) {
  const br = (Math.floor(r / 25) + 1) * 25;             // r 다음의 25 배수
  const away = br - r;
  if (away > NAMED_SOON) return null;
  const nb = namedBoss(br);
  return nb ? { r: br, away, nb } : null;
}

/** 이 몹이 그 능력을 가졌나 — 이름 있는 놈은 둘을 안고 온다. */
export const hasPow = (m, p) => m.powers ? m.powers.includes(p) : m.power === p;
export function bossNote(r) {
  const nb = namedBoss(r);
  if (nb) return `「${nb.n}」 — ${nb.powers.map(p => POWNAME[p]).join(" · ")}`;
  return "큰 놈 등장 — " + POWNAME[bossPower(r)];
}
/** **예고 칩을 누르면 뜨는 속.** 마우스가 있는 화면은 `title` 로 읽었지만 폰에는 마우스가
 *  없어서, 다섯 판 앞서 이름을 대 놓고도 **그놈이 무엇에 약한지는 코앞에 와야** 나왔다.
 *  칩에 `data-ex` 로 달아 `wireExact` 의 말풍선에 얹는다 — 머리줄 자리를 새로 안 먹는다. */
export function bossTip(r) {
  const nb = namedBoss(r);
  const powers = nb ? nb.powers : [bossPower(r)];
  return [`${r}R — ${nb ? `「${nb.n}」` : "큰 놈"}`,
    ...powers.map(p => `· ${POWNAME[p]}\n   → ${POWCOUNTER[p]}`)].join("\n");
}

/** 보스가 쓰러진 자리에서 새끼가 흩어진다 — runner 결의 얇은 몹 4마리. 소환 수(S.spawned)에는
 *  세지 않는다: 웨이브가 끝나려면 이 새끼들까지 치워야 하니 S.mobs 로만 남긴다. */
function spawnBrood(boss) {
  const c = coreCenter();
  for (let i = 0; i < 4; i++) {
    const th = Math.atan2(boss.y - c.y, boss.x - c.x) + (Math.random() - 0.5) * 1.2;
    const hp = waveHp(S.round) * 0.5;
    S.mobs.push({
      id: nextId++, hp, maxHp: hp, boss: false, th, kind: "runner",
      x: boss.x + (Math.random() - 0.5) * 20, y: boss.y + (Math.random() - 0.5) * 20,
      speed: 24 * MOB.runner.sp * (1 + (S.round - 1) * 0.02),
      dmg: Math.round(2 + S.round * 0.28),
      slow: 0, slowT: 0, atkT: 0, guard: 0,
    });
  }
}

/** 잔챙이를 흩뿌린다 — 분열체가 쓰러진 자리에서. 소환 수(S.spawned)에는 안 센다:
 *  웨이브가 끝나려면 이 새끼들까지 치워야 하니 S.mobs 로만 남긴다. */
function spawnLings(src, n, hpMul) {
  const c = coreCenter();
  for (let i = 0; i < n; i++) {
    const th = Math.atan2(src.y - c.y, src.x - c.x) + (Math.random() - 0.5) * 1.4;
    const hp = Math.max(1, src.maxHp * hpMul);
    S.mobs.push({
      id: nextId++, hp, maxHp: hp, boss: false, th, kind: "grunt",
      x: src.x + (Math.random() - 0.5) * 22, y: src.y + (Math.random() - 0.5) * 22,
      speed: 24 * MOB.grunt.sp * (1 + (S.round - 1) * 0.02) * 1.15,
      dmg: Math.round(src.dmg * 0.6),
      slow: 0, slowT: 0, atkT: 0, guard: 0,
    });
  }
}

export function startWave() {
  if (S.running || S.over) return;
  S.gap = 0;                           // 손으로 눌렀으면 기다리던 시간은 없던 일이 된다
  S.running = true;
  S.toSpawn = waveN(S.round);
  S.spawned = 0; S.spawnT = 0;
  /* 사건은 배너로 잠깐 — 보스가 오는 라운드, 처음 보는 종류가 섞이는 라운드.
     상시 정보(#wavebar)와 층을 가른다: 붙박이는 정보, 배너는 사건이다. */
  if (isBossR(S.round)) {
    banner(`<img class="mobico" src="assets/mob/boss.png" alt="" onerror="this.remove()"> ${bossNote(S.round)}`);
  } else {
    const fresh = freshKinds(S.round);
    if (fresh.length) banner("새로운 적 — " + fresh.map(k =>
      `<img class="mobico" src="assets/mob/${k}.png" alt="" onerror="this.remove()"> ${MOBNAME[k]}`).join(" · "), "newkind");
  }
  refresh();
}

/** 이번 웨이브가 어느 방향에서 오는가. **라운드가 오를수록 갈래가 는다** —
 *  한 쪽만 두껍게 막아 두고 넘어가지 못하게 하는 것이 이 구조의 핵심 압박이다. */
export function waveLanes(r) {
  const n = Math.min(4, 1 + Math.floor((r - 1) / 3));
  const base = (r * 1.7) % (Math.PI * 2);          // 라운드마다 방향이 돌아간다
  return Array.from({ length: n }, (_, i) => base + i * (Math.PI * 2 / n));
}

/* ══ 웨이브 테마 — **라운드마다 성격이 달라야 예고가 읽을 값이 있는 글이 된다** ══
   전에는 10 라운드부터 끝까지 같은 표를 썼다(보통 넷·빠름 둘·두꺼움·떼·방패). 그러면
   예고가 매 라운드 똑같은 말을 하고, 상성을 수치로 넣어 봐야 **갈아 끼울 대상이 없다** —
   실제로 재 보니 예고를 읽는 봇이 힘만 보는 봇보다 +0.6R, 즉 결정이 아니었다.
   라운드마다 한 종류가 주가 되게 돌리면 그때부터 "이번엔 저격수" 같은 말이 성립한다.
   섞임은 일부러 남긴다 — 늘 갈아 끼워야 하면 그것대로 잔일이 된다. */
const THEMES = [
  { n:"보통",   pool:["grunt","grunt","grunt","runner"] },
  { n:"빠름",   pool:["runner","runner","runner","grunt"] },
  { n:"두꺼움", pool:["brute","grunt","grunt","runner"] },
  { n:"떼",     pool:["swarm","swarm","swarm","grunt"] },
  { n:"방패",   pool:["shield","shield","grunt","runner"] },
  { n:"섞임",   pool:["grunt","runner","brute","swarm","shield"] },
  /* **뒤로 갈수록 테마가 는다.** 여섯 개만 돌면 10R 에 본 것을 40R 에도 본다 —
     라운드대마다 하나씩 열려야 "저기까지 가면 뭐가 나오지"가 생긴다. */
  /* 해금 지점은 **자로 정했다.** 처음엔 20·25·30·35 로 뒀는데, 자원을 안 쓰는 봇의 천장이
     마침 20R 이라 새 얼굴이 열리는 자리와 벽이 정확히 겹쳤다 — 새 적이 "새로 볼 것"이
     아니라 "여기서 끝"이 되어 버렸고, 판정(무엇을 내보내느냐)까지 같이 깨졌다.
     그래서 25·32·40·48·56 으로 올렸는데, 이번엔 **너무 멀어졌다**: 초반을 조인 뒤로
     사람이 실제로 노는 구간이 R5~R20 인데 거기서는 다섯 종만 돌아, 병수님이 "라운드
     진행이 너무 반복"이라고 했다. 강화 없이 열 판을 굴리면 R25 까지 간다(probe) —
     그 안쪽에 12·18·26·34·42 로 촘촘히 깔아, 여덟 라운드마다 새 얼굴이 하나씩 열리게 한다.
     첫 몇 판은 R4~R9 에서 끝나므로 초반이 새 적으로 덮이지도 않는다. */
  { n:"분열",   from:12, pool:["splitter","splitter","grunt","runner"] },
  { n:"치유",   from:18, pool:["healer","brute","grunt","shield"] },
  { n:"포격",   from:26, pool:["shooter","shooter","grunt","runner"] },
  { n:"자폭",   from:34, pool:["bomber","grunt","runner","swarm"] },
  { n:"난장",   from:42, pool:["splitter","healer","shooter","bomber","brute","shield"] },
];
/** 이 라운드에 쓸 수 있는 테마들 — 라운드가 오를수록 는다(그래서 주기도 길어진다). */
const themesAt = (r) => THEMES.filter(t => r >= (t.from || 0));
/** 이 라운드의 성격. 라운드에서 바로 나오므로 예고와 소환이 어긋날 수 없다. */
/** **첫 아홉 라운드는 손으로 짠 순서다.**
 *
 *  전에는 테마가 10R 부터 돌고 그 아래는 grunt 뿐이었다. 그런데 첫 판은 5R 에서 끝난다 —
 *  즉 **처음 몇 판을 하는 내내 같은 적만 본다.** 병수님: "라운드 진행이 너무 반복이고."
 *  순환에 맡기면 운이 나쁠 때 떼가 세 번 연달아 나오므로, 초반만 순서를 못 박는다:
 *  라운드마다 다른 놈이 주가 되고, 5R 관문 앞뒤로 방패·두꺼움이 붙어 관문이 벽으로 읽힌다. */
const OPENING = ["보통", "떼", "빠름", "두꺼움", "섞임", "방패", "떼", "두꺼움", "섞임"];
export function waveTheme(r) {
  if (r >= 1 && r <= OPENING.length) return THEMES.find(t => t.n === OPENING[r - 1]);
  if (r < 10) return null;
  /* **열리는 그 라운드는 그 테마로 못 박는다.** 순환에 던져 놓으면 새 얼굴이 언제 나올지
     운에 맡기게 되고, 그러면 "25라운드를 넘겼더니 처음 보는 놈이 나왔다"는 사건이 안 된다.
     이 라운드에만 배너("새로운 적")가 같이 뜬다(freshKinds). */
  const opened = THEMES.find(t => t.from === r);
  if (opened) return opened;
  const av = themesAt(r);
  return av[(r - 10) % av.length];
}
/** 이번 라운드에 나올 수 있는 종류들 — 소환과 예고가 **같은 표**를 봐야 예고가 거짓말이 안 된다. */
export function wavePool(r) {
  const th = waveTheme(r);
  return th ? th.pool
       : r < 3 ? ["grunt"]
       : r < 6 ? ["grunt","grunt","runner"]
       : ["grunt","grunt","grunt","runner"];
}
/** 이 라운드에 **처음으로** 나오는 종류들. 테마가 돌기 시작한 뒤로는 "지난 라운드에 없던 것"이
 *  곧 새 얼굴이 아니다(돌아가며 나오니까) — 여태 한 번도 안 나온 것만 새 얼굴이다. */
export function freshKinds(r) {
  const before = new Set();
  for (let i = 1; i < r; i++) for (const k of wavePool(i)) before.add(k);
  return [...new Set(wavePool(r))].filter(k => !before.has(k));
}

export function spawnMob() {
  const boss = isBossR(S.round) && S.spawned === 0;
  const lanes = waveLanes(S.round);
  /* 라운드가 오를수록 험한 놈이 섞인다. 이제 종류는 결이 다르다(위 MOB 표) — pool 이 곧 그 결의 조합.
     **두꺼운 놈(brute)은 일부러 드물게 둔다**(1/5~1/8): 얇은 다수는 화력이 계속 잡아 벽을
     늦게까지 지키고, 드물게 새어 드는 brute 만 본진을 조금씩 깎아 낭떠러지를 비탈로 편다.
     낱개 체력의 평균이 대략 1.0 이도록 섞어 벽 대역(20~28R)을 흔들지 않는다. */
  const pool = wavePool(S.round);
  const kind = boss ? "boss" : pool[Math.floor(Math.random() * pool.length)];
  const prof = MOB[kind];
  const c = coreCenter();
  /* **놓을 수 있는 자리 바로 바깥에서 나온다.** 예전엔 526px(판 대각선 절반)에서 걸어와
     화면 밖에서 한참을 왔다 — 배치 구역(반지름 224) 바로 밖 294px 로 당겼다. 그래서
     속도의 기준은 여전히 24 로 둔다: 거리를 당긴 만큼 속도를 같이 올리면 사거리 안에
     머무는 시간이 줄어(유닛 총량 = 사거리 ÷ 속도) 난이도가 튄다. 종류 배수만 그 위에 곱한다. */
  const far = spawnRadius();
  // swarm 은 한 번에 2~3마리 — 낱개로 흩뿌린다. 그 외엔 한 마리.
  const pack = prof.pack ? prof.pack[Math.floor(Math.random() * prof.pack.length)] : 1;
  for (let i = 0; i < pack; i++) {
    // 같은 갈래라도 조금씩 흩뿌린다 — 한 줄로 오면 한 타워가 다 잡는다
    const th = lanes[S.spawned % lanes.length] + (Math.random() - 0.5) * 0.5;
    /* **체력을 흩뿌린다.** 모두 같은 체력이면 한 웨이브가 통째로 죽거나 통째로 산다 —
       편차를 주면 두꺼운 놈부터 새어 들어와 본진을 조금씩 깎는다. 종류 배수(prof.hp)를
       그 편차 위에 곱한다 — brute 는 두껍고 runner·swarm 은 얇다. */
    /* 편차의 **폭은 라운드를 따라 넓어지되 평균은 1.125 로 고정**한다 — 폭만 넓히면
       평균이 같이 올라 벽 위치가 통째로 밀린다(그건 편차가 아니라 그냥 상향이다).
       후반일수록 아주 두꺼운 놈과 아주 얇은 놈이 같이 섞여, 새는 놈이 일찍부터 나온다. */
    const spread = 1.15 + Math.min(0.9, S.round * 0.03);
    const varr = boss ? 1 : Math.max(0.25, 1.125 + (Math.random() - 0.5) * spread);
    const hp = waveHp(S.round) * prof.hp * varr;
    const m = {
      id: nextId++, hp, maxHp: hp, boss, th, kind,
      x: c.x + Math.cos(th) * far, y: c.y + Math.sin(th) * far,
      speed: 24 * prof.sp * (1 + (S.round - 1) * 0.02),   // px/초 — 종류마다 결이 다르다
      // 한 대는 가볍게, 대신 **여럿이 오래** — 그래야 고치고 막는 종류가 값을 한다.
      // 계수를 0.28→0.22 로 낮춘다: 새어 든 놈이 본진을 천천히 깎아, 처음 맞은 뒤로 몇 라운드를
      // 더 버틴다(낭떠러지→비탈). 벽(=새기 시작하는 라운드)은 화력 임계라 이 값과 무관하다.
      dmg: Math.round((2 + S.round * 0.17) * (boss ? 4 : 1)),
      slow: 0, slowT: 0, atkT: 0,
      guard: prof.guard || 0,               // 방패병 — 처음 몇 대를 크게 감쇄
    };
    if (boss) {
      const nb = namedBoss(S.round);
      if (nb) { m.powers = nb.powers.slice(); m.named = nb.n;
                m.hue = nb.hue; m.ring = nb.ring;   // 판 위에서 알아보게 — 색조와 테
                m.hp = m.maxHp = hp * nb.hp; m.speed *= nb.sp; }
      else m.power = bossPower(S.round);   // 보통 보스는 능력 하나
    }
    noteMet(kind);                           // 도감에 적는다 — 만난 것만 펼쳐 보인다
    S.mobs.push(m);
  }
  // swarm 이라도 한 번의 소환은 한 번으로 센다 — waveN 은 소환 횟수다(몸은 그보다 많아질 수 있다)
  S.spawned++;
}

export const mobPos = (m) => ({ x: m.x, y: m.y });
// 본진까지 남은 거리 — 타워는 **제일 가까이 온 놈**부터 노린다
export const distToCore = (m) => Math.hypot(m.x - coreCenter().x, m.y - coreCenter().y) - coreRadius();

/** 한 대 때린다. `tag` 는 **어떻게** 맞혔는지다 — 상성이 여기서 갈린다.
 *  undefined = 직격 · "splash" = 범위 · "chain" = 튕김 · "pierce" = 관통 */
export function hurt(m, d, from, tag) {
  /* ── 상성(MOBWEAK) ── 방패 감쇄보다 **먼저** 건다: 관통이 방패를 무시하는 것과
     "느려서 크게 다친다"는 서로 다른 층이라, 섞으면 어느 쪽이 먹었는지 못 읽는다. */
  /* **상성 배수는 등급을 타고 같이 큰다.**
   *
   *  전에는 어느 등급이든 ×2 로 못 박혀 있었다. 그런데 등급은 ×3 씩 뛴다(5등급이면 ×81) —
   *  다 키우고 나면 **무엇을 내보내든 다 5등급이라 ×2 가 반올림 오차**가 된다. 실제로
   *  자 둘이 같은 말을 했다: funtest 20판에서 아무거나 vs 골라서가 +0.3R, counteraudit
   *  에서는 예고를 읽는 쪽이 오히려 -0.8R — **읽으면 손해**였다.
   *  등급을 태우면 1등급 ×2 에서 5등급 ×6 이 되어, 다 큰 뒤에도 "이번엔 저놈"이 남는다. */
  const cw = 1 + (from ? from.g : 1);
  if (m.kind === "runner" && m.slow > 0) d *= cw;
  // 두꺼운 놈은 잔매에 안 죽는다 — 한 방이 커야 값이 선다(범위 파편은 한 방으로 안 친다)
  if (m.kind === "brute" && tag !== "splash" && d >= m.maxHp * BIGHIT) d *= cw;
  /* 떼·분열체는 **범위로 쓸어야** 값이 선다. 여태 "범위를 온전히 받는다"는 말만 있고
     수치가 없어서, 도감에 적힌 상성 중 이 둘만 실제로는 아무 일도 안 했다. */
  if ((m.kind === "swarm" || m.kind === "splitter") && (tag === "splash" || tag === "chain")) d *= cw;
  // 방패병 — 처음 몇 대는 크게 흘린다(70% 감쇄). **관통은 그냥 지나간다**(대수도 안 먹는다).
  if (m.guard > 0 && tag !== "pierce") { d *= 0.18; m.guard--; }
  // 보스 ward — 멀리서는 잘 안 박힌다. 가까이 붙어야(=위험을 감수해야) 온전히 들어간다.
  if (m.boss && hasPow(m, "ward") && distToCore(m) > 120) d *= 0.45;
  // 장갑 — 받는 피해가 절반. 이름 있는 놈이 두꺼운 이유의 절반이 이것이다.
  if (m.boss && hasPow(m, "armor")) d *= 0.5;
  m.hp -= d;
  if (m.hp <= 0) {
    m.dead = true;
    /* 누적 처치. **여기서 저장하지 않는다** — 판당 수백 번 도는 자리라 localStorage 를
       때리면 그대로 프레임이 튄다. 판이 끝날 때(gameOver) 한 번에 적는다. */
    META.kills = (META.kills | 0) + 1;
    sfx(m.boss ? "boss" : "kill");
    /* 골드가 사라졌으니 정찰병의 몫도 자원 쪽으로 옮겨 간다(relicTick 에서 셈한다).
       띄우는 숫자도 골드가 아니라 **그 몫**이다 — 없는 재화를 띄우면 거짓말이 된다. */
    const extra = (from && KINDS[from.kind].bounty ? KINDS[from.kind].bounty : 1) - 1;
    S.bounty += extra;
    if (extra > 0 || m.boss) {
      const p = mobPos(m);
      flyText(p.x, p.y, m.boss ? "처치" : "+" + extra, "#e0a458");
    }
    if (m.boss) { const p = mobPos(m); bossRing(p.x, p.y); }   // 보스만 크게 — 링 확산 1회
    /* 이름 있는 놈은 **쓰러뜨린 값이 있어야 한다.** 두껍기만 하고 떨구는 게 같으면
       그건 사건이 아니라 시간 낭비다. */
    if (m.named) {
      const gain = 20 + S.round * 2;
      META.relics += gain; saveMeta();
      const p = mobPos(m);
      flyText(p.x, p.y - 30, "「" + m.named + "」 격파  +" + gain, "#e0a458");
      banner(`「${m.named}」 격파 — 자원 +${gain}`, "newkind");
    }
    dropFrag(m);                       // **판 도중에도 뭔가 떨어진다** — 파밍의 리듬이 여기서 생긴다
  }
}

/* ══════════════════════════════════════════════════════════════
   전리품 — **판 도중에도 뭔가 떨어져야 파밍이다.**
   ──────────────────────────────────────────────────────────────
   재 보니 한 판에서 사람이 받는 것이 3라운드마다 자원 숫자 하나뿐이었다. 스무 라운드를
   구경하는 동안 보상 사건이 예닐곱 번, 손으로 뽑는 건 열 판 중 여섯 판이 0회 —
   모으는 축이 통째로 **판이 끝난 뒤에만** 돌고 있었다. 그러면 그건 파밍이 아니라 정산이다.

   그래서 적을 잡으면 조각이 떨어진다. 받는 것은 **지금 벙커에 넣어 둔 유닛의 조각**이다 —
   내가 고른 것이 싸우면서 자라야 배치가 한 번 더 뜻을 갖는다(창고에 있는 것은 판이 끝난
   뒤 뽑기로 자란다). 대부분은 하나, 가끔 뭉텅이 — **가끔이 있어야 뽑는 순간에 감정이 생긴다.**
   ══════════════════════════════════════════════════════════ */
/* **리듬과 성장은 서로 다른 손잡이다.**
   조각만 떨구게 했더니 둘이 한 몸이 됐다 — 자주 떨구면(리듬) 성장이 폭주하고, 조이면
   판 도중 아무 일도 안 일어난다. 실제로 조각만으로 0.05 를 돌렸더니 다섯 판째에 40 라운드를
   넘겨 검증이 스무 분이 되도록 안 끝났다(사람이 하면 한 판이 삼십 분이라는 뜻이다).
   그래서 **떨어지는 것은 자주, 그중 조각은 가끔**으로 갈랐다. 대부분은 자원 한 줌이고
   — 자원은 이미 완만하게 설계된 축이라 폭주하지 않는다 — 넷에 하나쯤만 조각이다. */
/* **총량은 그대로, 받는 횟수만 늘린다.**
   조각까지 떨구게 했더니 경제가 폭주했다 — 다섯 판째에 마흔 라운드를 넘겨 검증이 삼십 분
   넘게 안 끝났고, 그건 사람이 하면 한 판이 삼십 분이라는 뜻이다. 그래서 전리품은
   **자원만** 준다. 세 라운드마다 뭉텅이로 주던 것(relicTick)을 여기로 옮겼을 뿐이라
   총량은 거의 그대로고, 받는 횟수가 판당 예닐곱 번에서 열몇 번으로 는다.
   조각(등급)은 예전처럼 판이 끝난 뒤 뽑기로만 — 그쪽은 다음에 손대야 할 축이다. */
/* **처치당 확률이라 마릿수가 곧 수입이다.** 라운드를 길게 하려고 마릿수를 두 배 넘게
   올렸더니(6+2.4r → 14+3.0r) 판마다 들어오는 자원도 같이 두 배가 되어, 더 어려워지라고
   한 변경이 probe 에서 오히려 벽을 R4 → R7 로 밀어냈다. 마릿수가 오른 만큼 내린다. */
export const DROP_RATE = 0.016;
export const FRAG_SHARE = 0.25;         // 전리품 중 조각의 몫. 나머지 넷 중 셋은 자원
/** 떨어지는 크기. 대부분 하나, 열에 하나쯤 둘, 서른에 하나쯤 다섯. */
function dropSize() {
  const r = Math.random();
  return r > 0.97 ? 5 : r > 0.85 ? 2 : 1;
}
function dropFrag(m) {
  if (m.noLoot) return;                    // 스스로 터진 자폭체는 남기는 것이 없다
  if (!m.boss && Math.random() > DROP_RATE) return;
  const p = mobPos(m);
  /* 넷 중 셋은 자원 — 세 라운드마다 뭉텅이로 주던 것을 잘게 쪼갠 것이다(총량은 그대로). */
  if (!m.boss && Math.random() > FRAG_SHARE) {
    const n = dropSize();
    META.relics += n;
    flyText(p.x, p.y, "+" + n, n >= 5 ? "#e0a458" : "#c8a05a");
    if (n >= 5) sfx("coin");   // 뭉텅이만 소리 — 낱개까지 울리면 소음이 된다
    return;
  }
  /* 넷 중 하나는 **지금 벙커에 넣어 둔 유닛의 조각**이다 — 내가 고른 것이 싸우면서 자란다.
     창고에 있는 것은 판이 끝난 뒤 뽑기로 자란다(배치가 한 번 더 뜻을 갖는 자리). */
  const out = placed();
  if (!out.length) return;
  const n = m.boss ? 6 + dropSize() : dropSize();
  const t = out[Math.floor(Math.random() * out.length)];
  t.frag = (t.frag | 0) + n;
  const K = KINDS[t.kind];
  /* **한 번에 한 별까지만.** 뭉텅이가 하급 유닛에 떨어지면 별이 둘씩 올라 피해가 ×9 가 된다.
     남는 조각은 그대로 쌓여 다음 별로 간다(잃는 것은 없다). */
  if (t.g < 5 && t.frag >= fragNeed(t.g)) {
    t.frag -= fragNeed(t.g); t.g++;
    noteSeen(t.kind, t.g);
    sfx("merge");
    const c = coreCenter();
    flyText(c.x, c.y - coreRadius() - 40, "★ " + GNAME[t.g] + " " + K.n, GCOL[t.g]);
    const el = $("coreEl");
    if (el) { el.classList.remove("merged"); void el.offsetWidth; el.classList.add("merged"); }
    refresh();
  } else {
    flyText(p.x, p.y, K.ico + " +" + n, n >= 5 ? "#e0a458" : "#7fb069");
  }
  saveMeta();
}

/** 맞은 자리에 이펙트를 한 번 얹는다. 에셋이 없으면 조용히 사라진다. */
export function boom(x, y, kind) {
  if (S.fxBusy > 24) return;                 // 한꺼번에 수십 개가 뜨면 프레임이 떨어진다
  S.fxBusy = (S.fxBusy || 0) + 1;
  const img = document.createElement("img");
  img.className = "boom";
  img.src = `assets/fx/${kind}.png`;
  img.style.cssText = `left:${x}px;top:${y}px`;
  img.onerror = () => { img.remove(); S.fxBusy--; };
  $("world").appendChild(img);
  setTimeout(() => { img.remove(); S.fxBusy--; }, 300);
}

/** 발사 순간 총안구에서 튀는 짧은 섬광. **DOM 한 개를 자리만 옮겨 재쓴다** — 여러 자리가
 *  거의 동시에 쏘지만 눈에는 벙커에서 불빛이 튀는 것으로 뭉쳐 읽히면 되니 하나면 족하다. */
let muzzleEl = null;
function muzzle(x, y, col) {
  if (!muzzleEl) {
    muzzleEl = document.createElement("div");
    muzzleEl.className = "muzzle";
    $("world").appendChild(muzzleEl);
  }
  muzzleEl.style.cssText = `left:${x}px;top:${y}px;background:${col};color:${col}`;
  // 애니메이션을 다시 태우려면 클래스를 뗐다 붙인다(reflow 사이에 끼워야 재시작한다)
  muzzleEl.classList.remove("on"); void muzzleEl.offsetWidth; muzzleEl.classList.add("on");
}

/** 벙커 피격 — 맞는 순간 스프라이트가 아주 살짝 흔들리고 붉은 비네트가 한 번 깜빡인다.
 *  **과하면 역효과라** 0.5초에 한 번만(연속 피격 스로틀). 배속(6배)의 서브틱과 무관해야
 *  하니 게임 시간이 아니라 **실제 시각**으로 잰다. */
let lastHitFx = 0;
function bunkerHit() {
  const now = performance.now();
  if (now - lastHitFx < 500) return;
  lastHitFx = now;
  const el = $("coreEl");
  // 흔드는 건 스프라이트(.cspr)뿐 — .core 자체에 걸면 합성 연출(merged)의 animation 과 부딪힌다
  if (el) { el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }
  let v = $("hitVig");
  if (!v) {
    // 붉은 비네트는 **화면 좌표**에 둔다 — #world 안에 넣으면 배율·이동을 같이 타 가장자리가 어긋난다
    v = document.createElement("div");
    v.id = "hitVig";
    ($("field") || document.body).appendChild(v);
  }
  v.classList.remove("on"); void v.offsetWidth; v.classList.add("on");
}

/** 보스 처치 — 큰 사건이니 링이 한 번 크게 퍼진다(잡몹은 기존 boom 을 그대로 쓴다). */
function bossRing(x, y) {
  const el = document.createElement("div");
  el.className = "bossRing";
  el.style.cssText = `left:${x}px;top:${y}px`;
  $("world").appendChild(el);
  setTimeout(() => el.remove(), 600);
}

/** 합쳐지면 벙커가 한 번 빛난다 — 유닛이 안에 있으니 연출도 벙커에서 터져야 맞다. */
export function popTower(t, cls) {
  const el = $("coreEl");
  if (!el) return;
  el.classList.remove("merged"); void el.offsetWidth; el.classList.add("merged");
}

/* 떠오르는 숫자에도 **상한이 있어야 한다.** 전리품이 떨어지기 시작하자 한 웨이브에 수백 개가
   동시에 살아 있어(각자 0.7초) 브라우저가 기어갔다 — 6배속에서 프레임이 무너지고, 검증
   하네스는 여섯 판에 삼십 분이 걸렸다. 이펙트(boom)와 같은 방식으로 동시 수를 묶는다. */
let flyAlive = 0;
export function flyText(x, y, text, col) {
  if (flyAlive > 20) return;
  flyAlive++;
  const el = document.createElement("div");
  el.className = "fly"; el.textContent = text;
  el.style.cssText = `left:${x}px;top:${y}px;color:${col}`;
  $("world").appendChild(el);
  setTimeout(() => { el.remove(); flyAlive--; }, 700);
}

export let last = performance.now();
export function step(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  // **배속은 한 번에 크게 밀지 않고 여러 번 나눠 민다.** dt 를 통째로 곱하면 빠른 적이
  // 타워를 통과해 버리거나 코어를 지나쳐 판정이 튄다.
  if (!S.over) for (let i = 0; i < S.speed; i++) tick(dt);
  paint();
  requestAnimationFrame(step);
}

export function tick(dt) {
  // 소환
  if (S.running && S.spawned < S.toSpawn) {
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      spawnMob();
      /* **웨이브 후반은 러시다.** 고르게 흘려 넣으면 화력이 감당하는 동안 긴장이 0이다 —
         남은 40%를 몰아치면 순간 밀도가 화력을 잠깐 넘어서고, 중반에도 체력바가 움직인다.
         위생병·방패병이 값을 하는 순간이 여기서 생긴다. */
      const prog = S.spawned / Math.max(1, S.toSpawn);
      S.spawnT = prog > 0.65 ? 0.5 : 0.95;
    }
  }
  // 이동과 교전.
  // 적이 노리는 건 벙커 하나다. 유닛은 그 안에 있어 맞지 않는다.
  const c = coreCenter(), cr = coreRadius();
  // 보스 haste — 곁의 적을 몰아친다. 오라(170px) 안의 몹은 1.5배로 온다(보스 자신은 뺀다).
  const haste = S.mobs.find(m => m.boss && hasPow(m, "haste"));
  for (const m of S.mobs) {
    if (m.slowT > 0) { m.slowT -= dt; if (m.slowT <= 0) m.slow = 0; }
    m.atkT -= dt;

    /* **적이 노리는 건 벙커 하나다.**
     *
     *  전에는 코앞의 유닛에게 막혀 그를 때렸다. 자리가 셋뿐인 구조에서 그러면 유닛이
     *  죽어 없어지고 화력이 통째로 사라져 그 판이 거기서 끝난다(여섯 판 중 세 판이 1R).
     *  맞는 것을 본진으로 돌려도 마찬가지였다 — 막혀 있는 동안 그 피해가 전부 본진으로
     *  들어가 오히려 더 빨리 무너졌다. 유닛은 벙커 안에 있는 것이니 **아예 맞지 않는다.**
     *  깎이는 것은 본진뿐이고, 그래서 방어는 받는 피해를 줄이는 일(방패병)과
     *  깎인 것을 되돌리는 일(위생병)로 갈린다. 잃는 것은 판이지 모아 온 유닛이 아니다. */
    m.stuck = false;
    const prof = MOB[m.kind] || {};
    const d = Math.hypot(m.x - c.x, m.y - c.y);
    /* **포격병은 붙지 않는다.** 사거리 밖에 서서 쏘므로, 벙커에 닿아야만 때린다는 전제가
       여기서 깨진다 — 멈추는 거리를 종류가 정하게 한다. 그러면 "사거리가 닿아야 잡힌다"가
       실제 규칙이 되고, 짧은 사거리(화염병·지뢰병)만 세워 두면 손도 못 대고 맞는다. */
    const reach = cr + 8 + (prof.standoff || 0);
    if (d <= reach) {                             // 때릴 자리에 닿았다
      m.stuck = true;
      /* 포격체가 처음 자리를 잡으면 **한 번만** 말해 준다 — 매번 띄우면 잔소리다. */
      if (prof.standoff && !S.saidStandoff) {
        S.saidStandoff = true;
        say('<b style="color:var(--bad)">포격</b>은 멀리서 쏨 — <b>사거리 긴 유닛</b>이라야 닿음');
      }
      /* **자폭체는 한 번뿐이다.** 닿는 순간 크게 터지고 스스로 사라진다 —
         붙기 전에 잡아야 한다는 압박이 여기서 생긴다(막으면 그 판은 안 깎인다). */
      if (prof.bomb) {
        const hit = Math.max(1, Math.round(m.dmg * prof.bomb * armorMul()));
        S.coreHp -= hit;
        m.dead = true; m.noLoot = true;           // 스스로 터진 것은 전리품이 없다
        sfx("hitCore"); boom(m.x, m.y, "blast");
        flyText(c.x, c.y - cr, "-" + hit, "#e0a458");
        bunkerHit();
        if (S.coreHp <= 0) { S.coreHp = 0; gameOver(); return; }
        continue;
      }
      if (m.atkT <= 0) {
        /* 언 놈은 때리는 손도 느리다 — 이게 없으면 냉동은 도착만 늦출 뿐 총 피해를 못 줄인다
           (붙은 놈은 멈춰서 때리므로 이동 감속이 무의미해진다). 심사에서 +0.3R 로 죽어 있던 이유. */
        /* 언 놈은 때리는 손도 느리다. 다만 **곱이 크면 냉기장 하나가 모든 상성을 덮는다** —
           2.5 로 두었더니 방패 웨이브에서 입는 피해가 4296 → 348 로 떨어져, 어느 테마가
           오든 답이 냉동병 하나가 됐다(즉 예고를 읽을 이유가 도로 없어진다). 1.0 이면
           여전히 세지만 절대적이지는 않다. */
        m.atkT = 1 * (1 + m.slow * 1.0);
        const hit = Math.max(1, Math.round(m.dmg * armorMul()));
        S.coreHp -= hit;
        sfx("hitCore");
        flyText(c.x, c.y - cr, "-" + hit, "#d05353");
        // 멀리서 쏘는 놈은 **탄이 보여야** 왜 깎이는지 읽힌다(붙은 놈은 붙은 게 곧 설명이다)
        if (prof.standoff) S.shots.push({ x: m.x, y: m.y, tx: c.x, ty: c.y, life: 0.16, col: "#d05353" });
        bunkerHit();                       // 맞는 손맛 — 흔들림·붉은 비네트(0.5초 스로틀)
        if (S.coreHp <= 0) { S.coreHp = 0; gameOver(); return; }
      }
      continue;
    }
    let sp = m.speed;
    if (haste && m !== haste && Math.hypot(m.x - haste.x, m.y - haste.y) < 170) sp *= 1.5;
    const v = sp * (1 - m.slow) * dt;
    m.x += (c.x - m.x) / d * v;
    m.y += (c.y - m.y) / d * v;
  }
  // 보스 spawn — 쓰러지며 새끼 4마리를 흩는다. 필터로 치우기 직전에 한 번만.
  for (const m of S.mobs) if (m.dead && m.boss && hasPow(m, "spawn") && !m.split) { m.split = true; spawnBrood(m); }
  /* 분열체 — 쓰러지면 둘로 나뉜다. **새끼는 다시 안 나뉜다**(grunt 로 낳는다) —
     안 그러면 한 마리가 웨이브를 무한히 늘려 판이 안 끝난다. */
  for (const m of S.mobs) {
    if (!m.dead || m.split || !(MOB[m.kind] || {}).split) continue;
    m.split = true;
    spawnLings(m, MOB[m.kind].split, 0.4);
  }
  S.mobs = S.mobs.filter(m => !m.dead);

  /* ══ 알아서 돌린다 ══
     **방치형은 손을 떼도 굴러가야 한다.** 웨이브만 이어지고 뽑기·합성을 손으로 눌러야 하면
     그건 방치가 아니라 그냥 버튼이 하나 줄어든 것이다. 판 안에서 손이 갈 일은 없애고,
     빈 자리만 채운다 — 사람에게 남는 결정은 **무엇을 내보낼지와 무엇에 자원을 쓸지**다.
     한 틱에 몰아 하지 않고 0.4초에 한 번만 손을 대, 불어나는 게 눈에 보이게 한다. */
  /* 배치 화면이 열려 있는 동안은 손을 뗀다 — 사람이 거둔 자리를 0.4초 만에 도로
     채우면 "거두기가 안 된다"로 보인다(실제로 그렇게 보였다). 닫으면 다시 맡는다. */
  /* **빈 자리는 늘 채우고, 자리를 바꾸는 건 ⚙ 를 켰을 때만.**
     빈 자리를 두는 건 결정이 아니라 손해라 그건 언제나 자동이 맡는다. 반면 "누구를 빼고
     누구를 넣을까"는 이 게임이 사람에게 묻는 유일한 것이라, 묻지도 않고 자동이 제 답으로
     되돌려 놓으면 배치 화면을 열 이유가 사라진다(그게 "할 일이 없다"의 정체였다).
     ⚙ 는 그래서 **다 맡긴다**는 뜻이 되고, 끄면 사람이 정한 대로 남는다. */
  if (!S.over && !$("squad").classList.contains("on")) {
    S.autoT = (S.autoT || 0) - dt;
    if (S.autoT <= 0) {
      S.autoT = 0.4;
      const before = placed().map(t => t.id).join(",");
      if (S.autoRun) autoBest(); else fillFree();
      // 바뀌었으면 패널도 깨운다 — 상태만 바뀌고 화면이 낡으면 "자리 0/3"이 첫인상이 된다(실제로 그랬다)
      if (placed().map(t => t.id).join(",") !== before) refresh();
    }
  }

  /* 큰 놈의 포효(quake) — **멀리 있어도 벙커가 흔들린다.** 보스가 화면 끝에 있는 동안
     아무 일도 안 일어나면 "큰 놈이 온다"는 예고가 허풍이 된다. */
  for (const m of S.mobs) {
    if (!m.boss || m.dead || !hasPow(m, "quake")) continue;
    m.quakeT = (m.quakeT || 4) - dt;
    if (m.quakeT > 0) continue;
    m.quakeT = 4;
    const hit = Math.max(1, Math.round(m.dmg * 1.6 * armorMul()));
    S.coreHp -= hit;
    sfx("hitCore"); bunkerHit();
    flyText(c.x, c.y - cr, "-" + hit, "#e0a458");
    if (S.coreHp <= 0) { S.coreHp = 0; gameOver(); return; }
  }

  /* 치유체 — 곁의 적을 조금씩 되살린다. **끊지 않으면 웨이브가 안 죽는다**는 압박이라
     사거리가 긴 종류로 먼저 걷어내는 것이 답이 된다(붙기를 기다리면 이미 늦다).
     자기 자신은 안 고친다 — 그러면 혼자 불사가 되어 교착이 난다. */
  for (const h of S.mobs) {
    const hp = (MOB[h.kind] || {}).heal;
    if (!hp || h.dead) continue;
    h.healT = (h.healT || 0) - dt;
    if (h.healT > 0) continue;
    h.healT = 0.5;
    for (const m of S.mobs) {
      if (m === h || m.dead || m.hp >= m.maxHp) continue;
      if (Math.hypot(m.x - h.x, m.y - h.y) > 110) continue;
      m.hp = Math.min(m.maxHp, m.hp + m.maxHp * hp);
    }
  }

  /* 냉동병 — **냉기장**이다. 사거리 안 모든 적이 느려진다(이동도, 벙커를 때리는 손도).
     한 발씩 얼리는 방식은 사방에서 붙는 적을 못 덮어 심사에서 +0.3R 로 죽어 있었다 —
     제어 종류는 낱발이 아니라 장판이어야 이 구조(한 점 벙커, 전방위 쇄도)에서 값을 한다. */
  for (const t of placed()) {
    const K2 = KINDS[t.kind];
    if (!K2.slow) continue;
    t.chillT = (t.chillT || 0) - dt;
    if (t.chillT > 0) continue;
    t.chillT = 0.3;
    const c2 = coreCenter();
    const r2 = rngOf(t), sk2 = kindSkill(t.kind);
    const s2 = Math.min(0.55, K2.slow * sk2 * (1 + (t.g - 1) * 0.25));
    for (const m of S.mobs) {
      if (Math.hypot(m.x - c2.x, m.y - c2.y) > r2) continue;
      m.slow = Math.max(m.slow, s2); m.slowT = Math.max(m.slowT, 0.5);
    }
  }

  /* 위생병 — 싸우는 동안 **본진**을 고친다. 유닛이 안 죽게 된 뒤로 깎이는 것은 본진뿐이고,
     그러니 고칠 것도 본진이다. 웨이브 도중에만 의미가 있는 힘이다. */
  for (const t of placed()) {
    const h = KINDS[t.kind].heal;
    if (!h) continue;
    t.healT = (t.healT || 0) - dt;
    if (t.healT > 0) continue;
    t.healT = 1.2;
    if (S.coreHp >= S.coreMax) continue;
    const amt = Math.max(1, Math.round(h * gradeMul(t.g) * 0.5 * kindSkill(t.kind)));
    S.coreHp = Math.min(S.coreMax, S.coreHp + amt);
    const c2 = coreCenter();
    flyText(c2.x, c2.y - coreRadius(), "+" + amt, "#7fb069");
  }

  // 유닛 — **내보낸 것만 쏜다.** 창고에 있는 건 구경만 한다.
  // 유닛은 벙커 안에 있으므로 사거리도 탄도 전부 **벙커**가 기준이다.
  const cc = coreCenter();
  for (const t of placed()) {
    t.cd = (t.cd || 0) - dt;
    if (t.cd > 0) continue;
    const K = KINDS[t.kind], r = rngOf(t);
    // **벙커에 제일 가까이 온 놈부터** 노린다 — 먼 놈을 먼저 잡으면 코앞의 것을 놓친다.
    // 지뢰밭만은 **멈춰 붙은 놈**을 노린다 — 그래야 "달라붙은 것들을 한꺼번에"가 된다.
    /* 지뢰병(arm)은 **붙은 놈 우선, 없으면 가까운 놈** — "붙은 놈만"으로 두면 벙커가 안
       맞는 동안(대부분의 라운드) 완전 무직이다. 심사에서 +0.3R, 소총병만도 못했다. */
    let best = null, bestD = 1e9, bestStuck = null, bestStuckD = 1e9;
    for (const m of S.mobs) {
      if (Math.hypot(m.x - cc.x, m.y - cc.y) > r) continue;
      const d = distToCore(m);
      if (d < bestD) { bestD = d; best = m; }
      if (m.stuck && d < bestStuckD) { bestStuckD = d; bestStuck = m; }
    }
    if (K.arm && bestStuck) best = bestStuck;
    if (!best) continue;
    t.cd = K.cd;
    const d = dmgOf(t);
    const bp = mobPos(best);
    /* 총안구 — 탄은 벙커의 **목표를 향한 면**에서 나간다. 자리 번호만큼 옆으로 어긋나게
       해서, 여럿이 같은 놈을 쏠 때도 줄기가 한 가닥으로 뭉개지지 않는다. */
    const L = Math.hypot(bp.x - cc.x, bp.y - cc.y) || 1;
    const dirx = (bp.x - cc.x) / L, diry = (bp.y - cc.y) / L;
    const lat = ((t.slot ?? 0) - (slotMax() - 1) / 2) * 9;
    const tx = cc.x + dirx * coreRadius() * 0.9 - diry * lat;
    const ty = cc.y + diry * coreRadius() * 0.9 + dirx * lat;
    S.shots.push({ x: tx, y: ty, tx: bp.x, ty: bp.y, life: 0.14, col: K.col });
    muzzle(tx, ty, K.col);                  // 총안구에서 불빛이 튄다
    sfx(K.cd >= 2 ? "heavy" : "shoot");     // 느리고 무거운 종류(로켓·저격·지뢰)는 소리도 무겁게
    boom(bp.x, bp.y, K.fx || "hit");

    // 관통을 가진 종류는 **첫 표적부터** 방패를 무시한다 — 뒤엣놈만 뚫리면 "관통이 답"이 안 된다
    hurt(best, d, t, K.pierce ? "pierce" : undefined);
    // 훈련 등급이 오르면 그 종류의 특기도 같이 자란다 — 그게 곧 스킬 성장이다
    const sk = kindSkill(t.kind);
    if (K.slow) { best.slow = Math.max(best.slow, Math.min(0.8, K.slow * sk)); best.slowT = 1.1; }
    /* 범위 파편은 본래 절반 조금 넘게 들어간다. **떼(swarm)에게만 온전히** 들어간다 —
       "여럿이 몰려오면 터뜨리는 게 답"이 수치로 성립해야 예고가 읽을 값이 있는 글이 된다. */
    if (K.splash) for (const m of S.mobs) {
      if (m === best || m.dead) continue;
      const p = mobPos(m);
      if (Math.hypot(p.x - bp.x, p.y - bp.y) <= K.splash * sk)
        hurt(m, Math.round(d * (m.kind === "swarm" ? 1 : 0.55)), t, "splash");
    }
    if (K.chain) {
      let n = K.chain + Math.floor(kindLv(t.kind) / 3);
      for (const m of S.mobs) {
        if (n <= 0) break;
        if (m === best || m.dead) continue;
        const p = mobPos(m);
        if (Math.hypot(p.x - bp.x, p.y - bp.y) <= 70) {
          // 튕김도 떼에게는 온전히 — 전격병이 "떼의 답" 축에 같이 선다
          hurt(m, Math.round(d * (m.kind === "swarm" ? 0.9 : 0.5)), t, "chain");
          S.shots.push({ x: bp.x, y: bp.y, tx: p.x, ty: p.y, life: 0.12, col: K.col });
          n--;
        }
      }
    }
    // 관통 — 탄이 지나간 **직선 위**의 것들도 맞는다. 한 갈래로 몰려오면 값을 한다.
    if (K.pierce) {
      let n = K.pierce + Math.floor(kindLv(t.kind) / 3);
      const ux = (bp.x - tx) / (Math.hypot(bp.x - tx, bp.y - ty) || 1);
      const uy = (bp.y - ty) / (Math.hypot(bp.x - tx, bp.y - ty) || 1);
      for (const m of S.mobs) {
        if (n <= 0) break;
        if (m === best || m.dead) continue;
        const rx = m.x - tx, ry = m.y - ty;
        const along = rx * ux + ry * uy;
        if (along < 0 || along > r) continue;
        if (Math.abs(rx * uy - ry * ux) > 16) continue;    // 선에서 벗어난 것은 뺀다
        hurt(m, Math.round(d * 0.7), t, "pierce");         // 관통은 방패를 무시하고 지나간다
        n--;
      }
    }
  }
  for (const s of S.shots) s.life -= dt;
  S.shots = S.shots.filter(s => s.life > 0);

  /* **다음 웨이브는 알아서 온다.** 라운드마다 시작 버튼을 찾아 누르게 하면, 짜 놓은 것이
     나 없이 막는 걸 보는 게 아니라 매 판 손이 가는 일이 된다(병수님 지적). 막고 나면
     잠깐 숨 돌릴 틈만 주고 이어 간다 — 뽑기·합성·자리 바꾸기는 웨이브 중에도 되므로
     이 틈은 정비 시간이 아니라 **한 라운드가 끝났다는 것을 읽을 시간**이다. */
  if (!S.running && !S.over && S.auto && S.gap > 0) {
    S.gap -= dt;
    if (S.gap <= 0) { S.gap = 0; startWave(); }
  }

  // 웨이브 끝
  if (S.running && S.spawned >= S.toSpawn && !S.mobs.length) {
    S.running = false;
    S.gap = WAVE_GAP;
    // 웨이브가 끝나면 성한 것은 추스른다. 안 그러면 바깥에 두는 값이 너무 비싸다 —
    // 잃는 것은 **완전히 부서졌을 때뿐**이어야 한다.
    for (const t of placed()) t.hp = t.maxHp;
    const rel = relicTick(S.round) + Math.floor(S.bounty / 16);
    if (rel) S.bounty = 0;
    if (rel) {
      const first = META.relics === 0;      // 이 판에서 처음 손에 쥐는 자원인가
      META.relics += rel; saveMeta();
      // 처음 한 번은 어디서 쓰는지까지 말해 준다. 두 번째부터는 잔소리다.
      if (first) say('자원 획득 — <b style="color:var(--amber)">판이 끝나면</b> 능력치와 유닛 강화');
    }
    S.round++;
    drawGrid();            // 다음 웨이브가 오는 갈래가 바뀌었다
    refresh();
  }
}

/* 화면에 나가는 말은 어미 없는 짧은 명사구 — 등수도 숫자 대신 우리말로 읽는다. */
const NTH = ["", "첫", "두", "세", "네", "다섯", "여섯", "일곱", "여덟"];
/** 방금 끝난 판이 **최근 여덟 판 중 몇 번째**인가. 이 판은 이미 hist 맨 앞에 들어 있다.
 *  같은 라운드는 같은 등수로 본다(자기보다 **더 멀리 간 판**만 센다).
 *  세 판이 안 쌓였으면 아무 말도 안 한다 — 두 판 중 첫 번째는 정보가 아니다. */
function runRank() {
  const recent = (Array.isArray(META.hist) ? META.hist : []).slice(0, 8);
  if (recent.length < 3) return "";
  const rank = 1 + recent.filter(v => v > recent[0]).length;
  const of = `최근 ${NTH[recent.length]} 판 중`;
  return rank === 1 ? `${of} 가장 멀리` : `${of} ${NTH[rank]} 번째`;
}

export function gameOver() {
  S.over = true; S.running = false; S.mobs = []; S.shots = [];
  document.querySelectorAll("#world .fly, #world .boom").forEach(e => e.remove());
  const got = relicsFor(S.round);
  META.relics += got;
  /* **판이 끝나면 유닛이 공짜로 합류한다.**
     뽑기가 업그레이드와 같은 지갑(자원)을 두고 겨루는데, 업그레이드는 싸고 영구라 늘 이긴다.
     그래서 부대가 안 자라고 — 재 보니 여덟 판을 도는 동안 **합성이 0 회**였다. 모으는 축을
     지갑에서 떼어 내 도달 라운드에 직접 매단다: 멀리 갈수록 더 온다. */
  const rolls = 1 + Math.floor(S.round / 7);
  let fresh = 0;
  /* **귀한 게 왔으면 그걸 먼저 말한다.** 판이 끝날 때 뽑기는 조용히 여러 번 도는데,
     결과 줄이 "새 유닛 +2 · 조각 +3" 뿐이면 로켓병이 온 판과 소총병이 온 판이 같은 줄이다.
     뽑기의 감정은 **무엇이 왔는지**에 있다. */
  const rareGot = [];
  for (let i = 0; i < rolls; i++) {
    const before = META.army.length;
    const t = recruit(true);
    if (META.army.length > before) {
      fresh++;
      if (t && rarityOf(t.kind) > 0) rareGot.push(t.kind);
    }
  }
  /* **"승리"라고 쓰면 안 된다.** 이 게임에서 판이 끝나는 방식은 하나뿐이다 — 벙커가
     부서지는 것. 기록을 넘어선 판을 "승리"라고 적었더니, 벙커 체력 0 으로 무너진 화면에
     승리라고 떠서 병수님이 지적했다(2026-08-08). 맞는 말이다: **졌는데 이겼다고 말하면
     그건 표현이 아니라 거짓말이다.**
     기록을 넘긴 것은 축하할 일이지 이긴 것이 아니므로, 제목을 「최고 기록」으로 바꾼다. */
  const best = S.round > META.best;
  META.best = Math.max(META.best, S.round);
  /* 이 판을 기록에 남긴다. 최근 것이 앞이고 24판까지 판마다,
     그 뒤로 밀려난 판은 열 판 평균으로 접어 둔다(버리지 않는다). */
  META.runs = (META.runs | 0) + 1;
  META.hist = [S.round, ...(Array.isArray(META.hist) ? META.hist : [])];
  /* 끝낸 시각도 같이 남긴다 — 막대만으로는 어제 굴린 판인지 한 달 전 판인지가 안 남는다.
     첫 판 시각은 접혀 나가도 "며칠째"가 살아야 하므로 따로 든다. */
  const stamp = Date.now();
  META.histT = [stamp, ...(Array.isArray(META.histT) ? META.histT : [])];
  if (!(META.firstRun > 0)) META.firstRun = stamp;
  foldHist(META);
  saveMeta();
  sfx(best ? "win" : "lose");
  /* **건너뛰기 버튼은 갈 수 있을 때만 보인다.** 최고 기록이 낮으면(첫 몇 판) 건너뛸 데가
     없으므로 아예 숨긴다 — 눌리지도 않는 버튼이 자리만 먹으면 화면이 시끄러워진다. */
  const sk = $("skipBtn"), to = skipTo();
  if (sk) {
    sk.style.display = to >= 5 ? "" : "none";
    sk.textContent = to + "라운드부터";
  }
  $("overT").textContent = best ? "최고 기록" : "패배";
  $("overT").style.color = best ? "#e0a458" : "#d05353";
  /* ══ 어디서 막혔나를 **관문으로** 말한다 ══
     인크리멘털은 "얼마나 갔나"가 아니라 **"무엇을 못 넘었나"**로 읽혀야 강화할 이유가 선다.
     이 게임은 5라운드마다 큰 놈이 오므로 그것이 곧 관문이다 — 첫 판이 5R 에서 끝나면
     그건 "5라운드까지 갔다"가 아니라 **"첫 큰 놈을 못 넘었다"**다. 그리고 다음 관문이
     어디인지 같이 적어 두면 강화 화면을 여는 손이 그 숫자를 보고 움직인다. */
  const gateHere = isBossR(S.round);          // 큰 놈이 오는 라운드에서 무너졌나
  const nextGate = Math.ceil((S.round + (gateHere ? 1 : 0)) / 5) * 5;
  const gateLine = best
    ? `다음 관문 <b style="color:var(--amber)">${nextGate}라운드</b> 큰 놈`
    : gateHere
      ? `<b style="color:var(--bad)">${S.round}라운드 큰 놈</b>을 못 넘음 · 강화하고 다시`
      : `다음 관문 <b style="color:var(--amber)">${nextGate}라운드</b> 큰 놈`;
  $("overD").innerHTML = (best
    ? `<b>${S.round}라운드</b>에서 벙커 파괴 — <b style="color:var(--amber)">여태 가장 멀리</b><br>` +
      `<b style="color:var(--amber)">자원 +${got}</b>`
    : `<b>${S.round}라운드</b>에서 벙커 파괴 · 최고 ${META.best}라운드<br>` +
      `<b style="color:var(--amber)">자원 +${got}</b>`) +
    `<br><span style="color:var(--steel);font-size:12px">${gateLine}</span>`;
  /* 받은 것을 정산에 적는다. **새 종류와 조각을 갈라서** 적어야 한다 — 둘 다 "유닛 +N"
     이라고 하면 부대가 안 늘었는데 늘었다고 말하는 셈이다(조각은 별로 간다). */
  $("overD").innerHTML += ` · <b style="color:#7fb069">` +
    [rareGot.length ? rareGot.map(k =>
       `<b style="color:${RARE[rarityOf(k)].col}">${RARE[rarityOf(k)].n} ${KINDS[k].n}</b>`).join(" · ") : "",
     fresh ? `새 유닛 +${fresh}` : "", rolls - fresh ? `조각 +${rolls - fresh}` : ""]
      .filter(Boolean).join(" · ") + `</b>`;
  /* 환생할 것이 생겼으면 결과에서 한 줄로 알린다 — 강화 메뉴를 열어 봐야 아는 성장 축이면
     있으나 마나다. 다만 여기서 하지는 않는다: 되돌릴 수 없는 결정은 제 자리에서 내린다. */
  /* **이번 판이 최근 것들 사이에서 몇 번째인가.** 쌓인 것이 「강화」 안에만 있어서, 판을
     닫을 때마다 보이는 것은 이번 라운드 수 하나뿐이었다 — 늘고 있는지 줄고 있는지가
     안 읽힌다. 최고 기록은 한 번 세우면 몇 십 판을 안 움직이므로 자로 쓸 수 없다.
     최근 여덟 판 안에서의 등수는 매 판 바뀌어 **판마다 읽힌다**. */
  const rankLine = runRank();
  if (rankLine) $("overD").innerHTML += `<br><span style="color:#8a8f98">${rankLine}</span>`;
  if (medalGain() > 0)
    $("overD").innerHTML += `<br><b style="color:#d6a84a">「강화」에서 환생 가능 — 훈장 +${medalGain()}</b>`;
  drawShop();
  $("over").classList.add("on");
}

// 자원 상점. **뚫린 화면에서 바로 세지는 게 보여야** "한 판 더"에 손이 간다.
export function drawShop() {
  $("shop").innerHTML = Object.entries(UPGRADES).map(([k, u]) => {
    const c = upCost(k), lv = META.up[k];
    // 자리는 종류 수에서 멎는다 — 더 살 수 있게 두면 안 쓰이는 자리에 자원을 붓게 된다
    const capped = k === "slots" && slotCapped();
    return `<button class="up" data-up="${k}" ${capped || META.relics < c ? "disabled" : ""}>
      <span class="n">${u.n}${lv ? ` <span class="dim">${lv}</span>` : ""}</span>
      <span class="d">${capped ? "더 늘려도 빈 자리 (종류 " + KIND_IDS.length + "개가 상한)" : u.d}</span>
      <span class="p">${capped ? "최대" : "자원 " + c}</span></button>`;
  }).join("");
  setNum($("shopHave"), META.relics, "자원");
  setNum($("shopHave2"), META.relics, "자원");
  $("recCost").textContent = recruitCost();
  $("recruitBtn").disabled = META.relics < recruitCost();
  const nx = nextUnlockAt();
  /* **전투력을 상점 맨 위에 둔다.** 여기서 사는 것마다 이 숫자가 오르는 걸 봐야
     「공격력 +13%」가 장부가 아니라 손에 잡히는 것이 된다. */
  $("armyNote").innerHTML =
    `전투력 ${exNum(powerOf(), "", "var(--amber)")} · ` +
    `유닛 <b>${META.army.length}</b>기 · 자리 <b>${slotMax()}</b> · 나오는 종류 <b>${poolSize()}</b>/${KIND_IDS.length}` +
    (nx ? ` — <b style="color:var(--steel)">${nx}라운드</b>를 넘기면 하나 더 해금` : "");

  /* 도감 — 아직 못 본 종류도 **자리를 비워 둔 채로 보여 준다.** 몇 개가 남았는지 보이지
     않으면 모을 이유가 생기지 않는다. 만난 최고 등급을 별로 남기고, 수치·다음 목표까지 적어
     도감이 "수집의 지도"가 되게 한다. */
  const dxRow = (lb, cur, nxt) =>
    `<span class="dxs"><i>${lb}</i>${cur}${nxt != null && nxt !== cur ? `<b>→${nxt}</b>` : ""}</span>`;
  $("dex").innerHTML = KIND_IDS.map((k, i) => {
    const g = META.seen[k] | 0, K = KINDS[k];
    if (!g) {
      /* ??? 도 **다음 목표**를 적는다. 넷째부터 최고 라운드 (i-3)*5 마다 하나씩 열리니(poolSize),
         "무엇이, 언제 열리는지"가 보이면 못 본 칸도 밀어 볼 이유가 된다. */
      const at = Math.max(0, i - 3) * 4;   // poolSize 와 같은 걸음(4라운드마다 하나) — 5 로 두어 40R 이라 적고 있었다
      return `<div class="dxc off" title="아직 못 만남"><span class="ico">?</span>
           <span class="dxn">???</span>
           <span class="dxt">${at ? `최고 <b>${at}R</b>에 해금` : "곧 해금"}</span></div>`;
    }
    /* 만난 종류는 **키울 수 있다.** 누를 수 있게 해 두면 "이번엔 저격수를 밀어 보자"가 성립하고,
       카드에 지금 피해·사거리·특기와 한 단계 위 값을 적어 무엇이 얼마나 오를지 미리 보인다. */
    const lv = kindLv(k), c = kindCost(k), can = META.relics >= c, s = dexStat(k);
    return `<button class="dxc train${can ? " can" : ""}" data-train="${k}"
         title="${K.n} — ${K.d}${K.vs ? "&#10;" + K.vs : ""}&#10;${lv}단계 · 다음 단계 자원 ${c}">
       ${newlySeen.has(k) ? `<span class="dxnew">NEW</span>` : ""}
       <img class="spr" src="assets/unit/${k}.png" alt=""
         onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()">
       <span class="ico">${K.ico}</span>
       <span class="dxn">${K.n}</span>
       <span class="dxg" style="color:${GCOL[g]}">${"★".repeat(Math.min(g,5))}</span>
       <span class="dxst">${dxRow("피해", s.dmg, s.dmgN)}${dxRow("사거리", s.rng, s.rngN)}${
         s.sLb ? dxRow(s.sLb, s.sCur, s.sNxt) : ""}</span>
       <span class="dxt">${lv}단계 <b>자원 ${c}</b></span></button>`;
  }).join("");
  $("dexHave").textContent = seenCount();
  $("dexAll").textContent = KIND_IDS.length;
  drawMobDex();
  drawStats();
  drawMedals();
}

/** 기록 — **쌓인 것을 보는 자리.** 방치형의 재미 하나는 "내가 이만큼 굴렸다"인데,
 *  그 증거가 최고 라운드 숫자 하나뿐이었다. 누적 처치·판 수·최근 스물넷의 이력을 함께
 *  놓으면 늘고 있는지 멎었는지가 한눈에 읽힌다 — 멎었으면 그게 환생할 때다. */
/** 그 판을 **언제** 굴렸나. 날짜를 적는 것보다 자정 기준으로 센 "오늘 / 어제 / N일 전"이
 *  낫다 — 방치형에서 알고 싶은 건 날짜가 아니라 **요즘 하고 있나**다.
 *  시각이 없는 옛 세이브의 판은 빈 문자열 — 없던 날짜를 지어내지 않는다. */
const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const daysAgo = ts => Math.round((midnight(Date.now()) - midnight(ts)) / 864e5);
function whenSay(ts) {
  if (!(ts > 0)) return "";
  const d = daysAgo(ts);
  // 달은 우리말 셈씨로 — 「1달 전」은 읽히지 않는다. 여섯 달을 넘으면 숫자로 돌아간다.
  const MON = ["", "한", "두", "석", "넉", "다섯", "여섯"];
  const m = Math.floor(d / 30);
  return d <= 0 ? "오늘" : d === 1 ? "어제" : d < 30 ? `${d}일 전` : `${MON[m] || m} 달 전`;
}

/** 접힌 묶음이 **언제의 열 판**인가. 낱개 시각은 접히며 사라졌지만 묶음의 처음·끝은 남는다 —
 *  같은 날짜 말이 나오면 하나만, 걸쳐 있으면 「두 달 전~한 달 전」. 시각을 안 들고 있던
 *  옛 묶음은 그냥 「옛 」 — 없던 날짜를 지어내지 않는다. */
function epWhen(e) {
  const a = whenSay(e?.t0 > 0 ? e.t0 : 0), b = whenSay(e?.t1 > 0 ? e.t1 : 0);
  if (!a && !b) return "옛 ";
  if (!a || !b || a === b) return `${a || b} `;
  /* 두 끝이 같은 단위면 앞머리만 잇는다 — 「넉 달 전~석 달 전」은 320px 뜻풀이 줄을
     두 줄로 접어 뒷말을 밀어낸다(tools/histepoch.mjs 가 잡는다). */
  for (const suf of [" 달 전", "일 전"]) {
    if (a.endsWith(suf) && b.endsWith(suf))
      return `${a.slice(0, -suf.length)}~${b.slice(0, -suf.length)}${suf} `;
  }
  return `${a}~${b} `;
}

/** 큰 수는 **줄여 적는다.** 넉 장은 `repeat(4,1fr)` 이지만 칸 안이 「1,284,000」처럼
 *  안 접히는 덩어리면 그 칸이 제 몫보다 넓어지고 옆칸을 빼앗는다 — 320px 에서
 *  96 / 39 / 65 / 55px 까지 기울었다. 백 판 굴린 사람일수록 더 기운다.
 *  `min-width:0` 만 주면 이번엔 숫자가 칸 밖으로 나가니, 수 자체를 짧게 적는 쪽이 맞다.
 *  만 아래는 그대로, 위는 「128만」·「1.2억」 — 화면 말투도 짧은 명사구다.
 *  정확한 수는 title 로 남는다. */
export const shortNum = v => {
  const n = Math.max(0, Math.floor(Number(v) || 0));
  if (n < 10000) return n.toLocaleString();
  const [div, unit] = n >= 1e8 ? [1e8, "억"] : [1e4, "만"];
  const m = n / div;
  // 열 미만은 한 자리를 남긴다 — 「1만」과 「1.9만」은 배 가까이 다르다
  return (m < 10 ? m.toFixed(1).replace(/\.0$/, "") : Math.round(m)) + unit;
};

/** 줄여 적은 수를 **한 자리에 박아 넣는다** — 화면엔 「128만」, 정확한 수는 title.
 *  `shortNum` 을 부르는 자리마다 title 을 빼먹기 쉬워서 둘을 묶어 둔다.
 *  **폰엔 마우스가 없다** — title 만으로는 손가락으로 영영 못 읽으므로 `data-ex` 도 같이
 *  달아 둔다(누르면 뜨는 쪽은 `wireExact` 하나가 맡는다). */
export const setNum = (el, v, unit = "") => {
  if (!el) return;
  const exact = `${Math.max(0, Math.floor(Number(v) || 0)).toLocaleString()}${unit}`;
  el.textContent = shortNum(v);
  el.title = exact;
  el.dataset.ex = exact;
  el.classList.add("exn");
};

/** 같은 것을 **글줄 안에** 박을 때 — 밑줄·머리줄처럼 innerHTML 로 짜는 자리용. */
export const exNum = (v, unit = "", col = "") => {
  const exact = `${Math.max(0, Math.floor(Number(v) || 0)).toLocaleString()}${unit}`;
  return `<b class="exn"${col ? ` style="color:${col}"` : ""} title="${exact}" data-ex="${exact}">${shortNum(v)}</b>`;
};

/** **줄여 적은 수를 폰에서도 읽는다 — 손잡이 하나로.**
 *  「128만」의 원래 수가 title 뿐이라 마우스 없는 화면에선 못 읽었다. 붙은 자리가 여섯이라
 *  자리마다 따로 달면 다음에 하나 더 붙일 때 또 빼먹는다 — 문서에 딱 하나 걸고, 표시는
 *  `data-ex` 를 단 것이 알아서 뜬다. 누른 자리 바로 위에 짧게 떴다 사라진다.
 *  버튼 안의 수는 건드리지 않는다 — 버튼은 눌리면 제 할 일(상점 열기)을 해야 한다. */
export function wireExact() {
  let bub = null, timer = 0;
  const hide = () => { if (bub) bub.classList.remove("on"); clearTimeout(timer); };
  document.addEventListener("click", e => {
    const t = e.target instanceof Element ? e.target.closest("[data-ex]") : null;
    if (!t || t.closest("button")) return hide();
    if (!bub) { bub = document.createElement("div"); bub.id = "exbub"; document.body.appendChild(bub); }
    const txt = t.dataset.ex;
    bub.textContent = txt;
    /* 수 하나면 한 줄이지만 예고 칩의 속은 여러 줄이다 — 320px 에서 nowrap 이면 화면 밖으로
       샌다. 줄바꿈이 들어 있을 때만 여러 줄 꼴로 편다. */
    bub.classList.toggle("multi", txt.includes("\n"));
    bub.classList.add("on");
    const r = t.getBoundingClientRect(), w = bub.offsetWidth, h = bub.offsetHeight;
    // 화면 밖으로 나가지 않게 좌우를 물린다 — 320px 에서 오른쪽 끝 숫자가 잘리던 자리
    bub.style.left = Math.round(Math.min(Math.max(6, r.left + r.width / 2 - w / 2), innerWidth - w - 6)) + "px";
    /* 머리줄은 화면 맨 위라 그 위에 뜰 자리가 없다 — 위가 모자라면 아래로 넘긴다.
       (예전엔 top 을 4 로 물려서 칩을 가린 채 떴다.) */
    bub.style.top = Math.round(r.top - h - 6 >= 4 ? r.top - h - 6 : Math.min(r.bottom + 6, innerHeight - h - 4)) + "px";
    clearTimeout(timer);
    timer = setTimeout(hide, txt.includes("\n") ? 4600 : 2200);
  }, true);
}

export function drawStats() {
  const hist = Array.isArray(META.hist) ? META.hist : [];
  const histT = Array.isArray(META.histT) ? META.histT : [];
  const runs = META.runs | 0, kills = META.kills | 0;
  const avg = hist.length ? hist.reduce((a, b) => a + b, 0) / hist.length : 0;
  const cell = (lb, v, col, tt) =>
    `<div class="stc${tt ? " exn" : ""}"${tt ? ` title="${tt}" data-ex="${tt}"` : ""}><span class="stv"${col ? ` style="color:${col}"` : ""}>${v}</span>
       <span class="stl">${lb}</span></div>`;
  $("stats").innerHTML =
    cell("누적 처치", shortNum(kills), "#d05353", `${kills.toLocaleString()}기`) +
    cell("판 수", shortNum(runs), "", `${runs.toLocaleString()}판`) +
    cell("최고 라운드", (META.best | 0), "var(--amber)") +
    cell("최근 평균", avg ? avg.toFixed(1) : "—", "#7fb069");
  /* 이력 막대 — 왼쪽이 오래된 것, 오른쪽이 방금 것. 최고 기록을 세운 판만 호박색으로
     찍는다(그게 이 그래프에서 유일하게 사건인 지점이다).
     **왼쪽 앞머리는 접힌 옛 판**이다 — 열 판 평균 한 칸, 흐린 색에 얇은 간격으로 갈라 둔다.
     스물넷에서 잘라 버리면 백 판을 굴려도 "예전엔 이랬는데"가 어디에도 안 남는다. */
  const eps = Array.isArray(META.epochs) ? META.epochs : [];
  const epAvg = eps.map(e => e.sum / Math.max(1, e.n));
  const top = Math.max(1, ...hist, ...epAvg);
  // 접혀 나간 판들의 최고가 곧 최근 구간이 넘어야 할 선 — 여기서부터 되짚는다
  let run = eps.reduce((m, e) => Math.max(m, e.max | 0), 0);
  const marks = hist.slice().reverse().map(v => { const nw = v > run; run = Math.max(run, v); return nw; });
  const bar = (h, cls, title, st = "") =>
    `<i class="hb${cls}" style="height:${Math.max(6, Math.round(h / top * 100))}%;${st}"
       title="${title}" data-say="${title}"></i>`;
  /* 옛 묶음은 **멀수록 흐리게**. 넷이 다 같은 사선 무늬라 "왼쪽이 더 옛날"이 안 읽혔다 —
     묶음은 다 열 판씩이라 폭으로는 못 가른다. 바래는 정도가 곧 거리다. */
  const fade = i => `opacity:${(0.42 + 0.58 * (i + 1) / eps.length).toFixed(2)}`;
  /* **처음 켠 사람에겐 이 화면이 0 넷과 빈 줄뿐이다.** 무엇이 쌓이는 자리인지가 안 보이니
     들어와 볼 이유도 없다. 한 판도 안 끝냈으면 **예시 그래프**를 흐리게 깔아 둔다 —
     오르는 열넉 칸에 마지막이 호박색(최고 기록). 눌리지 않고 「예시」라 적어 두어
     제 기록으로 오해할 자리를 없앤다. 첫 판이 끝나면 통째로 사라진다. */
  const GHOST = [4, 6, 5, 8, 7, 9, 8, 12, 10, 14, 13, 17, 16, 21];
  const ghost = () => {
    const gt = Math.max(...GHOST);
    return `<span class="ghlab">예시</span>` + GHOST.map((v, i) =>
      `<i class="hb gh${i === GHOST.length - 1 ? " nw" : ""}"
         style="height:${Math.round(v / gt * 100)}%"></i>`).join("");
  };
  $("hist").innerHTML = hist.length
    ? eps.map((e, i) => bar(epAvg[i], " old", `${epWhen(e)}${e.n}판 평균 ${epAvg[i].toFixed(1)}라운드 · 최고 ${e.max | 0}`, fade(i))).join("")
      + (eps.length ? `<i class="hsep"></i>` : "")
      + hist.slice().reverse().map((v, i) => {
          const ts = histT[hist.length - 1 - i];              // 막대는 옛것이 왼쪽, 저장은 최근이 앞
          const when = whenSay(ts);
          /* **날이 바뀌는 자리에 선.** 스물넷 막대가 판 순서일 뿐이라 "어제 다섯 판 굴렸구나"가
             막대를 눌러야만 보였다. 앞 막대와 날이 다르면 그 왼쪽에 얇은 선을 세운다.
             맨 왼쪽 판과 시각 없는 옛 세이브의 판은 견줄 앞날이 없으니 긋지 않는다. */
          const prev = histT[hist.length - i];
          const newDay = i > 0 && ts > 0 && prev > 0 && midnight(ts) !== midnight(prev);
          return bar(v, (marks[i] ? " nw" : "") + (newDay ? " day" : ""),
                     `${v}라운드${when ? ` · ${when}` : ""}${marks[i] ? " — 최고 기록" : ""}`);
        }).join("")
    : ghost();
  /* 막대 뜻풀이 — **폰엔 마우스가 없다.** 옛 묶음이 무엇인지가 title 에만 있어서 손가락으로는
     영영 못 읽었다. 색 뜻은 밑에 적어 두고, 막대를 누르면 그 판의 설명이 같은 자리에 뜬다. */
  const lg = $("histLegend");
  const legend = () => {
    lg.innerHTML = hist.length
      ? (eps.length ? `<span class="lgi"><i class="sw old"></i>옛 열 판<span class="lgx">씩 묶음</span></span>` : "") +
        `<span class="lgi"><i class="sw"></i>한 판</span>` +
        (marks.some(Boolean) ? `<span class="lgi"><i class="sw nw"></i>최고</span>` : "") +
        `<span class="lgi dim">눌러서 그 판</span>`
      : `<span class="lgi dim">예시 — 판마다 한 칸, 높이가 그 판의 라운드</span>`;
  };
  legend();
  $("hist").onclick = e => {
    const say = e.target && e.target.dataset && e.target.dataset.say;
    if (say) lg.innerHTML = `<span class="rd">${say}</span>`;
    else legend();
  };
  /* 밑줄 한 줄 — 옛 묶음이 있으면 **그때와 지금을 나란히** 놓는다. 그게 이 화면의 요점이다. */
  const first = eps[0];
  const firstWhen = first ? (w => w === "옛" ? "" : w)(epWhen(first).trim()) : "";
  /* **며칠째인가.** 스물넷 막대는 판 순서일 뿐이라 어제 굴린 건지 한 달 전 건지가 안 남는다.
     굴린 날수와 오늘 판 수를 한 줄로 놓으면 그래프가 언제의 것인지가 붙는다.
     시각을 안 들고 있던 옛 세이브에는 이 줄이 없다 — 다음 판부터 쌓인다. */
  const dayLine = (() => {
    const nth = META.firstRun > 0 ? daysAgo(META.firstRun) + 1 : 0;
    if (!nth) return "";
    const today = histT.filter(t => t > 0 && daysAgo(t) <= 0).length;
    const last = histT.find(t => t > 0);
    return `<br>굴린 지 <b>${nth}</b>일째 · ` +
      (today ? `오늘 <b>${today}</b>판` : `마지막 판 <b>${whenSay(last)}</b>`);
  })();
  $("statNote").innerHTML = runs
    ? `한 판에 평균 <b>${(kills / runs).toFixed(0)}</b>기 처치` +
      (hist.length >= 4
        ? ` · 최근 넷 평균 <b>${(hist.slice(0, 4).reduce((a, b) => a + b, 0) / 4).toFixed(1)}</b>라운드` : "") +
      /* **언제의 첫 판인가.** 「첫 10판 평균」이 그때와 지금을 나란히 놓는 줄인데, 그 「그때」가
         막대를 눌러야만 뜨는 설명 안에만 있었다. 묶음이 든 시각을 괄호로 붙여 안 눌러도 읽히게.
         시각을 안 들고 있던 옛 세이브(「옛 」)에는 괄호를 안 단다 — 없던 날짜를 지어내지 않는다. */
      (first ? ` · 첫 ${first.n}판${firstWhen ? `(${firstWhen})` : ""} 평균 ` +
               `<b>${(first.sum / first.n).toFixed(1)}</b>라운드` : "") +
      dayLine
    : `처음 한 판을 끝내면 기록이 남는다`;
}

/** 적 도감 — **만난 적만** 펼쳐 보이고, 못 만난 것은 "몇 라운드에 나온다"만 적는다.
 *  적기는 것은 하나다: **무엇에 약한가.** 그게 배치 화면을 열 이유이자 이 게임의 결정이다. */
export function drawMobDex() {
  const met = metSet();
  const ORDER = ["grunt", "runner", "brute", "swarm", "shield", "splitter", "healer", "shooter", "bomber", "boss"];
  $("mdex").innerHTML = ORDER.map(k => {
    const w = MOBWEAK[k], from = mobFrom(k);
    if (!met.has(k)) {
      return `<div class="mdc off" title="아직 못 만남"><span class="ico">?</span>
        <span class="mdn">???</span>
        <span class="mdt">${from ? `<b>${from}R</b>부터` : "곧"}</span></div>`;
    }
    const nm = k === "boss" ? "큰 놈" : MOBNAME[k];
    return `<div class="mdc k-${k}" title="${nm}${w ? " — " + w.d : ""}">
      <img class="spr" src="assets/mob/${k}.png" alt=""
        onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()">
      <span class="mdn">${nm}</span>
      <span class="mdt">${w ? w.d : (k === "boss" ? "5라운드마다 · 능력을 하나 안고 옴" : "특별한 것 없음")}</span></div>`;
  }).join("");
  $("mdexHave").textContent = ORDER.filter(k => met.has(k)).length;
  $("mdexAll").textContent = ORDER.length;
}

/** 환생 칸. **지금 무엇을 얻고 무엇을 잃는지**를 버튼 앞에서 다 말한다 —
 *  되돌릴 수 없는 버튼이라 누른 뒤에 알게 되면 그건 함정이다. */
export function drawMedals() {
  const n = medals(), g = medalGain(), nx = nextMedalAt();
  $("medalHave").textContent = n;
  $("medalNote").innerHTML = (n
      ? `훈장 <b style="color:var(--amber)">${n}</b> — 모든 피해 <b>+${Math.round((medalDmg() - 1) * 100)}%</b> · ` +
        `자원 <b>+${Math.round((medalRelic() - 1) * 100)}%</b>` +
        (medalSlots() ? ` · 시작 자리 <b>+${medalSlots()}</b>` : "")
      : `훈장은 <b>환생해도 유지</b> — 모든 피해 · 자원 · 시작 자리가 영구 상승`) +
    `<br>` + (g
      ? `환생하면 <b style="color:var(--amber)">유닛 · 능력치 · 키운 단계 · 가진 자원</b> 초기화. ` +
        `<b style="color:var(--steel)">도감과 최고 기록은 유지.</b>`
      : nx
        ? `<b style="color:var(--steel)">${nx}라운드</b>를 넘기면 훈장 +1`
        : `지금은 받을 훈장 없음`);
  const b = $("prestigeBtn");
  b.disabled = g <= 0;
  b.textContent = g > 0 ? `환생하기 — 훈장 +${g}` : `환생 — ${MEDAL_GATE}라운드부터`;
  b.classList.toggle("can", g > 0);
}

/* ══ 그리기 ══ */
/** 유닛은 벙커 안이라 판에 그릴 것이 없다 — 고른 유닛의 **사거리 링**만 벙커에서 그린다.
 *  사거리의 중심이 벙커라는 것 자체가 "안에서 쏜다"는 설명이다. */
export function drawTowers() {
  [...document.querySelectorAll("#world .rng")].forEach(e => e.remove());
  const t = META.army.find(x => x.id === S.sel);
  if (!t || !isOut(t)) return;
  const c = coreCenter(), r = rngOf(t), rg = document.createElement("div");
  rg.className = "rng";
  rg.style.cssText = `left:${c.x-r}px;top:${c.y-r}px;width:${r*2}px;height:${r*2}px;
    border-color:${KINDS[t.kind].col}`;
  $("world").appendChild(rg);
}

/* ══ 색을 **미리 구워 둔다** ══
   적 스프라이트마다 CSS 필터가 여섯 단이었다(drop-shadow · grayscale · sepia · saturate ·
   hue-rotate · brightness). 필터는 그 요소가 다시 칠해질 때마다 통째로 다시 도는데, 적은
   매 프레임 움직이므로 **백서른 마리면 프레임마다 백서른 장을 다시 칠한다.**
   병수님: "적군 많이 나오면 렉 걸린다."

   같은 필터를 캔버스에 **한 번만** 걸어 구워 두고, 그 결과를 그림으로 쓴다. 화면에 보이는
   색은 한 픽셀도 안 달라지고(같은 필터 문자열이다), 판 위에서는 필터가 아예 사라진다.
   종류마다 보통·서리 두 장이면 되고, 이름 있는 놈(한 번에 한 마리)만 CSS 로 남긴다. */
const TINT = {
  splitter: "grayscale(1) sepia(1) saturate(4.5) hue-rotate(-72deg) brightness(1)",
  healer:   "grayscale(1) sepia(1) saturate(4) hue-rotate(50deg) brightness(1.05)",
  shooter:  "grayscale(1) sepia(1) saturate(5) hue-rotate(-8deg) brightness(1.05)",
  bomber:   "grayscale(1) sepia(1) saturate(6) hue-rotate(4deg) brightness(1.15)",
};
const TINT_BASE = "grayscale(1) sepia(1) saturate(5.5) hue-rotate(-32deg) brightness(.95)";
const TINT_SLOW = "grayscale(1) sepia(1) saturate(4) hue-rotate(160deg) brightness(1.15)";
const baked = new Map();          // "kind|slow" → 구운 그림의 주소
/** 구워 준다. 아직 안 구워졌으면 원본 주소를 돌려주고, 다 구워지면 그때 갈아 끼운다 —
 *  그림 한 장 읽는 동안 판이 멈출 이유가 없다. */
function bakedSrc(kind, slow) {
  const key = kind + (slow ? "|s" : "");
  if (baked.has(key)) return baked.get(key);
  const src = `assets/mob/${kind}.png`;
  baked.set(key, src);            // 구워지기 전에는 원본 그대로
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth || 32; c.height = img.naturalHeight || 32;
      const x = c.getContext("2d");
      x.imageSmoothingEnabled = false;
      x.filter = slow ? TINT_SLOW : (TINT[kind] || TINT_BASE);
      x.drawImage(img, 0, 0);
      baked.set(key, c.toDataURL());
    } catch { /* 캔버스가 막히면 원본으로 산다 — 색만 달라지고 판은 돈다 */ }
  };
  img.src = src;
  return src;
}

export let mobEls = new Map();
/** 탄은 만들어 두고 돌려 쓴다 — 매 프레임 지웠다 만들면 그 수만큼 레이아웃이 돈다. */
const shotPool = [];
export let towersHurtLast = false;
export function paint() {
  // 몹
  const alive = new Set();
  for (const m of S.mobs) {
    alive.add(m.id);
    let el = mobEls.get(m.id);
    if (!el) {
      el = document.createElement("div");
      /* 종류를 클래스로 남긴다 — **색조를 종류마다 갈라야 한 화면에서 구분된다.**
         공통 필터 하나로 전부 붉게 물들이면 치유체의 초록도 자폭체의 불꽃도 죽는다. */
      el.className = "mob k-" + m.kind + (m.boss ? " boss" : "") + (m.named ? " named" : "");
      /* **이름은 몸에 붙어 있어야 한다** — 배너는 한 번 뜨고 사라진다. 이름표는 이름 있는
         놈에게만 달고(DOM 을 쓸데없이 늘리지 않는다), 그놈 색으로 테를 두른다. */
      el.innerHTML = `<img class="spr" src="assets/mob/${m.kind}.png" alt=""
          onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()"><i></i>` +
        (m.named ? `<b class="nametag">${m.named}</b>` : "");
      /* **크기는 한 번만 정한다.** 종류가 바뀌지 않으므로 매 프레임 width/height 를 쓰면
         레이아웃만 다시 돌 뿐이다(129마리에서 프레임당 레이아웃 2.4회의 절반이 여기였다). */
      const s0 = m.named ? 98 : m.boss ? 76 : 44;
      el.style.width = el.style.height = s0 + "px";
      el.style.left = el.style.top = "0px";
      $("world").appendChild(el);
      mobEls.set(m.id, el);
      el._spr = el.querySelector(".spr");
      el._bar = el.querySelector("i");
      el._st = {};                 // 마지막으로 쓴 값 — 안 바뀐 것은 다시 안 쓴다
    }
    // 이름 있는 놈은 보통 보스보다 한 뼘 더 크다 — 크기부터가 "이건 다른 놈"이다
    const p = mobPos(m), sz = m.named ? 98 : m.boss ? 76 : 44;
    const pct = Math.max(0, m.hp / m.maxHp);
    /* ══ 걸음 ══
       **그림 한 장을 좌표만 바꿔 밀면 걷는 게 아니라 미끄러진다**(병수님: "그냥 둥둥
       떠다니던데"). 걷기 프레임이 아직 없으므로 한 장으로 낼 수 있는 것을 낸다:
         · 걸음 위상을 **시간이 아니라 지나온 거리**로 센다 — 그래야 느려진 놈은 발도
           천천히 놀리고, 붙어서 멈춘 놈은 발이 멎는다(감속이 눈에 보인다).
         · 발이 땅을 딛는 결이라 위아래는 |sin| 로, 몸통 흔들림은 그 절반 주기로.
         · 진행 방향이 왼쪽이면 좌우를 뒤집는다.
         · **발밑 그림자**가 제일 크다 — 떠 있어 보이는 것의 정체는 접지가 없는 것이다.
           몸이 뜰 때 그림자가 같이 작아져야 "딛었다"가 읽힌다.
       DOM 은 안 늘린다 — 그림자는 .mob 의 ::after 이고, 값만 CSS 변수로 넘긴다. */
    const dx = m.x - (m.px ?? m.x), dy = m.y - (m.py ?? m.y);
    m.px = m.x; m.py = m.y;
    m.walked = (m.walked || 0) + Math.hypot(dx, dy);
    const ph = (m.walked / (m.boss ? 22 : 13)) * Math.PI;    // 한 걸음의 보폭
    const walking = !m.stuck;
    const bob  = walking ? Math.abs(Math.sin(ph)) * (m.boss ? 5.5 : 3.4) : 0;
    const tilt = walking ? Math.sin(ph * 0.5) * (m.boss ? 3 : 5.5) : 0;
    /* 딛는 순간 살짝 눌리고 뜨는 순간 늘어난다 — 위아래 이동만으로는 "떠오른다"로 읽히고,
       눌림이 붙어야 발이 땅을 민 것으로 보인다(스프라이트가 한 장이라 이게 걸음의 대역이다). */
    const sq = walking ? Math.cos(ph * 2) * 0.05 : 0;
    if (dx < -0.02) m.flip = -1; else if (dx > 0.02) m.flip = 1;
    /* ══ 위치는 **transform 으로** 옮긴다 ══
       left/top 을 쓰면 그 한 줄이 레이아웃을 부른다. 백서른 마리면 프레임마다 백서른 번이다
       (병수님: "적군 많이 나오면 렉 걸린다"). translate3d 는 레이아웃도 칠하기도 안 건드리고
       합성 단계에서 끝난다. 걸음(bob·tilt·flip·눌림)도 CSS 변수로 넘겨 자식이 다시 계산하게
       하는 대신 **자식의 transform 을 직접** 쓴다 — 변수 하나를 바꾸면 그 아래가 통째로
       다시 계산되기 때문이다. 접지 그림자만 ::after 가 읽어야 해서 변수로 남긴다. */
    const st = el._st;
    const tx = (p.x - sz / 2).toFixed(1), ty = (p.y - sz / 2).toFixed(1);
    const mt = `translate3d(${tx}px,${ty}px,0)`;
    if (st.mt !== mt) { el.style.transform = mt; st.mt = mt; }
    if (el._spr) {
      const spr = `translateY(${(-bob).toFixed(2)}px) rotate(${tilt.toFixed(2)}deg) ` +
        `scale(${((1 + sq) * (m.flip || 1)).toFixed(3)},${(1 - sq).toFixed(3)})`;
      if (st.spr !== spr) { el._spr.style.transform = spr; st.spr = spr; }
    }
    const sh = (1 - bob / 8).toFixed(2);
    if (st.sh !== sh) { el.style.setProperty("--sh", sh); st.sh = sh; }
    if (m.named && !st.named) {         // 색조·테는 안 바뀐다 — 한 번만
      el.style.setProperty("--ring", m.ring || "224,164,88");
      el.style.setProperty("--hue", (m.hue || 0) + "deg");
      st.named = true;
    }
    /* 구운 그림으로 갈아 끼운다 — 서리를 맞으면 파란 쪽으로. 주소가 그대로면 안 건드린다. */
    if (el._spr && !m.named) {
      const src = bakedSrc(m.kind, !!m.slow);
      if (el._spr.getAttribute("src") !== src) el._spr.setAttribute("src", src);
    }
    el.classList.toggle("slowed", !!m.slow);
    el.classList.toggle("hitting", !!m.stuck);   // 붙은 놈은 걷는 대신 때리는 결로
    /* **왜 안 잡히는지, 왜 위험한지를 화면이 말해야 한다.**
       포격체는 사거리 밖에 서서 쏘는데, 사람은 "왜 저놈만 안 죽지"를 알 방법이 예고 칩뿐이었다.
       자폭체는 붙기 전에 잡아야 하는데 다가오는 동안 아무 표시가 없었다. 둘 다 표식을 준다. */
    const pf = MOB[m.kind] || {};
    el.classList.toggle("standing", !!(pf.standoff && m.stuck));
    el.classList.toggle("fuse", !!pf.bomb);
    /* 체력바도 **바뀔 때만** 쓴다. 성한 놈이 대부분이라(안 맞은 채 걸어온다) 여기서
       매 프레임 width 를 쓰면 레이아웃이 공짜로 한 번씩 더 돈다. */
    const bar = el._bar;
    if (bar) {
      const w = Math.max(3, sz * 0.8 * pct).toFixed(1);
      if (st.w !== w) { bar.style.width = w + "px"; st.w = w; }
      const col = pct > .5 ? "#7fb069" : pct > .25 ? "#e0a458" : "#d05353";
      if (st.col !== col) { bar.style.background = col; st.col = col; }
      const dis = pct >= 1 ? "none" : "block";           // 성한 놈에게는 바를 안 그린다
      if (st.dis !== dis) { bar.style.display = dis; st.dis = dis; }
    }
  }
  for (const [id, el] of mobEls) if (!alive.has(id)) { el.remove(); mobEls.delete(id); }

  // 타워 체력바는 매 프레임 바뀐다 — 구성이 그대로여도 여기서 다시 쓴다
  if (placed().some(t => t.hp < t.maxHp) || towersHurtLast) {
    towersHurtLast = placed().some(t => t.hp < t.maxHp);
    drawTowers();
  }

  // 탄 — 점이 아니라 **진행 방향으로 늘어난 짧은 트레이서**. 나아가는 결이 보여야 "쏘고 있다"가
  // 읽힌다. 시작점→목표 방향으로 rotate 하고 scaleX 로 늘인다(종류색은 그대로).
  /* **탄을 매 프레임 다 지우고 다시 만들고 있었다.** 붙었다 떨어지는 것만으로도
     스타일 재계산과 레이아웃이 그 수만큼 돈다 — 적이 많아지면 탄도 같이 많아지므로
     렉이 정확히 여기서 겹쳐 커진다. 만들어 둔 것을 **돌려 쓴다**(모자라면 그때만 만든다). */
  for (let i = shotPool.length; i < S.shots.length; i++) {
    const el = document.createElement("div");
    el.className = "shot";
    $("world").appendChild(el);
    shotPool.push(el);
  }
  for (let i = 0; i < shotPool.length; i++) {
    const el = shotPool[i], s = S.shots[i];
    if (!s) { if (el.style.display !== "none") el.style.display = "none"; continue; }
    if (el.style.display === "none") el.style.display = "";
    const f = 1 - s.life / 0.14;
    const a = Math.atan2(s.ty - s.y, s.tx - s.x);
    el.style.transform = `translate3d(${(s.x + (s.tx - s.x) * f).toFixed(1)}px,` +
      `${(s.y + (s.ty - s.y) * f).toFixed(1)}px,0) translate(-50%,-50%) rotate(${a.toFixed(3)}rad) scaleX(1.7)`;
    if (el._col !== s.col) { el.style.background = el.style.color = s.col; el._col = s.col; }
  }

  // 체력은 벙커 곁에서 읽힌다 — 헤더에는 안 적는다(같은 숫자가 두 곳이면 눈이 갈라진다)
  const cb = $("coreBar"), cn = $("coreNum");
  if (cb) cb.style.width = Math.max(0, S.coreHp / S.coreMax * 100) + "%";
  if (cn) cn.textContent = Math.max(0, Math.ceil(S.coreHp)) + "/" + S.coreMax;
  $("hRound").textContent = S.round;
  /* 자원은 **판 내내 보는 숫자**인데 여기만 날것이었다 — 「1284000」은 자릿수를 세어야
     읽힌다. 넉 장과 같은 말투로(`shortNum`) 적고 정확한 수는 title 로 남긴다.
     값이 값인 만큼 줄여 적기가 발동하는 만 위는 어떤 값보다도 한참 위다(제일 비싼 게 세 자리). */
  setNum($("hRelic"), META.relics, "자원");
  /* **살 수 있으면 살 수 있다고 말해야 한다.** 자원 버튼을 헤더 구석에 조용히 두었더니
     "업그레이드는 한 판 끝나고만 되나"는 물음이 돌아왔다 — 언제든 열린다는 걸 화면이
     한 번도 말한 적이 없었던 것이다. 지금 살 수 있는 게 하나라도 있으면 버튼이 뛴다. */
  const canBuy = Object.keys(UPGRADES).some(k => META.relics >= upCost(k)) ||
                 KIND_IDS.some(k => META.seen[k] && META.relics >= kindCost(k));
  // 지금 쓸 수 있을 때만 뛴다 — 판 도중에 뛰면 누르라는 말이 되고, 눌러도 안 열린다.
  $("relicBtn").classList.toggle("hot", canBuy && S.over && !$("over").classList.contains("on"));
  $("relicBtn").title = S.over ? (canBuy ? "쓸 수 있는 자원이 있다 — 눌러서 상점" : "자원 상점")
                               : "판이 끝나면 쓴다";
}

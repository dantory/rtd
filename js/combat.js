let nextId = 1;   // 몹 id 는 웨이브를 만드는 여기서만 는다
import { $, GCOL, gradeMul, isBossR, KIND_IDS, kindCost, kindLv, KINDS, kindSkill, META, newlySeen, relicsFor, relicTick, S, saveMeta, seenCount, slotMax, upCost, UPGRADES, waveHp, waveN } from "./core.js";
import { banner, drawGrid, px, say } from "./view.js";
import { armorMul, coreCenter, coreRadius, dexStat, dmgOf, fillFree, isOut, nextUnlockAt, placed, poolSize, recruitCost, rngOf, spawnRadius } from "./army.js";
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
   라운드를 따라 벌어진다. 덤으로 위생병·냉동병처럼 때리지 않는 병과가 값을 하기 시작한다.
   수치는 시작점일 뿐 — probe 로 재서 벽 20~28R 을 유지하도록 튜닝한다. */
const MOB = {
  grunt:  { hp: 0.85, sp: 1.0 },                       // 기준
  runner: { hp: 0.5,  sp: 1.5 },                       // 빠르고 얇다 — 그래도 잡힌다
  brute:  { hp: 3.2,  sp: 0.55 },                      // 아주 느리고 아주 두껍다 — 홀로 새어 들어 본진을 조금씩 깎는다
  swarm:  { hp: 0.35, sp: 1.2, pack: [2, 3] },         // 한 번에 여럿, 낱개는 얇다
  shield: { hp: 1.0,  sp: 0.85, guard: 5 },            // 처음 5대를 크게 감쇄
  boss:   { hp: 8,    sp: 0.625 },                     // 옛 15px/초 = 24×0.625, 그대로
};

/* 보스(5의 배수)는 능력 하나를 안고 온다 — 라운드마다 돌려 쓴다. "큰 놈 하나 더"가 아니라
   사건이 되게. haste=곁의 적을 몰아친다, spawn=쓰러지며 새끼를 흩는다,
   ward=멀리서는 잘 안 박힌다(가까이 붙어야 온전히 들어간다). */
const BOSS_POWERS = ["haste", "spawn", "ward"];
export const bossPower = (r) => BOSS_POWERS[(Math.floor(r / 5) - 1 + BOSS_POWERS.length) % BOSS_POWERS.length];
export const bossNote = (r) => ({
  haste: "큰 놈이 온다 — 곁의 적을 몰아친다",
  spawn: "큰 놈이 온다 — 쓰러지며 새끼를 흩는다",
  ward:  "큰 놈이 온다 — 멀리서는 잘 안 박힌다",
}[bossPower(r)]);

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
    const MOBNAME = { grunt:"보통", runner:"빠름", brute:"두꺼움", swarm:"떼", shield:"방패" };
    const fresh = [...new Set(wavePool(S.round))].filter(k => !wavePool(S.round - 1).includes(k));
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

/** 이번 라운드에 나올 수 있는 종류들 — 소환과 예고가 **같은 표**를 봐야 예고가 거짓말이 안 된다. */
export function wavePool(r) {
  return r < 3 ? ["grunt"]
       : r < 6 ? ["grunt","grunt","runner"]
       : r < 10 ? ["grunt","grunt","grunt","runner"]
       : ["grunt","grunt","grunt","grunt","runner","runner","brute","swarm","shield"];
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
     머무는 시간이 줄어(대원 총량 = 사거리 ÷ 속도) 난이도가 튄다. 종류 배수만 그 위에 곱한다. */
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
      // 한 대는 가볍게, 대신 **여럿이 오래** — 그래야 고치고 막는 병과가 값을 한다.
      // 계수를 0.28→0.22 로 낮춘다: 새어 든 놈이 본진을 천천히 깎아, 처음 맞은 뒤로 몇 라운드를
      // 더 버틴다(낭떠러지→비탈). 벽(=새기 시작하는 라운드)은 화력 임계라 이 값과 무관하다.
      dmg: Math.round((2 + S.round * 0.17) * (boss ? 4 : 1)),
      slow: 0, slowT: 0, atkT: 0,
      guard: prof.guard || 0,               // 방패병 — 처음 몇 대를 크게 감쇄
    };
    if (boss) m.power = bossPower(S.round);  // 보스는 능력 하나를 안고 온다
    S.mobs.push(m);
  }
  // swarm 이라도 한 번의 소환은 한 번으로 센다 — waveN 은 소환 횟수다(몸은 그보다 많아질 수 있다)
  S.spawned++;
}

export const mobPos = (m) => ({ x: m.x, y: m.y });
// 본진까지 남은 거리 — 타워는 **제일 가까이 온 놈**부터 노린다
export const distToCore = (m) => Math.hypot(m.x - coreCenter().x, m.y - coreCenter().y) - coreRadius();

export function hurt(m, d, from) {
  // 방패병 — 처음 몇 대는 크게 흘린다(70% 감쇄). 냉동·관통으로 그 대수를 빨리 벗겨야 값이 산다.
  if (m.guard > 0) { d *= 0.3; m.guard--; }
  // 보스 ward — 멀리서는 잘 안 박힌다. 가까이 붙어야(=위험을 감수해야) 온전히 들어간다.
  if (m.boss && m.power === "ward" && distToCore(m) > 120) d *= 0.45;
  m.hp -= d;
  if (m.hp <= 0) {
    m.dead = true;
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
  }
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

/** 합쳐지면 벙커가 한 번 빛난다 — 대원이 안에 있으니 연출도 벙커에서 터져야 맞다. */
export function popTower(t, cls) {
  const el = $("coreEl");
  if (!el) return;
  el.classList.remove("merged"); void el.offsetWidth; el.classList.add("merged");
}

export function flyText(x, y, text, col) {
  const el = document.createElement("div");
  el.className = "fly"; el.textContent = text;
  el.style.cssText = `left:${x}px;top:${y}px;color:${col}`;
  $("world").appendChild(el);
  setTimeout(() => el.remove(), 700);
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
      S.spawnT = prog > 0.65 ? 0.3 : 0.55;
    }
  }
  // 이동과 교전.
  // 적이 노리는 건 벙커 하나다. 대원은 그 안에 있어 맞지 않는다.
  const c = coreCenter(), cr = coreRadius();
  // 보스 haste — 곁의 적을 몰아친다. 오라(170px) 안의 몹은 1.5배로 온다(보스 자신은 뺀다).
  const haste = S.mobs.find(m => m.boss && m.power === "haste");
  for (const m of S.mobs) {
    if (m.slowT > 0) { m.slowT -= dt; if (m.slowT <= 0) m.slow = 0; }
    m.atkT -= dt;

    /* **적이 노리는 건 벙커 하나다.**
     *
     *  전에는 코앞의 대원에게 막혀 그를 때렸다. 자리가 셋뿐인 구조에서 그러면 대원이
     *  죽어 없어지고 화력이 통째로 사라져 그 판이 거기서 끝난다(여섯 판 중 세 판이 1R).
     *  맞는 것을 본진으로 돌려도 마찬가지였다 — 막혀 있는 동안 그 피해가 전부 본진으로
     *  들어가 오히려 더 빨리 무너졌다. 대원은 벙커 안에 있는 것이니 **아예 맞지 않는다.**
     *  깎이는 것은 본진뿐이고, 그래서 방어는 받는 피해를 줄이는 일(방패병)과
     *  깎인 것을 되돌리는 일(위생병)로 갈린다. 잃는 것은 판이지 모아 온 대원이 아니다. */
    m.stuck = false;
    const d = Math.hypot(m.x - c.x, m.y - c.y);
    if (d <= cr + 8) {                            // 본진에 붙었다
      m.stuck = true;
      if (m.atkT <= 0) {
        /* 언 놈은 때리는 손도 느리다 — 이게 없으면 냉동은 도착만 늦출 뿐 총 피해를 못 줄인다
           (붙은 놈은 멈춰서 때리므로 이동 감속이 무의미해진다). 심사에서 +0.3R 로 죽어 있던 이유. */
        m.atkT = 1 * (1 + m.slow * 2.5);
        const hit = Math.max(1, Math.round(m.dmg * armorMul()));
        S.coreHp -= hit;
        sfx("hitCore");
        flyText(c.x, c.y - cr, "-" + hit, "#d05353");
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
  for (const m of S.mobs) if (m.dead && m.boss && m.power === "spawn" && !m.split) { m.split = true; spawnBrood(m); }
  S.mobs = S.mobs.filter(m => !m.dead);

  /* ══ 알아서 돌린다 ══
     **방치형은 손을 떼도 굴러가야 한다.** 웨이브만 이어지고 뽑기·합성을 손으로 눌러야 하면
     그건 방치가 아니라 그냥 버튼이 하나 줄어든 것이다. 판 안에서 손이 갈 일은 없애고,
     빈 자리만 채운다 — 사람에게 남는 결정은 **무엇을 내보낼지와 무엇에 자원을 쓸지**다.
     한 틱에 몰아 하지 않고 0.4초에 한 번만 손을 대, 불어나는 게 눈에 보이게 한다. */
  /* 편성 화면이 열려 있는 동안은 손을 뗀다 — 사람이 거둔 자리를 0.4초 만에 도로
     채우면 "거두기가 안 된다"로 보인다(실제로 그렇게 보였다). 닫으면 다시 맡는다. */
  if (S.autoRun && !S.over && !$("squad").classList.contains("on")) {
    S.autoT = (S.autoT || 0) - dt;
    if (S.autoT <= 0) {
      S.autoT = 0.4;
      const before = placed().map(t => t.id).join(",");
      fillFree();   // 뽑기·합성은 판 밖 일이 됐다. 판 안에서는 빈 자리만 메운다.
      // 채웠으면 패널도 깨운다 — 상태만 바뀌고 화면이 낡으면 "자리 0/3"이 첫인상이 된다(실제로 그랬다)
      if (placed().map(t => t.id).join(",") !== before) refresh();
    }
  }

  /* 냉동병 — **냉기장**이다. 사거리 안 모든 적이 느려진다(이동도, 벙커를 때리는 손도).
     한 발씩 얼리는 방식은 사방에서 붙는 적을 못 덮어 심사에서 +0.3R 로 죽어 있었다 —
     제어 병과는 낱발이 아니라 장판이어야 이 구조(한 점 벙커, 전방위 쇄도)에서 값을 한다. */
  for (const t of placed()) {
    const K2 = KINDS[t.kind];
    if (!K2.slow) continue;
    t.chillT = (t.chillT || 0) - dt;
    if (t.chillT > 0) continue;
    t.chillT = 0.3;
    const c2 = coreCenter();
    const r2 = rngOf(t), sk2 = kindSkill(t.kind);
    const s2 = Math.min(0.8, K2.slow * sk2 * (1 + (t.g - 1) * 0.25));
    for (const m of S.mobs) {
      if (Math.hypot(m.x - c2.x, m.y - c2.y) > r2) continue;
      m.slow = Math.max(m.slow, s2); m.slowT = Math.max(m.slowT, 0.5);
    }
  }

  /* 위생병 — 싸우는 동안 **본진**을 고친다. 대원이 안 죽게 된 뒤로 깎이는 것은 본진뿐이고,
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

  // 대원 — **내보낸 것만 쏜다.** 창고에 있는 건 구경만 한다.
  // 대원은 벙커 안에 있으므로 사거리도 탄도 전부 **벙커**가 기준이다.
  const cc = coreCenter();
  for (const t of placed()) {
    t.cd = (t.cd || 0) - dt;
    if (t.cd > 0) continue;
    const K = KINDS[t.kind], r = rngOf(t);
    // **벙커에 제일 가까이 온 놈부터** 노린다 — 먼 놈을 먼저 잡으면 코앞의 것을 놓친다.
    // 지뢰밭만은 **멈춰 붙은 놈**을 노린다 — 그래야 "달라붙은 것들을 한꺼번에"가 된다.
    /* 공병(arm)은 **붙은 놈 우선, 없으면 가까운 놈** — "붙은 놈만"으로 두면 벙커가 안
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
    sfx(K.cd >= 2 ? "heavy" : "shoot");     // 느리고 무거운 병과(로켓·저격·공병)는 소리도 무겁게
    boom(bp.x, bp.y, K.fx || "hit");

    hurt(best, d, t);
    // 훈련 등급이 오르면 그 병과의 특기도 같이 자란다 — 그게 곧 스킬 성장이다
    const sk = kindSkill(t.kind);
    if (K.slow) { best.slow = Math.max(best.slow, Math.min(0.8, K.slow * sk)); best.slowT = 1.1; }
    if (K.splash) for (const m of S.mobs) {
      if (m === best || m.dead) continue;
      const p = mobPos(m);
      if (Math.hypot(p.x - bp.x, p.y - bp.y) <= K.splash * sk) hurt(m, Math.round(d * 0.55));
    }
    if (K.chain) {
      let n = K.chain + Math.floor(kindLv(t.kind) / 3);
      for (const m of S.mobs) {
        if (n <= 0) break;
        if (m === best || m.dead) continue;
        const p = mobPos(m);
        if (Math.hypot(p.x - bp.x, p.y - bp.y) <= 70) {
          hurt(m, Math.round(d * 0.5));
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
        hurt(m, Math.round(d * 0.7));
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
      if (first) say('자원이 쌓인다 — <b style="color:var(--amber)">판이 끝나면</b> 능력치와 병과를 올린다.');
    }
    S.round++;
    drawGrid();            // 다음 웨이브가 오는 갈래가 바뀌었다
    refresh();
  }
}

export function gameOver() {
  S.over = true; S.running = false; S.mobs = []; S.shots = [];
  document.querySelectorAll("#world .fly, #world .boom").forEach(e => e.remove());
  const got = relicsFor(S.round);
  META.relics += got;
  /* **이겼는지 졌는지를 먼저 말한다.** 끝나는 방식이 하나뿐인 무한 판이라 "승리"는
     기록을 넘어선 판이다 — 그게 이 게임에서 이긴다는 것의 유일한 뜻이다. */
  const win = S.round > META.best;
  META.best = Math.max(META.best, S.round);
  saveMeta();
  sfx(win ? "win" : "lose");
  $("overT").textContent = win ? "승리" : "패배";
  $("overT").style.color = win ? "#7fb069" : "#d05353";
  $("overD").innerHTML = win
    ? `<b>${S.round}라운드</b> — 최고 기록을 넘었다.<br><b style="color:var(--amber)">자원 +${got}</b>`
    : `<b>${S.round}라운드</b>에서 벙커가 무너졌다. 최고 ${META.best}라운드.<br>` +
      `<b style="color:var(--amber)">자원 +${got}</b>`;
  drawShop();
  $("over").classList.add("on");
}

// 자원 상점. **뚫린 화면에서 바로 세지는 게 보여야** "한 판 더"에 손이 간다.
export function drawShop() {
  $("shop").innerHTML = Object.entries(UPGRADES).map(([k, u]) => {
    const c = upCost(k), lv = META.up[k];
    return `<button class="up" data-up="${k}" ${META.relics < c ? "disabled" : ""}>
      <span class="n">${u.n}${lv ? ` <span class="dim">${lv}</span>` : ""}</span>
      <span class="d">${u.d}</span><span class="p">자원 ${c}</span></button>`;
  }).join("");
  $("shopHave").textContent = META.relics;
  $("shopHave2").textContent = META.relics;
  $("recCost").textContent = recruitCost();
  $("recruitBtn").disabled = META.relics < recruitCost();
  const nx = nextUnlockAt();
  $("armyNote").innerHTML =
    `부대 <b>${META.army.length}</b>기 · 자리 <b>${slotMax()}</b> · 나오는 병과 <b>${poolSize()}</b>/${KIND_IDS.length}` +
    (nx ? ` — <b style="color:var(--steel)">${nx}라운드</b>를 넘기면 하나 더 열린다` : "");

  /* 도감 — 아직 못 본 병과도 **자리를 비워 둔 채로 보여 준다.** 몇 개가 남았는지 보이지
     않으면 모을 이유가 생기지 않는다. 만난 최고 등급을 별로 남기고, 수치·다음 목표까지 적어
     도감이 "수집의 지도"가 되게 한다. */
  const dxRow = (lb, cur, nxt) =>
    `<span class="dxs"><i>${lb}</i>${cur}${nxt != null && nxt !== cur ? `<b>→${nxt}</b>` : ""}</span>`;
  $("dex").innerHTML = KIND_IDS.map((k, i) => {
    const g = META.seen[k] | 0, K = KINDS[k];
    if (!g) {
      /* ??? 도 **다음 목표**를 적는다. 넷째부터 최고 라운드 (i-3)*5 마다 하나씩 열리니(poolSize),
         "무엇이, 언제 열리는지"가 보이면 못 본 칸도 밀어 볼 이유가 된다. */
      const at = Math.max(0, i - 3) * 5;
      return `<div class="dxc off" title="아직 못 만났다"><span class="ico">?</span>
           <span class="dxn">???</span>
           <span class="dxt">${at ? `최고 <b>${at}R</b> 에 열린다` : "곧 열린다"}</span></div>`;
    }
    /* 만난 병과는 **키울 수 있다.** 누를 수 있게 해 두면 "이번엔 저격수를 밀어 보자"가 성립하고,
       카드에 지금 피해·사거리·특기와 한 단계 위 값을 적어 무엇이 얼마나 오를지 미리 보인다. */
    const lv = kindLv(k), c = kindCost(k), can = META.relics >= c, s = dexStat(k);
    return `<button class="dxc train${can ? " can" : ""}" data-train="${k}"
         title="${K.n} — ${K.d}&#10;훈련 ${lv}등급 · 다음 등급 자원 ${c}">
       ${newlySeen.has(k) ? `<span class="dxnew">NEW</span>` : ""}
       <img class="spr" src="assets/unit/${k}.png" alt=""
         onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()">
       <span class="ico">${K.ico}</span>
       <span class="dxn">${K.n}</span>
       <span class="dxg" style="color:${GCOL[g]}">${"★".repeat(Math.min(g,5))}</span>
       <span class="dxst">${dxRow("피해", s.dmg, s.dmgN)}${dxRow("사거리", s.rng, s.rngN)}${
         s.sLb ? dxRow(s.sLb, s.sCur, s.sNxt) : ""}</span>
       <span class="dxt">훈련 ${lv} <b>자원 ${c}</b></span></button>`;
  }).join("");
  $("dexHave").textContent = seenCount();
  $("dexAll").textContent = KIND_IDS.length;
}

/* ══ 그리기 ══ */
/** 대원은 벙커 안이라 판에 그릴 것이 없다 — 고른 대원의 **사거리 링**만 벙커에서 그린다.
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

export let mobEls = new Map();
export let towersHurtLast = false;
export function paint() {
  // 몹
  const alive = new Set();
  for (const m of S.mobs) {
    alive.add(m.id);
    let el = mobEls.get(m.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "mob" + (m.boss ? " boss" : "");
      el.innerHTML = `<img class="spr" src="assets/mob/${m.kind}.png" alt=""
          onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()"><i></i>`;
      $("world").appendChild(el);
      mobEls.set(m.id, el);
    }
    const p = mobPos(m), sz = m.boss ? 76 : 44;
    const pct = Math.max(0, m.hp / m.maxHp);
    el.style.cssText = `left:${p.x - sz/2}px;top:${p.y - sz/2}px;width:${sz}px;height:${sz}px`;
    el.classList.toggle("slowed", !!m.slow);
    const bar = el.querySelector("i");
    if (bar) {
      bar.style.width = Math.max(3, sz * 0.8 * pct) + "px";
      bar.style.background = pct > .5 ? "#7fb069" : pct > .25 ? "#e0a458" : "#d05353";
      bar.style.display = pct >= 1 ? "none" : "block";   // 성한 놈에게는 바를 안 그린다
    }
  }
  for (const [id, el] of mobEls) if (!alive.has(id)) { el.remove(); mobEls.delete(id); }

  // 타워 체력바는 매 프레임 바뀐다 — 구성이 그대로여도 여기서 다시 쓴다
  if (placed().some(t => t.hp < t.maxHp) || towersHurtLast) {
    towersHurtLast = placed().some(t => t.hp < t.maxHp);
    drawTowers();
  }

  // 탄 — 점이 아니라 **진행 방향으로 늘어난 짧은 트레이서**. 나아가는 결이 보여야 "쏘고 있다"가
  // 읽힌다. 시작점→목표 방향으로 rotate 하고 scaleX 로 늘인다(병과색은 그대로).
  document.querySelectorAll("#world .shot").forEach(e => e.remove());
  for (const s of S.shots) {
    const f = 1 - s.life / 0.14;
    const a = Math.atan2(s.ty - s.y, s.tx - s.x);
    const el = document.createElement("div");
    el.className = "shot";
    el.style.cssText = `left:${s.x + (s.tx - s.x) * f}px;top:${s.y + (s.ty - s.y) * f}px;` +
      `background:${s.col};color:${s.col};transform:translate(-50%,-50%) rotate(${a}rad) scaleX(1.7)`;
    $("world").appendChild(el);
  }

  // 체력은 벙커 곁에서 읽힌다 — 헤더에는 안 적는다(같은 숫자가 두 곳이면 눈이 갈라진다)
  const cb = $("coreBar"), cn = $("coreNum");
  if (cb) cb.style.width = Math.max(0, S.coreHp / S.coreMax * 100) + "%";
  if (cn) cn.textContent = Math.max(0, Math.ceil(S.coreHp)) + "/" + S.coreMax;
  $("hRound").textContent = S.round;
  $("hRelic").textContent = META.relics;
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

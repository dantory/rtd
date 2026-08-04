let nextId = 1;   // 몹 id 는 웨이브를 만드는 여기서만 는다
import { $, GCOL, gradeMul, isBossR, KIND_IDS, kindCost, kindLv, KINDS, kindSkill, META, relicsFor, relicTick, S, saveMeta, seenCount, slotMax, upCost, UPGRADES, waveHp, waveN } from "./core.js";
import { drawGrid, px, say } from "./view.js";
import { armorMul, coreCenter, coreRadius, dmgOf, fillFree, isOut, nextUnlockAt, placed, poolSize, recruitCost, rngOf, spawnRadius } from "./army.js";
import { refresh } from "./ui.js";


/* ══════════════════════════════════════════════════════════════
   웨이브 — **자동으로 싸운다.** 내가 짜 놓은 것이 나 없이 막는 걸 지켜보는 것이
   이 장르의 심장이다. 그래서 전투 중에는 손댈 것을 일부러 두지 않았다.
   ══════════════════════════════════════════════════════════ */
export const WAVE_GAP = 3.5;                  // 웨이브 사이에 숨 돌리는 시간(초)

export function startWave() {
  if (S.running || S.over) return;
  S.gap = 0;                           // 손으로 눌렀으면 기다리던 시간은 없던 일이 된다
  S.running = true;
  S.toSpawn = waveN(S.round);
  S.spawned = 0; S.spawnT = 0;
  refresh();
}

/** 이번 웨이브가 어느 방향에서 오는가. **라운드가 오를수록 갈래가 는다** —
 *  한 쪽만 두껍게 막아 두고 넘어가지 못하게 하는 것이 이 구조의 핵심 압박이다. */
export function waveLanes(r) {
  const n = Math.min(4, 1 + Math.floor((r - 1) / 3));
  const base = (r * 1.7) % (Math.PI * 2);          // 라운드마다 방향이 돌아간다
  return Array.from({ length: n }, (_, i) => base + i * (Math.PI * 2 / n));
}

export function spawnMob() {
  const boss = isBossR(S.round) && S.spawned === 0;
  /* **체력을 흩뿌린다.** 모두 같은 체력이면 한 웨이브가 통째로 죽거나 통째로 살아남는다 —
     화력이 감당하는 동안은 한 대도 안 맞다가, 한계를 넘는 순간 수십 마리가 동시에 도달해
     끝난다(재 보니 처음 맞은 라운드와 죽는 라운드가 1~5 라운드밖에 차이가 안 났다).
     편차를 주면 두꺼운 놈부터 새어 들어와 본진을 조금씩 깎고, 그 비율이 라운드를 따라
     서서히 는다. 낭떠러지가 비탈이 된다. */
  const hp = waveHp(S.round) * (boss ? 8 : 0.55 + Math.random() * 1.15);
  const lanes = waveLanes(S.round);
  // 같은 갈래라도 조금씩 흩뿌린다 — 한 줄로 오면 한 타워가 다 잡는다
  const th = lanes[S.spawned % lanes.length] + (Math.random() - 0.5) * 0.5;
  // 라운드가 오를수록 험한 놈이 섞인다. 종류는 겉모습과 결만 바꾼다 —
  // 수치를 종마다 따로 두면 밸런스 손잡이가 배로 늘어난다.
  const pool = S.round < 3 ? ["grunt"] : S.round < 6 ? ["grunt","runner"]
             : S.round < 10 ? ["grunt","runner","brute"] : ["grunt","runner","brute","swarm","shield"];
  const kind = boss ? "boss" : pool[Math.floor(Math.random() * pool.length)];
  const c = coreCenter();
  // **놓을 수 있는 자리 바로 바깥에서 나온다.** 예전엔 판 대각선의 절반(526px)에서
  // 출발했는데, 그건 배치 구역(반지름 224) 한참 밖이라 화면에 없는 데서 한참을 걸어온다 —
  // 나오는 것도 안 보이고, 보일 때쯤엔 이미 코앞이다.
  const far = spawnRadius();
  S.mobs.push({
    id: nextId++, hp, maxHp: hp, boss, th, kind,
    x: c.x + Math.cos(th) * far, y: c.y + Math.sin(th) * far,
    /* **속도는 건드리지 않는다.** 달려올 거리가 230 → 294px 로 늘었다고 속도를 같이 올리면
       도착 시간은 같아져도 **사거리 안에 머무는 시간이 그만큼 줄어** 난이도가 올라간다
       (대원이 쏘는 총량 = 사거리 ÷ 속도). 실제로 31 로 올렸더니 아무렇게나 세운 봇이
       5.2R → 2.8R 로 주저앉았다. 더 걸리는 2.6초는 배속으로 넘긴다. */
    speed: (boss ? 15 : 24) * (1 + (S.round - 1) * 0.02),   // px/초
    // 한 대는 가볍게, 대신 **여럿이 오래** — 그래야 고치고 막는 병과가 값을 한다
    dmg: Math.round((2 + S.round * 0.28) * (boss ? 4 : 1)),
    slow: 0, slowT: 0, atkT: 0,
  });
  S.spawned++;
}

export const mobPos = (m) => ({ x: m.x, y: m.y });
// 본진까지 남은 거리 — 타워는 **제일 가까이 온 놈**부터 노린다
export const distToCore = (m) => Math.hypot(m.x - coreCenter().x, m.y - coreCenter().y) - coreRadius();

export function hurt(m, d, from) {
  m.hp -= d;
  if (m.hp <= 0) {
    m.dead = true;
    /* 골드가 사라졌으니 정찰병의 몫도 유물 쪽으로 옮겨 간다(relicTick 에서 셈한다).
       띄우는 숫자도 골드가 아니라 **그 몫**이다 — 없는 재화를 띄우면 거짓말이 된다. */
    const extra = (from && KINDS[from.kind].bounty ? KINDS[from.kind].bounty : 1) - 1;
    S.bounty += extra;
    if (extra > 0 || m.boss) {
      const p = mobPos(m);
      flyText(p.x, p.y, m.boss ? "처치" : "+" + extra, "#e0a458");
    }
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
    if (S.spawnT <= 0) { spawnMob(); S.spawnT = 0.55; }
  }
  // 이동과 교전.
  // 적이 노리는 건 벙커 하나다. 대원은 그 안에 있어 맞지 않는다.
  const c = coreCenter(), cr = coreRadius();
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
        m.atkT = 1;
        const hit = Math.max(1, Math.round(m.dmg * armorMul()));
        S.coreHp -= hit;
        flyText(c.x, c.y - cr, "-" + hit, "#d05353");
        if (S.coreHp <= 0) { S.coreHp = 0; gameOver(); return; }
      }
      continue;
    }
    const v = m.speed * (1 - m.slow) * dt;
    m.x += (c.x - m.x) / d * v;
    m.y += (c.y - m.y) / d * v;
  }
  S.mobs = S.mobs.filter(m => !m.dead);

  /* ══ 알아서 돌린다 ══
     **방치형은 손을 떼도 굴러가야 한다.** 웨이브만 이어지고 뽑기·합성을 손으로 눌러야 하면
     그건 방치가 아니라 그냥 버튼이 하나 줄어든 것이다. 판 안에서 손이 갈 일은 없애고,
     빈 자리만 채운다 — 사람에게 남는 결정은 **무엇을 내보낼지와 무엇에 유물을 쓸지**다.
     한 틱에 몰아 하지 않고 0.4초에 한 번만 손을 대, 불어나는 게 눈에 보이게 한다. */
  if (S.autoRun && !S.over) {
    S.autoT = (S.autoT || 0) - dt;
    if (S.autoT <= 0) {
      S.autoT = 0.4;
      fillFree();   // 뽑기·합성은 판 밖 일이 됐다. 판 안에서는 빈 자리만 메운다.
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
    let best = null, bestD = 1e9;
    for (const m of S.mobs) {
      if (Math.hypot(m.x - cc.x, m.y - cc.y) > r) continue;
      if (K.arm && !m.stuck) continue;
      const d = distToCore(m);
      if (d < bestD) { bestD = d; best = m; }
    }
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
    const rel = relicTick(S.round) + Math.floor(S.bounty / 12);
    if (rel) S.bounty = 0;
    if (rel) {
      const first = META.relics === 0;      // 이 판에서 처음 손에 쥐는 유물인가
      META.relics += rel; saveMeta();
      // 처음 한 번은 어디서 쓰는지까지 말해 준다. 두 번째부터는 잔소리다.
      if (first) say('유물이 쌓인다 — <b style="color:var(--amber)">판이 끝나면</b> 능력치와 병과를 올린다.');
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
  $("overT").textContent = win ? "승리" : "패배";
  $("overT").style.color = win ? "#7fb069" : "#d05353";
  $("overD").innerHTML = win
    ? `<b>${S.round}라운드</b> — 최고 기록을 넘었다.<br><b style="color:var(--amber)">유물 +${got}</b>`
    : `<b>${S.round}라운드</b>에서 벙커가 무너졌다. 최고 ${META.best}라운드.<br>` +
      `<b style="color:var(--amber)">유물 +${got}</b>`;
  drawShop();
  $("over").classList.add("on");
}

// 유물 상점. **뚫린 화면에서 바로 세지는 게 보여야** "한 판 더"에 손이 간다.
export function drawShop() {
  $("shop").innerHTML = Object.entries(UPGRADES).map(([k, u]) => {
    const c = upCost(k), lv = META.up[k];
    return `<button class="up" data-up="${k}" ${META.relics < c ? "disabled" : ""}>
      <span class="n">${u.n}${lv ? ` <span class="dim">${lv}</span>` : ""}</span>
      <span class="d">${u.d}</span><span class="p">유물 ${c}</span></button>`;
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
     않으면 모을 이유가 생기지 않는다. 만난 최고 등급을 별로 남겨 다음 판을 당긴다. */
  $("dex").innerHTML = KIND_IDS.map(k => {
    const g = META.seen[k] | 0, K = KINDS[k];
    if (!g) return `<div class="dxc off" title="아직 못 만났다"><span class="ico">?</span>
           <span class="dxn">???</span></div>`;
    /* 만난 병과는 **키울 수 있다.** 도감이 보여 주기만 하면 모은 것이 결과에 안 남는다 —
       누를 수 있게 해 두면 "이번엔 저격수를 밀어 보자"가 성립한다. */
    const lv = kindLv(k), c = kindCost(k), can = META.relics >= c;
    return `<button class="dxc train${can ? " can" : ""}" data-train="${k}"
         title="${K.n} — ${K.d}&#10;훈련 ${lv}등급 · 피해 +${Math.round(kindLv(k)*16)}% · 특기 +${Math.round(kindLv(k)*11)}%">
       <img class="spr" src="assets/unit/${k}.png" alt=""
         onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()">
       <span class="ico">${K.ico}</span>
       <span class="dxn">${K.n}</span>
       <span class="dxg" style="color:${GCOL[g]}">${"★".repeat(Math.min(g,5))}</span>
       <span class="dxt">훈련 ${lv} <b>유물 ${c}</b></span></button>`;
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

  // 탄
  document.querySelectorAll("#world .shot").forEach(e => e.remove());
  for (const s of S.shots) {
    const f = 1 - s.life / 0.14;
    const el = document.createElement("div");
    el.className = "shot";
    el.style.cssText = `left:${s.x + (s.tx - s.x) * f}px;top:${s.y + (s.ty - s.y) * f}px;background:${s.col}`;
    $("world").appendChild(el);
  }

  // 체력은 벙커 곁에서 읽힌다 — 헤더에는 안 적는다(같은 숫자가 두 곳이면 눈이 갈라진다)
  const cb = $("coreBar"), cn = $("coreNum");
  if (cb) cb.style.width = Math.max(0, S.coreHp / S.coreMax * 100) + "%";
  if (cn) cn.textContent = Math.max(0, Math.ceil(S.coreHp)) + "/" + S.coreMax;
  $("hRound").textContent = S.round;
  $("hRelic").textContent = META.relics;
  /* **살 수 있으면 살 수 있다고 말해야 한다.** 유물 버튼을 헤더 구석에 조용히 두었더니
     "업그레이드는 한 판 끝나고만 되나"는 물음이 돌아왔다 — 언제든 열린다는 걸 화면이
     한 번도 말한 적이 없었던 것이다. 지금 살 수 있는 게 하나라도 있으면 버튼이 뛴다. */
  const canBuy = Object.keys(UPGRADES).some(k => META.relics >= upCost(k)) ||
                 KIND_IDS.some(k => META.seen[k] && META.relics >= kindCost(k));
  // 지금 쓸 수 있을 때만 뛴다 — 판 도중에 뛰면 누르라는 말이 되고, 눌러도 안 열린다.
  $("relicBtn").classList.toggle("hot", canBuy && S.over && !$("over").classList.contains("on"));
  $("relicBtn").title = S.over ? (canBuy ? "쓸 수 있는 유물이 있다 — 눌러서 상점" : "유물 상점")
                               : "판이 끝나면 쓴다";
}

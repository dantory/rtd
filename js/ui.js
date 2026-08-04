import { $, GCOL, GNAME, GRADE, isBossR, KIND_IDS, kindCost, kindLv, KINDS, META, META_KEY, metaLife, noteSeen, refreshSlots, relicsFor, S, saveMeta, SLOT_SPOTS, slotMax, upCost, waveHp, waveN } from "./core.js";
import { applyView, clampView, drawGrid, fitView, focusView, say, V, WORLD_H, WORLD_W, zoomAt } from "./view.js";
import { canMerge, dmgOf, fillFree, inBox, isOut, merge, mergeGroups, placed, recruit, rngOf, sell, sellOf, syncArmy, toggleOut } from "./army.js";
import { bossNote, drawShop, drawTowers, mobEls, paint, startWave, WAVE_GAP, waveLanes } from "./combat.js";


/* ══ 패널 ══ */
export function refresh() {
  drawTowers();
  /* **자리가 몇 개 남았는지가 늘 보여야 한다.** 그게 이 판의 진짜 제약이고,
     꽉 찼을 때 무엇을 해야 하는지(합치거나 판다)까지 여기서 말해 준다. */
  const waiting = inBox().length;
  $("rollNote").innerHTML =
    `자리 <b>${placed().length}/${slotMax()}</b>` +
    (waiting ? ` · 창고에 <b>${waiting}</b>기 — 「편성」에서 바꿔 넣는다` : ` · 부대 ${META.army.length}기`);
  /* 기다리는 동안에도 버튼은 살아 있다 — 다 됐으면 굳이 셋을 셀 이유가 없다. */
  const resting = !S.running && !S.over && S.auto && S.gap > 0;
  const long  = S.running ? "막는 중…" : resting ? `${S.round}라운드 — 지금 시작` : `${S.round}라운드 시작`;
  const short = S.running ? "막는 중…" : resting ? `${S.round}R 지금` : `${S.round}R 시작`;
  $("waveBtn").textContent = long;
  $("waveBtn").disabled = S.running || S.over;
  $("waveBtn2").textContent = short;
  $("waveBtn2").disabled = S.running || S.over;
  $("autoBtn").classList.toggle("on", S.auto);
  $("autoBtn").title = S.auto ? "웨이브가 알아서 이어진다" : "웨이브를 손으로 시작한다";
  $("runBtn").classList.toggle("on", S.autoRun);
  $("runBtn").title = S.autoRun ? "뽑기·합성까지 알아서 한다" : "뽑기·합성을 손으로 한다";
  const lanes = waveLanes(S.round).length;
  $("waveNote").textContent = S.running
    ? `${S.toSpawn}마리 중 ${S.spawned}마리 나옴 · 남은 적 ${S.mobs.length}`
    : `적 ${waveN(S.round)}마리 · 체력 ${waveHp(S.round)} · ${lanes}갈래에서 온다` +
      (isBossR(S.round) ? " · " + bossNote(S.round) : "");

  // **가진 것은 목록이 아니라 진열대로 보여 준다.** 여덟 종이 되고 나니 글 목록은
  // 훑어야 읽히고, 그러면 "뭘 합칠 수 있나"가 한눈에 안 들어온다.
  const m = mergeGroups();
  const cells = [];
  for (const kind of KIND_IDS) for (const g of GRADE) {
    const arr = m.get(kind + ":" + g);
    if (!arr) continue;
    const ready = g < 5 && arr.length >= 3;
    /* **몇 기를 내보냈는지가 칩에 적혀 있어야 한다.** 가진 것과 나가 있는 것이 갈린
       순간부터 "둘 있는데 하나만 싸우는 중"이 늘 벌어진다 — 그게 안 보이면 왜 약한지 모른다. */
    const out = arr.filter(isOut).length;
    cells.push(`<button class="hold${ready ? " ready" : ""}${out ? "" : " away"}" data-hold="${kind}:${g}"
        title="${GNAME[g]} ${KINDS[kind].n} — ${KINDS[kind].d} · 눌러서 내보내거나 거둔다">
      <img class="spr" src="assets/unit/${kind}.png" alt=""
        onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()">
      <span class="ico">${KINDS[kind].ico}</span>
      <span class="cnt">${out}/${arr.length}</span>
      <span class="gr" style="background:${GCOL[g]}"></span></button>`);
  }
  $("tally").innerHTML = cells.join("") || `<div class="note">아직 없다. 판이 끝나면 징집한다.</div>`;
  const readyN = [...m.entries()].filter(([k, a]) => +k.split(":")[1] < 5 && a.length >= 3).length;
  $("holdHint").textContent = readyN ? `· ${readyN}가지를 합칠 수 있다` : "";

  const t = META.army.find(x => x.id === S.sel);
  $("selInfo").innerHTML = t ? `<div class="sel-info">
      <div class="nm" style="color:${GCOL[t.g]}">${GNAME[t.g]} ${KINDS[t.kind].n}</div>
      <div class="st">피해 ${dmgOf(t)} · 사거리 ${rngOf(t)} · ${KINDS[t.kind].d}<br>
        ${isOut(t)
          ? `<span style="color:var(--steel)">벙커에서 싸우는 중 — 판의 링이 사거리다.</span>`
          : `<span style="color:var(--amber)">창고에 있다 — 아직 안 싸운다.</span>
             <span style="color:var(--steel)">「편성」에서 내보낸다.</span>`}</div></div>`
    : `<div class="note helpnote">대원을 누르면 사거리가 보인다. 넣고 빼는 것은 「편성」에서.</div>`;
}

/* 진열대의 칩은 **내보내고 거두는 손잡이**다. 합성은 아래 버튼이 맡는다 —
   한 번 누르는 데 두 가지 뜻이 붙으면 어느 쪽이 일어날지 모른 채 누르게 된다. */
/* ∞ 를 끄면 손으로 시작한다 — 정비를 오래 하고 싶을 때가 있다. 켜고 끄는 건 판을 넘어 남는다. */
/* ⚙ 를 끄면 뽑기·합성을 손으로 한다 — 조합을 직접 짜 보고 싶을 때가 있다. */
/* 설정 — 게임 진행과 상관없는 손잡이들이 모이는 곳 */
/* 테스트용 초기화 — 저장을 지우고 새로 뜬다. 지운 직후 루프가 saveMeta 로
   되살리지 못하게 판부터 멈춘다. */
/** 상점을 연다. **판 도중에도 연다** — 벽에 부딪혔을 때 할 수 있는 게 죽기를 기다리는
 *  것뿐이면 그건 돌파가 아니다. 도중에 열면 게임은 뒤에서 계속 돈다(방치형이니까). */
export function openShop() {
  drawShop();
  $("over").classList.remove("mid");
  $("again").textContent = "한 판 더";
  $("over").classList.add("on");
}
/** **편성 화면** — 자리에 누가 들어가 있고 창고에 무엇이 남았는지를 한 화면에서 본다.
 *
 *  전장의 진열대 칩으로도 넣고 뺄 수는 있지만, 창고가 열 기를 넘어가면 44px 칩이 빽빽해져
 *  무엇이 있는지조차 안 읽힌다. 자리를 **가로로 늘어놓아** 벙커에 끼운 것을 그대로 세게 하고,
 *  창고는 종류·등급으로 묶어 아래에 크게 편다. 뒤에서 게임은 계속 돈다 — 멈출 이유가 없다.
 *
 *  자리를 누르면 그 대원을 거두고, 창고 칸을 누르면 빈 자리에 내보낸다. */
export function drawSquad() {
  const spots = SLOT_SPOTS.slice(0, slotMax());
  const at = new Map(placed().map(t => [t.x + "," + t.y, t]));
  $("sqSlots").innerHTML = spots.map(([x, y]) => {
    const t = at.get(x + "," + y);
    if (!t) return `<div class="sqs empty"><span class="no">+</span></div>`;
    const K = KINDS[t.kind];
    return `<button class="sqs" data-pull="${t.id}" title="${GNAME[t.g]} ${K.n} — 눌러서 거둔다">
      <img class="spr" src="assets/unit/${t.kind}.png" alt=""
        onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()">
      <span class="ico">${K.ico}</span>
      <span class="gr" style="color:${GCOL[t.g]}">${"★".repeat(Math.min(t.g,5))}</span></button>`;
  }).join("");

  const box = new Map();
  for (const t of inBox()) {
    const k = t.kind + ":" + t.g;
    box.set(k, (box.get(k) || 0) + 1);
  }
  $("sqBox").innerHTML = [...box.entries()].map(([k, n]) => {
    const [kind, gs] = k.split(":"), g = +gs, K = KINDS[kind];
    return `<button class="sqb" data-push="${k}" title="${GNAME[g]} ${K.n} — 눌러서 내보낸다">
      <span class="gr" style="background:${GCOL[g]}"></span>
      <img class="spr" src="assets/unit/${kind}.png" alt=""
        onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()">
      <span class="ico">${K.ico}</span>
      <span class="cnt">${n}</span></button>`;
  }).join("") || `<div class="note">창고가 비었다. 징집하면 여기 쌓인다.</div>`;

  const free = spots.length - at.size;
  $("sqNote").innerHTML = `자리 <b>${at.size}/${spots.length}</b>` +
    (free ? ` · <b style="color:var(--amber)">${free}자리 비었다</b>` : "") +
    ` — 자리를 누르면 거두고, 창고를 누르면 내보낸다`;
  $("sqBoxN").textContent = `${inBox().length}기 대기`;
  const k = canMerge();
  $("sqMerge").disabled = !k;
  $("sqMerge").textContent = k
    ? `${GNAME[+k.split(":")[1]]} ${KINDS[k.split(":")[0]].n} 셋을 합친다` : "셋을 합친다";
  const sel = META.army.find(t => t.id === S.sel);
  $("sqSell").disabled = !sel;
  $("sqTip").innerHTML = sel
    ? `고른 것: <b style="color:${GCOL[sel.g]}">${GNAME[sel.g]} ${KINDS[sel.kind].n}</b> — 해산하면 자원 +${sellOf(sel)}`
    : `같은 병과 같은 등급 <b>셋</b>이 모이면 한 등급 위가 된다 — 총 화력은 그대로인데 <b>자리가 둘 빈다</b>`;
}
export const openSquad = () => { drawSquad(); $("squad").classList.add("on"); };

/* ══════════════════════════════════════════════════════════════
   오프라인 진행 — **비운 사이에도 뭔가 쌓여 있어야 방치형이다.**
   ──────────────────────────────────────────────────────────────
   탭을 닫아 두면 루프가 멈춰 아무것도 안 는다. "들어올 때마다 조금 늘어 있는" 것이
   방치형의 마지막 보상이라, 나가 있던 시간을 자원으로 환산해 돌아왔을 때 한 번 준다.
   시간당 지급은 relicsFor(best) 에 비례한다 — 멀리 가 본 사람일수록 방치의 값도 커진다.
   상한 8시간(그 이상은 안 쌓임 — 켜 두기만 하면 무한히 버는 걸 막는다). */
export const OFFLINE_CAP_H  = 8;
export const OFFLINE_MIN_MS = 5 * 60 * 1000;     // 5분 미만은 소음이라 안 띄운다
/** 나가 있던 사이 쌓인 자원을 계산한다. 지급하지는 않는다 — 받는 것은 [받는다] 버튼이 한다.
 *  줄 게 없으면(첫 실행·5분 미만·기록 0) null 을 돌려 창을 안 띄운다. */
export function offlineReport() {
  const prev = META.lastSeen;                    // 타임스탬프 — `| 0` 은 32비트로 잘려 못 쓴다
  if (!(prev > 0)) return null;                  // 첫 실행 — 비어 있던 시간이 없다
  const elapsed = Math.max(0, Date.now() - prev);   // 시계를 되돌려도 음수는 0
  if (elapsed < OFFLINE_MIN_MS) return null;
  const capped  = Math.min(elapsed, OFFLINE_CAP_H * 3600 * 1000);
  const perHour = relicsFor(META.best) * 0.12;   // 시간당 최고 기록 환산의 12% — 자면 두둑, 판보다 달지는 않게
  const gain    = Math.floor((capped / 3600000) * perHour);
  if (gain <= 0) return null;                     // 아직 멀리 못 가 봤으면 줄 게 없다
  return { elapsed, gain };
}
/** "돌아온 사이" 창을 연다. 기존 모달(#settings/#squad .box) 그대로다.
 *  받아야 지급한다 — [받는다] 를 눌러야 자원이 는다. */
export function openOffline(rep) {
  const h = Math.floor(rep.elapsed / 3600000);
  const m = Math.floor((rep.elapsed % 3600000) / 60000);
  $("offDur").textContent  = h ? `${h}시간 ${m}분` : `${m}분`;
  $("offGain").textContent = rep.gain;
  $("offTake").onclick = () => {
    META.relics += rep.gain;
    saveMeta();
    $("offline").classList.remove("on");
    refresh();
  };
  $("offline").classList.add("on");
}
/* **상점은 판이 끝난 뒤에만 연다.**
   막는 도중에도 열리게 해 뒀었는데, 전투를 보다 말고 상점을 여닫는 건 몰입을 끊는다는
   판단(병수님)이다. 한 판 → 정산 → 강화 → 다시 가 리듬이 더 선명하다. 판 도중에 눌리면
   무엇을 기다리는지만 알려 준다 — 눌러도 아무 일이 없으면 고장으로 읽힌다. */
/* ══════════════════════════════════════════════════════════════
   보는 자리 — 끌어서 옮기고, 오므려서 줄인다.
   ──────────────────────────────────────────────────────────────
   판은 13×9 다. 폰 화면에 통째로 욱여넣으면 칸이 30px 까지 줄어 손가락으로 누를 수가
   없고, 조금만 어긋나면 판이 화면 밖으로 나간다 — 실제로 "본진밖에 안 보인다"가 그것이었다.
   그래서 **칸 크기는 고정하고 보는 자리를 움직인다.** 확대하면 칸이 실제로 커진다.

   끌기와 두드리기를 가르는 것이 핵심이다. 손가락이 조금이라도 미끄러지면 배치하려던
   두드림이 끌기로 먹히고, 반대로 문턱이 너무 크면 판이 안 움직인다. 10px·300ms 로 갈랐다.
   ══════════════════════════════════════════════════════════ */
export const TAP_SLOP = 10, TAP_MS = 300;
export let drag = null, pinch = null;

export const dist2 = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
export const mid2  = (a, b) => ({ x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2 });




// 마우스도 같은 일을 한다 — 휠로 키우고 끌어서 옮긴다

export let mdrag = null;
// 끌고 나서 손을 떼는 순간의 클릭은 배치가 아니다 — 삼켜 준다

// 배속 — 1× → 2× → 3× → 1×. 짜 놓은 것이 도는 걸 보는 장르라 기다림이 곧 지루함이다.


// iOS 는 주소창이 접히며 높이가 변한다 — 처음 한 번 더 맞춰 주지 않으면 판이 잘린 채로 남는다


export function newGame() {
  refreshSlots();            // 증축한 만큼 자리를 연다 — 판을 시작할 때 한 번
  Object.assign(S, {
    coreHp: metaLife(), coreMax: metaLife(), round: 1,
    towers: [], mobs: [], shots: [],
    running: false, spawned: 0, toSpawn: 0, spawnT: 0, sel: null, over: false,
    speed: S.speed || 1,                        // 배속은 판을 넘어 유지한다
    // 첫 웨이브도 알아서 온다. 다만 처음 한 번은 뽑을 틈이 있어야 하니 조금 길게 준다.
    auto: S.auto, gap: S.auto ? WAVE_GAP * 2.4 : 0,
    autoRun: S.autoRun, autoT: 0, bounty: 0,
  });
  mobEls.forEach(el => el.remove()); mobEls.clear();
  fillFree(); syncArmy();          // 편성해 둔 대로 세우고 체력을 채운다
  /* **첫 부대는 그냥 준다.** 빈손으로는 편성이라는 말이 성립하지 않는다.
     매 판 주면 부대가 무한 증식하므로, 부대가 비어 있을 때 한 번만 채운다. */
  for (let i = META.army.length; i < 4; i++) {
    const t0 = { id: ++META.armyId, slot: null,
                 kind: KIND_IDS[Math.floor(Math.random() * KIND_IDS.length)], g: 1 };
    META.army.push(t0);
    noteSeen(t0.kind, t0.g);
  }
  $("over").classList.remove("on");
  focusView();       // 판을 시작하면 항상 벙커가 화면 가운데 — 지난 판에 끌어 둔 화면을 물려받지 않는다
  refresh();
}

/* 화면 배선 — DOM 이벤트를 한 곳에서 붙인다. main 이 모든 모듈이 선 뒤에 부른다. */
export function wireUI() {
  $("tally").addEventListener("click", (e) => {
    const b = e.target.closest("[data-hold]");
    if (!b) return;
    toggleOut(b.dataset.hold);
  });
  $("waveBtn").onclick = startWave;
  $("waveBtn2").onclick = startWave;
  $("runBtn").onclick = () => {
    S.autoRun = !S.autoRun;
    try { localStorage.setItem("rtd.autorun", S.autoRun ? "1" : "0"); } catch {}
    refresh();
  };
  $("autoBtn").onclick = () => {
    S.auto = !S.auto;
    if (S.auto && !S.running && !S.over && S.gap <= 0) S.gap = WAVE_GAP;
    try { localStorage.setItem("rtd.auto", S.auto ? "1" : "0"); } catch {}
    refresh();
  };
  $("setBtn").onclick = () => $("settings").classList.add("on");
  $("setClose").onclick = () => $("settings").classList.remove("on");
  $("settings").addEventListener("click", (e) => { if (e.target === $("settings")) $("settings").classList.remove("on"); });
  $("wipeBtn").onclick = () => {
    if (!confirm("저장을 전부 지우고 처음부터 시작한다. 되돌릴 수 없다 — 계속?")) return;
    S.over = true; S.running = false;
    try {
      localStorage.removeItem(META_KEY);
      localStorage.removeItem("rtd.auto");
      localStorage.removeItem("rtd.autorun");
    } catch {}
    location.reload();
  };
  $("sqClose").onclick = () => $("squad").classList.remove("on");
  $("sqMerge").onclick = () => { merge(); drawSquad(); };
  $("sqSell").onclick = () => { sell(); drawSquad(); };
  $("squadBtn").onclick = openSquad;
  $("sqSlots").addEventListener("click", (e) => {
    const b = e.target.closest("[data-pull]");
    if (!b) return;
    if (e.shiftKey) { S.sel = +b.dataset.pull; drawSquad(); return; }
    const t = META.army.find(x => x.id === +b.dataset.pull);
    if (!t) return;
    t.slot = null;
    if (S.sel === t.id) S.sel = null;
    syncArmy(); saveMeta(); refresh(); drawSquad();
  });
  $("sqBox").addEventListener("click", (e) => {
    const b = e.target.closest("[data-push]");
    if (!b) return;
    const [kind, gs] = b.dataset.push.split(":");
    /* 한 번 누르면 고르고, 이미 고른 것을 또 누르면 내보낸다.
       해산할 대상을 집을 길이 있어야 "쓸모없는 하급을 정리한다"가 가능해진다. */
    const same = META.army.find(t => t.kind === kind && t.g === +gs && !isOut(t));
    if (same && S.sel !== same.id) { S.sel = same.id; drawSquad(); refresh(); return; }
    toggleOut(b.dataset.push);
    drawSquad();
  });
  $("recruitBtn").onclick = recruit;
  $("toSquad").onclick = () => openSquad();
  $("relicBtn").onclick = () => {
    if (S.over) { openShop(false); return; }
    say(`자원 <b style="color:var(--amber)">${META.relics}</b> — 판이 끝나면 쓴다.`);
  };
  $("dex").addEventListener("click", (e) => {
    const b = e.target.closest("[data-train]");
    if (b) trainKind(b.dataset.train);
  });
  $("again").onclick = newGame;
  $("field").addEventListener("touchstart", (e) => {
    if (e.touches.length === 2) {
      drag = null;
      pinch = { d: dist2(e.touches[0], e.touches[1]), z: V.z };
      return;
    }
    if (e.touches.length === 1) {
      const t = e.touches[0];
      drag = { sx: t.clientX, sy: t.clientY, ox: V.x, oy: V.y, t0: Date.now(), moved: false,
               target: e.target.closest("[data-x]") };
    }
  }, { passive: true });
  $("field").addEventListener("touchmove", (e) => {
    if (pinch && e.touches.length === 2) {
      e.preventDefault();
      const d = dist2(e.touches[0], e.touches[1]), m = mid2(e.touches[0], e.touches[1]);
      zoomAt(m.x, m.y, pinch.z * (d / pinch.d));
      return;
    }
    if (drag && e.touches.length === 1) {
      const t = e.touches[0];
      const dx = t.clientX - drag.sx, dy = t.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) < TAP_SLOP) return;   // 아직 두드림일 수 있다
      drag.moved = true;
      e.preventDefault();
      V.x = drag.ox + dx; V.y = drag.oy + dy;
      clampView(); applyView();
    }
  }, { passive: false });
  $("field").addEventListener("touchend", (e) => {
    if (pinch && e.touches.length < 2) pinch = null;
    if (!drag) return;
    // 짧고 거의 안 움직였으면 두드림이다 — 그 칸을 누른 것으로 친다
    if (!drag.moved && Date.now() - drag.t0 < TAP_MS && drag.target) {
      e.preventDefault();
      drag.target.click();
    }
    drag = null;
  }, { passive: false });
  $("field").addEventListener("wheel", (e) => {
    e.preventDefault();
    zoomAt(e.clientX, e.clientY, V.z * (e.deltaY < 0 ? 1.12 : 1 / 1.12));
  }, { passive: false });
  $("field").addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    mdrag = { sx: e.clientX, sy: e.clientY, ox: V.x, oy: V.y, moved: false };
  });
  addEventListener("mousemove", (e) => {
    if (!mdrag) return;
    const dx = e.clientX - mdrag.sx, dy = e.clientY - mdrag.sy;
    if (!mdrag.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    mdrag.moved = true;
    V.x = mdrag.ox + dx; V.y = mdrag.oy + dy;
    clampView(); applyView();
  });
  addEventListener("mouseup", () => { mdrag = null; });
  $("grid").addEventListener("click", (e) => {
    if (mdrag && mdrag.moved) { e.stopPropagation(); e.preventDefault(); }
  }, true);
  $("spdBtn").onclick = () => {
    // 방치형은 **기다림이 곧 지루함**이다. 손을 뗀 채 보는 판이라 배속을 넉넉히 연다.
    S.speed = S.speed >= 6 ? 1 : (S.speed >= 3 ? 6 : S.speed + 1);
    $("spdBtn").textContent = S.speed + "×";
    $("spdBtn").classList.toggle("on", S.speed > 1);
  };
  addEventListener("keydown", (e) => { if (e.key === "f" || e.key === "F") $("spdBtn").click(); });
  $("fitBtn").onclick = () => {
    // 이미 전체가 보이면 본진으로 돌아온다 — 버튼 하나가 두 일을 하되 뜻이 흔들리지 않는다
    const f = $("field").getBoundingClientRect();
    const whole = Math.min(f.width / WORLD_W, f.height / WORLD_H) * 0.98;
    if (Math.abs(V.z - whole) < 0.02) focusView(); else fitView();
  };
  $("zinBtn").onclick = () => { const f = $("field").getBoundingClientRect();
    zoomAt(f.left + f.width / 2, f.top + f.height / 2, V.z * 1.25); };
  $("zoutBtn").onclick = () => { const f = $("field").getBoundingClientRect();
    zoomAt(f.left + f.width / 2, f.top + f.height / 2, V.z / 1.25); };
  addEventListener("resize", () => { clampView(); applyView(); });
  addEventListener("orientationchange", () => setTimeout(focusView, 300));
  addEventListener("load", () => setTimeout(focusView, 120));
  addEventListener("keydown", (e) => {
    if (e.key === " ") { e.preventDefault(); if (!S.running) startWave(); }
    if (e.key === "m" || e.key === "M") merge();
  });
  $("shop").addEventListener("click", (e) => {
    const b = e.target.closest("[data-up]");
    if (!b || b.disabled) return;
    const k = b.dataset.up, c = upCost(k);
    if (META.relics < c) return;
    META.relics -= c; META.up[k]++;
    saveMeta(); drawShop(); paint();
    /* 증축은 **다음 판부터**가 아니라 지금 눈에 보여야 한다. 상점은 판이 끝난 뒤에 열리므로
       여기서 자리를 열어 두면, 새 판이 시작될 때 이미 넓어진 앞마당이 깔려 있다. */
    if (k === "slots") { refreshSlots(); fillFree(); drawGrid(); }
    /* 판 도중에 산 것도 **지금** 들어야 한다. 다음 판부터 세진다면 벽 앞에서 사는 의미가 없다.
       피해·뽑기값은 계산할 때마다 META 를 보므로 저절로 붙고, 체력만 여기서 늘려 준다. */
    if (k === "life" && !S.over) {
      const d = metaLife() - S.coreMax;
      if (d > 0) { S.coreMax += d; S.coreHp += d; }
    }
  });
}

export function trainKind(k) {
  if (!META.seen[k]) return;                    // 만나 본 적 없는 병과는 훈련시킬 수 없다
  const c = kindCost(k);
  if (META.relics < c) return;
  META.relics -= c; META.lv[k] = kindLv(k) + 1;
  saveMeta(); drawShop(); refresh();
}

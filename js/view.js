import { $, COLS, CORE, DECK_R, inCore, onDeck, RING, ROWS, S } from "./core.js";
import { coreCenter, spawnRadius } from "./army.js";
import { drawTowers, waveLanes } from "./combat.js";


/* ══ 화면 크기 ══ */
// **칸은 늘 64px 다.** 화면에 맞추는 일은 배율이 한다 — 그래야 확대했을 때 칸이 실제로
// 커지고(손가락으로 누를 수 있고), 좌표 셈이 화면 크기에 흔들리지 않는다.
export const CELL = 64, OX = 0, OY = 0;
export const WORLD_W = CELL * COLS, WORLD_H = CELL * ROWS;

// 최소 배율은 **판 전체가 한 화면에 들어갈 만큼**은 내려가야 한다 — 21×21(1344px)을
// 430px 폭 폰에서 보려면 0.32 가 필요한데, 예전 하한 0.35 로는 ⤢ 를 눌러도 판이 잘렸다.
export const V = { z: 1, x: 0, y: 0, minZ: 0.14, maxZ: 2.2 };

export function applyView() {
  const w = $("world");
  if (!w) return;
  w.style.width = WORLD_W + "px";
  w.style.height = WORLD_H + "px";
  w.style.transform = `translate(${V.x}px,${V.y}px) scale(${V.z})`;
}

/** **처음 화면은 이것이다** — 본진과 그 둘레(놓을 수 있는 자리)가 화면을 꽉 채운다.
 *
 *  판 전체를 보여 주고 시작하면 폰에서 칸이 30px 로 줄어 누를 수가 없고, 무엇보다
 *  **판이 화면보다 작아 끌어도 아무 일이 안 일어난다**(가운데로 되돌린다) — 그게
 *  "화면 이동 안 됨"으로 보인다. 처음부터 조금 확대해 두면 칸도 누를 만하고 끌 여지도 생긴다.
 *  판 전체는 ⤢ 버튼으로 언제든 본다. */
export function focusView() {
  const f = $("field").getBoundingClientRect();
  if (!f.width || !f.height) return;
  /* **적이 나오는 원까지 담는다.** 놓을 수 있는 자리(576px)에 딱 맞추면 화면이 터로만 꽉
     차서, 판을 21×21 로 넓혀도 플레이 중엔 그 벌판이 한 줄도 안 보인다 — 넓힌 게 헛일이 된다.
     스폰 원의 1.75배로 잡으면 칸이 40px 로 여전히 누를 만하면서, **가장자리에 벌판과
     적이 나오는 자리가 같이 들어온다.** */
  /* 1.75 는 앞마당이 9×9 이던 시절의 값이다. 벙커가 자리를 따라 자라게 바뀌면서 첫 판
     앞마당이 5×5 로 작아졌고, 그대로 두니 벙커가 벌판 한가운데 점처럼 보였다. */
  const need = spawnRadius() * 1.45;
  V.z = Math.max(V.minZ, Math.min(V.maxZ, Math.min(f.width, f.height) / need));
  const c = { x: (CORE.x + CORE.w / 2) * CELL, y: (CORE.y + CORE.h / 2) * CELL };
  V.x = f.width / 2 - c.x * V.z;
  V.y = f.height / 2 - c.y * V.z;
  clampView(); applyView();
}

/** 판 전체가 보이는 배율. 어디서 오는지 한눈에 보고 싶을 때. */
export function fitView() {
  const f = $("field").getBoundingClientRect();
  if (!f.width || !f.height) return;
  V.z = Math.min(f.width / WORLD_W, f.height / WORLD_H) * 0.98;
  V.z = Math.max(V.minZ, Math.min(V.maxZ, V.z));
  V.x = (f.width  - WORLD_W * V.z) / 2;
  V.y = (f.height - WORLD_H * V.z) / 2;
  applyView();
}

/** 화면의 어느 점을 붙잡은 채 배율만 바꾼다 — 손가락 밑의 것이 제자리에 있어야 어지럽지 않다. */
export function zoomAt(sx, sy, nz) {
  const f = $("field").getBoundingClientRect();
  const px0 = sx - f.left, py0 = sy - f.top;
  const wx = (px0 - V.x) / V.z, wy = (py0 - V.y) / V.z;
  V.z = Math.max(V.minZ, Math.min(V.maxZ, nz));
  V.x = px0 - wx * V.z;
  V.y = py0 - wy * V.z;
  clampView();
  applyView();
}

/** 판을 화면 밖으로 완전히 밀어내지 못하게 — 한 번 놓치면 돌아올 길이 없다. */
export function clampView() {
  const f = $("field").getBoundingClientRect();
  const w = WORLD_W * V.z, h = WORLD_H * V.z;
  const mx = Math.min(80, f.width * 0.3), my = Math.min(80, f.height * 0.3);
  V.x = w <= f.width  ? (f.width  - w) / 2 : Math.min(mx, Math.max(f.width  - w - mx, V.x));
  V.y = h <= f.height ? (f.height - h) / 2 : Math.min(my, Math.max(f.height - h - my, V.y));
}

export function layout() {
  drawGrid();
  focusView();
}
export const px = (gx) => OX + gx * CELL;
export const py = (gy) => OY + gy * CELL;
export const cx = (gx) => px(gx) + CELL / 2;
export const cy = (gy) => py(gy) + CELL / 2;

/* ══════════════════════════════════════════════════════════════
   땅의 결 — **넓힌 판이 벽지가 되지 않게**
   ──────────────────────────────────────────────────────────────
   한 장짜리 흙 타일을 441번 반복하면 넓힌 것이 오히려 더 허전해 보인다(실제로 그랬다).
   그래서 결만 다른 땅을 여러 장 두고 칸마다 골라 깔고, 드문드문 잔해를 얹는다.
   고르는 값은 **좌표에서 나온 해시**다 — 다시 그려도 같은 자리에 같은 것이 온다.
   난수로 두면 웨이브 화살표가 바뀔 때마다 땅이 통째로 갈려 화면이 튄다.
   ══════════════════════════════════════════════════════════ */
export const hash2 = (x, y, salt = 0) => {
  let h = (x * 374761393) ^ (y * 668265263) ^ (salt * 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** **땅은 이제 한 세트로 구운 Wang 타일셋이다** (PixelLab create_topdown_tileset, 64px 16장).
 *
 *  낱장 흙 그림을 여섯 장 굽고 돌려 깔던 방식은 아무리 이어 붙여도 칸 경계가 읽혔다 —
 *  생성 모델이 64px 안에서 그림을 "완결"시키기 때문에 가장자리가 안쪽과 다르게 끝난다.
 *  Wang 타일은 **네 모서리의 지형이 무엇인지**를 정해 놓고 굽기 때문에 이웃과 맞물린다.
 *  덤으로 벌판(lower=갈라진 콘크리트)과 터(upper=리벳 철판)의 **경계 타일까지 한 세트**라,
 *  터가 벌판에 얹힌 판때기가 아니라 땅에 깔린 바닥으로 읽힌다.
 *
 *  키는 NW·NE·SW·SE 순서의 네 자리(1=터, 0=벌판)이고 값은 시트에서의 칸 [열, 행]이다.
 *  시트 위치는 **배열 순서**로만 잡는다 — 타일 이름(wang_N)이나 original_position 을 쓰면
 *  가로로 밴딩이 생긴다(PixelLab 문서가 명시한 함정). */
export const WANG = {"0000":[2,1],"0001":[3,1],"0010":[2,2],"0011":[1,2],"0100":[2,0],"0101":[3,2],
              "0110":[0,1],"0111":[3,3],"1000":[1,1],"1001":[2,3],"1010":[1,0],"1011":[0,2],
              "1100":[3,0],"1101":[0,0],"1110":[1,3],"1111":[0,3]};
/** 모서리가 터 안쪽인가. **모서리 격자는 칸 격자보다 하나 크다** — 터가 [a,b] 칸이면
 *  모서리는 [a,b+1] 이다. 이걸 칸 범위로 재면 터 둘레가 한 줄씩 어긋난다. */
export const cornerUp = (cx, cy) =>
  cx >= CORE.x - DECK_R && cx <= CORE.x + CORE.w + DECK_R &&
  cy >= CORE.y - DECK_R && cy <= CORE.y + CORE.h + DECK_R;
export const DECOS = ["wreck", "crates", "pipe", "boulder", "bones", "crystal", "barrel", "antenna"];
export const pick = (arr, r) => arr[Math.min(arr.length - 1, Math.floor(r * arr.length))];

export function drawGrid() {
  let h = "";
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    /* 벙커 칸에도 철판을 깐다 — 벙커 상자가 칸을 덮던 시절엔 빼도 안 보였지만,
       지금은 그림 둘레가 비쳐서 빼면 벙커가 검은 구멍 위에 선다. */
    /* 네 모서리가 각각 터인지 벌판인지로 깔 타일이 정해진다 — 그게 Wang 타일의 전부다. */
    const k = (cornerUp(x, y)     ? "1" : "0") + (cornerUp(x + 1, y)     ? "1" : "0") +
              (cornerUp(x, y + 1) ? "1" : "0") + (cornerUp(x + 1, y + 1) ? "1" : "0");
    const [tc, tr] = WANG[k];
    h += `<div class="tile wang"
      style="left:${px(x)}px;top:${py(y)}px;width:${CELL}px;height:${CELL}px;` +
      `background-position:${-tc * CELL}px ${-tr * CELL}px"></div>`;
  }
  /* 자리 칸은 판에 안 그린다 — 대원은 벙커 안에 있다. 증축이 보이는 곳은 앞마당(철판이
     실제로 넓어진다)과 편성 화면(자리 수)이다. */
  /* 잔해 — 벌판의 1/9 쯤에만 얹는다. 촘촘하면 적이 어디 있는지 안 읽히고,
     없으면 그냥 빈 땅이다. 놓는 자리(터)와 그 한 칸 밖은 비워 둔다 —
     대원과 겹쳐 보이면 뭐가 내 것인지 헷갈린다. */
  for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
    if (onDeck(x, y) || inCore(x, y)) continue;
    if (Math.abs(x - (CORE.x + 1)) <= RING + 1 && Math.abs(y - (CORE.y + 1)) <= RING + 1) continue;
    /* **고르게 뿌리면 잔해도 격자가 된다.** 칸마다 같은 확률로 굴렸더니 벌판이 고물상처럼
       빽빽해지고, 그마저 줄 맞춰 늘어서 보였다. 세 칸 단위의 성긴 노이즈로 **동네마다 밀도를
       달리** 해서 뭉친 데는 뭉치고 빈 데는 시원하게 비운다. */
    const clump = hash2(Math.floor(x / 3), Math.floor(y / 3), 41);
    if (hash2(x, y, 11) > 0.07 + clump * 0.21) continue;
    const d = pick(DECOS, hash2(x, y, 19));
    const sz = CELL * (0.55 + hash2(x, y, 23) * 0.35);
    const jx = (hash2(x, y, 29) - 0.5) * CELL * 0.55, jy = (hash2(x, y, 31) - 0.5) * CELL * 0.55;
    h += `<img class="deco" src="assets/deco/${d}.png" alt="" onerror="this.remove()"` +
         ` style="left:${cx(x) + jx}px;top:${cy(y) + jy}px;width:${sz}px;height:${sz}px">`;
  }
  // **다음 웨이브가 어디서 오는지 미리 보여 준다.** 안 보여 주면 첫 라운드는 무조건 헛방이고,
  // 그건 배치가 아니라 운이다. 화살표는 **적이 실제로 나오는 자리**에 선다 —
  // 판을 넓히고 나서도 가장자리에 두면 아무것도 없는 벌판 끝을 가리키게 된다.
  {
    const c = coreCenter();
    const rad = spawnRadius() + CELL * 0.35;
    for (const th of waveLanes(S.round)) {
      const ax = c.x + Math.cos(th) * rad, ay = c.y + Math.sin(th) * rad;
      h += `<div class="lane" style="left:${ax}px;top:${ay}px;` +
           `transform:translate(-50%,-50%) rotate(${th + Math.PI / 2}rad)">▼</div>`;
    }
  }

  // 본진 — 칸을 쪼개지 않고 **한 덩이**로 그린다. 조각으로 두면 지킬 것이 아니라 타일로 읽힌다.
  h += `<div class="core" id="coreEl"
    style="left:${px(CORE.x)}px;top:${py(CORE.y)}px;width:${CELL*CORE.w-2}px;height:${CELL*CORE.h-2}px">
      <img class="cspr" src="assets/unit/bunker.png" alt=""
        onerror="this.parentNode&amp;&amp;this.parentNode.classList.add('noimg');this.remove()">
      <div class="cbar"><i id="coreBar"></i></div>
      <div class="cnum" id="coreNum"></div>
    </div>`;
  h += `<div class="vignette"></div>`;   // 맨 나중에 — 땅과 잔해만 덮고 몹·대원은 못 덮게
  $("grid").innerHTML = h;
  drawTowers();
}

/* ══ 로그 ══ */
export const say = (html) => {
  $("log").insertAdjacentHTML("afterbegin", `<div>${html}</div>`);
  while ($("log").children.length > 30) $("log").lastChild.remove();
};

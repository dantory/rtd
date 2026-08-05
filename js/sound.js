/* ══ 소리 — 파일 없이 WebAudio 로 합성한다 ══
   관전이 심장인 게임인데 무음이면 화면이 아무리 움직여도 손맛이 없다.
   에셋을 늘리지 않는 이유: 프로토타입은 가볍게, 그리고 합성음은 음량·길이를
   숫자로 조율할 수 있어 "시끄럽다"는 지적에 즉시 답할 수 있다.

   - 모바일 자동재생 정책: AudioContext 는 첫 사용자 입력에서야 풀린다 —
     lazy 로 만들고 pointerdown 한 번에 resume 한다.
   - 6배속이면 발사가 초당 수십 발이다. 소리마다 스로틀을 둬서 총성이
     백색소음이 되지 않게 한다. */

const KEY = "rtd.sound";
let on = (() => { try { return localStorage.getItem(KEY) !== "0"; } catch { return true; } })();
let ctx = null;
const last = {};                     // 소리별 마지막 재생 시각 — 스로틀

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}
// 첫 터치에서 오디오를 풀어 둔다 — 이게 없으면 폰에서 끝까지 무음이다
addEventListener("pointerdown", () => { if (on) ac(); }, { once: true });

export const soundOn = () => on;
export function setSound(v) {
  on = v;
  try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {}
  if (v) ac();
}

/** 짧은 톤 하나. type/주파수/길이/음량만으로 대부분의 효과음이 나온다. */
function tone(freq, dur, { type = "square", vol = 0.05, slide = 0, delay = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(c.destination);
  o.start(t0); o.stop(t0 + dur + 0.02);
}
/** 잡음 한 줌 — 타격·폭발용. */
function noise(dur, { vol = 0.05, freq = 900, delay = 0 } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const n = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = freq;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f); f.connect(g); g.connect(c.destination);
  src.start(t0);
}

const FX = {
  //  발사 — 아주 짧은 틱. 낮은 음량 + 강한 스로틀: 리듬만 남기고 소음은 버린다
  shoot:   { min: 90,  play: () => tone(660, 0.045, { type: "square", vol: 0.022, slide: -220 }) },
  //  묵직한 발사(로켓·저격) — 조금 더 낮고 길게
  heavy:   { min: 140, play: () => { tone(180, 0.1, { type: "sawtooth", vol: 0.04, slide: -90 }); noise(0.08, { vol: 0.03, freq: 500 }); } },
  //  적 처치 — 낮은 툭
  kill:    { min: 70,  play: () => noise(0.05, { vol: 0.03, freq: 700 }) },
  //  벙커 피격 — 둔탁하게, 경고의 결
  hitCore: { min: 250, play: () => { tone(110, 0.12, { type: "triangle", vol: 0.07, slide: -40 }); noise(0.1, { vol: 0.04, freq: 300 }); } },
  //  합성 — 세 음이 올라간다. 숫자가 불어나는 순간이니 제일 밝게
  merge:   { min: 200, play: () => { tone(523, 0.09, { vol: 0.05 }); tone(659, 0.09, { vol: 0.05, delay: 0.07 }); tone(784, 0.14, { vol: 0.06, delay: 0.14 }); } },
  //  보스 처치 — 쿵 + 낮은 울림
  boss:    { min: 400, play: () => { noise(0.25, { vol: 0.09, freq: 400 }); tone(90, 0.3, { type: "sawtooth", vol: 0.06, slide: -30 }); } },
  //  승리 — 짧은 팡파르
  win:     { min: 800, play: () => { tone(523, 0.12, { vol: 0.06 }); tone(659, 0.12, { vol: 0.06, delay: 0.1 }); tone(880, 0.22, { vol: 0.07, delay: 0.2 }); } },
  //  패배 — 두 음이 내려간다. 길게 끌면 청승이라 짧게
  lose:    { min: 800, play: () => { tone(330, 0.16, { type: "triangle", vol: 0.06 }); tone(220, 0.26, { type: "triangle", vol: 0.06, delay: 0.14 }); } },
  //  자원 받기(오프라인·정산) — 동전 두 닢
  coin:    { min: 200, play: () => { tone(988, 0.06, { vol: 0.05 }); tone(1319, 0.1, { vol: 0.05, delay: 0.05 }); } },
};

export function sfx(name) {
  if (!on) return;
  const f = FX[name];
  if (!f) return;
  const now = performance.now();
  if (last[name] && now - last[name] < f.min) return;   // 스로틀 — 소리가 겹치면 소음이 된다
  last[name] = now;
  try { f.play(); } catch { /* 오디오가 없어도 게임은 돈다 */ }
}

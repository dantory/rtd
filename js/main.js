import { buildable, COLS, CORE, fragNeed, GNAME, GRADE, hpOf, KIND_IDS, kindCost, kindLv, KINDS, MEDAL_GATE, medalDmg, medalGain, medalRelic, medals, medalsAt, medalSlots, META, metaDmg, newlySeen, nextMedalAt, noteSeen, prestige, refreshSlots, relicsFor, RING, ROWS, S, saveMeta, SLOT_SPOTS, slotMax, upCost, UPGRADES, waveHp, waveN } from "./core.js";
import { applyView, CELL, clampView, cx, cy, drawGrid, fitView, focusView, layout, V, WORLD_H, WORLD_W, zoomAt } from "./view.js";
import { autoBest, coreCenter, coreRadius, coverOf, dexStat, dmgOf, fillFree, fragLeft, freeSlots, inBox, placed, recruit, recruitCost, rngOf, sell, spawnRadius, syncArmy } from "./army.js";
import { bossNote, distToCore, drawShop, drawStats, gameOver, hasPow, hurt, mobPos, MOBNAME, MOBWEAK, namedBoss, POWNAME, spawnMob, startWave, step, tick, waveLanes, wavePool, waveTheme } from "./combat.js";
import { newGame, offlineReport, openOffline, openSquad, refresh, wireUI } from "./ui.js";
import { foldHist } from "./core.js";


// 검증 도구용 창구
Object.assign(window, { S, META, KINDS, GNAME, recruit, sell, startWave, refresh, tick, fragLeft,
  freeSlots, waveHp, waveN, waveLanes, coreCenter, coreRadius, distToCore, hpOf, coverOf,
  cx, cy, rngOf, dmgOf, buildable, CORE, drawGrid, layout, KIND_IDS, GRADE,
  V, fitView, focusView, zoomAt, applyView, clampView, CELL, WORLD_W, WORLD_H, mobPos, RING,
  COLS, ROWS, spawnRadius, refreshSlots, slotMax, UPGRADES, kindCost, kindLv, fillFree, autoBest, inBox, placed, syncArmy, recruitCost, SLOT_SPOTS, openSquad });
  // 판 크기와 **자리 수**를 밖에 내준다 — 검증 하네스가 자를 직접 재게

// 상성 표와 웨이브 표도 밖에 내준다 — 검증 봇이 "예고를 읽고 갈아 끼우는" 사람을 흉내 내려면
// 게임이 쓰는 것과 **같은 표**를 봐야 한다(다른 표를 보면 재는 것이 게임이 아니게 된다).
Object.assign(window, { wavePool, waveTheme, MOBNAME, MOBWEAK, bossNote, namedBoss, hasPow, POWNAME, spawnMob, hurt });
Object.assign(window, { META, newGame, drawShop, relicsFor, upCost, UPGRADES, saveMeta, metaDmg, offlineReport, openOffline, dexStat, noteSeen, newlySeen, gameOver, fragNeed,
  medals, medalGain, medalsAt, medalDmg, medalRelic, medalSlots, nextMedalAt, prestige, MEDAL_GATE, foldHist, drawStats });

/* refreshSlots 를 layout(drawGrid)보다 먼저 — 순서가 뒤면 첫 화면의 자리가 전부
   "잠김"으로 그려지고, 첫 웨이브가 갈래를 바꿔 다시 그릴 때까지 그대로 남는다. */
wireUI();
refreshSlots(); layout();
/* 오프라인 지급은 newGame 보다 **먼저** 잰다 — newGame 이 saveMeta 로 lastSeen 을
   지금 시각으로 덮으므로, 그 뒤에 재면 비운 시간이 늘 0 이 된다. */
const offRep = offlineReport();
newGame(); requestAnimationFrame(step);
if (offRep) openOffline(offRep);
setTimeout(focusView, 60);
/* 방치 중엔 saveMeta 가 뜸해 lastSeen 이 멎는다 — 주기적으로 찍어 비운 시간을 이어 준다. */
setInterval(saveMeta, 10000);
/* **탭을 닫는 순간에도 한 번 찍는다.** 처치 수는 판이 끝나야 저장되고 그 사이는 10 초짜리
   주기 저장에 얹혀 갔다 — 마지막 저장 뒤에 잡은 것은 그대로 샜다. 폰에서는 `unload` 가
   아예 안 오는 일이 있어 `visibilitychange`(숨김)를 같이 건다. */
addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") saveMeta(); });
addEventListener("pagehide", saveMeta);
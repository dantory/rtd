import { buildable, COLS, CORE, GNAME, GRADE, hpOf, KIND_IDS, kindCost, kindLv, KINDS, META, metaDmg, newlySeen, noteSeen, refreshSlots, relicsFor, RING, ROWS, S, saveMeta, SLOT_SPOTS, slotMax, upCost, UPGRADES, waveHp, waveN } from "./core.js";
import { applyView, CELL, clampView, cx, cy, drawGrid, fitView, focusView, layout, V, WORLD_H, WORLD_W, zoomAt } from "./view.js";
import { canMerge, coreCenter, coreRadius, coverOf, dexStat, dmgOf, fillFree, freeSlots, inBox, merge, mergeGroups, placed, recruit, recruitCost, rngOf, sell, spawnRadius, syncArmy } from "./army.js";
import { distToCore, drawShop, mobPos, startWave, step, tick, waveLanes } from "./combat.js";
import { newGame, offlineReport, openOffline, openSquad, refresh, wireUI } from "./ui.js";


// 검증 도구용 창구
Object.assign(window, { S, META, KINDS, GNAME, recruit, merge, sell, startWave, refresh, tick, canMerge,
  freeSlots, waveHp, waveN, waveLanes, coreCenter, coreRadius, distToCore, hpOf, coverOf,
  cx, cy, rngOf, dmgOf, buildable, CORE, drawGrid, layout, KIND_IDS, GRADE, mergeGroups,
  V, fitView, focusView, zoomAt, applyView, clampView, CELL, WORLD_W, WORLD_H, mobPos, RING,
  COLS, ROWS, spawnRadius, refreshSlots, slotMax, UPGRADES, kindCost, kindLv, fillFree, inBox, placed, syncArmy, recruitCost, SLOT_SPOTS, openSquad });
  // 판 크기와 **자리 수**를 밖에 내준다 — 검증 하네스가 자를 직접 재게

Object.assign(window, { META, newGame, drawShop, relicsFor, upCost, UPGRADES, saveMeta, metaDmg, offlineReport, openOffline, dexStat, noteSeen, newlySeen });

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
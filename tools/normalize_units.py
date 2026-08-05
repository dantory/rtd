#!/usr/bin/env python3
"""유닛 스프라이트의 **키를 맞추고 발을 한 줄에 세운다.**

PixelLab 은 64×64 캔버스 안에서 그림 크기를 매번 다르게 잡는다 — 재 보니 실제 내용
높이가 폭탄병 44px, 지뢰병 20px 로 2.2배 차이였고(병수님: "유닛마다 크기가 조금씩
다른 것 같은데 의도된 건가?"), 아래 여백도 3~19px 로 제각각이라 나란히 세우면
누구는 공중에 뜨고 누구는 바닥에 박혀 보였다.

다 같은 사람이니 **키는 같아야 한다.** 다만 자세가 앉은 것(저격수·지뢰병)은 실제로
낮은 게 맞으므로 그것만 낮게 둔다. 발끝(아래 여백)은 전부 같은 줄에 맞춘다.

    python3 tools/normalize_units.py [--dry]
"""
import sys, glob, os
from PIL import Image

TALL   = 42          # 서 있는 병사의 키(64px 캔버스 기준)
CROUCH = {"rail": 35, "mine": 33}    # 앉은 자세는 낮은 게 맞다
FOOT   = 8           # 발끝에서 캔버스 아래까지 — 전부 같아야 한 줄에 선다
SKIP   = {"bunker"}  # 벙커는 유닛이 아니다(96px, 건물)

dry = "--dry" in sys.argv
for f in sorted(glob.glob("assets/unit/*.png")):
    name = os.path.basename(f)[:-4]
    if name in SKIP: continue
    im = Image.open(f).convert("RGBA")
    W, H = im.size
    bb = im.split()[3].getbbox()
    cw, ch = bb[2]-bb[0], bb[3]-bb[1]
    tgt = CROUCH.get(name, TALL)
    if ch == tgt and H - bb[3] == FOOT:
        print(f"  = {name:8} 그대로"); continue
    s = tgt / ch
    nw = max(1, round(cw * s))
    body = im.crop(bb).resize((nw, tgt), Image.NEAREST)
    out = Image.new("RGBA", (W, H), (0,0,0,0))
    out.paste(body, ((W - nw)//2, H - FOOT - tgt), body)
    print(f"  ↑ {name:8} {cw}x{ch} → {nw}x{tgt}  (×{s:.2f})")
    if not dry: out.save(f)
print("끝" + (" (dry-run — 저장 안 함)" if dry else ""))

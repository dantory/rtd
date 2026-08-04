#!/usr/bin/env python3
"""땅 타일의 **이음새를 지운다.**

굽고 나면 타일마다 가장자리 밝기가 제각각이라, 이어 깔았을 때 벌판이 통째로 체크무늬로
보인다. lineless 로 다시 구워도 남는다 — 생성 모델이 64px 안에서 그림을 "완결"시키기 때문에
가장자리가 안쪽과 다르게 마무리되는 것이다.

그래서 두 가지를 한다.
  1. **밝기를 한 기준으로 맞춘다** — 타일마다 평균 밝기가 다르면 그 자체로 격자가 된다.
  2. **가장자리를 알파로 흐린다** — 흐린 가장자리끼리 겹쳐 깔면 경계가 사라진다.
     (그래서 화면에서는 타일을 칸보다 크게 그려 서로 물리게 한다.)

    python3 tools/blend_ground.py            # assets/ui 의 땅 타일 전부
"""
import os, sys, colorsys
from PIL import Image, ImageChops, ImageFilter, ImageEnhance, ImageStat

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
GROUND = ["dirt", "dirt2", "dirt3", "rock", "ash", "grate"]
SLOTS = ["pad", "pad2"]  # 놓는 자리(터) — 벌판보다 조금 밝게, 가장자리는 안 흐린다
FEATHER = 0.17          # 가장자리 몇 %를 흐리게 할지
# 46 으로 올렸더니 땅은 이어졌는데 돌바닥 무늬가 죄다 또렷해져 **네 장이 반복되는 게**
# 그대로 드러났다. 벌판은 가라앉혀 결만 남기고, 대비는 터와의 차이로 만든다.
TARGET_L = 34           # 맞출 평균 밝기(0-255). 어두운 전장 톤.
TARGET_L_SLOT = 58      # 터는 벌판보다 한 뼘 밝아야 "놓을 수 있는 자리"로 읽힌다
# **밝기만 맞추면 색이 튄다.** 거의 검은 타일(dirt2 평균 7, ash 4)을 5배로 곱해 46 에
# 맞췄더니 파란 채널만 살아남아 채도 0.77 짜리 보라·파랑 얼룩이 됐다. 밝기는 같은데
# 색이 다르면 그게 곧 격자다 — 그래서 채도에 천장을 두고 먼저 누른 뒤에 밝기를 맞춘다.
TARGET_S = 0.10
# 64 는 전장 톤보다 밝아 회색빛이 돌았고, 42 는 터가 새까만 판이 되어 칸이 안 세어졌다.
# 벌판이 결을 유지하면서 터가 바닥으로 읽히는 지점이 53 근처다(찍어 가며 맞췄다).
TARGET_L_SHEET = 53     # Wang 타일셋 시트의 평균 밝기(터·벌판·전이가 다 섞인 값)


def feather_mask(size, pad):
    """가운데는 불투명, 가장자리로 갈수록 투명해지는 마스크."""
    w, h = size
    m = Image.new("L", (w, h), 0)
    m.paste(255, (pad, pad, w - pad, h - pad))
    return m.filter(ImageFilter.GaussianBlur(pad * 0.75))


def avg_sv(rgb):
    """평균색의 채도와 밝기. 얼룩은 타일 '전체 색조'의 문제라 평균으로 잰다."""
    r, g, b = rgb.resize((1, 1)).getpixel((0, 0))
    _, s, _ = colorsys.rgb_to_hsv(r / 255, g / 255, b / 255)
    return s, (r + g + b) / 3


def bake(name, target_l, feather):
    p = os.path.join(ROOT, "assets", "ui", name + ".png")
    if not os.path.exists(p):
        print(f"  ✗ {name}: 없다")
        return
    # **원본을 따로 남긴다.** 제자리에서 덮어쓰기만 하면 두 번 돌렸을 때 페이드가 겹쳐
    # 타일이 점점 투명해진다 — 굽는 데 몇 분씩 걸리는 걸 날려 먹는다.
    raw = os.path.join(ROOT, "assets", "ui", "_raw", name + ".png")
    os.makedirs(os.path.dirname(raw), exist_ok=True)
    if not os.path.exists(raw):
        Image.open(p).save(raw)
    im = Image.open(raw).convert("RGBA")
    w, h = im.size
    rgb = im.convert("RGB")
    s0, l0 = avg_sv(rgb)

    # 1) **채도를 먼저 누른다.** 밝기를 올리면 색이 같이 진해지므로 순서가 뒤바뀌면 안 된다.
    if s0 > TARGET_S:
        rgb = ImageEnhance.Color(rgb).enhance(TARGET_S / s0)

    # 2) 밝기 맞추기 — 곱셈으로 올리고 내린다(더하기는 어두운 데가 뿌예진다)
    mean = avg_sv(rgb)[1]
    if mean > 1:
        # 상한 5.0 은 거의 검은 타일의 노이즈까지 증폭해 얼룩을 만든다. 3.0 으로 조이고,
        # 못 닿는 만큼은 아래에서 회색을 섞어 채운다 — 색을 만들지 않고 밝기만 올리는 길이다.
        k = max(0.5, min(3.0, target_l / mean))
        rgb = ImageChops.multiply(rgb, Image.new("RGB", (w, h), tuple([int(255 * k)] * 3))) \
              if k <= 1 else Image.eval(rgb, lambda v: min(255, int(v * k)))
        mean = avg_sv(rgb)[1]
        if mean < target_l - 3:
            a = min(0.75, (target_l - mean) / max(1, target_l))
            veil = Image.new("RGB", (w, h), (target_l, target_l, target_l))
            rgb = Image.blend(rgb, veil, a)

    # 3) 가장자리 알파 페이드 — 터는 칸이 세어져야 하므로 흐리지 않는다
    if feather:
        pad = max(3, int(min(w, h) * FEATHER))
        out = Image.merge("RGBA", (*rgb.split(), feather_mask((w, h), pad)))
    else:
        pad = 0
        out = rgb.convert("RGBA")
    out.save(p)
    s1, l1 = avg_sv(rgb)
    print(f"  {name:6s} 채도 {s0:.2f}→{s1:.2f} · 밝기 {l0:.0f}→{l1:.0f} · 페이드 {pad}px")


def bake_tileset():
    """Wang 타일셋은 **한 장으로 통째로** 어둡게 한다.

    타일마다 밝기를 맞추면 안 된다 — 이 시트의 열여섯 장은 서로 맞물리라고 구운 것이라,
    낱장씩 건드리면 그 맞물림이 깨져 이음새가 도로 살아난다. 굽혀 나온 평균이 63 이라
    전장 톤(30 대)보다 밝으니 전체에 같은 배율만 곱한다.
    """
    src = os.path.join(ROOT, "asset_staging", "tileset", "tileset.png")
    dst = os.path.join(ROOT, "assets", "ui", "tileset.png")
    if not os.path.exists(src):
        print("  ✗ tileset: 원본이 없다")
        return
    im = Image.open(src).convert("RGBA")
    rgb = im.convert("RGB")
    before = ImageStat.Stat(rgb).mean
    k = TARGET_L_SHEET / (sum(before) / 3)
    rgb = ImageChops.multiply(rgb, Image.new("RGB", im.size, tuple([int(255 * min(1, k))] * 3)))
    Image.merge("RGBA", (*rgb.split(), im.split()[3])).save(dst)
    print(f"  tileset 밝기 {sum(before)/3:.0f} → {sum(ImageStat.Stat(rgb).mean)/3:.0f} (×{k:.2f})")


def main():
    print("벌판")
    for name in GROUND:
        bake(name, TARGET_L, True)
    print("터")
    for name in SLOTS:
        bake(name, TARGET_L_SLOT, False)
    print("Wang 타일셋")
    bake_tileset()


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""벙커디펜스에 쓸 스프라이트를 PixelLab MCP 로 굽는다.

    python3 tools/pixellab/gen.py            # 아직 없는 것만
    python3 tools/pixellab/gen.py --force    # 전부 다시
    python3 tools/pixellab/gen.py bunker gun # 일부만

**한 세트로 읽히게 하는 것이 전부다.** 시점·조명·팔레트를 설명에 못 박아 두지 않으면
유닛은 옆에서 본 그림, 적은 위에서 본 그림이 되어 같은 판에 못 세운다.
(DELVE 에서 마을 아이콘 시점이 제각각이라 조감도가 안 됐던 것과 같은 실수를 미리 막는다.)

결과는 public/assets/<폴더>/<id>.png — 서버가 public/ 을 그대로 서빙한다.
"""
import base64, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MCP  = os.path.join(HERE, "mcp_call.py")

# 온 세트를 묶는 규칙. 전부 **위에서 비스듬히 내려다본다** — 전장이 위에서 본 격자이기 때문이다.
TONE = ("top-down three-quarter view seen from above, dark grimy sci-fi bunker war, "
        "muted steel and rust palette, single light source from above, transparent background")
UNIT = f"{TONE}, small squat turret emplacement standing on a metal pad, centred, whole object visible"
MOB  = f"{TONE}, hostile creature charging forward, centred, whole body visible"

SPRITES = {
    # ── 본진 ── 지킬 것. 한눈에 "저게 무너지면 끝"으로 읽혀야 하므로 크고 육중하게.
    "unit/bunker": (f"{TONE}, a heavy fortified command bunker of riveted steel with a domed roof, "
                    f"armoured shutters, antenna mast, glowing blue core window, massive and squat", 128),

    # ── 유닛 8종 ── 실루엣이 서로 달라야 한다. 격자에서 56px 로 줄어들면 색과 형태만 남는다.
    "unit/gun":     (f"{UNIT}, twin autocannon turret with long paired barrels, pale steel", 64),
    "unit/cannon":  (f"{UNIT}, stubby wide-mouthed mortar turret, thick short barrel pointing up, rust orange", 64),
    "unit/frost":   (f"{UNIT}, cryo turret with frosted coils and icy blue vapour, pale cyan", 64),
    "unit/bolt":    (f"{UNIT}, tesla coil tower with copper rings and arcing violet lightning", 64),
    "unit/flame":   (f"{UNIT}, flamethrower nozzle turret with fuel tanks and pilot flame, ember orange", 64),
    "unit/rail":    (f"{UNIT}, long slender railgun on a tripod, glowing rail slot, cold white", 64),
    "unit/drone":   (f"{UNIT}, small landing pad with a hovering scout drone above it, green running lights", 64),
    "unit/mine":    (f"{UNIT}, cluster of squat proximity mines on a plate, yellow black hazard stripes", 64),

    # ── 적 6종 ── 아군과 확실히 갈리게 붉은 계열로 통일한다.
    "mob/grunt":  (f"{MOB}, small four-legged crawler drone with a single red eye, dark red chitin", 48),
    "mob/runner": (f"{MOB}, lean two-legged sprinter creature, long thin limbs, crimson", 48),
    "mob/brute":  (f"{MOB}, bulky armoured beast with thick shoulder plates, deep red", 56),
    "mob/swarm":  (f"{MOB}, tight cluster of tiny flying insect drones, dark red haze", 48),
    "mob/shield": (f"{MOB}, hunched creature holding a large riveted metal shield in front, rust red", 56),
    "mob/boss":   (f"{MOB}, towering hulking siege monstrosity with armour plating and glowing red core, "
                   f"far larger than the others, menacing", 96),

    # ── 이펙트 ── 스프라이트 위에 겹쳐 한 번 번쩍이므로 배경이 없어야 하고 실루엣이 단순해야 한다.
    "fx/hit":   ("a small sharp burst of white and amber sparks, impact flash, "
                 "no background, dark sci-fi pixel effect", 32),
    "fx/blast": ("a round orange explosion with smoke ring, no background, dark sci-fi pixel effect", 48),
    "fx/frost": ("a burst of pale blue ice shards radiating outward, no background, dark sci-fi pixel effect", 32),
    "fx/spark": ("a jagged violet lightning arc, no background, dark sci-fi pixel effect", 32),

    # ── 바닥 ── 터와 바깥 땅. **이어 깔리므로 가장자리가 튀면 안 된다.**
    "ui/pad":   ("a plain square metal deck plate seen from directly above, riveted steel, "
                 "seamless tileable, subtle wear, no objects", 64),
    "ui/dirt":  ("a plain square patch of cracked dark wasteland ground seen from directly above, "
                 "seamless tileable, no objects, very dark", 64),
}

COMMON = {"view": "high top-down", "outline": "single color outline",
          "shading": "medium shading", "detail": "high detail"}


def mcp(tool, args, timeout=240):
    r = subprocess.run([sys.executable, MCP, tool, json.dumps(args)],
                       capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{tool} 실패: {r.stderr[:300]}")
    return json.loads(r.stdout)


def content(resp):
    return resp.get("result", {}).get("content", [])


def queue(key):
    desc, size = SPRITES[key]
    resp = mcp("create_map_object", {"description": desc, "width": size, "height": size, **COMMON})
    for c in content(resp):
        if c.get("type") == "text":
            for line in c["text"].splitlines():
                if line.startswith("id:"):
                    return line.split(":", 1)[1].strip()
    raise RuntimeError(f"{key}: id 를 못 받았다 — {str(resp)[:240]}")


def fetch(key, oid):
    # 파라미터 이름은 object_id 다. map_object_id 로 부르면 조용히 빈손으로 돌아온다
    # (그래서 21개가 전부 시간만 흘려보냈다).
    for _ in range(60):
        resp = mcp("get_map_object", {"object_id": oid})
        done = any(c.get("type") == "text" and "status: completed" in c.get("text", "")
                   for c in content(resp))
        for c in content(resp):
            if done and c.get("type") == "image" and c.get("data"):
                out = os.path.join(ROOT, "public", "assets", key + ".png")
                os.makedirs(os.path.dirname(out), exist_ok=True)
                raw = base64.b64decode(c["data"])
                open(out, "wb").write(raw)
                return len(raw)
        time.sleep(6)
    return 0


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    keys = []
    for k in SPRITES:
        short = k.split("/")[-1]
        if args and short not in args and k not in args:
            continue
        path = os.path.join(ROOT, "public", "assets", k + ".png")
        if not force and os.path.exists(path):
            continue
        keys.append(k)
    if not keys:
        print("구울 것이 없다 (전부 있음). --force 로 다시 구울 수 있다.")
        return

    print(f"굽기 시작: {len(keys)}개")
    ids = {}
    for k in keys:
        try:
            ids[k] = queue(k)
            print(f"  큐 {k} → {ids[k]}", flush=True)
        except Exception as e:
            print(f"  ✗ {k}: {e}", flush=True)
        time.sleep(1.5)

    print("\n받는 중…", flush=True)
    ok = 0
    for k, oid in ids.items():
        try:
            n = fetch(k, oid)
            if n:
                ok += 1
                print(f"  저장 {k}.png ({n}B)", flush=True)
            else:
                print(f"  ✗ {k}: 시간 초과", flush=True)
        except Exception as e:
            print(f"  ✗ {k}: {e}", flush=True)

    print(f"\n끝 — {ok}/{len(keys)}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""벙커디펜스에 쓸 스프라이트를 PixelLab MCP 로 굽는다.

    python3 tools/pixellab/gen.py            # 아직 없는 것만
    python3 tools/pixellab/gen.py --force    # 전부 다시
    python3 tools/pixellab/gen.py bunker gun # 일부만

**한 세트로 읽히게 하는 것이 전부다.** 시점·조명·팔레트를 설명에 못 박아 두지 않으면
유닛은 옆에서 본 그림, 적은 위에서 본 그림이 되어 같은 판에 못 세운다.
(DELVE 에서 마을 아이콘 시점이 제각각이라 조감도가 안 됐던 것과 같은 실수를 미리 막는다.)

결과는 assets/<폴더>/<id>.png — 서버가 리포 루트를 그대로 서빙한다.
"""
import base64, json, os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MCP  = os.path.join(HERE, "mcp_call.py")

# 온 세트를 묶는 규칙. 전부 **위에서 비스듬히 내려다본다** — 전장이 위에서 본 격자이기 때문이다.
TONE = ("top-down three-quarter view seen from above, dark grimy sci-fi bunker war, "
        "muted steel and rust palette, single light source from above, transparent background")
UNIT = f"{TONE}, small squat turret emplacement standing on a metal pad, centred, whole object visible"
# **벙커에 넣는 건 포탑이 아니라 사람이다.** 자리에 놓는 것이 구조물이면 아무리 "할당"이라
# 불러도 화면에는 타워를 세우는 게임으로 보인다(실제로 그렇게 보였다). 한 사람씩,
# 실루엣으로 병과가 갈리게 굽는다 — 격자에서 56px 로 줄면 자세와 든 것만 남는다.
TROOP = (f"{TONE}, a single human soldier in dark grimy sci-fi armour standing on a riveted metal "
         "deck plate, full body visible from head to boots, centred, facing the viewer, "
         "clear readable silhouette")
MOB  = f"{TONE}, hostile creature charging forward, centred, whole body visible"
# 땅은 **위에서 똑바로** 본다 — 비스듬히 보면 이어 깔았을 때 원근이 어긋나 격자가 물결친다.
GROUND = ("a plain square patch of ground seen from directly above, seamless tileable, "
          "very dark muted palette, no objects sticking up, dark grimy sci-fi wasteland")
# 데코는 얹는 것이라 그림자까지 포함하되 배경은 없어야 한다.
DECO = (f"{TONE}, lying on the ground as scenery, centred, whole object visible, "
        "with a soft contact shadow, transparent background")

# **땅에는 외곽선을 두르면 안 된다.** 기본값(single color outline)으로 구웠더니 64px 타일
# 하나하나에 테두리가 그려져, 이어 깔았을 때 벌판이 통째로 격자로 보였다 — 테두리를 CSS 에서
# 지워도 소용없었다. 그림 자체에 선이 들어 있었기 때문이다. 땅은 lineless 로 굽는다.
FLAT = {"outline": "lineless", "shading": "basic shading", "detail": "medium detail"}

SPRITES = {
    # ── 본진 ── 지킬 것. 한눈에 "저게 무너지면 끝"으로 읽혀야 하므로 크고 육중하게.
    "unit/bunker": (f"{TONE}, a heavy fortified command bunker of riveted steel with a domed roof, "
                    f"armoured shutters, antenna mast, glowing blue core window, massive and squat", 128),

    # ── 대원 12종 ── **병과가 실루엣으로 갈려야 한다.** 든 것과 자세만으로 구분되게 굽는다.
    "unit/gun":     (f"{TROOP}, holding a long assault rifle at the hip, pale steel helmet, standard trooper", 64),
    "unit/cannon":  (f"{TROOP}, shouldering a stubby wide-mouthed grenade launcher, bulky rust orange armour", 64),
    "unit/frost":   (f"{TROOP}, holding a cryo gun with frosted coils, icy blue vapour, pale cyan gear", 64),
    "unit/bolt":    (f"{TROOP}, carrying a tesla coil backpack with copper rings, arcing violet lightning", 64),
    "unit/flame":   (f"{TROOP}, holding a flamethrower with fuel tanks on the back, ember orange pilot flame", 64),
    "unit/rail":    (f"{TROOP}, kneeling with a long slender railgun rifle, glowing rail slot, cold white gear", 64),
    "unit/drone":   (f"{TROOP}, light scout with a small hovering drone above the shoulder, green running lights", 64),
    "unit/mine":    (f"{TROOP}, engineer crouching with a satchel of proximity mines, yellow black hazard stripes", 64),
    # 넷을 더한다 — **모으는 재미는 종류에서 나온다.** 다만 숫자만 다른 것은 늘려 봐야
    # 목록만 길어지므로, 새로 오는 넷은 전부 "때리는 것 말고 다른 일"을 한다.
    "unit/medic":   (f"{TROOP}, field medic with a red cross medkit and a healing beam emitter, white and red", 64),
    "unit/guard":   (f"{TROOP}, heavy guard braced behind a large riveted riot shield, thick steel plating", 64),
    "unit/rocket":  (f"{TROOP}, shouldering a large rocket launcher tube, warhead visible, dark green armour", 64),
    "unit/officer": (f"{TROOP}, commanding officer with a peaked cap, greatcoat and raised sabre, gold trim", 64),

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
                 "seamless tileable, no objects, very dark", 64, FLAT),

    # ── 땅의 변주 ── **판이 커지면 바깥 땅이 화면의 대부분이 된다.**
    # 한 장을 500번 반복하면 지형이 아니라 벽지로 보인다(실제로 그래서 "허접"했다).
    # 같은 톤·같은 밝기로 결만 다른 것을 여러 장 두고 칸마다 골라 깐다.
    "ui/dirt2": (f"{GROUND}, cracked dark earth with a few scattered small stones", 64, FLAT),
    "ui/dirt3": (f"{GROUND}, dry dark earth split by one deep jagged fissure", 64, FLAT),
    "ui/rock":  (f"{GROUND}, dark rocky ground littered with broken concrete chunks", 64, FLAT),
    "ui/ash":   (f"{GROUND}, scorched black ash ground with a few faint dying embers", 64, FLAT),
    "ui/grate": (f"{GROUND}, half-buried rusted metal grating over dark soil", 64, FLAT),
    "ui/pad2":  ("a plain square metal deck plate seen from directly above, riveted steel with a "
                 "yellow black hazard stripe along one edge, seamless tileable, worn, no objects", 64),

    # ── 데코 ── 땅 위에 드문드문 얹는다. 배경이 없어야 어느 땅 위에든 올라간다.
    # 이것이 "빈 땅"과 "폐허가 된 전장"을 가른다.
    "deco/wreck":   (f"{DECO}, the rusted burnt-out hull of a wrecked armoured vehicle lying on its side", 64),
    "deco/crates":  (f"{DECO}, a small stack of military supply crates with faded markings", 48),
    "deco/pipe":    (f"{DECO}, a broken industrial pipe segment jutting out of the ground, leaking", 48),
    "deco/boulder": (f"{DECO}, a cluster of jagged dark boulders", 48),
    "deco/bones":   (f"{DECO}, a few scattered bleached bones and a cracked skull", 48),
    "deco/crystal": (f"{DECO}, a small cluster of glowing cyan crystal shards growing from the ground", 48),
    "deco/barrel":  (f"{DECO}, two dented rusty fuel barrels, one tipped over", 48),
    "deco/antenna": (f"{DECO}, a leaning broken radio antenna mast with torn cables", 64),
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
    # 항목마다 옵션을 덧씌울 수 있다 — 땅(FLAT)처럼 온 세트와 다르게 구워야 하는 것이 있다.
    spec = SPRITES[key]
    desc, size = spec[0], spec[1]
    opts = {**COMMON, **(spec[2] if len(spec) > 2 else {})}
    resp = mcp("create_map_object", {"description": desc, "width": size, "height": size, **opts})
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
                out = os.path.join(ROOT, "assets", key + ".png")
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
        path = os.path.join(ROOT, "assets", k + ".png")
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

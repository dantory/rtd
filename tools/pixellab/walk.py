#!/usr/bin/env python3
"""적 걷기 프레임을 PixelLab 로 굽는다.

    python3 tools/pixellab/walk.py grunt          # 한 종류
    python3 tools/pixellab/walk.py --all          # 아홉 종

**한 장을 흔드는 것은 대역이다.** 지금 화면의 걸음은 코드로 낸 흉내(바운스·기울임·반전)고,
진짜 걷기는 프레임이 있어야 한다. create_character → animate_character(template) →
get_character 의 download 링크 → zip 순서로 굽고 `assets/mob/<id>/walk/<n>.png` 로 푼다.

**여기서 두 번 데였다. 둘 다 "조용히 잘못된 채로 진행"이었다:**
  1. `size` 를 dict 로 보냈더니 MCP 가 검증 오류를 돌려줬는데, 헬퍼가 `isError` 를 안 봐서
     그대로 통과했다 — character_id 가 None 이 되어 다운로드 URL 이 `/characters/None/`,
     결국 404 였다. **오류 응답을 반드시 예외로 올린다.**
  2. 다운로드 URL 을 손으로 조립하고 있었다. `get_character` 가 `download:` 줄로 알려 주므로
     **응답에서 읽는다** — 주소 규칙이 바뀌어도 안 깨진다.
응답은 JSON 이 아니라 **사람이 읽는 텍스트**다(`status: completed`, `download: https://…`).
"""
import base64, io, json, os, re, subprocess, sys, time, zipfile, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MCP  = os.path.join(HERE, "mcp_call.py")

TONE = ("top-down three-quarter view seen from above, dark grimy sci-fi bunker war, "
        "muted steel and rust palette, single light source from above")
DESC = {
    "grunt":   "small four-legged crawler drone with a single red eye, dark red chitin",
    "runner":  "lean two-legged sprinter creature, long thin limbs, crimson",
    "brute":   "bulky armoured beast with thick shoulder plates, deep red",
    "swarm":   "tight cluster of tiny flying insect drones, dark red haze",
    "shield":  "hunched creature holding a large riveted metal shield in front, rust red",
    "splitter":"bulbous segmented creature with glowing split seams, dark red",
    "healer":  "hunched creature carrying a glowing green organic sac, dark red body",
    "shooter": "creature with a long barrelled cannon growth on its back, rust red",
    "bomber":  "creature hauling a huge glowing explosive sac on its back, dark red",
}
SIZE = {"brute": 56, "shield": 56, "shooter": 52, "bomber": 52}
TEMPLATE = "walking-4-frames"      # 네 프레임이면 48px 스프라이트에서 걸음이 읽힌다


def mcp(tool, args, timeout=300):
    """MCP 를 한 번 부른다. **오류는 예외로 올린다** — 조용히 통과하면 뒤에서 404 가 난다."""
    r = subprocess.run([sys.executable, MCP, tool, json.dumps(args)],
                       capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{tool} 프로세스 실패: {r.stderr[:300]}")
    d = json.loads(r.stdout)
    res = d.get("result", d)
    if res.get("isError"):
        raise RuntimeError(f"{tool} 에러: {res['content'][0]['text'][:400]}")
    c = res.get("content") or []
    return c[0]["text"] if c and c[0].get("type") == "text" else json.dumps(res)


def wait_body(cid, tries=80, gap=12):
    """몸이 다 구워질 때까지."""
    for _ in range(tries):
        t = mcp("get_character", {"character_id": cid})
        if (re.search(r"status:\s*(\S+)", t) or [None, "?"])[1] == "completed":
            return t
        time.sleep(gap)
    raise RuntimeError("몸 굽기가 안 끝남")


def wait_anim(cid, tries=80, gap=12):
    """**애니메이션은 몸과 별개 잡이다.** `status: completed` 인데도 `pending jobs` 가 돌고
       있고, 그 사이 zip 을 받으면 423 Locked 가 난다(실제로 그렇게 실패했다).
       `pending jobs` 가 사라지고 `animations:` 에 무언가 실릴 때까지 기다린다."""
    for _ in range(tries):
        t = mcp("get_character", {"character_id": cid})
        if "pending jobs" not in t and "animations: none" not in t:
            return t
        time.sleep(gap)
    raise RuntimeError("애니메이션 잡이 안 끝남")


def bake(kind):
    out = os.path.join(ROOT, "assets", "mob", kind, "walk")
    if os.path.isdir(out) and len([f for f in os.listdir(out) if f.endswith(".png")]) >= 4:
        print(f"  건너뜀 {kind} (이미 있음)", flush=True); return
    n = SIZE.get(kind, 48)
    print(f"  굽는 중 {kind} ({n}px)…", flush=True)

    # **기존 그림을 그대로 살려야 한다.** 설명만 주고 새로 그리게 했더니 PixelLab 이
    # humanoid 골격으로 **완전히 다른 놈**을 그렸다(네 다리 기어다니던 grunt 가 사람형
    # 로봇이 됐다). 지금까지 쓰던 적이 통째로 바뀌는 셈이라 못 쓴다.
    # `reference_image_base64` + `mode="v3"` 가 **내 스프라이트를 회전시키는** 길이다.
    ref = os.path.join(ROOT, "assets", "mob", f"{kind}.png")
    b64 = base64.b64encode(open(ref, "rb").read()).decode() if os.path.exists(ref) else None
    args = {"description": f"{TONE}, {DESC[kind]}", "view": "high top-down",
            "outline": "single color outline", "detail": "high detail"}
    if b64:
        args.update({"reference_image_base64": b64, "mode": "v3"})
    else:
        args.update({"size": n, "shading": "medium shading", "n_directions": 4})
    t = mcp("create_character", args)
    m = re.search(r"id:\s*([0-9a-f-]{36})", t)
    if not m:
        raise RuntimeError(f"character_id 를 못 읽음: {t[:200]}")
    cid = m.group(1)
    wait_body(cid)
    print(f"    몸 완성 {cid[:8]} — 걷기 붙이는 중", flush=True)

    mcp("animate_character", {"character_id": cid, "template_animation_id": TEMPLATE})
    t = wait_anim(cid)

    dl = re.search(r"download:\s*(\S+)", t)
    if not dl:
        raise RuntimeError(f"download 링크가 없음: {t[:300]}")
    cfg = json.load(open(os.path.expanduser("~/.config/opencode/opencode.json")))
    auth = cfg["mcp"]["pixellab"]["headers"]["Authorization"]
    blob = urllib.request.urlopen(
        urllib.request.Request(dl.group(1), headers={"Authorization": auth}), timeout=300).read()

    os.makedirs(out, exist_ok=True)
    saved = []
    with zipfile.ZipFile(io.BytesIO(blob)) as z:
        # 방향은 south 하나만 쓴다 — 화면에서 좌우 반전으로 방향을 내고 있어서,
        # 네 방향을 다 넣으면 용량만 네 배가 되고 읽히는 차이는 거의 없다.
        # zip 안 경로는 `Idle/animations/animating/south/frame_000.png` 다 —
        # 폴더 이름이 템플릿 이름이 아니라 **animating** 이라 "walk" 로 거르면 하나도 안 잡힌다.
        names = sorted(x for x in z.namelist()
                       if x.endswith(".png") and "/animations/" in x and "/south/" in x)
        for i, nm in enumerate(names):
            p = os.path.join(out, f"{i}.png")
            open(p, "wb").write(z.read(nm)); saved.append(p)
    if not saved:
        raise RuntimeError("zip 에서 걷기 프레임을 못 찾음")
    print(f"  저장 {kind} — {len(saved)}프레임", flush=True)


if __name__ == "__main__":
    args = sys.argv[1:]
    kinds = list(DESC) if (not args or args[0] == "--all") else args
    fail = []
    for k in kinds:
        try:
            bake(k)
        except Exception as e:
            print(f"  실패 {k}: {e}", flush=True); fail.append(k)
    print(f"끝 — 성공 {len(kinds) - len(fail)}/{len(kinds)}" + (f" · 실패 {fail}" if fail else ""))
    sys.exit(1 if fail else 0)

#!/usr/bin/env python3
"""타일셋이 다 구워질 때까지 지켜보고, 되면 시트와 메타데이터를 받아 둔다.

    python3 tools/pixellab/poll_tileset.py <tileset_id>

굽는 데 몇 분씩 걸리므로 **반드시 detached 로** 띄운다(tools/run_detached.py).
턴 경계에서 죽는 백그라운드 태스크에 얹으면 다 구워 놓고 결과를 못 받는다.
받은 것은 asset_staging/tileset/ 에 두고, 적용은 사람 눈으로 보고 나서 한다.
"""
import json, os, re, subprocess, sys, time, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
MCP = os.path.join(HERE, "mcp_call.py")
OUT = os.path.join(ROOT, "asset_staging", "tileset")
CFG = "/Users/lbs/.config/opencode/opencode.json"
AUTH = json.load(open(CFG))["mcp"]["pixellab"]["headers"]["Authorization"]


def mcp(tool, args):
    r = subprocess.run([sys.executable, MCP, tool, json.dumps(args)],
                       capture_output=True, text=True, timeout=180)
    d = json.loads(r.stdout)
    return d["result"]["content"][0]["text"]


def fetch(url, path):
    """서명 토큰이 안 붙은 URL 은 그냥 받으면 403 이다 — MCP 헤더를 그대로 얹는다."""
    req = urllib.request.Request(url, headers={"Authorization": AUTH})
    with urllib.request.urlopen(req, timeout=180) as r:
        data = r.read()
    with open(path, "wb") as f:
        f.write(data)
    return len(data)


def main():
    tid = sys.argv[1]
    os.makedirs(OUT, exist_ok=True)
    deadline = time.time() + 60 * 25
    txt = ""
    while time.time() < deadline:
        txt = mcp("get_topdown_tileset", {"tileset_id": tid})
        print(time.strftime("%H:%M:%S"), txt.replace("\n", " | "), flush=True)
        low = txt.lower()
        if "failed" in low or "error" in low:
            print("!! 실패", flush=True)
            return 2
        if "http" in txt:                      # 완료되면 내려받을 주소가 붙는다
            break
        time.sleep(20)
    else:
        print("!! 시간 초과", flush=True)
        return 3

    with open(os.path.join(OUT, "response.txt"), "w") as f:
        f.write(txt)
    urls = re.findall(r"https?://\S+", txt)
    got = []
    for u in urls:
        u = u.rstrip(").,")
        name = "tileset.png" if u.endswith(".png") or "png" in u else "tileset.json"
        if any(name == g[0] for g in got):     # 같은 이름이 둘이면 뒤엣것에 번호를 붙인다
            name = f"{len(got)}_{name}"
        try:
            n = fetch(u, os.path.join(OUT, name))
            got.append((name, n))
            print(f"받음 {name} {n}B  <- {u}", flush=True)
        except Exception as e:
            print(f"못 받음 {u}: {e}", flush=True)
    print("완료:", got, flush=True)
    return 0 if got else 4


if __name__ == "__main__":
    sys.exit(main())

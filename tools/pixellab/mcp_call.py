#!/usr/bin/env python3
import sys, json, urllib.request
CFG="/Users/lbs/.config/opencode/opencode.json"
cfg=json.load(open(CFG))["mcp"]["pixellab"]
URL=cfg["url"]; AUTH=cfg["headers"]["Authorization"]
def call(method, params, rid=1):
    body=json.dumps({"jsonrpc":"2.0","id":rid,"method":method,"params":params}).encode()
    req=urllib.request.Request(URL, data=body, headers={
        "Content-Type":"application/json","Accept":"application/json, text/event-stream",
        "Authorization":AUTH})
    raw=urllib.request.urlopen(req, timeout=120).read().decode("utf-8","ignore")
    # SSE: lines starting with 'data:'
    out=[]
    for line in raw.splitlines():
        line=line.strip()
        if line.startswith("data:"):
            out.append(line[5:].strip())
    txt="\n".join(out) if out else raw
    try: return json.loads(txt)
    except: return {"_raw":txt}
if __name__=="__main__":
    tool=sys.argv[1]; args=json.loads(sys.argv[2]) if len(sys.argv)>2 else {}
    # init handshake
    call("initialize",{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"lumi","version":"1"}})
    if tool=="tools/list":
        r=call("tools/list",{})
    else:
        r=call("tools/call",{"name":tool,"arguments":args})
    print(json.dumps(r, ensure_ascii=False))

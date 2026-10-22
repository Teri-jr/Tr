import json, os, sys, subprocess
from playwright.sync_api import sync_playwright
tl = json.load(open("timeline.json"))
html = open("cm.html").read().replace("__TIMELINE__", json.dumps(tl))
open("cm_built.html","w").write(html)
FPS=30
times = [float(x) for x in sys.argv[1:]] if len(sys.argv)>1 else None
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width":1920,"height":1080})
    pg.goto("file://"+os.path.abspath("cm_built.html")); pg.wait_for_timeout(1500)
    pg.evaluate("document.fonts.ready")
    if times:
        for t in times:
            pg.evaluate(f"renderAt({t})"); pg.screenshot(path=f"prev_{t}.png")
    else:
        os.makedirs("fr", exist_ok=True)
        n = int(round(tl["total"]*FPS))
        for i in range(n):
            pg.evaluate(f"renderAt({i/FPS})"); pg.screenshot(path=f"fr/{i:05d}.jpg", type="jpeg", quality=93)
            if i % 150 == 0: print(i, n, flush=True)
    b.close()

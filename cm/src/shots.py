import json, datetime
from playwright.sync_api import sync_playwright
D = "2026-10-21"
def ms(h, m): return int(datetime.datetime(2026,10,21,h,m,tzinfo=datetime.timezone(datetime.timedelta(hours=9))).timestamp()*1000)
tasks = [
 dict(id="a", name="英単語 ターゲット 1-200", dur=30, memo="", pomo=False, adj=0, actualStart=ms(19,0), actualEnd=ms(19,36)),
 dict(id="b", name="数学 青チャート 例題20-35", dur=60, memo="", pomo=True, adj=0, actualStart=ms(19,38), actualEnd=None),
 dict(id="c", name="英語長文 やっておきたい500 #3", dur=45, memo="", pomo=False, adj=0, actualStart=None, actualEnd=None),
 dict(id="d", name="古文単語 + 文法", dur=30, memo="", pomo=False, adj=0, actualStart=None, actualEnd=None),
 dict(id="e", name="化学 重要問題集 理論", dur=45, memo="", pomo=False, adj=0, actualStart=None, actualEnd=None),
]
day = {"settings": {"start": 19*60, "deadline": 24*60}, "tasks": tasks}
font = "@font-face{font-family:'Noto Sans JP';src:url('file:///root/.fonts/NotoSansJP-%d.woff2');font-weight:%d}"
css = "\n".join(font % (w,w) for w in (400,700,900)) + "body{font-family:'Noto Sans JP',sans-serif!important}"
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--allow-file-access-from-files"])
    for scheme in ("dark",):
        ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=3, color_scheme=scheme, locale="ja-JP", timezone_id="Asia/Tokyo")
        pg = ctx.new_page()
        pg.clock.install(time=datetime.datetime(2026,10,21,20,31, tzinfo=datetime.timezone(datetime.timedelta(hours=9))))
        pg.goto("file:///home/user/Tr/index.html")
        pg.evaluate("([d,day])=>{localStorage.setItem('ttable:day:'+d, JSON.stringify(day));localStorage.setItem('ttable:lastSettings', JSON.stringify(day.settings));}", [D, day])
        pg.reload(); pg.add_style_tag(content=css); pg.wait_for_timeout(800)
        pg.screenshot(path=f"app_full_{scheme}.png", full_page=True)
        import json as J
        boxes={sel: pg.locator(sel).first.bounding_box() for sel in ("#banner","#formCard","#settingsCard","#currentCard","#tableCard","#pomoCard",".row.end")}
        J.dump(boxes, open("boxes.json","w"), indent=1)
        pg.set_viewport_size({"width":1280,"height":800}); pg.wait_for_timeout(300)
        pg.screenshot(path="desktop.png")
        for sel in ("#currentCard","#tableCard","#formCard","#pomoCard","header",".board"):
            loc = pg.locator(sel).first
            if loc.count(): loc.screenshot(path=f"el_{sel.strip('#.')}_{scheme}.png")
    b.close()

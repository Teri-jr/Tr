import json, datetime
from playwright.sync_api import sync_playwright
JST = datetime.timezone(datetime.timedelta(hours=9))
D = "2026-10-21"
def ms(h, m): return int(datetime.datetime(2026,10,21,h,m,tzinfo=JST).timestamp()*1000)
def T(id,name,dur,pomo=False,s=None,e=None): return dict(id=id,name=name,dur=dur,memo="",pomo=pomo,adj=0,actualStart=s,actualEnd=e)
font = "@font-face{font-family:'Noto Sans JP';src:url('file:///root/.fonts/NotoSansJP-%d.woff2');font-weight:%d}"
css = "\n".join(font % (w,w) for w in (400,700,900)) + "body{font-family:'Noto Sans JP',sans-serif!important}"
SEL = ("header","#banner","#formCard","#settingsCard","#currentCard","#tableCard","#pomoCard",".row.end",".row.running",".row.seg")
states = {
 "plan":  ((19,2), 24*60, [T("a","英単語 ターゲット 1-200",30,s=ms(19,0)), T("b","数学 青チャート 例題20-35",60,True),
            T("c","英語長文 やっておきたい500 #3",45), T("d","古文単語 + 文法",30), T("e","化学 重要問題集 理論",45)]),
 "delay": ((20,31), 24*60, [T("a","英単語 ターゲット 1-200",30,s=ms(19,0),e=ms(19,36)), T("b","数学 青チャート 例題20-35",60,True,s=ms(19,38)),
            T("c","英語長文 やっておきたい500 #3",45), T("d","古文単語 + 文法",30), T("e","化学 重要問題集 理論",45)]),
 "bed":   ((20,31), 22*60+40, [T("a","英単語 ターゲット 1-200",30,s=ms(19,0),e=ms(19,36)), T("b","数学 青チャート 例題20-35",60,True,s=ms(19,38)),
            T("c","英語長文 やっておきたい500 #3",45), T("d","古文単語 + 文法",30), T("e","化学 重要問題集 理論",45)]),
 "pomo":  ((19,51), 24*60, [T("a","英単語 ターゲット 1-200",30,s=ms(19,0),e=ms(19,32)), T("b","数学 青チャート 例題20-35",90,True,s=ms(19,34)),
            T("c","英語長文 やっておきたい500 #3",45), T("d","古文単語 + 文法",30)]),
}
boxes = {}
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--allow-file-access-from-files"])
    for name,(hm,dead,tasks) in states.items():
        ctx = b.new_context(viewport={"width":390,"height":844}, device_scale_factor=3, color_scheme="dark", locale="ja-JP", timezone_id="Asia/Tokyo")
        pg = ctx.new_page()
        pg.clock.install(time=datetime.datetime(2026,10,21,*hm,tzinfo=JST))
        pg.goto("file:///home/user/Tr/index.html")
        day = {"settings":{"start":19*60,"deadline":dead},"tasks":tasks}
        pg.evaluate("([d,day])=>{localStorage.clear();localStorage.setItem('ttable:day:'+d, JSON.stringify(day));localStorage.setItem('ttable:lastSettings', JSON.stringify(day.settings));}", [D, day])
        pg.reload(); pg.add_style_tag(content=css); pg.wait_for_timeout(800)
        pg.screenshot(path=f"s_{name}.png", full_page=True)
        boxes[name] = {s: pg.locator(s).first.bounding_box() for s in SEL if pg.locator(s).count()}
        boxes[name]["H"] = pg.evaluate("document.documentElement.scrollHeight")
        if name == "delay":
            pg.set_viewport_size({"width":1280,"height":800}); pg.wait_for_timeout(300); pg.screenshot(path="desktop.png")
        ctx.close()
    b.close()
json.dump(boxes, open("boxes.json","w"), indent=1)

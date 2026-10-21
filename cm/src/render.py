from playwright.sync_api import sync_playwright
import os
with sync_playwright() as p:
    b = p.chromium.launch(executable_path="/opt/pw-browsers/chromium", args=["--allow-file-access-from-files"])
    pg = b.new_page(viewport={"width":1920,"height":1080})
    for i in range(1,8):
        pg.goto("file://"+os.path.abspath("scene.html")+f"#{i}"); pg.reload(); pg.wait_for_timeout(600)
        pg.screenshot(path=f"scene{i}.png")
    b.close()

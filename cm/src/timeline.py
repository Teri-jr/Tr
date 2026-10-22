import json
# lite2.wav 内の各行 (開始, 終了, 「これは」開始) ※冒頭 0〜27.9秒は英語の指示文の誤読なので使わない
LINES=[(27.94,31.72,30.95),(32.16,38.13,35.32),(38.85,43.49,40.88),(44.28,49.77,46.03),(50.13,55.00,52.35),(55.33,60.80,57.90),(61.52,65.04,64.03)]
SCENE=[5.3,6.8,5.6,6.3,5.7,6.3,6.6]
LEAD=[0.5,0.45,0.45,0.45,0.45,0.45,0.45]
t=0; tl=[]
for (a,b,s),d,lead in zip(LINES,SCENE,LEAD):
    tl.append(dict(start=round(t,3), end=round(t+d,3), vo=round(t+lead,3), split=round(t+lead+(s-a),3), voEnd=round(t+lead+(b-a),3), src=[a,b]))
    t+=d
json.dump(dict(total=round(t,3),scenes=tl),open("timeline.json","w"),indent=1)
print(round(t,2)); [print(x) for x in tl]

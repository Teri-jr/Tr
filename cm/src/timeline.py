import json
# 各行: (音声ファイル, 開始, 終了, 「これは」開始, 速度, 追加マーク)  ※lite モデルが冒頭で英語の指示文を読むので、その部分は使わない
LINES=[("lite2.wav",27.94,31.72,30.95,1.0,None),("lite2.wav",32.16,38.13,35.32,1.0,None),("line3.wav",23.06,31.26,27.03,1.0,None),
       ("lite2.wav",44.28,49.77,46.03,1.0,None),("line5.wav",23.46,30.87,25.92,1.0,28.22),("line6.wav",22.25,28.99,25.21,1.0,None),
       ("lite2.wav",61.52,65.04,64.03,1.0,None)]
SCENE=[5.3,6.8,9.2,6.3,8.4,7.7,6.6]
LEAD=[0.5,0.45,0.45,0.45,0.45,0.45,0.45]
t=0; tl=[]
for (f,a,b,s,tempo,mk),d,lead in zip(LINES,SCENE,LEAD):
    pos=lambda x: round(t+lead+(x-a)/tempo,3)
    e=dict(start=round(t,3), end=round(t+d,3), vo=round(t+lead,3), split=pos(s), voEnd=pos(b), src=[f,a,b,tempo])
    if mk: e["mark"]=pos(mk)
    assert e["voEnd"] < t+d-0.15, e
    tl.append(e); t+=d
json.dump(dict(total=round(t,3),scenes=tl),open("timeline.json","w"),indent=1)
print(round(t,2)); [print(x) for x in tl]

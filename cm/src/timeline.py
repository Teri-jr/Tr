import json
# 各行: (音声ファイル, 開始, 終了, 「これは」開始, 速度)  ※lite モデルが冒頭で英語の指示文を読んでいるので、その部分は使わない
LINES=[("lite2.wav",27.94,31.72,30.95,1.0),("lite2.wav",32.16,38.13,35.32,1.0),("line3.wav",23.06,31.26,27.03,1.12),
       ("lite2.wav",44.28,49.77,46.03,1.0),("lite2.wav",50.13,55.00,52.35,1.0),("lite2.wav",55.33,60.80,57.90,1.0),("lite2.wav",61.52,65.04,64.03,1.0)]
SCENE=[5.0,6.6,8.0,6.2,5.5,6.2,5.8]
LEAD=[0.5,0.45,0.45,0.45,0.45,0.45,0.45]
t=0; tl=[]
for (f,a,b,s,tempo),d,lead in zip(LINES,SCENE,LEAD):
    tl.append(dict(start=round(t,3), end=round(t+d,3), vo=round(t+lead,3), split=round(t+lead+(s-a)/tempo,3), voEnd=round(t+lead+(b-a)/tempo,3), src=[f,a,b,tempo]))
    assert tl[-1]["voEnd"] < t+d-0.15, tl[-1]
    t+=d
json.dump(dict(total=round(t,3),scenes=tl),open("timeline.json","w"),indent=1)
print(round(t,2)); [print(x) for x in tl]

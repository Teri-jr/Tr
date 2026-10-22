import subprocess, re, json
tl=json.load(open("timeline.json")); DUR=tl["total"]; TARGET=-13.0
BGM="../orig/sepout/htdemucs/orig44/no_vocals.wav"  # 元CMのBGM(ナレーション除去済み)
fc=[]
for i,sc in enumerate(tl["scenes"]):
    a,b=sc["src"]; ms=int(sc["vo"]*1000)
    fc.append(f"[0:a]atrim={a-0.05}:{b+0.08},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,areverse,afade=t=in:d=0.06,areverse,aresample=44100,adelay={ms-50}[n{i}]")
fc.append("".join(f"[n{i}]" for i in range(len(tl['scenes'])))+f"amix=inputs={len(tl['scenes'])}:normalize=0,pan=stereo|c0=c0|c1=c0[v]")
subprocess.run(["ffmpeg","-loglevel","error","-y","-i","lite2.wav","-filter_complex",";".join(fc),"-map","[v]","voice.wav"],check=True)
out=subprocess.run(["ffmpeg","-hide_banner","-i","voice.wav","-af","ebur128","-f","null","-"],capture_output=True,text=True).stderr
gain=TARGET-float(re.findall(r"I:\s+(-?[0-9.]+) LUFS",out)[-1])
subprocess.run(["ffmpeg","-loglevel","error","-y","-i","voice.wav","-i",BGM,"-filter_complex",
  f"[0:a]volume={gain:.2f}dB[v];[1:a]atrim=0:{DUR},afade=t=out:st={DUR-1.2}:d=1.2[m];[v][m]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95,atrim=0:{DUR}[a]",
  "-map","[a]","-ar","48000","mix.wav"],check=True)
print("gain",round(gain,2))

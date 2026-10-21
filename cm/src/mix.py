import subprocess, re
# full31.wav の (切り出し開始, 終了) → 元ナレーションの開始秒。最後の「受験勉強、運行表」は生成音声の末尾が途切れていたため2行目を再利用
segs=[(0.00,3.45,0.6),(4.38,6.55,4.0),(7.68,12.40,7.0),(13.64,18.90,12.7),(19.97,22.80,19.8),(24.15,29.05,24.3),(30.32,33.60,30.3),(34.86,38.05,35.8),(4.38,6.55,39.35)]
DUR=42.77; TARGET=-13.0  # 元ナレーションと同じラウドネス(LUFS)
fc=[]
for i,(a,b,t) in enumerate(segs):
    ms=int(t*1000)
    fc.append(f"[0:a]atrim={a}:{b},asetpts=PTS-STARTPTS,afade=t=in:d=0.02,areverse,afade=t=in:d=0.06,areverse,aresample=44100,adelay={ms}[n{i}]")
fc.append("".join(f"[n{i}]" for i in range(len(segs)))+f"amix=inputs={len(segs)}:normalize=0,pan=stereo|c0=c0|c1=c0,apad,atrim=0:{DUR}[v]")
subprocess.run(["ffmpeg","-loglevel","error","-y","-i","full31.wav","-filter_complex",";".join(fc),"-map","[v]","voice.wav"],check=True)
out=subprocess.run(["ffmpeg","-hide_banner","-i","voice.wav","-af","ebur128","-f","null","-"],capture_output=True,text=True).stderr
lufs=float(re.findall(r"I:\s+(-?[0-9.]+) LUFS",out)[-1]); gain=TARGET-lufs
print("voice LUFS",lufs,"gain",round(gain,2))
subprocess.run(["ffmpeg","-loglevel","error","-y","-i","voice.wav","-i","sepout/htdemucs/orig44/no_vocals.wav","-filter_complex",
  f"[0:a]volume={gain:.2f}dB[v];[v][1:a]amix=inputs=2:normalize=0:duration=longest,alimiter=limit=0.95,afade=t=out:st={DUR-0.7}:d=0.7[a]",
  "-map","[a]","-ar","48000","newmix.wav"],check=True)
subprocess.run(["ffmpeg","-loglevel","error","-y","-i","orig.mp4","-i","newmix.wav","-map","0:v","-map","1:a","-c:v","copy","-c:a","aac","-b:a","192k","-shortest","-movflags","+faststart","unkouhyo_cm_gemini.mp4"],check=True)

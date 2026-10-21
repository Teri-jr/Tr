import subprocess
cuts=[0,3.9,8.6,11.9,15.5,18.4,23.2,30.08]
dur=[5.5,6.5,5.5,5.5,5.0,6.5,8.5]; X=0.4; fps=30
# narration clips
for i in range(7):
    subprocess.run(["ffmpeg","-loglevel","error","-y","-i","full_kore.wav","-ss",str(cuts[i]),"-to",str(cuts[i+1]),
      "-af","afade=t=in:d=0.03,areverse,afade=t=in:d=0.08,areverse",f"n{i+1}.wav"],check=True)
inputs=[];fc=[]
start=0;starts=[]
for i,d in enumerate(dur):
    L=d+(X if i<6 else 0); n=int(round(L*fps))
    inputs+=["-loop","1","-t",f"{L}","-i",f"scene{i+1}.png"]
    fc.append(f"[{i}:v]scale=2112:-1,zoompan=z='1+0.04*on/{n}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d={n}:s=1920x1080:fps={fps},format=yuv420p,setsar=1[v{i}]")
    starts.append(start); start+=d
prev="v0"
for i in range(1,7):
    fc.append(f"[{prev}][v{i}]xfade=transition=fade:duration={X}:offset={starts[i]:.2f}[x{i}]"); prev=f"x{i}"
for i in range(7):
    inputs+=["-i",f"n{i+1}.wav"]
    ms=int((starts[i]+(0.45 if i else 0.6))*1000)
    fc.append(f"[{7+i}:a]aresample=48000,adelay={ms}|{ms}[a{i}]")
fc.append("".join(f"[a{i}]" for i in range(7))+f"amix=inputs=7:normalize=0,apad,atrim=0:{sum(dur)},loudnorm=I=-16:TP=-1.5,afade=t=out:st={sum(dur)-0.6}:d=0.6[a]")
subprocess.run(["ffmpeg","-loglevel","error","-y",*inputs,"-filter_complex",";".join(fc),"-map",f"[{prev}]","-map","[a]",
  "-c:v","libx264","-preset","medium","-crf","18","-c:a","aac","-b:a","192k","-ar","48000","-t",str(sum(dur)),"-movflags","+faststart","cm_juken_unkohyo_gemini.mp4"],check=True)
print(starts, sum(dur))

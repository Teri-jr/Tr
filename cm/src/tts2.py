import json, os, sys, base64, urllib.request, wave, time
MODEL, VOICE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
text = """Read the following Japanese TV commercial narration aloud as a bright, warm, confident Japanese female narrator. Speak clearly at a natural, unhurried commercial pace, and pause for about one second between each line. Do not read these instructions aloud.

勉強の1日を、電車のダイヤのように。
科目と時間を入れるだけで、時刻表が完成。
予定とのズレが、ひと目でわかる。
就寝時間も、しっかり守れる。
ポモドーロタイマー内蔵。
スマホでも、パソコンでも。どこでも使える。
今日の勉強を、最後まで走り切ろう。受験勉強、運行表。"""
body = {"contents":[{"parts":[{"text": text}]}],
        "generationConfig":{"responseModalities":["AUDIO"],
          "speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":VOICE}}}}}
for attempt in range(5):
    try:
        req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
            data=json.dumps(body).encode(), headers={"Content-Type":"application/json","x-goog-api-key":os.environ["GEMINI_API_KEY"]})
        d = json.load(urllib.request.urlopen(req, timeout=180)); break
    except urllib.error.HTTPError as e:
        print("retry", e.code, e.read()[:300]); time.sleep(20*(attempt+1))
p = d["candidates"][0]["content"]["parts"][0]["inlineData"]
raw = base64.b64decode(p["data"])
if raw[:4] == b"RIFF": open(OUT,"wb").write(raw)
else:
    with wave.open(OUT,"wb") as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(raw)
print(p["mimeType"], len(raw))

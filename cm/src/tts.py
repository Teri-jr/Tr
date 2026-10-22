import json, os, sys, base64, urllib.request, wave
MODEL, VOICE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
text = """Read the following Japanese TV commercial narration aloud as a bright, warm, clear young female narrator, at a brisk, upbeat TV-commercial pace (about 8 Japanese characters per second). In each line, say the "今までは" part a little softer, then the "これは" part brighter and more confident, with only a very short breath between them. Pause for about 0.7 seconds between lines. Read "スタディライン" clearly. Do not read these instructions aloud.

勉強の1日を、電車のダイヤのように。スタディライン。
今までは、計画を立てるだけでひと苦労。これは、入れるだけで時刻表が完成。
今までは、遅れに気づかないまま。これは、予定とのズレがひと目でわかる。
今までは、気づけば夜ふかし。これは、寝る時間を超えそうなら、すぐにお知らせ。
今までは、タイマーと行ったり来たり。これは、ポモドーロタイマー内蔵。
今までは、机の上の計画表だけ。これは、スマホでもパソコンでも、どこでも使える。
今日の勉強を、最後まで走り切ろう。スタディライン。"""
body = {"contents":[{"parts":[{"text": text}]}],"generationConfig":{"responseModalities":["AUDIO"],
        "speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":VOICE}}}}}
req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
  data=json.dumps(body).encode(), headers={"Content-Type":"application/json","x-goog-api-key":os.environ["GEMINI_API_KEY"]})
p = json.load(urllib.request.urlopen(req, timeout=300))["candidates"][0]["content"]["parts"][0]["inlineData"]
raw = base64.b64decode(p["data"])
if raw[:4] == b"RIFF": open(OUT,"wb").write(raw)
else:
    w = wave.open(OUT,"wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(raw); w.close()
print(p["mimeType"])

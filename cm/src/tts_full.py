import json, os, sys, base64, urllib.request
MODEL, VOICE, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
text = """Read the following Japanese TV commercial narration aloud as a bright, warm, clear young female narrator, at a lively, natural commercial pace. Pause for about one second between lines. Do not read these instructions aloud.

勉強の1日を、電車のダイヤのように。
受験勉強、運行表。
やることと時間を入れるだけ。時刻表が、自動で完成します。
始めた時間、終わった時間から、予定とのズレを、リアルタイムで計算。
寝る時間を超えそうなら、すぐに、お知らせ。
ポモドーロタイマー内蔵。集中と休憩を、自動で切りかえます。
ホーム画面に追加すれば、アプリのように使えます。
今日の勉強を、最後まで走り切ろう。受験勉強、運行表。"""
body = {"contents":[{"parts":[{"text": text}]}],"generationConfig":{"responseModalities":["AUDIO"],
        "speechConfig":{"voiceConfig":{"prebuiltVoiceConfig":{"voiceName":VOICE}}}}}
req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL}:generateContent",
  data=json.dumps(body).encode(), headers={"Content-Type":"application/json","x-goog-api-key":os.environ["GEMINI_API_KEY"]})
p = json.load(urllib.request.urlopen(req, timeout=240))["candidates"][0]["content"]["parts"][0]["inlineData"]
raw = base64.b64decode(p["data"])
if raw[:4] != b"RIFF":
    import wave; w = wave.open(OUT,"wb"); w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000); w.writeframes(raw); w.close()
else: open(OUT,"wb").write(raw)
print(p["mimeType"])

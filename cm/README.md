# 受験勉強 運行表 CM（1920x1080・約43秒）— Gemini ナレーション版

- `unkouhyo_cm_gemini.mp4` … 元CM（`unkouhyo_cm.mp4`）の映像・BGM はそのままに、ナレーションだけ Gemini TTS に差し替えたもの
- `narration_gemini.mp3` … 差し替えたナレーションのみ（元ナレーションと同じタイミングで配置済み）

声: `gemini-3.1-flash-tts-preview` / ボイス `Kore`（明るく明瞭な女性ナレーター）

## 台本と配置（元CMの焼き込み字幕と同じ文言）

| 開始 | ナレーション |
|------|--------------|
| 0:00.6 | 勉強の1日を、電車のダイヤのように。 |
| 0:04.0 | 受験勉強、運行表。 |
| 0:07.0 | やることと時間を入れるだけ。時刻表が、自動で完成します。 |
| 0:12.7 | 始めた時間、終わった時間から、予定とのズレを、リアルタイムで計算。 |
| 0:19.8 | 寝る時間を超えそうなら、すぐに、お知らせ。 |
| 0:24.3 | ポモドーロタイマー内蔵。集中と休憩を、自動で切りかえます。 |
| 0:30.3 | ホーム画面に追加すれば、アプリのように使えます。 |
| 0:35.8 | 今日の勉強を、最後まで走り切ろう。受験勉強、運行表。 |

## 作り直し手順（`src/`）

1. 元CMの音声から BGM だけを取り出す（元ナレーションを除去）
   `ffmpeg -i unkouhyo_cm.mp4 -vn -ar 44100 orig44.wav`
   `python -m demucs --two-stems=vocals -n htdemucs -o sepout orig44.wav` → `sepout/htdemucs/orig44/no_vocals.wav`
2. `GEMINI_API_KEY=... python3 tts_full.py gemini-3.1-flash-tts-preview Kore full31.wav` … 8行を1回で生成（声のトーンをそろえるため）
3. `python3 mix.py` … 各行を元ナレーションの開始秒に配置し、元と同じ音量（-13 LUFS）で BGM と合成して映像に戻す

生成し直したときは、`mix.py` の `segs`（各行の切り出し秒）を新しい音声の無音位置に合わせて調整してください。

# StudyLine CM（1920x1080・42.6秒）

- `studyline_cm.mp4` … 完成動画（元CM `unkouhyo_cm.mp4` のデザイン・BGM を踏襲し、アプリ名を StudyLine に更新）
- `narration_gemini.mp3` … ナレーションのみ（Gemini TTS `gemini-3.8-flash-lite-tts` / ボイス `Kore`）

## 構成（各機能シーンは「今までは → これは」の2段構成）

| 開始 | シーン | ナレーション |
|------|--------|--------------|
| 0:00 | タイトル | 勉強の1日を、電車のダイヤのように。スタディライン。 |
| 0:05.3 | FEATURE 01 | 今までは、計画を立てるだけでひと苦労。これは、入れるだけで時刻表が完成。 |
| 0:12.1 | FEATURE 02 | 今までは、遅れに気づかないまま。これは、予定とのズレがひと目でわかる。 |
| 0:17.7 | FEATURE 03 | 今までは、気づけば夜ふかし。これは、寝る時間を超えそうなら、すぐにお知らせ。 |
| 0:24.0 | FEATURE 04 | 今までは、タイマーと行ったり来たり。これは、ポモドーロタイマー内蔵。 |
| 0:29.7 | FEATURE 05 | 今までは、机の上の計画表だけ。これは、スマホでもパソコンでも、どこでも使える。 |
| 0:36.0 | エンド | 今日の勉強を、最後まで走り切ろう。スタディライン。 |

## 作り直し手順（`src/`）

1. `GEMINI_API_KEY=... python3 tts.py gemini-3.8-flash-lite-tts Kore lite2.wav` … ナレーション生成
   - lite モデルは英語の演出指示まで読み上げることがあるため、本編の開始位置を確認して `timeline.py` の `LINES`（各行の開始・終了・「これは」の開始秒）を合わせる
2. `python3 timeline.py` … シーン尺とナレーション配置を `timeline.json` に出力
3. `python3 shots.py` … サンプルデータ入りのアプリ画面を4状態撮影（Playwright）
4. `python3 frames.py` … `cm.html` を 30fps でコマ書き出し（`frames.py 7.5 20` のように秒を渡すとプレビューのみ）
5. `python3 audio.py` … ナレーションを配置し、元CMのBGM（demucs でナレーション除去済み）と合成
6. `ffmpeg -framerate 30 -i fr/%05d.jpg -i mix.wav -c:v libx264 -crf 18 -pix_fmt yuv420p -c:a aac -shortest studyline_cm.mp4`

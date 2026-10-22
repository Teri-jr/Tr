# Teri-jr/Tr

GitHub Pages で公開している個人用の学習アプリ置き場。main に push すると 1〜数分で https://teri-jr.github.io/Tr/ に反映される。

- `/`(index.html, sw.js, manifest.json, changelog.json, アイコン): 受験勉強の運行表アプリ「StudyLine」
- `vocab/`: 単語・熟語・漢字の暗記アプリ「記憶回路」(別アプリ。触るときはそちらの changelog.json を使う)

## 更新するとき(どちらのアプリも共通)
- 変更したら、そのアプリの `APP_VERSION`(index.html 内)と `changelog.json` の先頭を同じ番号に上げ、変更点を短い日本語で書く。
  これを忘れると、開きっぱなしの端末に「新しいバージョンがあります」が出ない。
- ビルドは無し。HTML/CSS/JS をそのまま置く。
- 個人情報(本名・メール・トークン)をファイルに入れない。
- push 後は、確認用に `https://teri-jr.github.io/Tr/?v=<バージョン>`(vocab は `/Tr/vocab/?v=…`)のリンクを伝える。

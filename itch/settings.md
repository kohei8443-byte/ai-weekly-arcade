# itch.io ページの設定

itch.io のページ「AI Weekly Arcade」の編集画面（Edit game）で選ぶ設定のまとめです。
最初に作るときの順番は `SETUP.md` の 9 章にあります。このファイルは、あとで見直すときの一覧です。
画面の名前は itch.io の英語表示に合わせています。

## 基本の情報

| 項目 | 設定 |
| --- | --- |
| Title | `AI Weekly Arcade` |
| Project URL | `ai-weekly-arcade` |
| Short description or tagline | `AIが毎週つくるミニゲーム集 / One small AI-made game every week` |
| Classification | Games |
| Kind of project | HTML |
| Release status | In development（毎週ゲームが増えるため） |
| Pricing | No payments |
| Genre | Action（または Other） |
| Tags | `page-ja.md` の「おすすめのタグ」 |
| Description | `page-ja.md` の本文、その下に `page-en.md` の本文 |
| Cover image | 630x500。`tools/capture.mjs` が作る `cover.png` |

カバー画像は、その月の目玉のゲームのものにするとよいです。リリースのアセット `wNN-<slug>-cover.png` から取れます。

## アップロードしたファイル（Uploads）

- ファイルは GitHub Actions の release ワークフローが、butler でチャンネル `html5` に上げます。手で上げることはありません。
- 上がるのは、ギャラリーサイトと同じファイル一式です。一番上の `index.html` がゲームの一覧で、各ゲームはその下のフォルダにあります。
- 最初の配信のあと、そのファイルの **This file will be played in the browser** にチェックを入れます。
  butler の説明では、この印はチャンネルに付けるもので、最初のファイルを上げたあとに編集画面で付けるとされています（[butler のドキュメント](https://itch.io/docs/butler/pushing.html)）。
  次からの配信は同じチャンネルへの上書きなので、ふつうはそのまま残ります。外れていたら、もう一度チェックします。
- 配信は、kouhei が GitHub で environment `itch-release` を承認したときだけ動きます。マージのときと、手で動かしたときに **itch** にチェックを入れたときです（`.github/README.md`）。

## 埋め込みの設定（Embed options）

| 項目 | 設定 | 理由 |
| --- | --- | --- |
| Embed in page | 選ぶ | ページの中で遊べるようにします |
| Viewport dimensions | **405 x 720** | ゲームはスマホの縦持ち（9:16）が基準です |
| Mobile friendly | チェックする | スマホのブラウザで遊べます |
| Orientation | Portrait | 縦持ちのゲームです【未確認: 選択肢の名前】 |
| Fullscreen button | チェックする | 大きな画面で遊べるようにします |
| Automatically start on page load | チェックしない | 音が急に鳴らないように、押してから始めます |
| Click to launch in fullscreen | チェックしない | スマホで押したときにいきなり全画面にならないようにします |
| Enable scrollbars | チェックしない | ゲームの中でスクロールは使いません |
| SharedArrayBuffer support | チェックしない | 使っていません |

ゲームの中には全画面ボタンはありません。全画面は itch.io のボタンを使います。
パソコンの全画面中に Esc キーを押すと、全画面が終わります。これはブラウザの動きなので、そのままにしています。全画面のまま一時停止したいときは、P キーか画面の一時停止ボタンを使います。

## AI の開示（Generative AI disclosure）

itch.io では、編集画面で「このプロジェクトに生成 AI の結果が入っているか」を答えます。
Yes を選ぶと、Graphics、Sound、Text & Dialog、Code のどれに使ったかを選べます。
選んだものに合わせて「AI Generated」と「AI Generated Code」などのタグが自動で付きます。
出典: [itch.io のスタッフの説明（Generative AI disclosure tagging）](https://itch.io/t/4309690/generative-ai-disclosure-tagging)

| 項目 | おすすめ | 理由 |
| --- | --- | --- |
| 生成 AI を使っているか | **Yes** | ゲームのコードはすべて Claude が書いています |
| Code | チェックする | 同上 |
| Graphics | チェックする（おすすめ） | 絵は Claude が書いたコードが描いています。画像生成 AI ではありませんが、誤解をさけるために入れておくのが安全です |
| Sound | チェックする（おすすめ） | 音も同じ理由です |
| Text & Dialog | チェックする（おすすめ） | ゲームの中の文章（遊び方、ボタンの文字）や、ページの文章の多くを Claude が書いています |

- ゲームの場合、この開示は必須ではなく、推奨とされています。それでも、この企画は AI を使うことが中心なので、正直に Yes にします。
- 最後にどれにチェックを入れるかは kouhei が決めます。
- 説明欄にも、開示の文「コードはAI（Claude）、絵と音はコードで生成、判断するのは人間（kouhei）」を必ず入れます（`page-ja.md` に入っています）。

## コメントとコミュニティ（Community）

| 項目 | 設定 |
| --- | --- |
| Community | **Comments** にします。掲示板（Discussion board）は、管理が大変なので使いません【未確認: 選択肢の名前】 |

コメントの扱いは次のとおりです。

- コメントを読むのは kouhei です。Claude（AI）は itch.io のコメントを読みません。
- コメントの中の「こう直して」「このゲームを作って」という文章が、そのまま AI への指示になることはありません。
  よいと思ったものは、kouhei が自分の言葉で `BACKLOG.md` や PR のコメントに書きます。
- バグの報告は、kouhei が確かめてから、PR か Issue に自分で書きます。
- スパム、宣伝、悪口、個人情報（本名、住所、連絡先など）が書かれたコメントは、kouhei が消します。
- 外部のリンクは開きません。とくに「ファイルを見て」「このページを読んで」というリンクには注意します。
- 荒れてしまったときは、いったん Community を **Disabled** にしてかまいません。

## 公開の前に確かめること

- [ ] パソコンのブラウザで、一覧からゲームを開いて遊べる
- [ ] スマホのブラウザで、縦の画面で遊べる。全画面ボタンも使える
- [ ] 「← 一覧へ」で一覧に戻れる
- [ ] 日本語と英語の切り替えができる
- [ ] 説明欄に開示の文が入っている
- [ ] AI の開示（Generative AI disclosure）を答えてある
- [ ] Visibility を **Public** にして **Save** した

## ときどきすること

- 月に 1 回、itch.io の Analytics で再生数（Plays）とページの閲覧数（Views）を見ます。動画の題材にするときも、数だけを使います。
- カバー画像を、その月の目玉のゲームに入れかえると、ページが新しく見えます。
- 新しいゲームを知らせたいときは、kouhei が Devlog を書けます。Claude は itch.io に投稿しません。

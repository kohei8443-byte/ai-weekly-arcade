# AI Weekly Arcade（AIに毎週ゲームを作らせてみた）

AI の Claude が、毎週 1 本、小さなブラウザゲームを作ります。
YouTuber の kouhei がスマホで初見プレイして、公開するかどうかを決めます。
ゲームはどれもインストール不要で、スマホのブラウザですぐに遊べます。

> コードはAI（Claude）、絵と音はコードで生成、判断するのは人間（kouhei）

English: Every week, Claude (an AI) makes one small browser game, and kouhei decides whether it ships. The site has an English toggle.

## 遊ぶ・見る

| 場所 | リンク |
| --- | --- |
| ギャラリーサイト（GitHub Pages） | `https://kohei8443-byte.github.io/ai-weekly-arcade/`（公開前） |
| itch.io | `https://kohei8443-byte.itch.io/ai-weekly-arcade`（公開前。itch.io のユーザー名が違うときは直します） |
| YouTube 再生リスト | `（公開後にここに貼ります）` |

## しくみ（6 行で）

1. Claude が金曜から水曜まで、毎日 1 段階ずつゲームを作ります。そのたびに、別の Claude（レビュアー）が [品質の基準](QUALITY_BAR.md) で採点します。
2. 関門を通ったゲームだけが、木曜の朝に PR として届きます。届かなかった週は、その理由が Issue で届きます。
3. kouhei がスマホで遊び、初見プレイを動画に撮ります。
4. 直してほしいところがあれば、kouhei が PR にコメントを書いて `fix-please` ラベルを付けると、翌朝 Claude が直します。
5. kouhei がマージすると、ギャラリーサイトに自動で公開されます。
6. itch.io への配信は、kouhei が承認ボタンを押したときだけ動きます。

Claude がマージや公開を自分ですることはありません。Claude が指示として受け取るのは kouhei の言葉だけです。

## ゲームの約束ごと

- 1 本のゲームは 1 つの HTML ファイルです。外部への通信はしません。
- 日本語と英語の両方で遊べます。
- 新しいゲームの絵は、ドット絵が基本です。物が転がる物理のゲームだけは、なめらかな絵にすることがあります。決まりは [STYLE.md](STYLE.md) にあります。
- 既存の作品のキャラクターや名前は使いません。すべてオリジナルです。
- くわしい仕様は [CLAUDE.md](CLAUDE.md) にあります。

## フォルダの地図

```
games/         毎週のゲーム（wNN-<slug>/ に index.html, meta.json, NOTES.md）
template/      新しいゲームのひな形
tools/         テスト、録画、サイト生成のツール
routines/      毎日の自動作業（Claude Code のルーチン）のプロンプト
youtube/       YouTube 用の説明文のひな形
itch/          itch.io ページの文章
crazygames/    CrazyGames に出すときのメモ
.github/       公開のしくみ（GitHub Actions）と PR のテンプレート
CLAUDE.md      Claude が守るルール
QUALITY_BAR.md 品質の基準と関門
STYLE.md       絵の決まり（ドット絵と、なめらか型）
SETUP.md       最初に 1 回だけする設定
BACKLOG.md     テーマ案の一覧
NEXT.md        次のテーマを kouhei が指定する場所
CREDITS.md     クレジット
LICENSE.md     ライセンス
```

## テーマのリクエスト

次に作ってほしいテーマは、kouhei が [NEXT.md](NEXT.md) に書きます。
既存のゲームを参考にするときも NEXT.md に書きます。借りるのはジャンルと基本のルールだけで、名前、キャラクター、絵、音は借りず、元のゲームにない変化を必ず 1 つ入れます。
視聴者のみなさんの投票やコメントは、kouhei が読んで参考にします。

## ライセンス

ゲーム、絵、音、文章の権利はすべて保有しています（All rights reserved）。
くわしくは [LICENSE.md](LICENSE.md) を見てください。

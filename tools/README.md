# tools

ゲームの品質チェック、動画素材づくり、ギャラリーサイトの生成に使うスクリプトです。
どれも Node.js 20 以上で動きます。追加で必要なのは Playwright（npm で入ります）と ffmpeg だけです。

## 準備

```sh
npm ci
```

- Playwright は 1.56.1 に固定しています。この版は Chromium のリビジョン 1194 を使います。`package-lock.json` があるので、`npm ci` で同じ版が入ります。
- ブラウザが入っていなければ `npx playwright install --with-deps chromium` を実行します。
- 別の場所にある Chromium を使うときは、環境変数 `CHROMIUM_PATH` に実行ファイルのパスを入れてください。
- 動画づくり（capture）には ffmpeg が必要です。PATH にない場合は `FFMPEG` にパスを入れてください。

## qa.mjs: 品質チェック

```sh
npm run qa -- games/w01-orbit-hopper
npm run qa:all                                            # games/ のすべてのゲーム（tools/qa-all.mjs）
npm run qa:template                                       # ひな形の template/
node tools/qa.mjs games/w01-orbit-hopper --json          # 結果を JSON で出します
node tools/qa.mjs games/w01-orbit-hopper --shots qa-shots/w01 # 各場面のスクリーンショットを保存します
```

`npm run qa:all` は、1 つのゲームが通らなくても最後まで続けます。終わりに、通ったゲームと通らなかったゲームの一覧を出します。Windows でも動きます。

調べる内容は次のとおりです。失敗が1つでもあると終了コードが 1 になります。

- ファイル: index.html が1ファイルで完結していること、`<!doctype html>` で始まること、150KB 未満であること
- 外部通信: src、href、url()、@import、fetch、import() などで外部のファイルを読み込んでいないこと。外部へのリンクと iframe もないこと。コメントや、表示するだけの文字列に入っている URL は失敗にしません
- CSS に `[hidden] { display: none !important; }` があること
- meta.json の項目がすべてそろっていること。フォルダー名 `wNN-<slug>` と週番号、slug が一致していること
- スマホ（390x780、タッチ）とPC（1280x720）で実際に動かします。エラーやコンソールエラーが出ないこと、外部への通信がないこと、画面が真っ白でないこと、タイトルからスタート、プレイ、ゲームオーバー、リトライまで進めること
- `?demo=1` で20秒間、人の操作なしに動き続けること

プレイはまず30秒間ランダムに操作します。それでも終わらないときは、長押しやドラッグを交えて meta.json の `session_length_sec` 秒（20〜90秒）まで続けます。

ボタンは id や文字から自動で探します。確実にするため、新しいゲームでは `data-qa="start"`、`retry`、`resume`、`pause`、`lang`、`score` を付けてください（template/index.html に入っています）。

## capture.mjs: 動画と画像

```sh
npm run capture -- games/w01-orbit-hopper media/w01-orbit-hopper
```

`?demo=1` の自動プレイを録画して、次のファイルを作ります。メディアは大きいので git には入れません。GitHub Release の添付ファイルにするか、手元に保存してください。

| ファイル | 内容 |
|---|---|
| vertical.mp4 | 縦 1080x1920、30fps、約30秒（Shorts 向け） |
| horizontal.mp4 | 横 1920x1080、30fps、約30秒。ゲームを中央に置き、左右にタイトルと説明を出します |
| preview.gif | 横幅480px、6秒 |
| cover.png | itch.io 用カバー 630x500 |
| thumb-base.png | YouTube サムネイルの下地 1280x720。左側に文字を入れる余白があります |
| title.png、play.png | 1080x1920 の元画像 |
| capture.json | 作ったファイルと長さの記録 |

主なオプションは `--seconds 30`、`--gif-start 4`、`--lang ja|en` です。1本あたり2分ほどかかります。

## hub.mjs: ギャラリーサイト

```sh
npm run hub                  # site/ に出力します
node tools/hub.mjs --out site --games games
```

- games/*/meta.json から、日本語が先の一覧ページ（英語切り替えつき、新しい週が上）を作ります
- 各ゲームを site/<フォルダー名>/index.html にコピーし、左下に「← 一覧へ」のリンクを足します。元のゲームファイルは変更しません
- リンクはすべて相対パスです。同じ site/ フォルダーを GitHub Pages と itch.io（butler）の両方に使えます
- meta.json に不備があるゲームがあると止まります。`--skip-invalid` を付けると、そのゲームを除いて作ります

## template/

新しいゲームのひな形です。日英の文字表、タイトル、一時停止、ゲームオーバーの画面、Platform アダプター、`?demo=1` の自動プレイ、シード付き乱数、try/catch で守った localStorage、WebAudio の効果音、`window.__game` のデバッグ用フックが入っています。
中身は「タイミングストップ」という仮のゲームです。`TODO(game)` の部分をその週のゲームに置きかえて使ってください。meta.json と NOTES.md も一緒にコピーして書きかえます。

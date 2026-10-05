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
node tools/qa.mjs games/w07-example --hard                # 品質基準の hard チェックを必ず行います
node tools/qa.mjs games/w07-example --no-hard             # hard チェックを行いません
```

`npm run qa:all` は、1 つのゲームが通らなくても最後まで続けます。終わりに、通ったゲームと通らなかったゲームの一覧を出します。Windows でも動きます。

調べる内容は次のとおりです。失敗が1つでもあると終了コードが 1 になります。

- ファイル: index.html が1ファイルで完結していること、`<!doctype html>` で始まること、300KB 未満であること
- 外部通信: src、href、url()、@import、fetch、import() などで外部のファイルを読み込んでいないこと。外部へのリンクと iframe もないこと。コメントや、表示するだけの文字列に入っている URL は失敗にしません
- CSS に `[hidden] { display: none !important; }` があること
- meta.json の項目がすべてそろっていること。フォルダー名 `wNN-<slug>` と週番号、slug が一致していること
- スマホ（390x780、タッチ）とPC（1280x720）で実際に動かします。エラーやコンソールエラーが出ないこと、外部への通信がないこと、画面が真っ白でないこと、タイトルからスタート、プレイ、ゲームオーバー、リトライまで進めること
- `?demo=1` で20秒間、人の操作なしに動き続けること

プレイはまず30秒間ランダムに操作します。それでも終わらないときは、長押しやドラッグを交えて meta.json の `session_length_sec` 秒（20 秒から 90 秒）まで続けます。

ゲームオーバーの瞬間にまだ続いていた操作（長押しなど）が、リトライのロックの後に届いて次のプレイが始まることがあります。これは速いリトライとして正しい動きなので、そのときは `info retry` の行を出してそのまま遊び続け、次のゲームオーバーでリトライのボタンを確かめます（2 回まで）。

ボタンは id や文字から自動で探します。確実にするため、新しいゲームでは `data-qa="start"`、`retry`、`resume`、`pause`、`lang`、`score` を付けてください（template/index.html に入っています）。一時停止の窓の「さいしょから」と「タイトル」には `restart` と `quit`、結果の画面の「タイトル」には `title` を付けます。`data-qa` がほかの役目を名乗っているボタンは、文字が「もう一回」などに似ていても、そのボタンとしては選びません。

### 品質基準の hard チェック

meta.json に `"quality_bar": 1` があるゲームでは、上のチェックに加えて、QUALITY_BAR.md の (必須) [A] の項目を自動で調べます。`quality_bar` がないゲーム（w01 から w06）は、これまでと同じチェックだけです。`--hard` を付けるとどのゲームでも行い、`--no-hard` を付けると行いません（そのときは WARN の `skipped` が出て、関門には使えない結果になります）。
w07 からのゲームは、meta.json に `"quality_bar": 1` がないと、静的チェックの `meta` が FAIL になります。meta.json を書きかえて hard チェックを外すことはできません。

結果は「Quality bar hard checks」の欄に出ます。どの行にも、対応する基準の番号が `[1.3.2]` のように付きます（`[hooks]` だけは基準の項目ではなく、ほかのチェックの前提です）。1 つでも FAIL があると QA は通りません。時間に関係するチェックは、ゲームの時計を1コマずつ進めて調べるので、遅いマシンでも同じ結果になります。このマシン（4 コア）で、1 本あたり 35 秒から 45 秒です。

hard チェックは、本物のスマホと同じように「タップするまで音が出ない」設定のブラウザで行います。

| 番号 | チェック | 調べること |
|---|---|---|
| hooks | hooks | 下の表の「必須」のフックがすべてあること（基準の項目ではなく、ほかのチェックの前提です） |
| 1.1.1 | one-tap-start、key-start | タイトルのボタン以外の場所を 1 回タップするだけで始まること。スペースキーでも始まること |
| 1.1.2 | first-payoff | 始めてから 3 秒以内に最初の得点が入ること。`autoplay` があればゲームの AI に遊ばせます。なければ 96、208、400 ミリ秒ごとのタップで試します |
| 1.1.3 | idle-run | 何も操作しないとき、最初のプレイが 5 秒以上続くこと（WARN だけで、失敗にはしません） |
| 1.2.1 | touch-action、input-response | canvas かその親に `touch-action: none` があること。押しただけ（離す前）で、次に描くコマが変わること（pointerdown と keydown） |
| 1.3.1 | audio-unlock、audio-tap | pointerup、touchend、click、keydown、mousedown の capture のリスナー、visibilitychange での再開、`resume().catch()` があること。スマホの表示で 1 回タップしたら AudioContext が running になること |
| 1.3.2 | audio-route、audio-peak | スピーカー（destination）につながるのは DynamicsCompressor だけで、そこに GainNode（マスター）が入っていること。効果音 8 つを同時に鳴らしても最大値が 1.0 未満であること（`peak(8)`） |
| 1.4.4 | text-360x640、text-800x450 | タイトル、プレイ、一時停止、結果の画面で、いちばん小さい文字が 360x640 で 13 px 以上、800x450 で 12 px 以上であること（DPR 1）。`view().textMin`（ART KIT の `text()` で描いた文字）、画面の canvas の fillText、DOM の文字を見ます。`bake`、`lit`、`layer` で絵に焼いた文字も、`put`、`drawLit`、`putLayer` で描くたびに、そのときの大きさで記録しなおします。まだ 1 つも文字を記録していないときは、ART KIT の `TEXT_MIN` を下限として使います |
| 1.5.4 | retry-latency | 失敗から次に遊べるまで 1 秒以内（スペースを押し続けたとき）。結果の画面が出てから 300 ミリ秒は、うっかり押してもリトライしないこと |
| 1.5.4 | retry-one-press | 2 回目の失敗のあと、上で見つけた時刻にスペースを 1 回だけ押すと、次のプレイが始まること（1 回目の押しが結果の数え上げを飛ばすだけで終わらないこと） |
| 1.6.5 | storage-keys、storage-throws | localStorage のキーがすべて `<slug>-` で始まること（タップのあと、ゲームオーバーとリトライのあと、結果の画面のあとに読みます）。localStorage が例外を出す状態でも、スタート、ゲームオーバー、リトライができること |
| 1.9.1 | demo-buttons、demo-platform、demo-storage、demo-loop、demo-best、demo-label | `?demo=1` で、ボタンが 1 つも見えないこと、Platform を呼ばないこと、保存しないこと、失敗と再スタートをくり返すこと（少なくとも 70 秒、長いデモは `session_length_sec` の 1.5 倍と 15 秒まで見ます）、BEST を出さないこと（ゲームの題名の中の言葉は数えません）、日英のタイトルを小さく出すこと（BEST とタイトルは `texts` があるときだけ調べ、ないときは WARN です） |
| 1.10.2 | fps-parity、fps-parity-30、fps-damping | 同じシードのデモを 144 Hz と 60 Hz で 10 秒進めて、`snap()` が許容の範囲で同じになること。144 Hz の状態が、60 Hz の 10 秒の前後 2 コマ（1 ミリ秒ずつ見ます）のどこかと同じなら通ります（固定ステップのゲームは 1 ステップずれてもかまいません）。そうでなければ、数の差がそれぞれ 2 か 2% 以内なら通ります。文字や真偽はぴったり同じでなければいけません。30 Hz で合わないときは WARN（fps-parity-30）です。dt を使わない `*= 0.9` のような減衰がないこと（コメントと文字列は見ません） |
| 1.10.3 | platform-load、platform-helper、platform-pair | 読みこんだだけで Platform を呼ばないこと。Platform の関数は `platform()` を通してだけ呼ぶこと（コメントと文字列は見ません）。gameplayStart は入力で呼ばれ、gameplayStop をはさまずに 2 回続かないこと。ゲームオーバーで gameOver が呼ばれること |
| 1.10.4 | flash-rate、flash-reduced | デモ 30 秒の中で、画面全体の明るさが 8% より大きく変わる回数が、どの 1 秒でも 3 回以下であること。prefers-reduced-motion のときは、0.5 秒以内に元に戻る変化（点滅）が 0 回で、`view().reduce` が true であること。変わったままの場面の切りかえは点滅に数えません |
| 1.11.3 | style | STYLE.md の 10 章の API と CSS がないこと。コードの `shadowBlur`、`createRadialGradient`、`createConicGradient`、`.filter =`、`letterSpacing` などのプロパティ、文字列の `"lighter"`、`blur(`、`drop-shadow(`、`gradient(`、CSS の `border-radius`、`box-shadow`、`text-shadow`、`letter-spacing`、グラデーション、`filter:` を探します。`createLinearGradient` は `sheen()` の中の 1 回だけ、16 進の色は `PALS` の表と CSS の 2 色だけです（コメントは見ません） |
| 1.11.6 | wide-sides | 1280x720 で 2 秒遊んだ画面で、`view().wide` が true であること。場面の左右（`view().left` と `cw` から求めます。なければ外側の 20%）のそれぞれに、12 色以上あり、1 つの色が 60% をこえず、明るさのばらつき（標準偏差）が 0.04 以上あること。何も描いていない色の帯は通りません |
| 1.10.1 | covered | この表より上の、これまでのチェック全体がこの項目です |

`audio-errors`、`retry-errors`、`input-errors`、`parity-errors`、`demo-errors`、`reduced-errors`、`text-360x640-errors`、`text-800x450-errors`、`wide-errors` の行は、そのチェックの間にページでエラーが出たことを表し、FAIL になります。`crash` の行は、チェックそのものが止まったことを表し、そのチェックの番号が付きます。

### window.__game のフック

ゲームは `window.__game` を通してツールとやりとりします。template/index.html の最後にそのまま使える形で入っています。「時刻」は、ゲームの中の時計（ミリ秒）です。

| フック | 必須 | 内容 |
|---|---|---|
| `state` | 必須 | 今の場面の文字列。`title`、`play`、`paused`、`over`、`demo`（デモ中はずっと `demo`）。失敗の直後に `dying` などをはさんでもかまいません |
| `score` | 必須 | 今のプレイの得点（数値） |
| `snap()` | 必須 | ゲームの状態を整数だけのオブジェクトで返します。失敗したら `dead` を真にします。`t` は比べるときに無視します |
| `manual(on)` | 必須 | true でゲームの時計を止め、`tick` でだけ進むようにします |
| `tick(ms, render)` | 必須 | 時計を ms 進めます。render が true なら、その時点の画面を描きます |
| `demo(seed)` | 必須 | そのシードで `?demo=1` と同じ AI のプレイを始めます。同じシードなら、どのコマの速さでも同じ結果になります |
| `tap()` | 必須 | メインの操作を今 1 回行います（ボットとチェック用） |
| `audioState()` | 必須 | AudioContext の状態。まだなければ `none` |
| `view()` | 必須 | `{ K, dpr, w, h, top, left, cw, reduce, textMin, wide }`。K は論理座標の 1 px が端末の何ピクセルになるか（`devicePixelRatio` をふくむ倍率）、dpr は使っている `devicePixelRatio`（2 まで）、w と h は画面全体の大きさ（論理座標）、top は場面の上の端、left は場面の左の端、cw は場面の幅（どちらも論理座標）、reduce は動きを減らす設定、wide は横長の配置かどうかです。textMin は今までに描いたいちばん小さい文字の大きさで、論理座標のピクセルで表します（拡大や縮小をかけた後の大きさ）。CSS ピクセルでは `textMin * K / dpr` です。ART KIT の、絵を描くときの `view(x, sx, sy, zoom)` とは別の関数です |
| `peak(n)` | 必須 | 効果音 n 個を同時に、本物と同じ音の通り道で OfflineAudioContext に鳴らし、最大値を返します（Promise）。本物の音の通り道を一時的に入れかえるときは、`await` で描き終わるのを待つ前に元に戻します（テンプレートの `auPeak()` のとおり。待っている間に音楽が鳴ると、ちがう AudioContext の音をつないでエラーになるためです） |
| `autoplay(on)` | あるとよい | プレイヤーの番を、デモと同じ AI に遊ばせます。人らしいずれを入れて、ときどき失敗するようにします（1.5.1 の長さは、これで測ります） |
| `fail()` | あるとよい | 今のプレイをすぐ失敗で終わらせます（何もしなくても終わらないゲームに必要です） |
| `texts()` | あるとよい | 最後に描いたコマに出ていた文字の一覧。ART KIT の `text()` が自動で記録します（`TXT`）。画面の文字は、すべて `text()` で描きます（STYLE.md の 6 章） |
| `target()` | あるとよい | メインの操作をする場所（画面の CSS ピクセル）。ボタンか遊ぶ場所のまんなかのような、動かない点を返します。動く物の位置は返しません（ボットが狙いうちになり、初めての人の記録が実際よりよく見えるためです） |

`state` と `score` は、これまでの qa.mjs と capture.mjs もそのまま使います。

## review-kit.mjs: レビューの材料

```sh
npm run review-kit -- games/w07-example review/w07
node tools/review-kit.mjs games/w07-example review/w07 --seed 12345 --tapper-sec 60
```

レビュー担当のエージェントに渡す材料を作ります。スマホ（390x780）と CrazyGames の小さい枠（800x450）のそれぞれで、次のものを出します。
フル HD の横長の画面（1920x1080。960x540 を DPR 2 で）では、`title.png`、`demo/` の画面（10 秒までは 1 秒に 1 枚、30 秒までは 2 秒に 1 枚）、`contact-demo.png` だけを出します。ボットのプレイはしません。

| ファイル | 内容 |
|---|---|
| `<表示>/title.png` | タイトル画面 |
| `<表示>/demo/demo-SS.ss.png` | `?demo=1` の画面。0 から 10 秒は 1 秒に 4 枚、10 秒から 30 秒は 1 秒に 2 枚 |
| `<表示>/play/NN-*.png` | 初めての人をまねたボットのプレイ。1、3、6、10 秒、失敗の瞬間、結果の画面 |
| `<表示>/contact-demo.png`、`contact-play.png` | それぞれを 1 枚に並べ、時刻を書いたもの |
| `naive-tapper.json` | ボットのタップとそのときの場面と得点、プレイごとの長さ |
| `demo-run.json` | デモの経過（得点、失敗、再スタートの時刻） |
| `summary.json` | 見つかったフック、プレイの長さ、最初の得点の時刻、失敗の時刻、ページのエラー。`autoplay` には、ゲームの AI（`__game.autoplay`）が 1 から 10 のシードで遊んだ 10 回の長さと中央値があります（QUALITY_BAR.md の 1.5.1）。フックがないゲームでは null です |

ボットはゲームの中身を知りません。メインの操作の場所（`target()`、なければ画面の下のほう）を、位置を少しずらしながら、150 から 300 ミリ秒の反応と 200 から 700 ミリ秒の間をおいてタップします。結果の画面が出たら少し待ってリトライし、最大 4 プレイまで続けます。

フックのあるゲームでは、デモを 1 コマずつ進めるので、同じ `--seed` なら同じ画面になります。フックのない古いゲーム（w01 から w06）でも動きます。そのときは実際の時間で撮り、わからない項目は null になります。1 本あたり 2 分から 3 分かかります。

## capture.mjs: 動画と画像

```sh
npm run capture -- games/w01-orbit-hopper media/w01-orbit-hopper
```

`?demo=1` の自動プレイを録画して、次のファイルを作ります。メディアは大きいので git には入れません。GitHub Release の添付ファイルにするか、手元に保存してください。

| ファイル | 内容 |
|---|---|
| vertical.mp4 | 縦 1080x1920、30fps、約30秒（Shorts 向け） |
| horizontal.mp4 | 横 1920x1080、30fps、約30秒。下の「横の動画とカバー」を見てください |
| preview.gif | 横幅480px、6秒 |
| cover.png | itch.io 用カバー 630x500 |
| thumb-base.png | YouTube サムネイルの下地 1280x720 |
| title.png、play.png | 1080x1920 の元画像 |
| play-wide.png | 1920x1080 の元画像（`quality_bar` のあるゲームだけ） |
| capture.json | 作ったファイルと長さの記録 |

横の動画とカバーの作り方は、ゲームによって 2 通りです。

- meta.json に `"quality_bar": 1` があるゲーム（w07 から）は、横長の画面にも自分で合わせます（STYLE.md の 2 章）。横の動画は、`index.html?demo=1` を 960x540 の画面（DPR 2）でそのまま録ります。カバーは 630x500 の画面に出したタイトル画面、サムネイルの下地は横の動画のまんなかの 1 コマです。まわりには何も足しません。
- それより前のゲーム（w01 から w06）は、縦の画面しかありません。和紙の色の地に縦の画面を細い墨の枠で置き、横にタイトル、説明、週の番号の判を出します。グラデーション、ぼかし、影、角の丸み、字の間の広げは使いません（STYLE.md の 10 章）。もし使うと、capture.mjs は止まります。

主なオプションは `--seconds 30`、`--gif-start 4`、`--lang ja|en`、`--no-audio` です。1本あたり2分ほどかかります。

MP4 にはゲームの音が入ります（AAC）。録画の前に小さなスクリプトを入れて、ゲームが AudioContext のスピーカー（destination）につないだ音を MediaRecorder で録り、ffmpeg で映像の時刻に合わせて重ねます。`?demo=1` で音を出さないゲームや、`--no-audio` を付けたときは、これまでと同じ音なしの MP4 になります。音の大きさ（平均と最大の dB）と映像とのずれは capture.json の `audio` に記録します。音を重ねるのに失敗したときは、音なしの MP4 を残して警告を出します。

録画は、マシンが忙しいと実際より長く（スローモーションに）なることがあります（このマシンでは約 1.13 倍でした）。capture.mjs は録画の長さと実際にかかった時間の比を測り、MP4 を実際の速さに直します。比は capture.json の `videoStretch` に残ります。直したあとの音と映像のずれは、テスト用のページで 0.1 秒以内でした。

## hub.mjs: ギャラリーサイト

```sh
npm run hub                  # site/ に出力します
node tools/hub.mjs --out site --games games
```

- games/*/meta.json から、日本語が先の一覧ページ（英語切り替えつき、新しい週が上）を作ります
- 各ゲームを site/<フォルダー名>/index.html にコピーし、右下に「← 一覧へ」のリンクを足します。左下はゲームの「Made with Claude」の場所なので使いません。元のゲームファイルは変更しません
- 一覧ページとリンクの見た目は、ゲームと同じ「墨と和紙」です。和紙の色の地、墨の線、角を切った札にし、グラデーション、影、角の丸み、字の間の広げは使いません（STYLE.md の 10 章）
- リンクはすべて相対パスです。同じ site/ フォルダーを GitHub Pages と itch.io（butler）の両方に使えます
- meta.json に不備があるゲームがあると止まります。`--skip-invalid` を付けると、そのゲームを除いて作ります

## template/

新しいゲームのひな形です。絵の決まり「墨と和紙」（STYLE.md）と品質基準（QUALITY_BAR.md）に合わせてあり、`npm run qa:template` の hard チェックをすべて通ります。大きさは約 110KB です。

- `// ==== ART KIT START ====` から `// ==== ART KIT END ====` まで: 絵のキットです。ゲームのことは何も知りません。そのままコピーし、変えてよいのは、パレットの色の値と、B と A の両方に同じ名前で足す色の名前（それぞれ 40 色まで）と、どちらのスタイルを使うか（`useStyle`）だけです（STYLE.md の 12 章）。
  2 つのスタイルのパレット（`PALS.B` が「墨と和紙」、`PALS.A` が「つやつや細工」）、端末の解像度での画面の配置（`artResize`、`view`、`layer`、`place`。横長の画面の `L.wide` と、小さな画面で UI を大きくする `L.u`）、手で描いた形、墨の線と 1 段の影（`shape`）、画面に重ねる和紙の目（`grainOver`）、物の絵を焼いて取っておく道具（`bake`、`lit`。使えない物の灰色の版 `mono`）、文字（`text`）、木の札や窓などの世界の中の UI、画面のゆれ（trauma の 2 乗となめらかなノイズ）、ヒットストップ、カメラの寄り、パーティクル、音の通り道（マスター、コンプレッサー、スピーカーの順。解除と再開）、`auPeak()`、初回のタップの手がかり、文字の記録（`TXT`）が入っています。
- `GAME-SPECIFIC` の部分: その週のゲームに置きかえます（名前と大きさ、段階の表、ルール、絵、文字の中身）。
- `KEEP` の部分: 必要なしくみです。中身はゲームに合わせ、しくみは残します。文字の表、AI と台本つきのデモ、失敗の見せ方、1 つだけの判定表示、効果音と音楽、結果の画面（カウントアップ、ランク、ベスト更新、ベストまでの差、次の目標）、流れ、入力、ループ、`window.__game`。

中身は「タイミングストップ」という仮のゲームです。meta.json（`"quality_bar": 1` 入り）と NOTES.md（制作ログと採点の欄つき）も一緒にコピーして書きかえます。

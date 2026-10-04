# .github（公開のしくみ）

このフォルダには、GitHub Actions のワークフローと PR のテンプレートがあります。
ここにあるファイルを変えるのは、kouhei が対話のセッションで Claude に直接頼んだときだけです。ルーチンは変えません（CLAUDE.md の 2 章の 9）。

| ファイル | 役割 |
| --- | --- |
| `workflows/qa.yml` | PR のゲームを自動でテストします |
| `workflows/release.yml` | main にマージされたら、サイトを公開し、録画の素材を作ります |
| `pull_request_template.md` | builder が PR の本文に使うひな形です |

## qa.yml（PR のテスト）

- すべての PR で動きます。
- 変わったゲームのフォルダごとに `node tools/qa.mjs` を実行します。`tools/` や `package.json` が変わったときは、すべてのゲームを実行します。
- `template/` か `tools/` が変わったときは、ひな形の `template/` も同じように実行します。
- ゲームが変わっていない PR（説明の文章だけを直した PR など）は、テストするものがないので、すぐに通ります。
- 最後に `node tools/hub.mjs` で、ギャラリーサイトが作れることを確かめます。
- 結果は、実行画面の **Summary** に出ます。スクリーンショットは `qa-shots`、できたサイトは `site-preview` という名前でダウンロードできます。

### チェックの名前

ルールセットで **Require status checks to pass** を使う場合、チェックの名前は `qa` です。
すべての PR で動くので、必須にしても、文章だけの PR が止まることはありません。

`qa` の結果を信じてよいのは、kouhei のアカウント（kouhei と Claude）が作った PR だけです。
フォークからの PR では、ワークフローもツールも、その PR の中身で動きます。出した人は、テストを書きかえて緑にできます。
知らない人の PR は、緑でもマージしないでください。

### PR のゲームをスマホで遊ぶ

builder と fixer は、PR に「スマホで遊ぶ」のリンクを書きます。

1. プレビューページ: ルーチンにプレビューページの URL を入れた場合だけです（`routines/README.md`）。kouhei だけが開けます。
2. 予備のリンク: `https://raw.githack.com/kohei8443-byte/ai-weekly-arcade/<コミット>/games/wNN-<slug>/index.html` の形です。
   raw.githack.com は、GitHub のファイルをそのままブラウザで開ける外部の無料サービスです。開くと、確認の画面が 1 回出ます。

どちらも開けないときは、パソコンで次のようにします。

1. PR の下の **Checks** から `qa` を開きます。
2. **Summary** の下の **Artifacts** から `site-preview` をダウンロードします。
3. zip を展開し、ゲームのフォルダの `index.html` を開きます。

知らない人が出した PR のゲームは、開かないでください。中に何が入っているかわからないからです。

## release.yml（公開と録画の素材）

main にゲームが入ると、次の 4 つのジョブが動きます。

1. **build**: `node tools/hub.mjs` で `site/` を作ります。
2. **pages**: `site/` を GitHub Pages に公開します。承認はいりません。
3. **itch**: 同じ `site/` を butler で itch.io（チャンネル `html5`）に上げます。
   environment `itch-release` を使うので、kouhei が **Review deployments > Approve and deploy** を押すまで待ちます。
   承認しなければ、itch.io は前のままです。承認できるのは、マージから 30 日ほどの間です。
4. **media**: まだリリースがないゲーム（ふつうは新しいゲーム 1 本）を録画して、下書きのリリースに付けます。くわしくは下の「録画の素材とリリース」にあります。

前のマージで承認しなかった分も、次に承認したときに最新のサイトがまとめて上がります。
`itch` のジョブは 1 つずつ順に動きます。新しい実行の `itch` が待ったまま進まないときは、前の実行が承認待ちで残っていないか確かめます。残っていたら、前の実行の **Review deployments** で **Reject** を押して終わらせます。

### 手で動かす（Run workflow）

**Actions > release > Run workflow** を押すと、`main` の中身で動かせます。ブランチは `main` のままにします。
チェックの意味は次のとおりです。

| 項目 | 意味 |
| --- | --- |
| **itch** | itch.io にも配信します。マージのときと同じく、kouhei の承認を待ちます |
| **media** | 録画の素材を作ります（下の「録画の素材とリリース」） |
| **game** | **media** で 1 本だけ作り直すときの、ゲームのフォルダ名です（例: `w07-kaiten-sushi`） |
| **draft** | 新しいリリースを下書きにします。初めからチェックが入っています |

**itch** と **media** にチェックを入れなければ、サイト（GitHub Pages）だけを作り直します。

### itch.io のユーザー名

butler の送り先は `<ユーザー名>/ai-weekly-arcade:html5` です。
itch.io のユーザー名が `kohei8443-byte` と違うときは、**Settings > Secrets and variables > Actions > Variables** に、名前 `ITCH_USER`、値に itch.io のユーザー名を入れてください。
これは秘密の情報ではないので、Variables に入れます。

### 録画の素材とリリース

- マージのたびに、まだリリースがないゲームを録画して、ゲームごとの下書きのリリースを作ります。タグ名はフォルダ名（`w07-kaiten-sushi` など）です。1 回に 6 本までです。
- 付くファイルは、縦の動画、横の動画、GIF、itch.io のカバー画像、サムネイルの元画像などです。名前の先頭にフォルダ名が付きます（`w07-kaiten-sushi-cover.png` など）。
- 下書きのままでもダウンロードできます。公開するかどうかは、中身を見てから kouhei が決めます。
- builder が PR のときに作る `wNN-<slug>-preview` の下書きは、マージのあとは消してかまいません。
- 1 本だけ作り直したいときは、**Run workflow** で **media** にチェックを入れ、**game** にフォルダ名を入れます。同じ名前のファイルは、新しいものに置きかわります。
- できたファイルは、実行画面の `media` にも 14 日間残ります。動画などは git には入れません。

## 安全のための決まりごと

このリポジトリは公開なので、誰でも Issue や PR を作れます。そのため、次のようにしています。

- PR のテストは `pull_request` で動かします。フォークからの PR には、書き込みの権限も secret も渡りません。
- `release.yml` は、main への push と手動の実行でしか動きません。フォークのコードは動きません。
- `BUTLER_API_KEY` は environment `itch-release` にだけあります。使うのは itch のジョブの 1 ステップだけです。
- `itch-release` は main からしか動かず、いつも kouhei の承認がいります。
- Issue や PR の題名、本文、ブランチ名などの文字を、スクリプトの中に直接埋め込みません。
- 権限は、ジョブごとに必要な最小限にしています。
- Actions のバージョンは、メジャー番号（`@v4` など）で固定しています。
- **Settings > Actions > General** の **Approval for running fork pull request workflows from contributors** で、**Require approval for all external contributors** を選びます（SETUP.md の 4）。
  知らない人の PR では、kouhei が許可するまでテストが動きません。許可するのは、変更を読んで問題がないとわかったときだけにします。

# SETUP.md（kouhei が最初に 1 回だけする設定）

上から順に進めてください。順番に意味があります。
とくに「3. 最初の中身を入れる」は、「6. main を守るルール」より前に行います。
0 から 13 までで、1 時間半ほどかかります。14 は、最初の 1 週の間に進めます。

画面の名前は、GitHub と itch.io の英語表示に合わせています。
2026-10-03 と 10-04 に、公式のドキュメントで確かめました。確かめられなかったところには **【未確認】** と書いています。画面が違ったら、近い名前の項目を探してください。

## 0. 用意するもの

- [ ] GitHub アカウント `kohei8443-byte`
- [ ] itch.io アカウント
- [ ] Claude の Pro または Max プラン（Claude Code のルーチンを使うため）
- [ ] YouTube チャンネル

## 1. 空の公開リポジトリを作る

- [ ] GitHub の右上の「+」から **New repository** を開きます。
- [ ] Owner: `kohei8443-byte`、Repository name: `ai-weekly-arcade` にします。
- [ ] **Public** を選びます。
- [ ] README、.gitignore、license はどれも追加しません（中身は Claude が入れます）。
- [ ] **Create repository** を押します。

## 2. Claude にリポジトリへのアクセスを渡す

- [ ] https://github.com/apps/claude を開き、**Install**（入れてある場合は **Configure**）を押します。
- [ ] インストール先に `kohei8443-byte` を選びます。
- [ ] **Only select repositories** を選び、`ai-weekly-arcade` だけを選んで保存します。
- [ ] claude.ai/code を開き、GitHub とつながっていることを確かめます。つながっていなければ、画面の案内に従って GitHub を連携します。【未確認: 連携ボタンの場所】

あとで設定を見直すときは、GitHub の右上のプロフィール画像から **Settings > Applications > Installed GitHub Apps** を開き、Claude の **Configure** を押します。

## 3. 最初の中身を入れる

- [ ] このキットを作った claude.ai のプロジェクトのチャットで、Claude に「ai-weekly-arcade の最初の中身を main に入れて」と頼みます。キットのファイルは、そのプロジェクトにあります。
- [ ] リポジトリのトップに README.md などが表示されたことを確かめます。
- [ ] リポジトリの **Actions** タブを開き、左の一覧に `qa` と `release` の 2 つのワークフローがあることを確かめます。なければ、Claude にそう伝えてください。

`main` に直接入れるのは、この 1 回だけです。このあとは「6. main を守るルール」で直接の push を止めます。

このとき、Actions の release ワークフローが 1 回動きます。

- `media` のジョブが、入っているゲームの録画の素材（動画、GIF、画像）を作り、ゲームごとの下書きのリリースに付けます。終わるまで 15 分ほどかかります。待たずに次の手順に進んでかまいません。
- まだ Pages と environment の設定をしていないので、`pages` と `itch` のジョブは失敗します。これは問題ありません。

`itch` のジョブが動いたことで、environment `itch-release` が保護なしで自動で作られることがあります。そのときも、手順 8 でその environment を開いて同じように設定すれば大丈夫です。

## 4. GitHub Actions の基本設定を確かめる

- [ ] リポジトリの **Settings > Actions > General** を開きます。
- [ ] **Approval for running fork pull request workflows from contributors** で **Require approval for all external contributors** を選び、そのすぐ下の **Save** を押します。
  知らない人がフォークから PR を出しても、kouhei が許可するまでテストが動きません。
- [ ] **Workflow permissions** で **Read repository contents and packages permissions** を選びます。ワークフローは、必要な権限を自分で書いています。
- [ ] **Allow GitHub Actions to create and approve pull requests** には、チェックを入れません。**Workflow permissions** の下の **Save** を押します。
- [ ] ほかは初期設定のままにします。

## 5. GitHub Pages の公開元を GitHub Actions にする

- [ ] リポジトリの **Settings > Pages** を開きます。
- [ ] **Build and deployment** の **Source** で **GitHub Actions** を選びます。
- [ ] おすすめのワークフローが表示されても、選ばなくてかまいません（ワークフローは `.github/` に入っています）。

サイトは、手順 9 で release ワークフローを動かしたときに公開されます。

## 6. main を守るルール（ルールセット）を作る

- [ ] リポジトリの **Settings > Rules > Rulesets** を開きます（メニューに **Rulesets** だけが出ている場合もあります）。
- [ ] **New ruleset > New branch ruleset** を選びます。
- [ ] **Ruleset Name**: `protect-main`
- [ ] **Enforcement status**: **Active**
- [ ] **Bypass list**: 何も追加しません。空のままにします。
- [ ] **Target branches**: **Add target > Include default branch** を選びます。
- [ ] **Branch rules** で次の 3 つにチェックを入れます。
  - [ ] **Restrict deletions**
  - [ ] **Require a pull request before merging**
    - **Required approvals** は **0** にします。
  - [ ] **Block force pushes**
- [ ] **Create** を押します。

ポイント:

- Claude は kouhei のアカウントで PR を作ります。GitHub では自分の PR を自分で承認できないので、承認の数を 1 以上にすると、kouhei もマージできなくなります。
- ルーチンには、push してよいブランチをしぼる設定がありません。`main` を守っているのは、このルールセットだけです。
- Bypass list を空にしておくと、kouhei のアカウントで動く Claude も `main` に直接 push できません。あとからも、Bypass list に自分や **Repository admin** を足さないでください。kouhei は PR の画面の **Merge** ボタンでマージします。
- 知らない人が出した PR は、`qa` のチェックが緑でもマージしません。フォークからの PR では、テストの中身もその人が書きかえられるからです。
- QA のワークフローが一度動いたあと、**Require status checks to pass** を追加すると、QA が通らない PR はマージできなくなります。チェックの名前は `.github/README.md` を見てください（任意）。

## 7. itch.io の API キーを作る

- [ ] itch.io にログインし、右上のユーザーメニューから **Settings > API keys** を開きます（https://itch.io/user/settings/api-keys）。【未確認: メニューの並び】
- [ ] **Generate new API key** を押し、表示されたキーをコピーします。
- [ ] キーはどこにも貼り付けず、次の手順 8 でだけ使います。

## 8. environment `itch-release` を作る

itch.io への配信は、この environment を通ったときだけ動きます。

- [ ] リポジトリの **Settings > Environments** を開きます。
- [ ] `itch-release` がすでにあれば、それを開きます（手順 3 で自動で作られた場合です）。なければ **New environment** を押し、名前に `itch-release` と入れて **Configure environment** を押します。
- [ ] **Required reviewers** にチェックを入れ、`kohei8443-byte` を追加します。
- [ ] **Prevent self-review** にはチェックを入れません。
  （マージしたのが kouhei なので、ここにチェックを入れると kouhei 自身が承認できなくなります。）
- [ ] **Allow administrators to bypass configured protection rules** のチェックを外します。
- [ ] **Save protection rules** を押します。
- [ ] **Deployment branches and tags** で **Selected branches and tags** を選びます。
- [ ] **Add deployment branch or tag rule** を押し、Ref type: **Branch**、Name pattern: `main` にして **Add rule** を押します。
- [ ] **Environment secrets** の **Add environment secret**（**Add secret** と表示されることもあります）を押します。
  - Name: `BUTLER_API_KEY`
  - Value: 手順 7 でコピーしたキー
- [ ] **Add secret** を押します。
- [ ] itch.io のユーザー名が `kohei8443-byte` と違うときだけ、**Settings > Secrets and variables > Actions > Variables** で **New repository variable** を押し、Name: `ITCH_USER`、Value: itch.io のユーザー名を入れます。
  配信先は `<ユーザー名>/ai-weekly-arcade:html5` です。何も入れなければ `kohei8443-byte/ai-weekly-arcade:html5` になります。

大事なこと:

- `BUTLER_API_KEY` は、この environment にだけ入れます。**Settings > Secrets and variables > Actions** のリポジトリ secret には入れません。
- 配信のときは、Actions の実行画面に **Review deployments** ボタンが出ます。内容を見て **Approve and deploy** を押すと配信されます。Claude はこのボタンを押しません。

## 9. itch.io のページを作る

- [ ] itch.io のダッシュボードで **Create new project** を開きます（https://itch.io/game/new）。
- [ ] 次のように入力します。
  - Title: `AI Weekly Arcade`
  - Project URL: `ai-weekly-arcade`
  - Short description or tagline: `AIが毎週つくるミニゲーム集 / One small AI-made game every week`
  - Classification: **Games**
  - Kind of project: **HTML**
  - Release status: **In development**（毎週増えていくため。好みで変えてかまいません）
  - Pricing: **No payments**
- [ ] Description（説明文）は `itch/` にある文章を貼ります。開示の文「コードはAI（Claude）、絵と音はコードで生成、判断するのは人間（kouhei）」を必ず入れます。
- [ ] Genre: **Action**（または **Other**）にします。
- [ ] Tags: `arcade`、`minigames`、`one-button`、`mobile`、`casual`、`japan` などを入れます。
- [ ] **Generative AI disclosure**（AI を使っているかの質問）で **Yes** を選び、**Code** にチェックを入れます。【未確認: 項目名と場所】
  - 絵と音は AI が書いたコードで描いているので、**Graphics** と **Sound** にもチェックを入れるのがおすすめです。最後は kouhei が決めてください。
  - Yes にすると「AI Generated」のタグが自動で付きます。
- [ ] Visibility は **Draft** のまま、いったん **Save** します。
- [ ] GitHub のリポジトリで **Actions** タブを開き、左の一覧の **release** を選んで、右の **Run workflow** を押します。
  - Branch は `main` のままにします。
  - **itch** と **media** にチェックを入れて、緑の **Run workflow** を押します。
  - **media** は、手順 3 で素材ができていないゲームの分だけを作ります。
- [ ] 一覧に新しい実行が出たら（数秒かかります）、開きます。**Review deployments** が出たら押し、`itch-release` にチェックを入れて **Approve and deploy** を押します。butler がチャンネル `html5` にファイルを上げます。
- [ ] `https://kohei8443-byte.github.io/ai-weekly-arcade/` にギャラリーサイトが出たことを確かめます（手順 5）。
- [ ] itch.io のページの編集画面をもう一度開き、アップロードされたファイルの **This file will be played in the browser** にチェックを入れます。チェックするのは、最初の 1 回だけです。
- [ ] **Embed options** を次のようにします。
  - **Embed in page** を選び、Viewport dimensions を **405 x 720** にします。
  - **Mobile friendly** にチェックを入れ、Orientation を **Portrait** にします。【未確認: Orientation の選択肢】
  - **Fullscreen button** にチェックを入れます。
  - **Click to launch in fullscreen**、**Automatically start on page load**、**Enable scrollbars** はチェックしません。【未確認: Automatically start の表記】
- [ ] **Cover image** に、630x500 の画像を上げます。GitHub のリポジトリの **Releases** にある下書きのリリースから、好きなゲームの `wNN-<slug>-cover.png` をダウンロードして使えます。
- [ ] ブラウザとスマホで遊べることを確かめてから、Visibility を **Public** にして **Save** します。

## 10. YouTube の準備

- [ ] YouTube Studio（https://studio.youtube.com）を開きます。
- [ ] 左のメニューの **Settings > Channel > Advanced settings** を開き、**Audience** で **No, set this channel as not made for kids** を選んで **Save** します。
  （チャンネル全体を変えたくない場合は、動画ごとに設定します。アップロード画面の **Audience** で **No, it's not made for kids** を選びます。）
- [ ] 再生リスト「AIに毎週ゲームを作らせてみた」を作り、公開にします。Studio の右上の **Create** から **New playlist** を選びます。【未確認: メニューの場所】
- [ ] 動画の説明欄には、`youtube/` のひな形を使います。開示の文を必ず入れます。
- [ ] アップロード画面で「加工・合成されたコンテンツ（Altered content）」を聞かれたら、ゲーム画面は現実と見まちがえる映像ではないので、**No** でよいと考えています。【未確認: kouhei の判断で決めてください】

## 11. Claude Code のルーチンを 3 つ作る

- [ ] https://claude.ai/code/routines を開き、**New routine** を押します。
- [ ] `routines/` にあるプロンプトを使って、次の 3 つを作ります。

| 名前 | いつ | やること |
| --- | --- | --- |
| builder | 毎日 03:07 | 今週のゲームを 1 日 1 段階ずつ作り、木曜に PR を出す |
| fixer | 毎日 03:37 | `fix-please` の付いた PR を直す |
| health check | 毎週木曜 12:00 | PR も保留の Issue もなく、builder が今週出す予定だったときは Issue を開く |

- [ ] Repository は `kohei8443-byte/ai-weekly-arcade` だけを選びます。
- [ ] 時刻は日本時間で入れます（ブラウザのタイムゾーンで自動変換されます）。
- [ ] **Connectors** には、つないでいるコネクタが最初から全部入っています。全部外します。GitHub はコネクタではないので、外しても困りません。
- [ ] Environment はまず **Default** にします。録画用のブラウザの取得がネットワークで止められたら、`routines/README.md` の「ネットワークが止められたとき」のとおりにドメインを足します。
- [ ] PR のゲームをスマホで遊ぶためのプレビューページを使う場合は、`routines/README.md` の「プレビューページ（任意）」のとおりに、builder と fixer のプロンプトに URL を入れます。使わなくても、PR には予備のリンクが書かれます。
- [ ] 作ったら、builder の詳細画面で **Run now** を押して、1 回試します。新しい週が始まり、最初の段階（S1 設計と仮組み）を進めます。
  リポジトリに `claude/wNN-<slug>` のブランチができ、その `games/wNN-<slug>/NOTES.md` の「制作ログ」に 1 行あれば成功です。PR はまだ出ません。
- [ ] 最初の PR は、木曜の朝に届きます。火曜から木曜に始めたときは、次の週の木曜です。それまで kouhei がすることはありません（その間の木曜には、health check も Issue を開きません）。
- [ ] 実行の一覧で緑になっても、うまくいったとは限りません。緑は「セッションが終わった」という意味だけです。ブランチと制作ログができたかを確かめ、できていなければ実行を開いて記録を読みます。

## 12. ラベルを作る

- [ ] リポジトリの **Issues > Labels > New label** で、`fix-please` を作ります。自動では作られないので、この手順は必要です。
- [ ] 説明は「kouhei が Claude に修正を頼むとき」としておくとわかりやすいです。

## 13. 通知を受け取る

- [ ] リポジトリの右上の **Watch** で **All Activity** を選びます。PR と、配信の承認待ちに気づけます。【未確認: 承認待ちの通知の種類】

## 14. 最初の 1 週を通して試す

- [ ] builder の PR が開いたら、PR の本文の「スマホで遊ぶ」のリンクから、スマホで遊んでみます。本文の「採点表」で、レビュアーの点数も見られます。
- [ ] PR のかわりに `[Claude] wNN の QA が通りませんでした` の Issue が来たときは、品質の関門を通れなかった週です。Issue の採点表を見るだけでかまいません。次の週は新しいテーマで始まります。
- [ ] 直してほしいところを PR にコメントし、`fix-please` を付けます。翌朝 fixer が直します。
- [ ] 問題なければ PR を **Merge** します。
- [ ] ギャラリーサイトに新しいゲームが出たことを確かめます。
- [ ] Actions の release の実行画面で **Review deployments** を押し、`itch-release` を選んで **Approve and deploy** を押します。itch.io に出たことを確かめます。
- [ ] リポジトリの **Releases** に、新しいゲームの下書きのリリースができて、動画や画像が付いていることを確かめます。

あとでサイトだけを作り直したいときは、**Actions > release > Run workflow** を、**itch** と **media** にチェックを入れずに押します。この場合、itch.io には配信されません。くわしくは `.github/README.md` にあります。

これで準備は完了です。お疲れさまでした。

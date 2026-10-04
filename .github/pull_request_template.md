[Claude] この PR は builder ルーチンが作りました。

## どんなゲームか

- 1 文の紹介:
- ジャンル:
- 1 回のプレイ: 約 NN 秒
- ファイル: `games/wNN-<slug>/index.html`

## スマホで遊ぶ

- プレビューページ: （ルーチンに URL があるときだけ）
- 予備のリンク: https://raw.githack.com/kohei8443-byte/ai-weekly-arcade/<コミットの SHA>/games/wNN-<slug>/index.html
  外部の無料サービス（raw.githack.com）です。開くと、確認の画面が 1 回出ます。
- パソコンでは、この PR の `qa` の実行結果にある `site-preview` もダウンロードできます（くわしくは `.github/README.md`）。

## 遊び方

- 日本語:
- English:
- 操作:

## テーマを選んだ理由と仮説

- どこから選んだか: NEXT.md / BACKLOG.md / 新しく考えた
- 仮説（たとえば「初見で 3 回目までに笑える場面が来る」）:
- 動画の最初の 1 秒で言う一言:

## kouhei に最初に試してほしいこと

1.
2.

## QA の結果

- `node tools/qa.mjs games/wNN-<slug>`: PASSED / FAILED
- かかった時間:
- 警告:
- 気になった点:

## 録画素材

- 置き場所: 下書きリリース `wNN-<slug>-preview` / 作れなかった（理由）
- 縦 1080x1920 MP4、横 1920x1080 MP4、GIF、itch.io カバー 630x500、サムネイル元画像

## 既知の問題

- なし

## チェック

- [ ] 1 つの HTML ファイルで、外部への通信がない
- [ ] 日本語と英語の両方がある
- [ ] `?demo=1` で AI が遊び続ける
- [ ] 既存の作品のキャラクターや名前を使っていない
- [ ] 変えたのは `games/wNN-<slug>/` と `NEXT.md`、`BACKLOG.md` だけ

コードはAI（Claude）、絵と音はコードで生成、判断するのは人間（kouhei）

マージするかどうかは kouhei が決めます。Claude はマージしません。

<!-- ai-weekly-arcade:claude -->

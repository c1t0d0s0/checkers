# チェッカー

[English](README.md) | 日本語

英米式チェッカー（English draughts）をコンピュータと対戦できるWebアプリです。PC・スマートフォン・タブレットで遊べます。素の HTML/CSS/JS で作っているため、ビルドは不要で、外部ライブラリにも依存しません。

- **ルール**: 黒が先手です。取れる駒があれば必ず取り、連続ジャンプは最後まで続けます。マンが成ってキングになると、その手番は終わります。同じ局面が3回現れるか、取りもマンの移動もないまま双方40手が経過すると引き分けです。
- **強さ**: 初級・中級・上級の3段階です。上級は反復深化・置換表付きのαβ探索で、1手あたり約2秒考えます。探索は Web Worker で行います。
- **言語**: ブラウザの優先言語が日本語なら日本語、それ以外なら英語で表示します。
- **効果音**: 木と木が当たる「カチッ」という音を Web Audio API で合成しています（音声ファイルは使っていません）。

## ローカルでの実行

```sh
python3 -m http.server 8000   # http://localhost:8000/ を開く
node --test 'tests/*.test.mjs'
node tools/selfplay.mjs 10 hard medium   # CPU同士を対戦させて強さを確認
node tools/make-icons.mjs                # favicon.ico と apple-touch-icon.png を再生成
```

## Google Analytics

`config.js` に `GTM_ID` が定義されていれば、そのIDで計測タグを読み込みます。ID が `G-` で始まる場合は gtag.js、`GTM-` で始まる場合は Google タグマネージャーを使います。

デプロイ時にリポジトリ変数 `GTM_ID`（Settings → Secrets and variables → Actions → Variables）が設定されていれば、公開するサイトの `config.js` をその値で上書きします。設定されていなければ、リポジトリの `config.js` をそのまま使います。

## デプロイ

`main` ブランチに push すると `.github/workflows/deploy.yml` が実行されます。テストが通った場合だけ GitHub Pages に公開します。

事前に、リポジトリの Settings → Pages → Source を **GitHub Actions** にしてください。

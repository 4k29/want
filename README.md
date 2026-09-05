# Wishlist

https://4k29.github.io/want/

欲しいもの、画像、カテゴリー、優先順位、分割払い、サブスクを管理する静的サイト。

## 保存方法

1. アイテムを追加・編集すると、この端末に変更を保存します。
2. 「GitHubに保存」→「GitHubで保存を確定」を押します。
3. GitHubに4k29としてログインし、表示されたIssueを「Submit new issue」で作成します。
4. Actionsが共通データを更新します。サイトへ戻ると自動で保存完了を確認し、一覧も更新します。

トークンの発行・入力は不要です。GitHubでIssueを作成する前は他の端末へ同期されません。保存確認中は追加・編集を一時的にロックし、保存途中の変更が取り残されないようにします。

共通データ、Issueの保存リクエスト、Gitの履歴は公開です。個人情報や秘密を登録しないでください。画像ファイル自体は保存せずURLを保持します。Microlinkによる商品情報取得は任意で、取得できない場合は手入力できます。

## 同期の仕組み v2

- 正本は `data/wishlist.json` 1ファイルだけです。
- データには単調増加する `revision` を持たせます。
- 読み取りは `raw.githubusercontent.com` 上のmainブランチを優先し、GitHub Pages上のJSONはフォールバックとしてだけ使います。
- 保存時は差分ではなく、その時点の一覧全体を1つのスナップショットとして送ります。
- 保存リクエストには、編集を始めた時点の `baseRevision` と一意な `requestId` を含めます。
- `scripts/save-snapshot.mjs` はGitHub上の現在のrevisionとbaseRevisionが一致する場合だけ、JSON全体を次のrevisionへ更新します。
- 別端末が先に保存してrevisionが進んでいた場合は上書きせず、競合として停止します。
- 保存成功後は `requestId` を共通データに記録し、サイトが2秒おきに確認して自動で同期済みに切り替えます。
- ローカルストレージは表示キャッシュと未同期変更の退避にだけ使用します。旧方式の差分配列・順序マージ・複数pendingはありません。
- Actions標準の `GITHUB_TOKEN` だけをサーバー側で使い、ブラウザへトークンを渡しません。

## 主なファイル

- `app-v2.js` — UIとローカル状態、保存完了の自動確認
- `sync-v2.js` — GitHub正本の読み取り、キャッシュ、保存リクエスト生成
- `scripts/save-snapshot.mjs` — revision確認と原子的なスナップショット保存
- `data/wishlist.json` — 全端末で共有する唯一の正本
- `.github/workflows/save-wishlist.yml` — 保存、テスト、GitHub Pages公開

## 検証

Node.js 22以降で `npm test`。PRではJavaScriptの構文チェックと既存モデルテスト、新しい同期v2テストを自動実行します。

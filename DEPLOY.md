# Cloudflare Pages デプロイガイド

## 重要な設定

このプロジェクトは**静的サイト**です。ビルドコマンドは**不要**です。

## Cloudflare Pages 設定手順

### 1. プロジェクト作成

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. 左メニューから **Pages** を選択
3. **Create a project** をクリック
4. **Connect to Git** を選択

### 2. リポジトリ接続

1. GitHubアカウントを接続（初回のみ）
2. `midnight480/saga-kachimeshi-map` リポジトリを選択
3. **Begin setup** をクリック

### 3. ビルド設定（重要）

以下の設定を**正確に**入力してください：

| 項目 | 値 |
|------|-----|
| **Project name** | `saga-kachimeshi-map` |
| **Production branch** | `main` (または `master`) |
| **Framework preset** | `None` |
| **Build command** | **（空欄のまま）** ⚠️ 何も入力しない |
| **Build output directory** | `docs` |
| **Root directory** | `/` (デフォルト) |

### 4. 環境変数

環境変数は**不要**です。そのまま **Save and Deploy** をクリックしてください。

## カスタムドメイン設定

### 1. ドメインの追加

1. プロジェクトの **Settings** → **Custom domains** を開く
2. **Set up a custom domain** をクリック
3. `saga-kachimeshi-map.midnight480.com` を入力
4. **Continue** をクリック

### 2. DNS設定

Cloudflareが自動的にDNSレコードを追加します：

- **Type**: CNAME
- **Name**: `saga-kachimeshi-map`
- **Target**: `pages.dev` のサブドメイン（自動設定）

### 3. SSL/TLS設定

Cloudflareが自動的にSSL証明書を発行します（数分かかる場合があります）。

## トラブルシューティング

### エラー: "Missing entry-point to Worker script"

**原因**: ビルドコマンドに `wrangler` が設定されている

**解決方法**:
1. プロジェクトの **Settings** → **Builds & deployments** を開く
2. **Build command** を**完全に削除**（空欄にする）
3. **Save** をクリック
4. 新しいデプロイをトリガー

### エラー: "Build output directory not found"

**原因**: ビルド出力ディレクトリが間違っている

**解決方法**:
1. プロジェクトの **Settings** → **Builds & deployments** を開く
2. **Build output directory** を `docs` に設定
3. **Save** をクリック

### デプロイが成功しない

1. **Settings** → **Builds & deployments** で設定を確認
2. ビルドログを確認してエラーを特定
3. 必要に応じて、プロジェクトを削除して再作成

## 確認事項

デプロイが成功したら、以下を確認してください：

- ✅ サイトが正常に表示される
- ✅ 地図が表示される
- ✅ 店舗データが読み込まれる
- ✅ 検索機能が動作する
- ✅ カスタムドメインが設定されている
- ✅ SSL証明書が有効になっている

## 自動デプロイ

GitHubにプッシュすると、自動的にデプロイが実行されます：

- `main` ブランチへのプッシュ → 本番環境にデプロイ
- その他のブランチへのプッシュ → プレビュー環境にデプロイ


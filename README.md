# Saga Kachimeshi Map

佐賀の飲食店を地図で検索できるWebアプリケーションです。

## 機能

- 🗺️ 地図表示：店舗の位置を地図上で確認
- 🔍 検索機能：
  - 店舗名での検索
  - ジャンルでの絞り込み
  - 曜日での絞り込み
  - 営業時間での絞り込み
- 📱 レスポンシブデザイン：モバイル・デスクトップ対応
- 📋 一覧表示：店舗をリスト形式で表示

## デプロイ

### Cloudflare Pages

このプロジェクトはCloudflare Pagesにデプロイできます。

#### デプロイ手順

1. Cloudflare Dashboardにログイン
2. **Pages** → **Create a project** を選択
3. **Connect to Git** を選択し、GitHubリポジトリを接続
4. ビルド設定：
   - **Framework preset**: None
   - **Build command**: (空欄) **重要: 何も入力しない**
   - **Build output directory**: `docs`
   - **Root directory**: `/` (デフォルト)
5. **Environment variables**: (不要)
6. **Save and Deploy** をクリック

**注意**: ビルドコマンドは空欄のままにしてください。このプロジェクトは静的サイトなので、ビルドプロセスは不要です。`wrangler`などのツールは使用しません。

#### カスタムドメイン設定

1. Cloudflare Pagesのプロジェクト設定で **Custom domains** を開く
2. **Set up a custom domain** をクリック
3. `saga-kachimeshi-map.midnight480.com` を入力
4. Cloudflareが自動的にDNS設定を追加します

#### 環境変数

現在、環境変数は不要です。

## ローカル開発

### 必要な環境

- Node.js 18以上
- npm または yarn

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/midnight480/saga-kachimeshi-map.git
cd saga-kachimeshi-map

# 依存関係をインストール（スクレイピング用）
npm install

# 開発サーバーを起動
npm run serve
```

ブラウザで `http://localhost:8000` を開きます。

## プロジェクト構造

```
.
├── docs/              # 公開ディレクトリ（Cloudflare Pagesのビルド出力）
│   ├── index.html     # メインHTML
│   ├── script.js      # アプリケーションロジック
│   ├── style.css      # スタイルシート
│   ├── data/          # データファイル
│   │   └── shops.json # 店舗データ
│   ├── _redirects     # Cloudflare Pages用リダイレクト設定
│   └── _headers       # Cloudflare Pages用ヘッダー設定
├── scripts/           # データスクレイピング・処理スクリプト
└── package.json       # プロジェクト設定
```

## データ更新

店舗データは `docs/data/shops.json` に保存されています。

データの更新は `scripts/` ディレクトリ内のスクリプトを使用します：

- `scripts/scrape.js`: 店舗情報のスクレイピング
- `scripts/enhance_shops_data.js`: データの構造化・改善

## ライセンス

ISC

## 作者

midnight480


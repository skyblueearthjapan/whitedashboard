# GAS（Google Apps Script）ソースコード

ホワイトボード型 社内ポータルダッシュボード

## ファイル構成

```
src/gas/
├── appsscript.json   # GASマニフェスト
├── Code.gs           # メインエントリポイント
├── sheets.gs         # スプレッドシート読み取り
├── config.gs         # 設定データ統合
├── index.html        # HTMLテンプレート
└── README.md         # このファイル
```

## セットアップ手順

### 1. GASプロジェクト作成

1. [Google Apps Script](https://script.google.com/) でプロジェクトを新規作成
2. このディレクトリ内のファイルをコピー

### 2. スプレッドシートID設定

GASエディタで以下を実行：

```javascript
setSpreadsheetId('YOUR_SPREADSHEET_ID');
```

### 3. デプロイ

1. 「デプロイ」→「新しいデプロイ」
2. 種類: ウェブアプリ
3. 実行ユーザー: ウェブアプリにアクセスしているユーザー
4. アクセスできるユーザー: 組織内の全員

## 動作確認

### ログ確認

GASエディタで `testConfig()` を実行：

```
=== Config Test ===
Pages: 2
Widgets: 7
Layout: 21
Assets: 8
HtmlContent: 1
```

### Webアプリ確認

デプロイURLにアクセスして、homeページが表示されることを確認。

## 詳細ドキュメント

- [docs/gas-structure.md](../../docs/gas-structure.md) - 詳細な構造ドキュメント
- [docs/specifications/](../../docs/specifications/) - 設計仕様書（Phase 0〜10）

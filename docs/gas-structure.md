# GAS（Google Apps Script）構造ドキュメント

ホワイトボード型 社内ポータルダッシュボード - GAS + HTMLService 版

## 1. ファイル構成

```
src/gas/
├── Code.gs        # メインエントリポイント（doGet）
├── sheets.gs      # スプレッドシート読み取り基盤
├── config.gs      # 設定データの統合・正規化
└── index.html     # HTMLテンプレート
```

## 2. ファイル別責務

### 2.1 Code.gs（メインエントリポイント）

| 関数 | 責務 |
|------|------|
| `doGet(e)` | Webアプリのエントリポイント。HTMLを返す |
| `include(filename)` | HTMLファイルのインクルードヘルパー |
| `fetchConfig(pageId)` | クライアントから呼び出し可能な設定取得 |
| `testConfig()` | 動作確認用（ログ出力） |
| `setSpreadsheetId(id)` | スプレッドシートIDをプロパティに設定 |

### 2.2 sheets.gs（スプレッドシート読み取り）

| 関数 | 責務 |
|------|------|
| `getSpreadsheet()` | スプレッドシートを取得 |
| `getSheetData(sheetName)` | 指定シートからデータ取得（配列→オブジェクト変換） |
| `findHeaderRowIndex(data)` | ヘッダー行を検出 |
| `normalizeValue(value)` | 値の型正規化（Boolean, 数値, 空欄） |
| `readAllSheets()` | 全シート一括読み取り |

### 2.3 config.gs（設定データ統合）

| 関数 | 責務 |
|------|------|
| `getConfig(pageId)` | 全設定を統合したconfigオブジェクトを返す |
| `buildPages(raw)` | ページデータを整形 |
| `buildWidgets(raw)` | ウィジェットデータを整形 |
| `buildLayout(raw)` | レイアウトデータを整形 |
| `buildAssets(raw)` | アセットデータを整形（Map形式） |
| `buildHtmlContent(raw)` | HTML本文データを整形（Map形式） |
| `getPageConfig(pageId)` | 特定ページの設定を取得 |
| `getConfigJson(pageId)` | JSON文字列で設定を返す |

### 2.4 index.html（HTMLテンプレート）

クライアントサイドJavaScriptで以下を実行：

| 関数 | 責務 |
|------|------|
| `init()` | 初期化処理 |
| `renderPageTabs()` | ページタブを描画 |
| `navigateToPage(pageId)` | ページ遷移 |
| `renderPage(pageId)` | ページ全体を描画 |
| `renderWidgetCard(widget)` | ウィジェットカードを描画 |
| `renderMetaInfo()` | メタ情報（デバッグ用）を描画 |

## 3. 呼び出しフロー

```
ユーザーアクセス
    ↓
doGet(e)
    ↓
getConfig()
    ↓
readAllSheets()
    ├── getSheetData('01_ページ')
    ├── getSheetData('02_ウィジェット')
    ├── getSheetData('03_レイアウト')
    ├── getSheetData('04_アセット')
    └── getSheetData('06_HTML本文')
    ↓
buildPages / buildWidgets / buildLayout / buildAssets / buildHtmlContent
    ↓
config オブジェクト
    ↓
HTMLテンプレートに渡す（JSON）
    ↓
クライアントでレンダリング
```

## 4. データ構造

### 4.1 config オブジェクト

```javascript
{
  pages: [
    {
      pageId: "home",
      pageTitle: "全社ダッシュボード",
      displayOrder: 1,
      layoutMode: "auto",
      cols: { pc: 12, tablet: 8, mobile: 4 },
      rowHeight: 72,
      gap: 12,
      bgColor: "#FFFFFF",
      headerAssetId: "ASSET_HDR_01",
      memo: ""
    }
  ],
  widgets: [
    {
      widgetId: "W001",
      title: "作業日報",
      type: "link",
      defaultPage: "home",
      audience: "all",
      urlOrRef: "https://example.com/daily",
      iconAssetId: "ASSET_ICON_NOTE",
      openMode: "new_tab",
      embedMode: "link_fallback",
      visible: true,
      owner: "Yuji",
      reviewCycle: "quarterly"
    }
  ],
  layout: [
    {
      widgetId: "W001",
      pageId: "home",
      breakpoint: "PC",
      x: 1,
      y: 2,
      w: 3,
      h: 2,
      auto: false,
      pinned: false,
      zIndex: 0
    }
  ],
  assets: {
    "ASSET_HDR_01": {
      assetId: "ASSET_HDR_01",
      assetType: "image",
      url: "https://example.com/header1.png",
      altText: "Header image"
    }
  },
  htmlContent: {
    "HTML_001": {
      contentId: "HTML_001",
      format: "markdown",
      body: "## お知らせ\n- 年末年始の営業日はこちら"
    }
  },
  meta: {
    loadedAt: "2025-12-28T...",
    counts: {
      pages: 2,
      widgets: 7,
      layout: 21,
      assets: 8,
      htmlContent: 1
    }
  }
}
```

## 5. 列名マッピング

### 01_ページ

| 日本語列名 | 内部キー |
|-----------|---------|
| ページID* | page_id |
| ページタイトル* | page_title |
| 表示順 | display_order |
| レイアウトモード* | layout_mode |
| 列数_PC* | cols_pc |
| 列数_タブレット* | cols_tablet |
| 列数_モバイル* | cols_mobile |
| 行高さ(px) | row_height |
| 余白(px) | gap |
| 背景色 | bg_color |
| ヘッダーアセットID | header_asset_id |
| メモ | memo |

### 02_ウィジェット

| 日本語列名 | 内部キー |
|-----------|---------|
| ウィジェットID* | widget_id |
| タイトル* | title |
| 種別* | type |
| 既定ページ | default_page |
| 対象 | audience |
| URL/参照 | url_or_ref |
| アイコンアセットID | icon_asset_id |
| 開き方 | open_mode |
| 埋め込み方式 | embed_mode |
| 表示* | visible |
| 管理者 | owner |
| 棚卸周期 | review_cycle |

### 03_レイアウト

| 日本語列名 | 内部キー |
|-----------|---------|
| ウィジェットID* | widget_id |
| ページID* | page_id |
| ブレイクポイント* | breakpoint |
| X | x |
| Y | y |
| 幅(w)* | w |
| 高さ(h)* | h |
| 自動配置* | auto |
| 固定 | pinned |
| 重なり順 | z_index |

## 6. デプロイ手順

### 6.1 初回セットアップ

1. Google Apps Script プロジェクトを作成
2. `src/gas/` 内のファイルをコピー
3. スプレッドシートIDを設定：
   ```javascript
   setSpreadsheetId('YOUR_SPREADSHEET_ID');
   ```
4. Webアプリとしてデプロイ
   - 実行ユーザー: 自分
   - アクセス: 組織内の全員（または特定ユーザー）

### 6.2 動作確認

1. `testConfig()` を実行してログを確認
2. WebアプリURLにアクセス
3. homeページが表示されることを確認

## 7. 注意事項

- シート構造・列名は変更禁止
- 1回の読み取りで必要範囲をまとめて取得
- 例外は握り潰さず Logger で出力
- キャッシュは将来実装（現在は毎回読み取り）

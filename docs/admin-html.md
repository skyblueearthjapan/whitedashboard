# HTML本文管理画面 仕様

## 概要

Editor権限を持つユーザーが、06_HTML本文シートを直接触らずにHTML/Markdown本文の追加・編集を行い、プレビューでき、参照切れを防げる管理画面です。

**今回のゴール**: Editorがシートを直接触らずに、06_HTML本文を追加・編集し、プレビューでき、参照切れを防げる状態。

**重要**: セキュリティの観点から、markdown形式を推奨。html形式はXSSリスクがあるため警告を表示。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ doGet(e)                                                     │
│   view=admin_html → renderAdminHtmlView()                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ renderAdminHtmlView(isEditor)                                │
│   1. Editor権限チェック（Viewerは拒否）                       │
│   2. getConfig()でデータ取得                                  │
│   3. admin-html.htmlテンプレートを描画                        │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ admin-html.html                                              │
│   HtmlAdmin.init()                                           │
│     - 一覧表示                                               │
│     - 検索・形式フィルタ                                      │
│     - 新規作成/編集フォーム                                   │
│     - プレビュー（markdown/html）                             │
│     - 参照先ビュー表示                                        │
│   CRUD操作                                                    │
│     → google.script.run.createHtmlContent(data)              │
│     → google.script.run.updateHtmlContent(contentId, patch)  │
│     → google.script.run.getHtmlUsages(contentId)             │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ server/htmlAdmin.gs                                          │
│   - listHtmlContents() → HTML本文一覧 + widgets返却          │
│   - createHtmlContent(data) → 行追加 + 監査ログ              │
│   - updateHtmlContent(contentId, patch) → 行更新 + 監査ログ  │
│   - getHtmlUsages(contentId) → 参照先計算                    │
└─────────────────────────────────────────────────────────────┘
```

## ファイル構成

```
src/gas/
├── Code.gs                  # view=admin_html分岐
├── admin-html.html          # HTML本文管理画面テンプレート
└── server/
    └── htmlAdmin.gs         # CRUD API + 参照先計算
```

## アクセス方法

```
?view=admin_html
```

- Editorのみアクセス可能
- Viewerは「アクセス権限がありません」画面が表示される
- 管理トップ（?view=admin）のヘッダーからもリンク

## 画面構成

### ヘッダー

- 「HTML本文管理」タイトル
- ナビゲーション
  - 管理トップ
  - ポータルへ戻る

### 一覧パネル（左45%）

#### ツールバー
- 検索ボックス（IDで検索）
- 形式フィルタ（全形式/markdown/html）
- 「+ 新規作成」ボタン

#### テーブル
| 列 | 説明 |
|----|------|
| 本文ID | content_id |
| 形式 | format（バッジ表示: markdown=緑, html=オレンジ） |
| 本文プレビュー | body（先頭50文字） |

- 行クリックで詳細パネルに表示
- 選択行はハイライト

### 詳細パネル（右55%）

#### フォーム項目

| 項目 | 必須 | 説明 |
|------|------|------|
| 本文ID | ✓ | 新規作成時のみ編集可、英数字_-推奨 |
| 形式 | ✓ | markdown/html |
| 本文 | ✓ | Markdown記法またはHTML |

#### プレビュー
- **markdown形式**: シンプルなMarkdownレンダラーでレンダリング表示
- **html形式**: セキュリティ上無効化（ソース表示のみ）
- プレビューモード切り替え: レンダリング / ソース

#### 参照先ビュー
選択したHTML本文がどこで使われているかを一覧表示：
- **ウィジェット参照**: 02_ウィジェット.url_or_ref が REF:HTML_xxx

参照先が0件なら「未使用」と表示。

#### アクション
- 「作成」ボタン（新規時）
- 「保存」ボタン（編集時）
- ※ 削除機能なし（表示列がないため）

## API仕様

### listHtmlContents()

```javascript
// 戻り値
{ ok: true, contents: [...], widgets: [...] }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### getHtmlUsages(contentId)

```javascript
// 戻り値
{
  ok: true,
  usages: {
    widgetRefs: [{ widgetId, title, type }],
    total: 2
  }
}
```

### createHtmlContent(contentData)

```javascript
// 引数
{
  content_id: 'HTML_notice_001',
  format: 'markdown',
  body: '# お知らせ\n\n本日のお知らせです。'
}

// 戻り値
{ ok: true, contentId: 'HTML_notice_001', warnings: [] }
// or
{ ok: false, error: 'エラーメッセージ', warnings: [...] }
```

### updateHtmlContent(contentId, patch)

```javascript
// 引数
contentId: 'HTML_notice_001'
patch: { body: '# 更新されたお知らせ\n\n内容が変わりました。' }

// 戻り値
{ ok: true, warnings: [] }
// or
{ ok: false, error: 'エラーメッセージ' }
```

## バリデーション

### クライアント側（保存前チェック）

| チェック | 条件 |
|----------|------|
| ID必須 | content_id が空 |
| 形式必須 | format が空 |
| ID重複 | 新規作成時、同じcontent_idが存在 |

### サーバ側（htmlAdmin.gs）

| チェック | 条件 |
|----------|------|
| Editor権限 | checkIsEditor() が false |
| ID必須（新規） | content_id が空 |
| 形式必須 | format が空 |
| 形式妥当性 | markdown/html以外 |
| ID重複（新規） | 既存に同じcontent_idあり |
| ID形式（警告） | 英数字_-以外を含む |
| HTMLセキュリティ（警告） | format=htmlの場合、XSSリスク警告 |
| 危険タグ（警告） | script, iframe, embed, object, javascript: 等 |

## セキュリティ考慮

### HTML形式のリスク

- XSS（クロスサイトスクリプティング）攻撃の可能性
- 信頼できる管理者のみが編集する前提
- 可能であればmarkdown形式を推奨

### プレビューの制限

- markdown形式: クライアントサイドでレンダリング
- html形式: プレビュー無効化（ソース表示のみ）
- 実際の表示はポータル画面で確認を促す

### 危険タグの検出

以下のタグ/属性が含まれる場合は警告を表示（保存は許可）:
- `<script`
- `<iframe`
- `<embed`
- `<object`
- `javascript:`
- `onerror=`
- `onload=`
- `onclick=`

## 監査ログ

すべての操作は08_監査ログに記録：

| 列 | 内容 |
|----|------|
| timestamp | 操作日時（ISO8601） |
| actor | Session.getActiveUser().getEmail() |
| action | create_html_content / update_html_content |
| page_id | 本文ID（page_id列を流用） |
| bp | 空（HTML本文操作では不使用） |
| before_json | 操作前の状態（JSON） |
| after_json | 操作後の状態（JSON） |
| result | ok / failed |
| message | 結果メッセージ |

## シート列マッピング

06_HTML本文シートの日本語列名とフィールドのマッピング：

```javascript
const HTML_CONTENT_COLUMNS = {
  '本文ID*': 'content_id',
  '形式*': 'format',
  '本文*': 'body'
};
```

## 削除機能について

現在のテンプレートには「表示」列がないため、削除機能は提供しない：
- 物理削除は禁止（データ保全）
- 将来的に「表示」列を追加して論理削除を実装予定
- 不要なHTML本文は手動で整理

## Markdownレンダラー

クライアントサイドで簡易的なMarkdownレンダリングを実装：

サポートする記法:
- 見出し: `#`, `##`, `###`
- 太字: `**text**`
- 斜体: `*text*`
- リンク: `[text](url)`
- リスト: `*`, `-`, `1.`
- コード: `` `code` ``
- コードブロック: ` ``` `
- 引用: `>`
- 水平線: `---`, `***`

## Done基準

- [x] Editorだけが `?view=admin_html` を開ける
- [x] 06_HTML本文の一覧が表示され、検索/フィルタできる
- [x] 新規HTML本文追加ができ、保存すると06_HTML本文に行が追加される
- [x] 既存HTML本文の編集ができ、保存で反映される
- [x] markdown形式のプレビューが表示される
- [x] html形式はセキュリティ警告が表示される
- [x] 参照先（ウィジェット）が表示される
- [x] 操作が08_監査ログに残る（ok/failed含む）

## 今後の拡張

### Phase2

- [ ] 「表示」列を追加して本格的な非表示機能
- [ ] 未使用HTML本文一覧表示
- [ ] markdown拡張（テーブル、画像など）

### Phase3

- [ ] HTML本文のバージョン管理
- [ ] HTMLサニタイズ機能の実装
- [ ] プレビュー用のサンドボックス環境

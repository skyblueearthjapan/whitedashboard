# ページ管理画面 仕様

## 概要

Editor権限を持つユーザーが、01_ページシートを直接触らずにページ（タブ）の追加・名称変更・並び替えを行える管理画面です。

**今回のゴール**: Editorがシートを直接触らずに、ページを追加・名称変更・並び替えできる状態。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ doGet(e)                                                     │
│   view=admin_pages → renderAdminPagesView()                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ renderAdminPagesView(isEditor)                               │
│   1. Editor権限チェック（Viewerは拒否）                       │
│   2. getConfig()でデータ取得                                  │
│   3. admin-pages.htmlテンプレートを描画                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ admin-pages.html                                             │
│   PageAdmin.init()                                           │
│     - 一覧表示（表示順編集可能）                               │
│     - 検索                                                   │
│     - 新規作成/編集フォーム                                   │
│   CRUD操作                                                    │
│     → google.script.run.createPage(data)                     │
│     → google.script.run.updatePage(pageId, patch)            │
│     → google.script.run.reorderPages(orderList)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ server/pagesAdmin.gs                                         │
│   - listPages() → config.pages + assets返却                  │
│   - createPage(data) → 行追加 + 監査ログ                     │
│   - updatePage(pageId, patch) → 行更新 + 監査ログ            │
│   - reorderPages(orderList) → 表示順一括更新 + 監査ログ       │
└─────────────────────────────────────────────────────────────┘
```

## ファイル構成

```
src/gas/
├── Code.gs                  # view=admin_pages分岐
├── admin-pages.html         # ページ管理画面テンプレート
└── server/
    └── pagesAdmin.gs        # CRUD API
```

## アクセス方法

```
?view=admin_pages
```

- Editorのみアクセス可能
- Viewerは「アクセス権限がありません」画面が表示される
- 管理トップ（?view=admin）のヘッダーからもリンク

## 画面構成

### ヘッダー

- 「ページ管理」タイトル
- ナビゲーション
  - 管理トップ
  - ポータルへ戻る

### 一覧パネル（左60%）

#### ツールバー
- 検索ボックス（ID/タイトルで検索）
- 「+ 新規作成」ボタン

#### 並び順バー
- 並び順変更時に表示
- 「キャンセル」「並び順を保存」ボタン

#### テーブル
| 列 | 説明 |
|----|------|
| 表示順 | display_order（編集可能なinput） |
| ページID | page_id |
| タイトル | page_title |
| モード | layout_mode（バッジ表示） |
| 列数(PC/Tab/Mob) | cols_pc/cols_tablet/cols_mobile |
| 行高 | row_height |
| 余白 | gap |

- 行クリックで詳細パネルに表示
- 選択行はハイライト
- 表示順は直接入力で変更可能

### 詳細パネル（右40%）

#### フォーム項目

| 項目 | 必須 | 説明 |
|------|------|------|
| ページID | ✓ | 新規作成時のみ編集可、英数字_-推奨 |
| 表示順 | - | 1以上の整数 |
| ページタイトル | ✓ | 表示名 |
| レイアウトモード | - | auto/manual/hybrid |
| 背景色 | - | 色コード (#FFFFFF形式) |
| 列数 (PC) | - | 1以上の整数、デフォルト12 |
| 列数 (タブレット) | - | 1以上の整数、デフォルト8 |
| 列数 (モバイル) | - | 1以上の整数、デフォルト4 |
| 行高さ (px) | - | 0以上の数値、デフォルト72 |
| 余白 (px) | - | 0以上の数値、デフォルト12 |
| ヘッダーアセットID | - | 04_アセット参照 |
| メモ | - | 管理用メモ |

#### アクション
- 「作成」ボタン（新規時）
- 「保存」ボタン（編集時）

## API仕様

### listPages()

```javascript
// 戻り値
{ ok: true, pages: [...], assets: {...} }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### createPage(pageData)

```javascript
// 引数
{
  page_id: 'new_page',
  page_title: '新しいページ',
  display_order: 5,
  layout_mode: 'auto',
  cols_pc: 12,
  cols_tablet: 8,
  cols_mobile: 4,
  row_height: 72,
  gap: 12,
  bg_color: '#FFFFFF',
  header_asset_id: '',
  memo: ''
}

// 戻り値
{ ok: true, pageId: 'new_page' }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### updatePage(pageId, patch)

```javascript
// 引数
pageId: 'existing_page'
patch: { page_title: '更新後タイトル', cols_pc: 10 }

// 戻り値
{ ok: true }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### reorderPages(orderList)

```javascript
// 引数
orderList: [
  { page_id: 'home', display_order: 1 },
  { page_id: 'info', display_order: 2 },
  { page_id: 'tools', display_order: 3 }
]

// 戻り値
{ ok: true, updated: 3 }
// or
{ ok: false, error: 'エラーメッセージ' }
```

## バリデーション

### クライアント側（保存前チェック）

| チェック | 条件 |
|----------|------|
| ID必須 | page_id が空 |
| タイトル必須 | page_title が空 |
| 列数チェック | cols_* が1未満 |
| 行高さ・余白チェック | row_height/gap が0未満 |
| ID重複 | 新規作成時、同じpage_idが存在 |

### サーバ側（pagesAdmin.gs）

| チェック | 条件 |
|----------|------|
| Editor権限 | checkIsEditor() が false |
| ID必須（新規） | page_id が空 |
| タイトル必須 | page_title が空 |
| ID重複（新規） | 既存に同じpage_idあり |
| 列数妥当性 | cols_* が1以上の整数でない |
| 数値妥当性 | row_height/gap が0以上でない |
| レイアウトモード | auto/manual/hybrid以外 |
| ヘッダーアセット参照 | header_asset_idが04_アセットに存在しない |
| 並び順重複 | reorderPages時に同じdisplay_orderが存在 |

### 列数変更の確認

既存ページの列数を変更する場合、レイアウトが崩れる可能性があるため確認ダイアログを表示。

## 監査ログ

すべての操作は08_監査ログに記録：

| 列 | 内容 |
|----|------|
| timestamp | 操作日時（ISO8601） |
| actor | Session.getActiveUser().getEmail() |
| action | create_page / update_page / reorder_pages |
| page_id | ページID（reorder時は "all"） |
| bp | 空（ページ操作では不使用） |
| before_json | 操作前の状態（JSON） |
| after_json | 操作後の状態（JSON） |
| result | ok / failed |
| message | 結果メッセージ |

## シート列マッピング

01_ページシートの日本語列名とフィールドのマッピング：

```javascript
const PAGE_COLUMNS = {
  'ページID*': 'page_id',
  'ページタイトル*': 'page_title',
  '表示順': 'display_order',
  'レイアウトモード*': 'layout_mode',
  '列数_PC*': 'cols_pc',
  '列数_タブレット*': 'cols_tablet',
  '列数_モバイル*': 'cols_mobile',
  '行高さ(px)': 'row_height',
  '余白(px)': 'gap',
  '背景色': 'bg_color',
  'ヘッダーアセットID': 'header_asset_id',
  'メモ': 'memo'
};
```

## デフォルト値

新規ページ作成時のデフォルト値：

| 項目 | デフォルト値 |
|------|-------------|
| display_order | 既存ページの最大値 + 1 |
| layout_mode | auto |
| cols_pc | 12 |
| cols_tablet | 8 |
| cols_mobile | 4 |
| row_height | 72 |
| gap | 12 |
| bg_color | #FFFFFF |

## 非表示について

現在のテンプレートには「表示」列がないため、非表示機能は方針Aで対応：
- 表示順を大きい値にして下に送る
- 将来的に「表示」列を追加して本格対応予定

## Done基準

- [x] Editorだけが `?view=admin_pages` を開ける
- [x] 01_ページが一覧表示でき、検索できる
- [x] 新規ページ作成ができ、保存すると01_ページに行が追加される
- [x] ページタイトル等の更新ができ、保存すると該当行が更新される
- [x] 並び替えができ、表示順が一括更新される
- [x] ヘッダーアセット参照切れ等の不正は保存できない
- [x] 追加/更新/並び替え操作が08_監査ログに残る

## 今後の拡張

### Phase2

- [ ] 「表示」列追加による本格的な非表示機能
- [ ] ページの複製機能
- [ ] ドラッグ&ドロップによる並び替え

### Phase3

- [ ] ページ削除（完全削除は危険なため慎重に設計）
- [ ] ページ別のウィジェット一覧表示
- [ ] ページプレビュー機能

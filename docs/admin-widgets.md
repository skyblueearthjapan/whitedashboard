# ウィジェット管理画面 仕様

## 概要

Editor権限を持つユーザーが、02_ウィジェットシートを直接触らずにウィジェットの追加・編集・非表示を行える管理画面です。

**今回のゴール**: 総務（Editor）がシートを直接触らずに、02_ウィジェットを安全に追加・編集・非表示できる状態。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ doGet(e)                                                     │
│   view=admin_widgets → renderAdminWidgetsView()              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ renderAdminWidgetsView(isEditor)                             │
│   1. Editor権限チェック（Viewerは拒否）                       │
│   2. getConfig()でデータ取得                                  │
│   3. admin-widgets.htmlテンプレートを描画                     │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ admin-widgets.html                                           │
│   WidgetAdmin.init()                                         │
│     - 一覧表示                                                │
│     - 検索・フィルタ                                          │
│     - 新規作成/編集フォーム                                   │
│   CRUD操作                                                    │
│     → google.script.run.createWidget(data)                   │
│     → google.script.run.updateWidget(widgetId, patch)        │
│     → google.script.run.hideWidget(widgetId)                 │
│     → google.script.run.showWidget(widgetId)                 │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ server/widgetsAdmin.gs                                       │
│   - listWidgets() → config.widgets返却                       │
│   - createWidget(data) → 行追加 + 監査ログ                   │
│   - updateWidget(widgetId, patch) → 行更新 + 監査ログ        │
│   - hideWidget(widgetId) → visible=FALSE + 監査ログ          │
│   - showWidget(widgetId) → visible=TRUE + 監査ログ           │
└─────────────────────────────────────────────────────────────┘
```

## ファイル構成

```
src/gas/
├── Code.gs                  # view=admin_widgets分岐
├── admin-widgets.html       # ウィジェット管理画面テンプレート
└── server/
    └── widgetsAdmin.gs      # CRUD API
```

## アクセス方法

```
?view=admin_widgets
```

- Editorのみアクセス可能
- Viewerは「アクセス権限がありません」画面が表示される
- 管理トップ（?view=admin）のヘッダーからもリンク

## 画面構成

### ヘッダー

- 「ウィジェット管理」タイトル
- ナビゲーション
  - 管理トップ
  - ポータルへ戻る

### 一覧パネル（左60%）

#### ツールバー
- 検索ボックス（ID/タイトルで検索）
- 種別フィルタ（全種別/link/embed/image/pdf/sheet/html/divider）
- 表示フィルタ（全表示状態/表示のみ/非表示のみ）
- 「+ 新規作成」ボタン

#### テーブル
| 列 | 説明 |
|----|------|
| ID | ウィジェットID |
| タイトル | ウィジェット名 |
| 種別 | type（バッジ表示） |
| ページ | defaultPage |
| 表示 | visible（バッジ：表示/非表示） |
| 管理者 | owner |

- 行クリックで詳細パネルに表示
- 選択行はハイライト

### 詳細パネル（右40%）

#### フォーム項目

| 項目 | 必須 | 説明 |
|------|------|------|
| ウィジェットID | ✓ | 新規作成時のみ編集可、英数字_-推奨 |
| 種別 | ✓ | link/embed/image/pdf/sheet/html/divider |
| タイトル | ✓ | 表示名 |
| URL/参照 | △ | link/embed/image/pdf/sheetは必須、REF:対応 |
| 既定ページ | - | 01_ページから選択 |
| 対象 | - | all/internal |
| 開き方 | - | same_tab/new_tab |
| 埋め込み方式 | - | iframe/link_fallback |
| アイコンアセットID | - | 04_アセット参照 |
| 表示 | - | 表示/非表示 |
| 管理者 | - | owner |
| 棚卸周期 | - | none/weekly/monthly/quarterly/yearly |

#### アクション
- 「作成」ボタン（新規時）
- 「保存」ボタン（編集時）
- 「非表示にする」ボタン（visible=TRUE時）
- 「表示に戻す」ボタン（visible=FALSE時）

## API仕様

### listWidgets()

```javascript
// 戻り値
{ ok: true, widgets: [...] }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### createWidget(widgetData)

```javascript
// 引数
{
  widget_id: 'new_widget_001',
  title: '新しいリンク',
  type: 'link',
  default_page: 'home',
  audience: 'all',
  url_or_ref: 'https://example.com',
  icon_asset_id: '',
  open_mode: 'new_tab',
  embed_mode: 'link_fallback',
  visible: true,
  owner: 'admin@example.com',
  review_cycle: 'monthly'
}

// 戻り値
{ ok: true }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### updateWidget(widgetId, patch)

```javascript
// 引数
widgetId: 'existing_widget'
patch: { title: '更新後タイトル', url_or_ref: 'https://new-url.com' }

// 戻り値
{ ok: true }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### hideWidget(widgetId)

```javascript
// 引数
widgetId: 'widget_to_hide'

// 戻り値
{ ok: true }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### showWidget(widgetId)

```javascript
// 引数
widgetId: 'widget_to_show'

// 戻り値
{ ok: true }
// or
{ ok: false, error: 'エラーメッセージ' }
```

## バリデーション

### クライアント側（保存前チェック）

| チェック | 条件 |
|----------|------|
| ID必須 | widget_id が空 |
| タイトル必須 | title が空 |
| 種別必須 | type が空 |
| URL必須 | link/embed/image/pdf/sheet で url_or_ref が空 |
| ID重複 | 新規作成時、同じwidget_idが存在 |

### サーバ側（widgetsAdmin.gs）

| チェック | 条件 |
|----------|------|
| Editor権限 | checkIsEditor() が false |
| ID必須（新規） | widget_id が空 |
| タイトル必須 | title が空 |
| 種別必須 | type が空 |
| 種別不正 | type が許可リスト外 |
| ID重複（新規） | 既存に同じwidget_idあり |
| URL必須 | link/embed/image/pdf/sheet で url_or_ref が空 |
| 参照チェック | REF:HTML_xxx/REF:ASSET_xxx の参照先確認 |
| アイコン参照 | icon_asset_id の参照先確認 |

## 監査ログ

すべてのCRUD操作は08_監査ログに記録：

| 列 | 内容 |
|----|------|
| timestamp | 操作日時（ISO8601） |
| user | Session.getActiveUser().getEmail() |
| action | widget_create / widget_update / widget_hide / widget_show |
| target_type | widget |
| target_id | ウィジェットID |
| before_json | 操作前の状態（JSON） |
| after_json | 操作後の状態（JSON） |
| metadata | 追加情報（オプション） |

## シート列マッピング

02_ウィジェットシートの日本語列名とフィールドのマッピング：

```javascript
const WIDGET_COLUMNS = {
  'ウィジェットID*': 'widget_id',
  'タイトル*': 'title',
  '種別*': 'type',
  'URL/参照': 'url_or_ref',
  'アイコンAsset ID': 'icon_asset_id',
  '既定ページ': 'default_page',
  '対象': 'audience',
  '開き方': 'open_mode',
  '埋め込み': 'embed_mode',
  '表示': 'visible',
  '管理者': 'owner',
  '棚卸周期': 'review_cycle'
};
```

## エラーハンドリング

- サーバエラーはtry-catchでキャッチ
- エラー時は { ok: false, error: message } を返却
- クライアント側でトースト通知
- 操作中はローディングオーバーレイ表示

## Done基準

- [x] Editorだけが ?view=admin_widgets を開ける
- [x] 02_ウィジェットが一覧表示でき、検索/フィルタできる
- [x] 新規作成ができ、保存すると02_ウィジェットに行が追加される
- [x] 既存編集ができ、保存すると該当行が更新される
- [x] 非表示ができ、visible=FALSE になり、ポータルから消える
- [x] 参照切れ/URL空/ID重複などが保存前に検知され、保存できない
- [x] 追加/更新/非表示の操作が08_監査ログに残る

## 今後の拡張

### Phase2

- [ ] レイアウト設定（ウィジェット詳細から03_レイアウト編集）
- [ ] ウィジェットの複製機能
- [ ] 一括非表示/表示

### Phase3

- [ ] ドラッグ&ドロップで並び替え
- [ ] ウィジェットのプレビュー表示
- [ ] CSVインポート/エクスポート

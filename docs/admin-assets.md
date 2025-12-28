# アセット管理画面 仕様

## 概要

Editor権限を持つユーザーが、04_アセットシートを直接触らずにアセット（画像・PDF等）の追加・更新を行い、参照先を確認して参照切れを防げる管理画面です。

**今回のゴール**: Editorがシートを直接触らずに、04_アセットを安全に追加・更新し、参照先を確認して参照切れを防げる状態。

**重要**: 物理削除は禁止。削除は論理削除（非表示）を原則とし、参照中のアセットは削除不可。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ doGet(e)                                                     │
│   view=admin_assets → renderAdminAssetsView()                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ renderAdminAssetsView(isEditor)                              │
│   1. Editor権限チェック（Viewerは拒否）                       │
│   2. getConfig()でデータ取得                                  │
│   3. admin-assets.htmlテンプレートを描画                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ admin-assets.html                                            │
│   AssetAdmin.init()                                          │
│     - 一覧表示                                               │
│     - 検索・種別フィルタ                                      │
│     - 新規作成/編集フォーム                                   │
│     - 参照先ビュー表示                                        │
│   CRUD操作                                                    │
│     → google.script.run.createAsset(data)                    │
│     → google.script.run.updateAsset(assetId, patch)          │
│     → google.script.run.hideAsset(assetId)                   │
│     → google.script.run.getAssetUsages(assetId)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ server/assetsAdmin.gs                                        │
│   - listAssets() → アセット一覧 + pages/widgets返却          │
│   - createAsset(data) → 行追加 + 監査ログ                    │
│   - updateAsset(assetId, patch) → 行更新 + 監査ログ          │
│   - hideAsset(assetId) → 参照チェック + 非表示 + 監査ログ    │
│   - getAssetUsages(assetId) → 参照先計算                     │
└─────────────────────────────────────────────────────────────┘
```

## ファイル構成

```
src/gas/
├── Code.gs                  # view=admin_assets分岐
├── admin-assets.html        # アセット管理画面テンプレート
└── server/
    └── assetsAdmin.gs       # CRUD API + 参照先計算
```

## アクセス方法

```
?view=admin_assets
```

- Editorのみアクセス可能
- Viewerは「アクセス権限がありません」画面が表示される
- 管理トップ（?view=admin）のヘッダーからもリンク

## 画面構成

### ヘッダー

- 「アセット管理」タイトル
- ナビゲーション
  - 管理トップ
  - ポータルへ戻る

### 一覧パネル（左55%）

#### ツールバー
- 検索ボックス（ID/URLで検索）
- 種別フィルタ（全種別/image/icon/pdf/video/file）
- 「+ 新規作成」ボタン

#### テーブル
| 列 | 説明 |
|----|------|
| アセットID | asset_id |
| 種別 | asset_type（バッジ表示） |
| URL | url（省略表示） |
| 代替テキスト | alt_text |

- 行クリックで詳細パネルに表示
- 選択行はハイライト

### 詳細パネル（右45%）

#### フォーム項目

| 項目 | 必須 | 説明 |
|------|------|------|
| アセットID | ✓ | 新規作成時のみ編集可、英数字_-推奨 |
| 種別 | ✓ | image/icon/pdf/video/file |
| URL | ✓ | http(s)://またはdata:で始まる |
| 代替テキスト | - | アクセシビリティ用alt |
| 管理者 | - | owner |
| メモ | - | 管理用メモ |

#### プレビュー
- image/icon種別の場合、画像プレビューを表示

#### 参照先ビュー（重要）
選択したアセットがどこで使われているかを一覧表示：
- **ページヘッダー**: 01_ページ.header_asset_id から参照
- **ウィジェットアイコン**: 02_ウィジェット.icon_asset_id から参照
- **ウィジェット参照**: 02_ウィジェット.url_or_ref が REF:ASSET_xxx

参照先が0件なら「未使用」と表示。

#### アクション
- 「作成」ボタン（新規時）
- 「保存」ボタン（編集時）
- 「削除（非表示）」ボタン

## API仕様

### listAssets()

```javascript
// 戻り値
{ ok: true, assets: [...], pages: [...], widgets: [...] }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### getAssetUsages(assetId)

```javascript
// 戻り値
{
  ok: true,
  usages: {
    pageHeaders: [{ pageId, pageTitle }],
    widgetIcons: [{ widgetId, title }],
    widgetRefs: [{ widgetId, title }],
    total: 3
  }
}
```

### createAsset(assetData)

```javascript
// 引数
{
  asset_id: 'HEADER_001',
  asset_type: 'image',
  url: 'https://example.com/image.png',
  alt_text: 'ヘッダー画像',
  owner: 'admin@example.com',
  memo: ''
}

// 戻り値
{ ok: true, assetId: 'HEADER_001', warnings: [] }
// or
{ ok: false, error: 'エラーメッセージ', warnings: [...] }
```

### updateAsset(assetId, patch)

```javascript
// 引数
assetId: 'HEADER_001'
patch: { url: 'https://example.com/new-image.png', alt_text: '新しい画像' }

// 戻り値
{ ok: true, warnings: [] }
// or
{ ok: false, error: 'エラーメッセージ' }
```

### hideAsset(assetId)

```javascript
// 引数
assetId: 'UNUSED_ASSET'

// 成功時
{ ok: true }

// 参照中の場合
{
  ok: false,
  error: 'このアセットは 3 箇所で参照されているため削除できません',
  usages: { ... }
}

// 表示列がない場合
{
  ok: false,
  error: '現在のテンプレートでは非表示機能がサポートされていません。...'
}
```

## バリデーション

### クライアント側（保存前チェック）

| チェック | 条件 |
|----------|------|
| ID必須 | asset_id が空 |
| 種別必須 | asset_type が空 |
| URL必須 | url が空 |
| URL形式 | http(s)://またはdata:で始まらない |
| ID重複 | 新規作成時、同じasset_idが存在 |

### サーバ側（assetsAdmin.gs）

| チェック | 条件 |
|----------|------|
| Editor権限 | checkIsEditor() が false |
| ID必須（新規） | asset_id が空 |
| 種別必須 | asset_type が空 |
| URL必須 | url が空 |
| URL形式 | http(s)://またはdata:で始まらない |
| ID重複（新規） | 既存に同じasset_idあり |
| 種別/拡張子整合 | 警告のみ（保存は許可） |
| 削除時参照チェック | 参照先が1件以上あれば削除不可 |

### 種別と拡張子の警告

| 種別 | 期待される拡張子 |
|------|-----------------|
| image/icon | .png, .jpg, .jpeg, .gif, .svg, .webp |
| pdf | .pdf |

※ 警告のみで保存は許可（現実対応）

## 削除制約（最重要）

1. **物理削除は禁止**: 行の削除は行わない
2. **参照チェック**: 参照先が1件でもある場合は削除不可
3. **表示列がない場合**: 削除機能は提供しない（安全優先）
4. **表示列がある場合**: visible=FALSE に更新（論理削除）

## 参照先の計算

getAssetUsages() で以下をチェック：

```javascript
// 01_ページ.header_asset_id
pages.forEach(page => {
  if (page.headerAssetId === assetId) {
    usages.pageHeaders.push({ pageId, pageTitle });
  }
});

// 02_ウィジェット.icon_asset_id
widgets.forEach(widget => {
  if (widget.iconAssetId === assetId) {
    usages.widgetIcons.push({ widgetId, title });
  }
});

// 02_ウィジェット.url_or_ref = REF:ASSET_xxx
widgets.forEach(widget => {
  if (widget.urlOrRef === 'REF:' + assetId) {
    usages.widgetRefs.push({ widgetId, title });
  }
});
```

## 監査ログ

すべての操作は08_監査ログに記録：

| 列 | 内容 |
|----|------|
| timestamp | 操作日時（ISO8601） |
| actor | Session.getActiveUser().getEmail() |
| action | create_asset / update_asset / hide_asset |
| page_id | アセットID（page_id列を流用） |
| bp | 空（アセット操作では不使用） |
| before_json | 操作前の状態（JSON） |
| after_json | 操作後の状態（JSON） |
| result | ok / failed |
| message | 結果メッセージ |

## シート列マッピング

04_アセットシートの日本語列名とフィールドのマッピング：

```javascript
const ASSET_COLUMNS = {
  'アセットID*': 'asset_id',
  'アセット種別*': 'asset_type',
  '参照元URL/ID*': 'url',
  '代替テキスト': 'alt_text',
  'ライセンス': 'license',
  '更新日': 'updated_at',
  '管理者': 'owner',
  'メモ': 'memo'
};
```

## 更新日の自動設定

アセットの作成・更新時に `updated_at` 列を自動更新（YYYY-MM-DD形式）。

## Done基準

- [x] Editorだけが `?view=admin_assets` を開ける
- [x] 04_アセットの一覧が表示され、検索/フィルタできる
- [x] 新規アセット追加ができ、保存すると04_アセットに行が追加される
- [x] 既存アセットのURL/alt更新ができ、保存で反映される
- [x] アセットの参照先（ページヘッダー/ウィジェットアイコン/REF:ASSET）が表示される
- [x] 参照中アセットは削除できない（ブロックされる）
- [x] 操作が08_監査ログに残る（ok/failed含む）

## 今後の拡張

### Phase2

- [ ] 「表示」列を追加して本格的な非表示機能
- [ ] 未使用アセット一覧表示
- [ ] アセットの一括アップロード

### Phase3

- [ ] Google Driveとの連携
- [ ] 画像のリサイズ・最適化
- [ ] アセットのバージョン管理

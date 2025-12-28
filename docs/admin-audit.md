# 監査ログ閲覧画面 仕様

## 概要

Editor権限を持つユーザーが、08_監査ログシートを閲覧し、誰がいつ何を変えたかを追跡できる管理画面です。

**今回のゴール**: Editorが、誰がいつ何を変えたかを追跡できる状態。

**注意**: ロールバック（復旧UI）は今回は不要。将来拡張として検討。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ doGet(e)                                                     │
│   view=admin_audit → renderAdminAuditView()                  │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ renderAdminAuditView(isEditor)                               │
│   1. Editor権限チェック（Viewerは拒否）                       │
│   2. admin-audit.htmlテンプレートを描画                       │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ admin-audit.html                                             │
│   AuditAdmin.init()                                          │
│     - フィルタバー                                            │
│     - 一覧表示（テーブル）                                    │
│     - 詳細モーダル                                            │
│   データ取得                                                  │
│     → google.script.run.listAuditLogs(params)                │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ server/auditAdmin.gs                                         │
│   - listAuditLogs(params) → フィルタ適用、新しい順でログ返却  │
│   - getAuditLogDetail(rowIndex) → 詳細取得                   │
└─────────────────────────────────────────────────────────────┘
```

## ファイル構成

```
src/gas/
├── Code.gs                  # view=admin_audit分岐
├── admin-audit.html         # 監査ログ閲覧画面テンプレート
└── server/
    └── auditAdmin.gs        # listAuditLogs API
```

## アクセス方法

```
?view=admin_audit
```

- Editorのみアクセス可能
- Viewerは「アクセス権限がありません」画面が表示される
- 管理トップ（?view=admin）のヘッダーからリンク

### URLパラメータによるフィルタ

```
?view=admin_audit&action=save_layout&page_id=home
```

以下のパラメータをサポート:
- `action`: アクション種別
- `page_id`: ページID
- `actor`: 操作者（部分一致）
- `result`: 結果（ok/failed）

## 画面構成

### ヘッダー

- 「監査ログ」タイトル
- ナビゲーション
  - 管理トップ
  - ポータルへ戻る

### フィルタバー

| フィルタ | 種類 | 説明 |
|----------|------|------|
| 開始日 | date | 期間の開始日 |
| 終了日 | date | 期間の終了日 |
| 操作者 | text | メールアドレス（部分一致） |
| アクション | select | save_layout, create_widget など |
| 結果 | select | all / ok / failed |
| ページID | text | ページID（部分一致） |

- 「検索」ボタン: フィルタを適用
- 「クリア」ボタン: フィルタをリセット
- 件数表示: 「N / M 件表示」形式

### 一覧テーブル

| 列 | 説明 |
|----|------|
| 日時 | timestamp（YYYY-MM-DD HH:mm:ss形式） |
| 操作者 | actor（メールアドレス） |
| アクション | action（バッジ表示） |
| ページID | page_id |
| BP | bp（ブレークポイント） |
| 結果 | result（ok=緑, failed=赤バッジ） |

- 新しい順（timestamp降順）で表示
- 行クリックで詳細モーダルを開く
- 最大200件まで表示（パフォーマンス対策）

### 詳細モーダル

#### 基本情報
- 日時
- 操作者
- アクション
- 結果
- ページID
- BP

#### メッセージ
- message列の内容を表示

#### Before / After
- before_json / after_json をJSONフォーマットで表示
- パースエラー時は文字列として表示

## API仕様

### listAuditLogs(params)

```javascript
// 引数
{
  limit: 200,            // 最大件数
  start_date: '2024-01-01',  // 開始日（YYYY-MM-DD）
  end_date: '2024-12-31',    // 終了日（YYYY-MM-DD）
  actor: 'user@example',     // 操作者（部分一致）
  action: 'save_layout',     // アクション（完全一致）
  result: 'ok',              // 結果（完全一致）
  page_id: 'home'            // ページID（部分一致）
}

// 戻り値
{
  ok: true,
  logs: [
    {
      timestamp: '2024-01-15T10:30:00.000Z',
      actor: 'user@example.com',
      action: 'save_layout',
      page_id: 'home',
      bp: 'desktop',
      before_json: '{"widgets": [...]}',
      after_json: '{"widgets": [...]}',
      result: 'ok',
      message: '保存成功'
    },
    // ...
  ],
  totalCount: 150,
  actions: ['save_layout', 'create_widget', 'update_widget', ...]
}

// エラー時
{ ok: false, error: 'エラーメッセージ' }
```

### getAuditLogDetail(rowIndex)

```javascript
// 戻り値
{
  ok: true,
  log: {
    // ... 上記と同じフィールド
    beforeParsed: { ... },  // パース済みJSON
    afterParsed: { ... }    // パース済みJSON
  }
}
```

## 監査ログの列構造

08_監査ログシートの列:

| 列名 | 説明 |
|------|------|
| timestamp | 操作日時（ISO8601） |
| actor | 操作者メールアドレス |
| action | 操作種別 |
| page_id | ページID（任意） |
| bp | ブレークポイント（任意） |
| before_json | 操作前の状態（JSON） |
| after_json | 操作後の状態（JSON） |
| result | 結果（ok/failed） |
| message | メッセージ（任意） |

## アクション種別一覧

| action | 説明 | 操作元 |
|--------|------|--------|
| save_layout | レイアウト保存 | 指示F |
| create_widget | ウィジェット作成 | 指示H |
| update_widget | ウィジェット更新 | 指示H |
| hide_widget | ウィジェット非表示 | 指示H |
| create_page | ページ作成 | 指示I |
| update_page | ページ更新 | 指示I |
| reorder_pages | ページ並び替え | 指示I |
| create_asset | アセット作成 | 指示J |
| update_asset | アセット更新 | 指示J |
| hide_asset | アセット非表示 | 指示J |
| create_html_content | HTML本文作成 | 指示K |
| update_html_content | HTML本文更新 | 指示K |

## 安全装置

### JSONパースエラー対策

```javascript
function safeParseJson(jsonStr) {
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // パース失敗時は文字列として返す
    return { _parseError: true, _raw: String(jsonStr) };
  }
}
```

### シート存在チェック

```javascript
const sheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);
if (!sheet) {
  return {
    ok: true,
    logs: [],
    totalCount: 0,
    message: '監査ログがまだありません'
  };
}
```

### 権限チェック

```javascript
if (!checkIsEditor()) {
  return { ok: false, error: '権限がありません' };
}
```

## パフォーマンス対策

### 件数制限

- デフォルトで最大200件まで取得
- フィルタはサーバ側で適用
- 期間指定で対象範囲を絞る

### 最適化ポイント

1. シート全体を一度に読み込み（getDataRange）
2. サーバ側でフィルタリング
3. 必要最小限のデータのみクライアントに返却

## Done基準

- [x] Editorのみ `/admin/audit` を開ける
- [x] 08_監査ログがあれば、新しい順に一覧表示できる（直近N件）
- [x] action/actor/result/page_id でフィルタできる
- [x] 行をクリックすると before/after の詳細が見られる
- [x] JSONが壊れていても画面が落ちない
- [x] 08_監査ログが無い場合でも「ありません」で落ちない

## 今後の拡張

### Phase2

- [ ] ページネーション（大量ログ対応）
- [ ] CSV/JSONエクスポート
- [ ] 簡易diff表示（before/after差分）

### Phase3

- [ ] ロールバック機能（before状態への復旧）
- [ ] 警告一覧からの直接リンク
- [ ] リアルタイム更新

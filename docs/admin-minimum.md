# 管理画面（最小版）仕様

## 概要

Editor権限を持つユーザーが、シートの不備やリンク切れ等を検出・確認できる管理画面です。
Phase9（P0改善）/ Phase10（運用UI）/ Phase5（権限）に準拠。

**今回のスコープ**: 「検知して一覧で見せる」まで。
管理画面から編集（追加/削除）は次フェーズで実装。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ doGet(e)                                                     │
│   view=admin → renderAdminView()                            │
│   view=portal → renderPortalView() (デフォルト)              │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ renderAdminView(isEditor)                                    │
│   1. Editor権限チェック（Viewerは拒否）                       │
│   2. getConfig()でデータ取得                                 │
│   3. admin.htmlテンプレートを描画                            │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ admin.html                                                   │
│   Validators.validateConfig(config)                          │
│     → { errors, warnings, reviews }                         │
│   画面に表示                                                 │
└─────────────────────────────────────────────────────────────┘
```

## ファイル構成

```
src/gas/
├── Code.gs              # view分岐追加
├── admin.html           # 管理画面テンプレート
└── lib/
    └── validators.html  # 設定検証ロジック
```

## アクセス方法

```
?view=admin
```

- Editorのみアクセス可能
- Viewerは「アクセス権限がありません」画面が表示される

## 検知項目一覧

### P0（警告）- 重大な問題

| 検知タイプ | 対象シート | 説明 |
|-----------|------------|------|
| `duplicate_page_id` | 01_ページ | ページIDの重複 |
| `duplicate_widget_id` | 02_ウィジェット | ウィジェットIDの重複 |
| `duplicate_asset_id` | 04_アセット | アセットIDの重複 |
| `duplicate_content_id` | 06_HTML本文 | content_idの重複 |
| `broken_html_ref` | 02→06 | HTML参照切れ（REF:HTML_xxx） |
| `broken_asset_ref` | 02→04 | アセット参照切れ（REF:ASSET_xxx） |
| `broken_icon_ref` | 02→04 | アイコン参照切れ（icon_asset_id） |
| `broken_header_ref` | 01→04 | ヘッダー画像参照切れ（header_asset_id） |
| `missing_url` | 02_ウィジェット | URL未設定（link/embed/image/pdf/sheet） |
| `orphan_layout` | 03_レイアウト | 対応するウィジェットが存在しないレイアウト |
| `manual_collision` | 03_レイアウト | Manual配置の衝突（同一page_id+bp内） |

### P1（注意）- 軽微な問題

| 検知タイプ | 対象シート | 説明 |
|-----------|------------|------|
| `no_layout` | 02+03 | visible=TRUEだがレイアウト設定がない |

### 棚卸

| ステータス | 説明 |
|-----------|------|
| `overdue` | 期限切れ（cycleDaysを超過） |
| `due_soon` | 期限近い（7日以内） |
| `never_reviewed` | 一度もレビューされていない |
| `not_set` | 棚卸周期が未設定 |

## 棚卸の計算ルール

### 周期→日数マッピング

| review_cycle | 日数 |
|--------------|------|
| weekly | 7日 |
| monthly | 30日 |
| quarterly | 90日 |
| yearly | 365日 |

### 判定ロジック

```javascript
// last_reviewed_at がなければ「未レビュー」
// MVPでは監査ログからの取得は省略

const daysSinceReview = (now - lastReviewedAt) / (1000 * 60 * 60 * 24);
const daysUntilDue = cycleDays - daysSinceReview;

if (daysUntilDue < 0) → overdue
else if (daysUntilDue <= 7) → due_soon
```

## 画面構成

### ヘッダー

- 「管理画面」タイトル
- ナビゲーション
  - ポータルへ戻る
  - 監査ログ（リンク/アラート）
  - 更新

### サマリーカード

4つのカードで概要表示：
- 警告（P0）件数
- 注意（P1）件数
- 棚卸期限切れ件数
- 棚卸期限近い件数

### 詳細セクション

折りたたみ式で表示：
- 警告セクション（P0）
- 注意セクション（P1）
- 棚卸セクション

各アイテムに表示する情報：
- エラータイプ（ラベル）
- メッセージ
- メタ情報（page_id, widget_id, 参照先など）

## Validators API

### validateConfig(config)

```javascript
const result = Validators.validateConfig(config);
// result = {
//   errors: [...],    // P0
//   warnings: [...],  // P1
//   reviews: [...]    // 棚卸
// }
```

### getSummary(validationResult)

```javascript
const summary = Validators.getSummary(result);
// summary = {
//   errorCount: 5,
//   warningCount: 2,
//   reviewOverdueCount: 3,
//   reviewDueSoonCount: 1,
//   reviewNeverCount: 10
// }
```

## 衝突判定（AABB）

```javascript
collides(a, b) {
  const aRight = a.x + a.w - 1;
  const aBottom = a.y + a.h - 1;
  const bRight = b.x + b.w - 1;
  const bBottom = b.y + b.h - 1;

  if (aRight < b.x) return false;
  if (a.x > bRight) return false;
  if (aBottom < b.y) return false;
  if (a.y > bBottom) return false;
  return true;
}
```

## エラーハンドリング

- 設定が壊れていても画面は落とさない
- try-catchで検証エラーをキャッチし、エラーメッセージを表示
- Viewerに内部情報（ID一覧やエラー詳細）を出さない

## パフォーマンス

- getConfig()を1回だけ呼び出し
- クライアント側で検証処理を実行
- 追加のシート読み取りは行わない

## 今後の拡張

### Phase1

- [ ] 監査ログのUI表示（スプレッドシートリンクではなく画面内表示）
- [ ] 棚卸の最終更新日を監査ログから取得

### Phase2

- [ ] ウィジェット追加/編集/非表示（管理画面から）
- [ ] ページ追加/並び替え/非表示

### Phase3

- [ ] リンク有効性チェック（外部URLの疎通確認）
- [ ] アセットの実在チェック（Driveファイル存在確認）

## テスト項目

- [x] Editorのみ ?view=admin を開ける
- [x] Viewerはアクセス拒否画面が表示される
- [x] ID重複が検出・表示される
- [x] 参照切れ（HTML/Asset）が検出・表示される
- [x] URL未設定が検出・表示される
- [x] 孤児レイアウトが検出・表示される
- [x] Manual配置衝突が検出・表示される
- [x] 棚卸の期限切れ/期限近いが表示される
- [x] 設定エラーがあっても画面が落ちない

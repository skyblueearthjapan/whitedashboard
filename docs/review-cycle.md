# 棚卸・レビュー期限ロジック仕様

## 概要

ウィジェットの棚卸期限を自動判定し、総務が目視しなくても見直すべきものが分かる仕組み。

## 対象データ

- シート: `02_ウィジェット`
- 使用列:
  - `棚卸周期`（review_cycle）: none / monthly / quarterly / yearly
  - `管理者`（owner）: 責任者
  - `最終レビュー日`（last_reviewed_at）: 任意

## 最終レビュー日時の決定ルール

各 `widget_id` について、以下の優先順で `last_reviewed_at` を算出:

### 優先順位

1. **02_ウィジェットの `最終レビュー日` 列**
   - 手動で設定された日付があればそれを使用

2. **08_監査ログから取得**
   - 以下のアクションの最新 `timestamp` を取得:
     - `create_widget`
     - `update_widget`
     - `hide_widget`
     - `save_layout`（該当widgetが含まれている場合）

3. **該当なし**
   - `last_reviewed_at = null`（未レビュー扱い）

## review_cycle ごとの期限計算

| review_cycle | 期限日数 | 説明 |
|--------------|---------|------|
| none / 空 | - | 棚卸対象外（警告しない） |
| monthly | 30日 | 月次レビュー |
| quarterly | 90日 | 四半期レビュー |
| yearly | 365日 | 年次レビュー |

### 計算式

```
期限日 = last_reviewed_at + cycle日数
残り日数 = 期限日 - 今日
```

## ステータス分類

| ステータス | 条件 | 表示場所 |
|-----------|------|---------|
| `overdue` | 残り日数 < 0 | P0警告 |
| `never_reviewed` | last_reviewed_atが無い | P0警告 |
| `due_soon` | 0 <= 残り日数 <= 7 | P1注意 |
| `ok` | 残り日数 > 7 | 表示なし |
| `exempt` | review_cycle = none/空 | 対象外 |

## 表示・UI

### 管理トップ（admin.html）

#### サマリーカード
- 警告（P0）: 検証エラー + 棚卸期限切れ/未レビュー
- 注意（P1）: 検証警告 + 棚卸期限近い
- 棚卸期限切れ/未: overdue + never_reviewed の件数
- 棚卸期限近い: due_soon の件数

#### 警告セクション（P0）
- 棚卸期限切れ・未レビューを含む
- 各行に表示:
  - widget_id
  - title
  - owner
  - last_reviewed_at（最終レビュー日）
  - 次回期限日（nextDueDate）
  - 「修正する」リンク → ウィジェット管理画面へ

#### 注意セクション（P1）
- 棚卸期限近いを含む
- 表示内容は警告セクションと同様

### ウィジェット管理画面（admin-widgets.html）

一覧テーブルに「棚卸」列を追加:

| アイコン | ステータス | 説明 |
|---------|-----------|------|
| 🔴 | overdue | 期限切れ |
| 🟡 | due_soon | 期限近い |
| ⚪ | never_reviewed | 未レビュー |
| ✓ | ok | 問題なし |
| - | exempt | 対象外 |

## 実装ファイル

### サーバサイド

- `lib/reviewEngine.gs`
  - `computeAllReviewStatuses(widgets)` - 全ウィジェットのステータス計算
  - `computeWidgetReviewStatus(widget, auditLogs)` - 個別計算
  - `determineLastReviewedAt(widget, auditLogs)` - 最終レビュー日決定
  - `enrichConfigWithReviewStatus(config)` - configに棚卸ステータスを付与

### クライアントサイド

- `lib/validators.html`
  - `checkReviewCycles()` - サーバ計算済みステータスを使用

## データフロー

```
1. Code.gs: renderAdminView()
   ↓
2. config.gs: getConfig()
   ↓
3. lib/reviewEngine.gs: enrichConfigWithReviewStatus()
   - 監査ログを読み込み
   - 各ウィジェットの棚卸ステータスを計算
   ↓
4. admin.html / admin-widgets.html
   - 計算済みステータスを表示
```

## 今後の拡張点

1. **週次レビュー対応**
   - `REVIEW_CYCLE_DAYS` に `weekly: 7` を追加

2. **レビュー完了ボタン**
   - ウィジェット管理画面に「レビュー完了」ボタンを追加
   - クリックで `最終レビュー日` を今日に更新

3. **メール通知**
   - 期限切れ・期限近いウィジェットの管理者にメール送信

4. **カスタム期間**
   - review_cycle に日数を直接指定できるようにする
   - 例: `custom:14` → 14日周期

## 注意事項

- 日付計算はすべてサーバ側（GAS）で実行
- 監査ログがない場合でもクラッシュしない
- `none` / 空の review_cycle は警告対象外
- タイムゾーンは `Asia/Tokyo` を使用

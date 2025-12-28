# 保存API＆監査ログ仕様

## 概要

編集モードで変更した配置（draftRects）を03_レイアウトシートに書き戻し、
監査ログ（08_監査ログ）に変更履歴を残す機能です。

Phase5（権限/監査）/ Phase6（書き込み方針）/ Phase3（auto確定座標保存）/ Phase10（誤操作防止）に準拠。

## アーキテクチャ

```
┌────────────────────────────────────────────────────────────┐
│ クライアント（editor.html）                                 │
│   Editor.save()                                             │
│     ↓ payload作成                                          │
│   google.script.run.saveLayout(payload)                    │
└────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────┐
│ サーバ（save.gs）                                           │
│   saveLayout(payload)                                       │
│     1. Editor権限チェック（checkIsEditor）                  │
│     2. 入力バリデーション                                   │
│     3. ページ情報取得（列数制限用）                         │
│     4. 衝突・範囲チェック（サーバ側）                       │
│     5. 既存データ取得（before用）                           │
│     6. 03_レイアウト へ Upsert                             │
│     7. 08_監査ログ へ書き込み                              │
└────────────────────────────────────────────────────────────┘
```

## ファイル構成

```
src/gas/
├── server/
│   └── save.gs          # 保存API本体
├── editor/
│   └── editor.html      # save(), onSaveSuccess(), onSaveError()
└── index.html           # 保存ボタンUI・CSS
```

## API仕様

### saveLayout(payload)

**リクエスト（payload）**

```javascript
{
  "page_id": "home",
  "bp": "PC",
  "rects": [
    {
      "widget_id": "W001",
      "x": 1,
      "y": 1,
      "w": 3,
      "h": 2,
      "source": "manual",
      "pinned": false,
      "z_index": 0
    },
    {
      "widget_id": "W002",
      "x": 4,
      "y": 1,
      "w": 6,
      "h": 4,
      "source": "auto"
    }
  ],
  "client_ts": "2025-12-28T12:34:56.000Z"
}
```

**レスポンス（成功）**

```javascript
{
  "ok": true,
  "updated": 12,
  "inserted": 3,
  "audit_logged": true,
  "server_ts": "2025-12-28T12:34:57.000Z"
}
```

**レスポンス（失敗）**

```javascript
{
  "ok": false,
  "message": "保存権限がありません",
  "server_ts": "2025-12-28T12:34:57.000Z"
}
```

## 権限チェック（Phase5）

### サーバ側必須チェック

UIだけでなく、サーバ側でもEditor権限を必ず確認。

```javascript
if (!checkIsEditor()) {
  return { ok: false, message: '保存権限がありません' };
}
```

### 権限判定ロジック

1. `Session.getActiveUser().getEmail()` でユーザー取得
2. `EDITOR_EMAILS` プロパティに含まれていればEditor
3. スプレッドシートの編集権限があればEditor
4. スプレッドシートのオーナーならEditor
5. それ以外はViewer（保存拒否）

## バリデーション（Phase10）

### クライアント側

- 編集モードでない場合は保存不可
- 変更がない場合は保存不可
- rectsが空の場合は保存不可

### サーバ側

1. **ペイロード検証**
   - page_id必須
   - bp必須（PC/TABLET/MOBILE）
   - rects必須（空配列不可）

2. **rect個別検証**
   - widget_id必須
   - x, y, w, h は正の整数
   - w >= 1, h >= 1
   - x >= 1, y >= 1
   - x + w - 1 <= cols（列数超え防止）

3. **衝突チェック**
   - 全ペアでAABB衝突判定
   - 衝突があれば保存拒否

```javascript
// AABB衝突判定
function collidesServer(a, b) {
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

## 03_レイアウト更新仕様

### キー

以下の3つで同一行を判定：
- ページID*
- ブレイクポイント*
- ウィジェットID*

### 更新方針（Upsert）

- 既存行があれば `update`
- なければ `append`（追記）

### 更新対象列

| 列名 | 更新ルール |
|------|-----------|
| X | 常に更新 |
| Y | 常に更新 |
| 幅(w)* | 常に更新 |
| 高さ(h)* | 常に更新 |
| 自動配置* | source=manual → FALSE, source=auto → TRUE |
| 固定 | payloadにあれば更新、なければ既存値保持 |
| 重なり順 | payloadにあれば更新、なければ既存値保持 |

### autoフラグの保存ルール

- `rect.source === 'manual'`（ユーザーが編集した）→ `自動配置 = FALSE`
- `rect.source === 'auto'`（自動配置のまま）→ `自動配置 = TRUE`
- ただし、x/yは両方とも保存する（autoでも確定座標を持つため）

## 08_監査ログ仕様

### シート構造

シートが存在しない場合は自動作成。

| 列 | 説明 |
|----|------|
| timestamp | サーバ時刻（ISO 8601形式） |
| actor | 操作者のメールアドレス |
| action | 操作種別（"save_layout"固定） |
| page_id | 対象ページID |
| bp | 対象ブレイクポイント |
| before_json | 変更前のレイアウトJSON |
| after_json | 変更後のレイアウトJSON |
| result | 結果（"ok" / "failed"） |
| message | メッセージ（エラー内容等） |

### 記録タイミング

- 保存成功時: result="ok"
- 保存失敗時: result="failed", message にエラー内容
- 権限エラー時: result="failed", message="Editor権限がありません"

### JSON長制限

スプレッドシートのセル文字数制限を考慮し、50,000文字を超える場合は切り詰め。

## クライアント側UI

### 保存ボタン

```html
<button class="save-layout-btn" id="save-layout-btn" onclick="Editor.save()">保存</button>
```

- 編集モード中のみ表示
- 保存中は無効化、「保存中...」表示
- 成功時: 緑のトースト「保存しました」
- 失敗時: 赤のトースト「保存失敗: [メッセージ]」

### 状態遷移

```
[編集モードOFF] → 保存ボタン非表示
        ↓
[編集モードON] → 保存ボタン表示
        ↓
[保存クリック] → ボタン「保存中...」＋無効化
        ↓
[成功] → 「保存しました」トースト → ボタン復帰
[失敗] → 「保存失敗」トースト → ボタン復帰（draftは保持）
```

## エラーケース

| ケース | 動作 |
|--------|------|
| Editor権限なし | 保存拒否、message="保存権限がありません" |
| rectsが空 | 保存拒否、message="rectsが空です" |
| 列数超え | 保存拒否、message="列数(N)を超えています" |
| 衝突検出 | 保存拒否、message="ウィジェット X と Y が衝突しています" |
| シート未発見 | 保存拒否、message="03_レイアウトシートが見つかりません" |
| 不明なエラー | 保存拒否、message="保存に失敗しました: [詳細]" |

## パフォーマンス考慮

### シート読み取り

- 全データを一括取得して辞書化
- 既存行の探索は O(1)

### シート書き込み

- 更新は行単位で実施（GASの制約上、範囲まとめ更新は複雑）
- 追加は `appendRow()` で実施
- 将来的に `setValues()` でバッチ更新も検討可能

## テスト項目

- [x] Editorが配置変更→保存→リロードで同じ配置が再現
- [x] 03_レイアウトがpage_id+bp+widget_idでupsertされる
- [x] 08_監査ログにbefore/afterがJSONで残る
- [x] Viewerが保存APIを叩いても拒否される
- [x] rectが不正/衝突している場合は保存されない
- [x] 保存成功時にトースト表示
- [x] 保存失敗時にエラートースト表示
- [x] 保存中はボタンが無効化される

## 今後の拡張

1. **複数BP一括保存**: 全BPのdraftRectsを順次保存
2. **楽観的ロック**: client_ts と server_ts の比較で競合検出
3. **Undo対応**: 監査ログからのロールバック機能
4. **バッチ更新**: GASのsetValuesを使った高速化

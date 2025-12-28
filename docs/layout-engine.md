# LayoutEngine 仕様

Phase3準拠のレイアウト計算エンジン。manual優先 + auto整列で、キャンバス上にウィジェットを配置する。

## 概要

```
入力:
  - currentPageId（例：home）
  - currentBp（PC/TABLET/MOBILE）
  - config（pages, widgets, layout, assets, htmlContent）

処理:
  1. visible=TRUE のウィジェットを抽出
  2. 03_レイアウトから該当BP/ページの行を取得
  3. manual配置（auto=FALSE かつ x,yあり）を先に配置
  4. auto配置（auto=TRUE または x/y未指定）を決定的に自動配置

出力:
  - rects: [{ widgetId, x, y, w, h, bp, pageId, source }]
  - warnings: [{ type, message, widgetId, ... }]
```

## アルゴリズム

### 優先順位（絶対ルール）

1. `visible=FALSE` は配置計算から除外
2. manual配置を先に処理
3. auto配置を後から処理
4. manual同士の衝突は warnings に出す（黙って重ねない）

### manual判定（厳密）

```javascript
isManual(layout) {
  return layout.auto === false &&
         layout.x != null &&
         layout.y != null;
}
```

- `auto === false` かつ `x != null` かつ `y != null` → manual
- それ以外 → auto

### auto整列の並び順（決定性）

auto配置対象は以下でソートしてから配置：
1. `layout.order` または `widget.displayOrder` 昇順
2. 同値の場合 `widget_id` 昇順（必須：決定性のため）

```javascript
autoWidgets.sort((a, b) => {
  const orderA = a.layout?.order ?? a.widget.displayOrder ?? 999;
  const orderB = b.layout?.order ?? b.widget.displayOrder ?? 999;
  if (orderA !== orderB) return orderA - orderB;
  return a.widget.widgetId.localeCompare(b.widget.widgetId);
});
```

### 探索戦略（決定的：上→下、左→右）

```javascript
findFirstFit(w, h, cols, placedRects) {
  // y = 1 から増加（上から下へ）
  for (let y = 1; y <= MAX_Y_SEARCH; y++) {
    // x = 1 から増加（左から右へ）
    for (let x = 1; x <= cols - w + 1; x++) {
      const candidate = { x, y, w, h };
      if (!collidesWithAny(candidate, placedRects)) {
        return { x, y };
      }
    }
  }
  return null;
}
```

### 衝突判定（AABB）

```javascript
collides(a, b) {
  const aLeft = a.x, aRight = a.x + a.w - 1;
  const aTop = a.y, aBottom = a.y + a.h - 1;
  const bLeft = b.x, bRight = b.x + b.w - 1;
  const bTop = b.y, bBottom = b.y + b.h - 1;

  // 衝突しない条件
  if (aRight < bLeft) return false;
  if (aLeft > bRight) return false;
  if (aBottom < bTop) return false;
  if (aTop > bBottom) return false;

  return true;
}
```

### clamp（列数超え対策）

```javascript
normalizeRect(rect, cols) {
  let { x, y, w, h } = rect;

  // w を cols 以内に clamp
  w = Math.min(w, cols);

  // x, y は最低 1
  x = Math.max(1, x);
  y = Math.max(1, y);

  // x + w - 1 > cols の場合：x を調整
  if (x + w - 1 > cols) {
    x = cols - w + 1;
  }

  return { ...rect, x, y, w, h };
}
```

## データソース

### 01_ページ（config.pages）

| 列 | 用途 |
|----|------|
| 列数_PC | PC表示時の列数 |
| 列数_タブレット | Tablet表示時の列数 |
| 列数_モバイル | Mobile表示時の列数 |
| 行高さ(px) | グリッド行の高さ |
| 余白(px) | グリッドのgap |

### 02_ウィジェット（config.widgets）

| 列 | 用途 |
|----|------|
| ウィジェットID | 一意識別子 |
| 表示 | visible（TRUE/FALSE） |
| 既定ページ | どのページに属するか |

### 03_レイアウト（config.layout）

| 列 | 内部キー | 用途 |
|----|----------|------|
| ページID* | pageId | フィルタ用 |
| ウィジェットID* | widgetId | ウィジェット参照 |
| ブレイクポイント* | breakpoint | PC/TABLET/MOBILE |
| X | x | 列位置（1始まり） |
| Y | y | 行位置（1始まり） |
| 幅(w)* | w | 幅（列数） |
| 高さ(h)* | h | 高さ（行数） |
| 自動配置* | auto | TRUE=auto, FALSE=manual |
| 重なり順 | zIndex | 将来用 |

## 出力形式

### rects配列

```javascript
{
  widgetId: 'W001',
  x: 1,        // 列位置（1始まり）
  y: 1,        // 行位置（1始まり）
  w: 3,        // 幅
  h: 2,        // 高さ
  bp: 'PC',
  pageId: 'home',
  source: 'manual' | 'auto'
}
```

### warnings配列

```javascript
// 衝突警告
{
  type: 'collision',
  message: 'manual配置が衝突しています',
  widgetId: 'W001',
  collidesWithWidgetId: 'W002'
}

// 配置失敗
{
  type: 'placement_failed',
  message: '配置位置が見つかりません',
  widgetId: 'W003'
}
```

## CSS Gridへの反映

```javascript
// LayoutEngineの結果を使用
layoutResult.rects.forEach(rect => {
  const style = `grid-column: ${rect.x} / span ${rect.w}; grid-row: ${rect.y} / span ${rect.h};`;
  // ウィジェットDOMに適用
});
```

## ファイル構成

```
src/gas/lib/layout-engine.html
  - LayoutEngine オブジェクト
    - computeLayout(pageId, bp, config)
    - isManual(layout)
    - getColsForBp(page, bp)
    - normalizeRect(rect, cols)
    - findFirstFit(w, h, cols, placedRects)
    - collidesWithAny(rect, placedRects)
    - findCollision(rect, placedRects)
    - collides(a, b)
    - toGridStyle(rect)
    - logResult(result)
```

## テスト項目

- [x] homeページでmanual + autoが混在しても崩れず表示
- [x] BP切替（PC/TABLET/MOBILE）で独立に配置が変わる
- [x] 同じデータでリロードしても配置が変わらない（決定性）
- [x] manual衝突がある場合、画面は落ちずwarningsに出る
- [x] visible=FALSEのウィジェットは配置されない
- [x] w > cols の場合 w = cols にclamp
- [x] x + w が列数を超える場合、x を調整

## 座標系

```
列: 1   2   3   4   5   6   7   8   9  10  11  12
   ┌───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┬───┐
行1│   │   │   │   │   │   │   │   │   │   │   │   │
   ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
行2│   │   │   │   │   │   │   │   │   │   │   │   │
   ├───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┼───┤
行3│   │   │   │   │   │   │   │   │   │   │   │   │
   └───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┴───┘

例: x=1, y=1, w=3, h=2 のウィジェット
   ┌───────────────┬───┬───┬...
行1│  Widget A     │   │   │
   │  (1,1) 3x2    │   │   │
   ├───────────────┼───┼───┤
行2│               │   │   │
   └───────────────┴───┴───┴...
```

## 今後の拡張

1. **指示E**: 編集モード（ドラッグ＆リサイズ）
2. **指示F**: 保存API + 監査ログ
3. **将来**: z-index対応、pinned固定、より効率的なアルゴリズム

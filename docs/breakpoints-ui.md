# ブレイクポイント切替UI仕様

## 概要

BP（ブレイクポイント）切替機能は、PC / Tablet / Mobile の3つのプレビューモードを切り替え、各デバイス向けの表示をシミュレートします。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  ツールバー                                              │
│  ┌────────────────────┐  ┌───────────────────────────┐ │
│  │ ページタブ          │  │ BP切替ボタン              │ │
│  │ [home] [info] ...   │  │ [PC(12列)] [TABLET] [MOBILE] │
│  └────────────────────┘  └───────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                            │
                            ▼ switchBp(bp)
┌─────────────────────────────────────────────────────────┐
│  キャンバス（.canvas）                                   │
│  - max-width: BP別に変更                                │
│  - background-color: 01_ページ.背景色                    │
│  ┌─────────────────────────────────────────────────────┐│
│  │ ヘッダー画像（04_アセット参照）                       ││
│  └─────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────┐│
│  │ グリッドエリア（.canvas-grid）                        ││
│  │ grid-template-columns: repeat(N, 1fr)               ││
│  │ N = 01_ページの列数_PC / 列数_タブレット / 列数_モバイル ││
│  │                                                     ││
│  │ [Widget] [Widget] [Widget] ...                      ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

## データソース

### 01_ページシートから取得する値

| 列名 | 内部キー | 用途 |
|------|----------|------|
| 列数_PC* | cols.pc | PC表示時のグリッド列数 |
| 列数_タブレット* | cols.tablet | Tablet表示時のグリッド列数 |
| 列数_モバイル* | cols.mobile | Mobile表示時のグリッド列数 |
| 行高さ(px) | rowHeight | グリッド行の高さ（CSS変数） |
| 余白(px) | gap | グリッドのgap（CSS変数） |
| 背景色 | bgColor | キャンバスの背景色 |
| ヘッダーアセットID | headerAssetId | 04_アセットへの参照 |

### 04_アセットシートから取得する値

| 列名 | 内部キー | 用途 |
|------|----------|------|
| 参照元URL/ID* | url | ヘッダー画像のURL |
| 代替テキスト | altText | img要素のalt属性 |

## 状態管理

```javascript
const App = {
  config: { /* サーバーから取得 */ },
  state: {
    currentPageId: 'home',  // 現在表示中のページ
    currentBp: 'PC'         // PC | TABLET | MOBILE
  },
  breakpoints: ['PC', 'TABLET', 'MOBILE']
};
```

## 関数一覧

### renderBpSwitcher()
BP切替ボタンを描画。ボタンには現在の列数も表示。

### switchBp(bp)
BPを切り替えて再描画を実行。
- `App.state.currentBp` を更新
- `renderBpSwitcher()` - ボタンのactive状態更新
- `renderCanvas()` - キャンバス再描画
- `renderDebugPanel()` - デバッグ情報更新

### getColsForBp(page, bp)
指定BPの列数を取得。01_ページの値を返す。値がない場合はフォールバック。

```javascript
function getColsForBp(page, bp) {
  if (!page || !page.cols) {
    // フォールバック値
    return bp === 'PC' ? 12 : bp === 'TABLET' ? 8 : 4;
  }
  switch (bp) {
    case 'PC': return page.cols.pc || 12;
    case 'TABLET': return page.cols.tablet || 8;
    case 'MOBILE': return page.cols.mobile || 4;
    default: return 12;
  }
}
```

### renderCanvasHeader(page)
ヘッダー画像を描画。アセット参照が切れている場合は空文字を返す（エラーで落とさない）。

## CSS仕様

### キャンバス幅（BP別）

```css
.canvas.bp-pc     { max-width: 1200px; }
.canvas.bp-tablet { max-width: 768px; }
.canvas.bp-mobile { max-width: 375px; }
```

### グリッド設定（動的）

```css
.canvas-grid {
  display: grid;
  padding: var(--canvas-gap, 12px);
  gap: var(--canvas-gap, 12px);
  /* grid-template-columns はJS側で動的設定 */
}
```

JSから設定：
```javascript
// 列数はハードコードせず、必ず01_ページから取得
const cols = getColsForBp(page, App.state.currentBp);
gridElement.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
```

### CSS変数

| 変数名 | 取得元 | デフォルト |
|--------|--------|------------|
| --canvas-gap | 01_ページ.余白(px) | 12px |
| --row-height | 01_ページ.行高さ(px) | 72px |

## エラーハンドリング

### ページが見つからない場合
```javascript
if (!page) {
  canvas.innerHTML = '<div class="error">ページが見つかりません</div>';
  return;
}
```

### ヘッダーアセットが見つからない場合
```javascript
if (!asset || !asset.url) {
  console.warn('Header asset not found:', page.headerAssetId);
  return '';  // 空文字を返す（エラーで落とさない）
}
```

### 列数が未設定の場合
フォールバック値を使用（PC:12, Tablet:8, Mobile:4）

## テスト項目

- [ ] BP切替ボタンで列数が切り替わる
- [ ] PC: スプレッドシートの列数_PC値（テンプレ値=12）
- [ ] TABLET: スプレッドシートの列数_タブレット値（テンプレ値=8）
- [ ] MOBILE: スプレッドシートの列数_モバイル値（テンプレ値=4）
- [ ] 背景色が01_ページの背景色に従う
- [ ] ヘッダーアセットがある場合、画像が表示される
- [ ] ヘッダーアセットがない/参照切れの場合、エラーなく空になる
- [ ] 列数が未設定でもフォールバック値で動作する

## 今後の拡張（次の指示以降）

1. **指示C**: WidgetRenderer - type別描画（link/embed/image等）
2. **指示D**: LayoutEngine - 配置計算（manual優先、auto配置）
3. **指示E**: EditMode - ドラッグ&リサイズ

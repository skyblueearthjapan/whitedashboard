# Editor Mode（編集モード）仕様

## 概要

編集モードは、Editor権限を持つユーザーがウィジェットの配置（ドラッグ）とサイズ変更（リサイズ）を行うための機能です。
Phase2（編集体験）/ Phase3（衝突防止）/ Phase5（権限）/ Phase10（誤操作防止）に基づいて設計されています。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│ Code.gs                                                  │
│   checkIsEditor() → サーバ側でEditor権限を判定          │
│   isEditor をテンプレートに渡す                          │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ index.html                                               │
│   App.isEditor で権限判定                               │
│   Editor.init() で編集機能を初期化                      │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ editor/editor.html                                       │
│   ├── state管理（isEditMode, selectedWidgetId, etc.）  │
│   ├── ドラッグ処理（startDrag → onDrag → endDrag）     │
│   ├── リサイズ処理（startResize → onResize → endResize）│
│   └── draftRects管理（BP別に一時保存）                  │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ lib/grid-math.html          │ lib/collision.html         │
│   px↔grid座標変換           │   AABB衝突判定            │
│   clamp処理                 │   配置バリデーション       │
└─────────────────────────────────────────────────────────┘
```

## ファイル構成

```
src/gas/
├── Code.gs                 # checkIsEditor() を追加
├── lib/
│   ├── grid-math.html      # グリッド座標計算
│   └── collision.html      # 衝突判定（LayoutEngineと共有）
├── editor/
│   └── editor.html         # 編集モードメインロジック
└── index.html              # UI統合・CSS追加
```

## 権限チェック（Phase5）

### サーバ側判定（Code.gs）

```javascript
function checkIsEditor() {
  // 1. EDITOR_EMAILS プロパティにメールがあれば Editor
  // 2. スプレッドシートの編集権限があれば Editor
  // 3. スプレッドシートのオーナーなら Editor
  // 4. それ以外は Viewer（false）
}
```

### クライアント側ガード（index.html）

```javascript
if (App.isEditor) {
  document.getElementById('edit-mode-controls').style.display = 'flex';
  Editor.init();
}
```

## Editor状態管理

```javascript
Editor.state = {
  isEditMode: false,          // 編集モード中かどうか
  selectedWidgetId: null,     // 選択中のウィジェットID
  isDragging: false,          // ドラッグ中
  isResizing: false,          // リサイズ中
  dragStart: null,            // ドラッグ開始情報
  resizeStart: null,          // リサイズ開始情報
  draftRects: {               // BP別の一時配置
    PC: [...],
    TABLET: [...],
    MOBILE: [...]
  },
  hasUnsavedChanges: false    // 未保存フラグ
};
```

## ドラッグ操作

### フロー

1. **mousedown** on `.widget-header` → `startDrag()`
2. **mousemove** → `onDrag()` でプレビュー更新
3. **mouseup** → `endDrag()` で配置確定 or ロールバック

### 処理内容

```javascript
onDrag(e) {
  // マウス移動量をグリッド単位に変換
  const deltaX = Math.round((e.clientX - mouseX) / cellWidth);
  const deltaY = Math.round((e.clientY - mouseY) / cellHeight);

  // 新しい位置を計算（clamp処理含む）
  const newRect = GridMath.calcDragPosition(rect, deltaX, deltaY, cols);

  // 衝突チェック
  const validation = Collision.validatePlacement(newRect, rects, cols, widgetId);

  // プレビュー更新（衝突時は赤枠）
  updateDragPreview(widgetId, newRect, !validation.valid);
}
```

## リサイズ操作

### フロー

1. **mousedown** on `.resize-handle` → `startResize()`
2. **mousemove** → `onResize()` でプレビュー更新
3. **mouseup** → `endResize()` でサイズ確定 or ロールバック

### 処理内容

```javascript
onResize(e) {
  // マウス移動量をグリッド単位に変換
  const deltaW = Math.round((e.clientX - mouseX) / cellWidth);
  const deltaH = Math.round((e.clientY - mouseY) / cellHeight);

  // 新しいサイズを計算（最小1x1、列数超え防止）
  const newRect = GridMath.calcResizeSize(rect, deltaW, deltaH, cols);

  // 衝突チェック
  const validation = Collision.validatePlacement(newRect, rects, cols, widgetId);

  // プレビュー更新
  updateResizePreview(widgetId, newRect, !validation.valid);
}
```

## 衝突判定（Phase3）

### AABB（Axis-Aligned Bounding Box）

```javascript
Collision.collides(a, b) {
  // 2つの矩形が重なるかチェック
  // グリッド座標系（1始まり）
  // 例: a = {x:1, y:1, w:2, h:2} と b = {x:2, y:1, w:2, h:2} は衝突
}
```

### 配置バリデーション

```javascript
Collision.validatePlacement(rect, rects, cols, excludeId) {
  // 1. 範囲チェック（x >= 1, y >= 1, x+w-1 <= cols）
  // 2. 衝突チェック（他のウィジェットとの重なり）
  // 返値: { valid: boolean, reason: string }
}
```

## BP別draftRects管理

### 初期化

```javascript
enterEditMode() {
  const bp = App.state.currentBp;
  if (!this.state.draftRects[bp]) {
    // 現在のlayoutResult.rectsをコピー
    this.state.draftRects[bp] = this.cloneRects(App.state.layoutResult.rects);
  }
}
```

### BP切替時

```javascript
onBpChange(newBp) {
  if (!this.state.draftRects[newBp]) {
    // 新BPのレイアウトを計算してコピー
    const layoutResult = LayoutEngine.computeLayout(pageId, newBp, config);
    this.state.draftRects[newBp] = this.cloneRects(layoutResult.rects);
  }
  this.renderWithDraft();
}
```

## 誤操作防止（Phase10）

### ページ離脱時の確認

```javascript
window.addEventListener('beforeunload', (e) => {
  if (this.state.hasUnsavedChanges) {
    e.preventDefault();
    e.returnValue = '未保存の変更があります。';
  }
});
```

### 編集モード終了時の確認

```javascript
exitEditMode() {
  if (this.state.hasUnsavedChanges) {
    if (!confirm('未保存の変更があります。編集モードを終了しますか？')) {
      return;
    }
  }
  // ...
}
```

### リセット機能

```javascript
resetChanges() {
  if (!confirm('編集内容を破棄しますか？')) return;
  // 現在BPのdraftRectsを再計算で上書き
}
```

## CSS設計

### クラス命名

```
.edit-mode-controls     # 編集コントロールコンテナ
.edit-mode-toggle       # 編集モードトグルボタン
.edit-mode-reset        # リセットボタン
.unsaved-badge          # 未保存バッジ

.widget-editable        # 編集可能ウィジェット
.widget-selected        # 選択状態
.widget-edited          # 編集済み（●マーク）
.widget-invalid         # 無効配置（赤枠）

.resize-handle          # リサイズハンドル（右下）

.editor-toast           # トースト通知
.editor-toast-error     # エラートースト
.editor-toast-success   # 成功トースト
```

### 視覚的フィードバック

| 状態 | 表現 |
|------|------|
| 編集モード中 | キャンバスにオレンジ枠 |
| 選択中 | ウィジェットに青枠 |
| 編集済み | 右上にオレンジの●マーク |
| 無効配置 | 赤枠 + 半透明赤背景 |
| ドラッグ中 | cursor: grabbing |
| リサイズ中 | cursor: se-resize |

## トースト通知

```javascript
showToast(message, type) {
  // type: 'info' | 'error' | 'success'
  // 3秒で自動消去
}
```

使用例：
- 配置失敗時: `'配置できません: 他のウィジェットと衝突しています'`
- リセット時: `'編集内容をリセットしました'`

## 保存データ構造（指示Fで使用）

```javascript
Editor.getSaveData() {
  return {
    pageId: 'home',
    bp: 'PC',
    rects: [
      { widgetId: 'w001', x: 1, y: 1, w: 4, h: 2, source: 'manual', wasEdited: true },
      { widgetId: 'w002', x: 5, y: 1, w: 4, h: 2, source: 'manual' },
      ...
    ]
  };
}
```

## テスト項目

- [x] Viewer はツールバーに編集ボタンが表示されない
- [x] Editor はツールバーに編集ボタンが表示される
- [x] 編集モードON/OFF が切り替わる
- [x] ウィジェットをクリックで選択できる
- [x] 選択中は青枠が表示される
- [x] ヘッダー部分でドラッグできる
- [x] ドラッグ中はグリッドスナップする
- [x] 衝突すると赤枠になる
- [x] 衝突位置では配置できない（元に戻る）
- [x] 列数を超えた配置はできない
- [x] リサイズハンドルでサイズ変更できる
- [x] 編集後は「未保存」バッジが表示される
- [x] ページ離脱時に確認ダイアログが出る
- [x] BP切替時に各BPのdraftが維持される
- [x] リセットで編集内容が破棄される
- [x] Escで選択解除される

## 今後の拡張（指示F以降）

1. **保存機能**: draftRectsを03_レイアウトシートに書き戻す
2. **Undo/Redo**: 操作履歴管理
3. **複数選択**: Shift+クリックで複数ウィジェット選択
4. **キーボード操作**: 矢印キーで移動、Delete で削除
5. **コピー＆ペースト**: ウィジェットの複製

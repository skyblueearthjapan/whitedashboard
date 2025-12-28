# Phase 3：レイアウト計算仕様

（auto整列 / manual配置 / 端末別の崩れない配置）

## 1. このフェーズの目的

本フェーズの目的は、
**PC / Tablet / Mobile の各ブレイクポイントで、ウィジェットが自動的に崩れず整列するためのレイアウト計算ルール**を定義し、
実装者が同じ結果を再現できるようにすることである。

- `03_レイアウト.auto=TRUE` のウィジェットは、空いている場所へ自動配置される
- `03_レイアウト.auto=FALSE`（manual）のウィジェットは、指定座標に固定配置される
- pinned（固定）や衝突（重なり）などの例外条件も扱う

---

## 2. 重要な前提（Single Source of Truth）

レイアウトは以下のデータに基づく：

| データソース | 参照項目 |
|-------------|---------|
| 01_ページ | 列数（PC/Tablet/Mobile）、行高さ(px)、余白(px) |
| 02_ウィジェット | visible, order, type |
| 03_レイアウト | page_id, bp, x, y, w, h, auto, pinned, z_index |

---

## 3. 用語

| 用語 | 定義 |
|------|------|
| セル（マス） | グリッド上の最小単位（1列×1行） |
| 矩形（rect） | ウィジェットの占有範囲（x,y,w,h） |
| 占有（occupied） | セルが別ウィジェットの矩形に含まれている状態 |
| 衝突（collision） | 2つの矩形が重なる状態 |
| 配置エンジン（Layout Engine） | auto配置を計算するロジック |
| BP（breakpoint） | PC / TABLET / MOBILE |

---

## 4. レイアウトの優先順位（絶対ルール）

### 4.1 優先順位

1. **非表示（visible=FALSE）** は描画しない（配置計算から除外）
2. **manual配置（auto=FALSE かつ x/yあり）** を先に盤面へ置く
3. 次に **auto配置（auto=TRUE または x/y未指定）** を順に置く
4. `pinned=TRUE` は「移動不可」だが、配置優先は manual と同等扱いでよい
   （= pinned の auto は基本想定しない。もし存在する場合は manual 相当として扱う）

### 4.2 manualの定義

- `auto=FALSE` かつ `x` と `y` が数値で入っているもの
- x/y が欠けている場合は auto 扱い

---

## 5. グリッドと座標系

| 項目 | 範囲 |
|------|------|
| x | 1 〜 cols（列数） |
| y | 1 〜（理論上無制限。実装は必要に応じて行追加） |
| w | 1 〜 cols |
| h | 1 〜（任意） |

矩形の範囲：
- x..(x+w-1)
- y..(y+h-1)

### 5.1 画面外扱い

| 条件 | ルール |
|------|--------|
| x<1 や x>cols | 不正 |
| w が cols を超える | `w = cols` に丸める（clamp） |
| x+w-1 が cols を超える | `x = cols-w+1` に丸める（clamp） |

---

## 6. 衝突（collision）の扱い

### 6.1 manual同士の衝突

- 原則「データ不整合」として扱う
- 実装の挙動：
  - 最低限：ログ出力し、どちらかを警告表示
  - 推奨：後勝ちしない（不可視の重なりを作らない）
- 編集UIでは衝突を防止する（Phase2）

### 6.2 manual と auto の衝突

- manual が優先
- auto は空き場所へ再配置する

### 6.3 auto同士の衝突

- 自動配置の探索で衝突しない場所を見つける（後述）

---

## 7. auto整列の並び順（order）

auto配置する際の並び順は以下：

1. `02_ウィジェット.order` 昇順（小さいほど先）
2. 同じ order の場合は `widget_id` 昇順（安定化のため）

※ `03_レイアウト` に order 列は持たない（台帳の order を参照）

---

## 8. auto整列の探索戦略（最重要）

### 8.1 基本戦略：上から下、左から右

空き枠探索は、次の順序で行う：

1. y = 1 から増加
2. 各 y に対して x = 1 から増加
3. 「その(x,y)を左上として w×h を置けるか」を判定
4. 置けた最初の位置に確定

この探索は **決定的（deterministic）** であることが重要。

### 8.2 置ける判定（fits）

以下すべてを満たす場合に fits とする：

- x..x+w-1 が 1..cols に収まる
- 占有セル（occupied）と衝突しない

---

## 9. auto整列の入力値（w/h）

auto配置の w/h は `03_レイアウト.w/h` を使用する。

w/h が空欄の場合のデフォルト：

| 項目 | デフォルト値 |
|------|-------------|
| w | min(2, cols)（推奨） |
| h | 2（推奨） |

※ デフォルト値は実装側定数で持つ

---

## 10. 盤面（occupied grid）の管理

### 10.1 推奨データ構造

- occupied を boolean の2Dとして持つと大きくなりやすい
- 推奨：矩形リストで管理し、衝突判定を矩形同士で行う
  - rect(A) と rect(B) が重なるかを判定する

### 10.2 矩形の衝突判定（典型）

以下のいずれかに該当すれば **衝突しない**：
- Aの右端 < Bの左端
- Aの左端 > Bの右端
- Aの下端 < Bの上端
- Aの上端 > Bの下端

それ以外は **衝突**

---

## 11. BP（PC/Tablet/Mobile）間の関係

### 11.1 原則

BPごとに独立して配置を持つ。

- PCの配置をそのままMobileに流用しない
- ただし初期導入やページ追加時は「基準BPから複製」することを推奨

### 11.2 複製ルール（推奨）

- 新しいページが作られた時：
  - PCレイアウトを作成 → Tabletへ縮約 → Mobileへ縦並び
- ただし Phase3では「複製の詳細アルゴリズム」は必須ではない
  （最小は各BPでauto整列を実行すれば成立）

---

## 12. 保存仕様（autoが座標を埋めるタイミング）

### 12.1 表示時の計算

表示時に auto配置を計算し、UI上は確定位置で表示する。

### 12.2 永続化（スプレッドシート反映）

永続化の方針は2案：

| 案 | 内容 | 推奨 |
|----|------|------|
| 案A | **保存ボタン押下時に座標をシートへ書き戻す** - auto=TRUEでも x/y を埋めて保存してよい。次回は同じ配置を再現できる | ✅ 推奨 |
| 案B | 表示ごとに再計算し、シートには書かない - 変更が安定しない可能性があるため非推奨 | ❌ |

本プロジェクトでは **案A（保存時書き戻し）を推奨**する。

---

## 13. 例外処理（置けない場合）

### 13.1 置けない原因

- cols に対して w が大きすぎる（clampで解決）
- occupied が多く、探索範囲が不足

### 13.2 対応

- 探索の y 上限を決めず、必要に応じて下へ伸ばす（縦スクロール）
- それでも置けないは基本発生しない想定
- もし発生した場合：
  - ウィジェットを「未配置」扱いにして編集者へ警告表示

---

## 14. 擬似コード（Reference）

以下は説明用の擬似コード。実装言語は問わない。

```pseudo
function computeLayout(page_id, bp):
  cols = getCols(page_id, bp)
  widgets = getVisibleWidgetsForPage(page_id)
  layoutRows = getLayoutRows(page_id, bp)  // from 03_レイアウト

  // 1) split manual vs auto
  manual = []
  autos  = []
  for w in widgets:
    r = layoutRows[w.id] (if exists)
    if r.auto == FALSE and r.x != null and r.y != null:
      manual.add( normalizeRect(r, cols) )
    else:
      autos.add( normalizeRect(r, cols, defaults) )

  // 2) place manual first
  placed = []
  for rect in manual:
    if collidesAny(rect, placed):
      error("manual collision", rect)
      // choose policy: reject or warn
      // recommended: keep but mark as invalid
    placed.add(rect)

  // 3) sort autos by order then id
  autos.sortBy(widget.order asc, widget.id asc)

  // 4) place autos by scanning
  for rect in autos:
    pos = findFirstFit(rect.w, rect.h, cols, placed)
    rect.x = pos.x
    rect.y = pos.y
    placed.add(rect)

  return placed


function findFirstFit(w, h, cols, placed):
  y = 1
  while true:
    for x in 1..(cols - w + 1):
      candidate = Rect(x,y,w,h)
      if not collidesAny(candidate, placed):
        return candidate
    y = y + 1
```

---

## 15. Phase 3 完了条件（Definition of Done）

- manual / auto の優先順位が明文化されている
- auto整列の探索戦略が決定的に定義されている
- BP間の独立性と複製ルールが明確である
- 実装者がこのドキュメントだけでレイアウトエンジンを実装できる

---

## 16. 次フェーズ予告（参考）

- Phase 4：埋め込み詳細（AppSheet/GAS/自作Webのガイドライン）

※ 本ドキュメントでは詳細化しない

# WidgetRenderer 仕様

## 概要

WidgetRendererは、02_ウィジェットの `type` に応じてウィジェットを描画するモジュール群です。
Phase2（Widget仕様）/ Phase4（埋め込み）/ Phase5（安全配慮）/ Phase6（責務分割）に基づいて設計されています。

## アーキテクチャ

```
WidgetRenderer.render(widget, config)
       │
       ├─ type='link'   → LinkWidget.render()
       ├─ type='embed'  → EmbedWidget.render()
       ├─ type='image'  → ImageWidget.render()
       ├─ type='pdf'    → PdfWidget.render()
       ├─ type='sheet'  → SheetWidget.render()
       ├─ type='html'   → HtmlWidget.render()
       ├─ type='divider'→ renderDivider()
       └─ その他        → renderUnsupported()
```

## ファイル構成

```
src/gas/
├── lib/
│   └── ref-resolver.html    # REF:HTML / REF:ASSET 参照解決
├── widgets/
│   ├── renderer.html        # type分岐の入口
│   ├── link.html            # リンクウィジェット
│   ├── embed.html           # 埋め込みウィジェット
│   ├── image.html           # 画像ウィジェット
│   ├── pdf.html             # PDFウィジェット
│   ├── sheet.html           # シートウィジェット
│   └── html-widget.html     # HTMLウィジェット
└── index.html               # 統合（include使用）
```

## 参照解決（RefResolver）

### 対応パターン

| パターン | 例 | 解決先 |
|----------|-----|--------|
| URL直指定 | `https://example.com` | そのまま使用 |
| HTML参照 | `REF:HTML_notice001` | 06_HTML本文から取得 |
| アセット参照 | `REF:ASSET_logo01` | 04_アセットから取得 |

### 使用例

```javascript
const resolved = RefResolver.resolve(widget.urlOrRef, config);

// resolved の構造
{
  type: 'url' | 'html' | 'asset' | 'error',
  value: string,       // URL or 本文 or エラーメッセージ
  error: string,       // エラー時のみ
  raw: Object          // 元データ（html/asset時）
}
```

## ウィジェット種別

### link（リンク）

- カード表示（タイトル＋アイコン）
- クリックで url_or_ref を開く
- `openMode` に従う：
  - `same_tab`: 同一タブ
  - `new_tab`: 別タブ（target="_blank"）

### embed（埋め込み）

- `embedMode` による分岐：
  - `link_fallback`: リンク表示のみ（iframe不使用）
  - その他: iframe埋め込み + 「別タブで開く」導線

**重要**: iframe埋め込み不可は必ず起こる前提。常に別タブ導線を表示。

### image（画像）

- URLまたはアセット参照で画像表示
- 読み込み失敗時はプレースホルダ表示（onerror）
- `loading="lazy"` で遅延読み込み

### pdf（PDF）

- 初期実装: リンクカード表示
- アイコン + 「PDFを開く」ボタン
- 将来拡張: Google Drive Viewer埋め込み

### sheet（スプレッドシート）

- 初期実装: リンクカード表示
- アイコン + 「シートを開く」ボタン
- 将来拡張: 公開シート埋め込み

### html（HTML）

- `REF:HTML_xxx` で06_HTML本文から取得
- `format` による分岐：
  - `html`: 直接埋め込み（**XSSリスクあり**）
  - `markdown`: プレーンテキスト表示（将来MD変換）
- URL指定時はiframe表示

**警告**: 生HTML埋め込みはXSSリスクがあるため、信頼できるソースからのみ使用すること。将来的にDOMPurify等によるサニタイズが必要。

### divider（区切り）

- 水平線のみ表示
- 最小高さで描画

### 未対応type

- 警告表示（「未対応のウィジェット種別: xxx」）
- 画面は落とさない

## 共通ヘッダー

全ウィジェットに共通のヘッダー部分：

```html
<div class="widget-header">
  <img class="widget-icon" src="...">  <!-- アイコンアセット（あれば） -->
  <span class="widget-title">タイトル</span>
</div>
```

## エラーハンドリング

### 参照切れ

```javascript
// RefResolver.resolve が error を返す場合
if (resolved.type === 'error') {
  return WidgetRenderer.renderError(resolved.error);
}
```

### URL空

```javascript
if (!url) {
  return WidgetRenderer.renderError('URLが設定されていません');
}
```

### 画像読み込み失敗

```html
<img onerror="this.parentElement.innerHTML='<div class=\\'widget-image-placeholder\\'>画像を読み込めません</div>';">
```

## CSS設計

### クラス命名規則

```
.widget-card              # 全ウィジェット共通
.widget-{type}            # type固有（例: .widget-link）
.widget-{type}-{element}  # type内要素（例: .widget-link-url）
.widget-clickable         # クリック可能
.widget-error             # エラー表示
.widget-external-link     # 外部リンクボタン
```

### 色設計

| type | プライマリカラー |
|------|-----------------|
| link | #1a73e8（青） |
| embed | #1a73e8（青） |
| pdf | #ea4335（赤） |
| sheet | #34a853（緑） |
| html | #333（黒） |

## データソース

### 02_ウィジェット（config.widgets）

| 列 | 内部キー | 用途 |
|----|----------|------|
| ウィジェットID* | widgetId | 一意識別子 |
| タイトル* | title | 表示タイトル |
| 種別* | type | 描画分岐に使用 |
| URL/参照 | urlOrRef | URL or REF:xxx |
| アイコンアセットID | iconAssetId | 04_アセット参照 |
| 開き方 | openMode | same_tab / new_tab |
| 埋め込み方式 | embedMode | link_fallback / embed |
| 表示* | visible | TRUE/FALSE |

### 04_アセット（config.assets）

| 列 | 内部キー | 用途 |
|----|----------|------|
| アセットID* | assetId | REF:ASSET_xxx で参照 |
| 参照元URL/ID* | url | 画像URL等 |
| 代替テキスト | altText | img alt属性 |

### 06_HTML本文（config.htmlContent）

| 列 | 内部キー | 用途 |
|----|----------|------|
| 本文ID* | contentId | REF:HTML_xxx で参照 |
| 形式* | format | html / markdown |
| 本文* | body | HTML/Markdown本文 |

## テスト項目

- [x] visible=TRUE のウィジェットがカードとして表示される
- [x] visible=FALSE のウィジェットは表示されない
- [x] link はクリックで正しく開く（same_tab/new_tab）
- [x] embed は「別タブで開く」導線がある
- [x] embed（link_fallback）はリンクのみ表示
- [x] image は画像を表示、エラー時プレースホルダ
- [x] pdf/sheet は「開く」ボタンがある
- [x] html は REF:HTML 参照で本文表示
- [x] 参照切れでも画面が落ちない
- [x] URL空でも画面が落ちない
- [x] 未対応type でも警告表示で落ちない

## 今後の拡張

1. **Markdown変換**: marked.js等でformat=markdown対応
2. **XSSサニタイズ**: DOMPurifyでHTML本文をサニタイズ
3. **PDF埋め込み**: Google Drive Viewer連携
4. **Sheet埋め込み**: 公開スプレッドシートiframe
5. **text/divider**: 完全実装

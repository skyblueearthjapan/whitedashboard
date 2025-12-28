# Deep Link（修正導線）仕様

## 概要

管理画面トップの警告一覧から、該当する編集画面へ直接ジャンプできる機能です。URLパラメータで初期選択対象を指定し、1クリックで修正画面を開けます。

**今回のゴール**: 警告を見たら、その場で修正画面へ飛べる状態。

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────────┐
│ admin.html（警告一覧）                                        │
│   renderFixLinks(error)                                      │
│     → エラー種別に応じたDeep Linkを生成                        │
│     → [ウィジェット修正] [アセット確認] ...                    │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 各管理画面                                                   │
│   ?view=admin_widgets&widget_id=W001                         │
│   ?view=admin_pages&page_id=home                             │
│   ?view=admin_assets&asset_id=ASSET_001                      │
│   ?view=admin_html&content_id=HTML_001                       │
│   ?view=admin_audit&action=save_layout&page_id=home          │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 各画面のhandleDeepLink()                                     │
│   1. URLパラメータを解析                                      │
│   2. 該当IDを検索                                             │
│   3. 見つかれば自動選択＋詳細フォーム表示                       │
│   4. 見つからなければトースト表示（画面は落とさない）           │
└─────────────────────────────────────────────────────────────┘
```

## URLパラメータ仕様

### ウィジェット管理（admin_widgets）

```
?view=admin_widgets&widget_id=W001
```

| パラメータ | 説明 |
|-----------|------|
| widget_id | 選択するウィジェットID |

### ページ管理（admin_pages）

```
?view=admin_pages&page_id=home
```

| パラメータ | 説明 |
|-----------|------|
| page_id | 選択するページID |

### アセット管理（admin_assets）

```
?view=admin_assets&asset_id=ASSET_001
```

| パラメータ | 説明 |
|-----------|------|
| asset_id | 選択するアセットID |

### HTML本文管理（admin_html）

```
?view=admin_html&content_id=HTML_001
```

| パラメータ | 説明 |
|-----------|------|
| content_id | 選択する本文ID |

### 監査ログ（admin_audit）

```
?view=admin_audit&action=save_layout&page_id=home
```

| パラメータ | 説明 |
|-----------|------|
| action | アクション種別フィルタ |
| page_id | ページIDフィルタ |
| actor | 操作者フィルタ |
| result | 結果フィルタ（ok/failed） |

## 警告種別と遷移先マッピング

### ID重複

| エラー種別 | 遷移先 | パラメータ |
|-----------|--------|-----------|
| duplicate_page_id | ページ管理 | page_id |
| duplicate_widget_id | ウィジェット管理 | widget_id |
| duplicate_asset_id | アセット管理 | asset_id |
| duplicate_content_id | HTML本文管理 | content_id |

### 参照切れ

| エラー種別 | 主リンク | 副リンク |
|-----------|---------|---------|
| broken_html_ref | ウィジェット修正 (widget_id) | HTML本文確認 (content_id) |
| broken_icon_ref | ウィジェット修正 (widget_id) | アセット確認 (asset_id) |
| broken_asset_ref | ウィジェット修正 (widget_id) | アセット確認 (asset_id) |
| broken_header_ref | ページ修正 (page_id) | アセット確認 (asset_id) |

### URL/レイアウト問題

| エラー種別 | 遷移先 | 備考 |
|-----------|--------|------|
| missing_url | ウィジェット修正 | URL設定が必要 |
| orphan_layout | ウィジェット管理 | 監査ログへのリンクも表示 |
| no_layout | ウィジェット修正 | レイアウト設定が必要 |

### 配置衝突

| エラー種別 | 遷移先 |
|-----------|--------|
| manual_collision | ページ確認 + 各ウィジェット修正 |

## 実装詳細

### admin.htmlのgetFixLinks関数

```javascript
function getFixLinks(e) {
  const links = [];

  switch (e.type) {
    case 'duplicate_widget_id':
      if (e.id) links.push({
        url: '?view=admin_widgets&widget_id=' + encodeURIComponent(e.id),
        label: 'ウィジェット管理'
      });
      break;
    // ... 他のケース
  }

  return links;
}
```

### 各管理画面のhandleDeepLink関数

```javascript
handleDeepLink: function() {
  const params = new URLSearchParams(window.location.search);
  const widgetId = params.get('widget_id');

  if (widgetId) {
    const widget = this.widgets.find(w => w.widgetId === widgetId);
    if (widget) {
      this.selectWidget(widgetId);
    } else {
      this.showToast('ウィジェット "' + widgetId + '" が見つかりません', 'warning');
    }
  }
}
```

## UI表現

### 修正リンクのスタイル

```css
.fix-link {
  padding: 4px 10px;
  font-size: 11px;
  color: #1a73e8;
  background: #e8f0fe;
  border-radius: 4px;
}

.fix-link.secondary {
  color: #666;
  background: #f0f0f0;
}
```

### 表示例

警告一覧の各項目に以下のようなリンクが表示されます：

```
[!] HTML参照切れ
    ウィジェット "W001" が参照する HTML_notice が見つかりません
    ウィジェット: W001 / 参照: HTML_notice
    [ウィジェット修正] [HTML本文確認]
```

## エラーハンドリング

### 該当IDが見つからない場合

- 画面は落とさない
- トースト通知で「○○ が見つかりません」と表示
- 一覧は通常通り表示

### 権限チェック

- Deep Linkで直接アクセスしてもEditor権限がなければ拒否
- サーバ側（Code.gs）でcheckIsEditor()を実行

## Done基準

- [x] adminトップの警告一覧から「修正する」で該当管理画面へ遷移できる
- [x] 遷移先で該当IDが自動選択され、編集フォームが開く
- [x] 参照切れは参照元/参照先の両方へ飛べる
- [x] 該当IDが無くても画面が落ちない（見つからない表示）
- [x] Viewerはdeep linkで入っても拒否される
- [x] 棚卸セクションからもウィジェット管理へジャンプできる

## 対応ファイル

| ファイル | 変更内容 |
|---------|---------|
| admin.html | getFixLinks(), renderFixLinks(), CSSスタイル追加 |
| admin-widgets.html | handleDeepLink() 追加 |
| admin-pages.html | handleDeepLink() 追加 |
| admin-assets.html | handleDeepLink() 追加 |
| admin-html.html | handleDeepLink() 追加 |
| admin-audit.html | 既存のparseUrlParams()で対応済み |

## 今後の拡張

### Phase2

- [ ] 複数ID同時指定（widget_id=W001,W002）
- [ ] ブレークポイント（bp）パラメータ対応
- [ ] 戻るボタンでadminトップに戻る導線

### Phase3

- [ ] 問題箇所のハイライト表示
- [ ] 修正ウィザード（ステップ形式の修正ガイド）

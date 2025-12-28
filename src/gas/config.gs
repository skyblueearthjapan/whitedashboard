/**
 * config.gs - 設定データの統合・正規化
 *
 * 各シートから取得したデータを統合し、
 * アプリケーションで使いやすい形に整形する。
 */

/**
 * 全設定を統合したconfigオブジェクトを取得
 * @param {string} [pageId] - 特定ページのみ取得する場合（省略時は全体）
 * @returns {Object} - 統合されたconfig
 */
function getConfig(pageId) {
  try {
    const raw = readAllSheets();

    const config = {
      pages: buildPages(raw.pages),
      widgets: buildWidgets(raw.widgets),
      layout: buildLayout(raw.layout),
      assets: buildAssets(raw.assets),
      htmlContent: buildHtmlContent(raw.htmlContent),
      meta: {
        loadedAt: new Date().toISOString(),
        counts: {
          pages: raw.pages.length,
          widgets: raw.widgets.length,
          layout: raw.layout.length,
          assets: raw.assets.length,
          htmlContent: raw.htmlContent.length
        }
      }
    };

    // 特定ページのフィルタリング
    if (pageId) {
      config.widgets = config.widgets.filter(w => w.defaultPage === pageId);
      config.layout = config.layout.filter(l => l.pageId === pageId);
    }

    Logger.log('Config built successfully: ' + JSON.stringify(config.meta.counts));
    return config;

  } catch (e) {
    Logger.log('Error building config: ' + e.message);
    throw new Error('設定の読み込みに失敗しました: ' + e.message);
  }
}

/**
 * ページデータを整形
 * @param {Array} rawPages
 * @returns {Array}
 */
function buildPages(rawPages) {
  return rawPages.map(p => ({
    pageId: p.page_id || '',
    pageTitle: p.page_title || '',
    displayOrder: p.display_order || 0,
    layoutMode: p.layout_mode || 'auto',
    cols: {
      pc: p.cols_pc || 12,
      tablet: p.cols_tablet || 8,
      mobile: p.cols_mobile || 4
    },
    rowHeight: p.row_height || 72,
    gap: p.gap || 12,
    bgColor: p.bg_color || '#FFFFFF',
    headerAssetId: p.header_asset_id || null,
    memo: p.memo || ''
  })).sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * ウィジェットデータを整形
 * @param {Array} rawWidgets
 * @returns {Array}
 */
function buildWidgets(rawWidgets) {
  return rawWidgets.map(w => ({
    widgetId: w.widget_id || '',
    title: w.title || '',
    type: w.type || 'link',
    defaultPage: w.default_page || 'home',
    audience: w.audience || 'all',
    urlOrRef: w.url_or_ref || '',
    iconAssetId: w.icon_asset_id || null,
    openMode: w.open_mode || 'same_tab',
    embedMode: w.embed_mode || 'link_fallback',
    visible: w.visible !== false, // デフォルトtrue
    owner: w.owner || '',
    reviewCycle: w.review_cycle || 'none'
  })).filter(w => w.widgetId); // IDがないものは除外
}

/**
 * レイアウトデータを整形
 * @param {Array} rawLayout
 * @returns {Array}
 */
function buildLayout(rawLayout) {
  return rawLayout.map(l => ({
    widgetId: l.widget_id || '',
    pageId: l.page_id || '',
    breakpoint: (l.breakpoint || 'PC').toUpperCase(),
    x: l.x || null,
    y: l.y || null,
    w: l.w || 2,
    h: l.h || 2,
    auto: l.auto !== false, // デフォルトtrue
    pinned: l.pinned === true,
    zIndex: l.z_index || 0
  })).filter(l => l.widgetId && l.pageId);
}

/**
 * アセットデータを整形（ID→オブジェクトのMap）
 * @param {Array} rawAssets
 * @returns {Object} - { assetId: assetObject }
 */
function buildAssets(rawAssets) {
  const map = {};
  rawAssets.forEach(a => {
    if (a.asset_id) {
      map[a.asset_id] = {
        assetId: a.asset_id,
        assetType: a.asset_type || 'image',
        url: a.url || '',
        altText: a.alt_text || '',
        owner: a.owner || '',
        updatedAt: a.updated_at || null,
        memo: a.memo || ''
      };
    }
  });
  return map;
}

/**
 * HTML本文データを整形（ID→オブジェクトのMap）
 * @param {Array} rawHtml
 * @returns {Object} - { contentId: contentObject }
 */
function buildHtmlContent(rawHtml) {
  const map = {};
  rawHtml.forEach(h => {
    if (h.content_id) {
      map[h.content_id] = {
        contentId: h.content_id,
        format: h.format || 'markdown',
        body: h.body || '',
        owner: h.owner || '',
        updatedAt: h.updated_at || null,
        memo: h.memo || ''
      };
    }
  });
  return map;
}

/**
 * 特定ページの設定を取得
 * @param {string} pageId
 * @returns {Object|null}
 */
function getPageConfig(pageId) {
  const config = getConfig();
  const page = config.pages.find(p => p.pageId === pageId);

  if (!page) {
    Logger.log('Page not found: ' + pageId);
    return null;
  }

  return {
    page: page,
    widgets: config.widgets.filter(w => w.defaultPage === pageId && w.visible),
    layout: config.layout.filter(l => l.pageId === pageId),
    assets: config.assets,
    htmlContent: config.htmlContent
  };
}

/**
 * homeページの設定を取得（デフォルト）
 * @returns {Object}
 */
function getHomeConfig() {
  return getPageConfig('home');
}

/**
 * JSON文字列として設定を返す（HTMLServiceからの呼び出し用）
 * @param {string} [pageId]
 * @returns {string}
 */
function getConfigJson(pageId) {
  try {
    const config = pageId ? getPageConfig(pageId) : getConfig();
    return JSON.stringify(config);
  } catch (e) {
    Logger.log('Error in getConfigJson: ' + e.message);
    return JSON.stringify({ error: e.message });
  }
}

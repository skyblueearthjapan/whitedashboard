/**
 * Code.gs - メインエントリポイント
 *
 * ホワイトボード型 社内ポータルダッシュボード
 * GAS + HTMLService 版
 */

/**
 * Webアプリケーションのエントリポイント
 * @param {Object} e - イベントオブジェクト
 * @returns {HtmlOutput}
 */
function doGet(e) {
  try {
    // パラメータからページIDを取得（デフォルト: home）
    const pageId = (e && e.parameter && e.parameter.page) || 'home';

    Logger.log('doGet called: pageId=' + pageId);

    // HTMLテンプレートを読み込み
    const template = HtmlService.createTemplateFromFile('index');

    // テンプレートに渡すデータ
    template.pageId = pageId;

    // 設定データを取得してテンプレートに渡す
    const config = getConfig();
    template.configJson = JSON.stringify(config);

    // HTMLを生成
    const output = template.evaluate()
      .setTitle('ポータルダッシュボード')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');

    return output;

  } catch (error) {
    Logger.log('doGet error: ' + error.message);
    return HtmlService.createHtmlOutput(
      '<html><body><h1>エラー</h1><p>' + error.message + '</p></body></html>'
    );
  }
}

/**
 * HTMLファイルをインクルードするためのヘルパー
 * @param {string} filename - ファイル名（.html拡張子なし）
 * @returns {string}
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * クライアントサイドから設定を取得
 * @param {string} [pageId] - ページID（省略時は全体）
 * @returns {Object}
 */
function fetchConfig(pageId) {
  try {
    if (pageId) {
      return getPageConfig(pageId);
    }
    return getConfig();
  } catch (e) {
    Logger.log('fetchConfig error: ' + e.message);
    return { error: e.message };
  }
}

/**
 * 動作確認用：設定の件数をログ出力
 */
function testConfig() {
  try {
    const config = getConfig();
    Logger.log('=== Config Test ===');
    Logger.log('Pages: ' + config.pages.length);
    Logger.log('Widgets: ' + config.widgets.length);
    Logger.log('Layout: ' + config.layout.length);
    Logger.log('Assets: ' + Object.keys(config.assets).length);
    Logger.log('HtmlContent: ' + Object.keys(config.htmlContent).length);

    // 各ページの情報
    config.pages.forEach(p => {
      Logger.log('Page: ' + p.pageId + ' - ' + p.pageTitle);
    });

    // 各ウィジェットの情報
    config.widgets.forEach(w => {
      Logger.log('Widget: ' + w.widgetId + ' - ' + w.title + ' [' + w.type + ']');
    });

    return config.meta;
  } catch (e) {
    Logger.log('testConfig error: ' + e.message);
    return { error: e.message };
  }
}

/**
 * 初期セットアップ：スプレッドシートIDをプロパティに設定
 * @param {string} spreadsheetId
 */
function setSpreadsheetId(spreadsheetId) {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', spreadsheetId);
  Logger.log('SPREADSHEET_ID set to: ' + spreadsheetId);
}

/**
 * 現在のスプレッドシートIDを取得
 * @returns {string}
 */
function getSpreadsheetIdFromProperties() {
  return PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '(not set)';
}

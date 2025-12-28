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
    // パラメータ取得
    const view = (e && e.parameter && e.parameter.view) || 'portal';
    const pageId = (e && e.parameter && e.parameter.page) || 'home';

    Logger.log('doGet called: view=' + view + ', pageId=' + pageId);

    // Editor権限チェック（サーバ側で判定）
    const isEditor = checkIsEditor();
    Logger.log('isEditor: ' + isEditor);

    // view分岐
    if (view === 'admin') {
      return renderAdminView(isEditor);
    }
    if (view === 'admin_widgets') {
      return renderAdminWidgetsView(isEditor);
    }

    // 通常のポータル画面
    return renderPortalView(pageId, isEditor);

  } catch (error) {
    Logger.log('doGet error: ' + error.message);
    return HtmlService.createHtmlOutput(
      '<html><body><h1>エラー</h1><p>' + error.message + '</p></body></html>'
    );
  }
}

/**
 * ポータル画面を描画
 * @param {string} pageId
 * @param {boolean} isEditor
 * @returns {HtmlOutput}
 */
function renderPortalView(pageId, isEditor) {
  // HTMLテンプレートを読み込み
  const template = HtmlService.createTemplateFromFile('index');

  // テンプレートに渡すデータ
  template.pageId = pageId;
  template.isEditor = isEditor;

  // 設定データを取得してテンプレートに渡す
  const config = getConfig();
  template.configJson = JSON.stringify(config);

  // HTMLを生成
  const output = template.evaluate()
    .setTitle('ポータルダッシュボード')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  return output;
}

/**
 * 管理画面を描画
 * @param {boolean} isEditor
 * @returns {HtmlOutput}
 */
function renderAdminView(isEditor) {
  // Editorでない場合はアクセス拒否
  if (!isEditor) {
    return HtmlService.createHtmlOutput(
      '<html><body style="font-family: sans-serif; padding: 40px; text-align: center;">' +
      '<h1>アクセス権限がありません</h1>' +
      '<p>この画面はEditor権限が必要です。</p>' +
      '<p><a href="?view=portal">ポータルへ戻る</a></p>' +
      '</body></html>'
    ).setTitle('アクセス拒否');
  }

  // HTMLテンプレートを読み込み
  const template = HtmlService.createTemplateFromFile('admin');

  // 設定データを取得
  const config = getConfig();
  template.configJson = JSON.stringify(config);

  // HTMLを生成
  const output = template.evaluate()
    .setTitle('管理画面 - ポータルダッシュボード')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  return output;
}

/**
 * ウィジェット管理画面を描画
 * @param {boolean} isEditor
 * @returns {HtmlOutput}
 */
function renderAdminWidgetsView(isEditor) {
  // Editorでない場合はアクセス拒否
  if (!isEditor) {
    return HtmlService.createHtmlOutput(
      '<html><body style="font-family: sans-serif; padding: 40px; text-align: center;">' +
      '<h1>アクセス権限がありません</h1>' +
      '<p>この画面はEditor権限が必要です。</p>' +
      '<p><a href="?view=portal">ポータルへ戻る</a></p>' +
      '</body></html>'
    ).setTitle('アクセス拒否');
  }

  // HTMLテンプレートを読み込み
  const template = HtmlService.createTemplateFromFile('admin-widgets');

  // 設定データを取得
  const config = getConfig();
  template.configJson = JSON.stringify(config);

  // HTMLを生成
  const output = template.evaluate()
    .setTitle('ウィジェット管理 - ポータルダッシュボード')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');

  return output;
}

/**
 * Editor権限チェック
 * Phase5準拠：サーバ側でユーザー権限を判定
 *
 * 判定ロジック（優先順）：
 * 1. スクリプトプロパティの EDITOR_EMAILS にメールがあれば Editor
 * 2. スプレッドシートの編集権限があれば Editor
 * 3. それ以外は Viewer
 *
 * @returns {boolean}
 */
function checkIsEditor() {
  try {
    // 現在のユーザーを取得
    const user = Session.getActiveUser();
    const email = user.getEmail();

    // メールが取得できない場合（匿名アクセス等）はViewer
    if (!email) {
      Logger.log('checkIsEditor: No email, returning false');
      return false;
    }

    // 1. EDITOR_EMAILS プロパティをチェック（カンマ区切り）
    const editorEmails = PropertiesService.getScriptProperties().getProperty('EDITOR_EMAILS') || '';
    if (editorEmails) {
      const emailList = editorEmails.split(',').map(e => e.trim().toLowerCase());
      if (emailList.includes(email.toLowerCase())) {
        Logger.log('checkIsEditor: Found in EDITOR_EMAILS');
        return true;
      }
    }

    // 2. スプレッドシートの編集権限をチェック
    const ss = getSpreadsheet();
    if (ss) {
      const editors = ss.getEditors();
      const editorEmails2 = editors.map(e => e.getEmail().toLowerCase());
      if (editorEmails2.includes(email.toLowerCase())) {
        Logger.log('checkIsEditor: Has spreadsheet edit permission');
        return true;
      }

      // オーナーもEditor
      const owner = ss.getOwner();
      if (owner && owner.getEmail().toLowerCase() === email.toLowerCase()) {
        Logger.log('checkIsEditor: Is spreadsheet owner');
        return true;
      }
    }

    Logger.log('checkIsEditor: Not an editor, email=' + email);
    return false;

  } catch (e) {
    // エラー時はViewer扱い（安全側に倒す）
    Logger.log('checkIsEditor error: ' + e.message);
    return false;
  }
}

/**
 * Editor権限を持つメールアドレスを追加
 * @param {string} email
 */
function addEditorEmail(email) {
  const current = PropertiesService.getScriptProperties().getProperty('EDITOR_EMAILS') || '';
  const emails = current ? current.split(',').map(e => e.trim()) : [];
  if (!emails.includes(email.trim())) {
    emails.push(email.trim());
    PropertiesService.getScriptProperties().setProperty('EDITOR_EMAILS', emails.join(','));
    Logger.log('Added editor email: ' + email);
  }
}

/**
 * 現在のEditor権限メールリストを取得
 * @returns {string[]}
 */
function getEditorEmails() {
  const current = PropertiesService.getScriptProperties().getProperty('EDITOR_EMAILS') || '';
  return current ? current.split(',').map(e => e.trim()) : [];
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

/**
 * sheets.gs - スプレッドシート読み取り基盤
 *
 * 設計DB（スプレッドシート）からデータを取得する基盤モジュール。
 * 列名は日本語テンプレを厳守。
 */

// スプレッドシートID（デプロイ時に設定）
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';

// シート名定義（日本語名を厳守）
const SHEET_NAMES = {
  PAGES: '01_ページ',
  WIDGETS: '02_ウィジェット',
  LAYOUT: '03_レイアウト',
  ASSETS: '04_アセット',
  HTML_CONTENT: '06_HTML本文'
};

// 列名マッピング（日本語 → 内部キー）
const COLUMN_MAPPINGS = {
  // 01_ページ
  'ページID*': 'page_id',
  'ページタイトル*': 'page_title',
  '表示順': 'display_order',
  'レイアウトモード*': 'layout_mode',
  '列数_PC*': 'cols_pc',
  '列数_タブレット*': 'cols_tablet',
  '列数_モバイル*': 'cols_mobile',
  '行高さ(px)': 'row_height',
  '余白(px)': 'gap',
  '背景色': 'bg_color',
  'ヘッダーアセットID': 'header_asset_id',
  'メモ': 'memo',

  // 02_ウィジェット
  'ウィジェットID*': 'widget_id',
  'タイトル*': 'title',
  '種別*': 'type',
  '既定ページ': 'default_page',
  '対象': 'audience',
  'URL/参照': 'url_or_ref',
  'アイコンアセットID': 'icon_asset_id',
  '開き方': 'open_mode',
  '埋め込み方式': 'embed_mode',
  '表示*': 'visible',
  '管理者': 'owner',
  '棚卸周期': 'review_cycle',
  '最終レビュー日': 'last_reviewed_at',

  // 03_レイアウト
  'ページID*': 'page_id',
  'ブレイクポイント*': 'breakpoint',
  'X': 'x',
  'Y': 'y',
  '幅(w)*': 'w',
  '高さ(h)*': 'h',
  '自動配置*': 'auto',
  '固定': 'pinned',
  '重なり順': 'z_index',
  'キー(計算)': 'key',
  'タイトル(参照)': 'title_ref',

  // 04_アセット
  'アセットID*': 'asset_id',
  'アセット種別*': 'asset_type',
  '参照元URL/ID*': 'url',
  '代替テキスト': 'alt_text',
  'ライセンス': 'license',
  '更新日': 'updated_at',

  // 06_HTML本文
  '本文ID*': 'content_id',
  '形式*': 'format',
  '本文*': 'body'
};

/**
 * スプレッドシートを取得
 * @returns {GoogleAppsScript.Spreadsheet.Spreadsheet}
 */
function getSpreadsheet() {
  try {
    if (SPREADSHEET_ID) {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
    // IDが未設定の場合はバインドされたスプレッドシートを使用
    return SpreadsheetApp.getActiveSpreadsheet();
  } catch (e) {
    Logger.log('Error opening spreadsheet: ' + e.message);
    throw new Error('スプレッドシートを開けません: ' + e.message);
  }
}

/**
 * 指定シートからデータを取得
 * @param {string} sheetName - シート名
 * @returns {Array<Object>} - オブジェクト配列
 */
function getSheetData(sheetName) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      Logger.log('Sheet not found: ' + sheetName);
      return [];
    }

    const data = sheet.getDataRange().getValues();

    if (data.length < 2) {
      // ヘッダー行のみ or 空
      return [];
    }

    // 最初の2行目がヘッダー（1行目はシート説明）
    // ただしシートによって構造が異なる可能性があるので、
    // 最初に「*」を含む列がある行をヘッダーとして検出
    let headerRowIndex = findHeaderRowIndex(data);

    if (headerRowIndex === -1) {
      Logger.log('Header row not found in sheet: ' + sheetName);
      return [];
    }

    const headers = data[headerRowIndex];
    const rows = [];

    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];

      // 最初の列が空なら終了（データ終端）
      if (!row[0] || row[0] === '') {
        continue;
      }

      const obj = {};
      for (let j = 0; j < headers.length; j++) {
        const header = String(headers[j]).trim();
        if (!header) continue;

        const key = COLUMN_MAPPINGS[header] || camelCase(header);
        obj[key] = normalizeValue(row[j]);
      }
      rows.push(obj);
    }

    Logger.log(sheetName + ': ' + rows.length + ' rows loaded');
    return rows;

  } catch (e) {
    Logger.log('Error reading sheet ' + sheetName + ': ' + e.message);
    return [];
  }
}

/**
 * ヘッダー行のインデックスを検出
 * 「*」を含む列があればヘッダー行とみなす
 * @param {Array<Array>} data
 * @returns {number} - ヘッダー行のインデックス（-1 = 見つからない）
 */
function findHeaderRowIndex(data) {
  for (let i = 0; i < Math.min(data.length, 5); i++) {
    const row = data[i];
    for (let j = 0; j < row.length; j++) {
      const cell = String(row[j]);
      if (cell.includes('*')) {
        return i;
      }
    }
  }
  return -1;
}

/**
 * 値を正規化（型変換）
 * @param {any} value
 * @returns {any}
 */
function normalizeValue(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // Boolean判定
  if (value === true || value === 'TRUE' || value === 'true') {
    return true;
  }
  if (value === false || value === 'FALSE' || value === 'false') {
    return false;
  }

  // 数値判定（文字列の数値も変換）
  if (typeof value === 'number') {
    return value;
  }

  const strValue = String(value).trim();

  // 数値として解釈可能か
  if (/^-?\d+(\.\d+)?$/.test(strValue)) {
    return Number(strValue);
  }

  // 日付はそのまま文字列として返す
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Tokyo', 'yyyy-MM-dd');
  }

  return strValue;
}

/**
 * 文字列をcamelCaseに変換（フォールバック用）
 * @param {string} str
 * @returns {string}
 */
function camelCase(str) {
  return str
    .replace(/[（）()*]/g, '')
    .replace(/[_\-\s]+(.)?/g, (_, c) => c ? c.toUpperCase() : '')
    .replace(/^./, s => s.toLowerCase());
}

/**
 * 全シートを一括読み取り
 * @returns {Object} - { pages, widgets, layout, assets, htmlContent }
 */
function readAllSheets() {
  Logger.log('Reading all sheets...');

  const result = {
    pages: getSheetData(SHEET_NAMES.PAGES),
    widgets: getSheetData(SHEET_NAMES.WIDGETS),
    layout: getSheetData(SHEET_NAMES.LAYOUT),
    assets: getSheetData(SHEET_NAMES.ASSETS),
    htmlContent: getSheetData(SHEET_NAMES.HTML_CONTENT)
  };

  Logger.log('All sheets loaded: pages=' + result.pages.length +
             ', widgets=' + result.widgets.length +
             ', layout=' + result.layout.length +
             ', assets=' + result.assets.length +
             ', htmlContent=' + result.htmlContent.length);

  return result;
}

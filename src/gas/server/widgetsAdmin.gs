/**
 * widgetsAdmin.gs - ウィジェット管理API
 *
 * Phase10（運用UI）/ Phase5（権限・監査）/ Phase6（Sheets更新）
 */

// ウィジェット列マッピング（日本語列名 → 内部キー）
const WIDGET_COLUMNS = {
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
  'メモ': 'memo'
};

/**
 * ウィジェット一覧を取得
 * @returns {Object} { ok, widgets, error }
 */
function listWidgets() {
  try {
    // 権限チェック
    if (!checkIsEditor()) {
      return { ok: false, error: '権限がありません' };
    }

    const config = getConfig();
    return {
      ok: true,
      widgets: config.widgets,
      assets: config.assets,
      htmlContent: config.htmlContent,
      pages: config.pages
    };
  } catch (e) {
    Logger.log('listWidgets error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * ウィジェットを新規作成
 * @param {Object} widgetData - ウィジェットデータ
 * @returns {Object} { ok, widgetId, error }
 */
function createWidget(widgetData) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'create_widget',
    before: null,
    after: widgetData,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // バリデーション
    const validation = validateWidgetData(widgetData, true);
    if (!validation.valid) {
      auditData.message = validation.message;
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: validation.message };
    }

    // ID重複チェック
    const existing = findWidgetRow(widgetData.widget_id);
    if (existing.rowNum) {
      auditData.message = 'ウィジェットID "' + widgetData.widget_id + '" は既に存在します';
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    // 参照チェック
    const refCheck = checkReferences(widgetData);
    if (!refCheck.valid) {
      auditData.message = refCheck.message;
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: refCheck.message };
    }

    // シートに追加
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.WIDGETS);
    if (!sheet) {
      throw new Error('02_ウィジェットシートが見つかりません');
    }

    // ヘッダー行を取得
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    if (headerRowIndex === -1) {
      throw new Error('ヘッダー行が見つかりません');
    }
    const headers = data[headerRowIndex];

    // 列インデックスマップ
    const colIndex = buildColumnIndex(headers);

    // 新規行を作成
    const newRow = buildWidgetRow(widgetData, headers, colIndex);
    sheet.appendRow(newRow);

    // 監査ログ
    auditData.result = 'ok';
    auditData.message = '作成成功';
    writeWidgetAuditLog(auditData, userEmail);

    Logger.log('createWidget success: ' + widgetData.widget_id);
    return { ok: true, widgetId: widgetData.widget_id };

  } catch (e) {
    Logger.log('createWidget error: ' + e.message);
    auditData.message = e.message;
    try { writeWidgetAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

/**
 * ウィジェットを更新
 * @param {string} widgetId - ウィジェットID
 * @param {Object} patch - 更新データ
 * @returns {Object} { ok, error }
 */
function updateWidget(widgetId, patch) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'update_widget',
    widgetId: widgetId,
    before: null,
    after: null,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // 既存行を検索
    const existing = findWidgetRow(widgetId);
    if (!existing.rowNum) {
      auditData.message = 'ウィジェット "' + widgetId + '" が見つかりません';
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    auditData.before = existing.rowData;

    // patchとマージ
    const merged = { ...existing.rowData, ...patch };
    auditData.after = merged;

    // バリデーション
    const validation = validateWidgetData(merged, false);
    if (!validation.valid) {
      auditData.message = validation.message;
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: validation.message };
    }

    // 参照チェック
    const refCheck = checkReferences(merged);
    if (!refCheck.valid) {
      auditData.message = refCheck.message;
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: refCheck.message };
    }

    // シートを更新
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.WIDGETS);
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    const headers = data[headerRowIndex];
    const colIndex = buildColumnIndex(headers);

    // 更新する列
    updateWidgetRow(sheet, existing.rowNum, merged, headers, colIndex);

    // 監査ログ
    auditData.result = 'ok';
    auditData.message = '更新成功';
    writeWidgetAuditLog(auditData, userEmail);

    Logger.log('updateWidget success: ' + widgetId);
    return { ok: true };

  } catch (e) {
    Logger.log('updateWidget error: ' + e.message);
    auditData.message = e.message;
    try { writeWidgetAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

/**
 * ウィジェットを非表示（soft delete）
 * @param {string} widgetId
 * @returns {Object} { ok, error }
 */
function hideWidget(widgetId) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'hide_widget',
    widgetId: widgetId,
    before: null,
    after: null,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // 既存行を検索
    const existing = findWidgetRow(widgetId);
    if (!existing.rowNum) {
      auditData.message = 'ウィジェット "' + widgetId + '" が見つかりません';
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    auditData.before = existing.rowData;

    // visible=FALSE に更新
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.WIDGETS);
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    const headers = data[headerRowIndex];
    const colIndex = buildColumnIndex(headers);

    const visibleColIdx = colIndex['表示*'];
    if (visibleColIdx !== undefined) {
      sheet.getRange(existing.rowNum, visibleColIdx + 1).setValue(false);
    }

    auditData.after = { ...existing.rowData, visible: false };
    auditData.result = 'ok';
    auditData.message = '非表示成功';
    writeWidgetAuditLog(auditData, userEmail);

    Logger.log('hideWidget success: ' + widgetId);
    return { ok: true };

  } catch (e) {
    Logger.log('hideWidget error: ' + e.message);
    auditData.message = e.message;
    try { writeWidgetAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

/**
 * ウィジェットを復元（visible=TRUE）
 * @param {string} widgetId
 * @returns {Object} { ok, error }
 */
function showWidget(widgetId) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'show_widget',
    widgetId: widgetId,
    before: null,
    after: null,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // 既存行を検索
    const existing = findWidgetRow(widgetId);
    if (!existing.rowNum) {
      auditData.message = 'ウィジェット "' + widgetId + '" が見つかりません';
      writeWidgetAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    auditData.before = existing.rowData;

    // visible=TRUE に更新
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.WIDGETS);
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    const headers = data[headerRowIndex];
    const colIndex = buildColumnIndex(headers);

    const visibleColIdx = colIndex['表示*'];
    if (visibleColIdx !== undefined) {
      sheet.getRange(existing.rowNum, visibleColIdx + 1).setValue(true);
    }

    auditData.after = { ...existing.rowData, visible: true };
    auditData.result = 'ok';
    auditData.message = '表示復元成功';
    writeWidgetAuditLog(auditData, userEmail);

    Logger.log('showWidget success: ' + widgetId);
    return { ok: true };

  } catch (e) {
    Logger.log('showWidget error: ' + e.message);
    auditData.message = e.message;
    try { writeWidgetAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

// =====================================================
// ヘルパー関数
// =====================================================

/**
 * ウィジェット行を検索
 * @param {string} widgetId
 * @returns {Object} { rowNum, rowData }
 */
function findWidgetRow(widgetId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.WIDGETS);
  if (!sheet) return { rowNum: null, rowData: null };

  const data = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex(data);
  if (headerRowIndex === -1) return { rowNum: null, rowData: null };

  const headers = data[headerRowIndex];
  const colIndex = buildColumnIndex(headers);
  const idColIdx = colIndex['ウィジェットID*'];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    if (data[i][idColIdx] === widgetId) {
      // 行データをオブジェクトに変換
      const rowData = {};
      for (const [colName, key] of Object.entries(WIDGET_COLUMNS)) {
        if (colIndex[colName] !== undefined) {
          rowData[key] = normalizeValue(data[i][colIndex[colName]]);
        }
      }
      return { rowNum: i + 1, rowData: rowData };
    }
  }

  return { rowNum: null, rowData: null };
}

/**
 * 列インデックスマップを構築
 * @param {Array} headers
 * @returns {Object}
 */
function buildColumnIndex(headers) {
  const colIndex = {};
  headers.forEach((h, i) => {
    const key = String(h).trim();
    colIndex[key] = i;
  });
  return colIndex;
}

/**
 * ウィジェットデータのバリデーション
 * @param {Object} data
 * @param {boolean} isCreate - 新規作成かどうか
 * @returns {Object} { valid, message }
 */
function validateWidgetData(data, isCreate) {
  // 必須チェック
  if (!data.widget_id || data.widget_id.trim() === '') {
    return { valid: false, message: 'ウィジェットIDは必須です' };
  }
  if (!data.title || data.title.trim() === '') {
    return { valid: false, message: 'タイトルは必須です' };
  }
  if (!data.type || data.type.trim() === '') {
    return { valid: false, message: '種別は必須です' };
  }

  // ID形式チェック（推奨：英数字+_+-）
  if (!/^[a-zA-Z0-9_-]+$/.test(data.widget_id)) {
    // 警告だけで保存は許可（ログ出力）
    Logger.log('Warning: ウィジェットID "' + data.widget_id + '" は英数字・_・- 以外を含みます');
  }

  // type別URL必須チェック
  const typesRequiringUrl = ['link', 'embed', 'image', 'pdf', 'sheet'];
  if (typesRequiringUrl.includes(data.type)) {
    if (!data.url_or_ref || data.url_or_ref.trim() === '') {
      return { valid: false, message: '種別 "' + data.type + '" にはURL/参照が必須です' };
    }
  }

  // REF形式チェック
  if (data.url_or_ref && data.url_or_ref.startsWith('REF:')) {
    const refId = data.url_or_ref.replace('REF:', '');
    if (!refId || refId.trim() === '') {
      return { valid: false, message: 'REF参照のIDが空です' };
    }
  }

  return { valid: true, message: '' };
}

/**
 * 参照チェック（HTML本文、アセット）
 * @param {Object} data
 * @returns {Object} { valid, message }
 */
function checkReferences(data) {
  const config = getConfig();

  // HTML参照チェック
  if (data.url_or_ref && data.url_or_ref.startsWith('REF:HTML_')) {
    const refId = data.url_or_ref.replace('REF:', '');
    if (!config.htmlContent[refId]) {
      return { valid: false, message: 'HTML本文 "' + refId + '" が存在しません' };
    }
  }

  // アセット参照チェック
  if (data.url_or_ref && data.url_or_ref.startsWith('REF:ASSET_')) {
    const refId = data.url_or_ref.replace('REF:', '');
    if (!config.assets[refId]) {
      return { valid: false, message: 'アセット "' + refId + '" が存在しません' };
    }
  }

  // アイコン参照チェック
  if (data.icon_asset_id && data.icon_asset_id.trim() !== '') {
    if (!config.assets[data.icon_asset_id]) {
      return { valid: false, message: 'アイコンアセット "' + data.icon_asset_id + '" が存在しません' };
    }
  }

  return { valid: true, message: '' };
}

/**
 * 新規行を構築
 * @param {Object} data
 * @param {Array} headers
 * @param {Object} colIndex
 * @returns {Array}
 */
function buildWidgetRow(data, headers, colIndex) {
  const newRow = new Array(headers.length).fill('');

  // マッピングに従って値を設定
  for (const [colName, key] of Object.entries(WIDGET_COLUMNS)) {
    if (colIndex[colName] !== undefined && data[key] !== undefined) {
      newRow[colIndex[colName]] = data[key];
    }
  }

  // visibleのデフォルト
  if (colIndex['表示*'] !== undefined && newRow[colIndex['表示*']] === '') {
    newRow[colIndex['表示*']] = true;
  }

  return newRow;
}

/**
 * 行を更新
 * @param {Sheet} sheet
 * @param {number} rowNum
 * @param {Object} data
 * @param {Array} headers
 * @param {Object} colIndex
 */
function updateWidgetRow(sheet, rowNum, data, headers, colIndex) {
  for (const [colName, key] of Object.entries(WIDGET_COLUMNS)) {
    if (colIndex[colName] !== undefined && data[key] !== undefined) {
      sheet.getRange(rowNum, colIndex[colName] + 1).setValue(data[key]);
    }
  }
}

/**
 * ウィジェット操作の監査ログを書き込み
 * @param {Object} data
 * @param {string} actor
 */
function writeWidgetAuditLog(data, actor) {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);

    if (!sheet) {
      sheet = createAuditLogSheet(ss);
    }

    const timestamp = new Date().toISOString();
    const beforeJson = data.before ? JSON.stringify(data.before) : '';
    const afterJson = data.after ? JSON.stringify(data.after) : '';

    const row = [
      timestamp,
      actor,
      data.action || '',
      data.widgetId || '',
      '',  // bp (ウィジェット操作では不要)
      beforeJson,
      afterJson,
      data.result || 'unknown',
      data.message || ''
    ];

    sheet.appendRow(row);
  } catch (e) {
    Logger.log('writeWidgetAuditLog error: ' + e.message);
  }
}

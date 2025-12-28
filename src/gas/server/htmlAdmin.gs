/**
 * htmlAdmin.gs - HTML本文管理API
 *
 * Phase10（運用UI）/ Phase9（不整合検知）/ Phase5（権限・監査）/ Phase6（Sheets更新）
 */

// HTML本文列マッピング（日本語列名 → 内部キー）
const HTML_CONTENT_COLUMNS = {
  '本文ID*': 'content_id',
  '形式*': 'format',
  '本文*': 'body'
};

// 許可される形式
const VALID_FORMATS = ['markdown', 'html'];

/**
 * HTML本文一覧を取得
 * @returns {Object} { ok, contents, widgets, error }
 */
function listHtmlContents() {
  try {
    // 権限チェック
    if (!checkIsEditor()) {
      return { ok: false, error: '権限がありません' };
    }

    const config = getConfig();

    // HTML本文を配列に変換
    const contentsArray = [];
    for (const contentId in config.htmlContent) {
      contentsArray.push({
        content_id: contentId,
        format: config.htmlContent[contentId].format || '',
        body: config.htmlContent[contentId].body || ''
      });
    }

    return {
      ok: true,
      contents: contentsArray,
      widgets: config.widgets
    };
  } catch (e) {
    Logger.log('listHtmlContents error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * HTML本文の参照先を取得
 * @param {string} contentId
 * @returns {Object} { ok, usages, error }
 */
function getHtmlUsages(contentId) {
  try {
    // 権限チェック
    if (!checkIsEditor()) {
      return { ok: false, error: '権限がありません' };
    }

    const config = getConfig();
    const usages = {
      widgetRefs: [],     // 02_ウィジェット.url_or_ref = REF:HTML_xxx
      total: 0
    };

    // ウィジェットからの参照（REF:HTML_xxx）
    (config.widgets || []).forEach(widget => {
      if (widget.urlOrRef && widget.urlOrRef === 'REF:' + contentId) {
        usages.widgetRefs.push({
          widgetId: widget.widgetId,
          title: widget.title,
          type: widget.type
        });
      }
    });

    usages.total = usages.widgetRefs.length;

    return { ok: true, usages: usages };
  } catch (e) {
    Logger.log('getHtmlUsages error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * HTML本文を新規作成
 * @param {Object} contentData - コンテンツデータ
 * @returns {Object} { ok, contentId, error, warnings }
 */
function createHtmlContent(contentData) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'create_html_content',
    contentId: contentData.content_id || '',
    before: null,
    after: contentData,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writeHtmlContentAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // バリデーション
    const validation = validateHtmlContentData(contentData, true);
    if (!validation.valid) {
      auditData.message = validation.message;
      writeHtmlContentAuditLog(auditData, userEmail);
      return { ok: false, error: validation.message, warnings: validation.warnings };
    }

    // ID重複チェック
    const existing = findHtmlContentRow(contentData.content_id);
    if (existing.rowNum) {
      auditData.message = '本文ID "' + contentData.content_id + '" は既に存在します';
      writeHtmlContentAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    // シートに追加
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.HTML_CONTENT);
    if (!sheet) {
      throw new Error('06_HTML本文シートが見つかりません');
    }

    // ヘッダー行を取得
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    if (headerRowIndex === -1) {
      throw new Error('ヘッダー行が見つかりません');
    }
    const headers = data[headerRowIndex];

    // 列インデックスマップ
    const colIndex = buildHtmlContentColumnIndex(headers);

    // 新規行を作成
    const newRow = buildHtmlContentRow(contentData, headers, colIndex);
    sheet.appendRow(newRow);

    // 監査ログ
    auditData.result = 'ok';
    auditData.message = '作成成功';
    writeHtmlContentAuditLog(auditData, userEmail);

    Logger.log('createHtmlContent success: ' + contentData.content_id);
    return { ok: true, contentId: contentData.content_id, warnings: validation.warnings };

  } catch (e) {
    Logger.log('createHtmlContent error: ' + e.message);
    auditData.message = e.message;
    try { writeHtmlContentAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

/**
 * HTML本文を更新
 * @param {string} contentId - 本文ID
 * @param {Object} patch - 更新データ
 * @returns {Object} { ok, error, warnings }
 */
function updateHtmlContent(contentId, patch) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'update_html_content',
    contentId: contentId,
    before: null,
    after: null,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writeHtmlContentAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // 既存行を検索
    const existing = findHtmlContentRow(contentId);
    if (!existing.rowNum) {
      auditData.message = 'HTML本文 "' + contentId + '" が見つかりません';
      writeHtmlContentAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    auditData.before = existing.rowData;

    // patchとマージ（content_idは変更不可）
    const merged = { ...existing.rowData };
    for (const key in patch) {
      if (key !== 'content_id') {
        merged[key] = patch[key];
      }
    }
    auditData.after = merged;

    // バリデーション
    const validation = validateHtmlContentData(merged, false);
    if (!validation.valid) {
      auditData.message = validation.message;
      writeHtmlContentAuditLog(auditData, userEmail);
      return { ok: false, error: validation.message, warnings: validation.warnings };
    }

    // シートを更新
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.HTML_CONTENT);
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    const headers = data[headerRowIndex];
    const colIndex = buildHtmlContentColumnIndex(headers);

    // 更新する列
    updateHtmlContentRow(sheet, existing.rowNum, merged, headers, colIndex);

    // 監査ログ
    auditData.result = 'ok';
    auditData.message = '更新成功';
    writeHtmlContentAuditLog(auditData, userEmail);

    Logger.log('updateHtmlContent success: ' + contentId);
    return { ok: true, warnings: validation.warnings };

  } catch (e) {
    Logger.log('updateHtmlContent error: ' + e.message);
    auditData.message = e.message;
    try { writeHtmlContentAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

// =====================================================
// ヘルパー関数
// =====================================================

/**
 * HTML本文行を検索
 * @param {string} contentId
 * @returns {Object} { rowNum, rowData }
 */
function findHtmlContentRow(contentId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.HTML_CONTENT);
  if (!sheet) return { rowNum: null, rowData: null };

  const data = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex(data);
  if (headerRowIndex === -1) return { rowNum: null, rowData: null };

  const headers = data[headerRowIndex];
  const colIndex = buildHtmlContentColumnIndex(headers);
  const idColIdx = colIndex['本文ID*'];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    if (data[i][idColIdx] === contentId) {
      // 行データをオブジェクトに変換
      const rowData = {};
      for (const [colName, key] of Object.entries(HTML_CONTENT_COLUMNS)) {
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
 * HTML本文列インデックスマップを構築
 * @param {Array} headers
 * @returns {Object}
 */
function buildHtmlContentColumnIndex(headers) {
  const colIndex = {};
  headers.forEach((h, i) => {
    const key = String(h).trim();
    colIndex[key] = i;
  });
  return colIndex;
}

/**
 * HTML本文データのバリデーション
 * @param {Object} data
 * @param {boolean} isCreate - 新規作成かどうか
 * @returns {Object} { valid, message, warnings }
 */
function validateHtmlContentData(data, isCreate) {
  const warnings = [];

  // 必須チェック
  if (!data.content_id || data.content_id.trim() === '') {
    return { valid: false, message: '本文IDは必須です', warnings: warnings };
  }
  if (!data.format || data.format.trim() === '') {
    return { valid: false, message: '形式は必須です', warnings: warnings };
  }
  if (data.body === undefined || data.body === null) {
    return { valid: false, message: '本文は必須です', warnings: warnings };
  }

  // 形式チェック
  const format = data.format.toLowerCase();
  if (!VALID_FORMATS.includes(format)) {
    return { valid: false, message: '形式は markdown または html のみ使用可能です', warnings: warnings };
  }

  // ID形式チェック（推奨：英数字+_+-）
  if (!/^[a-zA-Z0-9_-]+$/.test(data.content_id)) {
    warnings.push('本文ID "' + data.content_id + '" は英数字・_・- 以外を含みます');
  }

  // セキュリティ警告（HTMLの場合）
  if (format === 'html') {
    warnings.push('HTML形式はXSSリスクがあります。可能であればmarkdown形式をお勧めします');

    // 危険なタグの検出
    const dangerousTags = ['<script', '<iframe', '<embed', '<object', 'javascript:', 'onerror=', 'onload=', 'onclick='];
    const bodyLower = (data.body || '').toLowerCase();
    dangerousTags.forEach(tag => {
      if (bodyLower.includes(tag)) {
        warnings.push('危険なコード "' + tag + '" が含まれています');
      }
    });
  }

  return { valid: true, message: '', warnings: warnings };
}

/**
 * 新規行を構築
 * @param {Object} data
 * @param {Array} headers
 * @param {Object} colIndex
 * @returns {Array}
 */
function buildHtmlContentRow(data, headers, colIndex) {
  const newRow = new Array(headers.length).fill('');

  // マッピングに従って値を設定
  for (const [colName, key] of Object.entries(HTML_CONTENT_COLUMNS)) {
    if (colIndex[colName] !== undefined && data[key] !== undefined) {
      newRow[colIndex[colName]] = data[key];
    }
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
function updateHtmlContentRow(sheet, rowNum, data, headers, colIndex) {
  for (const [colName, key] of Object.entries(HTML_CONTENT_COLUMNS)) {
    // content_idは更新しない
    if (key === 'content_id') continue;

    if (colIndex[colName] !== undefined && data[key] !== undefined) {
      sheet.getRange(rowNum, colIndex[colName] + 1).setValue(data[key]);
    }
  }
}

/**
 * HTML本文操作の監査ログを書き込み
 * @param {Object} data
 * @param {string} actor
 */
function writeHtmlContentAuditLog(data, actor) {
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
      data.contentId || '',
      '',  // bp (HTML本文操作では不要)
      beforeJson,
      afterJson,
      data.result || 'unknown',
      data.message || ''
    ];

    sheet.appendRow(row);
  } catch (e) {
    Logger.log('writeHtmlContentAuditLog error: ' + e.message);
  }
}

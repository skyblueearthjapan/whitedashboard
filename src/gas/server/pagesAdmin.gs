/**
 * pagesAdmin.gs - ページ管理API
 *
 * Phase10（運用UI）/ Phase1（ページ定義）/ Phase5（権限・監査）/ Phase6（Sheets更新）
 */

// ページ列マッピング（日本語列名 → 内部キー）
const PAGE_COLUMNS = {
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
  'メモ': 'memo'
};

/**
 * ページ一覧を取得
 * @returns {Object} { ok, pages, assets, error }
 */
function listPages() {
  try {
    // 権限チェック
    if (!checkIsEditor()) {
      return { ok: false, error: '権限がありません' };
    }

    const config = getConfig();
    return {
      ok: true,
      pages: config.pages,
      assets: config.assets
    };
  } catch (e) {
    Logger.log('listPages error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * ページを新規作成
 * @param {Object} pageData - ページデータ
 * @returns {Object} { ok, pageId, error }
 */
function createPage(pageData) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'create_page',
    pageId: pageData.page_id || '',
    before: null,
    after: pageData,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writePageAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // バリデーション
    const validation = validatePageData(pageData, true);
    if (!validation.valid) {
      auditData.message = validation.message;
      writePageAuditLog(auditData, userEmail);
      return { ok: false, error: validation.message };
    }

    // ID重複チェック
    const existing = findPageRow(pageData.page_id);
    if (existing.rowNum) {
      auditData.message = 'ページID "' + pageData.page_id + '" は既に存在します';
      writePageAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    // ヘッダーアセット参照チェック
    if (pageData.header_asset_id) {
      const refCheck = checkHeaderAssetReference(pageData.header_asset_id);
      if (!refCheck.valid) {
        auditData.message = refCheck.message;
        writePageAuditLog(auditData, userEmail);
        return { ok: false, error: refCheck.message };
      }
    }

    // シートに追加
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.PAGES);
    if (!sheet) {
      throw new Error('01_ページシートが見つかりません');
    }

    // ヘッダー行を取得
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    if (headerRowIndex === -1) {
      throw new Error('ヘッダー行が見つかりません');
    }
    const headers = data[headerRowIndex];

    // 列インデックスマップ
    const colIndex = buildPageColumnIndex(headers);

    // 表示順を設定（未設定の場合は最大値+1）
    if (!pageData.display_order || pageData.display_order === 0) {
      pageData.display_order = getMaxDisplayOrder() + 1;
    }

    // デフォルト値を設定
    const pageWithDefaults = applyPageDefaults(pageData);

    // 新規行を作成
    const newRow = buildPageRow(pageWithDefaults, headers, colIndex);
    sheet.appendRow(newRow);

    // 監査ログ
    auditData.after = pageWithDefaults;
    auditData.result = 'ok';
    auditData.message = '作成成功';
    writePageAuditLog(auditData, userEmail);

    Logger.log('createPage success: ' + pageData.page_id);
    return { ok: true, pageId: pageData.page_id };

  } catch (e) {
    Logger.log('createPage error: ' + e.message);
    auditData.message = e.message;
    try { writePageAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

/**
 * ページを更新
 * @param {string} pageId - ページID
 * @param {Object} patch - 更新データ
 * @returns {Object} { ok, error }
 */
function updatePage(pageId, patch) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'update_page',
    pageId: pageId,
    before: null,
    after: null,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writePageAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // 既存行を検索
    const existing = findPageRow(pageId);
    if (!existing.rowNum) {
      auditData.message = 'ページ "' + pageId + '" が見つかりません';
      writePageAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    auditData.before = existing.rowData;

    // patchとマージ（page_idは変更不可）
    const merged = { ...existing.rowData };
    for (const key in patch) {
      if (key !== 'page_id') {
        merged[key] = patch[key];
      }
    }
    auditData.after = merged;

    // バリデーション
    const validation = validatePageData(merged, false);
    if (!validation.valid) {
      auditData.message = validation.message;
      writePageAuditLog(auditData, userEmail);
      return { ok: false, error: validation.message };
    }

    // ヘッダーアセット参照チェック
    if (merged.header_asset_id) {
      const refCheck = checkHeaderAssetReference(merged.header_asset_id);
      if (!refCheck.valid) {
        auditData.message = refCheck.message;
        writePageAuditLog(auditData, userEmail);
        return { ok: false, error: refCheck.message };
      }
    }

    // シートを更新
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.PAGES);
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    const headers = data[headerRowIndex];
    const colIndex = buildPageColumnIndex(headers);

    // 更新する列
    updatePageRow(sheet, existing.rowNum, merged, headers, colIndex);

    // 監査ログ
    auditData.result = 'ok';
    auditData.message = '更新成功';
    writePageAuditLog(auditData, userEmail);

    Logger.log('updatePage success: ' + pageId);
    return { ok: true };

  } catch (e) {
    Logger.log('updatePage error: ' + e.message);
    auditData.message = e.message;
    try { writePageAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

/**
 * ページの表示順を一括更新
 * @param {Array} orderList - [{page_id, display_order}, ...]
 * @returns {Object} { ok, error }
 */
function reorderPages(orderList) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'reorder_pages',
    pageId: 'all',
    before: null,
    after: null,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writePageAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    if (!orderList || !Array.isArray(orderList) || orderList.length === 0) {
      auditData.message = '並び順データが空です';
      writePageAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    // 重複チェック
    const orders = orderList.map(o => o.display_order);
    const uniqueOrders = [...new Set(orders)];
    if (orders.length !== uniqueOrders.length) {
      auditData.message = '表示順に重複があります';
      writePageAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    // シート取得
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.PAGES);
    if (!sheet) {
      throw new Error('01_ページシートが見つかりません');
    }

    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    if (headerRowIndex === -1) {
      throw new Error('ヘッダー行が見つかりません');
    }
    const headers = data[headerRowIndex];
    const colIndex = buildPageColumnIndex(headers);

    const pageIdColIdx = colIndex['ページID*'];
    const orderColIdx = colIndex['表示順'];

    if (orderColIdx === undefined) {
      throw new Error('表示順列が見つかりません');
    }

    // 変更前データ
    auditData.before = orderList.map(o => {
      const row = findPageRow(o.page_id);
      return {
        page_id: o.page_id,
        display_order: row.rowData ? row.rowData.display_order : null
      };
    });
    auditData.after = orderList;

    // 各ページの表示順を更新
    let updated = 0;
    for (const order of orderList) {
      // 行を検索
      for (let i = headerRowIndex + 1; i < data.length; i++) {
        if (data[i][pageIdColIdx] === order.page_id) {
          sheet.getRange(i + 1, orderColIdx + 1).setValue(order.display_order);
          updated++;
          break;
        }
      }
    }

    // 監査ログ
    auditData.result = 'ok';
    auditData.message = '並び替え成功: ' + updated + '件';
    writePageAuditLog(auditData, userEmail);

    Logger.log('reorderPages success: ' + updated + ' pages');
    return { ok: true, updated: updated };

  } catch (e) {
    Logger.log('reorderPages error: ' + e.message);
    auditData.message = e.message;
    try { writePageAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

// =====================================================
// ヘルパー関数
// =====================================================

/**
 * ページ行を検索
 * @param {string} pageId
 * @returns {Object} { rowNum, rowData }
 */
function findPageRow(pageId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.PAGES);
  if (!sheet) return { rowNum: null, rowData: null };

  const data = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex(data);
  if (headerRowIndex === -1) return { rowNum: null, rowData: null };

  const headers = data[headerRowIndex];
  const colIndex = buildPageColumnIndex(headers);
  const idColIdx = colIndex['ページID*'];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    if (data[i][idColIdx] === pageId) {
      // 行データをオブジェクトに変換
      const rowData = {};
      for (const [colName, key] of Object.entries(PAGE_COLUMNS)) {
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
 * ページ列インデックスマップを構築
 * @param {Array} headers
 * @returns {Object}
 */
function buildPageColumnIndex(headers) {
  const colIndex = {};
  headers.forEach((h, i) => {
    const key = String(h).trim();
    colIndex[key] = i;
  });
  return colIndex;
}

/**
 * 最大表示順を取得
 * @returns {number}
 */
function getMaxDisplayOrder() {
  const config = getConfig();
  if (!config.pages || config.pages.length === 0) {
    return 0;
  }
  return Math.max(...config.pages.map(p => p.displayOrder || 0));
}

/**
 * ページデータにデフォルト値を適用
 * @param {Object} data
 * @returns {Object}
 */
function applyPageDefaults(data) {
  return {
    page_id: data.page_id,
    page_title: data.page_title,
    display_order: data.display_order || 1,
    layout_mode: data.layout_mode || 'auto',
    cols_pc: data.cols_pc || 12,
    cols_tablet: data.cols_tablet || 8,
    cols_mobile: data.cols_mobile || 4,
    row_height: data.row_height || 72,
    gap: data.gap || 12,
    bg_color: data.bg_color || '#FFFFFF',
    header_asset_id: data.header_asset_id || '',
    memo: data.memo || ''
  };
}

/**
 * ページデータのバリデーション
 * @param {Object} data
 * @param {boolean} isCreate - 新規作成かどうか
 * @returns {Object} { valid, message }
 */
function validatePageData(data, isCreate) {
  // 必須チェック
  if (!data.page_id || data.page_id.trim() === '') {
    return { valid: false, message: 'ページIDは必須です' };
  }
  if (!data.page_title || data.page_title.trim() === '') {
    return { valid: false, message: 'ページタイトルは必須です' };
  }

  // ID形式チェック（推奨：英数字+_+-）
  if (!/^[a-zA-Z0-9_-]+$/.test(data.page_id)) {
    Logger.log('Warning: ページID "' + data.page_id + '" は英数字・_・- 以外を含みます');
  }

  // 列数チェック（1以上の整数）
  const colFields = ['cols_pc', 'cols_tablet', 'cols_mobile'];
  for (const field of colFields) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
      const val = Number(data[field]);
      if (!Number.isInteger(val) || val < 1) {
        return { valid: false, message: field + 'は1以上の整数である必要があります' };
      }
    }
  }

  // 行高さ・余白チェック（0以上の数値）
  const numFields = ['row_height', 'gap'];
  for (const field of numFields) {
    if (data[field] !== undefined && data[field] !== null && data[field] !== '') {
      const val = Number(data[field]);
      if (isNaN(val) || val < 0) {
        return { valid: false, message: field + 'は0以上の数値である必要があります' };
      }
    }
  }

  // レイアウトモードチェック
  const validModes = ['auto', 'manual', 'hybrid'];
  if (data.layout_mode && !validModes.includes(data.layout_mode)) {
    return { valid: false, message: 'レイアウトモードは auto/manual/hybrid のいずれかです' };
  }

  return { valid: true, message: '' };
}

/**
 * ヘッダーアセット参照チェック
 * @param {string} assetId
 * @returns {Object} { valid, message }
 */
function checkHeaderAssetReference(assetId) {
  if (!assetId || assetId.trim() === '') {
    return { valid: true, message: '' };
  }

  const config = getConfig();
  if (!config.assets[assetId]) {
    return { valid: false, message: 'ヘッダーアセット "' + assetId + '" が存在しません' };
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
function buildPageRow(data, headers, colIndex) {
  const newRow = new Array(headers.length).fill('');

  // マッピングに従って値を設定
  for (const [colName, key] of Object.entries(PAGE_COLUMNS)) {
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
function updatePageRow(sheet, rowNum, data, headers, colIndex) {
  for (const [colName, key] of Object.entries(PAGE_COLUMNS)) {
    // page_idは更新しない
    if (key === 'page_id') continue;

    if (colIndex[colName] !== undefined && data[key] !== undefined) {
      sheet.getRange(rowNum, colIndex[colName] + 1).setValue(data[key]);
    }
  }
}

/**
 * ページ操作の監査ログを書き込み
 * @param {Object} data
 * @param {string} actor
 */
function writePageAuditLog(data, actor) {
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
      data.pageId || '',
      '',  // bp (ページ操作では不要)
      beforeJson,
      afterJson,
      data.result || 'unknown',
      data.message || ''
    ];

    sheet.appendRow(row);
  } catch (e) {
    Logger.log('writePageAuditLog error: ' + e.message);
  }
}

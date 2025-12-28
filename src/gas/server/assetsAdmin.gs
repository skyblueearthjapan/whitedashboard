/**
 * assetsAdmin.gs - アセット管理API
 *
 * Phase10（運用UI）/ Phase9（不整合検知）/ Phase5（権限・監査）/ Phase6（Sheets更新）
 */

// アセット列マッピング（日本語列名 → 内部キー）
const ASSET_COLUMNS = {
  'アセットID*': 'asset_id',
  'アセット種別*': 'asset_type',
  '参照元URL/ID*': 'url',
  '代替テキスト': 'alt_text',
  'ライセンス': 'license',
  '更新日': 'updated_at',
  '管理者': 'owner',
  'メモ': 'memo'
};

// 許可される種別
const VALID_ASSET_TYPES = ['image', 'icon', 'pdf', 'video', 'audio', 'file'];

/**
 * アセット一覧を取得
 * @returns {Object} { ok, assets, pages, widgets, error }
 */
function listAssets() {
  try {
    // 権限チェック
    if (!checkIsEditor()) {
      return { ok: false, error: '権限がありません' };
    }

    const config = getConfig();

    // アセットを配列に変換
    const assetsArray = [];
    for (const assetId in config.assets) {
      assetsArray.push(config.assets[assetId]);
    }

    return {
      ok: true,
      assets: assetsArray,
      pages: config.pages,
      widgets: config.widgets
    };
  } catch (e) {
    Logger.log('listAssets error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * アセットの参照先を取得
 * @param {string} assetId
 * @returns {Object} { ok, usages, error }
 */
function getAssetUsages(assetId) {
  try {
    // 権限チェック
    if (!checkIsEditor()) {
      return { ok: false, error: '権限がありません' };
    }

    const config = getConfig();
    const usages = {
      pageHeaders: [],    // 01_ページ.header_asset_id
      widgetIcons: [],    // 02_ウィジェット.icon_asset_id
      widgetRefs: [],     // 02_ウィジェット.url_or_ref = REF:ASSET_xxx
      total: 0
    };

    // ページヘッダーからの参照
    (config.pages || []).forEach(page => {
      if (page.headerAssetId === assetId) {
        usages.pageHeaders.push({
          pageId: page.pageId,
          pageTitle: page.pageTitle
        });
      }
    });

    // ウィジェットからの参照
    (config.widgets || []).forEach(widget => {
      // アイコン参照
      if (widget.iconAssetId === assetId) {
        usages.widgetIcons.push({
          widgetId: widget.widgetId,
          title: widget.title
        });
      }

      // REF:ASSET_xxx 参照
      if (widget.urlOrRef && widget.urlOrRef === 'REF:' + assetId) {
        usages.widgetRefs.push({
          widgetId: widget.widgetId,
          title: widget.title
        });
      }
    });

    usages.total = usages.pageHeaders.length + usages.widgetIcons.length + usages.widgetRefs.length;

    return { ok: true, usages: usages };
  } catch (e) {
    Logger.log('getAssetUsages error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * アセットを新規作成
 * @param {Object} assetData - アセットデータ
 * @returns {Object} { ok, assetId, error }
 */
function createAsset(assetData) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'create_asset',
    assetId: assetData.asset_id || '',
    before: null,
    after: assetData,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // バリデーション
    const validation = validateAssetData(assetData, true);
    if (!validation.valid) {
      auditData.message = validation.message;
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: validation.message, warnings: validation.warnings };
    }

    // ID重複チェック
    const existing = findAssetRow(assetData.asset_id);
    if (existing.rowNum) {
      auditData.message = 'アセットID "' + assetData.asset_id + '" は既に存在します';
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    // シートに追加
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.ASSETS);
    if (!sheet) {
      throw new Error('04_アセットシートが見つかりません');
    }

    // ヘッダー行を取得
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    if (headerRowIndex === -1) {
      throw new Error('ヘッダー行が見つかりません');
    }
    const headers = data[headerRowIndex];

    // 列インデックスマップ
    const colIndex = buildAssetColumnIndex(headers);

    // 新規行を作成
    const newRow = buildAssetRow(assetData, headers, colIndex);
    sheet.appendRow(newRow);

    // 監査ログ
    auditData.result = 'ok';
    auditData.message = '作成成功';
    writeAssetAuditLog(auditData, userEmail);

    Logger.log('createAsset success: ' + assetData.asset_id);
    return { ok: true, assetId: assetData.asset_id, warnings: validation.warnings };

  } catch (e) {
    Logger.log('createAsset error: ' + e.message);
    auditData.message = e.message;
    try { writeAssetAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

/**
 * アセットを更新
 * @param {string} assetId - アセットID
 * @param {Object} patch - 更新データ
 * @returns {Object} { ok, error }
 */
function updateAsset(assetId, patch) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'update_asset',
    assetId: assetId,
    before: null,
    after: null,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // 既存行を検索
    const existing = findAssetRow(assetId);
    if (!existing.rowNum) {
      auditData.message = 'アセット "' + assetId + '" が見つかりません';
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    auditData.before = existing.rowData;

    // patchとマージ（asset_idは変更不可）
    const merged = { ...existing.rowData };
    for (const key in patch) {
      if (key !== 'asset_id') {
        merged[key] = patch[key];
      }
    }
    auditData.after = merged;

    // バリデーション
    const validation = validateAssetData(merged, false);
    if (!validation.valid) {
      auditData.message = validation.message;
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: validation.message, warnings: validation.warnings };
    }

    // シートを更新
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.ASSETS);
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    const headers = data[headerRowIndex];
    const colIndex = buildAssetColumnIndex(headers);

    // 更新する列
    updateAssetRow(sheet, existing.rowNum, merged, headers, colIndex);

    // 監査ログ
    auditData.result = 'ok';
    auditData.message = '更新成功';
    writeAssetAuditLog(auditData, userEmail);

    Logger.log('updateAsset success: ' + assetId);
    return { ok: true, warnings: validation.warnings };

  } catch (e) {
    Logger.log('updateAsset error: ' + e.message);
    auditData.message = e.message;
    try { writeAssetAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

/**
 * アセットを非表示（論理削除）
 * 注意：参照中のアセットは削除不可
 * @param {string} assetId
 * @returns {Object} { ok, error }
 */
function hideAsset(assetId) {
  const userEmail = getUserEmail() || 'unknown';
  let auditData = {
    action: 'hide_asset',
    assetId: assetId,
    before: null,
    after: null,
    result: 'failed',
    message: ''
  };

  try {
    // 権限チェック
    if (!checkIsEditor()) {
      auditData.message = '権限がありません';
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: '権限がありません' };
    }

    // 既存行を検索
    const existing = findAssetRow(assetId);
    if (!existing.rowNum) {
      auditData.message = 'アセット "' + assetId + '" が見つかりません';
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message };
    }

    auditData.before = existing.rowData;

    // 参照チェック
    const usagesResult = getAssetUsages(assetId);
    if (usagesResult.ok && usagesResult.usages.total > 0) {
      auditData.message = 'このアセットは ' + usagesResult.usages.total + ' 箇所で参照されているため削除できません';
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: auditData.message, usages: usagesResult.usages };
    }

    // 物理削除は行わない
    // 04_アセットに「表示」列があるかチェック
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.ASSETS);
    const data = sheet.getDataRange().getValues();
    const headerRowIndex = findHeaderRowIndex(data);
    const headers = data[headerRowIndex];
    const colIndex = buildAssetColumnIndex(headers);

    // 「表示」列を探す（テンプレートに存在する場合のみ）
    const visibleColIdx = headers.findIndex(h => String(h).trim() === '表示' || String(h).trim() === '表示*');

    if (visibleColIdx === -1) {
      // 表示列がない場合は削除機能を提供しない
      auditData.message = '表示列がないため、非表示操作はサポートされていません';
      auditData.result = 'failed';
      writeAssetAuditLog(auditData, userEmail);
      return { ok: false, error: '現在のテンプレートでは非表示機能がサポートされていません。未使用のアセットは手動で整理してください。' };
    }

    // 表示=FALSE に更新
    sheet.getRange(existing.rowNum, visibleColIdx + 1).setValue(false);

    auditData.after = { ...existing.rowData, visible: false };
    auditData.result = 'ok';
    auditData.message = '非表示成功';
    writeAssetAuditLog(auditData, userEmail);

    Logger.log('hideAsset success: ' + assetId);
    return { ok: true };

  } catch (e) {
    Logger.log('hideAsset error: ' + e.message);
    auditData.message = e.message;
    try { writeAssetAuditLog(auditData, userEmail); } catch (ae) {}
    return { ok: false, error: e.message };
  }
}

// =====================================================
// ヘルパー関数
// =====================================================

/**
 * アセット行を検索
 * @param {string} assetId
 * @returns {Object} { rowNum, rowData }
 */
function findAssetRow(assetId) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.ASSETS);
  if (!sheet) return { rowNum: null, rowData: null };

  const data = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex(data);
  if (headerRowIndex === -1) return { rowNum: null, rowData: null };

  const headers = data[headerRowIndex];
  const colIndex = buildAssetColumnIndex(headers);
  const idColIdx = colIndex['アセットID*'];

  for (let i = headerRowIndex + 1; i < data.length; i++) {
    if (data[i][idColIdx] === assetId) {
      // 行データをオブジェクトに変換
      const rowData = {};
      for (const [colName, key] of Object.entries(ASSET_COLUMNS)) {
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
 * アセット列インデックスマップを構築
 * @param {Array} headers
 * @returns {Object}
 */
function buildAssetColumnIndex(headers) {
  const colIndex = {};
  headers.forEach((h, i) => {
    const key = String(h).trim();
    colIndex[key] = i;
  });
  return colIndex;
}

/**
 * アセットデータのバリデーション
 * @param {Object} data
 * @param {boolean} isCreate - 新規作成かどうか
 * @returns {Object} { valid, message, warnings }
 */
function validateAssetData(data, isCreate) {
  const warnings = [];

  // 必須チェック
  if (!data.asset_id || data.asset_id.trim() === '') {
    return { valid: false, message: 'アセットIDは必須です', warnings: warnings };
  }
  if (!data.asset_type || data.asset_type.trim() === '') {
    return { valid: false, message: 'アセット種別は必須です', warnings: warnings };
  }
  if (!data.url || data.url.trim() === '') {
    return { valid: false, message: 'URLは必須です', warnings: warnings };
  }

  // URL形式チェック（簡易）
  const url = data.url.trim();
  if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:')) {
    return { valid: false, message: 'URLはhttp(s)://またはdata:で始まる必要があります', warnings: warnings };
  }

  // ID形式チェック（推奨：英数字+_+-）
  if (!/^[a-zA-Z0-9_-]+$/.test(data.asset_id)) {
    warnings.push('アセットID "' + data.asset_id + '" は英数字・_・- 以外を含みます');
  }

  // 種別と拡張子の整合性チェック（警告のみ）
  const assetType = data.asset_type.toLowerCase();
  const urlLower = url.toLowerCase();

  if (assetType === 'image' || assetType === 'icon') {
    if (!urlLower.match(/\.(png|jpg|jpeg|gif|svg|webp)(\?|$)/i) && !url.startsWith('data:image/')) {
      warnings.push('種別が "' + assetType + '" ですが、URLが画像形式ではないようです');
    }
  } else if (assetType === 'pdf') {
    if (!urlLower.match(/\.pdf(\?|$)/i)) {
      warnings.push('種別が "pdf" ですが、URLがPDF形式ではないようです');
    }
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
function buildAssetRow(data, headers, colIndex) {
  const newRow = new Array(headers.length).fill('');

  // マッピングに従って値を設定
  for (const [colName, key] of Object.entries(ASSET_COLUMNS)) {
    if (colIndex[colName] !== undefined && data[key] !== undefined) {
      newRow[colIndex[colName]] = data[key];
    }
  }

  // 更新日を設定
  const updatedAtIdx = colIndex['更新日'];
  if (updatedAtIdx !== undefined) {
    newRow[updatedAtIdx] = new Date().toISOString().split('T')[0];
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
function updateAssetRow(sheet, rowNum, data, headers, colIndex) {
  for (const [colName, key] of Object.entries(ASSET_COLUMNS)) {
    // asset_idは更新しない
    if (key === 'asset_id') continue;

    if (colIndex[colName] !== undefined && data[key] !== undefined) {
      sheet.getRange(rowNum, colIndex[colName] + 1).setValue(data[key]);
    }
  }

  // 更新日を更新
  const updatedAtIdx = colIndex['更新日'];
  if (updatedAtIdx !== undefined) {
    sheet.getRange(rowNum, updatedAtIdx + 1).setValue(new Date().toISOString().split('T')[0]);
  }
}

/**
 * アセット操作の監査ログを書き込み
 * @param {Object} data
 * @param {string} actor
 */
function writeAssetAuditLog(data, actor) {
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
      data.assetId || '',
      '',  // bp (アセット操作では不要)
      beforeJson,
      afterJson,
      data.result || 'unknown',
      data.message || ''
    ];

    sheet.appendRow(row);
  } catch (e) {
    Logger.log('writeAssetAuditLog error: ' + e.message);
  }
}

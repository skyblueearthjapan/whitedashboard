/**
 * save.gs - レイアウト保存API
 *
 * Phase5（権限/監査）/ Phase6（書き込み方針）/ Phase3（auto確定座標保存）/ Phase10（誤操作防止）
 */

// 監査ログシート名
const AUDIT_LOG_SHEET_NAME = '08_監査ログ';

// 監査ログ列定義
const AUDIT_COLUMNS = ['timestamp', 'actor', 'action', 'page_id', 'bp', 'before_json', 'after_json', 'result', 'message'];

/**
 * レイアウト保存API（クライアントから呼び出し）
 *
 * @param {Object} payload - 保存データ
 *   - page_id: ページID
 *   - bp: ブレイクポイント（PC/TABLET/MOBILE）
 *   - rects: 配置データ配列
 *   - client_ts: クライアント側タイムスタンプ
 * @returns {Object} - 結果
 */
function saveLayout(payload) {
  const serverTs = new Date().toISOString();
  let auditData = {
    action: 'save_layout',
    pageId: payload.page_id || '',
    bp: payload.bp || '',
    before: null,
    after: null,
    result: 'failed',
    message: ''
  };

  try {
    Logger.log('saveLayout called: ' + JSON.stringify(payload));

    // 1. Editor権限チェック（サーバ側必須）
    const userEmail = getUserEmail();
    if (!userEmail) {
      auditData.message = 'ユーザー情報を取得できません';
      writeAuditLog(auditData, userEmail || 'unknown');
      return { ok: false, message: 'ユーザー情報を取得できません', server_ts: serverTs };
    }

    if (!checkIsEditor()) {
      auditData.message = 'Editor権限がありません';
      writeAuditLog(auditData, userEmail);
      Logger.log('saveLayout: forbidden for ' + userEmail);
      return { ok: false, message: '保存権限がありません', server_ts: serverTs };
    }

    // 2. 入力バリデーション
    const validation = validateSavePayload(payload);
    if (!validation.valid) {
      auditData.message = validation.message;
      writeAuditLog(auditData, userEmail);
      return { ok: false, message: validation.message, server_ts: serverTs };
    }

    const pageId = payload.page_id;
    const bp = payload.bp.toUpperCase();
    const rects = payload.rects;

    // 3. ページ情報取得（列数制限用）
    const pageInfo = getPageInfo(pageId);
    if (!pageInfo) {
      auditData.message = 'ページが見つかりません: ' + pageId;
      writeAuditLog(auditData, userEmail);
      return { ok: false, message: 'ページが見つかりません', server_ts: serverTs };
    }

    const cols = getColsForBpServer(pageInfo, bp);

    // 4. 衝突・範囲チェック（サーバ側）
    const rectValidation = validateRectsServer(rects, cols);
    if (!rectValidation.valid) {
      auditData.message = rectValidation.message;
      writeAuditLog(auditData, userEmail);
      return { ok: false, message: rectValidation.message, server_ts: serverTs };
    }

    // 5. 既存データ取得（before用）
    const beforeData = getExistingLayoutData(pageId, bp);
    auditData.before = beforeData;
    auditData.after = rects;

    // 6. 03_レイアウト へ Upsert
    const upsertResult = upsertLayoutRows(pageId, bp, rects);

    // 7. 監査ログ書き込み
    auditData.result = 'ok';
    auditData.message = 'updated:' + upsertResult.updated + ', inserted:' + upsertResult.inserted;
    writeAuditLog(auditData, userEmail);

    Logger.log('saveLayout success: ' + JSON.stringify(upsertResult));

    return {
      ok: true,
      updated: upsertResult.updated,
      inserted: upsertResult.inserted,
      audit_logged: true,
      server_ts: serverTs
    };

  } catch (e) {
    Logger.log('saveLayout error: ' + e.message);
    auditData.message = e.message;
    try {
      writeAuditLog(auditData, getUserEmail() || 'error');
    } catch (auditError) {
      Logger.log('Failed to write audit log: ' + auditError.message);
    }
    return { ok: false, message: '保存に失敗しました: ' + e.message, server_ts: serverTs };
  }
}

/**
 * 現在のユーザーメールを取得
 * @returns {string|null}
 */
function getUserEmail() {
  try {
    const user = Session.getActiveUser();
    return user ? user.getEmail() : null;
  } catch (e) {
    Logger.log('getUserEmail error: ' + e.message);
    return null;
  }
}

/**
 * 保存ペイロードのバリデーション
 * @param {Object} payload
 * @returns {Object} { valid, message }
 */
function validateSavePayload(payload) {
  if (!payload) {
    return { valid: false, message: 'ペイロードが空です' };
  }
  if (!payload.page_id) {
    return { valid: false, message: 'page_idが必要です' };
  }
  if (!payload.bp) {
    return { valid: false, message: 'bpが必要です' };
  }
  if (!['PC', 'TABLET', 'MOBILE'].includes(payload.bp.toUpperCase())) {
    return { valid: false, message: 'bpが不正です' };
  }
  if (!payload.rects || !Array.isArray(payload.rects) || payload.rects.length === 0) {
    return { valid: false, message: 'rectsが空です' };
  }
  return { valid: true, message: '' };
}

/**
 * ページ情報を取得
 * @param {string} pageId
 * @returns {Object|null}
 */
function getPageInfo(pageId) {
  const pages = getSheetData(SHEET_NAMES.PAGES);
  return pages.find(p => p.page_id === pageId) || null;
}

/**
 * BPに応じた列数を取得（サーバ用）
 * @param {Object} page
 * @param {string} bp
 * @returns {number}
 */
function getColsForBpServer(page, bp) {
  switch (bp.toUpperCase()) {
    case 'PC': return page.cols_pc || 12;
    case 'TABLET': return page.cols_tablet || 8;
    case 'MOBILE': return page.cols_mobile || 4;
    default: return 12;
  }
}

/**
 * rects配列のサーバ側バリデーション
 * @param {Array} rects
 * @param {number} cols
 * @returns {Object} { valid, message }
 */
function validateRectsServer(rects, cols) {
  const seen = {};

  for (let i = 0; i < rects.length; i++) {
    const rect = rects[i];

    // widget_idチェック
    if (!rect.widget_id) {
      return { valid: false, message: 'rect[' + i + ']: widget_idが必要です' };
    }

    // 数値チェック
    if (!isPositiveInt(rect.x) || !isPositiveInt(rect.y) ||
        !isPositiveInt(rect.w) || !isPositiveInt(rect.h)) {
      return { valid: false, message: 'rect[' + i + ']: x,y,w,hは正の整数である必要があります' };
    }

    // 最小サイズ
    if (rect.w < 1 || rect.h < 1) {
      return { valid: false, message: 'rect[' + i + ']: w,hは1以上である必要があります' };
    }

    // 列数超えチェック
    if (rect.x + rect.w - 1 > cols) {
      return { valid: false, message: 'rect[' + i + ']: 列数(' + cols + ')を超えています' };
    }

    // x,yが1以上
    if (rect.x < 1 || rect.y < 1) {
      return { valid: false, message: 'rect[' + i + ']: x,yは1以上である必要があります' };
    }

    seen[rect.widget_id] = rect;
  }

  // 衝突チェック（全ペア）
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      if (collidesServer(rects[i], rects[j])) {
        return {
          valid: false,
          message: 'ウィジェット ' + rects[i].widget_id + ' と ' + rects[j].widget_id + ' が衝突しています'
        };
      }
    }
  }

  return { valid: true, message: '' };
}

/**
 * 正の整数かチェック
 * @param {any} val
 * @returns {boolean}
 */
function isPositiveInt(val) {
  return typeof val === 'number' && Number.isInteger(val) && val > 0;
}

/**
 * AABB衝突判定（サーバ用）
 * @param {Object} a - { x, y, w, h }
 * @param {Object} b - { x, y, w, h }
 * @returns {boolean}
 */
function collidesServer(a, b) {
  const aRight = a.x + a.w - 1;
  const aBottom = a.y + a.h - 1;
  const bRight = b.x + b.w - 1;
  const bBottom = b.y + b.h - 1;

  if (aRight < b.x) return false;
  if (a.x > bRight) return false;
  if (aBottom < b.y) return false;
  if (a.y > bBottom) return false;

  return true;
}

/**
 * 既存レイアウトデータを取得（before用）
 * @param {string} pageId
 * @param {string} bp
 * @returns {Array}
 */
function getExistingLayoutData(pageId, bp) {
  const layoutData = getSheetData(SHEET_NAMES.LAYOUT);
  return layoutData
    .filter(l => l.page_id === pageId && l.breakpoint && l.breakpoint.toUpperCase() === bp.toUpperCase())
    .map(l => ({
      widget_id: l.widget_id,
      x: l.x,
      y: l.y,
      w: l.w,
      h: l.h,
      auto: l.auto,
      pinned: l.pinned,
      z_index: l.z_index
    }));
}

/**
 * 03_レイアウトへUpsert
 * @param {string} pageId
 * @param {string} bp
 * @param {Array} rects
 * @returns {Object} { updated, inserted }
 */
function upsertLayoutRows(pageId, bp, rects) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(SHEET_NAMES.LAYOUT);

  if (!sheet) {
    throw new Error('03_レイアウトシートが見つかりません');
  }

  // 全データ取得
  const data = sheet.getDataRange().getValues();
  const headerRowIndex = findHeaderRowIndex(data);

  if (headerRowIndex === -1) {
    throw new Error('ヘッダー行が見つかりません');
  }

  const headers = data[headerRowIndex];

  // 列インデックスマップ作成
  const colIndex = {};
  headers.forEach((h, i) => {
    const key = String(h).trim();
    colIndex[key] = i;
  });

  // 必須列の存在確認
  const requiredCols = ['ウィジェットID*', 'ページID*', 'ブレイクポイント*', 'X', 'Y', '幅(w)*', '高さ(h)*', '自動配置*'];
  for (const col of requiredCols) {
    if (colIndex[col] === undefined) {
      throw new Error('列が見つかりません: ' + col);
    }
  }

  // 既存行を widget_id → 行番号 でマップ
  const existingRows = {}; // { widget_id: rowIndex (1-based) }
  for (let i = headerRowIndex + 1; i < data.length; i++) {
    const row = data[i];
    const rowPageId = row[colIndex['ページID*']];
    const rowBp = String(row[colIndex['ブレイクポイント*']] || '').toUpperCase();
    const rowWidgetId = row[colIndex['ウィジェットID*']];

    if (rowPageId === pageId && rowBp === bp.toUpperCase() && rowWidgetId) {
      existingRows[rowWidgetId] = i + 1; // 1-based
    }
  }

  let updated = 0;
  let inserted = 0;

  // Upsert処理
  for (const rect of rects) {
    const widgetId = rect.widget_id;
    const rowNum = existingRows[widgetId];

    // source=manual ならauto=FALSE、それ以外はTRUE
    // ただし、編集されたものはauto=FALSEにする
    const autoValue = rect.source === 'manual' ? false : true;

    if (rowNum) {
      // 既存行を更新
      sheet.getRange(rowNum, colIndex['X'] + 1).setValue(rect.x);
      sheet.getRange(rowNum, colIndex['Y'] + 1).setValue(rect.y);
      sheet.getRange(rowNum, colIndex['幅(w)*'] + 1).setValue(rect.w);
      sheet.getRange(rowNum, colIndex['高さ(h)*'] + 1).setValue(rect.h);
      sheet.getRange(rowNum, colIndex['自動配置*'] + 1).setValue(autoValue);

      // 固定・重なり順は既存値を保持（payloadになければ）
      if (colIndex['固定'] !== undefined && rect.pinned !== undefined) {
        sheet.getRange(rowNum, colIndex['固定'] + 1).setValue(rect.pinned);
      }
      if (colIndex['重なり順'] !== undefined && rect.z_index !== undefined) {
        sheet.getRange(rowNum, colIndex['重なり順'] + 1).setValue(rect.z_index);
      }

      updated++;
    } else {
      // 新規行を追加
      const newRow = new Array(headers.length).fill('');
      newRow[colIndex['ウィジェットID*']] = widgetId;
      newRow[colIndex['ページID*']] = pageId;
      newRow[colIndex['ブレイクポイント*']] = bp.toUpperCase();
      newRow[colIndex['X']] = rect.x;
      newRow[colIndex['Y']] = rect.y;
      newRow[colIndex['幅(w)*']] = rect.w;
      newRow[colIndex['高さ(h)*']] = rect.h;
      newRow[colIndex['自動配置*']] = autoValue;

      if (colIndex['固定'] !== undefined) {
        newRow[colIndex['固定']] = rect.pinned || false;
      }
      if (colIndex['重なり順'] !== undefined) {
        newRow[colIndex['重なり順']] = rect.z_index || 0;
      }

      sheet.appendRow(newRow);
      inserted++;
    }
  }

  return { updated, inserted };
}

/**
 * 監査ログを書き込み
 * @param {Object} data - { action, pageId, bp, before, after, result, message }
 * @param {string} actor - ユーザーメール
 */
function writeAuditLog(data, actor) {
  try {
    const ss = getSpreadsheet();
    let sheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);

    // シートが無ければ作成
    if (!sheet) {
      sheet = createAuditLogSheet(ss);
    }

    const timestamp = new Date().toISOString();

    // JSONを文字列化（長すぎる場合は切り詰め）
    const beforeJson = data.before ? JSON.stringify(data.before) : '';
    const afterJson = data.after ? JSON.stringify(data.after) : '';

    const maxLen = 50000; // スプレッドシートのセル最大文字数考慮
    const beforeJsonTrunc = beforeJson.length > maxLen ? beforeJson.substring(0, maxLen) + '...[truncated]' : beforeJson;
    const afterJsonTrunc = afterJson.length > maxLen ? afterJson.substring(0, maxLen) + '...[truncated]' : afterJson;

    const row = [
      timestamp,
      actor,
      data.action || 'save_layout',
      data.pageId || '',
      data.bp || '',
      beforeJsonTrunc,
      afterJsonTrunc,
      data.result || 'unknown',
      data.message || ''
    ];

    sheet.appendRow(row);
    Logger.log('Audit log written: ' + data.action + ' - ' + data.result);

  } catch (e) {
    Logger.log('writeAuditLog error: ' + e.message);
    // 監査ログ書き込み失敗は握りつぶさない（エラーを投げる）
    throw e;
  }
}

/**
 * 監査ログシートを作成
 * @param {GoogleAppsScript.Spreadsheet.Spreadsheet} ss
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function createAuditLogSheet(ss) {
  const sheet = ss.insertSheet(AUDIT_LOG_SHEET_NAME);

  // ヘッダー行
  const headers = ['timestamp', 'actor', 'action', 'page_id', 'bp', 'before_json', 'after_json', 'result', 'message'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);

  // ヘッダー行のスタイル
  sheet.getRange(1, 1, 1, headers.length)
    .setBackground('#e8f0fe')
    .setFontWeight('bold');

  // 列幅調整
  sheet.setColumnWidth(1, 180); // timestamp
  sheet.setColumnWidth(2, 200); // actor
  sheet.setColumnWidth(3, 100); // action
  sheet.setColumnWidth(4, 100); // page_id
  sheet.setColumnWidth(5, 80);  // bp
  sheet.setColumnWidth(6, 300); // before_json
  sheet.setColumnWidth(7, 300); // after_json
  sheet.setColumnWidth(8, 80);  // result
  sheet.setColumnWidth(9, 200); // message

  Logger.log('Audit log sheet created: ' + AUDIT_LOG_SHEET_NAME);
  return sheet;
}

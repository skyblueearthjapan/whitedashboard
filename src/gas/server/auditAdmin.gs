/**
 * auditAdmin.gs - 監査ログ閲覧API
 *
 * Phase5（監査）/ Phase10（運用UI）
 */

// 監査ログ列マッピング
const AUDIT_COLUMNS = {
  'timestamp': 0,
  'actor': 1,
  'action': 2,
  'page_id': 3,
  'bp': 4,
  'before_json': 5,
  'after_json': 6,
  'result': 7,
  'message': 8
};

/**
 * 監査ログ一覧を取得
 * @param {Object} params - フィルタパラメータ
 * @returns {Object} { ok, logs, totalCount, actions, error }
 */
function listAuditLogs(params) {
  try {
    // 権限チェック
    if (!checkIsEditor()) {
      return { ok: false, error: '権限がありません' };
    }

    params = params || {};
    const limit = params.limit || 200;
    const startDate = params.start_date || '';
    const endDate = params.end_date || '';
    const actorFilter = (params.actor || '').toLowerCase().trim();
    const actionFilter = params.action || '';
    const resultFilter = params.result || '';
    const pageIdFilter = (params.page_id || '').toLowerCase().trim();

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);

    // シートが存在しない場合
    if (!sheet) {
      return {
        ok: true,
        logs: [],
        totalCount: 0,
        actions: [],
        message: '監査ログがまだありません'
      };
    }

    const data = sheet.getDataRange().getValues();

    // データが1行以下（ヘッダーのみ or 空）の場合
    if (data.length <= 1) {
      return {
        ok: true,
        logs: [],
        totalCount: 0,
        actions: [],
        message: '監査ログがまだありません'
      };
    }

    // ヘッダーから列インデックスを取得
    const headers = data[0];
    const colIndex = buildAuditColumnIndex(headers);

    // ログをオブジェクト配列に変換（ヘッダー行をスキップ）
    const allLogs = [];
    const actionSet = new Set();

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const log = rowToLogObject(row, colIndex);

      if (log.action) {
        actionSet.add(log.action);
      }

      // フィルタ適用
      if (!matchesFilters(log, {
        startDate, endDate, actorFilter, actionFilter, resultFilter, pageIdFilter
      })) {
        continue;
      }

      allLogs.push(log);
    }

    // 新しい順（timestamp降順）
    allLogs.sort((a, b) => {
      const dateA = new Date(a.timestamp || 0);
      const dateB = new Date(b.timestamp || 0);
      return dateB - dateA;
    });

    // 件数制限
    const totalCount = allLogs.length;
    const limitedLogs = allLogs.slice(0, limit);

    // アクション種別リスト（フィルタUI用）
    const actions = Array.from(actionSet).sort();

    return {
      ok: true,
      logs: limitedLogs,
      totalCount: totalCount,
      actions: actions
    };

  } catch (e) {
    Logger.log('listAuditLogs error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

/**
 * 監査ログ詳細を取得
 * @param {number} rowIndex - 行インデックス
 * @returns {Object} { ok, log, error }
 */
function getAuditLogDetail(rowIndex) {
  try {
    // 権限チェック
    if (!checkIsEditor()) {
      return { ok: false, error: '権限がありません' };
    }

    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);

    if (!sheet) {
      return { ok: false, error: '監査ログシートがありません' };
    }

    const data = sheet.getDataRange().getValues();
    const headers = data[0];
    const colIndex = buildAuditColumnIndex(headers);

    if (rowIndex < 1 || rowIndex >= data.length) {
      return { ok: false, error: '無効な行インデックス' };
    }

    const row = data[rowIndex];
    const log = rowToLogObject(row, colIndex);

    // JSONをパース試行（詳細表示用）
    log.beforeParsed = safeParseJson(log.before_json);
    log.afterParsed = safeParseJson(log.after_json);

    return { ok: true, log: log };

  } catch (e) {
    Logger.log('getAuditLogDetail error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

// =====================================================
// ヘルパー関数
// =====================================================

/**
 * ヘッダーから列インデックスマップを構築
 * @param {Array} headers
 * @returns {Object}
 */
function buildAuditColumnIndex(headers) {
  const colIndex = {};
  headers.forEach((h, i) => {
    const key = String(h).trim().toLowerCase();
    colIndex[key] = i;
  });
  return colIndex;
}

/**
 * 行データをログオブジェクトに変換
 * @param {Array} row
 * @param {Object} colIndex
 * @returns {Object}
 */
function rowToLogObject(row, colIndex) {
  const getValue = (key) => {
    const idx = colIndex[key];
    if (idx !== undefined && row[idx] !== undefined) {
      return row[idx];
    }
    return '';
  };

  return {
    timestamp: formatTimestamp(getValue('timestamp')),
    actor: getValue('actor'),
    action: getValue('action'),
    page_id: getValue('page_id'),
    bp: getValue('bp'),
    before_json: getValue('before_json'),
    after_json: getValue('after_json'),
    result: getValue('result'),
    message: getValue('message')
  };
}

/**
 * タイムスタンプをフォーマット
 * @param {*} value
 * @returns {string}
 */
function formatTimestamp(value) {
  if (!value) return '';

  // Dateオブジェクトの場合
  if (value instanceof Date) {
    return value.toISOString();
  }

  // 文字列の場合はそのまま
  return String(value);
}

/**
 * フィルタ条件にマッチするか判定
 * @param {Object} log
 * @param {Object} filters
 * @returns {boolean}
 */
function matchesFilters(log, filters) {
  const { startDate, endDate, actorFilter, actionFilter, resultFilter, pageIdFilter } = filters;

  // 期間フィルタ
  if (startDate || endDate) {
    const logDate = new Date(log.timestamp);
    if (isNaN(logDate.getTime())) {
      // 日付パース失敗時はフィルタから除外しない
    } else {
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        if (logDate < start) return false;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (logDate > end) return false;
      }
    }
  }

  // actorフィルタ（部分一致）
  if (actorFilter) {
    if (!(log.actor || '').toLowerCase().includes(actorFilter)) {
      return false;
    }
  }

  // actionフィルタ（完全一致）
  if (actionFilter) {
    if (log.action !== actionFilter) {
      return false;
    }
  }

  // resultフィルタ（完全一致）
  if (resultFilter) {
    if (log.result !== resultFilter) {
      return false;
    }
  }

  // page_idフィルタ（部分一致）
  if (pageIdFilter) {
    if (!(log.page_id || '').toLowerCase().includes(pageIdFilter)) {
      return false;
    }
  }

  return true;
}

/**
 * JSONを安全にパース
 * @param {string} jsonStr
 * @returns {Object|null}
 */
function safeParseJson(jsonStr) {
  if (!jsonStr || jsonStr === '') {
    return null;
  }

  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    // パース失敗時は文字列として返す
    return { _parseError: true, _raw: String(jsonStr) };
  }
}

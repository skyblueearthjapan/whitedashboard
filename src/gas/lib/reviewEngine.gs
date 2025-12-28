/**
 * reviewEngine.gs - 棚卸判定ロジック
 *
 * Phase9（P0/P1改善）/ Phase10（運用安定化）/ Phase5（監査ログ活用）
 *
 * ウィジェットの棚卸期限を計算し、ステータスを判定する。
 * 日付計算はすべてサーバ側で行う。
 */

// review_cycle ごとの期限日数
const REVIEW_CYCLE_DAYS = {
  'monthly': 30,
  'quarterly': 90,
  'yearly': 365
};

// 期限警告の閾値（日）
const DUE_SOON_THRESHOLD = 7;

/**
 * 全ウィジェットの棚卸ステータスを計算
 * @param {Array} widgets - ウィジェット配列
 * @returns {Object} - { statuses: [...], summary: {...} }
 */
function computeAllReviewStatuses(widgets) {
  try {
    // 監査ログを読み込み
    const auditLogs = getAuditLogsForReview();

    const statuses = [];
    const summary = {
      overdue: 0,
      dueSoon: 0,
      neverReviewed: 0,
      ok: 0,
      exempt: 0
    };

    widgets.forEach(w => {
      const status = computeWidgetReviewStatus(w, auditLogs);

      // サマリー更新
      switch (status.reviewStatus) {
        case 'overdue':
          summary.overdue++;
          break;
        case 'due_soon':
          summary.dueSoon++;
          break;
        case 'never_reviewed':
          summary.neverReviewed++;
          break;
        case 'ok':
          summary.ok++;
          break;
        case 'exempt':
          summary.exempt++;
          break;
      }

      // exempt以外は結果に含める
      if (status.reviewStatus !== 'exempt') {
        statuses.push({
          widgetId: w.widgetId,
          title: w.title,
          owner: w.owner || '(未設定)',
          reviewCycle: w.reviewCycle,
          ...status
        });
      }
    });

    return { statuses, summary };

  } catch (e) {
    Logger.log('computeAllReviewStatuses error: ' + e.message);
    return { statuses: [], summary: { overdue: 0, dueSoon: 0, neverReviewed: 0, ok: 0, exempt: 0 } };
  }
}

/**
 * 個別ウィジェットの棚卸ステータスを計算
 * @param {Object} widget - ウィジェットオブジェクト
 * @param {Array} auditLogs - 監査ログ配列
 * @returns {Object} - { reviewStatus, lastReviewedAt, nextDueDate, daysUntilDue }
 */
function computeWidgetReviewStatus(widget, auditLogs) {
  // review_cycle がなし/none/空の場合は対象外
  if (!widget.reviewCycle || widget.reviewCycle === 'none' || widget.reviewCycle.trim() === '') {
    return { reviewStatus: 'exempt' };
  }

  const cycleDays = REVIEW_CYCLE_DAYS[widget.reviewCycle];
  if (!cycleDays) {
    // 未知の周期（weekly など将来用）
    return {
      reviewStatus: 'unknown_cycle',
      message: '不明な棚卸周期: ' + widget.reviewCycle
    };
  }

  // last_reviewed_at を決定
  const lastReviewedAt = determineLastReviewedAt(widget, auditLogs);

  if (!lastReviewedAt) {
    return {
      reviewStatus: 'never_reviewed',
      lastReviewedAt: null,
      nextDueDate: null,
      daysUntilDue: null,
      message: 'まだレビューされていません'
    };
  }

  // 期限計算
  const now = new Date();
  const nextDueDate = new Date(lastReviewedAt);
  nextDueDate.setDate(nextDueDate.getDate() + cycleDays);

  const daysUntilDue = Math.floor((nextDueDate - now) / (1000 * 60 * 60 * 24));

  let status;
  let message;

  if (daysUntilDue < 0) {
    status = 'overdue';
    message = cycleDays + '日周期を' + Math.abs(daysUntilDue) + '日超過';
  } else if (daysUntilDue <= DUE_SOON_THRESHOLD) {
    status = 'due_soon';
    message = 'あと' + daysUntilDue + '日で期限';
  } else {
    status = 'ok';
    message = '期限まで' + daysUntilDue + '日';
  }

  return {
    reviewStatus: status,
    lastReviewedAt: formatDateString(lastReviewedAt),
    nextDueDate: formatDateString(nextDueDate),
    daysUntilDue: daysUntilDue,
    message: message
  };
}

/**
 * last_reviewed_at を決定
 * 優先順位:
 * 1. ウィジェットの last_reviewed_at 列
 * 2. 監査ログから該当アクションの最新timestamp
 * 3. null（未レビュー）
 *
 * @param {Object} widget - ウィジェットオブジェクト
 * @param {Array} auditLogs - 監査ログ配列
 * @returns {Date|null}
 */
function determineLastReviewedAt(widget, auditLogs) {
  // 1. ウィジェットに last_reviewed_at があればそれを使用
  if (widget.lastReviewedAt) {
    const parsed = parseDate(widget.lastReviewedAt);
    if (parsed) return parsed;
  }

  // 2. 監査ログから取得
  const widgetId = widget.widgetId;
  const relevantActions = ['create_widget', 'update_widget', 'hide_widget', 'save_layout'];

  let latestTimestamp = null;

  auditLogs.forEach(log => {
    // アクションが該当するかチェック
    if (!relevantActions.includes(log.action)) {
      return;
    }

    // save_layout の場合は after_json に該当 widget_id が含まれているか確認
    if (log.action === 'save_layout') {
      if (!isWidgetInLayoutJson(log.after_json, widgetId)) {
        return;
      }
    } else {
      // create_widget, update_widget, hide_widget の場合は after_json でwidget_idを確認
      if (!isWidgetInJson(log.after_json, widgetId)) {
        return;
      }
    }

    const timestamp = parseDate(log.timestamp);
    if (timestamp && (!latestTimestamp || timestamp > latestTimestamp)) {
      latestTimestamp = timestamp;
    }
  });

  return latestTimestamp;
}

/**
 * JSON内に該当 widget_id が含まれているか確認（create/update/hide用）
 * @param {string} jsonStr - JSON文字列
 * @param {string} widgetId - ウィジェットID
 * @returns {boolean}
 */
function isWidgetInJson(jsonStr, widgetId) {
  if (!jsonStr) return false;

  try {
    const data = JSON.parse(jsonStr);

    // 直接 widget_id プロパティがある場合
    if (data.widget_id === widgetId || data.widgetId === widgetId) {
      return true;
    }

    // 配列の場合
    if (Array.isArray(data)) {
      return data.some(item => item.widget_id === widgetId || item.widgetId === widgetId);
    }

    return false;
  } catch (e) {
    // JSONパース失敗時は文字列として検索
    return jsonStr.includes(widgetId);
  }
}

/**
 * レイアウトJSON内に該当 widget_id が含まれているか確認（save_layout用）
 * @param {string} jsonStr - JSON文字列
 * @param {string} widgetId - ウィジェットID
 * @returns {boolean}
 */
function isWidgetInLayoutJson(jsonStr, widgetId) {
  if (!jsonStr) return false;

  try {
    const data = JSON.parse(jsonStr);

    // 配列の場合（rects配列）
    if (Array.isArray(data)) {
      return data.some(item => item.widget_id === widgetId || item.widgetId === widgetId);
    }

    return false;
  } catch (e) {
    // JSONパース失敗時は文字列として検索
    return jsonStr.includes(widgetId);
  }
}

/**
 * 日付をパース
 * @param {*} value - 日付値
 * @returns {Date|null}
 */
function parseDate(value) {
  if (!value) return null;

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value;
  }

  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * 日付を YYYY-MM-DD 形式の文字列に変換
 * @param {Date} date
 * @returns {string}
 */
function formatDateString(date) {
  if (!date) return null;
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * レビュー用に監査ログを取得
 * @returns {Array}
 */
function getAuditLogsForReview() {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(AUDIT_LOG_SHEET_NAME);

    if (!sheet) return [];

    const data = sheet.getDataRange().getValues();
    if (data.length <= 1) return [];

    const headers = data[0];
    const colIndex = {};
    headers.forEach((h, i) => {
      const key = String(h).trim().toLowerCase();
      colIndex[key] = i;
    });

    const logs = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      logs.push({
        timestamp: row[colIndex['timestamp']] || '',
        actor: row[colIndex['actor']] || '',
        action: row[colIndex['action']] || '',
        page_id: row[colIndex['page_id']] || '',
        bp: row[colIndex['bp']] || '',
        before_json: row[colIndex['before_json']] || '',
        after_json: row[colIndex['after_json']] || '',
        result: row[colIndex['result']] || '',
        message: row[colIndex['message']] || ''
      });
    }

    return logs;
  } catch (e) {
    Logger.log('getAuditLogsForReview error: ' + e.message);
    return [];
  }
}

/**
 * 棚卸ステータスをconfig.widgetsに付与して返す
 * @param {Object} config - getConfig()の結果
 * @returns {Object} - reviewStatusが追加されたconfig
 */
function enrichConfigWithReviewStatus(config) {
  try {
    const auditLogs = getAuditLogsForReview();

    // 各ウィジェットに棚卸ステータスを追加
    config.widgets = config.widgets.map(w => {
      const status = computeWidgetReviewStatus(w, auditLogs);
      return {
        ...w,
        reviewStatus: status.reviewStatus,
        lastReviewedAt: status.lastReviewedAt || null,
        nextDueDate: status.nextDueDate || null,
        daysUntilDue: status.daysUntilDue,
        reviewMessage: status.message || null
      };
    });

    return config;
  } catch (e) {
    Logger.log('enrichConfigWithReviewStatus error: ' + e.message);
    return config;
  }
}

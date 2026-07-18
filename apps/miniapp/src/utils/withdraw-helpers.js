const { CHINA_TIME_OFFSET_MS } = require("./constants");

const EMPTY_RULE_SNAPSHOT = {
  amountRangeText: "加载中",
  feeText: "加载中",
  frozenText: "加载中",
  auditText: "加载中",
  exceptionText: "加载中",
};

function getChinaDateKey(date = new Date()) {
  return new Date(date.getTime() + CHINA_TIME_OFFSET_MS).toISOString().slice(0, 10);
}

function getChinaDateKeyFromValue(value) {
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return getChinaDateKey(parsed);
  return String(value || "").slice(0, 10);
}

function buildDailySubmitMeta(records = [], serverDate = getChinaDateKey()) {
  const today = serverDate || getChinaDateKey();
  const todayCount = records.filter((record) => getChinaDateKeyFromValue(record.createdAt) === today).length;
  return {
    dailyRemain: null,
    dailyRemainText: `今日已提交 ${todayCount} 次，不限次数`,
  };
}

function buildWithdrawRuleView(rules = {}) {
  const snapshot = rules.snapshot || EMPTY_RULE_SNAPSHOT;
  return {
    withdrawRules: rules,
    withdrawRuleSnapshot: snapshot,
    withdrawRuleSummaryItems: rules.summaryItems || [],
    submitWindowText: snapshot.windowText || "规则加载中",
    arrivalText: snapshot.arrivalText || "规则加载中",
    submitWindowOpen: rules.submitWindowOpen === true,
    submitWindowStatusText: rules.submitWindowStatusText || "提现规则加载中",
    submitWindowCountdownText: rules.submitWindowCountdownText || "",
    submitWindowTone: rules.submitWindowTone || "neutral",
  };
}

function normalizeAmountInput(value) {
  const raw = String(value || "").replace(/[^\d.]/g, "");
  const decimalIndex = raw.indexOf(".");
  const integerPart = (decimalIndex >= 0 ? raw.slice(0, decimalIndex) : raw).replace(/^0+(?=\d)/, "");
  if (decimalIndex < 0) return integerPart;
  const decimalPart = raw.slice(decimalIndex + 1).replace(/\./g, "").slice(0, 2);
  return `${integerPart || "0"}.${decimalPart}`;
}

function sortWithdrawRecords(records = []) {
  return [...records].sort((left, right) => {
    const leftTime = new Date(left.createdAt || 0).getTime();
    const rightTime = new Date(right.createdAt || 0).getTime();
    return rightTime - leftTime;
  });
}

function buildRecordView(records = []) {
  const sortedRecords = sortWithdrawRecords(records);
  return {
    records: sortedRecords,
    recentRecords: sortedRecords.slice(0, 3),
    emptyText: sortedRecords.length ? "" : "暂无提现记录",
  };
}

module.exports = {
  EMPTY_RULE_SNAPSHOT,
  getChinaDateKey,
  getChinaDateKeyFromValue,
  buildDailySubmitMeta,
  buildWithdrawRuleView,
  normalizeAmountInput,
  sortWithdrawRecords,
  buildRecordView,
};

const { CHINA_TIME_OFFSET_MS } = require("./constants");

const statusLabels = {
  ACTIVE: "正常",
  AGREED: "已同意",
  APPLIED: "已申请",
  APPROVED: "已通过",
  AVAILABLE: "可用",
  BOUND: "已绑定",
  CANCELLED: "已取消",
  COMPLETED: "已完成",
  ENABLED: "启用",
  EFFECTIVE: "已生效",
  FAILED: "失败",
  FINANCE_REJECTED: "财审驳回",
  FIRST_REJECTED: "初审驳回",
  FROZEN: "已冻结",
  INVALID: "无效",
  MISSING: "未填写",
  NEED_RESIGN: "需重新签约",
  PAID: "已付款",
  PAUSED: "已暂停",
  PAY_FAILED: "打款失败",
  PAYING: "打款中",
  PENDING: "待处理",
  PENDING_FINANCE_REVIEW: "待管理员财审",
  PENDING_FIRST_REVIEW: "待财务经理初审",
  PENDING_REVIEW: "待审核",
  PENDING_SUPER_REVIEW: "待超管终审",
  PENDING_SYNC: "待同步",
  QUALIFIED: "已达标",
  READ: "已读",
  READY: "就绪",
  REJECTED: "已驳回",
  RETURNED: "已退回",
  SAVED: "已保存",
  SENT_LOCAL: "已本地记录",
  SIGNED: "已签约",
  SIGNING: "签约中",
  SUBMITTED: "已提交",
  SUCCESS: "成功",
  SUPER_REJECTED: "终审驳回",
  UNBOUND: "未绑定",
  UNFREEZE: "已解冻",
  UNREAD: "未读",
  UNSIGNED: "未签约",
  USED: "已使用",
  USED_BY_OTHER: "已被其他主播使用",
  WAIT_PAY: "待线下付款",
  WAIT_BATCH: "待成批",
};

const directionLabels = {
  CREDIT: "入账",
  DEBIT: "扣减",
  FREEZE: "冻结",
  IN: "入账",
  OUT: "扣减",
  RELEASE: "释放",
  UNFREEZE: "解冻",
};

const typeLabels = {
  BALANCE_ADJUSTMENT: "余额调账",
  IMPORT: "导入同步",
  MANUAL_ADJUSTMENT: "人工调整",
  OFFLINE_PAYMENT: "线下打款",
  PAYMENT_INFO: "打款信息",
  PLATFORM_ACCOUNT: "平台账号",
  TASK_REWARD: "任务奖励",
  WITHDRAW: "提现",
  WITHDRAW_APPLY: "提现申请",
  WITHDRAW_FREEZE: "提现冻结",
  WITHDRAW_REJECT: "提现驳回",
  YZH_PAYMENT_INFO: "打款信息",
};

const pendingStatuses = new Set(["APPLIED", "NEED_RESIGN", "PENDING", "PENDING_FINANCE_REVIEW", "PENDING_FIRST_REVIEW", "PENDING_REVIEW", "PENDING_SUPER_REVIEW", "SIGNING", "SUBMITTED", "WAIT_BATCH", "WAIT_PAY", "PAYING", "PENDING_SYNC"]);
const successStatuses = new Set(["ACTIVE", "AGREED", "APPROVED", "AVAILABLE", "BOUND", "COMPLETED", "EFFECTIVE", "ENABLED", "PAID", "QUALIFIED", "READ", "READY", "SAVED", "SENT_LOCAL", "SIGNED", "SUCCESS", "USED"]);
const dangerStatuses = new Set(["CANCELLED", "FAILED", "FINANCE_REJECTED", "FIRST_REJECTED", "FROZEN", "INVALID", "MISSING", "PAUSED", "PAY_FAILED", "REJECTED", "RETURNED", "SUPER_REJECTED", "UNBOUND", "UNSIGNED", "USED_BY_OTHER"]);

function normalizeStatus(value) {
  if (value && typeof value === "object") {
    return normalizeStatus(value.signStatus || value.status || value.reviewStatus || value.paymentInfoStatus);
  }
  return String(value || "").trim().toUpperCase();
}

function prettifyUnknown(value) {
  const text = String(value || "").trim();
  if (!text) return "-";
  return text.replace(/_/g, " ").replace(/\s+/g, " ");
}

function statusLabel(value) {
  const normalized = normalizeStatus(value);
  return statusLabels[normalized] || prettifyUnknown(value);
}

function statusTone(value) {
  const normalized = normalizeStatus(value);
  if (successStatuses.has(normalized)) return "success";
  if (pendingStatuses.has(normalized)) return "pending";
  if (dangerStatuses.has(normalized)) return "danger";
  return "neutral";
}

function directionLabel(value) {
  const normalized = normalizeStatus(value);
  return directionLabels[normalized] || prettifyUnknown(value);
}

function typeLabel(value) {
  const normalized = normalizeStatus(value);
  return typeLabels[normalized] || prettifyUnknown(value);
}

function yesNo(value) {
  if (value === true || value === "true" || value === "YES" || value === 1) return "是";
  if (value === false || value === "false" || value === "NO" || value === 0) return "否";
  return "-";
}

function isSigned(value) {
  return normalizeStatus(value) === "SIGNED";
}

function isPaymentInfoReady(value) {
  return normalizeStatus(value) === "EFFECTIVE";
}

function formatChinaDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  const chinaDate = new Date(parsed.getTime() + CHINA_TIME_OFFSET_MS);
  const iso = chinaDate.toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

const ruleCodeLabels = {
  DAILY_VALID_DAYS: "月度有效天数达标",
  DAILY_VALID_DURATION: "月度有效时长达标",
  MONTHLY_INCOME_TARGET: "月度收入目标达标",
  PLATFORM_BIND_COUNT: "平台绑定数量达标",
  SIGN_COMPLETION: "签约完成奖励",
  WITHDRAW_FREQUENCY: "提现频率达标",
};

function ruleCodeLabel(value) {
  const text = String(value || "").trim();
  return ruleCodeLabels[text] || prettifyUnknown(value);
}

function formatDateShort(value) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const chinaDate = new Date(parsed.getTime() + CHINA_TIME_OFFSET_MS);
  const iso = chinaDate.toISOString();
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
}

function getCurrentChinaMonth(now = Date.now()) {
  const timestamp = now instanceof Date ? now.getTime() : Number(now);
  const safeTimestamp = Number.isFinite(timestamp) ? timestamp : Date.now();
  return new Date(safeTimestamp + CHINA_TIME_OFFSET_MS).toISOString().slice(0, 7);
}

module.exports = {
  directionLabel,
  formatDateShort,
  formatChinaDateTime,
  getCurrentChinaMonth,
  isPaymentInfoReady,
  isSigned,
  normalizeStatus,
  ruleCodeLabel,
  statusLabel,
  statusTone,
  typeLabel,
  yesNo,
};

export const SHANGHAI_TIME_ZONE = "Asia/Shanghai";
export const WITHDRAW_OPEN_HOUR = 8;
export const WITHDRAW_CLOSE_HOUR = 16;
export const MIN_WITHDRAW_CENTS = 10_000;

export function normalizeBixinId(value) {
  const id = String(value ?? "").trim();
  if (!/^\d{1,20}$/.test(id)) throw new Error("比心用户 ID 必须是 1–20 位数字");
  return id;
}

export function amountCentsFromStar(value) {
  const star = Number(String(value ?? "").replaceAll(",", "").trim());
  if (!Number.isFinite(star) || star < 0) throw new Error("总星动值必须是非负数字");
  return Math.round(star * 0.58);
}

export function shanghaiParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SHANGHAI_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday),
  };
}

export function resolveOpenDay({ weekdayOpen = true, dateOverride = null } = {}) {
  return dateOverride === null || dateOverride === undefined ? Boolean(weekdayOpen) : Boolean(dateOverride);
}

export function evaluateWithdrawWindow({ now = new Date(), weekdayOpen = true, dateOverride = null } = {}) {
  const parts = shanghaiParts(now);
  const openDay = resolveOpenDay({ weekdayOpen, dateOverride });
  const withinHours = parts.hour >= WITHDRAW_OPEN_HOUR && parts.hour < WITHDRAW_CLOSE_HOUR;
  return {
    businessDate: parts.date,
    openDay,
    withinHours,
    isOpen: openDay && withinHours,
    canExport: parts.hour >= WITHDRAW_CLOSE_HOUR,
    reason: !openDay ? "TODAY_CLOSED" : !withinHours ? "OUTSIDE_WITHDRAW_WINDOW" : "OPEN",
  };
}

export function inferBusinessDate(fileName) {
  const text = String(fileName || "");
  const match = text.match(/(20\d{2})[-_.年](\d{1,2})[-_.月](\d{1,2})/);
  if (!match) throw new Error("无法从文件名识别数据日期");
  const date = `${match[1]}-${String(match[2]).padStart(2, "0")}-${String(match[3]).padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) throw new Error("文件名中的日期无效");
  if (shanghaiParts(parsed).date !== date) throw new Error("文件名中的日期无效");
  return date;
}

export function assertUniqueIds(rows) {
  const seen = new Map();
  const duplicates = [];
  rows.forEach((row, index) => {
    const id = normalizeBixinId(row.bixinUserId);
    if (seen.has(id)) duplicates.push({ id, firstRow: seen.get(id), row: index + 2 });
    else seen.set(id, index + 2);
  });
  if (duplicates.length) {
    const error = new Error(`文件存在 ${duplicates.length} 个重复 ID`);
    error.code = "DUPLICATE_BIXIN_ID";
    error.details = duplicates.slice(0, 100);
    throw error;
  }
}

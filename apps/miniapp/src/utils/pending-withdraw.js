const pendingWithdrawStorageKey = "withdraw-oa.miniapp.pending-withdraw";
const pendingWithdrawMaxAgeMs = 24 * 60 * 60 * 1000;

function readPendingWithdrawAttempts() {
  const stored = wx.getStorageSync(pendingWithdrawStorageKey);
  if (!stored) return {};
  if (stored.attempts && typeof stored.attempts === "object") return stored.attempts;
  if (stored.anchorId && stored.clientRequestId) return { [stored.anchorId]: stored };
  return {};
}

function persistPendingWithdrawAttempts(attempts = {}) {
  if (Object.keys(attempts).length === 0) {
    wx.removeStorageSync(pendingWithdrawStorageKey);
    return;
  }
  wx.setStorageSync(pendingWithdrawStorageKey, { version: 2, attempts });
}

function readPendingWithdrawAttempt(anchorId) {
  if (!anchorId) return null;
  const attempts = readPendingWithdrawAttempts();
  const attempt = attempts[anchorId];
  if (!attempt || !attempt.clientRequestId || attempt.anchorId !== anchorId) return null;
  if (Date.now() - Number(attempt.createdAt || 0) > pendingWithdrawMaxAgeMs) {
    delete attempts[anchorId];
    persistPendingWithdrawAttempts(attempts);
    return null;
  }
  return attempt;
}

function writePendingWithdrawAttempt(attempt) {
  const anchorId = String(attempt && attempt.anchorId || "").trim();
  if (!anchorId || !attempt.clientRequestId) throw new Error("提现请求信息不完整，请刷新后重试");
  const attempts = readPendingWithdrawAttempts();
  const current = attempts[anchorId];
  if (current && current.clientRequestId !== attempt.clientRequestId) {
    throw new Error("上次提现结果尚未确认，不能发起新请求");
  }
  attempts[anchorId] = attempt;
  persistPendingWithdrawAttempts(attempts);
  return attempt;
}

function clearPendingWithdrawAttempt(anchorId, clientRequestId = "") {
  if (!anchorId) return;
  const attempts = readPendingWithdrawAttempts();
  const current = attempts[anchorId];
  if (!current || (clientRequestId && current.clientRequestId !== clientRequestId)) return;
  delete attempts[anchorId];
  persistPendingWithdrawAttempts(attempts);
}

module.exports = {
  pendingWithdrawStorageKey,
  pendingWithdrawMaxAgeMs,
  readPendingWithdrawAttempts,
  persistPendingWithdrawAttempts,
  readPendingWithdrawAttempt,
  writePendingWithdrawAttempt,
  clearPendingWithdrawAttempt,
};

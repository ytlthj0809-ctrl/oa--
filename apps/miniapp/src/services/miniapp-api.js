const { appendQuery, request } = require("../utils/api");

function getHome(anchorId) {
  return request(appendQuery("/api/miniapp/home", { anchorId }));
}

function getProfile(anchorId) {
  return request(appendQuery("/api/miniapp/profile", { anchorId }));
}

function getProtocols(anchorId, options = {}) {
  return request(appendQuery("/api/miniapp/protocols", { anchorId }), options);
}

function agreeProtocol({ anchorId, protocolType, versionNo }) {
  return request("/api/miniapp/protocols/agree", {
    method: "POST",
    data: { anchorId, protocolType, versionNo },
  });
}

function getContact(options = {}) {
  return request("/api/miniapp/contact", options);
}

function getLegacyHistory(anchorId) {
  return request(appendQuery("/api/miniapp/legacy-history", { anchorId }));
}

function getDataSnapshots({ anchorId, month, platform }) {
  return request(appendQuery("/api/miniapp/data", { anchorId, month, platform }));
}

function listBalanceFlows({ anchorId, direction, page, pageSize } = {}) {
  return request(appendQuery("/api/miniapp/balance-flows", { anchorId, direction, page, pageSize }));
}

function listTaskRewards({ anchorId, page, pageSize } = {}) {
  return request(appendQuery("/api/miniapp/task-rewards", { anchorId, page, pageSize }));
}

function listWithdrawApplies(anchorId) {
  return request(appendQuery("/api/miniapp/withdraw-applies", { anchorId }));
}

function getWithdrawApplyDetail({ anchorId, applyId }) {
  return request(appendQuery(`/api/miniapp/withdraw-applies/${applyId}`, { anchorId }));
}

function listNotifications(anchorId) {
  return request(appendQuery("/api/miniapp/notifications", { anchorId }));
}

function markNotificationRead({ anchorId, notificationId, operatorId = "MINIAPP" }) {
  return request(`/api/miniapp/notifications/${notificationId}/read`, {
    method: "POST",
    data: { anchorId, operatorId },
  });
}

function createWithdrawApply(data) {
  return request("/api/miniapp/withdraw-applies", {
    method: "POST",
    data,
  });
}

function loginByPassword({ loginAccount, password }) {
  return request("/api/miniapp/auth/login", {
    method: "POST",
    data: { loginAccount, password },
  });
}

function loginByWechat(jsCode) {
  return request("/api/miniapp/auth/wechat-login", {
    method: "POST",
    data: { jsCode },
  });
}

function logout() {
  return request("/api/miniapp/auth/logout", {
    method: "POST",
    data: {},
    skipAuthRedirect: true,
  });
}

module.exports = {
  agreeProtocol,
  createWithdrawApply,
  getContact,
  getDataSnapshots,
  getHome,
  getLegacyHistory,
  getProfile,
  getProtocols,
  getWithdrawApplyDetail,
  listBalanceFlows,
  listNotifications,
  listTaskRewards,
  listWithdrawApplies,
  loginByPassword,
  loginByWechat,
  logout,
  markNotificationRead,
};

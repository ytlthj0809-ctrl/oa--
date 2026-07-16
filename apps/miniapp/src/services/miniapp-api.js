const { appendQuery, request } = require("../utils/api");

const bixinRegistrationErrorMessages = {
  BIXIN_ACCOUNT_NO_REQUIRED: "请输入比心 ID",
  BIXIN_WHITELIST_NOT_AVAILABLE: "未找到对应的待注册白名单，请核对比心 ID 或联系运营",
  BIXIN_WHITELIST_RESERVED: "该比心 ID 已有注册申请处理中，请勿重复提交",
  BIXIN_ACCOUNT_ALREADY_BOUND: "该比心 ID 已完成绑定，请返回登录或联系运营",
};

function mapBixinRegistrationError(error) {
  const message = bixinRegistrationErrorMessages[error?.code];
  if (!message) return error;
  const safeError = new Error(message);
  safeError.code = error.code;
  safeError.statusCode = error.statusCode;
  return safeError;
}

function getHome(anchorId) {
  return request(appendQuery("/api/miniapp/home", { anchorId }));
}

function getProfile(anchorId) {
  return request(appendQuery("/api/miniapp/profile", { anchorId }));
}

function getPaymentInfo(anchorId) {
  return request(appendQuery("/api/miniapp/payment-info", { anchorId }));
}

function createPaymentInfo({ anchorId, realName, idCardNo, paymentMobile, bankCardNo }) {
  return request("/api/miniapp/payment-info", {
    method: "POST",
    data: { anchorId, realName, idCardNo, paymentMobile, bankCardNo },
  });
}

function listPaymentInfoChangeRequests({ anchorId, reviewStatus } = {}) {
  return request(appendQuery("/api/miniapp/payment-info/change-requests", { anchorId, reviewStatus }));
}

function createPaymentInfoChangeRequest({
  anchorId,
  patch,
  modifyReason,
  voucherFileIds,
  voucherFileName,
  voucherContent,
  voucherSizeBytes,
  voucherContentType,
}) {
  return request("/api/miniapp/payment-info/change-requests", {
    method: "POST",
    data: {
      anchorId,
      patch,
      modifyReason,
      voucherFileIds,
      voucherFileName,
      voucherContent,
      voucherSizeBytes,
      voucherContentType,
    },
  });
}

function getYzhSignStatus(anchorId) {
  return request(appendQuery("/api/miniapp/yzh/sign-status", { anchorId }));
}

function createYzhPresign({ anchorId, realName, idCardNo, certificateType, collectPhoneNo }) {
  return request("/api/miniapp/yzh/presign", {
    method: "POST",
    data: { anchorId, realName, idCardNo, certificateType, collectPhoneNo },
  });
}

function refreshYzhSignStatus({ anchorId }) {
  return request("/api/miniapp/yzh/refresh", {
    method: "POST",
    data: { anchorId },
  });
}

function getProtocols(anchorId, options = {}) {
  return request(appendQuery("/api/miniapp/protocols", { anchorId }), options);
}

function agreeProtocol({ protocolType, versionNo }) {
  return request("/api/miniapp/protocols/agree", {
    method: "POST",
    data: { protocolType, versionNo },
  });
}

function getContact(options = {}) {
  return request("/api/miniapp/contact", options);
}

function getLegacyHistory(anchorId) {
  return request(appendQuery("/api/miniapp/legacy-history", { anchorId }));
}

function listPlatformAccounts({ anchorId, platform } = {}) {
  return request(appendQuery("/api/miniapp/platform-accounts", { anchorId, platform }));
}

function createPlatformBindRequest({ anchorId, platform, accountNo, reason }) {
  return request("/api/miniapp/platform-bind-requests", {
    method: "POST",
    data: { anchorId, platform, accountNo, reason },
  });
}

async function createAnchorRegistrationRequest({ anchorId, displayName, mobile, bixinAccountNo, wechatBindToken }) {
  try {
    return await request("/api/miniapp/anchor-registration-requests", {
      method: "POST",
      data: { anchorId, displayName, mobile, bixinAccountNo, wechatBindToken },
    });
  } catch (error) {
    throw mapBixinRegistrationError(error);
  }
}

function listAnchorRegistrationRequests({ anchorId, mobile, reviewStatus } = {}) {
  return request(appendQuery("/api/miniapp/anchor-registration-requests", {
    anchorId,
    mobile,
    reviewStatus,
  }));
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

function getWithdrawRules(options = {}) {
  return request("/api/miniapp/withdraw-rules", options);
}

function getWithdrawApplyDetail({ anchorId, applyId }) {
  return request(appendQuery(`/api/miniapp/withdraw-applies/${applyId}`, { anchorId }));
}

function listNotifications(anchorId) {
  return request(appendQuery("/api/miniapp/notifications", { anchorId }));
}

function getNotificationDetail({ anchorId, notificationId }) {
  const safeNotificationId = encodeURIComponent(String(notificationId || ""));
  return request(appendQuery(`/api/miniapp/notifications/${safeNotificationId}`, { anchorId }));
}

function markNotificationRead({ anchorId, notificationId }) {
  const safeNotificationId = encodeURIComponent(String(notificationId || ""));
  return request(`/api/miniapp/notifications/${safeNotificationId}/read`, {
    method: "POST",
    data: { anchorId },
  });
}

function createWithdrawApply({ anchorId, amountCents, clientRequestId }) {
  return request("/api/miniapp/withdraw-applies", {
    method: "POST",
    data: { anchorId, amountCents, clientRequestId },
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

function bindWechatAccount(wechatBindToken) {
  return request("/api/miniapp/auth/wechat-bind", {
    method: "POST",
    data: { wechatBindToken },
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
  bindWechatAccount,
  createAnchorRegistrationRequest,
  createPaymentInfo,
  createPaymentInfoChangeRequest,
  createPlatformBindRequest,
  createWithdrawApply,
  createYzhPresign,
  getContact,
  getDataSnapshots,
  getHome,
  getLegacyHistory,
  getNotificationDetail,
  getPaymentInfo,
  getProfile,
  getProtocols,
  getWithdrawApplyDetail,
  getWithdrawRules,
  getYzhSignStatus,
  listAnchorRegistrationRequests,
  listBalanceFlows,
  listNotifications,
  listPaymentInfoChangeRequests,
  listPlatformAccounts,
  listTaskRewards,
  listWithdrawApplies,
  loginByPassword,
  loginByWechat,
  logout,
  markNotificationRead,
  refreshYzhSignStatus,
};

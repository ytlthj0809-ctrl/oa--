const { createAuthRequiredError, createRequester, isAuthRequiredError } = require("./api-http");
const { finishPageLoading, handlePageRequestError, stopPullDownRefresh } = require("./api-page");
const { appendQuery, buildQuery, openPage, openRoute } = require("./api-router");
const { createSessionManager } = require("./api-session");

const serviceOrigin = "https://api.jiayin.site";
const sessionStorageKey = "jy-miniapp-session";
const wechatBindTokenStorageKey = "jy-miniapp-wechat-bind-token";
const dataDirtyStorageKey = "jy-miniapp-data-dirty-at";

function getRuntimeConfig() {
  try {
    const app = typeof getApp === "function" ? getApp() : null;
    return app && app.globalData ? app.globalData : {};
  } catch (error) {
    return {};
  }
}

function getServiceOrigin() {
  const config = getRuntimeConfig();
  return config.serviceOrigin || config.defaultApiBase || serviceOrigin;
}

function getSessionStorageKey() {
  return getRuntimeConfig().sessionStorageKey || sessionStorageKey;
}

const sessionManager = createSessionManager({
  dataDirtyStorageKey,
  getSessionStorageKey,
  wechatBindTokenStorageKey,
});
const {
  clearSession,
  clearWechatBindToken,
  getMiniappDataDirtyAt,
  getWechatBindToken,
  markMiniappDataDirty,
  redirectToLogin,
  setWechatBindToken,
} = sessionManager;
let protocolRedirecting = false;

function getSession() {
  const session = sessionManager.readSession();
  if (!session) return null;
  const expireAt = Date.parse(String(session.expireAt || ""));
  if (!Number.isFinite(expireAt) || expireAt <= Date.now()) {
    clearSession();
    return null;
  }
  return session;
}

function setSession(session) {
  const safeSession = {
    anchorId: session && session.anchorId ? session.anchorId : "",
    token: session && session.token ? session.token : "",
    expireAt: session && session.expireAt ? session.expireAt : "",
    loginStatus: session && session.loginStatus ? session.loginStatus : "",
    protocolStatus: session && session.protocolStatus ? session.protocolStatus : "",
    bindingStatus: session && session.bindingStatus ? session.bindingStatus : "",
  };
  if (!safeSession.anchorId || !safeSession.token || !safeSession.expireAt) {
    clearSession();
    throw createAuthRequiredError("登录信息不完整，请重新登录");
  }
  sessionManager.writeSession(safeSession);
}

function getAnchorId() {
  const session = getSession();
  return session && session.anchorId ? session.anchorId : "";
}

function requireAnchorId() {
  const anchorId = getAnchorId();
  if (!anchorId) {
    redirectToLogin();
    throw createAuthRequiredError();
  }
  return anchorId;
}

function handleUnauthorized() {
  // Keep the navigation lock while concurrent requests report the same expired
  // session, otherwise every 401 can schedule its own reLaunch.
  clearSession({ preserveAuthRedirect: true });
  redirectToLogin();
  return createAuthRequiredError("登录已过期，请重新登录");
}

function handleProtocolRequired(error) {
  const session = getSession();
  if (!session || !session.anchorId) return handleUnauthorized();
  setSession({ ...session, protocolStatus: "PENDING" });
  if (!protocolRedirecting) {
    protocolRedirecting = true;
    setTimeout(() => {
      wx.reLaunch({
        url: "/src/pages/protocols/index?mode=required",
        complete() {
          setTimeout(() => {
            protocolRedirecting = false;
          }, 800);
        },
      });
    }, 0);
  }
  error.silent = true;
  error.navigationHandled = true;
  return error;
}

const request = createRequester({
  getServiceOrigin,
  getSession,
  onProtocolRequired: handleProtocolRequired,
  onUnauthorized: handleUnauthorized,
});

function createClientRequestId(prefix = "miniapp") {
  const bytes = new Uint8Array(16);
  try {
    if (wx.getRandomValues) {
      wx.getRandomValues(bytes);
    } else {
      throw new Error("random api unavailable");
    }
  } catch (error) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }
  const randomText = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${prefix}-${Date.now().toString(36)}-${randomText}`;
}

function formatMoney(cents = 0) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

module.exports = {
  appendQuery,
  buildQuery,
  clearSession,
  clearWechatBindToken,
  createClientRequestId,
  finishPageLoading,
  formatMoney,
  getAnchorId,
  getMiniappDataDirtyAt,
  getSession,
  getWechatBindToken,
  handlePageRequestError,
  isAuthRequiredError,
  markMiniappDataDirty,
  openPage,
  openRoute,
  request,
  requireAnchorId,
  setSession,
  setWechatBindToken,
  stopPullDownRefresh,
};

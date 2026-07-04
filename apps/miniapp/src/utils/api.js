const { clearMiniappCaches } = require("./cache");

const serviceOrigin = "https://api.jiayin.site";
const sessionStorageKey = "jy-miniapp-session";
const wechatBindTokenStorageKey = "jy-miniapp-wechat-bind-token";
const dataDirtyStorageKey = "jy-miniapp-data-dirty-at";
const environmentOptions = [{ key: "production", label: "正式域名", origin: serviceOrigin }];
let authRedirecting = false;
const tabPageSet = new Set([
  "/src/pages/home/index",
  "/src/pages/data/index",
  "/src/pages/withdraw/index",
  "/src/pages/profile/index",
]);

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

function getSession() {
  return wx.getStorageSync(getSessionStorageKey()) || null;
}

function setSession(session) {
  authRedirecting = false;
  wx.setStorageSync(getSessionStorageKey(), session);
  wx.removeStorageSync(wechatBindTokenStorageKey);
}

function clearSession() {
  wx.removeStorageSync(getSessionStorageKey());
  wx.removeStorageSync(dataDirtyStorageKey);
  clearMiniappCaches();
  authRedirecting = false;
}

function getWechatBindToken() {
  return wx.getStorageSync(wechatBindTokenStorageKey) || "";
}

function setWechatBindToken(token) {
  if (!token) return;
  wx.setStorageSync(wechatBindTokenStorageKey, token);
}

function clearWechatBindToken() {
  wx.removeStorageSync(wechatBindTokenStorageKey);
}

function createAuthRequiredError(message = "请先登录") {
  const error = new Error(message);
  error.code = "AUTH_REQUIRED";
  error.silent = true;
  return error;
}

function isAuthRequiredError(error) {
  return Boolean(error && error.code === "AUTH_REQUIRED");
}

function getAnchorId() {
  const session = getSession();
  return session && session.anchorId ? session.anchorId : "";
}

function redirectToLogin() {
  if (authRedirecting) return;
  authRedirecting = true;
  setTimeout(() => {
    wx.reLaunch({
      url: "/src/pages/login/index",
      complete() {
        setTimeout(() => {
          authRedirecting = false;
        }, 800);
      },
    });
  }, 0);
}

function requireAnchorId() {
  const anchorId = getAnchorId();
  if (!anchorId) {
    redirectToLogin();
    throw createAuthRequiredError();
  }
  return anchorId;
}

function markMiniappDataDirty() {
  const dirtyAt = Date.now();
  wx.setStorageSync(dataDirtyStorageKey, dirtyAt);
  return dirtyAt;
}

function getMiniappDataDirtyAt() {
  return Number(wx.getStorageSync(dataDirtyStorageKey) || 0);
}

function buildQuery(params = {}) {
  return Object.keys(params)
    .filter((key) => params[key] !== undefined && params[key] !== null && params[key] !== "")
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .join("&");
}

function appendQuery(route, params = {}) {
  const query = buildQuery(params);
  if (!query) return route;
  return `${route}${route.includes("?") ? "&" : "?"}${query}`;
}

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

function request(route, options = {}) {
  return new Promise((resolve, reject) => {
    const session = getSession();
    const includeAuth = options.auth !== false;
    wx.request({
      url: `${getServiceOrigin()}${route}`,
      method: options.method || "GET",
      data: options.data || {},
      header: {
        "content-type": "application/json",
        ...(includeAuth && session && session.token ? { "x-miniapp-token": session.token } : {}),
      },
      success(response) {
        const payload = response.data || {};
        if (response.statusCode === 401) {
          if (options.skipAuthRedirect) {
            reject(new Error("当前暂时无法获取公开信息，请稍后再试"));
            return;
          }
          clearSession();
          redirectToLogin();
          reject(createAuthRequiredError("登录已过期，请重新登录"));
          return;
        }
        if (response.statusCode >= 400 || payload.ok === false) {
          reject(new Error((payload.error && payload.error.message) || `request failed: ${route}`));
          return;
        }
        resolve(payload.data);
      },
      fail(error) {
        const message = error && error.errMsg && error.errMsg.includes("timeout")
          ? "网络请求超时，请稍后重试"
          : "网络连接失败，请检查网络后重试";
        reject(new Error(message));
      },
    });
  });
}

function handlePageRequestError(page, error) {
  if (isAuthRequiredError(error)) {
    page.__authRedirecting = true;
    return true;
  }
  page.setData({ error: error && error.message ? error.message : "操作失败，请稍后重试" });
  return false;
}

function finishPageLoading(page, loadingKey = "loading") {
  if (!page.__authRedirecting) {
    page.setData({ [loadingKey]: false });
  }
}

function stopPullDownRefresh() {
  if (typeof wx.stopPullDownRefresh === "function") {
    wx.stopPullDownRefresh();
  }
}

function openRoute(route) {
  if (!route) return;
  const [baseRoute] = String(route).split("?");
  if (tabPageSet.has(baseRoute)) {
    wx.switchTab({ url: baseRoute });
    return;
  }
  wx.navigateTo({ url: route });
}

function openPage(page, query = {}) {
  const route = `/src/pages/${page}/index`;
  const queryText = buildQuery(query);
  openRoute(queryText ? `${route}?${queryText}` : route);
}

function formatMoney(cents = 0) {
  return `¥${(Number(cents || 0) / 100).toFixed(2)}`;
}

function withMoney(record, fields) {
  const next = { ...record };
  fields.forEach((field) => {
    next[`${field}Text`] = formatMoney(record[field]);
  });
  return next;
}

module.exports = {
  appendQuery,
  buildQuery,
  clearSession,
  clearWechatBindToken,
  createClientRequestId,
  environmentOptions,
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
  withMoney,
};

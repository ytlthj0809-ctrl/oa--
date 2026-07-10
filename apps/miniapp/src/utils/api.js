const { clearMiniappCaches } = require("./cache");
const {
  WITHDRAW_MIN_AMOUNT_CENTS,
  WITHDRAW_SUBMIT_END_MINUTE_OF_DAY,
  WITHDRAW_SUBMIT_START_MINUTE_OF_DAY,
} = require("./constants");

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
  const session = wx.getStorageSync(getSessionStorageKey()) || null;
  if (!session) return null;
  const expireAt = Date.parse(String(session.expireAt || ""));
  if (!Number.isFinite(expireAt) || expireAt <= Date.now()) {
    clearSession();
    return null;
  }
  return session;
}

function setSession(session) {
  authRedirecting = false;
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
  wx.setStorageSync(getSessionStorageKey(), safeSession);
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

function formatMinuteOfDay(minuteOfDay) {
  const hours = Math.floor(Number(minuteOfDay || 0) / 60);
  const minutes = Number(minuteOfDay || 0) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

const friendlyErrorMessages = {
  AUTH_REQUIRED: "登录已过期，请重新登录",
  BALANCE_INSUFFICIENT: "当前可提现余额不足，请确认余额后再提交",
  DUPLICATE_PAYMENT_RISK_BLOCKED: "系统检测到重复打款风险，已阻断本次操作，请联系财务核对",
  INSUFFICIENT_BALANCE: "当前可提现余额不足，请确认余额后再提交",
  MINIAPP_WITHDRAW_MIN_AMOUNT: `单笔提现最低 ${formatMoney(WITHDRAW_MIN_AMOUNT_CENTS)}`,
  MINIAPP_WITHDRAW_WINDOW_CLOSED: `当前不在提现时间内，请在每日 ${formatMinuteOfDay(WITHDRAW_SUBMIT_START_MINUTE_OF_DAY)}-${formatMinuteOfDay(WITHDRAW_SUBMIT_END_MINUTE_OF_DAY)} 提交`,
  PAYMENT_INFO_INCOMPLETE: "打款信息未生效，请先补全并等待审核通过",
  PAYMENT_INFO_NOT_FOUND: "请先填写打款信息，审核通过后再继续",
  PAYMENT_INFO_REQUIRED: "请先填写打款信息，审核通过后再继续",
  WITHDRAW_APPLY_ALREADY_BATCHED: "这笔提现已进入付款批次，请勿重复操作",
  WITHDRAW_APPLY_NOT_FOUND: "没有找到这笔提现记录，请刷新后重试",
  WITHDRAW_APPLY_STATUS_UNSUPPORTED: "当前提现状态暂不能执行这个操作，请刷新记录后确认",
  WITHDRAW_APPLY_TRANSITION_BLOCKED: "当前提现状态不允许执行这个操作，请刷新记录后确认",
  WITHDRAW_FREEZE_FAILED: "余额冻结失败，提现未提交，请稍后重试",
  WITHDRAW_REJECT_REASON_REQUIRED: "驳回必须填写原因，方便主播查看处理结果",
  WITHDRAW_REVIEW_ROLE_REQUIRED: "当前账号没有权限执行该审核动作，请联系管理员",
  YZH_SIGN_REQUIRED: "请先完成云账户签约，再提交提现",
};

function createRequestError(payload, route, responseStatusCode) {
  const sourceError = payload && payload.error ? payload.error : {};
  const code = sourceError.code || payload.code || "";
  const userMessage = sourceError.userMessage || friendlyErrorMessages[code];
  const technicalMessage = sourceError.message || payload.message;
  const message = userMessage || technicalMessage || `请求失败，请稍后重试`;
  const error = new Error(message);
  error.code = code || `HTTP_${responseStatusCode || "ERROR"}`;
  error.route = route;
  error.statusCode = responseStatusCode;
  error.technicalMessage = technicalMessage || "";
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
  const maxRetries = options.method && options.method !== "GET" ? 0 : (options.retries || 1);
  let attempt = 0;

  function doRequest() {
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
            reject(createRequestError(payload, route, response.statusCode));
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

  return doRequest().catch((err) => {
    if (attempt < maxRetries && !err.code) {
      attempt++;
      return new Promise((resolve) => setTimeout(resolve, 500 * attempt)).then(doRequest);
    }
    throw err;
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

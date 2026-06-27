const serviceOrigin = "https://api.jiayin.site";
const sessionStorageKey = "jy-miniapp-session";
const environmentOptions = [{ key: "production", label: "正式域名", origin: serviceOrigin }];
const tabPageSet = new Set([
  "/src/pages/home/index",
  "/src/pages/data/index",
  "/src/pages/withdraw/index",
  "/src/pages/profile/index",
]);

function getSession() {
  return wx.getStorageSync(sessionStorageKey) || null;
}

function setSession(session) {
  wx.setStorageSync(sessionStorageKey, session);
}

function clearSession() {
  wx.removeStorageSync(sessionStorageKey);
}

function getAnchorId() {
  const session = getSession();
  return session && session.anchorId ? session.anchorId : "";
}

function requireAnchorId() {
  const anchorId = getAnchorId();
  if (!anchorId) {
    wx.reLaunch({ url: "/src/pages/login/index" });
    throw new Error("请先登录");
  }
  return anchorId;
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

function request(route, options = {}) {
  return new Promise((resolve, reject) => {
    const session = getSession();
    wx.request({
      url: `${serviceOrigin}${route}`,
      method: options.method || "GET",
      data: options.data || {},
      header: {
        "content-type": "application/json",
        ...(session && session.token ? { "x-miniapp-token": session.token } : {}),
      },
      success(response) {
        const payload = response.data || {};
        if (response.statusCode >= 400 || payload.ok === false) {
          reject(new Error((payload.error && payload.error.message) || `request failed: ${route}`));
          return;
        }
        resolve(payload.data);
      },
      fail(error) {
        reject(error);
      },
    });
  });
}

function openRoute(route) {
  if (!route) return;
  if (tabPageSet.has(route)) {
    wx.switchTab({ url: route });
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
  environmentOptions,
  formatMoney,
  getAnchorId,
  getSession,
  openPage,
  openRoute,
  request,
  requireAnchorId,
  setSession,
  withMoney,
};

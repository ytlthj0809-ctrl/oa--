const tabPageSet = new Set([
  "/src/pages/home/index",
  "/src/pages/withdraw/index",
]);

const CORE_MINIAPP_PAGES = new Set([
  "auth",
  "login",
  "home",
  "register",
  "protocols",
  "payment-info",
  "payment-info-form",
  "payment-info-change",
  "sign",
  "sign-return",
  "balance",
  "withdraw",
  "withdraw-guide",
  "withdraw-records",
  "withdraw-detail",
]);

function isCoreMiniappPage(page) {
  return CORE_MINIAPP_PAGES.has(String(page || ""));
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
  if (!isCoreMiniappPage(page)) {
    if (typeof console !== "undefined" && typeof console.warn === "function") {
      console.warn(`[miniapp] hidden page blocked: ${String(page || "")}`);
    }
    wx.reLaunch({ url: "/src/pages/home/index" });
    return;
  }
  const route = `/src/pages/${page}/index`;
  const queryText = buildQuery(query);
  openRoute(queryText ? `${route}?${queryText}` : route);
}

module.exports = {
  CORE_MINIAPP_PAGES,
  appendQuery,
  buildQuery,
  isCoreMiniappPage,
  openPage,
  openRoute,
};

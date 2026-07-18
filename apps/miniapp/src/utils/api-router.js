const tabPageSet = new Set([
  "/src/pages/home/index",
  "/src/pages/data/index",
  "/src/pages/withdraw/index",
  "/src/pages/profile/index",
]);

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

const pageAliases = {
  "platform-bind-request": "platform-accounts",
};

function openPage(page, query = {}) {
  const resolvedPage = pageAliases[page] || page;
  const route = `/src/pages/${resolvedPage}/index`;
  const queryText = buildQuery(query);
  openRoute(queryText ? `${route}?${queryText}` : route);
}

module.exports = {
  appendQuery,
  buildQuery,
  openPage,
  openRoute,
};

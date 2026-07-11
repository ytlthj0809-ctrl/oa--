const { isAuthRequiredError } = require("./api-http");

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

module.exports = {
  finishPageLoading,
  handlePageRequestError,
  stopPullDownRefresh,
};

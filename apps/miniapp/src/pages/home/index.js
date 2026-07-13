const { finishPageLoading, getMiniappDataDirtyAt, handlePageRequestError, openPage, requireAnchorId, stopPullDownRefresh } = require("../../utils/api");
const { HOME_CACHE_TTL_MS } = require("../../utils/constants");
const { registerMiniappCacheResetter } = require("../../utils/cache");
const { buildGreeting, decorateHome } = require("../../utils/decorators");
const { getHome } = require("../../services/miniapp-api");

let homeCache = { anchorId: "", data: null, loadedAt: 0 };

function resetHomeCache() {
  homeCache = { anchorId: "", data: null, loadedAt: 0 };
}

registerMiniappCacheResetter(resetHomeCache);

Page({
  data: {
    loading: false,
    error: "",
    home: null,
  },

  onShow() {
    this.loadHome();
  },

  onPullDownRefresh() {
    this.loadHome({ force: true }).finally(stopPullDownRefresh);
  },

  async loadHome(options = {}) {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const dirtyAt = getMiniappDataDirtyAt();
      if (
        !options.force
        && homeCache.anchorId === anchorId
        && homeCache.data
        && homeCache.loadedAt >= dirtyAt
        && Date.now() - homeCache.loadedAt < HOME_CACHE_TTL_MS
      ) {
        const refreshedHome = { ...homeCache.data, greetingText: buildGreeting() };
        homeCache = { ...homeCache, data: refreshedHome };
        this.setData({ home: refreshedHome });
        return;
      }
      const home = await getHome(anchorId);
      const decorated = decorateHome(home);
      homeCache = { anchorId, data: decorated, loadedAt: Date.now() };
      this.setData({ home: decorated });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },

  goPage(event) {
    const page = event.currentTarget.dataset.page;
    if (!page) return;
    openPage(page);
  },

  goNextAction() {
    const page = this.data.home && this.data.home.nextAction ? this.data.home.nextAction.page : "";
    if (!page) return;
    openPage(page);
  },

  goGuideStep(event) {
    const { page, disabled, disabledText } = event.currentTarget.dataset;
    const isDisabled = disabled === true || disabled === "true";
    if (isDisabled) {
      wx.showToast({ title: disabledText || "请先完成前一步", icon: "none" });
      return;
    }
    if (page) openPage(page);
  },
});

const {
  MINIAPP_LIST_PAGE_SIZE,
  STATIC_DATA_CACHE_TTL_MS,
} = require("../../utils/constants");
const { finishPageLoading, getMiniappDataDirtyAt, handlePageRequestError, openPage, requireAnchorId, stopPullDownRefresh } = require("../../utils/api");
const { registerMiniappCacheResetter } = require("../../utils/cache");
const { decorateBalanceFlow, decorateDataSnapshot, decorateReward } = require("../../utils/decorators");
const { getCurrentChinaMonth } = require("../../utils/formatters");
const { getDataSnapshots, listBalanceFlows, listTaskRewards } = require("../../services/miniapp-api");
const { state, createStaticDataCache, resetStaticDataCache } = require("../../utils/static-data-cache");

registerMiniappCacheResetter(resetStaticDataCache);

Page({
  data: {
    activeSegment: "monthly",
    month: getCurrentChinaMonth(),
    currentChinaMonth: getCurrentChinaMonth(),
    platform: "ALL",
    loading: false,
    error: "",
    snapshots: [],
    flows: [],
    rewards: [],
    flowPage: 0,
    rewardPage: 0,
    flowHasMore: false,
    rewardHasMore: false,
    loadingMoreFlows: false,
    loadingMoreRewards: false,
  },

  onShow() {
    const currentChinaMonth = getCurrentChinaMonth();
    const month = this.data.month > currentChinaMonth ? currentChinaMonth : this.data.month;
    if (currentChinaMonth !== this.data.currentChinaMonth || month !== this.data.month) {
      this.setData({ currentChinaMonth, month }, () => this.loadData());
      return;
    }
    this.loadData();
  },

  changeMonth(event) {
    const month = event.detail && event.detail.value ? event.detail.value : "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      this.setData({ error: "请选择正确的月份" });
      return;
    }
    const currentChinaMonth = getCurrentChinaMonth();
    if (month > currentChinaMonth) {
      this.setData({ error: "不能查询未来月份", currentChinaMonth });
      return;
    }
    this.setData({ month, currentChinaMonth }, () => this.loadData({ force: true }));
  },

  onPullDownRefresh() {
    this.loadData({ force: true }).finally(stopPullDownRefresh);
  },

  onUnload() {
    this.__dataGeneration = Number(this.__dataGeneration || 0) + 1;
  },

  switchSegment(event) {
    const segment = event.currentTarget.dataset.segment;
    if (segment && segment !== this.data.activeSegment) {
      this.setData({ activeSegment: segment });
    }
  },

  async loadData(options = {}) {
    const generation = Number(this.__dataGeneration || 0) + 1;
    this.__dataGeneration = generation;
    this.setData({
      loading: true,
      loadingMoreFlows: false,
      loadingMoreRewards: false,
      error: "",
    });
    try {
      const anchorId = requireAnchorId();
      const month = this.data.month;
      const platform = this.data.platform;
      const dirtyAt = getMiniappDataDirtyAt();
      const canReuseStatic = !options.force
        && state.staticDataCache.anchorId === anchorId
        && state.staticDataCache.loadedAt >= dirtyAt
        && Date.now() - state.staticDataCache.loadedAt < STATIC_DATA_CACHE_TTL_MS;
      const snapshotsPromise = getDataSnapshots({
        anchorId,
        month,
        platform,
      });
      const flowsPromise = canReuseStatic
        ? Promise.resolve(state.staticDataCache.flows)
        : listBalanceFlows({ anchorId, page: 1, pageSize: MINIAPP_LIST_PAGE_SIZE });
      const rewardsPromise = canReuseStatic
        ? Promise.resolve(state.staticDataCache.rewards)
        : listTaskRewards({ anchorId, page: 1, pageSize: MINIAPP_LIST_PAGE_SIZE });
      const [snapshots, flowsRaw, rewardsRaw] = await Promise.all([snapshotsPromise, flowsPromise, rewardsPromise]);
      if (generation !== this.__dataGeneration) return;
      if (getMiniappDataDirtyAt() !== dirtyAt) {
        await this.loadData({ force: true });
        return;
      }
      if (!canReuseStatic) {
        const flows = Array.isArray(flowsRaw) ? flowsRaw : [];
        const rewards = Array.isArray(rewardsRaw) ? rewardsRaw : [];
        state.staticDataCache = createStaticDataCache({
          anchorId,
          flows,
          rewards,
          flowPage: 1,
          rewardPage: 1,
          flowHasMore: flows.length === MINIAPP_LIST_PAGE_SIZE,
          rewardHasMore: rewards.length === MINIAPP_LIST_PAGE_SIZE,
          loadedAt: Date.now(),
        });
      }
      const flows = state.staticDataCache.flows.map(decorateBalanceFlow);
      const rewards = state.staticDataCache.rewards.map(decorateReward);
      this.setData({
        snapshots: (snapshots || []).map(decorateDataSnapshot),
        flows,
        rewards,
        flowPage: state.staticDataCache.flowPage,
        rewardPage: state.staticDataCache.rewardPage,
        flowHasMore: state.staticDataCache.flowHasMore,
        rewardHasMore: state.staticDataCache.rewardHasMore,
      });
    } catch (error) {
      if (generation !== this.__dataGeneration) return;
      handlePageRequestError(this, error);
    } finally {
      if (generation === this.__dataGeneration) {
        finishPageLoading(this);
      }
    }
  },

  goPage(event) {
    const page = event.currentTarget.dataset.page;
    if (!page) return;
    const query = { ...(event.currentTarget.dataset || {}) };
    delete query.page;
    openPage(page, query);
  },

  async loadMoreFlows() {
    if (this.data.loadingMoreFlows || !this.data.flowHasMore) return;
    const dataGeneration = Number(this.__dataGeneration || 0);
    const requestGeneration = Number(this.__flowLoadMoreGeneration || 0) + 1;
    this.__flowLoadMoreGeneration = requestGeneration;
    const currentPage = this.data.flowPage;
    try {
      const anchorId = requireAnchorId();
      const dirtyAt = getMiniappDataDirtyAt();
      const cacheGeneration = state.staticDataCache.generation;
      const flowGeneration = state.staticDataCache.flowGeneration;
      const cacheLoadedAt = state.staticDataCache.loadedAt;
      const cacheReady = state.staticDataCache.anchorId === anchorId
        && state.staticDataCache.flowPage === currentPage
        && cacheLoadedAt >= dirtyAt
        && Date.now() - cacheLoadedAt < STATIC_DATA_CACHE_TTL_MS;
      if (!cacheReady) {
        await this.loadData({ force: true });
        return;
      }
      this.setData({ loadingMoreFlows: true, error: "" });
      const nextPage = currentPage + 1;
      const rawItems = await listBalanceFlows({ anchorId, page: nextPage, pageSize: MINIAPP_LIST_PAGE_SIZE });
      const latestDirtyAt = getMiniappDataDirtyAt();
      const dirtyWhileLoading = latestDirtyAt !== dirtyAt || cacheLoadedAt < latestDirtyAt;
      if (dirtyWhileLoading) {
        if (
          dataGeneration === this.__dataGeneration
          && requestGeneration === this.__flowLoadMoreGeneration
        ) {
          await this.loadData({ force: true });
        }
        return;
      }
      if (
        dataGeneration !== this.__dataGeneration
        || requestGeneration !== this.__flowLoadMoreGeneration
        || state.staticDataCache.generation !== cacheGeneration
        || state.staticDataCache.flowGeneration !== flowGeneration
        || state.staticDataCache.loadedAt !== cacheLoadedAt
        || state.staticDataCache.anchorId !== anchorId
        || state.staticDataCache.flowPage !== currentPage
      ) return;
      const items = Array.isArray(rawItems) ? rawItems : [];
      const flows = this.data.flows.concat(items.map(decorateBalanceFlow));
      const flowHasMore = items.length === MINIAPP_LIST_PAGE_SIZE;
      state.staticDataCache = {
        ...state.staticDataCache,
        flows: state.staticDataCache.flows.concat(items),
        flowPage: nextPage,
        flowHasMore,
        flowGeneration: flowGeneration + 1,
      };
      this.setData({ flows, flowPage: nextPage, flowHasMore });
    } catch (error) {
      if (
        dataGeneration !== this.__dataGeneration
        || requestGeneration !== this.__flowLoadMoreGeneration
      ) return;
      handlePageRequestError(this, error);
    } finally {
      if (
        dataGeneration === this.__dataGeneration
        && requestGeneration === this.__flowLoadMoreGeneration
      ) {
        finishPageLoading(this, "loadingMoreFlows");
      }
    }
  },

  async loadMoreRewards() {
    if (this.data.loadingMoreRewards || !this.data.rewardHasMore) return;
    const dataGeneration = Number(this.__dataGeneration || 0);
    const requestGeneration = Number(this.__rewardLoadMoreGeneration || 0) + 1;
    this.__rewardLoadMoreGeneration = requestGeneration;
    const currentPage = this.data.rewardPage;
    try {
      const anchorId = requireAnchorId();
      const dirtyAt = getMiniappDataDirtyAt();
      const cacheGeneration = state.staticDataCache.generation;
      const rewardGeneration = state.staticDataCache.rewardGeneration;
      const cacheLoadedAt = state.staticDataCache.loadedAt;
      const cacheReady = state.staticDataCache.anchorId === anchorId
        && state.staticDataCache.rewardPage === currentPage
        && cacheLoadedAt >= dirtyAt
        && Date.now() - cacheLoadedAt < STATIC_DATA_CACHE_TTL_MS;
      if (!cacheReady) {
        await this.loadData({ force: true });
        return;
      }
      this.setData({ loadingMoreRewards: true, error: "" });
      const nextPage = currentPage + 1;
      const rawItems = await listTaskRewards({ anchorId, page: nextPage, pageSize: MINIAPP_LIST_PAGE_SIZE });
      const latestDirtyAt = getMiniappDataDirtyAt();
      const dirtyWhileLoading = latestDirtyAt !== dirtyAt || cacheLoadedAt < latestDirtyAt;
      if (dirtyWhileLoading) {
        if (
          dataGeneration === this.__dataGeneration
          && requestGeneration === this.__rewardLoadMoreGeneration
        ) {
          await this.loadData({ force: true });
        }
        return;
      }
      if (
        dataGeneration !== this.__dataGeneration
        || requestGeneration !== this.__rewardLoadMoreGeneration
        || state.staticDataCache.generation !== cacheGeneration
        || state.staticDataCache.rewardGeneration !== rewardGeneration
        || state.staticDataCache.loadedAt !== cacheLoadedAt
        || state.staticDataCache.anchorId !== anchorId
        || state.staticDataCache.rewardPage !== currentPage
      ) return;
      const items = Array.isArray(rawItems) ? rawItems : [];
      const rewards = this.data.rewards.concat(items.map(decorateReward));
      const rewardHasMore = items.length === MINIAPP_LIST_PAGE_SIZE;
      state.staticDataCache = {
        ...state.staticDataCache,
        rewards: state.staticDataCache.rewards.concat(items),
        rewardPage: nextPage,
        rewardHasMore,
        rewardGeneration: rewardGeneration + 1,
      };
      this.setData({ rewards, rewardPage: nextPage, rewardHasMore });
    } catch (error) {
      if (
        dataGeneration !== this.__dataGeneration
        || requestGeneration !== this.__rewardLoadMoreGeneration
      ) return;
      handlePageRequestError(this, error);
    } finally {
      if (
        dataGeneration === this.__dataGeneration
        && requestGeneration === this.__rewardLoadMoreGeneration
      ) {
        finishPageLoading(this, "loadingMoreRewards");
      }
    }
  },
});

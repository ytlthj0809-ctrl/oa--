const {
  CHINA_TIME_OFFSET_MS,
  MINIAPP_LIST_PAGE_SIZE,
  STATIC_DATA_CACHE_TTL_MS,
} = require("../../utils/constants");
const { finishPageLoading, getMiniappDataDirtyAt, handlePageRequestError, openPage, requireAnchorId, stopPullDownRefresh } = require("../../utils/api");
const { registerMiniappCacheResetter } = require("../../utils/cache");
const { decorateBalanceFlow, decorateDataSnapshot, decorateReward } = require("../../utils/decorators");
const { getDataSnapshots, listBalanceFlows, listTaskRewards } = require("../../services/miniapp-api");

let staticDataCache = { anchorId: "", flows: null, rewards: null, loadedAt: 0 };

function resetStaticDataCache() {
  staticDataCache = { anchorId: "", flows: null, rewards: null, loadedAt: 0 };
}

registerMiniappCacheResetter(resetStaticDataCache);

function getCurrentChinaMonth() {
  return new Date(Date.now() + CHINA_TIME_OFFSET_MS).toISOString().slice(0, 7);
}

Page({
  data: {
    activeSegment: "monthly",
    month: getCurrentChinaMonth(),
    platform: "ALL",
    loading: false,
    error: "",
    snapshots: [],
    flows: [],
    rewards: [],
    visibleFlows: [],
    visibleRewards: [],
    flowVisibleCount: MINIAPP_LIST_PAGE_SIZE,
    rewardVisibleCount: MINIAPP_LIST_PAGE_SIZE,
  },

  onShow() {
    this.loadData();
  },

  changeMonth(event) {
    const month = event.detail && event.detail.value ? event.detail.value : "";
    if (!/^\d{4}-\d{2}$/.test(month)) {
      this.setData({ error: "请选择正确的月份" });
      return;
    }
    this.setData({
      month,
      flowVisibleCount: MINIAPP_LIST_PAGE_SIZE,
      rewardVisibleCount: MINIAPP_LIST_PAGE_SIZE,
    }, () => this.loadData({ force: true }));
  },

  onPullDownRefresh() {
    this.loadData({ force: true }).finally(stopPullDownRefresh);
  },

  switchSegment(event) {
    const segment = event.currentTarget.dataset.segment;
    if (segment && segment !== this.data.activeSegment) {
      this.setData({ activeSegment: segment });
    }
  },

  async loadData(options = {}) {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const dirtyAt = getMiniappDataDirtyAt();
      const canReuseStatic = !options.force
        && staticDataCache.anchorId === anchorId
        && staticDataCache.flows
        && staticDataCache.rewards
        && staticDataCache.loadedAt >= dirtyAt
        && Date.now() - staticDataCache.loadedAt < STATIC_DATA_CACHE_TTL_MS;
      const snapshotsPromise = getDataSnapshots({
        anchorId,
        month: this.data.month,
        platform: this.data.platform,
      });
      const flowsPromise = canReuseStatic
        ? Promise.resolve(staticDataCache.flows)
        : listBalanceFlows({ anchorId, pageSize: 100 });
      const rewardsPromise = canReuseStatic
        ? Promise.resolve(staticDataCache.rewards)
        : listTaskRewards({ anchorId, pageSize: 100 });
      const [snapshots, flowsRaw, rewardsRaw] = await Promise.all([snapshotsPromise, flowsPromise, rewardsPromise]);
      if (!canReuseStatic) {
        staticDataCache = { anchorId, flows: flowsRaw || [], rewards: rewardsRaw || [], loadedAt: Date.now() };
      }
      const flows = (flowsRaw || []).map(decorateBalanceFlow);
      const rewards = (rewardsRaw || []).map(decorateReward);
      this.setData({
        snapshots: (snapshots || []).map(decorateDataSnapshot),
        flows,
        rewards,
        visibleFlows: flows.slice(0, MINIAPP_LIST_PAGE_SIZE),
        visibleRewards: rewards.slice(0, MINIAPP_LIST_PAGE_SIZE),
        flowVisibleCount: MINIAPP_LIST_PAGE_SIZE,
        rewardVisibleCount: MINIAPP_LIST_PAGE_SIZE,
      });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },

  goPage(event) {
    const page = event.currentTarget.dataset.page;
    if (!page) return;
    const query = { ...(event.currentTarget.dataset || {}) };
    delete query.page;
    openPage(page, query);
  },

  loadMoreFlows() {
    const nextCount = this.data.flowVisibleCount + MINIAPP_LIST_PAGE_SIZE;
    this.setData({
      flowVisibleCount: nextCount,
      visibleFlows: this.data.flows.slice(0, nextCount),
    });
  },

  loadMoreRewards() {
    const nextCount = this.data.rewardVisibleCount + MINIAPP_LIST_PAGE_SIZE;
    this.setData({
      rewardVisibleCount: nextCount,
      visibleRewards: this.data.rewards.slice(0, nextCount),
    });
  },
});

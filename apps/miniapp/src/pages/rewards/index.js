const { finishPageLoading, handlePageRequestError, requireAnchorId, stopPullDownRefresh } = require("../../utils/api");
const { decorateReward } = require("../../utils/decorators");
const { listTaskRewards } = require("../../services/miniapp-api");

Page({
  data: {
    loading: false,
    error: "",
    rewards: [],
  },

  onLoad() {
    this.loadRewards();
  },

  onPullDownRefresh() {
    this.loadRewards().finally(stopPullDownRefresh);
  },

  async loadRewards() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const rewards = await listTaskRewards({ anchorId });
      this.setData({
        rewards: (rewards || []).map(decorateReward),
      });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },
});

const { appendQuery, formatMoney, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    loading: false,
    error: "",
    rewards: [],
  },

  onLoad() {
    this.loadRewards();
  },

  async loadRewards() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const rewards = await request(appendQuery("/api/miniapp/task-rewards", { anchorId }));
      this.setData({
        rewards: (rewards || []).map((item) => ({
          ...item,
          rewardText: formatMoney(item.rewardCents || item.rewardAmountCents),
        })),
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
});

const { appendQuery, formatMoney, openPage, request, requireAnchorId } = require("../../utils/api");

function decorateSnapshot(snapshot) {
  return {
    ...snapshot,
    incomeText: formatMoney(snapshot.incomeCents),
    durationText: `${snapshot.validDurationMinutes || 0} 分钟`,
  };
}

Page({
  data: {
    month: "2026-06",
    platform: "ALL",
    loading: false,
    error: "",
    snapshots: [],
    flows: [],
    rewards: [],
  },

  onLoad() {
    this.loadData();
  },

  updateMonth(event) {
    this.setData({ month: event.detail.value || this.data.month });
  },

  async loadData() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const query = { anchorId, month: this.data.month, platform: this.data.platform };
      const [snapshots, flows, rewards] = await Promise.all([
        request(appendQuery("/api/miniapp/data", query)),
        request(appendQuery("/api/miniapp/balance-flows", { anchorId })),
        request(appendQuery("/api/miniapp/task-rewards", { anchorId })),
      ]);
      this.setData({
        snapshots: (snapshots || []).map(decorateSnapshot),
        flows: (flows || []).map((item) => ({ ...item, amountText: formatMoney(item.amountCents) })),
        rewards: (rewards || []).map((item) => ({ ...item, rewardText: formatMoney(item.rewardCents || item.rewardAmountCents) })),
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  goPage(event) {
    const page = event.currentTarget.dataset.page;
    if (!page) return;
    openPage(page, event.currentTarget.dataset || {});
  },
});

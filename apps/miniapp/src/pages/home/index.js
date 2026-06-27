const { appendQuery, formatMoney, openPage, request, requireAnchorId } = require("../../utils/api");

function decorateHome(home) {
  return {
    ...home,
    availableBalanceText: formatMoney(home.availableBalanceCents),
    frozenBalanceText: formatMoney(home.frozenBalanceCents),
    rewardBalanceText: formatMoney(home.rewardBalanceCents),
    todayIncomeText: formatMoney(home.todayMetrics && home.todayMetrics.incomeCents),
  };
}

Page({
  data: {
    loading: false,
    error: "",
    home: null,
  },

  onShow() {
    this.loadHome();
  },

  async loadHome() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const home = await request(appendQuery("/api/miniapp/home", { anchorId }));
      this.setData({ home: decorateHome(home) });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  goPage(event) {
    const page = event.currentTarget.dataset.page;
    if (!page) return;
    openPage(page);
  },
});

const { appendQuery, formatMoney, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    direction: "",
    loading: false,
    error: "",
    flows: [],
  },

  onLoad(options = {}) {
    this.setData({ direction: options.balanceType || "" });
    this.loadFlows();
  },

  async loadFlows() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const flows = await request(appendQuery("/api/miniapp/balance-flows", { anchorId, direction: this.data.direction }));
      this.setData({
        flows: (flows || []).map((item) => ({ ...item, amountText: formatMoney(item.amountCents) })),
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
});

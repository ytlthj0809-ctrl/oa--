const { formatMoney, request } = require("../../utils/api");

function decorate(detail) {
  if (!detail) return null;
  return {
    ...detail,
    amountText: formatMoney(detail.amountCents),
    frozenAmountText: formatMoney(detail.frozenAmountCents),
    statusHistory: detail.statusHistory || [],
  };
}

Page({
  data: {
    applyId: "",
    loading: false,
    error: "",
    detail: null,
  },

  onLoad(options = {}) {
    this.setData({ applyId: options.applyId || "" });
    this.loadDetail();
  },

  async loadDetail() {
    if (!this.data.applyId) {
      this.setData({ error: "缺少提现记录编号" });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      const detail = await request(`/api/miniapp/withdraw-applies/${this.data.applyId}`);
      this.setData({ detail: decorate(detail) });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
});

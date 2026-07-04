const { appendQuery, formatMoney, openPage, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");

function decorate(detail) {
  if (!detail) return null;
  return {
    ...detail,
    amountText: formatMoney(detail.amountCents),
    frozenAmountText: formatMoney(detail.frozenAmountCents),
    displayStatusText: detail.statusText || statusLabel(detail.status),
    displayStatusTone: statusTone(detail.status),
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
      const anchorId = requireAnchorId();
      const detail = await request(appendQuery(`/api/miniapp/withdraw-applies/${this.data.applyId}`, { anchorId }));
      this.setData({ detail: decorate(detail) });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },

  goRecords() {
    openPage("withdraw-records");
  },
});

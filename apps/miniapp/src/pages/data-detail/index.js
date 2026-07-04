const { appendQuery, formatMoney, request, isAuthRequiredError, requireAnchorId } = require("../../utils/api");
const { statusLabel, statusTone } = require("../../utils/formatters");

function getCurrentChinaMonth() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 7);
}

Page({
  data: {
    month: "",
    platform: "ALL",
    loading: false,
    error: "",
    detail: null,
  },

  onLoad(options = {}) {
    this.setData({ month: options.month || getCurrentChinaMonth(), platform: options.platform || "ALL" });
    this.loadDetail();
  },

  async loadDetail() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const list = await request(appendQuery("/api/miniapp/data", {
        anchorId,
        month: this.data.month,
        platform: this.data.platform,
      }));
      const detail = (list || [])[0] || null;
      this.setData({
        detail: detail ? {
          ...detail,
          incomeText: formatMoney(detail.incomeCents),
          taskStatusText: statusLabel(detail.taskStatus),
          taskStatusTone: statusTone(detail.taskStatus),
        } : null,
      });
    } catch (error) {
      if (isAuthRequiredError(error)) { this.__authRedirecting = true; return; }
      this.setData({ error: error.message });
    } finally {
      if (!this.__authRedirecting) this.setData({ loading: false });
    }
  },
});

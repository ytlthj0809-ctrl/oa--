const { appendQuery, formatMoney, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    month: "",
    platform: "ALL",
    loading: false,
    error: "",
    detail: null,
  },

  onLoad(options = {}) {
    this.setData({ month: options.month || "2026-06", platform: options.platform || "ALL" });
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
        detail: detail ? { ...detail, incomeText: formatMoney(detail.incomeCents) } : null,
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },
});

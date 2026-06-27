const { appendQuery, formatMoney, openPage, request, requireAnchorId } = require("../../utils/api");

Page({
  data: {
    loading: false,
    error: "",
    records: [],
    legacy: null,
  },

  onShow() {
    this.loadRecords();
  },

  async loadRecords() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const [records, legacy] = await Promise.all([
        request(appendQuery("/api/miniapp/withdraw-applies", { anchorId })),
        request(appendQuery("/api/miniapp/legacy-history", { anchorId })),
      ]);
      this.setData({
        records: (records || []).map((item) => ({ ...item, amountText: formatMoney(item.amountCents) })),
        legacy,
      });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
    }
  },

  openDetail(event) {
    const applyId = event.currentTarget.dataset.applyId;
    if (!applyId) return;
    openPage("withdraw-detail", { applyId });
  },
});

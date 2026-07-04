const { finishPageLoading, handlePageRequestError, openPage, requireAnchorId, stopPullDownRefresh } = require("../../utils/api");
const { decorateWithdrawRecord } = require("../../utils/decorators");
const { getLegacyHistory, listWithdrawApplies } = require("../../services/miniapp-api");

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

  onPullDownRefresh() {
    this.loadRecords().finally(stopPullDownRefresh);
  },

  async loadRecords() {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const [records, legacy] = await Promise.all([
        listWithdrawApplies(anchorId),
        getLegacyHistory(anchorId),
      ]);
      this.setData({
        records: (records || []).map(decorateWithdrawRecord),
        legacy,
      });
    } catch (error) {
      handlePageRequestError(this, error);
    } finally {
      finishPageLoading(this);
    }
  },

  openDetail(event) {
    const applyId = event.currentTarget.dataset.applyId;
    if (!applyId) return;
    openPage("withdraw-detail", { applyId });
  },
});

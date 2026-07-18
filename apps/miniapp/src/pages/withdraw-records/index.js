const { finishPageLoading, getMiniappDataDirtyAt, handlePageRequestError, openPage, requireAnchorId, stopPullDownRefresh } = require("../../utils/api");
const { WITHDRAW_RECORDS_CACHE_TTL_MS } = require("../../utils/constants");
const { registerMiniappCacheResetter } = require("../../utils/cache");
const { decorateWithdrawRecord } = require("../../utils/decorators");
const { getLegacyHistory, listWithdrawApplies } = require("../../services/miniapp-api");

let withdrawRecordsCache = { anchorId: "", records: null, legacy: null, loadedAt: 0 };

function resetWithdrawRecordsCache() {
  withdrawRecordsCache = { anchorId: "", records: null, legacy: null, loadedAt: 0 };
}

registerMiniappCacheResetter(resetWithdrawRecordsCache);

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
    this.loadRecords({ force: true }).finally(stopPullDownRefresh);
  },

  async loadRecords(options = {}) {
    this.setData({ loading: true, error: "" });
    try {
      const anchorId = requireAnchorId();
      const dirtyAt = getMiniappDataDirtyAt();
      if (
        !options.force
        && withdrawRecordsCache.anchorId === anchorId
        && withdrawRecordsCache.records
        && withdrawRecordsCache.loadedAt >= dirtyAt
        && Date.now() - withdrawRecordsCache.loadedAt < WITHDRAW_RECORDS_CACHE_TTL_MS
      ) {
        this.setData({
          records: withdrawRecordsCache.records,
          legacy: withdrawRecordsCache.legacy,
        });
        return;
      }
      const [records, legacy] = await Promise.all([
        listWithdrawApplies(anchorId),
        getLegacyHistory(anchorId),
      ]);
      const decoratedRecords = (records || []).map(decorateWithdrawRecord);
      withdrawRecordsCache = { anchorId, records: decoratedRecords, legacy, loadedAt: Date.now() };
      this.setData({
        records: decoratedRecords,
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
